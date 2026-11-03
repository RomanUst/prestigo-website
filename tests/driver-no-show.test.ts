import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 87 Plan 09 (D-15, D-16 b): the driver's no-show request. The server computes the
// earliest allowed instant from DB facts (pickup instant, latest on_location log row, settings),
// sets no_show_requested_at through the set_no_show_request RPC (no status change, no money) and
// raises the operator alerts (email + outbox row). These tests drive requestNoShowForDriver
// directly and the route POST for the strict-schema cases.

const afterCallbacks: Array<() => unknown> = []

const {
  mockAdvance,
  mockLogEmail,
  mockSendAlert,
  mockEnqueue,
  mockDispatch,
  mockFrom,
  mockRpc,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockAdvance: vi.fn(),
  mockLogEmail: vi.fn(),
  mockSendAlert: vi.fn(),
  mockEnqueue: vi.fn(),
  mockDispatch: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn)
    },
  }
})

vi.mock('@/lib/booking-status-service', () => ({ advanceBookingStatus: mockAdvance }))
vi.mock('@/lib/email-log', () => ({ logEmail: mockLogEmail }))
vi.mock('@/lib/email', () => ({ sendNoShowRequestAlert: mockSendAlert }))
vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return { ...actual, enqueueOutboxEvent: mockEnqueue, dispatchAfterResponse: mockDispatch }
})
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { POST } from '@/app/api/driver/trip/[token]/progress/route'
import {
  requestNoShowForDriver,
  type NoShowBody,
  noShowAvailableAtMs,
  isAirportPickup,
  getNoShowThresholds,
  getNoShowView,
} from '@/lib/no-show'
import { driverTripRequestSchema, type DriverTripRecord } from '@/lib/driver-trip-step'
import { noShowAlertKey } from '@/lib/outbox'
import { pickupInstantMs } from '@/lib/prague-date'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const bookingId = 'b0000001-0000-4000-8000-000000000001'
const MIN = 60_000

// City pickup 14:00 Europe/Prague on 2026-11-12 (CET, UTC+1) = 13:00Z.
const PICKUP = '2026-11-12T13:00:00Z'
const PICKUP_MS = Date.parse(PICKUP)
const REQUESTED_AT = '2026-11-12T13:40:00.123Z'

function bookingRow(overrides: Partial<DriverTripRecord['booking']> = {}): DriverTripRecord['booking'] {
  return {
    id: bookingId,
    status: 'on_location',
    driver_id: driverId,
    booking_source: 'online',
    amount_eur: 120,
    pickup_utc: PICKUP,
    pickup_date: '2026-11-12',
    pickup_time: '14:00',
    origin_lat: 50.087,
    origin_lng: 14.421,
    origin_address: 'Old Town Square, Prague',
    completed_at: null,
    no_show_requested_at: null,
    ...overrides,
  }
}

function tripRecord(
  bookingOverrides: Partial<DriverTripRecord['booking']> = {},
  overrides: Partial<Omit<DriverTripRecord, 'booking'>> = {},
): DriverTripRecord {
  return {
    assignmentId: 'assign-1',
    assignmentDriverId: driverId,
    assignmentStatus: 'accepted',
    booking: bookingRow(bookingOverrides),
    ...overrides,
  }
}

// A thenable chain: every builder method returns the chain, .single() and await resolve to result.
function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit']) c[m] = vi.fn(() => c)
  c.single = vi.fn(async () => result)
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

interface World {
  settings?: unknown
  onLocationLog?: unknown
  driverName?: string | null
  reference?: string
}

function installWorld(w: World = {}) {
  const settings =
    w.settings === undefined
      ? { data: { noshow_wait_city_min: 30, noshow_wait_airport_min: 60 }, error: null }
      : w.settings
  const log =
    w.onLocationLog === undefined
      ? { data: [{ created_at: '2026-11-12T13:10:00Z' }], error: null }
      : w.onLocationLog
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'pricing_globals':
        return chain(settings)
      case 'booking_status_log':
        return chain(log)
      case 'drivers':
        return chain({ data: { name: w.driverName === undefined ? 'John Driver' : w.driverName }, error: null })
      case 'bookings':
        return chain({ data: { booking_reference: w.reference ?? 'PRG-2026-0042' }, error: null })
      default:
        throw new Error(`unexpected table ${table}`)
    }
  })
}

