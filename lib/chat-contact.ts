import type { OutboxRow } from '@/lib/outbox-store'
import { parseHookTag, parseOutboxKey } from '@/lib/outbox'
import { retryLater, skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteEspoError } from '@/lib/espocrm-client'
import type { DispatchDeps } from '@/lib/lead-sync'
import {
  buildIntakeContext,
  DeadlineError,
  IntakeRetryError,
  rescheduleForDeadline,
  type HookClients,
  type IntakeContext,
} from '@/lib/chat-intake'
import { cleanContactName, hasNoLeadLabel, isOpenLeadStatus } from '@/lib/chat-classify'
import {
  createChatContact,
  fillEmptyContactFields,
  findContactIdByEmail,
  findContactIdsByPhone,
  findEmaillessContactIdByPhone,
  findLeadByRef,
  readContact,
  readContactConversationIds,
  readConversation,
  readLeadStatus,
  updateLead,
  type ChatContact,
} from '@/lib/chat-io'
import { LEAD_ATTR, LEAD_STATUS_VALUE, splitName } from '@/lib/lead-mapping'
import { isSiteEcho } from '@/lib/sync-origin'

/**
 * hook.chat_contact handler (Phase 83, HOOK-01 / D-12). Runs only inside the QStash-invoked dispatcher
 * (lib/lead-sync.ts -> lib/hook-dispatch.ts), behind both config gates (D-15).
 *
 * The key only says "Chatwoot contact N changed". The payload was a hint: every run re-reads the
 * contact, and every write is preceded by a lookup, so a re-run ends in the same state.
 *
 * What an operator adds in the Chatwoot sidebar (an email or a phone) reaches the CRM: the person's
 * EspoCRM Contact is found or created under the identity rules, only EMPTY Contact fields are filled
 * (README field ownership), and the person's open chat Lead is linked to the Contact. When an email
 * appears for a Telegram or phone-only person the identity is registered (or found) and the open `c:`
 * chat Lead moves to it. Names never flow this way (asymmetric ownership, D-14), and two identities
 * are never merged (an address that belongs to somebody else is skipped for the owner to decide).
 *
 * Logs carry the key, outcome and code only; never a name, email, phone or message.
 */

const MAX_CONVERSATIONS = 25

type Entry = { kind: 'sent'; detail: string } | { kind: 'skip'; code: string }

const skipped = (code: string): Entry => ({ kind: 'skip', code })

export async function deliverChatContact(
  row: OutboxRow,
  d: DispatchDeps,
  clients: HookClients,
): Promise<DispatchResult> {
  const ctx = buildIntakeContext(row, d, clients)
  let result: DispatchResult
  let detail = '-'
  try {
    const tag = parseHookTag(parseOutboxKey(row.idempotency_key)?.tag)
    if (!tag || tag.contactId === undefined) {
      result = await skip(row, d, 'bad_key')
    } else {
      const entry = await contactEntry(ctx, tag.contactId)
      if (entry.kind === 'skip') {
        detail = entry.code
        result = await skip(row, d, entry.code)
      } else {
        detail = entry.detail
        await d.store.complete(row.idempotency_key, 'sent', null)
        result = { outcome: 'sent' }
      }
    }
  } catch (err) {
    if (err instanceof DeadlineError) result = await rescheduleForDeadline(ctx)
    else if (err instanceof IntakeRetryError) result = await retryLater(row, err.code, d)
    else throw err
  }
  console.log(`[chat-contact] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? detail}`)
  return result
}

interface Person {
  identityId: string | null
  /** EspoCRM Contact the person already has (identity link or a known CRM contact), or null. */
  espoContactId: string | null
}

