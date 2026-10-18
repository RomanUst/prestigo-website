/**
 * Pure mapping from Supabase rows (inquiries, bookings) to EspoCRM Lead payloads.
 *
 * No I/O: no database client, no network, no env access, no clock reads (callers pass `now`).
 * The dispatcher (lib/lead-sync.ts) applies these drafts; the CRM config plans create
 * exactly the attribute names and source values fixed here.
 *
 * Lead identity is the source-qualified reference `cSupabaseRef`:
 *   inquiry:<inquiry uuid>  |  booking:<outbound booking uuid>
 */

import { normalizePhone } from '@/lib/phone'

// ── Fixed CRM names ────────────────────────────────────────────────────────

export const LEAD_ATTR = {
  supabaseRef: 'cSupabaseRef',
  bookingReference: 'cBookingReference',
  returnBookingReference: 'cReturnBookingReference',
  adminLink: 'cAdminLink',
  existingCustomer: 'cExistingCustomer',
  existingContactId: 'cExistingContactId',
} as const

export const LEAD_SOURCE = {
  websiteBooking: 'Website booking',
  gnet: 'GNet',
  contactForm: 'Contact form',
  corporateForm: 'Corporate form',
  multidayQuote: 'Multi-day quote',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  email: 'Email',
  partner: 'Partner',
  other: 'Other',
} as const

export type LeadStatusKey = 'new' | 'in_process' | 'converted' | 'dead'

export const LEAD_STATUS_VALUE: Record<LeadStatusKey, 'New' | 'In Process' | 'Converted' | 'Dead'> = {
  new: 'New',
  in_process: 'In Process',
  converted: 'Converted',
  dead: 'Dead',
}

/** Exactly the 8 booking statuses of migration 053 (D-06). */
export const BOOKING_LEAD_STATUS: Readonly<Record<string, LeadStatusKey>> = {
  unpaid: 'new',
  pending: 'in_process',
  confirmed: 'converted',
  assigned: 'converted',
  en_route: 'converted',
  on_location: 'converted',
  completed: 'converted',
  cancelled: 'dead',
}

// ── Input / output types ───────────────────────────────────────────────────

export interface InquiryRow {
  id: string
  kind: 'contact' | 'corporate' | 'multiday_quote'
  email: string
  name: string | null
  phone: string | null
  company: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface BookingRow {
  id: string
  booking_reference: string | null
  status: string
  booking_source: 'online' | 'manual' | 'gnet'
  lead_channel: 'whatsapp' | 'phone' | 'email' | 'partner' | 'other' | null
  leg: 'outbound' | 'return' | null
  trip_type: string | null
  payment_link_id: string | null
  pickup_utc: string | null
  pickup_date: string | null
  pickup_time: string | null
  origin_address: string | null
  destination_address: string | null
  vehicle_class: string | null
  passengers: number | null
  hours: number | null
  amount_eur: number | string | null
  client_first_name: string | null
  client_last_name: string | null
  client_email: string | null
  client_phone: string | null
  created_at: string
}

export type ReturnLegInfo = { id: string; booking_reference: string | null } | null

export interface LeadDraft {
  ref: string
  email: string | null
  create: Record<string, unknown>
  syncOwned: Record<string, unknown>
}

// ── Status and source ──────────────────────────────────────────────────────

const has = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key)

/** D-06 table plus D-03: an unpaid booking whose pickup already passed is dead. */
export function bookingLeadStatus(status: string, pickupUtc: string | null, now: Date): LeadStatusKey | null {
  if (!has(BOOKING_LEAD_STATUS, status)) return null
  const key = BOOKING_LEAD_STATUS[status]
  if (status === 'unpaid' && pickupUtc) {
    const pickup = Date.parse(pickupUtc)
    if (!Number.isNaN(pickup) && pickup < now.getTime()) return 'dead'
  }
  return key
}

