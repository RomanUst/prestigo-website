import type { CrmBookingRecord, PersonRecord } from '@/lib/identity-store'
import { E164_RE } from '@/lib/phone'
import { splitName } from '@/lib/lead-mapping'

/**
 * Pure mapping Supabase -> EspoCRM CBooking / Contact (Phase 82, plan 82-07). No env, no I/O.
 *
 * The CBooking half is a TypeScript port of the Phase 80 backfill mapper (rowToBooking in
 * infra/espocrm/lib/booking-map.mjs); tests/customer-mapping-parity.test.ts pins both to the same
 * output so live sync and backfill write identical values. Library code never imports infra code.
 *
 * NOT ported on purpose: the backfill phone normaliser (it guesses +420 for bare numbers). The live
 * sync only ever sends E.164 numbers that identity_person already vetted (no shared phones).
 */

export const CBOOKING_SYNCED_FIELDS = [
  'name',
  'supabaseBookingId',
  'leg',
  'pickupAt',
  'pickup',
  'dropoff',
  'tripType',
  'vehicleClass',
  'status',
  'amount',
  'amountCurrency',
  'paymentMethod',
  'passengerName',
  'flightNumber',
  'driverName',
  'source',
  'adminLink',
] as const

export interface CBookingDraft {
  name: string
  supabaseBookingId: string
  leg: string
  pickupAt: string | null
  pickup: string
  dropoff: string
  tripType: string
  vehicleClass: string
  status: string
  amount: number | null
  amountCurrency: 'EUR'
  paymentMethod: string
  passengerName: string
  flightNumber: string
  driverName: string
  source: string
  adminLink: string
}

export type CBookingResult = { ok: true; draft: CBookingDraft } | { ok: false; code: 'booking_unmapped' }

// ── Enum pins (same values as the Phase 80 mapper, which pins them against migrations/types) ──

const BOOKING_STATUS_VALUES = [
  'unpaid',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'assigned',
  'en_route',
  'on_location',
]
const BOOKING_SOURCE_VALUES = ['online', 'manual', 'gnet']
const VEHICLE_CLASS_VALUES = ['business', 'first_class', 'business_van']
const TRIP_TYPE_VALUES = ['transfer', 'hourly', 'daily', 'round_trip']
const LEG_VALUES = ['', 'outbound', 'return']

const FIELD_MAX_LENGTH = {
  supabaseBookingId: 36,
  pickup: 255,
  dropoff: 255,
  passengerName: 150,
  flightNumber: 20,
  driverName: 100,
}

const CZK_TO_EUR_RATE = 0.04
const ADMIN_BOOKINGS_URL = 'https://rideprestigo.com/admin/bookings'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** String, strip control characters (U+0000-U+001F, U+007F), trim, cut to max. */
function sanitizeText(value: unknown, max?: number): string {
  if (value === null || value === undefined) return ''
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return typeof max === 'number' ? cleaned.slice(0, max) : cleaned
}

const isNil = (v: unknown): boolean => v === null || v === undefined
const isBlank = (v: unknown): boolean => isNil(v) || String(v).trim() === ''

function amountEur(row: CrmBookingRecord): number | null {
  const eur: unknown = row.amount_eur
  if (!isNil(eur) && eur !== '' && Number.isFinite(Number(eur))) return Number(eur)
  const czk: unknown = row.amount_czk
  if (!isNil(czk) && czk !== '' && Number.isFinite(Number(czk))) return Math.round(Number(czk) * CZK_TO_EUR_RATE)
  return null
}

function sourceOf(row: CrmBookingRecord): string {
  return isBlank(row.booking_source) ? 'online' : row.booking_source
}

function inferPaymentMethod(row: CrmBookingRecord): string {
  if (!isBlank(row.payment_intent_id)) return 'Stripe'
  if (!isBlank(row.payment_link_id)) return 'Stripe'
  if (!isBlank(row.invoice_number)) return 'Invoice'
  const source = sourceOf(row)
  if (source === 'gnet') return 'Other'
  if (source === 'manual') return 'Cash'
  return 'Other'
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  )
}

const PRAGUE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Europe/Prague UTC offset in ms (local wall clock minus UTC) at the given instant. */
function pragueOffsetMs(instantMs: number): number {
  const p: Record<string, string> = {}
  for (const part of PRAGUE_PARTS.formatToParts(new Date(instantMs))) p[part.type] = part.value
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Europe/Prague wall-clock time -> UTC instant (ms), or null for malformed input. Repeated hour
 * (autumn switch): the earlier instant. Skipped hour (spring switch): rolls forward by one hour.
 */
function pragueLocalToUtcMs(dateStr: unknown, timeStr: unknown): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? '').trim())
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(timeStr ?? '').trim())
  if (!d || !t) return null
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [h, mi, s] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59 || s > 59) return null
  const naive = Date.UTC(y, mo - 1, da, h, mi, s)
  const check = new Date(naive)
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null
  const offsets = [...new Set([pragueOffsetMs(naive - DAY_MS), pragueOffsetMs(naive + DAY_MS)])]
  const valid = offsets.map((o) => naive - o).filter((c) => pragueOffsetMs(c) === naive - c)
  if (valid.length > 0) return Math.min(...valid)
  return naive - Math.min(...offsets)
}

