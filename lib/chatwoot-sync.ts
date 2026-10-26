import type { OutboxRow } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteChatwootError, type SiteChatwootClient } from '@/lib/chatwoot-client'
import type { PersonRecord } from '@/lib/identity-store'
import type { DispatchDeps } from '@/lib/lead-sync'
import {
  buildChatwootAttributes,
  buildChatwootContactDraft,
  CHATWOOT_SYNCED_ATTRIBUTE_KEYS,
  type ChatwootContactDraft,
} from '@/lib/chatwoot-mapping'
import { postWriteFingerprint, SITE_SYNC_FP_ATTRIBUTE } from '@/lib/sync-origin'

/**
 * sync.chatwoot handler (Phase 82, plan 82-10). Runs only inside the QStash-invoked dispatcher.
 *
 * State-convergent: the row's key only says "this person changed". Every run re-reads the CURRENT
 * person from Supabase and makes the person's Chatwoot contact equal to it:
 *   find   cached id (404 -> forgotten) -> identifier = user id -> each identity email -> each
 *          non-shared phone, all exact filters
 *   0 hits -> create; 1 -> adopt; 2 -> merge through the administrator client; otherwise `cw_ambiguous`
 *   update D-03: name, email, phone and identifier only into an EMPTY slot (the operator wins);
 *          D-02: the seven owned custom attributes are overwritten (Chatwoot merges them shallowly,
 *          so every other attribute is untouched)
 *
 * The site only creates, updates or merges contact records. It never sends a message, starts a
 * conversation or triggers an automation. Shared phones never reach Chatwoot (identity_person
 * excludes them). Logs carry the key (ids only), outcome and code; never a name, email, phone or body.
 */

const DEADLINE_MS = 45_000
const DEADLINE_RESCHEDULE_SECONDS = 5
const DEFAULT_SITE_URL = 'https://rideprestigo.com'

/** Thrown when an invocation nears the 60 s platform limit; turned into a `deadline` reschedule. */
class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

interface LiveContact {
  id: number
  name: string
  email: string
  phone: string
  identifier: string
  attributes: Record<string, unknown>
}

type Ctx = {
  d: DispatchDeps
  row: OutboxRow
  /** Every request first checks the invocation deadline. */
  client: SiteChatwootClient
  admin: SiteChatwootClient | null
  /** The cached contact id still to try; cleared once it turned out to be gone. */
  cachedId: number | null
  guard: () => void
}

