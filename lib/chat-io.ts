import { SiteChatwootError, type SiteChatwootClient } from '@/lib/chatwoot-client'
import { SiteEspoError, type SiteEspoClient, type SiteEspoConfig } from '@/lib/espocrm-client'
import { LEAD_ATTR } from '@/lib/lead-mapping'
import { isOpenLeadStatus } from '@/lib/chat-classify'

/**
 * Chatwoot reads and EspoCRM chat helpers for the hook.chat_* handlers (Phase 83, HOOK-01 / HOOK-02).
 *
 * Imports only the site clients' types and error classes; no env access. Every function here is a
 * thin, single-purpose request (or a short, bounded sequence) so the handler can put its deadline
 * guard in front of each client call. Reachable only from the QStash-invoked dispatcher
 * (lib/lead-sync.ts -> lib/hook-dispatch.ts -> lib/chat-intake.ts).
 *
 * Nothing here logs. Names, emails, phones and message text only ever travel inside request bodies
 * and query strings; the clients strip the query from their error text.
 */

const q = encodeURIComponent

const MESSAGES_PAGE_GUARD = 20

// ── Chatwoot reads ──────────────────────────────────────────────────────────

export interface ChatContact {
  id: number
  name: string
  email: string | null
  phone: string | null
  identifier: string | null
  attributes: Record<string, unknown>
  companyName: string | null
}

export interface ChatConversation {
  id: number
  inboxId: number | null
  /** Chatwoot channel class, e.g. `Channel::WebWidget`. */
  channel: string | null
  status: string
  labels: string[]
  createdAtSec: number
  contact: ChatContact | null
}

export interface ChatMessage {
  id: number
  content: string | null
  messageType: 'incoming' | 'outgoing' | 'activity' | 'template' | 'other'
  private: boolean
  autoReply: boolean
  senderEmail: string | null
  createdAtSec: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function posInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** Chatwoot sends unix seconds (int or float); tolerate an ISO string too. */
function toSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000)
  }
  return 0
}

function normEmail(value: unknown): string | null {
  const email = str(value)?.toLowerCase() ?? null
  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

export function parseChatContact(raw: unknown): ChatContact | null {
  if (!isRecord(raw)) return null
  const id = posInt(raw.id)
  if (id === null) return null
  const attributes = isRecord(raw.custom_attributes) ? raw.custom_attributes : {}
  const additional = isRecord(raw.additional_attributes) ? raw.additional_attributes : {}
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    email: normEmail(raw.email),
    phone: str(raw.phone_number),
    identifier: str(raw.identifier),
    attributes,
    companyName: str(additional.company_name),
  }
}

function is404(err: unknown): boolean {
  return err instanceof SiteChatwootError && err.status === 404
}

/** GET /conversations/<id>. 404 -> null. The channel and the contact come from `meta`. */
export async function readConversation(cw: SiteChatwootClient, id: number): Promise<ChatConversation | null> {
  let res: unknown
  try {
    res = await cw.get(`/conversations/${id}`)
  } catch (err) {
    if (is404(err)) return null
    throw err
  }
  if (!isRecord(res)) return null
  const convId = posInt(res.id)
  if (convId === null) return null
  const meta = isRecord(res.meta) ? res.meta : {}
  const labels = Array.isArray(res.labels)
    ? res.labels.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map((l) => l.trim())
    : []
  return {
    id: convId,
    inboxId: posInt(res.inbox_id),
    channel: str(meta.channel) ?? str(res.channel),
    status: typeof res.status === 'string' ? res.status : '',
    labels,
    createdAtSec: toSeconds(res.created_at),
    contact: parseChatContact(meta.sender),
  }
}

/** GET /contacts/<id> (show answers `{ payload: contact }`). 404 -> null. */
export async function readContact(cw: SiteChatwootClient, id: number): Promise<ChatContact | null> {
  let res: unknown
  try {
    res = await cw.get(`/contacts/${id}`)
  } catch (err) {
    if (is404(err)) return null
    throw err
  }
  if (!isRecord(res)) return null
  return parseChatContact(isRecord(res.payload) ? res.payload : res)
}

