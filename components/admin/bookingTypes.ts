// Pure booking types and helpers shared by the bookings list, the detail panel,
// the move hook and (Phase 90) the board and calendar views. No React import.
import { BOOKING_STATUS_LABELS } from '@/lib/booking-status'

export interface AdminBooking {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual' | 'gnet'
  pickup_date: string
  pickup_time: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  trip_type: string
  vehicle_class: string
  amount_czk: number
  driver_price_czk: number | null
  origin_address: string
  destination_address: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  passengers: number
  luggage: number
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  flight_number: string | null
  terminal: string | null
  hours: number | null
  return_date: string | null
  special_requests: string | null
  payment_intent_id: string | null
  // Phase 64 D-05: persisted Stripe Payment Link (migration 056). Null until
  // an operator generates one via the row-level "Generate Payment Link"
  // action or the ManualBookingForm create-with-payment flow.
  payment_link_url: string | null
  payment_link_id: string | null
  status: string
  operator_notes: string | null
  created_at: string
  leg: 'outbound' | 'return' | null
  linked_booking_id: string | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  linked_booking: { booking_reference: string } | null
  // Phase 32: flight status persisted columns (migration 033)
  flight_iata: string | null
  flight_status: string | null
  flight_estimated_arrival: string | null
  flight_delay_minutes: number | null
  flight_departure_airport: string | null
  flight_arrival_airport: string | null
  flight_terminal: string | null
  // Phase 75-17 D-11: site locale at checkout (migration 062). Null for
  // admin-created bookings and any row created before the column existed.
  locale?: string | null
  // Phase 87 D-16(a): when the driver asked for a no-show (migration 084). Arrives through
  // admin_search_bookings to_jsonb; null/absent = no open request.
  no_show_requested_at?: string | null
  // Phase 88 (migration 085): arrive through admin_search_bookings to_jsonb. Old rows and test
  // fixtures may omit them; only 'card_hold' bookings show the payment badge and panel.
  payment_mode?: string | null
  payment_state?: string | null
  // Phase 89 (migrations 087+): arrive through admin_search_bookings to_jsonb (select b.*), so the red badge and the
  // cancel dialog's local outcome line need no extra request. Old rows and fixtures may omit them.
  fee_case_status?: string | null
  cancel_policy?: unknown
  pickup_utc?: string | null
  distance_km?: number | null
  amount_eur?: number | null
  payment_currency?: string | null
  payment_amount_minor?: number | null
  capture_before?: string | null
  stripe_payment_method_id?: string | null
  hold_payment_intent_id?: string | null
  // Phase 90: the assigned driver; arrives through admin_search_bookings select b.* (board card, plan 90-07).
  driver_id?: string | null
}

// A row whose payment is a card hold or a cash booking carries a payment badge (cash also a chip).
export function showsPaymentBadge(b: { payment_mode?: string | null }): boolean {
  return b.payment_mode === 'card_hold' || b.payment_mode === 'cash_guarantee'
}

// Phase 89 plan 16: money that a bare status change would leave behind. The server answers 422 use_cancel_route for these.
export function hasCancelMoney(b: { payment_mode?: string | null; payment_intent_id: string | null }): boolean {
  return showsPaymentBadge(b) || (typeof b.payment_intent_id === 'string' && b.payment_intent_id !== '')
}

export const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

// D-02: one label source for every admin surface. Indexed by arbitrary row.status strings, so
// the alias is widened to Record<string, string>; unknown values fall back to the raw status.
export const STATUS_LABELS: Record<string, string> = BOOKING_STATUS_LABELS

// ─────────────────────────────────────────────────────────────────────────
// Phase 63 Plan 05 — Trip-edit mode (D-01/D-02), price-review step (D-06),
// terminal/GNet notices, and BookingChangeHistory mount.
// ─────────────────────────────────────────────────────────────────────────

export interface PatchBody {
  id: string
  status?: string
  // D-01: the status the row shows; the server answers 409 status_conflict when the stored status differs
  expected_status?: string
  operator_notes?: string
  driver_price_czk?: number | null
  pickup_date?: string
  pickup_time?: string
  client_first_name?: string
  client_last_name?: string
  client_email?: string
  client_phone?: string
  flight_number?: string
  notify_client?: boolean
  vehicle_class?: string
  origin_address?: string
  destination_address?: string
  origin_lat?: number
  origin_lng?: number
  destination_lat?: number
  destination_lng?: number
  distance_km?: number | null
  amount_czk?: number
  override_price?: boolean
}

// Thrown by patchBooking() on a non-ok response. Carries the 422 price-mismatch
// body (computedCzk/submittedCzk) so the price-review step can surface it
// inline without re-parsing the response a second time.
export class PatchError extends Error {
  status?: number
  computedCzk?: number
  submittedCzk?: number
  // 409 status_conflict body: the status the booking really has now
  currentStatus?: string
  constructor(
    message: string,
    extra?: { status?: number; computedCzk?: number; submittedCzk?: number; currentStatus?: string },
  ) {
    super(message)
    this.name = 'PatchError'
    this.status = extra?.status
    this.computedCzk = extra?.computedCzk
    this.submittedCzk = extra?.submittedCzk
    this.currentStatus = extra?.currentStatus
  }
}

// The one PATCH call every admin booking action goes through. Throws PatchError on a non-ok response.
export async function patchBooking(body: PatchBody): Promise<unknown> {
  const res = await fetch('/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new PatchError(data.error ?? 'Update failed', {
      status: res.status,
      computedCzk: data.computedCzk,
      submittedCzk: data.submittedCzk,
      currentStatus: data.error === 'status_conflict' ? data.currentStatus : undefined,
    })
  }
  return res.json()
}
