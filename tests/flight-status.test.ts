import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// vi.hoisted ensures mockFetch is available before module imports (hoisted before imports)
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

// Replace global fetch before module import
vi.stubGlobal('fetch', mockFetch)

// Set env vars BEFORE importing the module under test
process.env.AVIATIONSTACK_API_KEY = 'test-key'

import { checkFlight, FlightCheckError } from '@/lib/flight-status'

// ── Helpers ──────────────────────────────────────────────────────────────────

type AviationStackEntry = {
  flight_status?: string
  departure?: { iata: string }
  arrival?: {
    iata?: string
    scheduled?: string | null
    estimated?: string | null
    actual?: string | null
    delay?: number | null
    terminal?: string | null
  }
}

function buildResponse(entry: AviationStackEntry = {}): Response {
  const body = {
    data: [
      {
        flight_status: 'scheduled',
        departure: { iata: 'LHR' },
        arrival: {
          iata: 'PRG',
          scheduled: '2026-04-15T14:35:00.000Z',
          estimated: null,
          actual: null,
          delay: null,
          terminal: null,
        },
        ...entry,
      },
    ],
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(buildResponse())
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── FLIGHT-01: IATA format validation ────────────────────────────────────────

describe('FLIGHT-01: checkFlight IATA format validation', () => {
  it('accepts OK123 (2-letter carrier, 3-digit flight)', async () => {
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result).toMatchObject({ status: 'scheduled' })
  })

  it('accepts EZY1234 (3-letter carrier, 4-digit flight)', async () => {
    const result = await checkFlight('EZY1234', '2026-04-15')
    expect(result).toMatchObject({ status: 'scheduled' })
  })

  it('accepts S7300 (letter+digit carrier)', async () => {
    const result = await checkFlight('S7300', '2026-04-15')
    expect(result).toMatchObject({ status: 'scheduled' })
  })

  it('accepts 9W456 (digit+letter carrier)', async () => {
    const result = await checkFlight('9W456', '2026-04-15')
    expect(result).toMatchObject({ status: 'scheduled' })
  })

  it('accepts BA0197 (leading-zero flight number)', async () => {
    const result = await checkFlight('BA0197', '2026-04-15')
    expect(result).toMatchObject({ status: 'scheduled' })
  })

  it('rejects empty string with FlightCheckError code INVALID_FORMAT', async () => {
    await expect(checkFlight('', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('rejects "   " (whitespace only)', async () => {
    await expect(checkFlight('   ', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('rejects "123AB" (digits before letters)', async () => {
    await expect(checkFlight('123AB', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('rejects "TOOLONG1234" (4-letter carrier)', async () => {
    await expect(checkFlight('TOOLONG1234', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('rejects "OK" (no flight number)', async () => {
    await expect(checkFlight('OK', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('rejects "OK12345" (5-digit flight)', async () => {
    await expect(checkFlight('OK12345', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
  })

  it('does NOT call fetch when format is invalid', async () => {
    mockFetch.mockReset()
    await expect(checkFlight('INVALID', '2026-04-15')).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
    })
    expect(mockFetch).toHaveBeenCalledTimes(0)
  })
})

// ── FLIGHT-01: AviationStack URL construction ────────────────────────────────

describe('FLIGHT-01: AviationStack URL construction', () => {
  it('checkFlight("OK123", "2026-04-15") calls URL containing "api.aviationstack.com/v1/flights"', async () => {
    await checkFlight('OK123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.aviationstack.com/v1/flights'),
      expect.anything(),
    )
  })

  it('URL contains "flight_iata=OK123"', async () => {
    await checkFlight('OK123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('flight_iata=OK123'),
      expect.anything(),
    )
  })

  it('URL contains "flight_date=2026-04-15"', async () => {
    await checkFlight('OK123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('flight_date=2026-04-15'),
      expect.anything(),
    )
  })

  it('URL contains "access_key=test-key"', async () => {
    await checkFlight('OK123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('access_key=test-key'),
      expect.anything(),
    )
  })

  it('lower-case "ok123" is normalised — URL contains "flight_iata=OK123"', async () => {
    await checkFlight('ok123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('flight_iata=OK123'),
      expect.anything(),
    )
  })

  it('checkFlight("EZY1234", "2026-04-15") — URL contains "flight_iata=EZY1234" (not split into carrier/flight)', async () => {
    await checkFlight('EZY1234', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('flight_iata=EZY1234'),
      expect.anything(),
    )
  })
})

// ── FLIGHT-08: typed error contract ──────────────────────────────────────────

describe('FLIGHT-08: checkFlight typed error contract', () => {
  it('throws FlightCheckError with code NETWORK_ERROR when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'))
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('throws FlightCheckError with code API_ERROR when response.ok is false (HTTP 403)', async () => {
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'API_ERROR',
    })
  })

  it('throws FlightCheckError with code API_ERROR when response.ok is false (HTTP 500)', async () => {
    mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }))
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'API_ERROR',
    })
  })

  it('throws FlightCheckError with code NOT_FOUND when data is an empty array', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws FlightCheckError with code NOT_FOUND when data is undefined (no data key)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws FlightCheckError with code PARSE_ERROR when response.json() rejects', async () => {
    mockFetch.mockResolvedValue(
      new Response('not-json{{{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'PARSE_ERROR',
    })
  })

  it('FlightCheckError.message never contains the API key value', async () => {
    expect.assertions(1)
    mockFetch.mockRejectedValue(new Error('boom'))
    try {
      await checkFlight('OK123', '2026-04-15')
    } catch (e) {
      expect((e as Error).message).not.toContain('test-key')
    }
  })

  it('FlightCheckError instances are instanceof Error AND instanceof FlightCheckError', async () => {
    expect.assertions(2)
    mockFetch.mockRejectedValue(new Error('boom'))
    try {
      await checkFlight('OK123', '2026-04-15')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect(e).toBeInstanceOf(FlightCheckError)
    }
  })

  it('returned FlightInfo has the exact 6 keys: status, estimatedArrival, delayMinutes, departureAirport, arrivalAirport, terminal — no extras', async () => {
    const result = await checkFlight('OK123', '2026-04-15')
    const keys = Object.keys(result).sort()
    expect(keys).toEqual(
      [
        'arrivalAirport',
        'delayMinutes',
        'departureAirport',
        'estimatedArrival',
        'status',
        'terminal',
      ].sort(),
    )
  })
})

// ── FLIGHT-08: happy-path response parsing ────────────────────────────────────

describe('FLIGHT-08: checkFlight happy-path response parsing', () => {
  it('maps AviationStack flight_status "scheduled" to "scheduled"', async () => {
    mockFetch.mockResolvedValue(buildResponse({ flight_status: 'scheduled' }))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.status).toBe('scheduled')
  })

  it('maps "active"→"active", "landed"→"landed", "cancelled"→"cancelled", "diverted"→"diverted", "incident"→"unknown"', async () => {
    const cases: Array<[string, string]> = [
      ['active',    'active'],
      ['landed',    'landed'],
      ['cancelled', 'cancelled'],
      ['diverted',  'diverted'],
      ['incident',  'unknown'],
    ]
    for (const [avStatus, expected] of cases) {
      mockFetch.mockResolvedValue(buildResponse({ flight_status: avStatus }))
      const result = await checkFlight('OK123', '2026-04-15')
      expect(result.status).toBe(expected)
    }
  })

  it('returns unknown for unrecognised flight_status values', async () => {
    mockFetch.mockResolvedValue(buildResponse({ flight_status: 'XYZ' }))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.status).toBe('unknown')
  })

  it('prefers arrival.actual when present (highest priority for estimatedArrival)', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: {
          iata: 'PRG',
          actual:    '2026-04-15T15:00:00.000Z',
          estimated: '2026-04-15T14:45:00.000Z',
          scheduled: '2026-04-15T14:35:00.000Z',
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T15:00:00.000Z')
  })

  it('falls back to arrival.estimated when arrival.actual is absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: {
          iata: 'PRG',
          actual:    null,
          estimated: '2026-04-15T14:45:00.000Z',
          scheduled: '2026-04-15T14:35:00.000Z',
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T14:45:00.000Z')
  })

  it('falls back to arrival.scheduled when both actual and estimated are absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: {
          iata: 'PRG',
          actual:    null,
          estimated: null,
          scheduled: '2026-04-15T14:35:00.000Z',
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T14:35:00.000Z')
  })

  it('returns estimatedArrival=null when actual, estimated, and scheduled are all absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: {
          iata: 'PRG',
          actual:    null,
          estimated: null,
          scheduled: null,
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBeNull()
  })

  it('returns delayMinutes from arrival.delay when present', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: { iata: 'PRG', delay: 25 },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBe(25)
  })

  it('returns delayMinutes=null when arrival.delay is absent', async () => {
    mockFetch.mockResolvedValue(buildResponse())
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBeNull()
  })

  it('returns delayMinutes=null when arrival.delay is explicitly null', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: { iata: 'PRG', delay: null },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBeNull()
  })

  it('returns terminal from arrival.terminal when present', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: { iata: 'PRG', terminal: '2' },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBe('2')
  })

  it('returns terminal=null when arrival.terminal is absent', async () => {
    mockFetch.mockResolvedValue(buildResponse())
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBeNull()
  })

  it('returns terminal=null when arrival.terminal is explicitly null', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        arrival: { iata: 'PRG', terminal: null },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBeNull()
  })

  it('returns departureAirport from departure.iata and arrivalAirport from arrival.iata', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        departure: { iata: 'LHR' },
        arrival:   { iata: 'PRG' },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.departureAirport).toBe('LHR')
    expect(result.arrivalAirport).toBe('PRG')
  })
})