const CHANNEL_SOURCE: Record<string, string> = {
  whatsapp: LEAD_SOURCE.whatsapp,
  phone: LEAD_SOURCE.phone,
  email: LEAD_SOURCE.email,
  partner: LEAD_SOURCE.partner,
  other: LEAD_SOURCE.other,
}

/** D-08. */
export function leadSourceForBooking(bookingSource: string, leadChannel: string | null): string {
  if (bookingSource === 'online') return LEAD_SOURCE.websiteBooking
  if (bookingSource === 'gnet') return LEAD_SOURCE.gnet
  if (leadChannel && has(CHANNEL_SOURCE, leadChannel)) return CHANNEL_SOURCE[leadChannel]
  return LEAD_SOURCE.other
}

export function leadSourceForInquiry(kind: InquiryRow['kind']): string {
  if (kind === 'corporate') return LEAD_SOURCE.corporateForm
  if (kind === 'multiday_quote') return LEAD_SOURCE.multidayQuote
  return LEAD_SOURCE.contactForm
}

// ── Reference ──────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function leadRefForInquiry(id: string): string {
  return `inquiry:${id}`
}

export function leadRefForBooking(id: string): string {
  return `booking:${id}`
}

export function parseLeadRef(ref: string): { kind: 'inquiry' | 'booking'; id: string } | null {
  if (typeof ref !== 'string') return null
  const sep = ref.indexOf(':')
  if (sep < 0) return null
  const kind = ref.slice(0, sep)
  const id = ref.slice(sep + 1)
  if (kind !== 'inquiry' && kind !== 'booking') return null
  if (!UUID_RE.test(id)) return null
  return { kind, id }
}

// ── Contact data ───────────────────────────────────────────────────────────

/** Trim + lowercase; null for blank, no '@', or the GNet placeholder domain. */
export function normalizeLeadEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email === '' || !email.includes('@')) return null
  if (email.endsWith('@gnet.local')) return null
  return email
}

/** E.164 via lib/phone.ts; placeholders such as 'unknown' are rejected there. */
export function leadPhone(raw: string | null | undefined): string | null {
  return normalizePhone(raw)
}

const NAME_MAX = 100

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Split at the first whitespace; a single token is the last name.
 * Empty -> email local part -> 'Unknown'.
 */
export function splitName(
  full: string | null,
  email: string | null,
): { firstName: string | null; lastName: string } {
  const name = clean(full)
  if (name === '') {
    const local = email && email.includes('@') ? email.split('@')[0] : ''
    return { firstName: null, lastName: (local || 'Unknown').slice(0, NAME_MAX) }
  }
  const m = /^(\S+)\s+([\s\S]+)$/.exec(name)
  if (!m) return { firstName: null, lastName: name.slice(0, NAME_MAX) }
  return { firstName: m[1].slice(0, NAME_MAX), lastName: m[2].trim().slice(0, NAME_MAX) }
}

/** Booking names are already split; fall back like splitName when the last name is missing. */
function bookingName(
  first: string | null,
  last: string | null,
  email: string | null,
): { firstName: string | null; lastName: string } {
  const f = clean(first)
  const l = clean(last)
  if (l !== '') return { firstName: f === '' ? null : f.slice(0, NAME_MAX), lastName: l.slice(0, NAME_MAX) }
  return splitName(f, email)
}

// ── Admin link ─────────────────────────────────────────────────────────────

const ADMIN_BOOKINGS_URL = 'https://rideprestigo.com/admin/bookings'
const REFERENCE_RE = /^[A-Za-z0-9-]{1,40}$/

/** T-81-05: only allowlisted references become a deep link. */
export function adminLink(reference: string | null): string | null {
  if (typeof reference !== 'string' || !REFERENCE_RE.test(reference)) return null
  return `${ADMIN_BOOKINGS_URL}?search=${encodeURIComponent(reference)}`
}

// ── Descriptions ───────────────────────────────────────────────────────────