function rpcApplied(requestedAt = REQUESTED_AT) {
  mockRpc.mockResolvedValue({
    data: { applied: true, no_show_requested_at: requestedAt, status: 'on_location' },
    error: null,
  })
}

async function runAfter() {
  for (const fn of afterCallbacks.splice(0)) await fn()
}

function supabase() {
  return { from: mockFrom, rpc: mockRpc } as unknown as Parameters<typeof requestNoShowForDriver>[0]['supabase']
}

describe('noShowAvailableAtMs / isAirportPickup / thresholds', () => {
  it('takes the later of pickup and on_location, plus the threshold', () => {
    expect(noShowAvailableAtMs({ pickupMs: 1_000_000, onLocationMs: 2_000_000, thresholdMin: 30 })).toBe(2_000_000 + 30 * MIN)
    expect(noShowAvailableAtMs({ pickupMs: 2_000_000, onLocationMs: 1_000_000, thresholdMin: 30 })).toBe(2_000_000 + 30 * MIN)
  })

  it('uses the one instant that is known, and null when neither is', () => {
    expect(noShowAvailableAtMs({ pickupMs: 5_000, onLocationMs: null, thresholdMin: 1 })).toBe(5_000 + MIN)
    expect(noShowAvailableAtMs({ pickupMs: null, onLocationMs: 5_000, thresholdMin: 1 })).toBe(5_000 + MIN)
    expect(noShowAvailableAtMs({ pickupMs: null, onLocationMs: null, thresholdMin: 30 })).toBeNull()
  })

  it('detects an airport pickup by coordinates or by address', () => {
    expect(isAirportPickup({ origin_lat: 50.1008, origin_lng: 14.26, origin_address: 'X' })).toBe(true)
    expect(isAirportPickup({ origin_lat: null, origin_lng: null, origin_address: 'Václav Havel Airport Prague' })).toBe(true)
    expect(isAirportPickup({ origin_lat: null, origin_lng: null, origin_address: 'Letiště Václava Havla' })).toBe(true)
    expect(isAirportPickup({ origin_lat: null, origin_lng: null, origin_address: 'PRG Terminal 2' })).toBe(true)
    expect(isAirportPickup({ origin_lat: 50.087, origin_lng: 14.421, origin_address: 'Old Town Square' })).toBe(false)
    expect(isAirportPickup({ origin_lat: null, origin_lng: null, origin_address: null })).toBe(false)
  })

  it('reads the thresholds and falls back to 30 / 60 on any error', async () => {
    installWorld()
    expect(await getNoShowThresholds(supabase())).toEqual({ cityMin: 30, airportMin: 60 })
    installWorld({ settings: { data: { noshow_wait_city_min: 45, noshow_wait_airport_min: 90 }, error: null } })
    expect(await getNoShowThresholds(supabase())).toEqual({ cityMin: 45, airportMin: 90 })
    installWorld({ settings: { data: null, error: { message: 'boom' } } })
    expect(await getNoShowThresholds(supabase())).toEqual({ cityMin: 30, airportMin: 60 })
    installWorld({ settings: { data: { noshow_wait_city_min: 0, noshow_wait_airport_min: 'x' }, error: null } })
    expect(await getNoShowThresholds(supabase())).toEqual({ cityMin: 30, airportMin: 60 })
  })
})

