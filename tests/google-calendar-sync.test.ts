import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync } from 'crypto'

// ── vi.hoisted stubs ─────────────────────────────────────────────────────────

const { mockMaybeSingle } = vi.hoisted(() => ({ mockMaybeSingle: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  })),
}))

import {
  buildCalendarEvent,
  calendarEventId,
  estimateDurationMinutes,
  syncBookingToCalendar,
  type CalendarBooking,
} from '@/lib/google-calendar'
import { POST } from '@/app/api/webhooks/booking-calendar/route'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOOKING_ID = '0b7c6a52-1f7e-4d0e-9a51-3c2d1e0f9a88'

const BOOKING: CalendarBooking & { driver_assignments: unknown[] } = {
  id: BOOKING_ID,
  booking_reference: 'PRG-123',
  status: 'confirmed',
  trip_type: 'transfer',
  leg: null,
  pickup_utc: '2026-10-05T08:00:00.000Z',
  hours: null,
  distance_km: 20,
  origin_address: 'Václav Havel Airport Prague',
  destination_address: 'Hotel Paris Prague',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 2,
  client_first_name: 'Anna',
  client_last_name: 'Novak',
  client_phone: '+420123456789',
  client_email: 'anna@example.com',
  flight_number: 'OK123',
  terminal: '1',
  special_requests: null,
  operator_notes: null,
  extra_child_seat: false,
  extra_meet_greet: true,
  driver_assignments: [],
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

type FetchCall = { url: string; method: string; body?: string }
let calls: FetchCall[]
let responder: (call: FetchCall) => Response

beforeEach(() => {
  calls = []
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'ops@group.calendar.google.com')
  vi.stubEnv('GOOGLE_CALENDAR_SA_EMAIL', 'sync@proj.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_CALENDAR_SA_KEY', PEM.replace(/\n/g, '\\n'))
  vi.stubEnv('GCAL_SYNC_SECRET', 'test-secret')
  mockMaybeSingle.mockReset()
  responder = () => new Response('{}', { status: 200 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? 'GET', body: init?.body?.toString() }
    calls.push(call)
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
    }
    return responder(call)
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const apiCalls = () => calls.filter((c) => !c.url.includes('oauth2'))

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('calendar event helpers', () => {
  it('derives a valid base32hex event id from the booking uuid', () => {
    const id = calendarEventId(BOOKING_ID)
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/)
    expect(id).toBe(calendarEventId(BOOKING_ID))
  })

  it('estimates duration: hourly uses hours, transfers min 1h', () => {
    expect(estimateDurationMinutes({ hours: 3, distance_km: null })).toBe(180)
    expect(estimateDurationMinutes({ hours: null, distance_km: 20 })).toBe(60)
    expect(estimateDurationMinutes({ hours: null, distance_km: 350 })).toBe(315)
    expect(estimateDurationMinutes({ hours: null, distance_km: null })).toBe(60)
  })

  it('builds an event with route, client and flight details', () => {
    const ev = buildCalendarEvent({ ...BOOKING, driver_name: 'Petr (accepted)' })
    expect(ev.summary).toBe('PRG-123 · Anna Novak · Business')
    expect(ev.start.dateTime).toBe('2026-10-05T08:00:00.000Z')
    expect(ev.end.dateTime).toBe('2026-10-05T09:00:00.000Z')
    expect(ev.location).toBe('Václav Havel Airport Prague')
    expect(ev.description).toContain('Route: Václav Havel Airport Prague → Hotel Paris Prague')
    expect(ev.description).toContain('Flight: OK123 (T1)')
    expect(ev.description).toContain('Extras: Meet & greet')
    expect(ev.description).toContain('Driver: Petr (accepted)')
    expect(ev.description).not.toContain('null')
    expect(ev.colorId).toBeUndefined()
  })

  it('greys out completed trips', () => {
    expect(buildCalendarEvent({ ...BOOKING, status: 'completed' }).colorId).toBe('8')
  })
})

// ── Sync ─────────────────────────────────────────────────────────────────────

describe('syncBookingToCalendar', () => {
  it('skips when not configured', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_SA_KEY', '')
    expect(await syncBookingToCalendar(BOOKING_ID)).toEqual({ action: 'skipped', reason: 'not_configured' })
    expect(calls).toHaveLength(0)
  })

  it('updates the event in place for an accepted booking', async () => {
    mockMaybeSingle.mockResolvedValue({ data: BOOKING, error: null })
    expect(await syncBookingToCalendar(BOOKING_ID)).toEqual({ action: 'upserted' })
    const [put] = apiCalls()
    expect(put.method).toBe('PUT')
    expect(put.url).toContain(`/events/${calendarEventId(BOOKING_ID)}`)
  })

  it('inserts with the deterministic id when the event does not exist yet', async () => {
    mockMaybeSingle.mockResolvedValue({ data: BOOKING, error: null })
    responder = (c) => new Response('{}', { status: c.method === 'PUT' ? 404 : 200 })
    expect(await syncBookingToCalendar(BOOKING_ID)).toEqual({ action: 'upserted' })
    const insert = apiCalls()[1]
    expect(insert.method).toBe('POST')
    expect(JSON.parse(insert.body!).id).toBe(calendarEventId(BOOKING_ID))
  })

  it('shows a pending driver as awaiting acceptance', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...BOOKING, status: 'assigned', driver_assignments: [{ status: 'pending', drivers: { name: 'Petr' } }] },
      error: null,
    })
    await syncBookingToCalendar(BOOKING_ID)
    expect(JSON.parse(apiCalls()[0].body!).description).toContain('Driver: Petr (awaiting acceptance)')
  })

  it.each(['cancelled', 'pending', 'unpaid'])('deletes the event when status is %s', async (status) => {
    mockMaybeSingle.mockResolvedValue({ data: { ...BOOKING, status }, error: null })
    expect(await syncBookingToCalendar(BOOKING_ID)).toEqual({ action: 'deleted' })
    expect(apiCalls()[0].method).toBe('DELETE')
  })

  it('treats an already-missing event as a no-op on delete', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { ...BOOKING, status: 'cancelled' }, error: null })
    responder = () => new Response('', { status: 410 })
    expect(await syncBookingToCalendar(BOOKING_ID)).toEqual({ action: 'skipped', reason: 'no_event' })
  })

  it('throws on Google API errors', async () => {
    mockMaybeSingle.mockResolvedValue({ data: BOOKING, error: null })
    responder = () => new Response('', { status: 403 })
    await expect(syncBookingToCalendar(BOOKING_ID)).rejects.toThrow('403')
  })
})

