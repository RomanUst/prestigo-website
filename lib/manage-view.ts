// Client-safe view model of the manage-booking page (Phase 89, plan 89-15; UI-SPEC Surface 1; HOLD-06, CANC-01).
//
// buildManageView is a pure function from the booking row that was read AFTER resolveManageToken, plus the few
// facts that live outside the row (the fee case, a refund seen by the webhook, the cancel timestamp). Its output is an
// ALLOW-LIST: it is built field by field, so nothing that is not named here can reach the page or the browser (T-89-52).
// It never carries the client's email, phone or name, a driver, a cancellation reason, an operator note, or any id
// other than the booking reference the client already holds. The page and the cancel/change-request islands of plan
// 89-28 receive this object serialised.
//
// loadManageView is the one server read behind the page. It selects an explicit column list (never `*`), so a new
// column on bookings can not leak into the page by accident. It needs the service client: the booking belongs to
// whoever holds the secret link, not to a signed-in user.
//
// Client components must `import type` from this module only: it also holds the server read, and a value import
// would pull the service client into the browser bundle.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { isBookingStatus, isPartnerBooking } from '@/lib/booking-status'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { evaluateCancellation, policyFromSnapshot, proposedFeeMinor, tripFactsFromRow } from '@/lib/cancellation-policy'
import { feeBaseFor, isFeeEligible, loadFeeCase } from '@/lib/payments/fee'

export type ManageCurrency = 'eur' | 'czk'

/** Which layout the page shows. `unknown` is a status this page does not know: details only, no action. */
export type ManageVariant = 'active' | 'on_board' | 'completed' | 'cancelled' | 'no_show' | 'unknown'

/**
 * Statuses in which the client can still cancel (D-03: up to the pickup, whatever the progress, except on board). Derived
 * from the shared transition map exactly as cancelBooking does, so a hand-written status list can not drift from it.
 */
export function isManageActiveStatus(status: string): boolean {
  return status !== 'on_board' && (VALID_TRANSITIONS[status] ?? []).includes('cancelled')
}

/** Catalog key under Manage.status for every known status. */
const STATUS_KEY: Record<string, string> = {
  unpaid: 'unpaid',
  pending: 'pending',
  confirmed: 'confirmed',
  assigned: 'assigned',
  en_route: 'enRoute',
  on_location: 'onLocation',
  on_board: 'onBoard',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'noShow',
}

export type ManagePaymentKey = 'paidCard' | 'cardSaved' | 'holdActive' | 'cash'

export interface ManageMoney {
  amountMinor: number
  currency: ManageCurrency
}

export interface ManagePayment extends ManageMoney {
  key: ManagePaymentKey
  /** Epoch ms of the planned hold, only for `cardSaved`. */
  holdAtMs: number | null
}

/** What happens to money when the client cancels in time. */
export type ManageFreeMoney = 'hold' | 'refund' | 'none'

export interface ManageCancelInfo {
  outcome: 'free' | 'late' | 'too_late'
  /** The end of the free window as an instant; null only when the pickup instant is unknown. */
  freeUntilMs: number | null
  feePercent: number
  /** The fee a late cancel may cost, in `currency` minor units; null when nothing can be charged. */
  proposedFeeMinor: number | null
  currency: ManageCurrency | null
  freeMoney: ManageFreeMoney
  /** The amount refunded by a free cancel, when freeMoney is `refund`. */
  refundMinor: number | null
  /** True when the pay-now bank refund sentence (5 to 10 business days) applies. */
  payNow: boolean
}

export type ManageFeeStatus = 'none' | 'pending' | 'charged' | 'waived'

export interface ManageCancelledInfo {
  cancelledAtMs: number | null
  feeStatus: ManageFeeStatus
  /** The amount behind `pending` (proposed) or `charged` (decided); 0 for none and waived. */
  feeAmountMinor: number
  currency: ManageCurrency | null
  refundedMinor: number | null
  freeUntilMs: number | null
}

