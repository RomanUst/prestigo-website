import { after } from 'next/server'
import { z } from 'zod'
import type { createSupabaseServiceClient } from '@/lib/supabase'
import { advanceBookingStatus } from '@/lib/booking-status-service'
import { pushGnetForTransition } from '@/lib/gnet-push'
import { getStartGate, type StartGate } from '@/lib/start-gate'
import { settleCash } from '@/lib/payments/cash'
import { announceLateCashCharge } from '@/lib/payments/fee'
import { reconcileCashCharge } from '@/lib/payments/settle'
import { formatMinor } from '@/lib/payments/money'
import {
  PartnerBookingMoneyError,
  assertMoneyEligible,
  DRIVER_STEPS,
  DRIVER_STEP_TARGET,
  DRIVER_STEP_TRIP_PROGRESS,
  TERMINAL_BOOKING_STATUSES,
  nextStepFor,
  type DriverStep,
} from '@/lib/booking-status'

/**
 * Driver trip steps (Phase 87 D-01, D-12, DRV-01/02/04): server logic behind the token-gated
 * route app/api/driver/trip/[token]/progress/route.ts. Server-only, no auth of its own: the
 * route authenticates the bearer trip token and passes the loaded record in.
 *
 * Invariant (replaces the v2.2 DTRIP-04 isolation): this module NEVER writes bookings itself.
 * bookings.status changes only through advanceBookingStatus (compare-and-set RPC, actor
 * 'driver'); the only direct write here is the driver_assignments.trip_progress mirror, applied
 * after the compare-and-set won, and the driver note. The driver can never send an amount: the
 * request schema is a strict { step } or { note }.
 *
 * Phase 89 (CASH-04, D-11, D-21): the one scoped exception is confirm_cash. The driver of a completed
 * cash_guarantee booking says "I received the cash"; that settles the booking through settleCash (the one
 * writer of payment_state) with the system actor driver_trip. The driver never sends an amount (strict
 * schema) and settleCash uses none. Nothing here charges a card or refunds.
 */

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

export const driverTripRequestSchema = z.union([
  z.object({ step: z.enum(DRIVER_STEPS) }).strict(),
  z.object({ note: z.string().max(2000) }).strict(),
  // D-15/D-16: the driver may only ASK for a no-show; the operator alone sets the status.
  z.object({ action: z.literal('request_no_show') }).strict(),
  // D-11 (Phase 89): the driver confirms the cash was received. No amount field exists, so one is a 400.
  z.object({ action: z.literal('confirm_cash') }).strict(),
])

export type DriverTripRequest = z.infer<typeof driverTripRequestSchema>

export interface DriverTripRecord {
  assignmentId: string
  assignmentDriverId: string
  assignmentStatus: string | null
  booking: {
    id: string
    status: string
    driver_id: string | null
    booking_source: string | null
    amount_eur: unknown
    pickup_utc: string | null
    pickup_date: string
    pickup_time: string
    origin_lat: number | null
    origin_lng: number | null
    origin_address: string | null
    completed_at: string | null
    no_show_requested_at: string | null
    // Phase 89: only read by confirm_cash; absent in fixtures that predate it.
    payment_mode?: string | null
    payment_state?: string | null
    recovery_link_id?: string | null
  }
}

export interface TripStepResponse {
  ok: boolean
  status: string
  nextStep: DriverStep | null
  replay?: boolean
  unlocksAt?: string
  completedAt?: string
  error?: 'step_conflict' | 'too_early' | 'update_failed'
}

export type DriverTripStepResult =
  | { httpStatus: 200 | 409 | 500; body: TripStepResponse }
  | { httpStatus: 400; body: { error: 'invalid_token' } }

const INVALID_TOKEN = { httpStatus: 400, body: { error: 'invalid_token' } } as const

interface RawTripRow {
  id: string
  driver_id: string
  status: string | null
  bookings: DriverTripRecord['booking'] | null
}

/**
 * One read-only select on driver_assignments by trip_token with the booking joined in. Never
 * writes. Null for an unknown token or any lookup error (the route answers invalid_token).
 */
