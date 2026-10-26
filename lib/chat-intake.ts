import type { OutboxRow } from '@/lib/outbox-store'
import { parseHookTag, parseOutboxKey } from '@/lib/outbox'
import { retryLater, skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import type { SiteChatwootClient, SiteChatwootConfig } from '@/lib/chatwoot-client'
import { SiteEspoError, type SiteEspoClient, type SiteEspoConfig } from '@/lib/espocrm-client'
import type { DispatchDeps } from '@/lib/lead-sync'
import type { ChatIdentity } from '@/lib/identity-store'
import {
  chatLeadRef,
  createChatStore,
  personKeyFor,
  type ChatConversationRecord,
  type ChatStore,
  type ConversationOutcome,
  type ReserveResult,
} from '@/lib/chat-store'
import {
  cleanContactName,
  conversationUrl,
  formatAppendNote,
  formatLeadDescription,
  hasNoLeadLabel,
  isOpenLeadStatus,
  leadSourceForChannel,
  nonTargetReason,
  openMarker,
} from '@/lib/chat-classify'
import {
  createChatContact,
  createChatLead,
  fillEmptyContactFields,
  findContactIdByEmail,
  findContactIdsByPhone,
  findLeadByRef,
  findRecentOpenLeadByEmail,
  firstIncoming,
  postNote,
  readContact,
  readConversation,
  readInboxName,
  readLeadStatus,
  readMessages,
  streamHasMarker,
  updateLead,
  type ChatContact,
  type ChatConversation,
  type ChatMessage,
  type LeadBrief,
} from '@/lib/chat-io'
import { LEAD_ATTR, LEAD_STATUS_VALUE, splitName } from '@/lib/lead-mapping'
import { aggregateUuid } from '@/lib/sync-origin'

/**
 * hook.chat_intake handler (Phase 83, HOOK-01). Runs only inside the QStash-invoked dispatcher
 * (lib/lead-sync.ts -> lib/hook-dispatch.ts), behind both the Chatwoot and the EspoCRM config gate (D-15).
 *
 * State-convergent: the key only says "conversation N had an incoming message". The Chatwoot webhook
 * payload was a hint; every run re-reads the conversation, the contact and the messages, and every
 * write is preceded by a lookup (Lead by cSupabaseRef, Contact by email / phone, Note by its stream
 * marker), so a row re-run after a crash at any step ends with one Lead, one Contact, one Note.
 *
 * Outcome per conversation (one chat_conversations row):
 *   lead_created   the person had no open chat Lead: identity + Contact (when an email or a usable
 *                  phone is known) + one Lead, source from the channel, owner as assignee
 *   lead_appended  the person's chat Lead is still open in EspoCRM (New, Assigned, In Process):
 *                  one Note on it, no new Lead (D-02); when the owner closed or deleted it, the
 *                  registry row is closed and a new Lead is created
 *   lead_adopted   D-20: an open NON-chat Lead with the same email, created in the last 7 days, gets
 *                  the Note instead (a deliberate deviation from D-02's wording: the person's
 *                  contact form inquiry and the chat are one lead, not two)
 *   customer / known_contact / filtered / no_lead_label   nothing is created (D-06, D-18, D-07)
 *
 * Never: an Account, a Lead conversion, a booking, a customer profile, an auth user; never a Chatwoot
 * message or contact write; never an overwrite of a Contact's name, account, title or description.
 * Logs carry the key, outcome and code only; never a name, email, phone or message.
 */

const DEADLINE_MS = 45_000
const DEADLINE_RESCHEDULE_SECONDS = 5
/** D-20: a non-chat Lead younger than this absorbs the chat. */
const ADOPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RESERVE_ROUNDS = 3

/** Thrown when an invocation nears the 60 s platform limit; turned into a `deadline` reschedule. */
export class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

/** The owning conversation's Lead is not visible in EspoCRM yet: retry the row a little later. */
export class IntakeRetryError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.name = 'IntakeRetryError'
    this.code = code
  }
}

export interface HookClients {
  cw: SiteChatwootClient
  cwConfig: SiteChatwootConfig
  crm: SiteEspoClient
  config: SiteEspoConfig
}

export interface IntakeContext {
  row: OutboxRow
  d: DispatchDeps
  cw: SiteChatwootClient
  cwConfig: SiteChatwootConfig
  crm: SiteEspoClient
  config: SiteEspoConfig
  chat: ChatStore
  /** Throws DeadlineError when the invocation is close to the platform limit; call before every request. */
  guard: () => void
}

