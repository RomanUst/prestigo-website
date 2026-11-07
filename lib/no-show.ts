import { after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { advanceBookingStatus, type AdvanceBookingStatusResult, type StatusActor } from '@/lib/booking-status-service'
import { logEmail } from '@/lib/email-log'
import { sendNoShowRequestAlert } from '@/lib/email'
import { dispatchAfterResponse, enqueueOutboxEvent, noShowAlertKey } from '@/lib/outbox'
import { getNoShowThresholds, isAirportPickup } from '@/lib/no-show-wait'
import { pickupInstantMs } from '@/lib/prague-date'
import { TERMINAL_BOOKING_STATUSES, nextStepFor } from '@/lib/booking-status'
import { hasTripIdentity, type DriverTripRecord, type TripStepResponse } from '@/lib/driver-trip-step'
import { feeBaseNow, isFeeEligible, openFeeCase } from '@/lib/payments/fee'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'

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

const MIN_MS = 60_000

export type NoShowBody = TripStepResponse & {
  noShowAvailableAt?: string
  noShowRequestedAt?: string
}

export type NoShowRequestResult =
  | { httpStatus: 200 | 409 | 500; body: NoShowBody }
  | { httpStatus: 400; body: { error: 'invalid_token' } }

const INVALID_TOKEN = { httpStatus: 400, body: { error: 'invalid_token' } } as const

// Moved to lib/no-show-wait.ts (Phase 89) so the payment emails can use them without this module's import graph.
export { getNoShowThresholds, isAirportPickup }

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

export type NoShowConfirmCode = 'not_on_location' | 'no_request' | 'wait_not_elapsed'

/**
 * WR-04: a booking becomes no_show only when it is on_location, the driver asked (no_show_requested_at is set, and
 * that request was itself checked against the server wait) and, belt and braces, the wait has passed again with the
 * LIVE thresholds (a threshold raised after the request holds the confirm back). Pure; null means confirmable.
 * `onLocationMs` is the latest arrival instant from booking_status_log (null when unknown).
 */
export function assertNoShowConfirmable(
  booking: DriverTripRecord['booking'],
  thresholds: { cityMin: number; airportMin: number },
  nowMs: number,
  onLocationMs: number | null,
): { code: NoShowConfirmCode; availableAtMs?: number } | null {
  if (booking.status !== 'on_location') return { code: 'not_on_location' }
  if (!booking.no_show_requested_at) return { code: 'no_request' }
  const thresholdMin = isAirportPickup(booking) ? thresholds.airportMin : thresholds.cityMin
  const availableAtMs = noShowAvailableAtMs({ pickupMs: pickupInstantMs(booking), onLocationMs, thresholdMin })
  // The request itself is the evidence when neither instant is known (same fail-open as the driver's request).
  if (availableAtMs !== null && nowMs < availableAtMs) return { code: 'wait_not_elapsed', availableAtMs }
  return null
}

export type NoShowRefusal = { ok: false; code: NoShowConfirmCode; message: string; noShowAvailableAt?: string }

export type ConfirmNoShowResult = AdvanceBookingStatusResult | NoShowRefusal

export function isNoShowRefusal(r: ConfirmNoShowResult): r is NoShowRefusal {
  return !r.ok && (r.code === 'not_on_location' || r.code === 'no_request' || r.code === 'wait_not_elapsed')
}

const iso = (ms: number | null): string | null => (ms !== null && Number.isFinite(ms) ? new Date(ms).toISOString() : null)

/** The newest no_show_requested log row: when it was asked and by whom. Null on a read problem or no row. */
async function readRequestRow(
  supabase: ServiceClient,
  bookingId: string,
): Promise<{ requestedAt: string | null; driverId: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from('booking_status_log')
      .select('created_at, actor_type, actor_id')
      .eq('booking_id', bookingId)
      .eq('event', 'no_show_requested')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return null
    const row = ((data ?? []) as Array<{ created_at: string; actor_type: string; actor_id: string | null }>)[0]
    if (!row) return null
    return { requestedAt: row.created_at, driverId: row.actor_type === 'driver' ? row.actor_id : null }
  } catch {
    return null
  }
}

/** The no-show stands but no case exists: without this mail nobody would know that a decision is missing. */
function alertCaseMissing(booking: Record<string, unknown>): void {
  const bookingId = String(booking.id)
  after(async () => {
    try {
      await sendPaymentOperatorAlert('fee_no_show_needed', booking, {
        eventKey: `alert:fee_no_show_needed:${bookingId}:case_missing`,
        note: 'case_missing',
      })
    } catch {
      console.error('[no-show] operator alert failed', { bookingId })
    }
  })
}

/**
 * CASH-03, D-13: after the status applied, open the one pending no-show case with the evidence snapshot and raise the
 * operator alert once. Charges nothing and never touches the hold. Never throws and never reverts the status: a
 * failure here is logged with ids and alerted, and the operator opens the case by hand from the booking (open_case on the
 * fee route, lib/payments/fee-reopen.ts).
 */