export interface ManageView {
  reference: string
  status: string
  variant: ManageVariant
  /** Key under Manage.status, null for an unknown status. */
  statusKey: string | null
  pickupDate: string
  pickupTime: string
  from: string | null
  to: string | null
  vehicleClass: string | null
  passengers: number | null
  fare: ManageMoney | null
  payment: ManagePayment | null
  /** Set for the `active` variant only. */
  cancel: ManageCancelInfo | null
  /** Set for the `cancelled` variant only. */
  cancelled: ManageCancelledInfo | null
}

type Row = Record<string, unknown>

/** The facts that live outside the booking row. Every one is optional: a failed side read degrades, it never fails. */
export interface ManageExtras {
  feeCase?: {
    status: string
    currency: string
    proposedMinor: number
    decidedMinor: number | null
    freeUntil: string | null
  } | null
  refundedMinor?: number | null
  cancelledAtMs?: number | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const posInt = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n > 0 ? Math.round(n) : null
}
const currencyOf = (v: unknown): ManageCurrency | null => (v === 'eur' || v === 'czk' ? v : null)

/** Columns read for the page. No name, email, phone, driver, note or special request is in this list. */
export const MANAGE_BOOKING_COLUMNS =
  'id, booking_reference, status, trip_type, distance_km, pickup_utc, pickup_date, pickup_time, origin_address, ' +
  'destination_address, vehicle_class, passengers, amount_eur, payment_mode, payment_state, payment_currency, ' +
  'payment_amount_minor, payment_intent_id, hold_payment_intent_id, hold_amount_minor, hold_at, ' +
  'captured_amount_minor, outbound_amount_czk, return_amount_czk, leg, cancel_policy, cancel_policy_version, ' +
  'booking_source, stripe_payment_method_id'

/** Money the card booking already collected before the trip (a paid recovery link): refunded by an in-time cancel. */
function collectedMinor(row: Row): number {
  const captured = posInt(row.captured_amount_minor)
  if (captured !== null) return captured
  return row.payment_state === 'captured' || row.payment_state === 'balance_due' ? (posInt(row.payment_amount_minor) ?? 0) : 0
}

function isCardMode(row: Row): boolean {
  return row.payment_mode === 'card_hold' || row.payment_mode === 'cash_guarantee'
}

/**
 * True when a pay-now booking has money behind it. create-payment-intent stores an `unpaid` row WITH the payment intent
 * id before the client pays (an abandoned checkout stays that way), so the id alone proves nothing: the webhook moves
 * the row out of `unpaid` only when the payment succeeds (Phase 89 review WR-01).
 */
function payNowPaid(row: Row): boolean {
  return str(row.payment_intent_id) !== '' && row.status !== 'unpaid'
}

/** The fare shown to the client: the card amount in its own currency, else the booking amount in EUR. */
function fareOf(row: Row): ManageMoney | null {
  const minor = posInt(row.payment_amount_minor)
  const currency = currencyOf(row.payment_currency)
  if (isCardMode(row) && minor !== null && currency) return { amountMinor: minor, currency }
  const eur = num(row.amount_eur)
  if (eur !== null && eur > 0) return { amountMinor: Math.round(eur * 100), currency: 'eur' }
  return null
}

/** The one plain payment sentence of the details block, or null when the booking has none (manual, unpaid). */
function paymentOf(row: Row): ManagePayment | null {
  const mode = str(row.payment_mode)
  const state = str(row.payment_state)
  if (mode === 'pay_now') {
    const fare = fareOf(row)
    return payNowPaid(row) && fare ? { key: 'paidCard', ...fare, holdAtMs: null } : null
  }
  if (mode !== 'card_hold' && mode !== 'cash_guarantee') return null
  const currency = currencyOf(row.payment_currency)
  const amount = posInt(row.payment_amount_minor)
  if (!currency || amount === null) return null

  if (state === 'captured' || state === 'balance_due') {
    return { key: 'paidCard', amountMinor: collectedMinor(row) || amount, currency, holdAtMs: null }
  }
  if (mode === 'cash_guarantee') {
    // Settled in cash, released or never saved: the cash sentence would be wrong or empty.
    if (state === 'cash_settled' || state === 'released' || state === 'none' || state === 'checkout_pending' || state === '') {
      return null
    }
    return { key: 'cash', amountMinor: amount, currency, holdAtMs: null }
  }
  if (state === 'authorized' || state === 'capturing') {
    return { key: 'holdActive', amountMinor: posInt(row.hold_amount_minor) ?? amount, currency, holdAtMs: null }
  }
  if (state === 'card_saved' || state === 'placing_hold') {
    const holdAtMs = typeof row.hold_at === 'string' ? Date.parse(row.hold_at) : NaN
    return Number.isFinite(holdAtMs) ? { key: 'cardSaved', amountMinor: amount, currency, holdAtMs } : null
  }
  return null
}