export type IntakeResult = ChatConversationRecord | { skipped: string }

function guardedChatwoot(client: SiteChatwootClient, guard: () => void): SiteChatwootClient {
  return {
    get: (path) => (guard(), client.get(path)),
    post: (path, body) => (guard(), client.post(path, body)),
    put: (path, body) => (guard(), client.put(path, body)),
    del: (path) => (guard(), client.del(path)),
  }
}

function guardedEspo(client: SiteEspoClient, guard: () => void): SiteEspoClient {
  return {
    get: (path) => (guard(), client.get(path)),
    post: (path, body, headers) => (guard(), client.post(path, body, headers)),
    put: (path, body) => (guard(), client.put(path, body)),
    del: (path) => (guard(), client.del(path)),
  }
}

/** Builds the handler context: deadline guard wired into both clients, chat store defaulted. */
export function buildIntakeContext(row: OutboxRow, d: DispatchDeps, clients: HookClients): IntakeContext {
  const startMs = d.now().getTime()
  const guard = () => {
    if (d.now().getTime() - startMs >= DEADLINE_MS) throw new DeadlineError()
  }
  return {
    row,
    d,
    cw: guardedChatwoot(clients.cw, guard),
    cwConfig: clients.cwConfig,
    crm: guardedEspo(clients.crm, guard),
    config: clients.config,
    chat: d.chat ?? createChatStore(),
    guard,
  }
}

export async function rescheduleForDeadline({ d, row }: Pick<IntakeContext, 'd' | 'row'>): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + DEADLINE_RESCHEDULE_SECONDS * 1000), 'deadline')
  await d.publish(key, { delaySeconds: DEADLINE_RESCHEDULE_SECONDS, dedupSuffix: `dl${row.attempts}` })
  return { outcome: 'rescheduled', code: 'deadline' }
}

export async function deliverChatIntake(
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
      const res = await ensureIntake(ctx, tag.conversationId)
      if ('skipped' in res) {
        detail = res.skipped
        result = await skip(row, d, res.skipped)
      } else {
        detail = res.outcome
        await d.store.complete(row.idempotency_key, 'sent', null)
        result = { outcome: 'sent' }
      }
    }
  } catch (err) {
    if (err instanceof DeadlineError) result = await rescheduleForDeadline(ctx)
    else if (err instanceof IntakeRetryError) result = await retryLater(row, err.code, d)
    else throw err
  }
  console.log(`[chat-intake] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? detail}`)
  return result
}

// ── ensureIntake ────────────────────────────────────────────────────────────

const LEAD_OUTCOMES: ReadonlySet<ConversationOutcome> = new Set<ConversationOutcome>([
  'lead_created',
  'lead_appended',
  'lead_adopted',
])

function filteredCode(reason: 'auto_reply' | 'no_reply_sender' | 'own_domain'): string {
  return reason === 'no_reply_sender' ? 'filtered_no_reply' : `filtered_${reason}`
}

function isEspo404(err: unknown): boolean {
  return err instanceof SiteEspoError && err.status === 404
}

interface Subject {
  conversationId: number
  conversation: ChatConversation
  contact: ChatContact
  message: ChatMessage
  /** Normalised email of the person, or null. */
  email: string | null
  /** Usable (normalised, not shared) E.164 phone, or null. */
  phone: string | null
  /** The identity already linked to this Chatwoot contact (non-customer), if any. */
  linked: ChatIdentity | null
}

interface Person {
  identityId: string | null
  espoContactId: string | null
}

/**
 * The shared intake path (also used by the resolve handler so a quick resolve never assumes a Lead
 * exists, Pitfall 12). Returns the registry record for the three Lead outcomes and `{ skipped }`
 * for everything that creates nothing. Throws IntakeRetryError / DeadlineError / client errors; the
 * caller decides what to do with them.
 */
