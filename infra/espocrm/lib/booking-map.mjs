// Pure module: Supabase booking export row -> EspoCRM CBooking / Contact payload.
//
// No I/O, no network, no file access (the backfill in plan 80-09 owns those).
// Mirrors the lib/currency.ts constants (pinned by tests/espocrm-booking-map.test.ts)
// and uses enum values verbatim from the DB: status from migration 053, source from
// migration 039, vehicleClass and tripType from types/booking.ts (all pinned by tests).
//
// Decisions: D-06..D-10 (CBooking fields), D-07 (keys), D-18 (admin link),
// D-21 (payment method + abandoned-checkout exclusion).

// --- Enum / constant pins ---------------------------------------------------

export const CZK_TO_EUR_RATE = 0.04
export const EUR_TO_CZK_RATE = 25

export const BOOKING_STATUS_VALUES = [
  'unpaid',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'assigned',
  'en_route',
  'on_location',
]
export const BOOKING_SOURCE_VALUES = ['online', 'manual', 'gnet']
export const VEHICLE_CLASS_VALUES = ['business', 'first_class', 'business_van']
export const TRIP_TYPE_VALUES = ['transfer', 'hourly', 'daily', 'round_trip']
export const LEG_VALUES = ['', 'outbound', 'return']
export const PAYMENT_METHOD_VALUES = ['Stripe', 'Invoice', 'Cash', 'Other']

export const PAYMENT_METHOD_RULE =
  'payment_intent_id -> Stripe; payment_link_id -> Stripe; invoice_number -> Invoice; source gnet -> Other; source manual -> Cash; otherwise Other'

export const FIELD_MAX_LENGTH = {
  supabaseBookingId: 36,
  pickup: 255,
  dropoff: 255,
  passengerName: 150,
  flightNumber: 20,
  driverName: 100,
}

export const ADMIN_BOOKINGS_URL = 'https://rideprestigo.com/admin/bookings'

// Payload keys written by rowToBooking (the backfill diffs exactly these).
// contactId / accountId are added by the backfill, not here.
export const SYNCED_BOOKING_FIELDS = [
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
]

export class BookingMapError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BookingMapError'
    this.code = code
  }
}

// --- Helpers ----------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** D-07: the Contact key is the trimmed, lower-cased email. */
export function normalizeEmail(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLowerCase()
}

/** String, strip control characters (U+0000-U+001F, U+007F), trim, cut to max. */
export function sanitizeText(value, max) {
  if (value === null || value === undefined) return ''
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return typeof max === 'number' ? cleaned.slice(0, max) : cleaned
}