/** What a free cancel does with money, from the payment side of the row. */
function freeMoneyOf(row: Row): { freeMoney: ManageFreeMoney; refundMinor: number | null } {
  if (row.payment_mode === 'pay_now') {
    const fare = payNowPaid(row) ? fareOf(row) : null
    return fare ? { freeMoney: 'refund', refundMinor: fare.amountMinor } : { freeMoney: 'none', refundMinor: null }
  }
  if (isCardMode(row)) {
    const collected = collectedMinor(row)
    if (collected > 0) return { freeMoney: 'refund', refundMinor: collected }
    const state = str(row.payment_state)
    if (state === 'authorized' || state === 'placing_hold' || state === 'capturing') return { freeMoney: 'hold', refundMinor: null }
  }
  return { freeMoney: 'none', refundMinor: null }
}

/** The base a late-cancel fee is a share of: the collected card money, else the booking amount (as cancelBooking). */
function feeBaseOf(row: Row): { baseMinor: number; currency: ManageCurrency } | null {
  if (isCardMode(row)) {
    const collected = collectedMinor(row)
    const currency = currencyOf(row.payment_currency)
    if (collected > 0 && currency) return { baseMinor: collected, currency }
  }
  const leg = row.leg === 'outbound' || row.leg === 'return' ? row.leg : undefined
  return (leg ? feeBaseFor(row, leg) : null) ?? feeBaseFor(row)
}

function feeStatusOf(feeCase: ManageExtras['feeCase']): ManageFeeStatus {
  if (!feeCase) return 'none'
  return feeCase.status === 'pending' || feeCase.status === 'charged' || feeCase.status === 'waived' ? feeCase.status : 'none'
}

