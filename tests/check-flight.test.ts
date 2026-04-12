import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockCheckFlight,
  mockCheckRateLimit,
  mockGetClientIp,
  mockGetFlightCache,
  mockSetFlightCache,
} = vi.hoisted(() => ({
  mockCheckFlight:    vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp:    vi.fn(),
  mockGetFlightCache: vi.fn(),
  mockSetFlightCache: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/flight-status', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/flight-status')>()
  return {
    ...original,
    checkFlight: mockCheckFlight,
  }
})

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp:    mockGetClientIp,
}))

vi.mock('@/lib/flight-cache', () => ({
  getFlightCache: mockGetFlightCache,
  setFlightCache: mockSetFlightCache,
}))

// ── Import route after mocks are set up ──────────────────────────────────────

import { GET } from '@/app/api/check-flight/route'
import { FlightCheckError } from '@/lib/flight-status'

// ── Default stub values ───────────────────────────────────────────────────────

const DEFAULT_RATE_LIMIT = { allowed: true, remaining: 4, limit: 5 }
const DEFAULT_FLIGHT_INFO = {
  status:           'scheduled' as const,
  estimatedArrival: '2026-04-15T14:35:00.000',
  delayMinutes:     0,
  departureAirport: 'LHR',
  arrivalAirport:   'PRG',
  terminal:         '2',
}
const DEFAULT_PAYLOAD = {
  flight_iata:               'OK123',
  flight_status:             'scheduled',
  flight_estimated_arrival:  '2026-04-15T14:35:00.000',
  flight_delay_minutes:      0,
  flight_departure_airport:  'LHR',
  flight_arrival_airport:    'PRG',
  flight_terminal:           '2',
}

function makeRequest(params = 'flight=OK123&date=2026-04-15') {
  return new Request(`http://localhost/api/check-flight?${params}`)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCheckRateLimit.mockResolvedValue(DEFAULT_RATE_LIMIT)
  mockGetClientIp.mockReturnValue('127.0.0.1')
  mockGetFlightCache.mockResolvedValue(null)
  mockSetFlightCache.mockResolvedValue(undefined)
  mockCheckFlight.mockResolvedValue(DEFAULT_FLIGHT_INFO)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FLIGHT-08: /api/check-flight rate limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 5 })
    const res = await GET(makeRequest())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'Too many requests' })
  })
})

describe('FLIGHT-08: /api/check-flight caching', () => {
  it('returns cached result without calling checkFlight', async () => {
    mockGetFlightCache.mockResolvedValue(DEFAULT_PAYLOAD)
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, ...DEFAULT_PAYLOAD })
    expect(mockCheckFlight).not.toHaveBeenCalled()
  })

  it('calls checkFlight on cache miss and caches result', async () => {
    mockGetFlightCache.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(mockCheckFlight).toHaveBeenCalledWith('OK123', '2026-04-15')
    expect(mockSetFlightCache).toHaveBeenCalledWith(
      'flight:OK123:2026-04-15',
      expect.objectContaining({ flight_iata: 'OK123' }),
      600,
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('FLIGHT-08: /api/check-flight FlightStats error handling', () => {
  it('returns { ok: false } with HTTP 200 on FlightStats NOT_FOUND', async () => {
    mockCheckFlight.mockRejectedValue(new FlightCheckError('NOT_FOUND', 'Not found'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'NOT_FOUND' })
  })

  it('returns { ok: false } with HTTP 200 on FlightStats API_ERROR', async () => {
    mockCheckFlight.mockRejectedValue(new FlightCheckError('API_ERROR', 'API error'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'API_ERROR' })
  })
})

describe('FLIGHT-02: /api/check-flight response shape', () => {
  it('returns valid response shape on success', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok:                       true,
      flight_iata:              'OK123',
      flight_status:            'scheduled',
      flight_estimated_arrival: '2026-04-15T14:35:00.000',
      flight_delay_minutes:     0,
      flight_departure_airport: 'LHR',
      flight_arrival_airport:   'PRG',
      flight_terminal:          '2',
    })
  })

  it('returns 400 on invalid flight param', async () => {
    const res = await GET(makeRequest('flight=!!!&date=2026-04-15'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'Invalid parameters' })
  })

  it('returns 400 on invalid date param', async () => {
    const res = await GET(makeRequest('flight=OK123&date=not-a-date'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, error: 'Invalid parameters' })
  })
})