async function contactEntry(ctx: IntakeContext, contactId: number): Promise<Entry> {
  const { d, cw, chat, guard } = ctx

  guard()
  if (!(await chat.hooksStart())) return skipped('hooks_off')

  guard()
  const contact = await readContact(cw, contactId)
  if (!contact) return skipped('contact_missing')

  // HOOK-04 handler layer: the contact still carries the site's own fingerprint, so this event is the
  // echo of a site write that got past the receiver. Nothing to learn from it.
  if (
    isSiteEcho({
      name: contact.name,
      email: contact.email,
      phone_number: contact.phone,
      identifier: contact.identifier,
      custom_attributes: contact.attributes,
    })
  ) {
    return skipped('echo')
  }

  const email = contact.email
  guard()
  const phone = contact.phone ? await d.identity.phoneUsable(contact.phone) : null
  if (!email && !phone) return skipped('no_contact_data')

  const person = await resolvePerson(ctx, contact, email, phone)
  if ('skip' in person) return skipped(person.skip)

  const espoContactId = await ensureContact(ctx, contact, person, email, phone)
  if (person.identityId && espoContactId && espoContactId !== person.espoContactId) {
    guard()
    await d.identity.setEspoContact(person.identityId, espoContactId)
  }
  const linked = await linkLeads(ctx, contactId, person, espoContactId, email, phone)
  return { kind: 'sent', detail: `leads_${linked}` }
}

// ── Person: identity (D-12) ─────────────────────────────────────────────────

/**
 * Who is behind this Chatwoot contact, without ever merging two people:
 *  - the contact is linked to one identity: the operator's email / phone are attached to it, unless
 *    the email already belongs to ANOTHER identity (skipped `email_owned_elsewhere`, RESEARCH Open
 *    Question 7: the owner merges or splits on /admin/identities);
 *  - no link and an email: the identity owning the address (it gains this Chatwoot contact only when
 *    it has none), else a known CRM Contact (linked, no identity: same rule as the intake), else a
 *    newly registered chat identity;
 *  - no email: no identity (a phone alone never registers one).
 */
async function resolvePerson(
  ctx: IntakeContext,
  contact: ChatContact,
  email: string | null,
  phone: string | null,
): Promise<Person | { skip: string }> {
  const { d, crm, guard } = ctx

  guard()
  const links = await d.identity.byChatwootContact(contact.id)
  if (links.length > 1) return { skip: 'cw_ambiguous' }

  if (links.length === 1) {
    const own = links[0]
    if (own.erasing) return { skip: 'identity_erasing' }
    if (email) {
      guard()
      const owner = await d.identity.chatLookup(email)
      if (owner && owner.identityId !== own.identityId) return { skip: 'email_owned_elsewhere' }
    }
    guard()
    const attached = await d.identity.attachChatContact(own.identityId, email, phone)
    if (attached.email === 'owned_elsewhere') return { skip: 'email_owned_elsewhere' }
    if (attached.email === 'erasing' || attached.phone === 'erasing') return { skip: 'identity_erasing' }
    if (attached.email === 'identity_missing') return { skip: 'identity_missing' }
    return { identityId: own.identityId, espoContactId: own.espoContactId }
  }

  if (!email) return { identityId: null, espoContactId: null }

  guard()
  const owner = await d.identity.chatLookup(email)
  if (owner) {
    if (owner.erasing) return { skip: 'identity_erasing' }
    // The person's own Chatwoot contact id is never overwritten (they may have several).
    if (!owner.chatwootContactId) {
      guard()
      await d.identity.setChatwootContact(owner.identityId, contact.id)
    }
    return { identityId: owner.identityId, espoContactId: owner.espoContactId }
  }

  // No site identity: an EspoCRM Contact with this email is somebody the owner already knows.
  guard()
  const known = await findContactIdByEmail(crm, email)
  if (known) return { identityId: null, espoContactId: known }

  guard()
  const res = await d.identity.resolveChat(email, phone)
  if (res.outcome === 'erasing') return { skip: 'identity_erasing' }
  if (!res.identityId) return { identityId: null, espoContactId: null } // the address was not usable

  guard()
  const row = await d.identity.chatLookup(email)
  if (row?.erasing) return { skip: 'identity_erasing' }
  if (!row?.chatwootContactId) {
    guard()
    await d.identity.setChatwootContact(res.identityId, contact.id)
  }
  return { identityId: res.identityId, espoContactId: row?.espoContactId ?? null }
}

