import { parseOutboxKey } from '@/lib/outbox'
import type { OutboxRow } from '@/lib/outbox-store'
import { breaker, skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteChatwootError, type SiteChatwootClient } from '@/lib/chatwoot-client'
import { SiteEspoError, type SiteEspoClient } from '@/lib/espocrm-client'
import { LEAD_ATTR, leadRefForBooking, leadRefForInquiry } from '@/lib/lead-mapping'
import { createChatStore, type ChatStore, type ErasureScopeInput } from '@/lib/chat-store'
import { listStreamNotes } from '@/lib/chat-io'
import {
  supabaseErasureStore,
  type ErasureRequest,
  type ErasureStepName,
  type ErasureStepResult,
  type ErasureSteps,
  type ErasureStore,
} from '@/lib/erasure-store'
import type { DispatchDeps } from '@/lib/lead-sync'

/**
 * erase.person handler (Phase 82, plan 82-12, GDPR-01 / D-07..D-10). Runs only inside the
 * QStash-invoked dispatcher. It erases ONE person, and only because an admin created and confirmed an
 * erasure_requests row: the saga re-reads that row and a key alone (forged, replayed, or an old
 * sync event) can never erase, anonymise or delete anyone.
 *
 *   freeze (set by erasure_confirm) -> Chatwoot -> EspoCRM -> verify -> Supabase -> auth user -> audit
 *
 * Supabase is anonymised LAST (and only after the verify pass succeeded) because its identity,
 * booking and email rows are the index that finds the CRM and chat records: a retry after a timeout,
 * a VPS outage or a crash can therefore always find them. Each finished step is recorded on the
 * request (counts only), so a retry resumes after the last finished step. EspoCRM deletes are soft
 * (RESEARCH Pitfall 6), so Contacts and Leads are overwritten with blank personal fields BEFORE they
 * are deleted. The person's CBookings are anonymised in place and kept (no personal data, accounting
 * history stays). Nothing outside Chatwoot, EspoCRM and Supabase is touched; the rest (mail archive,
 * backups, Stripe, Resend) is the runbook's manual checklist (plan 82-15).
 *
 * Phase 83 (D-16): chat strangers are erased like any identity. The chat registry (identity, the
 * identity's Chatwoot contact id and the person's phones) points at the person's chat Leads and
 * chat-created Contacts, which join the EspoCRM step; the history Notes parented on every Contact and
 * Lead that is deleted are blanked and deleted first (EspoCRM may keep Notes after their parent is
 * gone); the registry rows are deleted right before the Supabase anonymisation. A Note the Sync user
 * may not edit (owner-written, 403) is counted as notes_skipped and left for the runbook's manual
 * checklist; it never blocks the erasure.
 *
 * Logs carry the key (ids only), the step, an outcome and a code; never a name, email, phone, id of a
 * record or response body.
 */

const q = encodeURIComponent
const DEADLINE_MS = 45_000
const DEADLINE_RESCHEDULE_SECONDS = 5
const LOOKUP_CHUNK = 50
const LIST_SIZE = 200
const NOT_CONFIRMED = 'erasure_not_confirmed'
const UNVERIFIED = 'erasure_unverified'

/** Thrown when an invocation nears the 60 s platform limit; turned into a `deadline` reschedule. */
class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

type Ctx = {
  d: DispatchDeps
  row: OutboxRow
  store: ErasureStore
  req: ErasureRequest
  /** Administrator Chatwoot client (every call first checks the invocation deadline). */
  cw: SiteChatwootClient | null
  crm: SiteEspoClient | null
  guard: () => void
  /** Phase 83 chat registry (undefined deps.chat = the Supabase RPC store). */
  chat: ChatStore
  /** Registry scope of this run, computed once (memoised promise). */
  scopePromise?: Promise<Array<{ leadRef: string; espoLeadId: string | null; espoContactId: string | null }>>
}

export async function deliverErasure(
  row: OutboxRow,
  d: DispatchDeps,
  deps: { erasure?: ErasureStore } = {},
): Promise<DispatchResult> {
  const startMs = d.now().getTime()
  const guard = () => {
    if (d.now().getTime() - startMs >= DEADLINE_MS) throw new DeadlineError()
  }
  const store = deps.erasure ?? supabaseErasureStore

  let result: DispatchResult
  try {
    result = await run(row, d, store, guard)
  } catch (err) {
    if (!(err instanceof DeadlineError)) throw err
    result = await rescheduleForDeadline(row, d)
  }
  logLine(row.idempotency_key, 'finish', result.outcome, result.code)
  return result
}

