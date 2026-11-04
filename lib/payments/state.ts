import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * The one writer of bookings.payment_state and the payment money ledger (Phase 88 D-05, PAYF-01).
 * Server-only: imported by API routes, webhooks and the payment tick, with no auth of its own —
 * every caller authenticates before calling.
 *
 * payment_state changes only through the apply_payment_transition RPC (migration 085): a
 * compare-and-set on `payment_state = ANY(p_from)` that also writes one append-only ledger row, so
 * exactly one of two racing writers is applied and a replay of an already-recorded event key is a
 * no-op. tests/payment-state-writers-gate.test.ts fails when any other file under app/ or lib/
 * names the three RPCs below or writes a payment_state key.
 *
 * PAYMENT_STATES, PAYMENT_MODES and LEDGER_KINDS mirror the latest migration CHECK lists
 * (tests/payments-state.test.ts). Keep the names: every later Phase 88 plan imports them.
 */

export const PAYMENT_STATES = [
  'none',
  'checkout_pending',
  'card_saved',
  'placing_hold',
  'authorized',
  'capturing',
  'captured',
  'balance_due',
  'failed',
  'expired',
  'released',
] as const
export type PaymentState = (typeof PAYMENT_STATES)[number]

export const PAYMENT_MODES = ['pay_now', 'card_hold', 'cash_guarantee', 'quote', 'partner'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const LEDGER_KINDS = [
  'setup_started',
  'setup_succeeded',
  'setup_failed',
  'hold_scheduled',
  'hold_started',
  'hold_authorized',
  'hold_failed',
  'hold_released',
  'hold_expired',
  'capture_started',
  'captured',
  'charge_succeeded',
  'charge_failed',
  'difference_charged',
  'difference_failed',
  'recovery_link_created',
  'recovery_paid',
  'alert_sent',
  'email_sent',
  'admin_action',
  'refund_observed',
  'refund_failed',
  'edit_reevaluated',
  'waived',
] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

export type LedgerActor = { type: 'system' | 'webhook' | 'admin'; id: string | null }

export interface LedgerEvent {
  /** Exactly-once key, unique per booking (webhook replays and re-driven sweeps reuse it). */
  key: string
  kind: LedgerKind
  stripeObjectId?: string
  amountMinor?: number
  currency?: 'eur' | 'czk'
  /** A Stripe error / decline code only, at most 60 characters. Never a message or PII. */
  errorCode?: string
  actor: LedgerActor
}

/** The columns apply_payment_transition may change besides payment_state (allow-list, mirrored in SQL). */
export interface PaymentPatch {
  payment_currency?: 'eur' | 'czk' | null
  payment_amount_minor?: number | null
  stripe_customer_id?: string | null
  stripe_payment_method_id?: string | null
  setup_intent_id?: string | null
  hold_at?: string | null
  hold_payment_intent_id?: string | null
  hold_amount_minor?: number | null
  hold_placed_at?: string | null
  capture_before?: string | null
  hold_attempts?: number
  charge_attempts?: number
  payment_lease_until?: string | null
  captured_amount_minor?: number
  captured_at?: string | null
  payment_failed_at?: string | null
  payment_retry_at?: string | null
  payment_retry_count?: number
  last_payment_error?: string | null
  recovery_link_id?: string | null
  recovery_link_url?: string | null
  /** Set only when money is collected: the database rejects it unless the target is captured / balance_due. */
  payment_intent_id?: string | null
}

/**
 * from -> allowed targets. Self-loops exist for edit re-evaluation and checkout re-submit only.
 * captured and released are terminal in Phase 88.
 */
export const TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  none: ['checkout_pending'],
  checkout_pending: ['checkout_pending', 'card_saved', 'authorized', 'released'],
  card_saved: ['card_saved', 'placing_hold', 'capturing', 'released'],
  // released: the booking was cancelled / marked no-show while its hold was being placed (88-REVIEW A-WR-04).
  // capturing: a completed trip whose hold placement died adopts the row once its lease lapsed (88-REVIEW A-WR-06).
  placing_hold: ['authorized', 'card_saved', 'failed', 'placing_hold', 'released', 'capturing'],
  authorized: ['authorized', 'card_saved', 'expired', 'capturing', 'released'],
  capturing: ['captured', 'balance_due', 'failed', 'capturing'],
  balance_due: ['balance_due', 'captured', 'released'],
  failed: ['failed', 'placing_hold', 'capturing', 'captured', 'released'],
  expired: ['expired', 'placing_hold', 'capturing', 'released'],
  captured: [],
  released: [],
}