// ── Contact: find or create, fill only what is empty ────────────────────────

function isEspo404(err: unknown): boolean {
  return err instanceof SiteEspoError && err.status === 404
}

/**
 * The person's EspoCRM Contact: the one already known (identity link or CRM match), else the one with
 * the email, else (no email) the single one with the phone, else a new one with the Chatwoot name.
 * Only empty Contact fields are filled; name, account, title and description are never written.
 * Several Contacts with the phone mean "no Contact" (never a guess): null.
 */
async function ensureContact(
  ctx: IntakeContext,
  contact: ChatContact,
  person: Person,
  email: string | null,
  phone: string | null,
): Promise<string | null> {
  const { crm, guard } = ctx
  let contactId = person.espoContactId
  for (let round = 0; round < 2; round++) {
    if (!contactId && email) {
      guard()
      contactId = await findContactIdByEmail(crm, email)
    }
    if (!contactId && email && phone) {
      // The phone-keyed Contact of a phone-only person (D-04) gains its email instead of getting a twin.
      guard()
      contactId = await findEmaillessContactIdByPhone(crm, phone)
    }
    if (!contactId && !email && phone) {
      guard()
      const ids = await findContactIdsByPhone(crm, phone)
      if (ids.length > 1) return null
      contactId = ids[0] ?? null
    }
    if (!contactId) break
    try {
      guard()
      await fillEmptyContactFields(crm, contactId, { email, phone })
      return contactId
    } catch (err) {
      // The Contact was deleted in the CRM: forget it and look again (then create).
      if (!isEspo404(err)) throw err
      contactId = null
    }
  }
  const name = splitName(cleanContactName(contact.name, email), email)
  guard()
  return createChatContact(crm, { firstName: name.firstName, lastName: name.lastName, email, phone })
}

// ── Leads: the person's open chat Lead joins the Contact (D-12) ─────────────

/**
 * Links the person's open chat Leads to the Contact: cExistingContactId when the Lead has none (the
 * owner's own choice stays), the email only while the Lead has none. With an identity the registry
 * moves the `c:` lead to `i:<identity>` first. The leads are found through the identity and the
 * phone (registry) and through the contact's own conversations (the `c:<contact>` lead of a person
 * without identity). Returns how many Leads were written.
 */
async function linkLeads(
  ctx: IntakeContext,
  contactId: number,
  person: Person,
  espoContactId: string | null,
  email: string | null,
  phone: string | null,
): Promise<number> {
  const { cw, crm, chat, guard } = ctx
  if (person.identityId) {
    guard()
    await chat.linkIdentity(contactId, person.identityId)
  }
  if (!espoContactId) return 0

  const open = new Map<string, string | null>()
  guard()
  for (const l of await chat.openLeadsForPerson(person.identityId, phone ? [phone] : [])) {
    open.set(l.chatLeadId, l.espoLeadId)
  }
  guard()
  for (const conversationId of await readContactConversationIds(cw, contactId, MAX_CONVERSATIONS)) {
    guard()
    const rec = await chat.conversation(conversationId)
    if (rec?.chatLead?.open) open.set(rec.chatLead.id, rec.chatLead.espoLeadId)
  }

  let linked = 0
  for (const [chatLeadId, espoLeadId] of open) {
    if (!espoLeadId) continue
    guard()
    const brief = await readLeadStatus(crm, espoLeadId)
    if (!brief || !isOpenLeadStatus(brief.status)) continue
    // An owner's choice of Contact on the Lead stays.
    if (brief.existingContactId && brief.existingContactId !== espoContactId) continue

    const fields: Record<string, unknown> = {}
    if (!brief.existingContactId) fields[LEAD_ATTR.existingContactId] = espoContactId
    if (email && !brief.emailAddress) fields.emailAddress = email
    if (Object.keys(fields).length > 0) {
      guard()
      await writeLead(crm, espoLeadId, fields)
      linked++
    }
    guard()
    await chat.setLeadEspo(chatLeadId, null, espoContactId)
  }
  return linked
}