export async function ensureIntake(ctx: IntakeContext, conversationId: number): Promise<IntakeResult> {
  const { d, cw, chat, guard } = ctx

  // Forward-only (81 D-21 precedent): no start instant means the hooks are off.
  guard()
  const start = await chat.hooksStart()
  if (!start) return { skipped: 'hooks_off' }

  // Idempotent replay: a conversation with a final registry outcome is done.
  guard()
  const known = await chat.conversation(conversationId)
  if (known) {
    if (LEAD_OUTCOMES.has(known.outcome) && (known.espoLeadId ?? known.chatLead?.espoLeadId)) return known
    if (!LEAD_OUTCOMES.has(known.outcome)) return { skipped: known.outcome }
  }

  const conversation = await readConversation(cw, conversationId)
  if (!conversation) return { skipped: 'conversation_missing' }
  if (conversation.createdAtSec * 1000 < start.getTime()) return { skipped: 'before_start' }

  // D-03: nothing without an incoming message; the Lead comes from the first one.
  const messages = await readMessages(cw, conversationId, { maxPages: 1 })
  const message = firstIncoming(messages)
  if (!message) return { skipped: 'no_incoming_message' }

  // The payload was a hint: the contact is read again (the conversation's meta sender is the fallback).
  const contact = conversation.contact ? ((await readContact(cw, conversation.contact.id)) ?? conversation.contact) : null
  if (!contact) return { skipped: 'contact_missing' }

  const base = { conversationId, chatwootContactId: contact.id }

  // D-07 / D-18: label and filter before any write.
  if (hasNoLeadLabel(conversation.labels)) {
    await record(ctx, { ...base, outcome: 'no_lead_label' })
    return { skipped: 'no_lead_label' }
  }
  const reason = nonTargetReason({ senderEmail: message.senderEmail ?? contact.email, autoReply: message.autoReply })
  if (reason) {
    await record(ctx, { ...base, outcome: 'filtered' })
    return { skipped: filteredCode(reason) }
  }

  const email = contact.email
  guard()
  const phone = contact.phone ? await d.identity.phoneUsable(contact.phone) : null

  // D-06: a customer is found by the Chatwoot contact id as well as by email.
  guard()
  const byContact = await d.identity.byChatwootContact(contact.id)
  if (byContact.some((i) => i.erasing)) return { skipped: 'identity_erasing' }
  if (byContact.length > 1 || byContact.some((i) => i.customer)) {
    // Two identities behind one contact is ambiguous: treated as a customer, no Lead (no guessing).
    const one = byContact.length === 1 ? byContact[0] : null
    await record(ctx, { ...base, identityId: one?.identityId ?? null, espoContactId: one?.espoContactId ?? null, outcome: 'customer' })
    return { skipped: 'customer' }
  }

  const subject: Subject = {
    conversationId,
    conversation,
    contact,
    message,
    email,
    phone,
    linked: byContact[0] ?? null,
  }

  const person = await resolvePerson(ctx, subject)
  if ('skipped' in person) return person

  // D-20: a recent open non-chat Lead of the same address takes the chat as a Note.
  if (email) {
    guard()
    const since = new Date(d.now().getTime() - ADOPT_WINDOW_MS)
    const adoptedId = await findRecentOpenLeadByEmail(ctx.crm, email, since)
    if (adoptedId) {
      await appendNote(ctx, subject, adoptedId)
      await record(ctx, {
        ...base,
        identityId: person.identityId,
        espoLeadId: adoptedId,
        espoContactId: person.espoContactId,
        outcome: 'lead_adopted',
      })
      return finalRecord(ctx, conversationId)
    }
  }

  return leadFor(ctx, subject, person)
}

async function finalRecord(ctx: IntakeContext, conversationId: number): Promise<IntakeResult> {
  ctx.guard()
  const rec = await ctx.chat.conversation(conversationId)
  if (!rec) throw new IntakeRetryError('registry_missing')
  return rec
}

async function record(
  ctx: IntakeContext,
  input: {
    conversationId: number
    chatwootContactId: number | null
    identityId?: string | null
    chatLeadId?: string | null
    espoLeadId?: string | null
    espoContactId?: string | null
    outcome: ConversationOutcome
  },
): Promise<void> {
  ctx.guard()
  await ctx.chat.recordConversation({
    conversationId: input.conversationId,
    chatwootContactId: input.chatwootContactId,
    identityId: input.identityId ?? null,
    chatLeadId: input.chatLeadId ?? null,
    espoLeadId: input.espoLeadId ?? null,
    espoContactId: input.espoContactId ?? null,
    outcome: input.outcome,
  })
}

// ── Person: identity and Contact (D-01, D-04, D-06) ─────────────────────────

