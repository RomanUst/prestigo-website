import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { bookingLeadAmountEur, type BookingRow } from '@/lib/lead-mapping'
import type { PanelBooking, PanelResponse, PaymentState } from '@/lib/panel-dto'
import { adminBookingHref, espoLeadUrl, isSafePaymentLinkUrl } from '@/lib/panel-links'

// Read-only data layer of the Chatwoot Dashboard App (Phase 84, plan 84-01). Server only.
// The ONLY database call is the SECURITY DEFINER RPC panel_bookings (migration 080), which resolves
// the contact through the Phase 82 identity tables and returns an allowlisted projection. This
// module never normalises or compares contact strings itself (the SQL helpers own that) and never
// writes. Messages and payloads of database errors are never kept.

export class PanelStoreError extends Error {
  readonly code = 'db_error' as const
  constructor() {
    super('db_error')
    this.name = 'PanelStoreError'
  }
}

/** Statuses whose value counts towards the spent total; mirrors VALUE_STATUSES in chatwoot-mapping. */
export const PANEL_VALUE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'assigned',
  'en_route',
  'on_location',
  'completed',
])

const nullableString = z.string().nullable()
const nullableNumber = z.number().nullable()

const rowSchema = z.object({
  id: z.string(),
  booking_reference: nullableString,
  status: z.string(),
  leg: z.string(),
  trip_type: z.string(),
  pickup_utc: nullableString,
  pickup_date: z.string(),
  pickup_time: z.string(),
  origin_address: nullableString,
  destination_address: nullableString,
  hours: nullableNumber,
  vehicle_class: z.string(),
  passengers: z.number(),
  luggage: z.number(),
  amount_eur: nullableNumber,
  outbound_amount_czk: nullableNumber,
  return_amount_czk: nullableNumber,
  paid_at: nullableString,
  payment_link_url: nullableString,
  flight_number: nullableString,
  special_requests: nullableString,
  driver_name: nullableString,
  trip_progress: nullableString,
  trip_progress_updated_at: nullableString,
})

const resultSchema = z.object({
  identity_found: z.boolean(),
  phone_mismatch: z.boolean(),
  espo_lead_id: nullableString,
  total: z.number(),
  trip_count: z.number(),
  spent_eur: z.number(),
  rows: z.array(rowSchema),
})

export type PanelRpcRow = z.infer<typeof rowSchema>
export type PanelRpcResult = z.infer<typeof resultSchema>

export interface PanelBookingsStore {
  load(input: { email: string | null; phone: string | null; conversationId: number }): Promise<PanelRpcResult>
}

export function createPanelBookingsStore(client?: SupabaseClient): PanelBookingsStore {
  // Built lazily inside the try so a missing env var surfaces as a store error, not a crash.
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()

  return {
    async load({ email, phone, conversationId }) {
      let data: unknown
      try {
        const res = await db().rpc('panel_bookings', {
          p_email: email,
          p_phone: phone,
          p_conversation_id: conversationId,
        })
        if (res.error) throw new Error('rpc')
        data = res.data
      } catch {
        throw new PanelStoreError()
      }
      const parsed = resultSchema.safeParse(data)
      if (!parsed.success) throw new PanelStoreError()
      return parsed.data
    },
  }
}

// ── Payment state ──────────────────────────────────────────────────────────

/** RESEARCH A1: cancelled, then paid_at, then unpaid / pending; every other status counts as paid. */
export function paymentState(status: string, paidAt: string | null): PaymentState {
  if (status === 'cancelled') return 'cancelled'
  if (paidAt) return 'paid'
  if (status === 'unpaid') return 'awaiting_payment'
  if (status === 'pending') return 'quote'
  return 'paid'
}

// ── Pickup instant ─────────────────────────────────────────────────────────

const PRAGUE_TZ = 'Europe/Prague'
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})/