/** Identical to czkToEur in lib/currency.ts. */
export function czkToEur(czk) {
  return Math.round(czk * CZK_TO_EUR_RATE)
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === ''
const isNil = (v) => v === null || v === undefined

/** amount_eur when present; else czkToEur(amount_czk); null when both are missing (never 0). */
export function amountEur(row) {
  if (!isNil(row.amount_eur) && row.amount_eur !== '' && Number.isFinite(Number(row.amount_eur))) {
    return Number(row.amount_eur)
  }
  if (!isNil(row.amount_czk) && row.amount_czk !== '' && Number.isFinite(Number(row.amount_czk))) {
    return czkToEur(Number(row.amount_czk))
  }
  return null
}

/** Missing source counts as online. */
function sourceOf(row) {
  return isBlank(row.booking_source) ? 'online' : row.booking_source
}

/**
 * D-08/D-21: abandoned checkout = status 'unpaid' AND source online (missing counts
 * as online) AND no payment_link_id. Such rows are excluded from the CRM.
 */
export function isAbandonedCheckout(row) {
  return row.status === 'unpaid' && sourceOf(row) === 'online' && isBlank(row.payment_link_id)
}

/** D-21 payment method, rule order documented in PAYMENT_METHOD_RULE. */
export function inferPaymentMethod(row) {
  if (!isBlank(row.payment_intent_id)) return 'Stripe'
  if (!isBlank(row.payment_link_id)) return 'Stripe'
  if (!isBlank(row.invoice_number)) return 'Invoice'
  const source = sourceOf(row)
  if (source === 'gnet') return 'Other'
  if (source === 'manual') return 'Cash'
  return 'Other'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatUtc(date) {
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
function pragueOffsetMs(instantMs) {
  const p = {}
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
 * Convert a Europe/Prague wall-clock time to a UTC instant (ms), or null when the
 * inputs are malformed. Handles DST without a date library: the possible offsets are
 * sampled a day either side, and each candidate is kept only if it round-trips.
 * Repeated hour (autumn switch): the EARLIER instant (summer time) is chosen.
 * Skipped hour (spring switch): the pre-switch offset is applied, i.e. the time
 * rolls forward by one hour.
 */
function pragueLocalToUtcMs(dateStr, timeStr) {
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

/**
 * Pickup instant as 'YYYY-MM-DD HH:mm:ss' UTC. pickup_utc wins when present;
 * otherwise pickup_date + pickup_time are read as Europe/Prague local time.
 * Null when neither is usable.
 */
export function pickupAtUtc(row) {
  if (!isBlank(row.pickup_utc)) {
    const d = new Date(row.pickup_utc)
    if (!Number.isNaN(d.getTime())) return formatUtc(d)
  }
  const ms = pragueLocalToUtcMs(row.pickup_date, row.pickup_time)
  return ms === null ? null : formatUtc(new Date(ms))
}

/** D-18: admin deep link, reference is URL-encoded. */
export function buildAdminLink(reference) {
  return `${ADMIN_BOOKINGS_URL}?search=${encodeURIComponent(String(reference))}`
}

const E164_RE = /^\+[1-9]\d{7,14}$/
const DEFAULT_COUNTRY_PREFIX = '+420'

// Known country calling codes for bare 11-12 digit numbers ("4915123456789" -> "+4915123456789").
export const KNOWN_CALLING_CODES = [
  '420', '421', '43', '44', '49', '48', '36', '33', '39', '34', '31', '32', '41',
  '1', '7', '380', '972', '971', '90', '86', '81', '82', '91',
]

/**
 * Contact-only phone normaliser (EspoCRM rejects numbers without an international
 * prefix with {"field":"phoneNumber","type":"valid"}). The booking keeps the original.
 *
 * DELIBERATE DIVERGENCE from lib/phone.ts (owner decision, Phase 80 review WR-08): the site
 * form rejects a number without a country code ("rejected rather than guessed"), but legacy
 * bookings pre-date that rule and the CRM backfill must still give the owner a callable Contact.
 * So this one-time tool DOES guess for legacy rows: a bare 9-digit number becomes +420 and a bare
 * 11-12 digit number that starts with a known calling code gets a "+". The owner approved this
 * for the backfill only; do not copy it into lib/phone.ts or the live booking flow, and see
 * infra/espocrm/README.md ("Contact phone numbers"). Prefixed numbers are counted in the
 * contact_phones line (prefixed=N) so the owner can review them. A phone is written to a
 * Contact only while its phoneNumber is empty, so a wrong guess is fixed by editing the Contact.
 *
 * Returns { phone, kind }:
 *   kept     - already international (E.164, or 00-prefixed converted to +); phone is the cleaned value
 *   prefixed - bare digits made international (9 digits -> +420, 11-12 digits with a known calling code -> +)
 *   omitted  - no usable number (kind 'empty' when blank, 'unrecognized' otherwise); phone is null
 */
export function normalizeContactPhone(value) {
  const raw = sanitizeText(value, 50)
  if (raw === '') return { phone: null, kind: 'omitted', reason: 'empty' }
  // "(0)" is the optional national trunk digit ("+44 (0) 20 ..."): drop it, or the 0 stays in the number.
  // Then strip spaces, dashes, dots and parentheses; leading 00 means "+".
  let s = raw.replace(/\(\s*0\s*\)/g, '').replace(/[\s\-.()]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (s.startsWith('+')) {
    return E164_RE.test(s)
      ? { phone: s, kind: 'kept' }
      : { phone: null, kind: 'omitted', reason: 'unrecognized' }
  }
  if (!/^\d+$/.test(s)) return { phone: null, kind: 'omitted', reason: 'unrecognized' }
  if (s.length === 9) {
    const phone = `${DEFAULT_COUNTRY_PREFIX}${s}`
    if (E164_RE.test(phone)) return { phone, kind: 'prefixed' }
  } else if (s.length >= 11 && s.length <= 12 && KNOWN_CALLING_CODES.some((cc) => s.startsWith(cc))) {
    const phone = `+${s}`
    if (E164_RE.test(phone)) return { phone, kind: 'prefixed' }
  }
  return { phone: null, kind: 'omitted', reason: 'unrecognized' }
}

/**
 * Contact payload, or null when the row has no valid email. phoneNumber is the
 * normalised number and is OMITTED when no usable number exists.
 */
export function rowToContact(row) {
  const email = normalizeEmail(row.client_email)
  if (!EMAIL_RE.test(email)) return null
  const firstName = sanitizeText(row.client_first_name, 100)
  const lastNameRaw = sanitizeText(row.client_last_name, 100)
  const lastName = lastNameRaw || firstName || email.split('@')[0]
  const payload = { firstName, lastName, emailAddress: email }
  const { phone } = normalizeContactPhone(row.client_phone)
  if (phone) payload.phoneNumber = phone
  return payload
}

/** CBooking payload. Throws BookingMapError for values outside the pinned enums. */
export function rowToBooking(row) {
  if (isBlank(row.id)) throw new BookingMapError('missing_id', 'row has no id')
  if (!BOOKING_STATUS_VALUES.includes(row.status)) {
    throw new BookingMapError('unknown_status', `unknown status: ${row.status}`)
  }
  const source = sourceOf(row)
  if (!BOOKING_SOURCE_VALUES.includes(source)) {
    throw new BookingMapError('unknown_source', `unknown source: ${row.booking_source}`)
  }
  const leg = isBlank(row.leg) ? '' : row.leg
  if (!LEG_VALUES.includes(leg)) {
    throw new BookingMapError('unknown_leg', `unknown leg: ${row.leg}`)
  }
  if (!TRIP_TYPE_VALUES.includes(row.trip_type)) {
    throw new BookingMapError('unknown_trip_type', `unknown trip_type: ${row.trip_type}`)
  }
  if (!VEHICLE_CLASS_VALUES.includes(row.vehicle_class)) {
    throw new BookingMapError('unknown_vehicle_class', `unknown vehicle_class: ${row.vehicle_class}`)
  }
  const passenger = [sanitizeText(row.client_first_name), sanitizeText(row.client_last_name)]
    .filter(Boolean)
    .join(' ')
  const reference = sanitizeText(row.booking_reference)
  return {
    name: reference,
    supabaseBookingId: sanitizeText(row.id, FIELD_MAX_LENGTH.supabaseBookingId),
    leg,
    pickupAt: pickupAtUtc(row),
    pickup: sanitizeText(row.origin_address, FIELD_MAX_LENGTH.pickup),
    dropoff: sanitizeText(row.destination_address, FIELD_MAX_LENGTH.dropoff),
    tripType: row.trip_type,
    vehicleClass: row.vehicle_class,
    status: row.status,
    amount: amountEur(row),
    amountCurrency: 'EUR',
    paymentMethod: inferPaymentMethod(row),
    passengerName: passenger.slice(0, FIELD_MAX_LENGTH.passengerName),
    flightNumber: sanitizeText(row.flight_number, FIELD_MAX_LENGTH.flightNumber),
    driverName: sanitizeText(row.driver_name, FIELD_MAX_LENGTH.driverName),
    source,
    adminLink: buildAdminLink(reference),
  }
}
