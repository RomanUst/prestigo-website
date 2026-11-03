import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { bookingLeadAmountEur, type BookingRow } from '@/lib/lead-mapping'
import type { PanelBooking, PanelResponse, PaymentState } from '@/lib/panel-dto'
import { adminBookingHref, espoLeadUrl, isSafePaymentLinkUrl } from '@/lib/panel-links'
import { REVENUE_STATUSES } from '@/lib/booking-status'
import { pickupInstantMs } from '@/lib/prague-date'

export { pickupInstantMs }

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

/** Statuses whose value counts towards the spent total (D-02: the shared revenue set; no_show is excluded). */
export const PANEL_VALUE_STATUSES: ReadonlySet<string> = REVENUE_STATUSES

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

/**
 * RESEARCH A1: cancelled, then paid_at, then unpaid / pending; every other status counts as paid.
 * A6 (Phase 87): an unpaid no_show is never shown as paid.
 */
export function paymentState(status: string, paidAt: string | null): PaymentState {
  if (status === 'cancelled') return 'cancelled'
  if (paidAt) return 'paid'
  if (status === 'unpaid' || status === 'no_show') return 'awaiting_payment'
  if (status === 'pending') return 'quote'
  return 'paid'
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
      booking.status !== 'completed' &&
      booking.status !== 'no_show'
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
