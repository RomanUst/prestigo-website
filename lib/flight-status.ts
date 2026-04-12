// prestigo/lib/flight-status.ts
// Phase 36: AviationStack GET /v1/flights wrapper. Server-only.
// No caching (lives in /api/check-flight). Never log full URL (contains access_key).

const BASE = 'http://api.aviationstack.com/v1/flights'

// IATA carrier codes: 2-3 alphanumeric chars where mixed alphanumeric carriers
// are always exactly 2 chars (S7, 9W, B6). Pure-alpha carriers are 2-3 chars (OK, BA, EZY).
// \d{1,4} after carrier = strictly 1-4 digit flight number.
// Using explicit alternation avoids the ambiguity in /^[A-Z0-9]{2,3}\d{1,4}$/i where
// e.g. "OK12345" would incorrectly match as carrier="OK1" + flight="2345".
const IATA_RE = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\d{1,4}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type FlightStatus =
  | 'scheduled'
  | 'active'
  | 'landed'
  | 'cancelled'
  | 'diverted'
  | 'unknown'

export interface FlightInfo {
  status: FlightStatus
  estimatedArrival: string | null   // ISO datetime string e.g. "2026-04-15T14:35:00.000Z"
  delayMinutes: number | null       // whole minutes from arrival.delay
  departureAirport: string          // IATA e.g. "LHR"
  arrivalAirport: string            // IATA e.g. "PRG"
  terminal: string | null           // arrival terminal, null when absent
}

export type FlightCheckErrorCode =
  | 'INVALID_FORMAT'   // IATA regex failed — no fetch call made
  | 'NOT_FOUND'        // AviationStack returned empty data array
  | 'API_ERROR'        // Non-2xx HTTP response from AviationStack, or missing credentials
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

interface AviationStackArrival {
  iata: string
  scheduled?: string | null
  estimated?: string | null
  actual?: string | null
  delay?: number | null
  terminal?: string | null
}

interface AviationStackEntry {
  flight_status: string
  departure: { iata: string }
  arrival: AviationStackArrival
}

interface AviationStackResponse {
  data?: AviationStackEntry[]
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

  if (!DATE_RE.test(date)) {
    throw new FlightCheckError(
      'INVALID_FORMAT',
      `"${date}" is not a valid date (expected YYYY-MM-DD)`,
    )
  }

  const key = process.env.AVIATIONSTACK_API_KEY
  if (!key) {
    throw new FlightCheckError(
      'API_ERROR',
      'AviationStack credentials are not configured (AVIATIONSTACK_API_KEY missing)',
    )
  }

  const url = `${BASE}?access_key=${key}&flight_iata=${normalised}&flight_date=${date}`

  // Public identifier used in error messages — NEVER include the full url
  // (which contains access_key as a query param).
  const ref = `${normalised} on ${date}`

  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch (err) {
    throw new FlightCheckError('NETWORK_ERROR', `AviationStack unreachable for ${ref}`, err)
  }

  if (!res.ok) {
    throw new FlightCheckError(
      'API_ERROR',
      `AviationStack returned HTTP ${res.status} for ${ref}`,
    )
  }

  let body: AviationStackResponse
  try {
    body = await res.json() as AviationStackResponse
  } catch (err) {
    throw new FlightCheckError(
      'PARSE_ERROR',
      `AviationStack response for ${ref} was not valid JSON`,
      err,
    )
  }

  const entries = body.data
  if (!entries || entries.length === 0) {
    throw new FlightCheckError('NOT_FOUND', `No flight found for ${ref}`)
  }

  if (entries.length > 1) {
    console.warn(`[flight-status] multiple data entries for ${ref} — using [0]`)
  }

  const entry = entries[0]
  const arr = entry.arrival

  const STATUS_MAP: Record<string, FlightStatus> = {
    scheduled: 'scheduled',
    active:    'active',
    landed:    'landed',
    cancelled: 'cancelled',
    diverted:  'diverted',
    incident:  'unknown',
  }

  return {
    status:           STATUS_MAP[entry.flight_status] ?? 'unknown',
    estimatedArrival: arr.actual ?? arr.estimated ?? arr.scheduled ?? null,
    delayMinutes:     arr.delay ?? null,
    departureAirport: entry.departure.iata,
    arrivalAirport:   arr.iata,
    terminal:         arr.terminal ?? null,
  }
}
