import type { CrmBookingRecord, PersonRecord } from '@/lib/identity-store'
import { bookingLeadAmountEur, type BookingRow } from '@/lib/lead-mapping'
import { buildContactDraft } from '@/lib/customer-mapping'
import { E164_RE } from '@/lib/phone'

/**
 * Pure mapping Supabase person -> Chatwoot contact (Phase 82, plan 82-10). No env, no I/O.
 *
 * The seven owned custom attributes (D-02) are rebuilt from the CURRENT person on every sync. Their
 * keys equal the contact keys of infra/chatwoot/custom-attributes.json minus site_locale (pinned by
 * tests/chatwoot-mapping.test.ts). Chatwoot merges custom_attributes shallowly, so sending only
 * these keys leaves every other attribute (site_locale, operator edits) untouched.
 */

export const CHATWOOT_SYNCED_ATTRIBUTE_KEYS = [
  'next_trip',
  'trip_count',
  'last_trip_date',
  'repeat_customer',
  'lifetime_value',
  'crm_contact_url',
  'admin_bookings_url',
] as const

export type ChatwootAttributeKey = (typeof CHATWOOT_SYNCED_ATTRIBUTE_KEYS)[number]

/** Statuses whose booking value counts towards lifetime_value (paid or actively being served). */
const VALUE_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'assigned', 'en_route', 'on_location', 'completed'])

const NEXT_TRIP_MAX = 400
const NAME_MAX = 100

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** A trip is a non-return leg that is not cancelled. Abandoned checkouts are never part of a person. */
function tripsOf(person: PersonRecord): CrmBookingRecord[] {
  return person.bookings.filter((b) => b.leg !== 'return' && b.status !== 'cancelled' && !b.abandoned)
}

function pickupMs(b: CrmBookingRecord): number {
  return b.pickup_utc ? Date.parse(b.pickup_utc) : Number.NaN
}

function formatNextTrip(b: CrmBookingRecord): string {
  const when = [clean(b.pickup_date), clean(b.pickup_time)].filter(Boolean).join(' ')
  const route = `${clean(b.origin_address)} → ${clean(b.destination_address)}`
  return [when, route, clean(b.booking_reference), clean(b.status)].join(' · ').slice(0, NEXT_TRIP_MAX)
}

function lifetimeValueEur(trips: CrmBookingRecord[]): string {
  let total = 0
  for (const trip of trips) {
    if (!VALUE_STATUSES.has(trip.status)) continue
    // bookingLeadAmountEur reads only amount_eur, trip_type and the two per-leg czk amounts.
    const amount = bookingLeadAmountEur(trip as unknown as BookingRow)
    if (amount !== null) total += amount
  }
  return `${total.toFixed(2)} EUR`
}

export function buildChatwootAttributes(
  person: PersonRecord,
  now: Date,
  links: { espoBaseUrl: string | null; siteUrl: string },
): Record<ChatwootAttributeKey, string> {
  const trips = tripsOf(person)
  const nowMs = now.getTime()

  const upcoming = trips
    .filter((t) => pickupMs(t) >= nowMs)
    .sort((a, b) => pickupMs(a) - pickupMs(b))
  const past = trips
    .filter((t) => pickupMs(t) < nowMs)
    .sort((a, b) => pickupMs(b) - pickupMs(a))

  const espoBase = links.espoBaseUrl ? links.espoBaseUrl.replace(/\/+$/, '') : ''
  const contactId = person.identity.espo_contact_id
  const primaryEmail = buildContactDraft(person)?.primaryEmail ?? ''
  const siteBase = links.siteUrl.replace(/\/+$/, '')

  return {
    next_trip: upcoming.length > 0 ? formatNextTrip(upcoming[0]) : 'none',
    trip_count: String(trips.length),
    last_trip_date: past.length > 0 && clean(past[0].pickup_date) ? clean(past[0].pickup_date) : 'none',
    repeat_customer: trips.length >= 2 ? 'yes' : 'no',
    lifetime_value: lifetimeValueEur(trips),
    crm_contact_url: espoBase && contactId ? `${espoBase}/#Contact/view/${contactId}` : '',
    admin_bookings_url: `${siteBase}/admin/bookings?search=${encodeURIComponent(primaryEmail)}`,
  }
}

export interface ChatwootContactDraft {
  name: string
  /** Primary email, lower-cased. */
  email: string
  /** Every identity email, lower-cased, primary first (find keys). */
  emails: string[]
  /** First non-shared E.164 phone (identity_person already excludes shared ones). */
  phone_number?: string
  /** Supabase user id, only when the person has an account. */
  identifier?: string
  /** Every non-shared E.164 phone (find keys). */
  phones: string[]
}

/**
 * The contact the identity should have. name, email, phone_number and identifier are written only
 * into an empty slot of an existing contact (D-03); on create they are all sent. Null when the
 * person has no usable email.
 */
export function buildChatwootContactDraft(person: PersonRecord): ChatwootContactDraft | null {
  const base = buildContactDraft(person)
  if (!base) return null

  let name = clean(person.profile?.full_name).slice(0, NAME_MAX)
  if (name === '') {
    const newest = [...person.bookings].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
    if (newest && !newest.anonymised_at) {
      name = [clean(newest.client_first_name), clean(newest.client_last_name)].filter(Boolean).join(' ').slice(0, NAME_MAX)
    }
  }
  if (name === '') name = base.primaryEmail.split('@')[0]

  const phones = person.phones.filter((p) => typeof p === 'string' && E164_RE.test(p))
  const draft: ChatwootContactDraft = { name, email: base.primaryEmail, emails: base.emails, phones }
  if (phones.length > 0) draft.phone_number = phones[0]
  if (person.identity.user_id) draft.identifier = person.identity.user_id
  return draft
}
