import { syncBucketKey } from '@/lib/outbox'
import type { OutboxRow } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteEspoError, type SiteEspoClient } from '@/lib/espocrm-client'
import type { CrmBookingRecord, PersonRecord } from '@/lib/identity-store'
import type { DispatchDeps } from '@/lib/lead-sync'
import {
  adminLink,
  BOOKING_LEAD_STATUS,
  diffSyncOwned,
  LEAD_ATTR,
  LEAD_STATUS_VALUE,
} from '@/lib/lead-mapping'
import { createChatStore } from '@/lib/chat-store'
import { formatConversionNote, isOpenLeadStatus } from '@/lib/chat-classify'
import { postNote, readLeadStatus, updateLead } from '@/lib/chat-io'
import {
  buildCBookingDraft,
  buildContactDraft,
  CBOOKING_SYNCED_FIELDS,
  type CBookingDraft,
  type ContactDraft,
} from '@/lib/customer-mapping'

/**
 * sync.espo handler (Phase 82, plan 82-07). Runs only inside the QStash-invoked dispatcher.
 *
 * State-convergent: the row's key only says "this person (or orphan booking) changed". Every run
 * re-reads the CURRENT person from Supabase and makes EspoCRM equal to it: one Contact (cached id,
 * else found by any identity email, else created) and one CBooking per non-abandoned booking, keyed
 * by supabaseBookingId. Late, duplicated or out-of-order events therefore converge on the same state.
 *
 * Field ownership (infra/espocrm/README.md): an existing Contact's names, accountId, title and
 * description are never written; phoneNumber only while the Contact's phone is empty; the email list
 * is merged (identity emails added, only addresses another identity owns removed); no Account is ever
 * written. Every CBooking field is sync-owned. No phone is ever guessed.
 *
 * One write outside Contacts and CBookings (Phase 83, D-05): when the person has an open chat Lead
 * and a paid site booking created after it, the Lead becomes Converted, carries the booking
 * reference and admin link, gets one conversion Note, and its registry row is closed. The booking's
 * own Phase 81 Lead is never touched, and a Lead the owner already closed in EspoCRM is only closed
 * in the registry.
 *
 * Logs carry the key (ids only), outcome and code; never a name, email, phone or response body.
 */

const q = encodeURIComponent
const SKIP_DUPLICATE_CHECK = { 'X-Skip-Duplicate-Check': 'true' }
const DEADLINE_MS = 45_000
const DEADLINE_RESCHEDULE_SECONDS = 5
const LOOKUP_CHUNK = 50

/** Thrown when an invocation nears the 60 s platform limit; turned into a `deadline` reschedule. */
class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

interface EmailEntry {
  emailAddress: string
  primary: boolean
  optOut: boolean
  invalid: boolean
}

interface LiveContact {
  id: string
  emails: EmailEntry[]
  phoneNumber: string | null
  accountId: string | null
}

interface LiveCBooking {
  id: string
  [attr: string]: unknown
}

type Ctx = {
  d: DispatchDeps
  crm: SiteEspoClient
  row: OutboxRow
  /** Throws DeadlineError when the invocation is older than DEADLINE_MS; call before every write. */
  guard: () => void
}

export async function deliverEspoSync(row: OutboxRow, d: DispatchDeps, crm: SiteEspoClient): Promise<DispatchResult> {
  const startMs = d.now().getTime()
  const ctx: Ctx = {
    d,
    crm,
    row,
    guard: () => {
      if (d.now().getTime() - startMs >= DEADLINE_MS) throw new DeadlineError()
    },
  }

  let result: DispatchResult
  try {
    result = row.aggregate_type === 'booking' ? await syncOrphanBooking(ctx) : await syncPerson(ctx)
  } catch (err) {
    if (!(err instanceof DeadlineError)) throw err
    result = await rescheduleForDeadline(ctx)
  }
  console.log(`[crm-sync] key=${row.idempotency_key} outcome=${result.outcome} code=${result.code ?? '-'}`)
  return result
}

async function rescheduleForDeadline({ d, row }: Ctx): Promise<DispatchResult> {
  const key = row.idempotency_key
  await d.store.reschedule(key, new Date(d.now().getTime() + DEADLINE_RESCHEDULE_SECONDS * 1000), 'deadline')
  await d.publish(key, { delaySeconds: DEADLINE_RESCHEDULE_SECONDS, dedupSuffix: `dl${row.attempts}` })
  return { outcome: 'rescheduled', code: 'deadline' }
}