/** pickup_utc wins when present; otherwise pickup_date + pickup_time are Europe/Prague local time. */
function pickupAtUtc(row: CrmBookingRecord): string | null {
  if (!isBlank(row.pickup_utc)) {
    const d = new Date(row.pickup_utc as string)
    if (!Number.isNaN(d.getTime())) return formatUtc(d)
  }
  const ms = pragueLocalToUtcMs(row.pickup_date, row.pickup_time)
  return ms === null ? null : formatUtc(new Date(ms))
}

function buildAdminLink(reference: string): string {
  return `${ADMIN_BOOKINGS_URL}?search=${encodeURIComponent(reference)}`
}

// ── CBooking ────────────────────────────────────────────────────────────────

/**
 * rowToBooking semantics. A value outside the pinned enums is `booking_unmapped` (the caller skips
 * that booking, writes the others and fails the row loudly). D-08: an anonymised booking keeps its
 * accounting fields and loses the customer-entered text.
 */
export function buildCBookingDraft(row: CrmBookingRecord): CBookingResult {
  const unmapped = { ok: false, code: 'booking_unmapped' } as const
  if (isBlank(row.id)) return unmapped
  if (!BOOKING_STATUS_VALUES.includes(row.status)) return unmapped
  const source = sourceOf(row)
  if (!BOOKING_SOURCE_VALUES.includes(source)) return unmapped
  const leg = isBlank(row.leg) ? '' : row.leg
  if (!LEG_VALUES.includes(leg)) return unmapped
  if (!TRIP_TYPE_VALUES.includes(row.trip_type)) return unmapped
  if (!VEHICLE_CLASS_VALUES.includes(row.vehicle_class)) return unmapped

  const anonymised = !isBlank(row.anonymised_at)
  const passenger = [sanitizeText(row.client_first_name), sanitizeText(row.client_last_name)]
    .filter(Boolean)
    .join(' ')
  const reference = sanitizeText(row.booking_reference)
  return {
    ok: true,
    draft: {
      name: reference,
      supabaseBookingId: sanitizeText(row.id, FIELD_MAX_LENGTH.supabaseBookingId),
      leg,
      pickupAt: pickupAtUtc(row),
      pickup: anonymised ? '' : sanitizeText(row.origin_address, FIELD_MAX_LENGTH.pickup),
      dropoff: anonymised ? '' : sanitizeText(row.destination_address, FIELD_MAX_LENGTH.dropoff),
      tripType: row.trip_type,
      vehicleClass: row.vehicle_class,
      status: row.status,
      amount: amountEur(row),
      amountCurrency: 'EUR',
      paymentMethod: inferPaymentMethod(row),
      passengerName: anonymised ? '' : passenger.slice(0, FIELD_MAX_LENGTH.passengerName),
      flightNumber: anonymised ? '' : sanitizeText(row.flight_number, FIELD_MAX_LENGTH.flightNumber),
      driverName: sanitizeText(row.driver_name, FIELD_MAX_LENGTH.driverName),
      source,
      adminLink: buildAdminLink(reference),
    },
  }
}

// ── Contact ─────────────────────────────────────────────────────────────────

export interface ContactDraft {
  firstName: string | null
  lastName: string
  /** Primary first; every identity email, lower-cased. */
  emails: string[]
  primaryEmail: string
  /** E.164 only; never guessed. */
  phoneNumber: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_MAX = 100

function cleanName(value: string | null | undefined): string {
  return sanitizeText(value, NAME_MAX)
}

/**
 * The Contact the identity should have. firstName/lastName are used on CREATE only (the sync never
 * overwrites an existing Contact's names); phoneNumber is used on create and when the live phone is
 * empty. Null when the person has no usable email.
 */
export function buildContactDraft(person: PersonRecord): ContactDraft | null {
  const seen = new Set<string>()
  const entries: Array<{ email: string; basis: string }> = []
  for (const e of person.emails) {
    const email = typeof e.email === 'string' ? e.email.trim().toLowerCase() : ''
    if (!EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    entries.push({ email, basis: e.basis })
  }
  if (entries.length === 0) return null

  const primaryEntry = entries.find((e) => e.basis !== 'phone') ?? entries[0]
  const primaryEmail = primaryEntry.email
  const emails = [primaryEmail, ...entries.filter((e) => e.email !== primaryEmail).map((e) => e.email)]

  let firstName: string | null
  let lastName: string
  const fullName = person.profile?.full_name
  if (typeof fullName === 'string' && fullName.trim() !== '') {
    const split = splitName(sanitizeText(fullName, 200), primaryEmail)
    firstName = split.firstName
    lastName = split.lastName
  } else {
    const newest = person.bookings.length > 0 ? person.bookings[person.bookings.length - 1] : null
    const first = newest ? cleanName(newest.client_first_name) : ''
    const last = newest ? cleanName(newest.client_last_name) : ''
    firstName = first === '' ? null : first
    lastName = last || first || primaryEmail.split('@')[0]
  }

  const phone = person.phones.find((p) => typeof p === 'string' && E164_RE.test(p)) ?? null
  return { firstName, lastName, emails, primaryEmail, phoneNumber: phone }
}
