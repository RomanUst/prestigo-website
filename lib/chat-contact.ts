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
import { cleanContactName, isOpenLeadStatus } from '@/lib/chat-classify'
import {
  createChatContact,
  fillEmptyContactFields,
  findContactIdByEmail,
  readContact,
  readContactConversationIds,
  readLeadStatus,
  updateLead,
  type ChatContact,
} from '@/lib/chat-io'
import { LEAD_ATTR, splitName } from '@/lib/lead-mapping'

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

  const email = contact.email
  guard()
  const phone = contact.phone ? await d.identity.phoneUsable(contact.phone) : null
  if (!email && !phone) return skipped('no_contact_data')

  const person = await resolvePerson(ctx, contact, email, phone)
  if ('skip' in person) return skipped(person.skip)

  const espoContactId = await ensureContact(ctx, contact, person, email, phone)
  if (person.identityId && espoContactId) {
    guard()
    await d.identity.setEspoContact(person.identityId, espoContactId)
  }
  const linked = await linkLeads(ctx, contactId, person, espoContactId, email, phone)
  return { kind: 'sent', detail: `leads_${linked}` }
}

// ── Person: identity (D-12) ─────────────────────────────────────────────────

async function resolvePerson(
  ctx: IntakeContext,
  contact: ChatContact,
  email: string | null,
  phone: string | null,
): Promise<Person | { skip: string }> {
  const { d, guard } = ctx
  if (!email) return { identityId: null, espoContactId: null }

  guard()
  const res = await d.identity.resolveChat(email, phone)
  if (res.outcome === 'erasing') return { skip: 'identity_erasing' }
  if (!res.identityId) return { identityId: null, espoContactId: null }

  guard()
  const row = await d.identity.chatLookup(email)
  if (row?.erasing) return { skip: 'identity_erasing' }
  if (row && !row.chatwootContactId) {
    guard()
    await d.identity.setChatwootContact(row.identityId, contact.id)
  }
  return { identityId: res.identityId, espoContactId: row?.espoContactId ?? null }
}

// ── Contact: find or create, fill only what is empty ────────────────────────

function isEspo404(err: unknown): boolean {
  return err instanceof SiteEspoError && err.status === 404
}

async function ensureContact(
  ctx: IntakeContext,
  contact: ChatContact,
  person: Person,
  email: string | null,
  phone: string | null,
): Promise<string | null> {
  const { d, crm, guard } = ctx
  let contactId = person.espoContactId
  for (let round = 0; round < 2; round++) {
    if (!contactId && email) {
      guard()
      contactId = await findContactIdByEmail(crm, email)
    }
    if (!contactId) break
    try {
      guard()
      await fillEmptyContactFields(crm, contactId, { email, phone })
      return contactId
    } catch (err) {
      if (!isEspo404(err)) throw err
      // The Contact was deleted in the CRM: forget the stale link and look again.
      if (person.identityId && person.espoContactId === contactId) {
        guard()
        await d.identity.setEspoContact(person.identityId, null)
      }
      contactId = null
    }
  }
  const name = splitName(cleanContactName(contact.name, email), email)
  guard()
  return createChatContact(crm, { firstName: name.firstName, lastName: name.lastName, email, phone })
}

// ── Leads: the person's open chat Lead joins the Contact (D-12) ─────────────

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
    if (!espoLeadId || !espoContactId) continue
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