function logLine(key: string, step: string, outcome: string, code?: string): void {
  console.log(`[erasure] key=${key} step=${step} outcome=${outcome} code=${code ?? '-'}`)
}

async function rescheduleForDeadline(row: OutboxRow, d: DispatchDeps): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + DEADLINE_RESCHEDULE_SECONDS * 1000), 'deadline')
  await d.publish(key, { delaySeconds: DEADLINE_RESCHEDULE_SECONDS, dedupSuffix: `dl${row.attempts}` })
  return { outcome: 'rescheduled', code: 'deadline' }
}

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

async function run(
  row: OutboxRow,
  d: DispatchDeps,
  store: ErasureStore,
  guard: () => void,
): Promise<DispatchResult> {
  const key = row.idempotency_key
  const requestId = parseOutboxKey(key)?.aggregateId
  if (!requestId) return skip(row, d, NOT_CONFIRMED)

  // T-82-34: the request row, not the key, authorises the erasure.
  const req = await store.loadErasure(requestId)
  if (!req || (req.status !== 'confirmed' && req.status !== 'running')) return skip(row, d, NOT_CONFIRMED)

  const steps: ErasureSteps = { ...req.steps }
  const verifyDone = steps.verify?.verified === true

  // A resumed run needs only the systems whose step is still open (the verify pass needs both).
  if ((!steps.chatwoot || !verifyDone) && !d.chatwootAdmin) return breaker(row, 'chatwoot_unconfigured', d)
  if ((!steps.espocrm || !verifyDone) && !d.crm) return breaker(row, 'crm_unconfigured', d)

  const ctx: Ctx = {
    d,
    row,
    store,
    req,
    cw: d.chatwootAdmin ? guardedChatwoot(d.chatwootAdmin, guard) : null,
    crm: d.crm ? guardedEspo(d.crm, guard) : null,
    guard,
    chat: d.chat ?? createChatStore(),
  }

  const finish = async (step: ErasureStepName, result: ErasureStepResult, recorded: boolean) => {
    if (!recorded) await store.recordErasureStep(req.id, step, result)
    steps[step] = result
    logLine(key, step, 'done')
  }

  if (!steps.chatwoot) await finish('chatwoot', await chatwootStep(ctx), false)
  if (!steps.espocrm) await finish('espocrm', await espoStep(ctx), false)

  if (!verifyDone) {
    const verify = await verifyStep(ctx)
    await store.recordErasureStep(req.id, 'verify', verify)
    steps.verify = verify
    if (verify.verified !== true) return failUnverified(ctx, steps)
    logLine(key, 'verify', 'done')
  }

  // Supabase last: everything the CRM steps needed to find the person is still here until this call.
  if (!steps.supabase) {
    guard()
    // D-16: the chat registry rows go first; the identity row that cascades some of them is deleted by
    // the anonymisation, the phone-only and Chatwoot-contact rows are not. Idempotent on a retry.
    const chatRows = await ctx.chat.erase(chatScopeInput(ctx))
    guard()
    const counts = await store.anonymisePerson(req.id)
    // The RPC records its own step in the same transaction; this is only the local copy.
    await finish('supabase', { ...counts, chat_rows_deleted: chatRows }, true)
  }

  if (!steps.auth) {
    guard()
    const userId = req.userId ?? req.identity?.userId ?? null
    const outcome = userId ? await store.deleteAuthUser(userId) : null
    await finish('auth', { account_deleted: outcome === 'deleted' ? 1 : 0 }, false)
  }

  await store.completeErasure(req.id, true, countsFrom(steps), 'completed')
  await d.store.complete(key, 'sent', null)
  return { outcome: 'sent' }
}

/** Flat numeric counts of every finished step (names are distinct across steps by design). */
function countsFrom(steps: ErasureSteps): Record<string, number> {
  const out: Record<string, number> = {}
  for (const result of Object.values(steps)) {
    for (const [name, value] of Object.entries(result ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) out[name] = value
    }
  }
  return out
}

