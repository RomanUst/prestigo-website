import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockGetUser,
  mockSingle,
  mockUpdate,
  mockCheckFlight,
  mockEnforceMaxBody,
} = vi.hoisted(() => ({
  mockGetUser:        vi.fn(),
  mockSingle:         vi.fn(),
  mockUpdate:         vi.fn(),
  mockCheckFlight:    vi.fn(),
  mockEnforceMaxBody: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

// Chainable Supabase service client stub
const mockEq = vi.fn()
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: vi.fn(() => ({ eq: mockUpdate })),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock('@/lib/flight-status', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/flight-status')>()
  return {
    ...original,
    checkFlight: mockCheckFlight,
  }
})

vi.mock('@/lib/request-guards', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/request-guards')>()
  return {
    ...original,
    enforceMaxBody: mockEnforceMaxBody,
  }
})

// ── Import route after mocks are set up ──────────────────────────────────────

import { POST } from '@/app/api/admin/flight-refresh/route'
import { FlightCheckError } from '@/lib/flight-status'

// ── Default stub values ───────────────────────────────────────────────────────

const ADMIN_USER = {
  id: 'user-1',
  app_metadata: { is_admin: true },
}

const DEFAULT_BOOKING = {
  flight_iata: 'OK123',
  pickup_date: '2026-04-15',
}

const DEFAULT_FLIGHT_INFO = {
  status:           'landed' as const,
  estimatedArrival: '2026-04-15T14:35:00.000',
  delayMinutes:     10,
  departureAirport: 'LHR',
  arrivalAirport:   'PRG',
  terminal:         '1',
}

function makeRequest(body: unknown = { bookingId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }) {
  return new Request('http://localhost/api/admin/flight-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockEnforceMaxBody.mockReturnValue(null) // allowed
  mockGetUser.mockResolvedValue({ data: { user: ADMIN_USER }, error: null })
  mockEq.mockReturnValue({ single: mockSingle })
  mockSingle.mockResolvedValue({ data: DEFAULT_BOOKING, error: null })
  mockCheckFlight.mockResolvedValue(DEFAULT_FLIGHT_INFO)
  mockUpdate.mockResolvedValue({ error: null })
  // Reset the from mock to return chainable methods
  mockFrom.mockImplementation(() => ({
    select: mockSelect,
    update: vi.fn(() => ({ eq: mockUpdate })),
  }))
  mockSelect.mockReturnValue({ eq: mockEq })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FLIGHT-06: /api/admin/flight-refresh auth', () => {
  it('returns 401 without session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 403 for non-admin user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2', app_metadata: {} } },
      error: null,
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'Forbidden' })
  })
})

describe('FLIGHT-06: /api/admin/flight-refresh validation', () => {
  it('returns 400 for invalid bookingId (not a UUID)', async () => {
    const res = await POST(makeRequest({ bookingId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid payload')
  })

  it('returns 404 when booking is not found (PGRST116)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'No rows found' } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'Booking not found' })
  })

  it('returns 422 when booking has no flight_iata', async () => {
    mockSingle.mockResolvedValue({ data: { flight_iata: null, pickup_date: '2026-04-15' }, error: null })
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'No flight number on this booking' })
  })
})

describe('FLIGHT-06: /api/admin/flight-refresh success', () => {
  it('returns updated flight fields on success', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok:                         true,
      flight_status:              'landed',
      flight_estimated_arrival:   '2026-04-15T14:35:00.000',
      flight_delay_minutes:       10,
      flight_departure_airport:   'LHR',
      flight_arrival_airport:     'PRG',
      flight_terminal:            '1',
    })
  })
})

describe('FLIGHT-06: /api/admin/flight-refresh error handling', () => {
  it('returns 503 on FlightStats error', async () => {
    mockCheckFlight.mockRejectedValue(new FlightCheckError('API_ERROR', 'FlightStats unavailable'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'API_ERROR' })
  })

  it('returns 500 when DB update fails', async () => {
    mockUpdate.mockResolvedValue({ error: { message: 'connection timeout' } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'DB_UPDATE_FAILED' })
  })
})
