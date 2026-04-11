import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// vi.hoisted ensures mockFetch is available before module imports (hoisted before imports)
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

// Replace global fetch before module import
vi.stubGlobal('fetch', mockFetch)

// Set env vars BEFORE importing the module under test
process.env.FLIGHTSTATS_APP_ID = 'test-app-id'
process.env.FLIGHTSTATS_APP_KEY = 'test-app-key'

import { checkFlight, FlightCheckError } from '@/lib/flight-status'

// ── Helpers ──────────────────────────────────────────────────────────────────

type FlightStatsEntry = {
  status?: string
  departureAirportFsCode?: string
  arrivalAirportFsCode?: string
  operationalTimes?: {
    actualGateArrival?: { dateLocal?: string; dateUtc?: string }
    estimatedGateArrival?: { dateLocal?: string; dateUtc?: string }
    scheduledGateArrival?: { dateLocal?: string; dateUtc?: string }
  }
  delays?: { arrivalGateDelayMinutes?: number }
  airportResources?: { arrivalTerminal?: string }
}

function buildResponse(entry: FlightStatsEntry = {}): Response {
  const body = {
    flightStatuses: [
      {
        status: 'S',
        departureAirportFsCode: 'LHR',
        arrivalAirportFsCode: 'PRG',
        operationalTimes: {
          scheduledGateArrival: {
            dateLocal: '2026-04-15T14:35:00.000',
            dateUtc: '2026-04-15T12:35:00.000Z',
          },
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

// ── FLIGHT-01: carrier/flight split + URL construction ───────────────────────

describe('FLIGHT-01: checkFlight carrier/flight split + URL construction', () => {
  it('splits EZY1234 as carrier=EZY flight=1234 in URL', async () => {
    await checkFlight('EZY1234', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/flight/status/EZY/1234/arr/'),
      expect.anything(),
    )
  })

  it('splits BA123 as carrier=BA flight=123 in URL', async () => {
    await checkFlight('BA123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/flight/status/BA/123/arr/'),
      expect.anything(),
    )
  })

  it('splits S7300 as carrier=S7 flight=300 in URL', async () => {
    await checkFlight('S7300', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/flight/status/S7/300/arr/'),
      expect.anything(),
    )
  })

  it('uses bare integers for month/day (no zero-pad) — date 2026-04-05 yields /2026/4/5 in URL', async () => {
    await checkFlight('OK123', '2026-04-05')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/arr/2026/4/5'),
      expect.anything(),
    )
  })

  it('upper-cases lowercase input — "ok123" becomes OK123 in URL', async () => {
    await checkFlight('ok123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/flight/status/OK/123/arr/'),
      expect.anything(),
    )
  })

  it('hits path /flight/status/{carrier}/{flightNum}/arr/{y}/{m}/{d} under base https://api.flightstats.com/flex/flightstatus/rest/v2/json', async () => {
    await checkFlight('OK123', '2026-04-15')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/OK/123/arr/2026/4/15'),
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

  it('throws FlightCheckError with code NOT_FOUND when flightStatuses is an empty array', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ flightStatuses: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(checkFlight('OK123', '2026-04-15')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws FlightCheckError with code NOT_FOUND when flightStatuses is undefined', async () => {
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

  it('FlightCheckError.message never contains appId or appKey query string values', async () => {
    mockFetch.mockRejectedValue(new Error('boom'))
    try {
      await checkFlight('OK123', '2026-04-15')
    } catch (e) {
      expect((e as Error).message).not.toContain('test-app-id')
      expect((e as Error).message).not.toContain('test-app-key')
    }
  })

  it('FlightCheckError instances are instanceof Error AND instanceof FlightCheckError', async () => {
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
  it('maps FlightStats status letter "S" to "scheduled"', async () => {
    mockFetch.mockResolvedValue(buildResponse({ status: 'S' }))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.status).toBe('scheduled')
  })

  it('maps "A" to "active", "L" to "landed", "C" to "cancelled", "D" to "diverted", "DN" to "diverted", "U" to "unknown"', async () => {
    const cases: Array<[string, string]> = [
      ['A', 'active'],
      ['L', 'landed'],
      ['C', 'cancelled'],
      ['D', 'diverted'],
      ['DN', 'diverted'],
      ['U', 'unknown'],
    ]
    for (const [fsStatus, expected] of cases) {
      mockFetch.mockResolvedValue(buildResponse({ status: fsStatus }))
      const result = await checkFlight('OK123', '2026-04-15')
      expect(result.status).toBe(expected)
    }
  })

  it('returns unknown for unrecognised status codes', async () => {
    mockFetch.mockResolvedValue(buildResponse({ status: 'XYZ' }))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.status).toBe('unknown')
  })

  it('prefers operationalTimes.actualGateArrival.dateLocal when present', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        operationalTimes: {
          actualGateArrival: { dateLocal: '2026-04-15T15:00:00.000' },
          estimatedGateArrival: { dateLocal: '2026-04-15T14:45:00.000' },
          scheduledGateArrival: { dateLocal: '2026-04-15T14:35:00.000' },
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T15:00:00.000')
  })

  it('falls back to estimatedGateArrival.dateLocal when actual is absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        operationalTimes: {
          estimatedGateArrival: { dateLocal: '2026-04-15T14:45:00.000' },
          scheduledGateArrival: { dateLocal: '2026-04-15T14:35:00.000' },
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T14:45:00.000')
  })

  it('falls back to scheduledGateArrival.dateLocal when both actual and estimated are absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        operationalTimes: {
          scheduledGateArrival: { dateLocal: '2026-04-15T14:35:00.000' },
        },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBe('2026-04-15T14:35:00.000')
  })

  it('returns estimatedArrival=null when all three timestamp fields are absent', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        operationalTimes: {},
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.estimatedArrival).toBeNull()
  })

  it('returns delayMinutes from delays.arrivalGateDelayMinutes', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        delays: { arrivalGateDelayMinutes: 25 },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBe(25)
  })

  it('returns delayMinutes=null when delays object is absent', async () => {
    mockFetch.mockResolvedValue(buildResponse({}))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBeNull()
  })

  it('returns delayMinutes=null when delays.arrivalGateDelayMinutes is undefined', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        delays: {},
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.delayMinutes).toBeNull()
  })

  it('returns terminal from airportResources.arrivalTerminal', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        airportResources: { arrivalTerminal: '2' },
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBe('2')
  })

  it('returns terminal=null when airportResources is absent', async () => {
    mockFetch.mockResolvedValue(buildResponse({}))
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBeNull()
  })

  it('returns terminal=null when airportResources.arrivalTerminal is undefined', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        airportResources: {},
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.terminal).toBeNull()
  })

  it('returns departureAirport and arrivalAirport from departureAirportFsCode/arrivalAirportFsCode', async () => {
    mockFetch.mockResolvedValue(
      buildResponse({
        departureAirportFsCode: 'LHR',
        arrivalAirportFsCode: 'PRG',
      }),
    )
    const result = await checkFlight('OK123', '2026-04-15')
    expect(result.departureAirport).toBe('LHR')
    expect(result.arrivalAirport).toBe('PRG')
  })
})
