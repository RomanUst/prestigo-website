import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 87 Plan 08 Task 2 (D-14): the start gate for the first driver step. unlock = pickup
// instant - (120 min + travel minutes from the Prague centre). No real network: fetch is injected.

import { pickupInstantMs } from '@/lib/prague-date'
import {
  CENTRE_RADIUS_KM,
  MAX_TRAVEL_MINUTES,
  PRAGUE_CENTRE,
  START_LEAD_MINUTES,
  clearStartGateCache,
  fallbackTravelMinutes,
  getStartGate,
  startUnlockAtMs,
  travelMinutesFromCentre,
} from '@/lib/start-gate'
import { haversineDistanceKm } from '@/lib/geo-distance'

const MIN = 60_000

// Central pickup near Old Town Square.
const CENTRAL = { lat: 50.087, lng: 14.421 }
// Airport (PRG).
const AIRPORT = { lat: 50.1008, lng: 14.26 }

function booking(overrides: Partial<{
  id: string
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
  origin_lat: number | null
  origin_lng: number | null
}> = {}) {
  return {
    id: 'bk-1',
    pickup_utc: null,
    pickup_date: '2026-11-12',
    pickup_time: '14:30',
    origin_lat: CENTRAL.lat,
    origin_lng: CENTRAL.lng,
    ...overrides,
  }
}

function okFetch(duration: string | undefined) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => (duration === undefined ? { routes: [{}] } : { routes: [{ duration }] }),
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  clearStartGateCache()
  vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('constants', () => {
  it('uses Old Town Square, a 5 km radius and a 2 h lead', () => {
    expect(PRAGUE_CENTRE).toEqual({ lat: 50.0875, lng: 14.4208 })
    expect(CENTRE_RADIUS_KM).toBe(5)
    expect(START_LEAD_MINUTES).toBe(120)
    expect(MAX_TRAVEL_MINUTES).toBe(240)
  })
})

describe('fallbackTravelMinutes / startUnlockAtMs', () => {
  it('is ceil(km * 1.4 / 45 km/h * 60)', () => {
    expect(fallbackTravelMinutes(0)).toBe(0)
    expect(fallbackTravelMinutes(30)).toBe(56) // 30*1.4/45*60 = 56
    expect(fallbackTravelMinutes(10)).toBe(19) // 18.67 -> 19
  })

  it('unlock = pickup - (120 + travel) minutes', () => {
    expect(startUnlockAtMs(1_000_000_000_000, 25)).toBe(1_000_000_000_000 - 145 * MIN)
  })
})

