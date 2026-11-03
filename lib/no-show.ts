import { after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { advanceBookingStatus, type AdvanceBookingStatusResult, type StatusActor } from '@/lib/booking-status-service'
import { logEmail } from '@/lib/email-log'
import { sendNoShowRequestAlert } from '@/lib/email'
import { dispatchAfterResponse, enqueueOutboxEvent, noShowAlertKey } from '@/lib/outbox'
import { isNearAirport } from '@/lib/airport'
import { pickupInstantMs } from '@/lib/prague-date'
import { TERMINAL_BOOKING_STATUSES, nextStepFor } from '@/lib/booking-status'
import { hasTripIdentity, type DriverTripRecord, type TripStepResponse } from '@/lib/driver-trip-step'

/**
 * No-show request (Phase 87 D-15, D-16). Server-only.
 *
 * The driver can only ASK: requestNoShowForDriver sets bookings.no_show_requested_at through the
 * set_no_show_request RPC (migration 084) once the free waiting time has passed, alerts the
 * operator (email now, Chatwoot private note through the outbox row) and changes nothing else.
 * It never changes bookings.status, never charges and never contacts the passenger. Only the
 * operator's confirmNoShow moves a booking to no_show, through the status service.
 *
 * The waiting time is computed here from database facts (pickup instant, latest on_location log
 * row, pricing_globals settings); the client timer is display only. Chatwoot is reached only
 * through the outbox row (lib/noshow-alert.ts runs in the dispatcher), never from this module.
 */

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

const DEFAULT_CITY_MIN = 30
const DEFAULT_AIRPORT_MIN = 60
const MIN_MS = 60_000
const AIRPORT_ADDRESS = /airport|letiště|letiste|václav havel|\bPRG\b/i

export type NoShowBody = TripStepResponse & {
  noShowAvailableAt?: string
  noShowRequestedAt?: string
}

export type NoShowRequestResult =
  | { httpStatus: 200 | 409 | 500; body: NoShowBody }
  | { httpStatus: 400; body: { error: 'invalid_token' } }

const INVALID_TOKEN = { httpStatus: 400, body: { error: 'invalid_token' } } as const

export function isAirportPickup(b: {
  origin_lat: number | null
  origin_lng: number | null
  origin_address: string | null
}): boolean {
  if (b.origin_lat !== null && b.origin_lng !== null && isNearAirport({ lat: b.origin_lat, lng: b.origin_lng })) {
    return true
  }
  return b.origin_address ? AIRPORT_ADDRESS.test(b.origin_address) : false
}

function validMinutes(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 240 ? v : fallback
}

/** pricing_globals id 1; the defaults 30 / 60 apply on any read problem. */
export async function getNoShowThresholds(
  supabase: ServiceClient,
): Promise<{ cityMin: number; airportMin: number }> {
  try {
    const { data, error } = await supabase
      .from('pricing_globals')
      .select('noshow_wait_city_min, noshow_wait_airport_min')
      .eq('id', 1)
      .single()
    if (error || !data) return { cityMin: DEFAULT_CITY_MIN, airportMin: DEFAULT_AIRPORT_MIN }
    const row = data as { noshow_wait_city_min?: unknown; noshow_wait_airport_min?: unknown }
    return {
      cityMin: validMinutes(row.noshow_wait_city_min, DEFAULT_CITY_MIN),
      airportMin: validMinutes(row.noshow_wait_airport_min, DEFAULT_AIRPORT_MIN),
    }
  } catch {
    return { cityMin: DEFAULT_CITY_MIN, airportMin: DEFAULT_AIRPORT_MIN }
  }
}

/** Later of the known instants plus the free waiting time; null when neither instant is known. */
export function noShowAvailableAtMs(input: {
  pickupMs: number | null
  onLocationMs: number | null
  thresholdMin: number
}): number | null {
  const known = [input.pickupMs, input.onLocationMs].filter((v): v is number => v !== null)
  if (known.length === 0) return null
  return Math.max(...known) + input.thresholdMin * MIN_MS
}

type LogRead = { ok: true; onLocationMs: number | null } | { ok: false }

/** Latest status_change row to on_location for the booking. */
async function readOnLocationMs(supabase: ServiceClient, bookingId: string): Promise<LogRead> {
  try {
    const { data, error } = await supabase
      .from('booking_status_log')
      .select('created_at')
      .eq('booking_id', bookingId)
      .eq('event', 'status_change')
      .eq('to_status', 'on_location')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return { ok: false }
    const rows = (data ?? []) as Array<{ created_at: string }>
    const ms = rows.length > 0 ? Date.parse(rows[0].created_at) : NaN
    return { ok: true, onLocationMs: Number.isFinite(ms) ? ms : null }
  } catch {
    return { ok: false }
  }
}

type Availability = { ok: true; availableAtMs: number | null } | { ok: false }

async function computeAvailability(
  supabase: ServiceClient,
  booking: DriverTripRecord['booking'],
): Promise<Availability> {
  const log = await readOnLocationMs(supabase, booking.id)
  if (!log.ok) return { ok: false }
  const thresholds = await getNoShowThresholds(supabase)
  const thresholdMin = isAirportPickup(booking) ? thresholds.airportMin : thresholds.cityMin
  return {
    ok: true,
    availableAtMs: noShowAvailableAtMs({
      pickupMs: pickupInstantMs(booking),
      onLocationMs: log.onLocationMs,
      thresholdMin,
    }),
  }
}

/** What the driver page needs: when the request unlocks (on_location only) and an open request. */
export async function getNoShowView(input: {
  supabase: ServiceClient
  booking: DriverTripRecord['booking']
  nowMs: number
}): Promise<{ noShowAvailableAt: string | null; noShowRequestedAt: string | null }> {
  const { supabase, booking } = input
  const noShowRequestedAt = booking.no_show_requested_at ?? null
  if (booking.status !== 'on_location') return { noShowAvailableAt: null, noShowRequestedAt }
  const a = await computeAvailability(supabase, booking)
  const noShowAvailableAt = a.ok && a.availableAtMs !== null ? new Date(a.availableAtMs).toISOString() : null
  return { noShowAvailableAt, noShowRequestedAt }
}

interface NoShowRpcResult {
  applied: boolean
  requestedAt: string | null
  status: string | null
}

/** The only caller of set_no_show_request. Null on an RPC error or a malformed answer. */
async function callSetNoShowRequest(
  supabase: ServiceClient,
  input: { bookingId: string; action: 'request' | 'clear'; actorType: 'admin' | 'driver'; actorId: string | null },
): Promise<NoShowRpcResult | null> {
  try {
    const { data, error } = await supabase.rpc('set_no_show_request', {
      p_booking_id: input.bookingId,
      p_action: input.action,
      p_actor_type: input.actorType,
      p_actor_id: input.actorId,
    })
    if (error || !data || typeof data !== 'object') return null
    const d = data as { applied?: unknown; no_show_requested_at?: unknown; status?: unknown }
    if (typeof d.applied !== 'boolean') return null
    return {
      applied: d.applied,
      requestedAt: typeof d.no_show_requested_at === 'string' ? d.no_show_requested_at : null,
      status: typeof d.status === 'string' ? d.status : null,
    }
  } catch {
    return null
  }
}

function conflict(status: string): NoShowRequestResult {
  return {
    httpStatus: 409,
    body: { ok: false, error: 'step_conflict', status, nextStep: nextStepFor(status) },
  }
}

/** Operator email + outbox row for an accepted request. Never throws, never fails the request. */
async function raiseAlerts(
  supabase: ServiceClient,
  trip: DriverTripRecord,
  requestedAt: string,
): Promise<void> {
  const booking = trip.booking
  const requestedMs = Date.parse(requestedAt)
  if (!Number.isFinite(requestedMs)) return

  // 1. Operator email, deduplicated per request.
  try {
    const manager = process.env.MANAGER_EMAIL
    if (manager) {
      const shouldSend = await logEmail({
        bookingId: booking.id,
        emailType: `no_show_request:${Math.floor(requestedMs / 1000)}`,
        recipient: manager,
      })
      if (shouldSend) {
        const [driverRes, bookingRes] = await Promise.all([
          supabase.from('drivers').select('name').eq('id', trip.assignmentDriverId).single(),
          supabase.from('bookings').select('booking_reference').eq('id', booking.id).single(),
        ])
        const driverName = (driverRes.data as { name?: string | null } | null)?.name ?? null
        const reference =
          (bookingRes.data as { booking_reference?: string | null } | null)?.booking_reference ?? booking.id
        after(() =>
          sendNoShowRequestAlert({
            bookingReference: reference,
            pickupDate: booking.pickup_date,
            pickupTime: booking.pickup_time,
            originAddress: booking.origin_address,
            driverName,
            requestedAt,
          }),
        )
      }
    }
  } catch {
    console.error('[no-show] operator email failed', { bookingId: booking.id })
  }

  // 2. Chatwoot private note through the outbox (the dispatcher delivers it).
  try {
    const key = noShowAlertKey(booking.id, requestedMs)
    const queued = await enqueueOutboxEvent({
      eventType: 'alert.no_show',
      aggregateType: 'booking',
      aggregateId: booking.id,
      idempotencyKey: key,
    })
    if (queued) dispatchAfterResponse(key)
  } catch {
    console.error('[no-show] outbox enqueue failed', { bookingId: booking.id })
  }
}

/**
 * D-15: the driver's no-show request. Order: identity, terminal, status must be on_location,
 * open request replay, server waiting time, RPC, alerts. Status is never changed here.
 */
export async function requestNoShowForDriver(input: {
  supabase: ServiceClient
  trip: DriverTripRecord
  nowMs: number
}): Promise<NoShowRequestResult> {
  const { supabase, trip, nowMs } = input
  const booking = trip.booking

  if (!hasTripIdentity(trip)) return INVALID_TOKEN
  if ((TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(booking.status)) return INVALID_TOKEN

  // Only while the driver is at the pickup point.
  if (booking.status !== 'on_location') return conflict(booking.status)

  // A request is already open: harmless repeat, no new alert.
  if (booking.no_show_requested_at) {
    return {
      httpStatus: 200,
      body: {
        ok: true,
        replay: true,
        status: booking.status,
        nextStep: nextStepFor(booking.status),
        noShowRequestedAt: booking.no_show_requested_at,
      },
    }
  }

  const availability = await computeAvailability(supabase, booking)
  if (!availability.ok) {
    return {
      httpStatus: 500,
      body: { ok: false, error: 'update_failed', status: booking.status, nextStep: nextStepFor(booking.status) },
    }
  }
  // With neither a pickup instant nor an arrival row there is no basis to hold the driver back
  // (the operator still decides); fail open like the start gate.
  if (availability.availableAtMs !== null && nowMs < availability.availableAtMs) {
    return {
      httpStatus: 409,
      body: {
        ok: false,
        error: 'too_early',
        status: booking.status,
        nextStep: nextStepFor(booking.status),
        noShowAvailableAt: new Date(availability.availableAtMs).toISOString(),
      },
    }
  }

  const rpc = await callSetNoShowRequest(supabase, {
    bookingId: booking.id,
    action: 'request',
    actorType: 'driver',
    actorId: trip.assignmentDriverId,
  })
  if (!rpc) {
    return {
      httpStatus: 500,
      body: { ok: false, error: 'update_failed', status: booking.status, nextStep: nextStepFor(booking.status) },
    }
  }

  if (!rpc.applied) {
    // Lost a race: someone else's request is open, or the status moved on.
    if (rpc.status === 'on_location' && rpc.requestedAt) {
      return {
        httpStatus: 200,
        body: {
          ok: true,
          replay: true,
          status: 'on_location',
          nextStep: nextStepFor('on_location'),
          noShowRequestedAt: rpc.requestedAt,
        },
      }
    }
    return conflict(rpc.status ?? booking.status)
  }

  const requestedAt = rpc.requestedAt ?? new Date(nowMs).toISOString()
  await raiseAlerts(supabase, trip, requestedAt)

  return {
    httpStatus: 200,
    body: {
      ok: true,
      status: 'on_location',
      nextStep: nextStepFor('on_location'),
      noShowRequestedAt: requestedAt,
    },
  }
}

/** D-16 a, "Client found": clears an open request (idempotent). */
export async function clearNoShowRequest(input: {
  bookingId: string
  actor: { type: 'admin'; id: string | null }
}): Promise<{ applied: boolean; ok: boolean }> {
  const supabase = createSupabaseServiceClient()
  const rpc = await callSetNoShowRequest(supabase, {
    bookingId: input.bookingId,
    action: 'clear',
    actorType: input.actor.type,
    actorId: input.actor.id,
  })
  return { applied: rpc?.applied ?? false, ok: rpc !== null }
}

/** D-16 a: the operator confirms the no-show; the only path to no_show, through the status service. */
export async function confirmNoShow(input: {
  bookingId: string
  actor: Extract<StatusActor, { type: 'admin' }>
  expectedFrom?: string
}): Promise<AdvanceBookingStatusResult> {
  return advanceBookingStatus({
    bookingId: input.bookingId,
    to: 'no_show',
    expectedFrom: input.expectedFrom,
    actor: input.actor,
    source: 'admin_no_show',
    profile: 'full',
  })
}