async function resolvePerson(ctx: IntakeContext, s: Subject): Promise<Person | { skipped: string }> {
  const { d, crm, guard } = ctx
  const base = { conversationId: s.conversationId, chatwootContactId: s.contact.id }
  const nameParts = (email: string | null) => splitName(cleanContactName(s.contact.name, email), email)

  if (s.email) {
    guard()
    const found = await d.identity.chatLookup(s.email)
    if (found?.erasing) return { skipped: 'identity_erasing' }
    if (found?.customer) {
      await record(ctx, { ...base, identityId: found.identityId, espoContactId: found.espoContactId, outcome: 'customer' })
      return { skipped: 'customer' }
    }
    if (!found) {
      // No site identity: an EspoCRM Contact with this email is somebody the owner already knows.
      guard()
      const known = await findContactIdByEmail(crm, s.email)
      if (known) {
        await record(ctx, { ...base, espoContactId: known, outcome: 'known_contact' })
        return { skipped: 'known_contact' }
      }
    }

    guard()
    const res = await d.identity.resolveChat(s.email, s.phone)
    if (res.outcome === 'erasing') return { skipped: 'identity_erasing' }
    if (res.customer) {
      // The phone merged this email into a customer's identity: still nobody to create.
      await record(ctx, { ...base, identityId: res.identityId, outcome: 'customer' })
      return { skipped: 'customer' }
    }

    if (res.identityId) {
      const identityId = res.identityId
      guard()
      const row = found ?? (await d.identity.chatLookup(s.email))
      const name = nameParts(s.email)

      let contactId = row?.espoContactId ?? null
      for (let round = 0; round < 2; round++) {
        if (!contactId) {
          guard()
          contactId = await findContactIdByEmail(crm, s.email)
        }
        if (!contactId) break
        try {
          await fillEmptyContactFields(crm, contactId, { email: s.email, phone: s.phone })
          break
        } catch (err) {
          if (!isEspo404(err)) throw err
          // The Contact was deleted in the CRM: forget the stale id and look again.
          if (row?.espoContactId === contactId) {
            guard()
            await d.identity.setEspoContact(identityId, null)
          }
          contactId = null
        }
      }
      if (!contactId) {
        contactId = await createChatContact(crm, {
          firstName: name.firstName,
          lastName: name.lastName,
          email: s.email,
          phone: s.phone,
        })
      }
      if (row?.espoContactId !== contactId) {
        guard()
        await d.identity.setEspoContact(identityId, contactId)
      }
      if (!row?.chatwootContactId && (!s.linked || s.linked.identityId === identityId)) {
        guard()
        await d.identity.setChatwootContact(identityId, s.contact.id)
      }
      return { identityId, espoContactId: contactId }
    }
    // identity_resolve_chat could not use the address: continue as a person without an email.
  }

  // The Chatwoot contact is already linked to a (non-customer) identity.
  if (s.linked) return { identityId: s.linked.identityId, espoContactId: s.linked.espoContactId }

  // D-04: no identity. A usable phone links one existing Contact or creates one keyed on the phone;
  // a shared phone (phone is null) or several Contacts with that phone mean no Contact at all.
  if (s.phone) {
    guard()
    const ids = await findContactIdsByPhone(crm, s.phone)
    if (ids.length === 1) return { identityId: null, espoContactId: ids[0] }
    if (ids.length === 0) {
      const name = nameParts(null)
      const contactId = await createChatContact(crm, {
        firstName: name.firstName,
        lastName: name.lastName,
        email: null,
        phone: s.phone,
      })
      return { identityId: null, espoContactId: contactId }
    }
  }
  return { identityId: null, espoContactId: null }
}

// ── Lead: one open chat Lead per person (D-02) ──────────────────────────────