/** A record survived the second pass: the request fails, Supabase is untouched, the row is loud. */
async function failUnverified(ctx: Ctx, steps: ErasureSteps): Promise<DispatchResult> {
  const { d, row, store, req } = ctx
  await store.completeErasure(req.id, false, countsFrom(steps), 'failed')
  await d.store.complete(row.idempotency_key, 'failed', UNVERIFIED)
  console.error(`[erasure] ALERT erasure_unverified key=${row.idempotency_key}`)
  return { outcome: 'failed', code: UNVERIFIED }
}

// ── Chatwoot ────────────────────────────────────────────────────────────────

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function contactId(raw: unknown): number | null {
  const rec = recordOf(raw)
  const id = rec?.id
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
}

async function chatwootFilter(cw: SiteChatwootClient, attributeKey: string, value: string): Promise<number[]> {
  const res = (await cw.post('/contacts/filter', {
    payload: [{ attribute_key: attributeKey, filter_operator: 'equal_to', values: [value], query_operator: null }],
  })) as { payload?: unknown } | null
  const list = Array.isArray(res?.payload) ? res.payload : []
  return list.map(contactId).filter((id): id is number => id !== null)
}

/**
 * Every Chatwoot contact that belongs to the person: the cached id, identifier = user id, each email
 * and each non-shared phone (exact filters). A shared number never identifies a person, so it is not
 * in the request's phones and can never pull somebody else's contact in.
 */
async function findChatwootContacts(ctx: Ctx): Promise<Set<number>> {
  const cw = ctx.cw as SiteChatwootClient
  const { req } = ctx
  const found = new Set<number>()

  const cached = req.identity?.chatwootContactId ?? null
  if (cached !== null) {
    try {
      const res = recordOf(await cw.get(`/contacts/${cached}`))
      const id = contactId(res?.payload ?? res)
      if (id !== null) found.add(id)
    } catch (err) {
      if (!(err instanceof SiteChatwootError) || err.status !== 404) throw err
    }
  }
  const userId = req.userId ?? req.identity?.userId ?? null
  if (userId) for (const id of await chatwootFilter(cw, 'identifier', userId)) found.add(id)
  for (const email of req.emails) for (const id of await chatwootFilter(cw, 'email', email)) found.add(id)
  for (const phone of req.phones) for (const id of await chatwootFilter(cw, 'phone_number', phone)) found.add(id)
  return found
}

/** D-09: deleting a contact deletes its conversations. 404 = done; 422 (online) bubbles up and retries. */
async function deleteChatwootContacts(ctx: Ctx, ids: Iterable<number>): Promise<number> {
  const cw = ctx.cw as SiteChatwootClient
  let deleted = 0
  for (const id of ids) {
    try {
      await cw.del(`/contacts/${id}`)
      deleted++
    } catch (err) {
      if (!(err instanceof SiteChatwootError) || err.status !== 404) throw err
    }
  }
  return deleted
}

async function chatwootStep(ctx: Ctx): Promise<ErasureStepResult> {
  const found = await findChatwootContacts(ctx)
  return { chatwoot_contacts_deleted: await deleteChatwootContacts(ctx, found) }
}

// ── EspoCRM ─────────────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function idsOf(res: unknown): string[] {
  const list = recordOf(res)?.list
  return (Array.isArray(list) ? list : []).map((r) => str(recordOf(r)?.id)).filter((id): id is string => id !== null)
}

async function espoIdsByEquals(crm: SiteEspoClient, entity: string, attribute: string, value: string): Promise<string[]> {
  return idsOf(
    await crm.get(
      `/${entity}?select=id&maxSize=${LIST_SIZE}&where[0][type]=equals&where[0][attribute]=${attribute}&where[0][value]=${q(value)}`,
    ),
  )
}

/** One call per chunk (the `in` operator); a 400 falls back to one equals lookup per value. */
async function espoIdsByAny(crm: SiteEspoClient, entity: string, attribute: string, values: string[]): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < values.length; i += LOOKUP_CHUNK) {
    const chunk = values.slice(i, i + LOOKUP_CHUNK)
    const params = chunk.map((v, n) => `where[0][value][${n}]=${q(v)}`).join('&')
    try {
      ids.push(
        ...idsOf(
          await crm.get(`/${entity}?select=id&maxSize=${LIST_SIZE}&where[0][type]=in&where[0][attribute]=${attribute}&${params}`),
        ),
      )
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
      for (const v of chunk) ids.push(...(await espoIdsByEquals(crm, entity, attribute, v)))
    }
  }
  return ids
}