describe('requestNoShowForDriver', () => {
  const OLD_ENV = process.env.MANAGER_EMAIL

  beforeEach(() => {
    vi.clearAllMocks()
    afterCallbacks.length = 0
    process.env.MANAGER_EMAIL = 'ops@example.com'
    mockLogEmail.mockResolvedValue(true)
    mockSendAlert.mockResolvedValue(undefined)
    mockEnqueue.mockResolvedValue(true)
    installWorld()
    rpcApplied()
  })

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.MANAGER_EMAIL
    else process.env.MANAGER_EMAIL = OLD_ENV
  })

  it('city pickup: one minute early is 409 too_early with noShowAvailableAt and no RPC', async () => {
    const nowMs = Date.parse('2026-11-12T13:39:00Z')
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs })
    expect(r.httpStatus).toBe(409)
    expect(r.body).toMatchObject({
      ok: false,
      error: 'too_early',
      status: 'on_location',
      nextStep: 'on_board',
      noShowAvailableAt: '2026-11-12T13:40:00.000Z',
    })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('city pickup: at the threshold the request is accepted, alerted once, status untouched', async () => {
    const nowMs = Date.parse('2026-11-12T13:40:00Z')
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs })
    expect(r.httpStatus).toBe(200)
    expect(r.body).toMatchObject({
      ok: true,
      status: 'on_location',
      nextStep: 'on_board',
      noShowRequestedAt: REQUESTED_AT,
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('set_no_show_request', {
      p_booking_id: bookingId,
      p_action: 'request',
      p_actor_type: 'driver',
      p_actor_id: driverId,
    })

    const requestedMs = Date.parse(REQUESTED_AT)
    expect(mockLogEmail).toHaveBeenCalledTimes(1)
    const logArg = mockLogEmail.mock.calls[0][0]
    expect(logArg.bookingId).toBe(bookingId)
    expect(logArg.emailType.startsWith('no_show_request:')).toBe(true)
    expect(logArg.recipient).toBe('ops@example.com')

    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    expect(mockEnqueue).toHaveBeenCalledWith({
      eventType: 'alert.no_show',
      aggregateType: 'booking',
      aggregateId: bookingId,
      idempotencyKey: noShowAlertKey(bookingId, requestedMs),
    })
    expect(mockDispatch).toHaveBeenCalledWith(noShowAlertKey(bookingId, requestedMs))

    await runAfter()
    expect(mockSendAlert).toHaveBeenCalledTimes(1)
    const mail = mockSendAlert.mock.calls[0][0]
    expect(mail).toMatchObject({
      bookingReference: 'PRG-2026-0042',
      pickupDate: '2026-11-12',
      pickupTime: '14:00',
      originAddress: 'Old Town Square, Prague',
      driverName: 'John Driver',
      requestedAt: REQUESTED_AT,
    })

    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it('airport pickup by coordinates uses the 60 minute threshold', async () => {
    const trip = tripRecord({ origin_lat: 50.1008, origin_lng: 14.26 })
    const early = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: Date.parse('2026-11-12T13:40:00Z') })
    expect(early.httpStatus).toBe(409)
    expect((early.body as NoShowBody).noShowAvailableAt).toBe('2026-11-12T14:10:00.000Z')
    const ok = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: Date.parse('2026-11-12T14:10:00Z') })
    expect(ok.httpStatus).toBe(200)
  })

  it('airport pickup by address uses the 60 minute threshold', async () => {
    const trip = tripRecord({ origin_lat: null, origin_lng: null, origin_address: 'Václav Havel Airport Prague' })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: Date.parse('2026-11-12T13:50:00Z') })
    expect(r.httpStatus).toBe(409)
    expect((r.body as NoShowBody).noShowAvailableAt).toBe('2026-11-12T14:10:00.000Z')
  })

  it('uses the settings values, not the defaults', async () => {
    installWorld({ settings: { data: { noshow_wait_city_min: 45, noshow_wait_airport_min: 90 }, error: null } })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:40:00Z') })
    expect(r.httpStatus).toBe(409)
    expect((r.body as NoShowBody).noShowAvailableAt).toBe('2026-11-12T13:55:00.000Z')
  })

  it('driver arrived before pickup: the base is the pickup time', async () => {
    installWorld({ onLocationLog: { data: [{ created_at: '2026-11-12T12:50:00Z' }], error: null } })
    const trip = tripRecord()
    const early = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: Date.parse('2026-11-12T13:29:00Z') })
    expect(early.httpStatus).toBe(409)
    expect((early.body as NoShowBody).noShowAvailableAt).toBe(new Date(PICKUP_MS + 30 * MIN).toISOString())
    const ok = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: PICKUP_MS + 30 * MIN })
    expect(ok.httpStatus).toBe(200)
  })

  it('no on_location log row: the base is the pickup instant', async () => {
    installWorld({ onLocationLog: { data: [], error: null } })
    const trip = tripRecord()
    const early = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: PICKUP_MS + 29 * MIN })
    expect(early.httpStatus).toBe(409)
    const ok = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: PICKUP_MS + 30 * MIN })
    expect(ok.httpStatus).toBe(200)
  })

  it('pickup instant follows lib/prague-date (no pickup_utc, DST-safe wall clock)', async () => {
    installWorld({ onLocationLog: { data: [], error: null } })
    const trip = tripRecord({ pickup_utc: null })
    const base = pickupInstantMs({ pickup_utc: null, pickup_date: '2026-11-12', pickup_time: '14:00' })!
    expect(base).toBe(PICKUP_MS)
    const r = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: base + 30 * MIN - 1 })
    expect(r.httpStatus).toBe(409)
  })

  it('a request that is already open is a 200 replay: no RPC, no email, no outbox row', async () => {
    const trip = tripRecord({ no_show_requested_at: REQUESTED_AT })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip, nowMs: Date.parse('2026-11-12T15:00:00Z') })
    expect(r.httpStatus).toBe(200)
    expect(r.body).toMatchObject({ ok: true, replay: true, status: 'on_location', noShowRequestedAt: REQUESTED_AT })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
    await runAfter()
    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it.each(['assigned', 'en_route', 'on_board'])('status %s is 409 step_conflict and never reaches the RPC', async status => {
    const r = await requestNoShowForDriver({
      supabase: supabase(),
      trip: tripRecord({ status }),
      nowMs: Date.parse('2026-11-12T20:00:00Z'),
    })
    expect(r.httpStatus).toBe(409)
    expect(r.body).toMatchObject({ ok: false, error: 'step_conflict', status })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'no_show'])('terminal status %s is invalid_token', async status => {
    const r = await requestNoShowForDriver({
      supabase: supabase(),
      trip: tripRecord({ status }),
      nowMs: Date.parse('2026-11-12T20:00:00Z'),
    })
    expect(r.httpStatus).toBe(400)
    expect(r.body).toEqual({ error: 'invalid_token' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('a reassigned or declined link is invalid_token', async () => {
    const reassigned = await requestNoShowForDriver({
      supabase: supabase(),
      trip: tripRecord({ driver_id: 'a0000009-0000-4000-8000-000000000009' }),
      nowMs: Date.parse('2026-11-12T20:00:00Z'),
    })
    expect(reassigned.httpStatus).toBe(400)
    const declined = await requestNoShowForDriver({
      supabase: supabase(),
      trip: tripRecord({}, { assignmentStatus: 'declined' }),
      nowMs: Date.parse('2026-11-12T20:00:00Z'),
    })
    expect(declined.httpStatus).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('pricing_globals read failure falls back to 30 / 60', async () => {
    installWorld({ settings: { data: null, error: { message: 'down' } } })
    const early = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:39:00Z') })
    expect(early.httpStatus).toBe(409)
    const ok = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:40:00Z') })
    expect(ok.httpStatus).toBe(200)
  })

  it('a lost race (RPC applied false, request already set) answers as a replay with no new alert', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: false, no_show_requested_at: REQUESTED_AT, status: 'on_location' },
      error: null,
    })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(200)
    expect(r.body).toMatchObject({ ok: true, replay: true, noShowRequestedAt: REQUESTED_AT })
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockLogEmail).not.toHaveBeenCalled()
  })

  it('a lost race where the status moved on is 409 step_conflict with the current status', async () => {
    mockRpc.mockResolvedValue({
      data: { applied: false, no_show_requested_at: null, status: 'on_board' },
      error: null,
    })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(409)
    expect(r.body).toMatchObject({ ok: false, error: 'step_conflict', status: 'on_board' })
  })

  it('an RPC error is 500 update_failed and alerts nothing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(500)
    expect(r.body).toMatchObject({ ok: false, error: 'update_failed' })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('a failing log read is 500 (the threshold cannot be proven) and writes nothing', async () => {
    installWorld({ onLocationLog: { data: null, error: { message: 'down' } } })
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(500)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('email and outbox failures never fail the request', async () => {
    mockLogEmail.mockRejectedValue(new Error('smtp'))
    mockEnqueue.mockRejectedValue(new Error('outbox'))
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(200)
    expect(r.body).toMatchObject({ ok: true, noShowRequestedAt: REQUESTED_AT })
  })

  it('a deduped email (logEmail false) sends nothing but still enqueues the outbox row', async () => {
    mockLogEmail.mockResolvedValue(false)
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(200)
    await runAfter()
    expect(mockSendAlert).not.toHaveBeenCalled()
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it('a failed enqueue dispatches nothing', async () => {
    mockEnqueue.mockResolvedValue(false)
    await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('without MANAGER_EMAIL no operator email is attempted', async () => {
    delete process.env.MANAGER_EMAIL
    const r = await requestNoShowForDriver({ supabase: supabase(), trip: tripRecord(), nowMs: Date.parse('2026-11-12T13:41:00Z') })
    expect(r.httpStatus).toBe(200)
    expect(mockLogEmail).not.toHaveBeenCalled()
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })
})

describe('getNoShowView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installWorld()
  })

  it('on_location: the availability instant is computed server side', async () => {
    const v = await getNoShowView({ supabase: supabase(), booking: bookingRow(), nowMs: 0 })
    expect(v).toEqual({ noShowAvailableAt: '2026-11-12T13:40:00.000Z', noShowRequestedAt: null })
  })

  it('on_location with an open request returns it', async () => {
    const v = await getNoShowView({
      supabase: supabase(),
      booking: bookingRow({ no_show_requested_at: REQUESTED_AT }),
      nowMs: 0,
    })
    expect(v.noShowRequestedAt).toBe(REQUESTED_AT)
  })

  it('other statuses have no availability and no database reads', async () => {
    const v = await getNoShowView({ supabase: supabase(), booking: bookingRow({ status: 'en_route' }), nowMs: 0 })
    expect(v).toEqual({ noShowAvailableAt: null, noShowRequestedAt: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('driverTripRequestSchema: request_no_show', () => {
  it('accepts only the strict action', () => {
    expect(driverTripRequestSchema.safeParse({ action: 'request_no_show' }).success).toBe(true)
  })

  it.each([
    { action: 'request_no_show', status: 'no_show' },
    { action: 'no_show' },
    { action: 'request_no_show', amount: 10 },
    { action: 'confirm' },
    { status: 'no_show' },
    { step: 'no_show' },
  ])('rejects %j', body => {
    expect(driverTripRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('driver route: request_no_show', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    afterCallbacks.length = 0
    mockCheckRateLimit.mockResolvedValue({ allowed: true })
    mockLogEmail.mockResolvedValue(true)
    mockEnqueue.mockResolvedValue(true)
  })

  function req(body: unknown) {
    return new Request(`http://localhost/api/driver/trip/${validToken}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  const params = { params: Promise.resolve({ token: validToken }) }

  it.each([
    { action: 'request_no_show', status: 'no_show' },
    { action: 'no_show' },
  ])('rejects %j with 400 Invalid payload before any lookup', async body => {
    const res = await POST(req(body), params)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payload' })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('routes the action through the lookup and the request (end to end)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'driver_assignments') {
        return chain({
          data: {
            id: 'assign-1',
            driver_id: driverId,
            status: 'accepted',
            bookings: bookingRow({ no_show_requested_at: REQUESTED_AT }),
          },
          error: null,
        })
      }
      throw new Error(`unexpected table ${table}`)
    })
    const res = await POST(req({ action: 'request_no_show' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, replay: true, noShowRequestedAt: REQUESTED_AT })
    expect(mockAdvance).not.toHaveBeenCalled()
  })
})