async function leadFor(ctx: IntakeContext, s: Subject, person: Person): Promise<IntakeResult> {
  const { chat, crm, guard } = ctx
  const leadRef = chatLeadRef(aggregateUuid('conversation', s.conversationId))
  const reserve = async (): Promise<ReserveResult> => {
    guard()
    return chat.reserveLead({
      personKey: personKeyFor({ identityId: person.identityId, chatwootContactId: s.contact.id }),
      identityId: person.identityId,
      chatwootContactId: s.contact.id,
      phone: s.email ? null : s.phone,
      leadRef,
    })
  }

  let res = await reserve()
  for (let round = 0; !res.own && round < MAX_RESERVE_ROUNDS; round++) {
    // Another conversation of this person holds the open row: is its Lead still open in the CRM?
    const brief = await existingLead(ctx, res, person)
    if (brief && isOpenLeadStatus(brief.status)) {
      await appendNote(ctx, s, brief.id)
      if (person.espoContactId && !brief.existingContactId) {
        guard()
        await updateLead(crm, brief.id, { [LEAD_ATTR.existingContactId]: person.espoContactId })
        guard()
        await chat.setLeadEspo(res.chatLeadId, brief.id, person.espoContactId)
      }
      await record(ctx, {
        conversationId: s.conversationId,
        chatwootContactId: s.contact.id,
        identityId: person.identityId,
        chatLeadId: res.chatLeadId,
        espoLeadId: brief.id,
        espoContactId: person.espoContactId ?? res.espoContactId,
        outcome: 'lead_appended',
      })
      return finalRecord(ctx, s.conversationId)
    }
    // Closed (Converted, Recycled, Dead) or deleted by the owner: make room for a new Lead.
    guard()
    await chat.closeLead(res.chatLeadId, 'closed_in_crm')
    res = await reserve()
  }
  if (!res.own) throw new IntakeRetryError('lead_busy')

  let espoLeadId = res.espoLeadId
  if (!espoLeadId) {
    guard()
    const existing = await findLeadByRef(crm, res.leadRef)
    espoLeadId = existing?.id ?? (await createLead(ctx, s, person, res.leadRef))
    guard()
    await chat.setLeadEspo(res.chatLeadId, espoLeadId, person.espoContactId)
  }
  await record(ctx, {
    conversationId: s.conversationId,
    chatwootContactId: s.contact.id,
    identityId: person.identityId,
    chatLeadId: res.chatLeadId,
    espoLeadId,
    espoContactId: person.espoContactId ?? res.espoContactId,
    outcome: 'lead_created',
  })
  return finalRecord(ctx, s.conversationId)
}

/**
 * The Lead behind the person's open registry row, or null when it is gone from the CRM. A row whose
 * Lead was never linked belongs to a conversation that is still creating it: look it up by its ref,
 * and when it is not visible yet, retry this row later rather than closing somebody's Lead.
 */
async function existingLead(ctx: IntakeContext, res: ReserveResult, person: Person): Promise<LeadBrief | null> {
  const { crm, chat, guard } = ctx
  if (res.espoLeadId) return readLeadStatus(crm, res.espoLeadId)
  const found = await findLeadByRef(crm, res.leadRef)
  if (!found) throw new IntakeRetryError('lead_pending')
  guard()
  await chat.setLeadEspo(res.chatLeadId, found.id, person.espoContactId)
  return found
}

async function createLead(ctx: IntakeContext, s: Subject, person: Person, ref: string): Promise<string> {
  const inbox = s.conversation.inboxId ? await readInboxName(ctx.cw, s.conversation.inboxId) : null
  const name = splitName(cleanContactName(s.contact.name, s.email), s.email)
  const body: Record<string, unknown> = {
    [LEAD_ATTR.supabaseRef]: ref,
    status: LEAD_STATUS_VALUE.new,
    source: leadSourceForChannel(s.conversation.channel),
    lastName: name.lastName,
    description: formatLeadDescription({
      channel: s.conversation.channel,
      inboxName: inbox,
      firstMessage: s.message.content,
      url: conversationUrl(ctx.cwConfig.baseUrl, ctx.cwConfig.accountId, s.conversationId),
    }),
  }
  if (name.firstName) body.firstName = name.firstName
  // The email only goes on the Lead once the person is registered (an unusable address stays off it).
  if (s.email && person.identityId) body.emailAddress = s.email
  if (s.phone) body.phoneNumber = s.phone
  if (person.espoContactId) body[LEAD_ATTR.existingContactId] = person.espoContactId
  return createChatLead(ctx.crm, ctx.config, body)
}

/** One append Note per conversation: the stream marker is checked first so a retried row posts once. */
async function appendNote(ctx: IntakeContext, s: Subject, leadId: string): Promise<void> {
  const marker = openMarker(s.conversationId)
  if (await streamHasMarker(ctx.crm, 'Lead', leadId, marker)) return
  const inbox = s.conversation.inboxId ? await readInboxName(ctx.cw, s.conversation.inboxId) : null
  await postNote(
    ctx.crm,
    'Lead',
    leadId,
    formatAppendNote({
      channel: s.conversation.channel,
      inboxName: inbox,
      conversationId: s.conversationId,
      firstMessage: s.message.content,
      url: conversationUrl(ctx.cwConfig.baseUrl, ctx.cwConfig.accountId, s.conversationId),
      marker,
    }),
  )
}
