import { after } from 'next/server'
import { z } from 'zod'
import type { createSupabaseServiceClient } from '@/lib/supabase'
import { advanceBookingStatus } from '@/lib/booking-status-service'
import { pushGnetForTransition } from '@/lib/gnet-push'
import { getStartGate, type StartGate } from '@/lib/start-gate'
import {
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
 */

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

export const driverTripRequestSchema = z.union([
  z.object({ step: z.enum(DRIVER_STEPS) }).strict(),
  z.object({ note: z.string().max(2000) }).strict(),
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
      'id, driver_id, status, bookings!inner(id, status, driver_id, booking_source, amount_eur, pickup_utc, pickup_date, pickup_time, origin_lat, origin_lng, origin_address, completed_at, no_show_requested_at)',
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