/** What the chat registry knows about the person: identity, cached Chatwoot contact id, phones. */
function chatScopeInput(ctx: Ctx): ErasureScopeInput {
  const chatwootContactId = ctx.req.identity?.chatwootContactId ?? null
  return {
    identityId: ctx.req.identity?.id ?? null,
    chatwootContactIds: chatwootContactId === null ? [] : [chatwootContactId],
    phones: ctx.req.phones,
  }
}

/** The registry scope of this run (D-16); one RPC per run, shared by every find. */
function chatScope(ctx: Ctx): NonNullable<Ctx['scopePromise']> {
  ctx.scopePromise ??= ctx.chat.erasureScope(chatScopeInput(ctx))
  return ctx.scopePromise
}

/** The record's id when it still exists (a soft-deleted or missing one answers 404). */
async function existingId(crm: SiteEspoClient, entity: 'Contact' | 'Lead', id: string): Promise<string | null> {
  try {
    return str(recordOf(await crm.get(`/${entity}/${q(id)}?select=id`))?.id)
  } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 404) throw err
    return null
  }
}

/** Contacts: the cached id, every request email and the chat-created Contacts of the registry scope. */
async function findEspoContacts(ctx: Ctx): Promise<string[]> {
  const crm = ctx.crm as SiteEspoClient
  const found = new Set<string>()
  const cached = ctx.req.identity?.espoContactId ?? null
  if (cached) {
    try {
      const id = str(recordOf(await crm.get(`/Contact/${q(cached)}?select=id`))?.id)
      if (id) found.add(id)
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 404) throw err
    }
  }
  for (const email of ctx.req.emails) {
    for (const id of await espoIdsByEquals(crm, 'Contact', 'emailAddress', email)) found.add(id)
  }
  for (const row of await chatScope(ctx)) {
    if (!row.espoContactId || found.has(row.espoContactId)) continue
    const id = await existingId(crm, 'Contact', row.espoContactId)
    if (id) found.add(id)
  }
  return [...found]
}

/**
 * Leads: every request email, the phase 81 references of the person's inquiries and bookings, and the
 * chat Leads of the registry scope (by stored EspoCRM id, and by their `chat:` cSupabaseRef).
 */
async function findEspoLeads(ctx: Ctx): Promise<string[]> {
  const crm = ctx.crm as SiteEspoClient
  const found = new Set<string>()
  for (const email of ctx.req.emails) {
    for (const id of await espoIdsByEquals(crm, 'Lead', 'emailAddress', email)) found.add(id)
  }
  const refs = [
    ...ctx.req.inquiryIds.map(leadRefForInquiry),
    ...ctx.req.bookingIds.map(leadRefForBooking),
  ]
  for (const id of await espoIdsByAny(crm, 'Lead', LEAD_ATTR.supabaseRef, refs)) found.add(id)

  const scope = await chatScope(ctx)
  for (const row of scope) {
    if (!row.espoLeadId || found.has(row.espoLeadId)) continue
    const id = await existingId(crm, 'Lead', row.espoLeadId)
    if (id) found.add(id)
  }
  const chatRefs = [...new Set(scope.map((r) => r.leadRef).filter((ref) => ref !== ''))]
  for (const id of await espoIdsByAny(crm, 'Lead', LEAD_ATTR.supabaseRef, chatRefs)) found.add(id)
  return [...found]
}

// Blank personal fields. lastName is required by EspoCRM, so it gets a neutral marker.
const BLANK_NAME = { firstName: '', lastName: 'Erased' }
const BLANK_CONTACT_FIELDS = {
  ...BLANK_NAME,
  emailAddress: null,
  emailAddressData: [],
  phoneNumber: null,
  phoneNumberData: [],
  title: '',
  description: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressCountry: '',
  addressPostalCode: '',
}
const BLANK_LEAD_FIELDS = { ...BLANK_CONTACT_FIELDS, accountName: '', website: '' }
// Fallback when the instance refuses the long body: only what carries the personal data.
const BLANK_MINIMAL = { ...BLANK_NAME, emailAddressData: [], phoneNumberData: [], description: '' }