const VEHICLE_LABEL: Record<string, string> = {
  business: 'E-Class',
  first_class: 'S-Class',
  business_van: 'V-Class',
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function contactDescription(payload: Record<string, unknown>): string {
  const lines: string[] = []
  const service = str(payload.service)
  const message = str(payload.message)
  if (service) lines.push(`Service: ${service}`)
  if (message) lines.push(`Message: ${message}`)
  return lines.join('\n')
}

function bookingDescription(row: BookingRow, returnRef: string | null): string {
  const lines: string[] = []
  if (row.booking_reference) lines.push(`Booking reference: ${row.booking_reference}`)
  if (returnRef) lines.push(`Return booking reference: ${returnRef}`)
  if (row.trip_type) lines.push(`Trip type: ${row.trip_type}`)
  const when = [row.pickup_date, row.pickup_time].filter(Boolean).join(' ') || row.pickup_utc || ''
  if (when) lines.push(`Pickup: ${when}`)
  if (row.origin_address || row.destination_address) {
    lines.push(`Route: ${row.origin_address ?? '?'} -> ${row.destination_address ?? '?'}`)
  }
  if (row.hours != null) lines.push(`Hours: ${row.hours}`)
  if (row.vehicle_class) lines.push(`Vehicle: ${VEHICLE_LABEL[row.vehicle_class] ?? row.vehicle_class}`)
  if (row.passengers != null) lines.push(`Passengers: ${row.passengers}`)
  return lines.join('\n')
}

// ── Builders ───────────────────────────────────────────────────────────────

export function buildLeadFromInquiry(row: InquiryRow): LeadDraft {
  const ref = leadRefForInquiry(row.id)
  const email = normalizeLeadEmail(row.email)
  const phone = leadPhone(row.phone)
  const { firstName, lastName } = splitName(row.name, email)
  const create: Record<string, unknown> = {
    [LEAD_ATTR.supabaseRef]: ref,
    status: LEAD_STATUS_VALUE.new,
    source: leadSourceForInquiry(row.kind),
    firstName,
    lastName,
    description: contactDescription(row.payload ?? {}),
  }
  if (email) create.emailAddress = email
  if (phone) create.phoneNumber = phone
  return { ref, email, create, syncOwned: {} }
}

export function buildLeadFromBooking(row: BookingRow, returnLeg: ReturnLegInfo, now: Date): LeadDraft | null {
  if (row.leg === 'return') return null
  const statusKey = bookingLeadStatus(row.status, row.pickup_utc, now)
  if (statusKey === null) return null

  const ref = leadRefForBooking(row.id)
  const email = normalizeLeadEmail(row.client_email)
  const phone = leadPhone(row.client_phone)
  const { firstName, lastName } = bookingName(row.client_first_name, row.client_last_name, email)
  const returnRef = returnLeg?.booking_reference ?? null

  const syncOwned: Record<string, unknown> = { status: LEAD_STATUS_VALUE[statusKey] }
  if (row.amount_eur != null && String(row.amount_eur).trim() !== '' && Number.isFinite(Number(row.amount_eur))) {
    syncOwned.opportunityAmount = Number(row.amount_eur)
    syncOwned.opportunityAmountCurrency = 'EUR'
  }
  if (row.booking_reference) syncOwned[LEAD_ATTR.bookingReference] = row.booking_reference
  if (returnRef) syncOwned[LEAD_ATTR.returnBookingReference] = returnRef
  const link = adminLink(row.booking_reference)
  if (link) syncOwned[LEAD_ATTR.adminLink] = link

  const create: Record<string, unknown> = {
    ...syncOwned,
    [LEAD_ATTR.supabaseRef]: ref,
    source: leadSourceForBooking(row.booking_source, row.lead_channel),
    firstName,
    lastName,
    description: bookingDescription(row, returnRef),
  }
  if (email) create.emailAddress = email
  if (phone) create.phoneNumber = phone
  return { ref, email, create, syncOwned }
}