function messageTypeOf(value: unknown): ChatMessage['messageType'] {
  if (value === 0 || value === 'incoming') return 'incoming'
  if (value === 1 || value === 'outgoing') return 'outgoing'
  if (value === 2 || value === 'activity') return 'activity'
  if (value === 3 || value === 'template') return 'template'
  return 'other'
}

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw)) return null
  const id = posInt(raw.id)
  if (id === null) return null
  const attrs = isRecord(raw.content_attributes) ? raw.content_attributes : {}
  const mail = isRecord(attrs.email) ? attrs.email : {}
  const sender = isRecord(raw.sender) ? raw.sender : {}
  const from = Array.isArray(mail.from) ? mail.from.find((x) => typeof x === 'string') : undefined
  return {
    id,
    content: typeof raw.content === 'string' ? raw.content : null,
    messageType: messageTypeOf(raw.message_type),
    private: raw.private === true,
    autoReply: mail.auto_reply === true,
    senderEmail: normEmail(sender.email) ?? normEmail(from),
    createdAtSec: toSeconds(raw.created_at),
  }
}

export interface MessagePages {
  messages: ChatMessage[]
  /** True when the page cap ended the loop while messages were still arriving (more may exist). */
  truncated: boolean
}

/**
 * GET /conversations/<id>/messages?after=<last id>, ascending, at most `maxPages` requests.
 * A page that brings no new message ends the loop; running out of pages with a non-empty last
 * page is reported as `truncated` so a caller can say "N+" instead of a wrong exact count.
 */
export async function readMessagePages(
  cw: SiteChatwootClient,
  conversationId: number,
  opts: { maxPages: number },
): Promise<MessagePages> {
  const out: ChatMessage[] = []
  const pages = Math.max(1, Math.min(opts.maxPages, MESSAGES_PAGE_GUARD))
  let after = 0
  for (let page = 0; page < pages; page++) {
    const res = await cw.get(`/conversations/${conversationId}/messages?after=${after}`)
    const payload = isRecord(res) && Array.isArray(res.payload) ? res.payload : []
    const parsed = payload.map(parseMessage).filter((m): m is ChatMessage => m !== null && m.id > after)
    if (parsed.length === 0) return { messages: out, truncated: false }
    out.push(...parsed)
    after = Math.max(...parsed.map((m) => m.id))
  }
  return { messages: out, truncated: true }
}

/** Same as readMessagePages, messages only. */
export async function readMessages(
  cw: SiteChatwootClient,
  conversationId: number,
  opts: { maxPages: number },
): Promise<ChatMessage[]> {
  return (await readMessagePages(cw, conversationId, opts)).messages
}

/**
 * GET /contacts/<id>/conversations: ids of the contact's conversations, newest page only, at most
 * `max`. 404 -> empty (the contact is gone). The shape (`{ payload: [{ id, ... }] }`) is the
 * documented one; anything else reads as "no conversations" and the caller falls back to the
 * registry lookups that need no Chatwoot read.
 */