/**
 * RESEARCH Pitfall 6: an EspoCRM delete is soft (the record stays in the database with deleted = 1),
 * so the personal fields are overwritten FIRST and the record deleted second. A scrub that is refused
 * twice throws: the record is never deleted unscrubbed. 404 on either call = already gone = done.
 */
async function scrubThenDelete(crm: SiteEspoClient, entity: 'Contact' | 'Lead', id: string): Promise<void> {
  const full = entity === 'Lead' ? BLANK_LEAD_FIELDS : BLANK_CONTACT_FIELDS
  try {
    try {
      await crm.put(`/${entity}/${q(id)}`, full)
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
      await crm.put(`/${entity}/${q(id)}`, BLANK_MINIMAL)
    }
  } catch (err) {
    if (err instanceof SiteEspoError && err.status === 404) return
    throw err
  }
  try {
    await crm.del(`/${entity}/${q(id)}`)
  } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 404) throw err
  }
}

const NOTE_PAGE = 200
const NOTE_ROUNDS = 5

interface NoteTally {
  deleted: number
  skipped: number
}

/**
 * Blanks and deletes the stream posts of one Contact or Lead (RESEARCH A8: Notes can outlive their
 * parent, and a soft delete keeps the text). Only `Post` notes carry written text. 404 = already gone
 * = done; 403 (written by the owner, not the Sync user) = skipped for the manual checklist. Skipped
 * Notes are never retried within the run, so the paging loop always ends.
 */
async function scrubNotes(crm: SiteEspoClient, parentType: 'Contact' | 'Lead', parentId: string, tally: NoteTally): Promise<void> {
  const skipped = new Set<string>()
  for (let round = 0; round < NOTE_ROUNDS; round++) {
    const page = await listStreamNotes(crm, parentType, parentId, NOTE_PAGE)
    let progressed = false
    for (const note of page) {
      if (note.type !== 'Post' || !note.id || skipped.has(note.id)) continue
      const id = q(note.id)
      try {
        try {
          await crm.put(`/Note/${id}`, { post: '' })
        } catch (err) {
          // A required post field refuses the empty text: a neutral marker still removes the content.
          if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
          await crm.put(`/Note/${id}`, { post: 'Erased' })
        }
        await crm.del(`/Note/${id}`)
        tally.deleted++
        progressed = true
      } catch (err) {
        if (!(err instanceof SiteEspoError)) throw err
        if (err.status === 404) continue
        if (err.status === 403) {
          skipped.add(note.id)
          tally.skipped++
          continue
        }
        throw err
      }
    }
    if (!progressed || page.length < NOTE_PAGE) return
  }
}

/** Notes first, then the personal fields, then the delete (a failed Note step never leaves a scrubbed parent behind a retry gap). */
async function purgeRecord(crm: SiteEspoClient, entity: 'Contact' | 'Lead', id: string, tally: NoteTally): Promise<void> {
  await scrubNotes(crm, entity, id, tally)
  await scrubThenDelete(crm, entity, id)
}

const CBOOKING_BLANK = { passengerName: '', flightNumber: '', pickup: '', dropoff: '', contactId: null }
const CBOOKING_PERSONAL = ['passengerName', 'flightNumber', 'pickup', 'dropoff'] as const

interface LiveCBooking {
  id: string
  [attr: string]: unknown
}

function cbookingsOf(res: unknown): LiveCBooking[] {
  const list = recordOf(res)?.list
  return (Array.isArray(list) ? list : []).filter(
    (r): r is LiveCBooking => recordOf(r) !== null && str((r as { id?: unknown }).id) !== null,
  )
}

const CBOOKING_SELECT = ['id', 'contactId', ...CBOOKING_PERSONAL].join(',')