describe('getStartGate: central pickups (no Maps call)', () => {
  it('unlocks exactly 120 min before the pickup instant and never calls fetch', async () => {
    const fetchImpl = okFetch('9999s')
    const b = booking()
    const pickup = pickupInstantMs(b) as number
    // 2026-11-12 14:30 Prague (CET, UTC+1) = 13:30Z
    expect(pickup).toBe(Date.parse('2026-11-12T13:30:00Z'))

    const gate = await getStartGate(b, pickup - 3 * 60 * MIN, { fetchImpl })

    expect(gate.unlocksAtMs).toBe(pickup - 120 * MIN)
    expect(gate.unlocksAtMs).toBe(Date.parse('2026-11-12T11:30:00Z'))
    expect(gate.open).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('is open at and after the unlock instant, closed one millisecond before', async () => {
    const b = booking()
    const unlock = (pickupInstantMs(b) as number) - 120 * MIN
    expect((await getStartGate(b, unlock - 1)).open).toBe(false)
    expect((await getStartGate(b, unlock)).open).toBe(true)
    expect((await getStartGate(b, unlock + 5 * MIN)).open).toBe(true)
  })

  it.each([
    ['2027-03-28', '10:00', '2027-03-28T06:00:00Z'], // CEST starts 02:00 that day: 10:00 local = 08:00Z
    ['2026-03-29', '03:30', '2026-03-28T23:30:00Z'], // 02:00 -> 03:00 jump: 03:30 local = 01:30Z
  ])('DST %s %s: unlock is exactly 120 min before the pickup instant', async (date, time, expectedUnlockIso) => {
    const b = booking({ pickup_date: date, pickup_time: time })
    const pickup = pickupInstantMs(b) as number

    const gate = await getStartGate(b, 0)

    expect(gate.unlocksAtMs).toBe(pickup - 120 * MIN)
    expect(new Date(gate.unlocksAtMs as number).toISOString()).toBe(new Date(Date.parse(expectedUnlockIso)).toISOString())
  })

  it('2027-10-31 02:30 (repeated hour): unlock is exactly 120 min before the computed instant', async () => {
    const b = booking({ pickup_date: '2027-10-31', pickup_time: '02:30' })
    const pickup = pickupInstantMs(b) as number
    expect(Number.isFinite(pickup)).toBe(true)

    const gate = await getStartGate(b, 0)

    expect(gate.unlocksAtMs).toBe(pickup - 120 * MIN)
  })

  it('pickup_utc wins over the wall clock', async () => {
    const b = booking({ pickup_utc: '2026-11-12T09:00:00Z' })
    const gate = await getStartGate(b, 0)
    expect(gate.unlocksAtMs).toBe(Date.parse('2026-11-12T07:00:00Z'))
  })
})

describe('getStartGate: Maps travel time', () => {
  it('airport pickup: 1500s = 25 min, unlock = pickup - 145 min; second call hits the cache', async () => {
    const fetchImpl = okFetch('1500s')
    const b = booking({ origin_lat: AIRPORT.lat, origin_lng: AIRPORT.lng })
    const pickup = pickupInstantMs(b) as number

    const first = await getStartGate(b, 0, { fetchImpl })
    const second = await getStartGate(b, 0, { fetchImpl })

    expect(first.unlocksAtMs).toBe(pickup - 145 * MIN)
    expect(second.unlocksAtMs).toBe(pickup - 145 * MIN)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('calls the Routes API with the field mask routes.duration and the server key', async () => {
    const fetchImpl = okFetch('1500s')
    await travelMinutesFromCentre(AIRPORT, { bookingId: 'bk-9', fetchImpl })

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toBe('routes.duration')
    expect(headers['X-Goog-Api-Key']).toBe('test-key')
    const sent = JSON.parse(init.body as string)
    expect(sent.origin.location.latLng).toEqual({ latitude: PRAGUE_CENTRE.lat, longitude: PRAGUE_CENTRE.lng })
    expect(sent.destination.location.latLng).toEqual({ latitude: AIRPORT.lat, longitude: AIRPORT.lng })
    expect(sent.travelMode).toBe('DRIVE')
  })

  it('rounds a partial minute up', async () => {
    const minutes = await travelMinutesFromCentre(AIRPORT, { bookingId: 'bk-r', fetchImpl: okFetch('1501s') })
    expect(minutes).toBe(26)
  })

  it('caps travel at 240 minutes', async () => {
    const minutes = await travelMinutesFromCentre(AIRPORT, { bookingId: 'bk-cap', fetchImpl: okFetch('90000s') })
    expect(minutes).toBe(MAX_TRAVEL_MINUTES)
  })

  it('a different booking id does not share the cache entry', async () => {
    const fetchImpl = okFetch('1200s')
    await travelMinutesFromCentre(AIRPORT, { bookingId: 'a', fetchImpl })
    await travelMinutesFromCentre(AIRPORT, { bookingId: 'b', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('getStartGate: fallbacks never block the driver', () => {
  const km = haversineDistanceKm(PRAGUE_CENTRE.lat, PRAGUE_CENTRE.lng, AIRPORT.lat, AIRPORT.lng)
  const expectedFallback = fallbackTravelMinutes(km)

  it('a rejecting fetch falls back to the haversine estimate', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f1', fetchImpl })).toBe(expectedFallback)
  })

  it('a non-ok response falls back', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f2', fetchImpl })).toBe(expectedFallback)
  })

  it('a body without duration falls back', async () => {
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f3', fetchImpl: okFetch(undefined) })).toBe(expectedFallback)
  })

  it('a zero or garbage duration falls back', async () => {
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f4', fetchImpl: okFetch('0s') })).toBe(expectedFallback)
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f5', fetchImpl: okFetch('soon') })).toBe(expectedFallback)
  })

  it('a timeout (fetch that never settles until aborted) falls back', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    ) as unknown as typeof fetch
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f6', fetchImpl, timeoutMs: 10 })).toBe(expectedFallback)
  })

  it('a missing API key falls back without calling fetch', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '')
    const fetchImpl = okFetch('1500s')
    expect(await travelMinutesFromCentre(AIRPORT, { bookingId: 'f7', fetchImpl })).toBe(expectedFallback)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('the fallback is capped at 240 minutes', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '')
    // Far away: ~1000 km straight line
    const minutes = await travelMinutesFromCentre({ lat: 41.9, lng: 12.5 }, { bookingId: 'f8' })
    expect(minutes).toBe(MAX_TRAVEL_MINUTES)
  })

  it('origin null (or without coordinates) means travel 0', async () => {
    const fetchImpl = okFetch('1500s')
    expect(await travelMinutesFromCentre(null, { fetchImpl })).toBe(0)
    expect(await travelMinutesFromCentre({ lat: null, lng: null }, { fetchImpl })).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a pickup instant that does not parse is an open gate', async () => {
    const gate = await getStartGate(booking({ pickup_utc: null, pickup_date: 'garbage', pickup_time: '??' }), 0)
    expect(gate).toEqual({ unlocksAtMs: null, open: true })
  })
})