/** PUT /Lead; a refused email (400) is retried once without it so the Contact link still lands. */
async function writeLead(crm: IntakeContext['crm'], leadId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    await updateLead(crm, leadId, fields)
  } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 400 || fields.emailAddress === undefined) throw err
    const { emailAddress: _refused, ...rest } = fields
    if (Object.keys(rest).length === 0) return
    await updateLead(crm, leadId, rest)
  }
}

// ── hook.chat_label: the `no-lead` label kills the chat Lead (D-07) ─────────

/**
 * hook.chat_label handler (Phase 83, D-07). The operator adds the Chatwoot label `no-lead` to a
 * conversation that already produced a chat Lead (spam, a salesman, a wrong number): the Lead goes to
 * Dead in EspoCRM and the registry row is closed (`dead`), which frees the person's slot.
 *
 * Only a Lead the chat path created is ever touched: a D-20 adopted Phase 81 inquiry / booking Lead has
 * no registry chat Lead, so the handler skips it (`no_chat_lead`); a customer conversation never had a
 * Lead; a Lead that the owner already converted, recycled, killed or deleted is not written (the
 * registry row is closed as `closed_in_crm` so it stops holding the person's slot).
 *
 * State-convergent: the key only says "labels of conversation N changed"; the label is read again, so
 * a label removed in the meantime (`no_label`) changes nothing, and a re-run finds the row closed.
 */
export async function deliverChatLabel(
  row: OutboxRow,
  d: DispatchDeps,
  clients: HookClients,
): Promise<DispatchResult> {
  const ctx = buildIntakeContext(row, d, clients)
  let result: DispatchResult
  let detail = '-'
  try {
    const tag = parseHookTag(parseOutboxKey(row.idempotency_key)?.tag)
    if (!tag || tag.conversationId === undefined) {
      result = await skip(row, d, 'bad_key')
    } else {
      const entry = await labelEntry(ctx, tag.conversationId)
      if (entry.kind === 'skip') {
        detail = entry.code
        result = await skip(row, d, entry.code)
      } else {
        detail = entry.detail
        await d.store.complete(row.idempotency_key, 'sent', null)
        result = { outcome: 'sent' }
      }
    }
  } catch (err) {
    if (err instanceof DeadlineError) result = await rescheduleForDeadline(ctx)
    else if (err instanceof IntakeRetryError) result = await retryLater(row, err.code, d)
    else throw err
  }
  console.log(`[chat-label] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? detail}`)
  return result
}

async function labelEntry(ctx: IntakeContext, conversationId: number): Promise<Entry> {
  const { cw, crm, chat, guard } = ctx

  guard()
  if (!(await chat.hooksStart())) return skipped('hooks_off')

  guard()
  const conversation = await readConversation(cw, conversationId)
  if (!conversation) return skipped('conversation_missing')
  if (!hasNoLeadLabel(conversation.labels)) return skipped('no_label')

  guard()
  const record = await chat.conversation(conversationId)
  const lead = record?.chatLead ?? null
  if (!lead) return skipped('no_chat_lead')
  if (!lead.open) return skipped('lead_not_open')

  // A Lead whose id was never recorded may still be on its way: look it up by its ref; if it is not
  // visible yet the row is retried, never closed (the intake may be creating it right now).
  let espoLeadId = lead.espoLeadId
  if (!espoLeadId) {
    guard()
    const found = await findLeadByRef(crm, lead.leadRef)
    if (!found) throw new IntakeRetryError('lead_pending')
    espoLeadId = found.id
    guard()
    await chat.setLeadEspo(lead.id, found.id, null)
  }

  guard()
  const brief = await readLeadStatus(crm, espoLeadId)
  if (!brief || !isOpenLeadStatus(brief.status)) {
    guard()
    await chat.closeLead(lead.id, 'closed_in_crm')
    return skipped('lead_not_open')
  }

  guard()
  await updateLead(crm, espoLeadId, { status: LEAD_STATUS_VALUE.dead })
  guard()
  await chat.closeLead(lead.id, 'dead')
  return { kind: 'sent', detail: 'dead' }
}