/** The view model of one booking. Pure: `nowMs` is a parameter, nothing is read. */
export function buildManageView(row: Row, extras: ManageExtras, nowMs: number): ManageView {
  const status = str(row.status)
  const known = isBookingStatus(status)

  let variant: ManageVariant = 'unknown'
  if (known) {
    if (isManageActiveStatus(status)) variant = 'active'
    else if (status === 'on_board') variant = 'on_board'
    else if (status === 'completed') variant = 'completed'
    else if (status === 'cancelled') variant = 'cancelled'
    else if (status === 'no_show') variant = 'no_show'
  }

  const policy = policyFromSnapshot(row.cancel_policy)
  const facts = tripFactsFromRow(row as unknown as Parameters<typeof tripFactsFromRow>[0])
  const evaluated = facts ? evaluateCancellation(policy, facts, nowMs) : null

  let cancel: ManageCancelInfo | null = null
  if (variant === 'active') {
    const money = freeMoneyOf(row)
    // A pay-now row that was never paid has nothing to keep: no fee is proposed on money that was not taken (WR-01).
    const unpaidPayNow = row.payment_mode === 'pay_now' && !payNowPaid(row)
    const base = !unpaidPayNow && isFeeEligible(row) ? feeBaseOf(row) : null
    cancel = {
      // No pickup instant to measure against: the client page promises nothing, as cancelBooking does.
      outcome: evaluated ? evaluated.kind : 'too_late',
      freeUntilMs: evaluated ? evaluated.freeUntilMs : null,
      feePercent: policy.feePercent,
      proposedFeeMinor: base ? proposedFeeMinor(base.baseMinor, policy.feePercent) : null,
      currency: base ? base.currency : null,
      freeMoney: money.freeMoney,
      refundMinor: money.refundMinor,
      payNow: row.payment_mode === 'pay_now' && money.freeMoney === 'refund',
    }
  }

  let cancelled: ManageCancelledInfo | null = null
  if (variant === 'cancelled') {
    const feeCase = extras.feeCase ?? null
    const feeStatus = feeStatusOf(feeCase)
    const amount =
      feeStatus === 'pending' ? (feeCase?.proposedMinor ?? 0) : feeStatus === 'charged' ? (feeCase?.decidedMinor ?? feeCase?.proposedMinor ?? 0) : 0
    const caseFreeUntil = feeCase?.freeUntil ? Date.parse(feeCase.freeUntil) : NaN
    cancelled = {
      cancelledAtMs: extras.cancelledAtMs ?? null,
      feeStatus,
      feeAmountMinor: amount > 0 ? Math.round(amount) : 0,
      currency: feeCase ? currencyOf(feeCase.currency) : (fareOf(row)?.currency ?? null),
      refundedMinor: extras.refundedMinor && extras.refundedMinor > 0 ? Math.round(extras.refundedMinor) : null,
      freeUntilMs: evaluated ? evaluated.freeUntilMs : Number.isFinite(caseFreeUntil) ? caseFreeUntil : null,
    }
  }

  return {
    reference: str(row.booking_reference),
    status,
    variant,
    statusKey: known ? (STATUS_KEY[status] ?? null) : null,
    pickupDate: str(row.pickup_date),
    pickupTime: str(row.pickup_time).slice(0, 5),
    from: str(row.origin_address) || null,
    to: str(row.destination_address) || null,
    vehicleClass: str(row.vehicle_class) || null,
    passengers: posInt(row.passengers),
    fare: fareOf(row),
    payment: paymentOf(row),
    cancel,
    cancelled,
  }
}

/**
 * Read the booking behind a resolved manage token and build its view. Null when the booking can not be read or is a
 * partner booking (no money, no self-service). A failed side read (fee case, refund, cancel time) only drops that
 * detail: the page still renders.
 */
export async function loadManageView(bookingId: string, nowMs: number = Date.now()): Promise<ManageView | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.from('bookings').select(MANAGE_BOOKING_COLUMNS).eq('id', bookingId).maybeSingle()
  if (error || !data) return null
  const row = data as unknown as Row
  if (isPartnerBooking({ booking_source: typeof row.booking_source === 'string' ? row.booking_source : null })) return null

  const extras: ManageExtras = {}
  if (row.status === 'cancelled') {
    try {
      const feeCase = await loadFeeCase(bookingId)
      if (feeCase) {
        extras.feeCase = {
          status: feeCase.status,
          currency: feeCase.currency,
          proposedMinor: feeCase.proposed_minor,
          decidedMinor: feeCase.decided_minor,
          freeUntil: feeCase.free_until,
        }
      }
    } catch {
      console.error('[manage-view] fee case read failed')
    }
    try {
      const { data: refunds } = await supabase
        .from('booking_payment_events')
        .select('amount_minor')
        .eq('booking_id', bookingId)
        .eq('kind', 'refund_observed')
      if (Array.isArray(refunds)) {
        extras.refundedMinor = refunds.reduce((sum, r) => sum + (posInt((r as Row).amount_minor) ?? 0), 0)
      }
    } catch {
      console.error('[manage-view] refund read failed')
    }
    try {
      const { data: log } = await supabase
        .from('booking_status_log')
        .select('created_at')
        .eq('booking_id', bookingId)
        .eq('to_status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
      const at = Array.isArray(log) && log[0] ? Date.parse(str((log[0] as Row).created_at)) : NaN
      if (Number.isFinite(at)) extras.cancelledAtMs = at
    } catch {
      console.error('[manage-view] cancel time read failed')
    }
  }
  return buildManageView(row, extras, nowMs)
}