// ── Webhook route ────────────────────────────────────────────────────────────

function req(body: unknown, auth?: string) {
  return new Request('http://localhost/api/webhooks/booking-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/webhooks/booking-calendar', () => {
  it('rejects missing or wrong secret', async () => {
    expect((await POST(req({ booking_id: BOOKING_ID }))).status).toBe(401)
    expect((await POST(req({ booking_id: BOOKING_ID }, 'Bearer nope')))).toHaveProperty('status', 401)
  })

  it('fails closed when GCAL_SYNC_SECRET is unset', async () => {
    vi.stubEnv('GCAL_SYNC_SECRET', '')
    expect((await POST(req({ booking_id: BOOKING_ID }, 'Bearer ')))).toHaveProperty('status', 401)
  })

  it('rejects a non-uuid booking id', async () => {
    expect((await POST(req({ booking_id: 'x' }, 'Bearer test-secret'))).status).toBe(422)
  })

  it('syncs the booking', async () => {
    mockMaybeSingle.mockResolvedValue({ data: BOOKING, error: null })
    const res = await POST(req({ booking_id: BOOKING_ID }, 'Bearer test-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, action: 'upserted' })
  })

  it('returns 502 when the sync fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: BOOKING, error: null })
    responder = () => new Response('', { status: 500 })
    const res = await POST(req({ booking_id: BOOKING_ID }, 'Bearer test-secret'))
    expect(res.status).toBe(502)
  })
})