export async function deliverChatwootSync(
  row: OutboxRow,
  d: DispatchDeps,
  client: SiteChatwootClient,
  admin: SiteChatwootClient | null,
): Promise<DispatchResult> {
  const startMs = d.now().getTime()
  const guard = () => {
    if (d.now().getTime() - startMs >= DEADLINE_MS) throw new DeadlineError()
  }
  const ctx: Ctx = {
    d,
    row,
    client: guarded(client, guard),
    admin: admin ? guarded(admin, guard) : null,
    cachedId: null,
    guard,
  }

  let result: DispatchResult
  try {
    result = await syncPerson(ctx)
  } catch (err) {
    if (!(err instanceof DeadlineError)) throw err
    result = await rescheduleForDeadline(ctx)
  }
  console.log(`[chatwoot-sync] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

function guarded(client: SiteChatwootClient, guard: () => void): SiteChatwootClient {
  return {
    get: (path) => (guard(), client.get(path)),
    post: (path, body) => (guard(), client.post(path, body)),
    put: (path, body) => (guard(), client.put(path, body)),
    del: (path) => (guard(), client.del(path)),
  }
}

async function rescheduleForDeadline({ d, row }: Ctx): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + DEADLINE_RESCHEDULE_SECONDS * 1000), 'deadline')
  await d.publish(key, { delaySeconds: DEADLINE_RESCHEDULE_SECONDS, dedupSuffix: `dl${row.attempts}` })
  return { outcome: 'rescheduled', code: 'deadline' }
}

/** `failed` is terminal: one loud, payload-free line for the Vercel logs and the Outbox page hint. */
async function fail({ d, row }: Ctx, code: string): Promise<DispatchResult> {
  await d.store.complete(row.idempotency_key, 'failed', code)
  console.error(`[chatwoot-sync] ALERT chatwoot_sync_failed key=${row.idempotency_key} code=${code}`)
  return { outcome: 'failed', code }
}

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return raw ? raw : DEFAULT_SITE_URL
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseContact(raw: unknown): LiveContact | null {
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'number' || !Number.isInteger(rec.id) || rec.id <= 0) return null
  const attributes =
    typeof rec.custom_attributes === 'object' && rec.custom_attributes !== null && !Array.isArray(rec.custom_attributes)
      ? (rec.custom_attributes as Record<string, unknown>)
      : {}
  return {
    id: rec.id,
    name: text(rec.name).trim(),
    email: text(rec.email).trim(),
    phone: text(rec.phone_number).trim(),
    identifier: text(rec.identifier).trim(),
    attributes,
  }
}

/** show/update answer { payload: contact }, create answers { payload: { contact, ... } }. */
function extractContact(res: unknown): LiveContact | null {
  if (typeof res !== 'object' || res === null) return null
  const rec = res as Record<string, unknown>
  const payload = rec.payload
  if (typeof payload === 'object' && payload !== null) {
    const nested = (payload as Record<string, unknown>).contact
    return parseContact(nested) ?? parseContact(payload)
  }
  return parseContact(rec.contact) ?? parseContact(rec)
}

// ── Person ──────────────────────────────────────────────────────────────────

async function syncPerson(ctx: Ctx): Promise<DispatchResult> {
  const { d, row } = ctx
  const person = await d.identity.person(row.aggregate_id)
  if (!person) return skip(row, d, 'identity_missing')
  // The erasure saga owns this person from here on: writing now would race the purge.
  if (person.identity.erasing_at) return skip(row, d, 'identity_erasing')

  const draft = buildChatwootContactDraft(person)
  if (!draft) return skip(row, d, 'no_email')

  const attributes = buildChatwootAttributes(person, d.now(), {
    espoBaseUrl: d.config?.baseUrl ?? null,
    siteUrl: siteUrl(),
  })
  const identityId = person.identity.id
  ctx.cachedId = person.identity.chatwoot_contact_id

  let candidates = await locate(ctx, person, draft)
  let contact: LiveContact
  let upToDate = false

  if (candidates.length === 0) {
    const body: Record<string, unknown> = { name: draft.name, email: draft.email, custom_attributes: attributes }
    if (draft.phone_number) body.phone_number = draft.phone_number
    if (draft.identifier) body.identifier = draft.identifier

    let created: LiveContact | null = null
    try {
      created = await createContact(ctx, stamped(body, null))
    } catch (err) {
      if (!is422(err)) throw err
      // Somebody created it in the meantime, or a phone/identifier is taken: one re-find first.
      candidates = await locate(ctx, person, draft)
      if (candidates.length === 0) {
        if (body.phone_number === undefined) return fail(ctx, 'cw_unprocessable')
        delete body.phone_number
        try {
          // The phone is gone from the body, so the tag is recomputed without it.
          created = await createContact(ctx, stamped(body, null))
        } catch (retryErr) {
          if (!is422(retryErr)) throw retryErr
          return fail(ctx, 'cw_unprocessable')
        }
      }
    }
    if (created) {
      contact = created
      upToDate = true // the create body already carried every attribute
    } else {
      const picked = await pick(ctx, person, candidates)
      if ('result' in picked) return picked.result
      contact = picked.contact
    }
  } else {
    const picked = await pick(ctx, person, candidates)
    if ('result' in picked) return picked.result
    contact = picked.contact
  }

  if (!upToDate) {
    const failed = await updateContact(ctx, person, draft, attributes, contact)
    if (failed) return failed
  }

  if (contact.id !== person.identity.chatwoot_contact_id) {
    ctx.guard()
    await d.identity.setChatwootContact(identityId, contact.id)
  }
  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

function is422(err: unknown): boolean {
  return err instanceof SiteChatwootError && err.status === 422
}

// ── Find ────────────────────────────────────────────────────────────────────

async function filterBy(ctx: Ctx, attributeKey: string, value: string): Promise<LiveContact[]> {
  const res = (await ctx.client.post('/contacts/filter', {
    payload: [{ attribute_key: attributeKey, filter_operator: 'equal_to', values: [value], query_operator: null }],
  })) as { payload?: unknown } | null
  const list = Array.isArray(res?.payload) ? res.payload : []
  return list.map(parseContact).filter((c): c is LiveContact => c !== null)
}

/**
 * Distinct contacts that belong to this person through their own keys. A valid cached contact
 * short-circuits the scan (a repeat sync costs one GET); the identifier lookup still runs when the
 * person now has an account and the cached contact has no identifier yet (signup adoption).
 */
async function locate(ctx: Ctx, person: PersonRecord, draft: ChatwootContactDraft): Promise<LiveContact[]> {
  const found = new Map<number, LiveContact>()
  const add = (list: LiveContact[]) => {
    for (const c of list) if (!found.has(c.id)) found.set(c.id, c)
  }
  const userId = person.identity.user_id

  if (ctx.cachedId !== null) {
    let cached: LiveContact | null = null
    try {
      cached = extractContact(await ctx.client.get(`/contacts/${ctx.cachedId}`))
    } catch (err) {
      // The contact was deleted in Chatwoot: forget the stale id and look again.
      if (!(err instanceof SiteChatwootError) || err.status !== 404) throw err
      ctx.guard()
      await ctx.d.identity.setChatwootContact(person.identity.id, null)
    }
    ctx.cachedId = null
    if (cached) {
      add([cached])
      if (userId && cached.identifier === '') add(await filterBy(ctx, 'identifier', userId))
      return [...found.values()]
    }
  }

  if (userId) add(await filterBy(ctx, 'identifier', userId))
  for (const email of draft.emails) add(await filterBy(ctx, 'email', email))
  for (const phone of draft.phones) add(await filterBy(ctx, 'phone_number', phone))
  return [...found.values()]
}

// ── Adopt / merge ───────────────────────────────────────────────────────────

type Picked = { contact: LiveContact } | { result: DispatchResult }

/**
 * 1 candidate -> adopt. 2 candidates -> merge through the administrator client (a merge cannot be
 * undone by a split, so never more than two and never across two different accounts). Anything else
 * is left to a human: `cw_ambiguous`, shown on the Outbox page with its hint.
 */
async function pick(ctx: Ctx, person: PersonRecord, candidates: LiveContact[]): Promise<Picked> {
  const userId = person.identity.user_id
  // A contact signed in as somebody else is not this person's, whatever else it shares.
  if (userId && candidates.some((c) => c.identifier !== '' && c.identifier !== userId)) {
    return { result: await fail(ctx, 'cw_ambiguous') }
  }
  if (candidates.length === 1) return { contact: candidates[0] }
  if (candidates.length !== 2) return { result: await fail(ctx, 'cw_ambiguous') }

  const [a, b] = candidates
  if (a.identifier !== '' && b.identifier !== '' && a.identifier !== b.identifier) {
    return { result: await fail(ctx, 'cw_ambiguous') }
  }
  if (!ctx.admin) return { result: await fail(ctx, 'cw_ambiguous') }

  const primaryEmail = buildChatwootContactDraft(person)?.email ?? ''
  const rank = (c: LiveContact) => (c.identifier !== '' ? 2 : c.email.toLowerCase() === primaryEmail ? 1 : 0)
  const [base, mergee] = rank(a) !== rank(b) ? (rank(a) > rank(b) ? [a, b] : [b, a]) : a.id < b.id ? [a, b] : [b, a]

  try {
    await ctx.admin.post('/actions/contact_merge', { base_contact_id: base.id, mergee_contact_id: mergee.id })
  } catch (err) {
    // A token that cannot merge must not trip the 6 h breaker for every normal sync.
    if (err instanceof SiteChatwootError && (err.status === 401 || err.status === 403)) {
      return { result: await fail(ctx, 'cw_ambiguous') }
    }
    throw err
  }
  // Attributes were merged server-side (base wins): read the merged contact before diffing.
  const merged = extractContact(await ctx.client.get(`/contacts/${base.id}`))
  if (!merged) throw new SiteChatwootError('GET', `/contacts/${base.id}`, 0)
  return { contact: merged }
}

// ── Create / update ─────────────────────────────────────────────────────────

async function createContact(ctx: Ctx, body: Record<string, unknown>): Promise<LiveContact> {
  const created = extractContact(await ctx.client.post('/contacts', body))
  if (!created) throw new SiteChatwootError('POST', '/contacts', 0)
  return created
}

function sentText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * HOOK-04 origin tag: a copy of the request body whose custom_attributes also carry site_sync_fp, the
 * fingerprint of the contact's name, email, phone and identifier AFTER this very write (the value the
 * body sends where it sends one, else what the contact has now). The receiver and the hook.chat_contact
 * handler recompute it from the contact_updated payload; equal means "the site wrote this", so the
 * event is dropped. Chatwoot merges custom_attributes shallowly, so nothing else is touched. Only ever
 * added to a write that happens anyway (never a write of its own).
 */
function stamped(body: Record<string, unknown>, live: LiveContact | null): Record<string, unknown> {
  const sent: { name?: string; email?: string; phone_number?: string; identifier?: string } = {}
  for (const key of ['name', 'email', 'phone_number', 'identifier'] as const) {
    const value = sentText(body[key])
    if (value !== undefined) sent[key] = value
  }
  const own = (typeof body.custom_attributes === 'object' && body.custom_attributes !== null ? body.custom_attributes : {}) as Record<string, unknown>
  return {
    ...body,
    custom_attributes: { ...own, [SITE_SYNC_FP_ATTRIBUTE]: postWriteFingerprint(live, sent) },
  }
}

function currentValue(contact: LiveContact, key: string): string {
  const v = contact.attributes[key]
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v : String(v)
}

/**
 * Sends only what differs: the owned attributes that changed, plus name, email, phone and identifier
 * where the contact has none (D-03). Nothing differs -> no request. A 422 drops the phone (taken by
 * another contact) and goes on; a 422 that remains is `cw_unprocessable`.
 */
async function updateContact(
  ctx: Ctx,
  person: PersonRecord,
  draft: ChatwootContactDraft,
  attributes: Record<string, string>,
  contact: LiveContact,
): Promise<DispatchResult | null> {
  const body: Record<string, unknown> = {}
  if (contact.name === '' && draft.name) body.name = draft.name
  if (contact.email === '') body.email = draft.email
  if (contact.phone === '' && draft.phone_number) body.phone_number = draft.phone_number
  if (contact.identifier === '' && person.identity.user_id) body.identifier = person.identity.user_id

  const changed: Record<string, string> = {}
  for (const key of CHATWOOT_SYNCED_ATTRIBUTE_KEYS) {
    if (currentValue(contact, key) !== attributes[key]) changed[key] = attributes[key]
  }
  if (Object.keys(changed).length > 0) body.custom_attributes = changed
  // Nothing differs -> no request. The origin tag is never a reason to write on its own (HOOK-04).
  if (Object.keys(body).length === 0) return null

  for (;;) {
    try {
      // Re-stamped on every attempt: a phone dropped by the 422 ladder changes the post-write state.
      await ctx.client.put(`/contacts/${contact.id}`, stamped(body, contact))
      return null
    } catch (err) {
      if (!is422(err)) throw err
      if (body.phone_number === undefined) return fail(ctx, 'cw_unprocessable')
      delete body.phone_number
      if (Object.keys(body).length === 0) return null
    }
  }
}