async function findCBookings(crm: SiteEspoClient, bookingIds: string[], contactIds: string[]): Promise<LiveCBooking[]> {
  const found = new Map<string, LiveCBooking>()
  for (let i = 0; i < bookingIds.length; i += LOOKUP_CHUNK) {
    const chunk = bookingIds.slice(i, i + LOOKUP_CHUNK)
    const params = chunk.map((v, n) => `where[0][value][${n}]=${q(v)}`).join('&')
    let list: LiveCBooking[]
    try {
      list = cbookingsOf(
        await crm.get(
          `/CBooking?select=${CBOOKING_SELECT}&maxSize=${LIST_SIZE}&where[0][type]=in&where[0][attribute]=supabaseBookingId&${params}`,
        ),
      )
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
      list = []
      for (const id of chunk) {
        list.push(
          ...cbookingsOf(
            await crm.get(
              `/CBooking?select=${CBOOKING_SELECT}&maxSize=${LIST_SIZE}&where[0][type]=equals&where[0][attribute]=supabaseBookingId&where[0][value]=${q(id)}`,
            ),
          ),
        )
      }
    }
    for (const c of list) found.set(c.id, c)
  }
  // Records the sync linked to the Contact, whatever their booking id (the link goes with the Contact).
  for (const contactId of contactIds) {
    for (const c of cbookingsOf(
      await crm.get(
        `/CBooking?select=${CBOOKING_SELECT}&maxSize=${LIST_SIZE}&where[0][type]=equals&where[0][attribute]=contactId&where[0][value]=${q(contactId)}`,
      ),
    )) {
      found.set(c.id, c)
    }
  }
  return [...found.values()]
}

function isBlankCBooking(c: LiveCBooking): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === ''
  return CBOOKING_PERSONAL.every((f) => empty(c[f])) && empty(c.contactId)
}

/** D-09: CBookings are anonymised in place and KEPT (never deleted). */
async function anonymiseCBookings(crm: SiteEspoClient, records: LiveCBooking[]): Promise<number> {
  let done = 0
  for (const c of records) {
    if (isBlankCBooking(c)) continue
    try {
      await crm.put(`/CBooking/${q(c.id)}`, CBOOKING_BLANK)
      done++
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 404) throw err
    }
  }
  return done
}

async function espoStep(ctx: Ctx): Promise<ErasureStepResult> {
  const crm = ctx.crm as SiteEspoClient
  const contacts = await findEspoContacts(ctx)
  const leads = await findEspoLeads(ctx)

  // CBookings first: they are found through the Contact, which is about to go.
  const cbookings = await findCBookings(crm, ctx.req.bookingIds, contacts)
  const anonymised = await anonymiseCBookings(crm, cbookings)

  const notes: NoteTally = { deleted: 0, skipped: 0 }
  for (const id of contacts) await purgeRecord(crm, 'Contact', id, notes)
  for (const id of leads) await purgeRecord(crm, 'Lead', id, notes)

  return {
    espo_contacts_deleted: contacts.length,
    espo_leads_deleted: leads.length,
    espo_cbookings_anonymised: anonymised,
    notes_deleted: notes.deleted,
    notes_skipped: notes.skipped,
  }
}

// ── Verify ──────────────────────────────────────────────────────────────────

/**
 * Pass 1 finds what is still (or again) there and deletes it again; pass 2 must find nothing. A
 * contact recreated by an in-flight sync between the steps is caught here. Anything left after the
 * second pass means verified false: the request fails and Supabase stays untouched.
 */
async function verifyStep(ctx: Ctx): Promise<ErasureStepResult> {
  let redeleted = 0

  const cwFound = await findChatwootContacts(ctx)
  redeleted += await deleteChatwootContacts(ctx, cwFound)

  const crm = ctx.crm as SiteEspoClient
  const contacts = await findEspoContacts(ctx)
  const leads = await findEspoLeads(ctx)
  // The verify result keeps its own counts; Note tallies stay with the espocrm step (distinct count names).
  const notes: NoteTally = { deleted: 0, skipped: 0 }
  for (const id of contacts) await purgeRecord(crm, 'Contact', id, notes)
  for (const id of leads) await purgeRecord(crm, 'Lead', id, notes)
  redeleted += contacts.length + leads.length

  const remaining =
    (await findChatwootContacts(ctx)).size + (await findEspoContacts(ctx)).length + (await findEspoLeads(ctx)).length

  return { verified: remaining === 0, verify_redeleted: redeleted, verify_remaining: remaining }
}