const pragueParts = new Intl.DateTimeFormat('en-US', {
  timeZone: PRAGUE_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of Europe/Prague from UTC at the given instant, in ms (positive east of Greenwich). */
function pragueOffsetMs(utcMs: number): number {
  const parts: Record<string, number> = {}
  for (const p of pragueParts.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * The pickup instant: pickup_utc when present and valid, else the Europe/Prague wall clock of
 * pickup_date (YYYY-MM-DD) + pickup_time (HH:MM). Null when neither parses; never throws.
 */
export function pickupInstantMs(row: {
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
}): number | null {
  if (row.pickup_utc) {
    const ms = Date.parse(row.pickup_utc)
    if (Number.isFinite(ms)) return ms
  }
  const d = DATE_RE.exec(row.pickup_date ?? '')
  const t = TIME_RE.exec(row.pickup_time ?? '')
  if (!d || !t) return null
  const [year, month, day, hour, minute] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // Reject impossible calendar dates (31 February): Date.UTC would roll them over.
  const check = new Date(wall)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  const first = pragueOffsetMs(wall)
  let instant = wall - first
  const second = pragueOffsetMs(instant)
  if (second !== first) instant = wall - second
  return instant
}

// ── Mapping ────────────────────────────────────────────────────────────────

function textOrNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function mapBooking(row: PanelRpcRow): PanelBooking {
  const state = paymentState(row.status, row.paid_at)
  return {
    id: row.id,
    reference: row.booking_reference,
    status: row.status,
    paymentState: state,
    isReturnLeg: row.leg === 'return',
    pickupUtc: row.pickup_utc,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    pickupMs: pickupInstantMs(row),
    origin: row.origin_address ?? '',
    destination: textOrNull(row.destination_address),
    hours: row.hours,
    vehicleClass: row.vehicle_class,
    passengers: row.passengers,
    luggage: row.luggage,
    // bookingLeadAmountEur reads only amount_eur, trip_type and the two per-leg CZK amounts.
    amountEur: bookingLeadAmountEur(row as unknown as BookingRow),
    driverName: textOrNull(row.driver_name),
    tripProgress: row.trip_progress,
    flightNumber: textOrNull(row.flight_number),
    notes: textOrNull(row.special_requests),
    paymentLinkUrl:
      state === 'awaiting_payment' && isSafePaymentLinkUrl(row.payment_link_url) ? row.payment_link_url : null,
    adminHref: adminBookingHref(row.booking_reference),
  }
}

interface PanelContact {
  email: string | null
  phone: string | null
  verified: boolean
}

export function buildPanelResponse(
  rpc: PanelRpcResult,
  contact: PanelContact,
  now: Date,
  links: { espoBaseUrl: string | null },
): PanelResponse {
  const nowMs = now.getTime()
  const upcoming: PanelBooking[] = []
  const past: PanelBooking[] = []
  for (const row of rpc.rows) {
    const booking = mapBooking(row)
    const isUpcoming =
      booking.pickupMs !== null &&
      booking.pickupMs >= nowMs &&
      booking.status !== 'cancelled' &&
      booking.status !== 'completed'
    ;(isUpcoming ? upcoming : past).push(booking)
  }
  upcoming.sort((a, b) => (a.pickupMs as number) - (b.pickupMs as number))
  past.sort((a, b) => {
    if (a.pickupMs === null && b.pickupMs === null) return 0
    if (a.pickupMs === null) return 1
    if (b.pickupMs === null) return -1
    return b.pickupMs - a.pickupMs
  })
  return {
    state: 'ok',
    contact: {
      email: contact.email,
      phone: contact.phone,
      verified: contact.verified,
      phoneMismatch: rpc.phone_mismatch,
    },
    counters: { trips: rpc.trip_count, totalSpentEur: rpc.spent_eur },
    upcoming,
    past,
    pastTruncated: rpc.total > rpc.rows.length,
    leadUrl: espoLeadUrl(links.espoBaseUrl, rpc.espo_lead_id),
    generatedAt: now.toISOString(),
  }
}

/** The conversation has no email and no usable phone: nothing to look up. */
export function buildNoContactResponse(contact: PanelContact, now: Date): PanelResponse {
  return {
    state: 'no_contact',
    contact: { email: contact.email, phone: contact.phone, verified: contact.verified, phoneMismatch: false },
    counters: { trips: 0, totalSpentEur: 0 },
    upcoming: [],
    past: [],
    pastTruncated: false,
    leadUrl: null,
    generatedAt: now.toISOString(),
  }
}
