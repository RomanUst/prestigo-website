// prestigo/lib/flight-status.ts
// Phase 32: FlightStats Flex REST API v2 wrapper + typed error contract.
// Server-only. No caching (that lives in /api/check-flight, Phase 33).
// No logging of the full URL (appId/appKey leakage).

const BASE = 'https://api.flightstats.com/flex/flightstatus/rest/v2/json'
// IATA carrier codes: 2-3 alphanumeric chars where mixed alphanumeric carriers
// are always exactly 2 chars (S7, 9W, B6). Pure-alpha carriers are 2-3 chars (OK, BA, EZY).
// \d{1,4} after carrier = strictly 1-4 digit flight number.
// Using explicit alternation avoids the ambiguity in /^[A-Z0-9]{2,3}\d{1,4}$/i where
// e.g. "OK12345" would incorrectly match as carrier="OK1" + flight="2345".
const IATA_RE = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\d{1,4}$/i

export type FlightStatus =
  | 'scheduled'
  | 'active'
  | 'landed'
  | 'cancelled'
  | 'diverted'
  | 'unknown'

export interface FlightInfo {
  status: FlightStatus
  estimatedArrival: string | null   // ISO local datetime e.g. "2026-04-15T14:35:00.000"
  delayMinutes: number | null       // whole minutes from delays.arrivalGateDelayMinutes
  departureAirport: string          // IATA e.g. "LHR"
  arrivalAirport: string            // IATA e.g. "PRG"
  terminal: string | null           // arrival terminal, null when absent
}

export type FlightCheckErrorCode =
  | 'INVALID_FORMAT'   // IATA regex failed — no fetch call made
  | 'NOT_FOUND'        // FlightStats returned empty flightStatuses array
  | 'API_ERROR'        // Non-2xx HTTP response from FlightStats
  | 'NETWORK_ERROR'    // fetch() rejected (DNS/timeout/connection)
  | 'PARSE_ERROR'      // response body was not valid JSON

export class FlightCheckError extends Error {
  public readonly code: FlightCheckErrorCode
  public readonly cause?: unknown
  constructor(code: FlightCheckErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'FlightCheckError'
    this.code = code
    this.cause = cause
  }
}

const STATUS_MAP: Record<string, FlightStatus> = {
  S:  'scheduled',
  A:  'active',
  L:  'landed',
  C:  'cancelled',
  D:  'diverted',
  DN: 'diverted',
  NO: 'unknown',
  R:  'unknown',
  U:  'unknown',
}

interface FlightStatsTime { dateLocal?: string; dateUtc?: string }
interface FlightStatsEntry {
  status: string
  departureAirportFsCode: string
  arrivalAirportFsCode: string
  operationalTimes?: {
    actualGateArrival?: FlightStatsTime
    estimatedGateArrival?: FlightStatsTime
    scheduledGateArrival?: FlightStatsTime
  }
  delays?: { arrivalGateDelayMinutes?: number }
  airportResources?: { arrivalTerminal?: string }
}
interface FlightStatsResponse {
  flightStatuses?: FlightStatsEntry[]
}

/**
 * Splits a normalised IATA string into carrier code and flight number.
 * Rule (per 32-RESEARCH A5): take 3 chars as carrier if chars[2] is a letter,
 * otherwise take 2. Handles: OK, EZY, S7, 9W, BA, B6.
 */
function splitIata(normalised: string): { carrier: string; flightNum: string } {
  const third = normalised[2]
  const carrierLen = third && /[A-Z]/.test(third) ? 3 : 2
  return {
    carrier:   normalised.slice(0, carrierLen),
    flightNum: normalised.slice(carrierLen),
  }
}

export async function checkFlight(
  flightNumber: string,
  date: string,
): Promise<FlightInfo> {
  const normalised = String(flightNumber ?? '').trim().toUpperCase()

  if (!IATA_RE.test(normalised)) {
    throw new FlightCheckError(
      'INVALID_FORMAT',
      `"${flightNumber}" is not a valid IATA flight number`,
    )
  }

  const { carrier, flightNum } = splitIata(normalised)
  const [year, month, day] = date.split('-').map(Number)

  const appId  = process.env.FLIGHTSTATS_APP_ID
  const appKey = process.env.FLIGHTSTATS_APP_KEY

  const url =
    `${BASE}/flight/status/${carrier}/${flightNum}/arr/${year}/${month}/${day}` +
    `?appId=${appId}&appKey=${appKey}`

  // Public identifier used in error messages — NEVER include the full url
  // (which contains appId/appKey as query params).
  const ref = `${carrier}${flightNum} on ${year}-${month}-${day}`

  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch (err) {
    throw new FlightCheckError('NETWORK_ERROR', `FlightStats unreachable for ${ref}`, err)
  }

  if (!res.ok) {
    throw new FlightCheckError(
      'API_ERROR',
      `FlightStats returned HTTP ${res.status} for ${ref}`,
    )
  }

  let body: FlightStatsResponse
  try {
    body = await res.json() as FlightStatsResponse
  } catch (err) {
    throw new FlightCheckError(
      'PARSE_ERROR',
      `FlightStats response for ${ref} was not valid JSON`,
      err,
    )
  }

  const entries = body.flightStatuses
  if (!entries || entries.length === 0) {
    throw new FlightCheckError('NOT_FOUND', `No flight found for ${ref}`)
  }

  if (entries.length > 1) {
    // Codeshare warning — surfaces in integration logs only.
    console.warn(`[flight-status] multiple flightStatuses for ${ref} — using [0]`)
  }

  const entry = entries[0]
  const ot    = entry.operationalTimes

  const estimatedArrival =
    ot?.actualGateArrival?.dateLocal ??
    ot?.estimatedGateArrival?.dateLocal ??
    ot?.scheduledGateArrival?.dateLocal ??
    null

  return {
    status:           STATUS_MAP[entry.status] ?? 'unknown',
    estimatedArrival,
    delayMinutes:     entry.delays?.arrivalGateDelayMinutes ?? null,
    departureAirport: entry.departureAirportFsCode,
    arrivalAirport:   entry.arrivalAirportFsCode,
    terminal:         entry.airportResources?.arrivalTerminal ?? null,
  }
}