async function openNoShowCase(input: {
  supabase: ServiceClient
  booking: Record<string, unknown>
  actor: Extract<StatusActor, { type: 'admin' }>
  thresholdMin: number
  onLocationMs: number | null
  nowMs: number
}): Promise<void> {
  const { supabase, booking, actor } = input
  const bookingId = String(booking.id)
  try {
    // Partner bookings and bookings with no card and no money get a status and no case (Pitfall 15).
    if (!isFeeEligible(booking)) return
    // CR-03: a pay-now base is this row's share of what the PaymentIntent received, in its currency.
    const base = await feeBaseNow(booking)
    if (!base) {
      // Money review 2, IN-01: a pay-now row with nothing left behind its PaymentIntent (fully refunded, a stale intent) has
      // no fee to decide, so there is no case and no alert. A card row without an amount is a broken row: the operator is told.
      if (booking.payment_mode === 'pay_now') {
        console.warn('[no-show] nothing held for this pay-now booking, no case', { bookingId })
        return
      }
      console.error('[no-show] no fee base, case not opened', { bookingId })
      alertCaseMissing(booking)
      return
    }

    const request = await readRequestRow(supabase, bookingId)
    const requestedAt =
      request?.requestedAt ?? (typeof booking.no_show_requested_at === 'string' ? booking.no_show_requested_at : null)
    const driverId = request?.driverId ?? (typeof booking.driver_id === 'string' ? booking.driver_id : null)
    const pickupMs = pickupInstantMs(booking as unknown as Parameters<typeof pickupInstantMs>[0])
    // Short facts only (no names, no free text): a later settings change can not rewrite them.
    const evidence = {
      pickup_utc: iso(pickupMs),
      on_location_at: iso(input.onLocationMs),
      requested_at: requestedAt,
      threshold_min: input.thresholdMin,
      airport: isAirportPickup(booking as unknown as Parameters<typeof isAirportPickup>[0]),
      confirmed_at: new Date(input.nowMs).toISOString(),
      driver_id: driverId,
    }

    const { caseRow, created } = await openFeeCase({
      booking,
      kind: 'no_show',
      baseMinor: base.baseMinor,
      currency: base.currency,
      // UI-SPEC 2.3: no-show has no percent setting, the full fare is proposed.
      proposedMinor: base.baseMinor,
      evidence,
      actor: { type: 'admin', id: actor.id },
    })
    if (!created) return

    const details = {
      eventKey: `alert:fee_no_show_needed:${caseRow.id}`,
      proposedMinor: caseRow.proposed_minor,
      arrivedAt: evidence.on_location_at,
      requestedAt,
      thresholdMin: input.thresholdMin,
    }
    // A pay-now row has no payment_currency: the operator reads the currency of the case.
    const alertRow = { ...booking, payment_currency: caseRow.currency }
    after(async () => {
      try {
        await sendPaymentOperatorAlert('fee_no_show_needed', alertRow, details)
      } catch {
        console.error('[no-show] operator alert failed', { bookingId })
      }
    })
  } catch (err) {
    // The status already applied and stays. The log line carries ids only.
    console.error('[no-show] fee case not opened after no_show', {
      bookingId,
      error: err instanceof Error ? err.message : 'unknown',
    })
    alertCaseMissing(booking)
  }
}

/**
 * D-16 a: the operator confirms the no-show; the only path to no_show, through the status service. WR-04 gate first
 * (assertNoShowConfirmable, live thresholds), then the status, then the pending fee case with its evidence.
 */
export async function confirmNoShow(input: {
  bookingId: string
  actor: Extract<StatusActor, { type: 'admin' }>
  expectedFrom?: string
}): Promise<ConfirmNoShowResult> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.from('bookings').select('*').eq('id', input.bookingId).single()
  if (error || !data) return { ok: false, code: 'not_found', message: 'Booking not found' }
  const booking = data as DriverTripRecord['booking'] & Record<string, unknown>

  // Stale-view guard first, so a tab that saw another status gets the same status_conflict as everywhere else.
  if (input.expectedFrom !== undefined && input.expectedFrom !== booking.status) {
    return { ok: false, code: 'conflict', message: 'status_conflict', currentStatus: booking.status }
  }

  // A card charge is running on the row (cancelBooking answers busy too): no_show would leave it in capturing for good.
  if (booking.payment_state === 'capturing') {
    return { ok: false, code: 'conflict', message: 'status_conflict', currentStatus: booking.status }
  }

  const nowMs = Date.now()
  const log = await readOnLocationMs(supabase, input.bookingId)
  // Money follows this status: an unreadable log is a refusal, not a guess.
  if (!log.ok) return { ok: false, code: 'db_error', message: 'DB update failed' }
  const thresholds = await getNoShowThresholds(supabase)
  const refusal = assertNoShowConfirmable(booking, thresholds, nowMs, log.onLocationMs)
  if (refusal) {
    return {
      ok: false,
      code: refusal.code,
      message: refusal.code,
      ...(refusal.availableAtMs !== undefined ? { noShowAvailableAt: new Date(refusal.availableAtMs).toISOString() } : {}),
    }
  }

  const result = await advanceBookingStatus({
    bookingId: input.bookingId,
    to: 'no_show',
    expectedFrom: booking.status,
    actor: input.actor,
    source: 'admin_no_show',
    profile: 'full',
    current: booking,
  })
  if (!result.ok) return result

  await openNoShowCase({
    supabase,
    booking: { ...booking, ...result.booking },
    actor: input.actor,
    thresholdMin: isAirportPickup(booking) ? thresholds.airportMin : thresholds.cityMin,
    onLocationMs: log.onLocationMs,
    nowMs,
  })
  return result
}
