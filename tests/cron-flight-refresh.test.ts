import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Set CRON_SECRET before any vi.mock calls ───────────────────────────────────
// Must be set at module evaluation time so the route guard sees it.
process.env.CRON_SECRET = 'test-secret'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockCheckFlight,
  mockQueryIn,
  mockQueryEq,
  mockQueryNot,
  mockUpdate,
} = vi.hoisted(() => ({
  mockCheckFlight: vi.fn(),
  mockQueryIn:     vi.fn(),
  mockQueryEq:     vi.fn(),
  mockQueryNot:    vi.fn(),
  mockUpdate:      vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

// Chainable Supabase service client stub
// Supports: .from('bookings').select(...).in(...).eq(...).not(...)  → returns { data, error }
//           .from('bookings').update({...}).eq('id', bookingId)     → returns { error }
const mockFromUpdate = vi.fn()
const mockFromSelect = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'bookings') {
        return {
          select: mockFromSelect,
          update: mockFromUpdate,
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/flight-status', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/flight-status')>()
  return {
    ...original,
    checkFlight: mockCheckFlight,
  }
})

// ── Import route after mocks are set up ──────────────────────────────────────

import { GET } from '@/app/api/cron/flight-refresh/route'
import { FlightCheckError } from '@/lib/flight-status'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOKING_A = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  flight_iata: 'OK123',
  pickup_date: '2026-04-12',
}

const BOOKING_B = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  flight_iata: 'BA456',
  pickup_date: '2026-04-12',
}

const DEFAULT_FLIGHT_INFO = {
  status:           'landed' as const,
  estimatedArrival: '2026-04-12T14:35:00.000',
  delayMinutes:     10,
  departureAirport: 'LHR',
  arrivalAirport:   'PRG',
  terminal:         '1',
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/flight-refresh', {
    method: 'GET',
    headers: authHeader ? { Authorization: authHeader } : {},
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: query returns BOOKING_A
  mockQueryNot.mockResolvedValue({ data: [BOOKING_A], error: null })
  mockQueryEq.mockReturnValue({ not: mockQueryNot })
  mockQueryIn.mockReturnValue({ eq: mockQueryEq })
  mockFromSelect.mockReturnValue({ in: mockQueryIn })

  // Default: update resolves OK
  const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
  mockUpdate.mockImplementation(() => ({ eq: mockUpdate }))
  mockFromUpdate.mockReturnValue({ eq: mockUpdateEq })

  // Default: checkFlight resolves with DEFAULT_FLIGHT_INFO
  mockCheckFlight.mockResolvedValue(DEFAULT_FLIGHT_INFO)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FLIGHT-07: /api/cron/flight-refresh auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization token does not match CRON_SECRET', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })
})

describe('FLIGHT-07: /api/cron/flight-refresh — no bookings today', () => {
  it('returns 200 with processed:0 failed:0 when DB returns empty array', async () => {
    mockQueryNot.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(0)
    expect(body.failed).toBe(0)
  })
})

describe('FLIGHT-07: /api/cron/flight-refresh — success path', () => {
  it('calls checkFlight for each booking and upserts 6 columns', async () => {
    // Return two bookings
    mockQueryNot.mockResolvedValue({ data: [BOOKING_A, BOOKING_B], error: null })

    // Track update calls for payload verification
    const capturedUpdates: unknown[] = []
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    mockFromUpdate.mockImplementation((payload: unknown) => {
      capturedUpdates.push(payload)
      return { eq: mockUpdateEq }
    })

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(2)
    expect(body.failed).toBe(0)

    expect(mockCheckFlight).toHaveBeenCalledTimes(2)
    expect(mockFromUpdate).toHaveBeenCalledTimes(2)

    // Verify all 6 flight status fields are present in the update payload
    for (const payload of capturedUpdates) {
      const p = payload as Record<string, unknown>
      expect(p).toHaveProperty('flight_status')
      expect(p).toHaveProperty('flight_estimated_arrival')
      expect(p).toHaveProperty('flight_delay_minutes')
      expect(p).toHaveProperty('flight_departure_airport')
      expect(p).toHaveProperty('flight_arrival_airport')
      expect(p).toHaveProperty('flight_terminal')
    }
  })
})

describe('FLIGHT-07: /api/cron/flight-refresh — error resilience', () => {
  it('skips booking and continues when checkFlight throws FlightCheckError', async () => {
    mockQueryNot.mockResolvedValue({ data: [BOOKING_A, BOOKING_B], error: null })

    // First call throws, second succeeds
    mockCheckFlight
      .mockRejectedValueOnce(new FlightCheckError('API_ERROR', 'FlightStats unavailable'))
      .mockResolvedValueOnce(DEFAULT_FLIGHT_INFO)

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(1)
    expect(body.failed).toBe(1)

    // Both bookings were attempted — loop did not abort after first failure
    expect(mockCheckFlight).toHaveBeenCalledTimes(2)
  })
})

describe('FLIGHT-07: /api/cron/flight-refresh — response shape', () => {
  it('returns 200 with correct processed/failed counts after mixed success/failure batch', async () => {
    // 3 bookings: A and B succeed, a third fails
    const BOOKING_C = { id: 'cccccccc-0000-0000-0000-000000000003', flight_iata: 'FR789', pickup_date: '2026-04-12' }
    mockQueryNot.mockResolvedValue({ data: [BOOKING_A, BOOKING_B, BOOKING_C], error: null })

    // Second call throws, others succeed
    mockCheckFlight
      .mockResolvedValueOnce(DEFAULT_FLIGHT_INFO)
      .mockRejectedValueOnce(new FlightCheckError('NOT_FOUND', 'Flight not found'))
      .mockResolvedValueOnce(DEFAULT_FLIGHT_INFO)

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({
      ok:        true,
      processed: 2,
      failed:    1,
    })
    // Response must include today date string (YYYY-MM-DD)
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