/** True when every state in `from` may move to `to`. An empty `from` is never legal. */
export function isLegalTransition(from: readonly PaymentState[], to: PaymentState): boolean {
  if (from.length === 0) return false
  return from.every((f) => (TRANSITIONS[f] ?? []).includes(to))
}

function serializeEvent(event: LedgerEvent): Record<string, unknown> {
  return {
    key: event.key,
    kind: event.kind,
    stripe_object_id: event.stripeObjectId ?? null,
    amount_minor: event.amountMinor ?? null,
    currency: event.currency ?? null,
    actor_type: event.actor.type,
    actor_id: event.actor.id ?? null,
    error_code: event.errorCode ?? null,
  }
}

export interface ApplyTransitionResult {
  applied: boolean
  duplicate?: boolean
  /** requireStatus was given and the booking status is not one of them (migration 086): nothing was written. */
  statusBlocked?: boolean
  currentState?: PaymentState
  currentStatus?: string
  booking?: Record<string, unknown>
}

/**
 * Atomic compare-and-set of payment_state plus one ledger row.
 * - Illegal (from, to) pair: throws 'illegal payment transition' before any query.
 * - RPC error or malformed result: throws 'payment transition failed'.
 * - Lost race: { applied: false, currentState }.
 * - Event key already recorded for this booking: { applied: false, duplicate: true, currentState }
 *   and the state change was rolled back by the database.
 * - requireStatus given and bookings.status not in it: { applied: false, statusBlocked: true, currentState,
 *   currentStatus }. The status is read under the same row lock as payment_state (migration 086), so a concurrent
 *   status change can never slip between the check and the write (88-REVIEW A-WR-04, C-WR-01).
 */
export async function applyTransition(args: {
  bookingId: string
  from: PaymentState[]
  to: PaymentState
  patch?: PaymentPatch
  event: LedgerEvent
  /** Booking statuses the transition requires (checked inside the compare-and-set). */
  requireStatus?: readonly string[]
}): Promise<ApplyTransitionResult> {
  if (!isLegalTransition(args.from, args.to)) throw new Error('illegal payment transition')
  if (args.requireStatus !== undefined && args.requireStatus.length === 0) throw new Error('illegal payment transition')

  const { data, error } = await createSupabaseServiceClient().rpc('apply_payment_transition', {
    p_booking_id: args.bookingId,
    p_from: args.from,
    p_to: args.to,
    p_patch: args.patch ?? {},
    p_event: serializeEvent(args.event),
    ...(args.requireStatus ? { p_require_status: [...args.requireStatus] } : {}),
  })

  const result = data as
    | {
        applied?: unknown
        duplicate?: boolean
        status_blocked?: boolean
        current_state?: PaymentState | null
        current_status?: string | null
        booking?: Record<string, unknown> | null
      }
    | null
    | undefined

  if (error || !result || typeof result.applied !== 'boolean') {
    throw new Error('payment transition failed')
  }

  const out: ApplyTransitionResult = { applied: result.applied }
  if (result.duplicate === true) out.duplicate = true
  if (result.status_blocked === true) out.statusBlocked = true
  if (result.current_state) out.currentState = result.current_state
  if (result.current_status) out.currentStatus = result.current_status
  if (result.booking) out.booking = result.booking
  return out
}

/**
 * Append a ledger row without changing the state (from_state = to_state = the current state).
 * `inserted: false` means the (booking, key) pair was already recorded.
 */
export async function appendPaymentEvent(
  bookingId: string,
  event: LedgerEvent,
): Promise<{ inserted: boolean }> {
  const { data, error } = await createSupabaseServiceClient().rpc('append_payment_event', {
    p_booking_id: bookingId,
    p_event: serializeEvent(event),
  })
  const result = data as { inserted?: unknown } | null | undefined
  if (error || !result || typeof result.inserted !== 'boolean') {
    throw new Error('payment event append failed')
  }
  return { inserted: result.inserted }
}

/**
 * True when the (booking, key) ledger row exists. Read-only: the notification senders use it to skip a message that was
 * already delivered and recorded (lib/payments/notify.ts, 88-REVIEW A-WR-10).
 */
export async function paymentEventRecorded(bookingId: string, key: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('event_key', key)
    .limit(1)
  if (error) throw new Error('payment event lookup failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * Claim up to `limit` card_hold bookings whose hold time has come (card_saved, hold_at <= now, or
 * placing_hold with an expired lease), oldest hold_at first, with a lease of `leaseSeconds`.
 * Overlapping ticks never claim the same row (FOR UPDATE SKIP LOCKED).
 */
export async function claimDueHolds(
  limit: number,
  leaseSeconds: number,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await createSupabaseServiceClient().rpc('claim_due_payment_work', {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  })
  if (error) throw new Error('payment claim failed')
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[]
}