// ── Person ──────────────────────────────────────────────────────────────────

async function syncPerson(ctx: Ctx): Promise<DispatchResult> {
  const { d, row } = ctx
  const person = await d.identity.person(row.aggregate_id)
  if (!person) return skip(row, d, 'identity_missing')
  // The erasure saga owns this person from here on: writing now would race the purge.
  if (person.identity.erasing_at) return skip(row, d, 'identity_erasing')

  const draft = buildContactDraft(person)
  if (!draft) return skip(row, d, 'no_email')

  const identityId = person.identity.id
  const contact = await ensureContact(ctx, identityId, person.identity.espo_contact_id, draft)

  if (contact.id !== person.identity.espo_contact_id) {
    // D-02: the Chatwoot "CRM contact" link needs the Contact id, so refresh Chatwoot even when its
    // sync ran first. Enqueued BEFORE the id is stored: a failure in between is retried with the id
    // still unstored, so the refresh is never lost (the enqueue is idempotent on its key).
    await enqueueChatwootRefresh(ctx, identityId)
    ctx.guard()
    await d.identity.setEspoContact(identityId, contact.id)
  }

  const unmapped = await upsertBookings(ctx, person.bookings, contact)
  await convertChatLeads(ctx, person)
  return finish(ctx, unmapped)
}

// ── D-05: paid booking converts the open chat Lead ──────────────────────────

/**
 * Paid = a real site booking: not an abandoned checkout, not a return leg (the outbound leg carries
 * the trip), not anonymised (no reference left), status mapped to Converted (D-06 table).
 */