export async function loadDriverTripForStep(
  supabase: ServiceClient,
  token: string,
): Promise<DriverTripRecord | null> {
  const { data, error } = await supabase
    .from('driver_assignments')
    .select(
      'id, driver_id, status, bookings!inner(id, status, driver_id, booking_source, amount_eur, pickup_utc, pickup_date, pickup_time, origin_lat, origin_lng, origin_address, completed_at, no_show_requested_at, payment_mode, payment_state, recovery_link_id)',
    )
    .eq('trip_token', token)
    .single()

  const row = data as unknown as RawTripRow | null
  if (error || !row || !row.bookings) return null

  return {
    assignmentId: row.id,
    assignmentDriverId: row.driver_id,
    assignmentStatus: row.status ?? null,
    booking: row.bookings,
  }
}

/**
 * Identity rule (D-03, Pitfall 6): the assignment's driver is still the booking's driver and the
 * assignment was not declined. Terminal handling is separate (a replay of the final step must
 * still answer 200).
 */
export function hasTripIdentity(trip: DriverTripRecord): boolean {
  return (
    trip.booking.driver_id !== null &&
    trip.assignmentDriverId === trip.booking.driver_id &&
    trip.assignmentStatus !== 'declined'
  )
}

function isTerminal(status: string): boolean {
  return (TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(status)
}

function conflict(status: string): DriverTripStepResult {
  return {
    httpStatus: 409,
    body: { ok: false, error: 'step_conflict', status, nextStep: nextStepFor(status) },
  }
}

export async function driverTripStep(input: {
  supabase: ServiceClient
  trip: DriverTripRecord
  step: DriverStep
  nowMs: number
  /** Injected in tests; computed from the booking when absent. */
  gate?: StartGate
}): Promise<DriverTripStepResult> {
  const { supabase, trip, step, nowMs } = input
  const booking = trip.booking

  if (!hasTripIdentity(trip)) return INVALID_TOKEN

  // 1. Replay: the step is already applied (also the final 'completed' after the link became
  // terminal). No write, no log row, no email. A gnet booking re-offers the push for the applied
  // status; the push helper claims idempotently, so it retries only a failed push.
  if (booking.status === DRIVER_STEP_TARGET[step]) {
    if (booking.booking_source === 'gnet') {
      const status = booking.status
      after(() =>
        pushGnetForTransition({
          bookingId: booking.id,
          bookingSource: booking.booking_source,
          status,
          amountEur: booking.amount_eur,
          logTag: '[driver-trip:gnet-push]',
        }),
      )
    }
    const body: TripStepResponse = {
      ok: true,
      replay: true,
      status: booking.status,
      nextStep: nextStepFor(booking.status),
    }
    if (booking.status === 'completed' && booking.completed_at) body.completedAt = booking.completed_at
    return { httpStatus: 200, body }
  }

  // 2. Terminal and not a replay: the link no longer accepts writes.
  if (isTerminal(booking.status)) return INVALID_TOKEN

  // 3. Strict order: only the one next step is accepted.
  if (step !== nextStepFor(booking.status)) return conflict(booking.status)

  // 4. Start gate (D-14): only the first step is time-locked, so later steps never call Maps.
  if (step === 'en_route') {
    const gate = input.gate ?? (await getStartGate(booking, nowMs))
    if (!gate.open) {
      return {
        httpStatus: 409,
        body: {
          ok: false,
          error: 'too_early',
          status: booking.status,
          nextStep: 'en_route',
          ...(gate.unlocksAtMs !== null ? { unlocksAt: new Date(gate.unlocksAtMs).toISOString() } : {}),
        },
      }
    }
  }

  // 5. Compare-and-set through the status service. expectedFrom is the status validated above,
  // so an admin change between our read and the write makes the service answer 'conflict'.
  const result = await advanceBookingStatus({
    bookingId: booking.id,
    to: DRIVER_STEP_TARGET[step],
    expectedFrom: booking.status,
    actor: { type: 'driver', id: trip.assignmentDriverId },
    source: 'driver_trip',
    profile: 'full',
  })

  if (!result.ok) {
    switch (result.code) {
      case 'conflict':
        return conflict(result.currentStatus ?? booking.status)
      case 'not_found':
        return INVALID_TOKEN
      case 'invalid_transition':
        return conflict(booking.status)
      case 'db_error':
        return {
          httpStatus: 500,
          body: { ok: false, error: 'update_failed', status: booking.status, nextStep: nextStepFor(booking.status) },
        }
    }
  }

  // 6. Mirror trip_progress only after the compare-and-set won. A failed mirror never undoes the
  // applied status; the booking status is the source of truth.
  const { error: mirrorError } = await supabase
    .from('driver_assignments')
    .update({
      trip_progress: DRIVER_STEP_TRIP_PROGRESS[step],
      trip_progress_updated_at: new Date().toISOString(),
    })
    .eq('id', trip.assignmentId)
  if (mirrorError) {
    console.error('[driver-trip] trip_progress mirror failed', { bookingId: booking.id, step })
  }

  const body: TripStepResponse = {
    ok: true,
    status: result.current,
    nextStep: nextStepFor(result.current),
  }
  const completedAt = result.booking.completed_at
  if (result.current === 'completed' && typeof completedAt === 'string' && completedAt) {
    body.completedAt = completedAt
  }
  return { httpStatus: 200, body }
}

export type DriverConfirmCashResult =
  | { httpStatus: 200; body: { ok: true; status: string; nextStep: null; cash: 'settled'; replay?: true } }
  | { httpStatus: 409 | 422; body: { ok: false; error: 'cash_conflict' | 'cash_not_allowed' | 'cash_wait'; status: string; nextStep: null } }
  | { httpStatus: 400; body: { error: 'invalid_token' } }

/**
 * D-11: the driver confirms the cash. Identity, partner guard, completed trip, cash_guarantee booking in a state that
 * can be settled; then settleCash with the driver_trip system actor. 422 for anything else (nothing written), 409 when
 * the state moved between our read and the compare-and-set, 200 with replay for an already settled booking. There is
 * deliberately no "did not pay" answer (D-21): the driver calls the office and nothing happens by itself.
 */
export async function driverConfirmCash(input: { trip: DriverTripRecord }): Promise<DriverConfirmCashResult> {
  const { booking } = input.trip
  if (!hasTripIdentity(input.trip)) return INVALID_TOKEN

  const notAllowed: DriverConfirmCashResult = {
    httpStatus: 422,
    body: { ok: false, error: 'cash_not_allowed', status: booking.status, nextStep: null },
  }
  try {
    assertMoneyEligible({ booking_source: booking.booking_source })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return notAllowed
    throw err
  }
  if (booking.status !== 'completed') return notAllowed
  if (booking.payment_mode !== 'cash_guarantee') return notAllowed
  let state = booking.payment_state
  // Money CR-05: the operator's card charge is on this row. Its worker may be gone: Stripe is read (nothing is charged), and
  // a row with no payment behind it is free again. A charge still running is a clear "wait", not a refusal.
  if (state === 'capturing') {
    const reconciled = await reconcileCashCharge(booking.id, { type: 'system', id: 'driver_trip' })
    if (reconciled.outcome === 'restored') {
      state = reconciled.state
    } else if (reconciled.outcome === 'captured') {
      // Money review 2, CR-01: the card went through after the operator stopped waiting for it, so the client may be
      // paying the driver right now. Same as the webhook would do: the receipt, and the operator is told.
      await announceLateCashCharge(booking.id, { id: booking.id }, reconciled)
      return { httpStatus: 409, body: { ok: false, error: 'cash_conflict', status: booking.status, nextStep: null } }
    } else {
      return { httpStatus: 409, body: { ok: false, error: 'cash_wait', status: booking.status, nextStep: null } }
    }
  }
  if (state !== 'card_saved' && state !== 'failed' && state !== 'cash_settled') return notAllowed

  const result = await settleCash(
    {
      id: booking.id,
      booking_source: booking.booking_source,
      payment_mode: booking.payment_mode,
      payment_state: state,
      recovery_link_id: booking.recovery_link_id ?? null,
    },
    { type: 'system', id: 'driver_trip' },
  )

  switch (result) {
    case 'settled':
      return { httpStatus: 200, body: { ok: true, status: booking.status, nextStep: null, cash: 'settled' } }
    case 'replay':
      return { httpStatus: 200, body: { ok: true, status: booking.status, nextStep: null, cash: 'settled', replay: true } }
    case 'not_allowed':
      return { httpStatus: 409, body: { ok: false, error: 'cash_conflict', status: booking.status, nextStep: null } }
  }
}

/**
 * What the trip page may show about cash (D-11, D-12). A formatted label, never a number: the amount and currency are
 * the booking's own (payment_amount_minor / payment_currency). null for every trip that is not a cash_guarantee booking
 * with a payable (card_saved, failed) or settled (cash_settled) cash, so all other trips render as in Phase 87.
 */
export interface DriverTripCash {
  amountLabel: string
  state: 'due' | 'settled'
}

export function buildDriverCash(booking: {
  payment_mode?: string | null
  payment_state?: string | null
  payment_amount_minor?: number | null
  payment_currency?: string | null
  booking_source?: string | null
}): DriverTripCash | null {
  if (booking.payment_mode !== 'cash_guarantee') return null
  try {
    assertMoneyEligible({ booking_source: booking.booking_source ?? null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return null
    throw err
  }
  // capturing: a card charge is running; the cash is still due, and a tap answers "wait" until the row is decided.
  const state =
    booking.payment_state === 'card_saved' || booking.payment_state === 'failed' || booking.payment_state === 'capturing'
      ? 'due'
      : booking.payment_state === 'cash_settled'
        ? 'settled'
        : null
  if (!state) return null
  const minor = booking.payment_amount_minor
  const currency = booking.payment_currency
  if (typeof minor !== 'number' || !Number.isInteger(minor) || minor <= 0) return null
  if (currency !== 'eur' && currency !== 'czk') return null
  return { amountLabel: formatMinor(minor, currency), state }
}

/** D-21: the driver note, independent of steps; active links only (non-terminal booking). */
export async function driverTripNote(input: {
  supabase: ServiceClient
  trip: DriverTripRecord
  note: string
}): Promise<
  { httpStatus: 200; body: { ok: true } } | { httpStatus: 400; body: { error: 'invalid_token' } } | { httpStatus: 500; body: { error: 'update_failed' } }
> {
  const { supabase, trip, note } = input

  if (!hasTripIdentity(trip) || isTerminal(trip.booking.status)) return INVALID_TOKEN

  const { error } = await supabase
    .from('driver_assignments')
    .update({ trip_note: note, trip_progress_updated_at: new Date().toISOString() })
    .eq('id', trip.assignmentId)

  if (error) return { httpStatus: 500, body: { error: 'update_failed' } }
  return { httpStatus: 200, body: { ok: true } }
}

export interface TripView {
  status: string
  nextStep: DriverStep | null
  lockReason: 'too_early' | 'waiting' | null
  unlocksAt: string | null
}

const WAITING_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'pending', 'unpaid'])

/** What the driver page renders: the current status, the one available step and why it is locked. */
export async function buildTripView(input: {
  booking: DriverTripRecord['booking']
  nowMs: number
  /** Injected in tests; computed from the booking when absent. */
  gate?: StartGate
}): Promise<TripView> {
  const { booking, nowMs } = input
  const nextStep = nextStepFor(booking.status)
  const view: TripView = {
    status: booking.status,
    nextStep,
    lockReason: WAITING_STATUSES.has(booking.status) ? 'waiting' : null,
    unlocksAt: null,
  }

  // The Maps call runs only while the next step is en_route (no cost on later steps).
  if (nextStep === 'en_route') {
    const gate = input.gate ?? (await getStartGate(booking, nowMs))
    if (!gate.open) {
      view.lockReason = 'too_early'
      view.unlocksAt = gate.unlocksAtMs !== null ? new Date(gate.unlocksAtMs).toISOString() : null
    }
  }
  return view
}