export async function readContactConversationIds(
  cw: SiteChatwootClient,
  contactId: number,
  max: number,
): Promise<number[]> {
  let res: unknown
  try {
    res = await cw.get(`/contacts/${contactId}/conversations`)
  } catch (err) {
    if (is404(err)) return []
    throw err
  }
  const list = isRecord(res) && Array.isArray(res.payload) ? res.payload : []
  const ids: number[] = []
  for (const item of list) {
    const id = isRecord(item) ? posInt(item.id) : null
    if (id !== null && !ids.includes(id)) ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

/** GET /inboxes/<id> name. The name is cosmetic: every error but an auth failure yields null. */
export async function readInboxName(cw: SiteChatwootClient, inboxId: number): Promise<string | null> {
  try {
    const res = await cw.get(`/inboxes/${inboxId}`)
    return isRecord(res) ? str(res.name) : null
  } catch (err) {
    if (err instanceof SiteChatwootError && err.status !== 401 && err.status !== 403) return null
    throw err
  }
}

/** First message that the person wrote: incoming and not a private note. */
export function firstIncoming(messages: ChatMessage[]): ChatMessage | null {
  return messages.find((m) => m.messageType === 'incoming' && !m.private) ?? null
}

// ── EspoCRM helpers ─────────────────────────────────────────────────────────

const SKIP_DUPLICATE_CHECK = { 'X-Skip-Duplicate-Check': 'true' }

function espoStr(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function listOf(res: unknown): Array<Record<string, unknown>> {
  if (!isRecord(res) || !Array.isArray(res.list)) return []
  return res.list.filter(isRecord)
}

function is404Espo(err: unknown): boolean {
  return err instanceof SiteEspoError && err.status === 404
}

/** Id of the Contact carrying this (normalised) email, or null. */
export async function findContactIdByEmail(crm: SiteEspoClient, email: string): Promise<string | null> {
  const res = await crm.get(
    `/Contact?select=id&maxSize=1&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${q(email)}`,
  )
  return espoStr(listOf(res)[0]?.id)
}

/** Ids of up to two Contacts carrying this E.164 phone; two means "ambiguous" to the caller. */
export async function findContactIdsByPhone(crm: SiteEspoClient, phone: string): Promise<string[]> {
  const res = await crm.get(
    `/Contact?select=id&maxSize=2&where[0][type]=equals&where[0][attribute]=phoneNumber&where[0][value]=${q(phone)}`,
  )
  return listOf(res)
    .map((r) => espoStr(r.id))
    .filter((id): id is string => id !== null)
}

/**
 * POST /Contact for a chat person. The caller already decided this is a new person, so EspoCRM's
 * own duplicate check (email OR first + last name) is skipped. 409 -> somebody created it in the
 * meantime: converge on it (by email, else by phone). 400 with a phone -> once more without it.
 */
export async function createChatContact(
  crm: SiteEspoClient,
  input: { firstName: string | null; lastName: string; email: string | null; phone: string | null },
): Promise<string> {
  const body: Record<string, unknown> = { lastName: input.lastName }
  if (input.firstName) body.firstName = input.firstName
  if (input.email) {
    body.emailAddress = input.email
    body.emailAddressData = [{ emailAddress: input.email, primary: true, optOut: false, invalid: false }]
  }
  if (input.phone) body.phoneNumber = input.phone

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await crm.post('/Contact', body, SKIP_DUPLICATE_CHECK)
      const id = isRecord(res) ? espoStr(res.id) : null
      if (!id) throw new SiteEspoError('POST', '/Contact', 0)
      return id
    } catch (err) {
      if (!(err instanceof SiteEspoError)) throw err
      if (err.status === 409) {
        const raced = input.email
          ? await findContactIdByEmail(crm, input.email)
          : input.phone
            ? ((await findContactIdsByPhone(crm, input.phone))[0] ?? null)
            : null
        if (raced) return raced
        throw err
      }
      if (err.status === 400 && attempt === 0 && body.phoneNumber !== undefined) {
        delete body.phoneNumber
        continue
      }
      throw err
    }
  }
  throw new SiteEspoError('POST', '/Contact', 400)
}

interface ContactEmailEntry {
  emailAddress: string
  primary: boolean
  optOut: boolean
  invalid: boolean
}

/**
 * Adds only what an existing Contact lacks: a missing email joins emailAddressData (the primary is
 * kept), a phone is written only while the Contact has none. Name, account, title and description
 * are never touched (the owner's data wins). A 404 on the read is thrown so the caller can treat a
 * stale cached id. Returns true when it wrote.
 */
export async function fillEmptyContactFields(
  crm: SiteEspoClient,
  contactId: string,
  input: { email: string | null; phone: string | null },
): Promise<boolean> {
  if (!input.email && !input.phone) return false
  const live = await crm.get(`/Contact/${q(contactId)}?select=id,emailAddress,emailAddressData,phoneNumber`)
  if (!isRecord(live)) return false

  const entries: ContactEmailEntry[] = []
  const seen = new Set<string>()
  if (Array.isArray(live.emailAddressData)) {
    for (const item of live.emailAddressData) {
      if (!isRecord(item)) continue
      const address = typeof item.emailAddress === 'string' ? item.emailAddress.trim() : ''
      if (address === '' || seen.has(address.toLowerCase())) continue
      seen.add(address.toLowerCase())
      entries.push({ emailAddress: address, primary: item.primary === true, optOut: item.optOut === true, invalid: item.invalid === true })
    }
  }
  const primaryAddress = espoStr(live.emailAddress)
  if (entries.length === 0 && primaryAddress) {
    seen.add(primaryAddress.toLowerCase())
    entries.push({ emailAddress: primaryAddress, primary: true, optOut: false, invalid: false })
  }

  const change: Record<string, unknown> = {}
  if (input.email && !seen.has(input.email.toLowerCase())) {
    const hasPrimary = entries.some((e) => e.primary)
    change.emailAddressData = [
      ...entries,
      { emailAddress: input.email, primary: !hasPrimary, optOut: false, invalid: false },
    ]
  }
  if (input.phone && !espoStr(live.phoneNumber)) change.phoneNumber = input.phone
  if (Object.keys(change).length === 0) return false

  try {
    await crm.put(`/Contact/${q(contactId)}`, change)
  } catch (err) {
    // A refused phone must not block the Lead; anything else follows the shared classification.
    if (!(err instanceof SiteEspoError) || err.status !== 400 || change.phoneNumber === undefined) throw err
    delete change.phoneNumber
    if (Object.keys(change).length === 0) return false
    await crm.put(`/Contact/${q(contactId)}`, change)
  }
  return true
}

export interface LeadBrief {
  id: string
  status: string | null
  /** cExistingContactId as stored on the Lead. */
  existingContactId: string | null
  createdAt: string | null
  /** Primary email of the Lead (D-12 fills it only while empty). */
  emailAddress: string | null
}

const LEAD_SELECT = ['id', 'status', LEAD_ATTR.existingContactId, 'createdAt', 'emailAddress'].join(',')

function toLeadBrief(rec: Record<string, unknown> | undefined): LeadBrief | null {
  if (!rec) return null
  const id = espoStr(rec.id)
  if (!id) return null
  return {
    id,
    status: espoStr(rec.status),
    existingContactId: espoStr(rec[LEAD_ATTR.existingContactId]),
    createdAt: espoStr(rec.createdAt),
    emailAddress: espoStr(rec.emailAddress),
  }
}

/** The Lead carrying this cSupabaseRef, or null. */
export async function findLeadByRef(crm: SiteEspoClient, ref: string): Promise<LeadBrief | null> {
  const res = await crm.get(
    `/Lead?select=${LEAD_SELECT}&maxSize=1&where[0][type]=equals&where[0][attribute]=${LEAD_ATTR.supabaseRef}&where[0][value]=${q(ref)}`,
  )
  return toLeadBrief(listOf(res)[0])
}

/** Current status of a Lead by id. 404 (deleted in the CRM) -> null. */
export async function readLeadStatus(crm: SiteEspoClient, id: string): Promise<LeadBrief | null> {
  try {
    const res = await crm.get(`/Lead/${q(id)}?select=${LEAD_SELECT}`)
    return isRecord(res) ? toLeadBrief(res) : null
  } catch (err) {
    if (is404Espo(err)) return null
    throw err
  }
}

/** EspoCRM stores createdAt as `YYYY-MM-DD HH:mm:ss` UTC; tolerate a full ISO string as well. */
function parseEspoInstant(value: string | null): number | null {
  if (!value) return null
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * D-20: the newest OPEN Lead with this email that was created at or after `since` and is not itself a
 * chat Lead (cSupabaseRef not starting with `chat:`). Looks at up to 10 Leads of the address.
 */
export async function findRecentOpenLeadByEmail(
  crm: SiteEspoClient,
  email: string,
  since: Date,
): Promise<string | null> {
  const select = ['id', 'status', 'createdAt', LEAD_ATTR.supabaseRef].join(',')
  const res = await crm.get(
    `/Lead?select=${select}&maxSize=10&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${q(email)}`,
  )
  let best: { id: string; at: number } | null = null
  for (const rec of listOf(res)) {
    const id = espoStr(rec.id)
    const at = parseEspoInstant(espoStr(rec.createdAt))
    if (!id || at === null || at < since.getTime()) continue
    if (!isOpenLeadStatus(rec.status)) continue
    const ref = espoStr(rec[LEAD_ATTR.supabaseRef])
    if (ref !== null && ref.startsWith('chat:')) continue
    if (best === null || at > best.at) best = { id, at }
  }
  return best?.id ?? null
}

/**
 * POST /Lead for a chat person (assignee from config, owner rule 81 D-13). A 400 relaxes the body
 * step by step before giving up: without the phone, then with the email moved into the description.
 * A 409 means another delivery created it: converge on the Lead with the same cSupabaseRef.
 */
export async function createChatLead(
  crm: SiteEspoClient,
  config: SiteEspoConfig,
  body: Record<string, unknown>,
): Promise<string> {
  const full: Record<string, unknown> = { ...body }
  if (config.leadAssigneeId) full.assignedUserId = config.leadAssigneeId

  const attempts: Array<Record<string, unknown>> = [full]
  const { phoneNumber: _phone, ...withoutPhone } = full
  if (full.phoneNumber !== undefined) attempts.push(withoutPhone)
  if (typeof full.emailAddress === 'string' && full.emailAddress !== '') {
    const { emailAddress, ...withoutEmail } = withoutPhone
    const description = [typeof full.description === 'string' ? full.description : '', `Email: ${emailAddress}`]
      .filter((line) => line !== '')
      .join('\n')
    attempts.push({ ...withoutEmail, description })
  }

  for (let i = 0; i < attempts.length; i++) {
    try {
      const res = await crm.post('/Lead', attempts[i], SKIP_DUPLICATE_CHECK)
      const id = isRecord(res) ? espoStr(res.id) : null
      if (!id) throw new SiteEspoError('POST', '/Lead', 0)
      return id
    } catch (err) {
      if (!(err instanceof SiteEspoError)) throw err
      if (err.status === 409) {
        const ref = espoStr(body[LEAD_ATTR.supabaseRef])
        const raced = ref ? await findLeadByRef(crm, ref) : null
        if (raced) return raced.id
        throw err
      }
      if (err.status === 400 && i < attempts.length - 1) continue
      throw err
    }
  }
  throw new SiteEspoError('POST', '/Lead', 400)
}

/** PUT /Lead/<id> with the given fields only. */
export async function updateLead(crm: SiteEspoClient, id: string, fields: Record<string, unknown>): Promise<void> {
  await crm.put(`/Lead/${q(id)}`, fields)
}

/** POST /Note (a stream post on a Contact or a Lead). camelCase fields (RESEARCH A5). */
export async function postNote(
  crm: SiteEspoClient,
  parentType: 'Contact' | 'Lead',
  parentId: string,
  text: string,
): Promise<void> {
  await crm.post('/Note', { type: 'Post', parentType, parentId, post: text })
}

export interface StreamNote {
  id: string | null
  type: string | null
  post: string | null
}

/** GET /<parentType>/<id>/stream. No stream access (403) or a missing parent (404) -> empty list. */
export async function listStreamNotes(
  crm: SiteEspoClient,
  parentType: 'Contact' | 'Lead',
  parentId: string,
  maxSize: number,
): Promise<StreamNote[]> {
  try {
    const res = await crm.get(`/${parentType}/${q(parentId)}/stream?maxSize=${Math.max(1, Math.trunc(maxSize))}`)
    return listOf(res).map((n) => ({ id: espoStr(n.id), type: espoStr(n.type), post: espoStr(n.post) }))
  } catch (err) {
    if (err instanceof SiteEspoError && (err.status === 403 || err.status === 404)) return []
    throw err
  }
}

const MARKER_WINDOW = 50

/** True when one of the newest stream posts carries the idempotency marker (the note is not posted twice). */
export async function streamHasMarker(
  crm: SiteEspoClient,
  parentType: 'Contact' | 'Lead',
  parentId: string,
  marker: string,
): Promise<boolean> {
  const notes = await listStreamNotes(crm, parentType, parentId, MARKER_WINDOW)
  return notes.some((n) => typeof n.post === 'string' && n.post.includes(marker))
}