function paidBookings(bookings: CrmBookingRecord[]): Array<{ booking: CrmBookingRecord; at: number }> {
  const out: Array<{ booking: CrmBookingRecord; at: number }> = []
  for (const booking of bookings) {
    if (booking.abandoned || booking.leg === 'return' || booking.anonymised_at) continue
    if (BOOKING_LEAD_STATUS[booking.status] !== 'converted') continue
    if (typeof booking.booking_reference !== 'string' || booking.booking_reference === '') continue
    const at = Date.parse(booking.created_at)
    if (Number.isNaN(at)) continue
    out.push({ booking, at })
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * Converges the person's open chat Leads (registry: identity or a non-shared identity phone) with
 * their paid bookings. The booking must be newer than the Lead (T-83-32); the Lead status is re-read
 * right before writing; a Lead that is no longer open in the CRM is only closed in the registry.
 * Write order: Lead PUT, conversion Note, registry close; a failure anywhere propagates and the
 * sync.espo row retries (a re-run finds no open registry row once it was closed).
 */
async function convertChatLeads(ctx: Ctx, person: PersonRecord): Promise<void> {
  const { d, crm } = ctx
  const paid = paidBookings(person.bookings)
  if (paid.length === 0) return

  const chat = d.chat ?? createChatStore()
  const leads = await chat.openLeadsForPerson(person.identity.id, person.phones)
  for (const lead of leads) {
    if (!lead.espoLeadId) continue
    const leadAt = Date.parse(lead.createdAt)
    if (Number.isNaN(leadAt)) continue
    const match = paid.find((p) => p.at >= leadAt)
    if (!match) continue

    const live = await readLeadStatus(crm, lead.espoLeadId)
    if (!live || !isOpenLeadStatus(live.status)) {
      await chat.closeLead(lead.chatLeadId, 'closed_in_crm')
      continue
    }

    const reference = match.booking.booking_reference
    const link = adminLink(reference)
    const fields: Record<string, unknown> = {
      status: LEAD_STATUS_VALUE.converted,
      [LEAD_ATTR.bookingReference]: reference,
    }
    if (link) fields[LEAD_ATTR.adminLink] = link
    ctx.guard()
    await updateLead(crm, lead.espoLeadId, fields)
    ctx.guard()
    await postNote(crm, 'Lead', lead.espoLeadId, formatConversionNote({ bookingReference: reference, adminLink: link }))
    await chat.closeLead(lead.chatLeadId, 'converted', match.booking.id)
  }
}

async function enqueueChatwootRefresh(ctx: Ctx, identityId: string): Promise<void> {
  const { d } = ctx
  const nowMs = d.now().getTime()
  const { key, availableAt } = syncBucketKey('sync.chatwoot', identityId, nowMs)
  await d.identity.enqueueSync({
    eventType: 'sync.chatwoot',
    aggregateType: 'person',
    aggregateId: identityId,
    key,
    availableAt,
  })
  await d.publish(key, {
    delaySeconds: Math.max(1, Math.ceil((availableAt.getTime() - nowMs) / 1000)),
    dedupSuffix: 'f',
  })
}

/** Unmapped bookings are loud (failed + one ALERT line) but never block the other bookings. */
async function finish(ctx: Ctx, unmapped: number): Promise<DispatchResult> {
  const { d, row } = ctx
  if (unmapped > 0) {
    await d.store.complete(row.idempotency_key, 'failed', 'booking_unmapped')
    console.error(`[crm-sync] ALERT booking_unmapped key=${row.idempotency_key} count=${unmapped}`)
    return { outcome: 'failed', code: 'booking_unmapped' }
  }
  await d.store.complete(row.idempotency_key, 'sent', null)
  return { outcome: 'sent' }
}

// ── Orphan booking (no usable email: GNet placeholder, anonymised) ──────────

async function syncOrphanBooking(ctx: Ctx): Promise<DispatchResult> {
  const { d, row } = ctx
  const booking = await d.identity.crmBooking(row.aggregate_id)
  if (!booking) return skip(row, d, 'source_missing')
  if (booking.abandoned) return skip(row, d, 'abandoned_checkout')

  // contact === undefined: a Contact link set by hand or by the Phase 80 backfill stays as it is.
  const unmapped = await upsertBookings(ctx, [booking], undefined)
  return finish(ctx, unmapped)
}

// ── Contact ─────────────────────────────────────────────────────────────────

const CONTACT_SELECT = 'id,emailAddress,emailAddressData,phoneNumber,accountId'

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function parseContact(raw: unknown): LiveContact | null {
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>
  const id = str(rec.id)
  if (!id) return null

  const emails: EmailEntry[] = []
  const seen = new Set<string>()
  if (Array.isArray(rec.emailAddressData)) {
    for (const item of rec.emailAddressData) {
      if (typeof item !== 'object' || item === null) continue
      const e = item as Record<string, unknown>
      const address = typeof e.emailAddress === 'string' ? e.emailAddress.trim() : ''
      if (address === '' || seen.has(address.toLowerCase())) continue
      seen.add(address.toLowerCase())
      emails.push({
        emailAddress: address,
        primary: e.primary === true,
        optOut: e.optOut === true,
        invalid: e.invalid === true,
      })
    }
  }
  const primaryAddress = str(rec.emailAddress)
  if (emails.length === 0 && primaryAddress) {
    emails.push({ emailAddress: primaryAddress, primary: true, optOut: false, invalid: false })
  }
  return { id, emails, phoneNumber: str(rec.phoneNumber), accountId: str(rec.accountId) }
}

async function findContactByEmail(crm: SiteEspoClient, email: string): Promise<LiveContact | null> {
  const res = (await crm.get(
    `/Contact?select=${CONTACT_SELECT}&maxSize=1&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${q(email)}`,
  )) as { list?: unknown[] } | null
  const first = Array.isArray(res?.list) && res.list.length > 0 ? res.list[0] : null
  return parseContact(first)
}

async function findContactByEmails(crm: SiteEspoClient, emails: string[]): Promise<LiveContact | null> {
  for (const email of emails) {
    const found = await findContactByEmail(crm, email)
    if (found) return found
  }
  return null
}

async function ensureContact(
  ctx: Ctx,
  identityId: string,
  cachedId: string | null,
  draft: ContactDraft,
): Promise<LiveContact> {
  const { d, crm } = ctx

  let live: LiveContact | null = null
  if (cachedId) {
    try {
      live = parseContact(await crm.get(`/Contact/${q(cachedId)}?select=${CONTACT_SELECT}`))
    } catch (err) {
      // The Contact was deleted in the CRM: forget the stale id and re-find or re-create.
      if (!(err instanceof SiteEspoError) || err.status !== 404) throw err
      ctx.guard()
      await d.identity.setEspoContact(identityId, null)
    }
  }
  if (!live) live = await findContactByEmails(crm, draft.emails)
  if (!live) return createContact(ctx, draft)

  return updateContact(ctx, identityId, live, draft)
}

function emailBody(draft: ContactDraft): EmailEntry[] {
  return draft.emails.map((email) => ({
    emailAddress: email,
    primary: email === draft.primaryEmail,
    optOut: false,
    invalid: false,
  }))
}

/**
 * POST /Contact. The identity table already decided this is a new person, so EspoCRM's own
 * duplicate check (email OR first + last name) is skipped. 400 -> once more without the phone;
 * 409 -> somebody created it in the meantime: converge on that Contact.
 */
async function createContact(ctx: Ctx, draft: ContactDraft): Promise<LiveContact> {
  const { crm } = ctx
  const body: Record<string, unknown> = {
    lastName: draft.lastName,
    emailAddress: draft.primaryEmail,
    emailAddressData: emailBody(draft),
  }
  if (draft.firstName) body.firstName = draft.firstName
  if (draft.phoneNumber) body.phoneNumber = draft.phoneNumber

  for (let attempt = 0; attempt < 2; attempt++) {
    ctx.guard()
    try {
      const res = (await crm.post('/Contact', body, SKIP_DUPLICATE_CHECK)) as { id?: unknown } | null
      const id = str(res?.id)
      if (!id) throw new SiteEspoError('POST', '/Contact', 0)
      return {
        id,
        emails: emailBody(draft),
        phoneNumber: typeof body.phoneNumber === 'string' ? body.phoneNumber : null,
        accountId: null,
      }
    } catch (err) {
      if (!(err instanceof SiteEspoError)) throw err
      if (err.status === 409) {
        const raced = await findContactByEmails(crm, draft.emails)
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

/** Existing Contact: email list merge/split and the phone, nothing else. */
async function updateContact(
  ctx: Ctx,
  identityId: string,
  live: LiveContact,
  draft: ContactDraft,
): Promise<LiveContact> {
  const { d, crm } = ctx
  let current = live

  // D-06: an address another identity now owns (after a split) leaves this Contact; addresses the
  // identity table does not know (added by an operator) are never removed.
  const liveAddresses = live.emails.map((e) => e.emailAddress.toLowerCase())
  const owners = await d.identity.emailOwners([...new Set([...liveAddresses, ...draft.emails])])
  const keep = live.emails.filter((e) => {
    const owner = owners.get(e.emailAddress.toLowerCase())
    return !owner || owner === identityId
  })
  const have = new Set(keep.map((e) => e.emailAddress.toLowerCase()))
  const merged: EmailEntry[] = [...keep]
  for (const email of draft.emails) {
    if (have.has(email)) continue
    have.add(email)
    merged.push({ emailAddress: email, primary: false, optOut: false, invalid: false })
  }
  // Exactly one primary: the operator's choice survives; otherwise the identity's primary.
  if (!merged.some((e) => e.primary)) {
    const pick = merged.find((e) => e.emailAddress.toLowerCase() === draft.primaryEmail) ?? merged[0]
    if (pick) pick.primary = true
  }
  let seenPrimary = false
  const next = merged.map((e) => {
    const primary = e.primary && !seenPrimary
    if (primary) seenPrimary = true
    return { ...e, primary }
  })

  if (emailsChanged(live.emails, next)) {
    ctx.guard()
    await crm.put(`/Contact/${q(live.id)}`, { emailAddressData: next })
    current = { ...current, emails: next }
  }

  // The phone is written only while the Contact has none; a refusal never blocks the sync.
  if (!live.phoneNumber && draft.phoneNumber) {
    ctx.guard()
    try {
      await crm.put(`/Contact/${q(live.id)}`, { phoneNumber: draft.phoneNumber })
      current = { ...current, phoneNumber: draft.phoneNumber }
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
    }
  }
  return current
}

function emailsChanged(a: EmailEntry[], b: EmailEntry[]): boolean {
  if (a.length !== b.length) return true
  const byAddress = new Map(a.map((e) => [e.emailAddress.toLowerCase(), e.primary]))
  return b.some((e) => byAddress.get(e.emailAddress.toLowerCase()) !== e.primary)
}

// ── CBookings ───────────────────────────────────────────────────────────────

const CBOOKING_SELECT = ['id', 'contactId', 'accountId', ...CBOOKING_SYNCED_FIELDS].join(',')

function isCBooking(live: unknown): live is LiveCBooking {
  return typeof live === 'object' && live !== null && typeof (live as { id?: unknown }).id === 'string'
}

async function listByEquals(crm: SiteEspoClient, bookingId: string): Promise<LiveCBooking[]> {
  const res = (await crm.get(
    `/CBooking?select=${CBOOKING_SELECT}&maxSize=2&where[0][type]=equals&where[0][attribute]=supabaseBookingId&where[0][value]=${q(bookingId)}`,
  )) as { list?: unknown[] } | null
  return (Array.isArray(res?.list) ? res.list : []).filter(isCBooking)
}

/**
 * One list call per chunk of ids (RESEARCH A4 [ASSUMED]: the `in` operator); a 400 falls back to one
 * equals lookup per booking so the sync works whichever the instance supports.
 */
async function findCBookings(crm: SiteEspoClient, ids: string[]): Promise<Map<string, LiveCBooking>> {
  const found = new Map<string, LiveCBooking>()
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + LOOKUP_CHUNK)
    const values = chunk.map((id, n) => `where[0][value][${n}]=${q(id)}`).join('&')
    let list: LiveCBooking[]
    try {
      const res = (await crm.get(
        `/CBooking?select=${CBOOKING_SELECT}&maxSize=200&where[0][type]=in&where[0][attribute]=supabaseBookingId&${values}`,
      )) as { list?: unknown[] } | null
      list = (Array.isArray(res?.list) ? res.list : []).filter(isCBooking)
    } catch (err) {
      if (!(err instanceof SiteEspoError) || err.status !== 400) throw err
      list = []
      for (const id of chunk) list.push(...(await listByEquals(crm, id)))
    }
    for (const live of list) {
      const key = str(live.supabaseBookingId)
      if (key && !found.has(key)) found.set(key, live)
    }
  }
  return found
}

/**
 * contact === undefined (orphan row): contactId is not managed, an existing link stays.
 * contact === null is never passed; an anonymised booking always gets contactId null (D-08).
 */
async function upsertBookings(
  ctx: Ctx,
  bookings: CrmBookingRecord[],
  contact: LiveContact | undefined,
): Promise<number> {
  const { crm } = ctx
  let unmapped = 0
  const drafts: Array<{ draft: CBookingDraft; anonymised: boolean }> = []
  for (const booking of bookings) {
    const built = buildCBookingDraft(booking)
    if (!built.ok) {
      unmapped++
      continue
    }
    drafts.push({ draft: built.draft, anonymised: !!booking.anonymised_at })
  }
  if (drafts.length === 0) return unmapped

  const existing = await findCBookings(
    crm,
    drafts.map((x) => x.draft.supabaseBookingId),
  )

  for (const { draft, anonymised } of drafts) {
    const desired: Record<string, unknown> = { ...draft }
    if (anonymised) desired.contactId = null
    else if (contact) desired.contactId = contact.id
    if (!anonymised && contact?.accountId) desired.accountId = contact.accountId

    const live = existing.get(draft.supabaseBookingId)
    if (!live) {
      await createCBooking(ctx, desired, draft.supabaseBookingId)
    } else {
      await updateCBooking(ctx, live, desired)
    }
  }
  return unmapped
}

/** EspoCRM answers an empty varchar / link with null: '' and null are the same "empty" for the diff. */
function changesFor(live: LiveCBooking, desired: Record<string, unknown>): Record<string, unknown> {
  const normalised: Record<string, unknown> = { ...live }
  for (const key of Object.keys(desired)) {
    const want = desired[key]
    if ((want === '' || want === null) && (live[key] === null || live[key] === undefined || live[key] === '')) {
      normalised[key] = want
    }
  }
  return diffSyncOwned(normalised, desired)
}

async function updateCBooking(ctx: Ctx, live: LiveCBooking, desired: Record<string, unknown>): Promise<void> {
  const changes = changesFor(live, desired)
  if (Object.keys(changes).length === 0) return
  ctx.guard()
  await ctx.crm.put(`/CBooking/${q(live.id)}`, changes)
}

async function createCBooking(ctx: Ctx, desired: Record<string, unknown>, bookingId: string): Promise<void> {
  const body = { ...desired }
  if (body.contactId === null) delete body.contactId
  ctx.guard()
  try {
    await ctx.crm.post('/CBooking', body)
  } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 409) throw err
    // Created by a racing delivery (unique supabaseBookingId): converge on that record.
    const [raced] = await listByEquals(ctx.crm, bookingId)
    if (!raced) throw err
    await updateCBooking(ctx, raced, desired)
  }
}
