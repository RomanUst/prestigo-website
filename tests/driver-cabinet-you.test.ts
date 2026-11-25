import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-12 (DCAB-05, DCAB-10; D-13, T-94-54, T-94-55, T-94-57): the You tab data. Profile and stats are
// keyed by the session driver only; the help route mints a Chatwoot identity for the session driver only.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  session: null as null | { driverId: string; sessionId: string },
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({ getDriverSession: async () => h.session }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: h.rateLimit, getClientIp: () => '127.0.0.1' }))

import { getDriverProfile, getDriverStats } from '@/lib/driver-cabinet/profile'
import { driverHelpWidgetEnv } from '@/lib/driver-help-inbox'
import { POST } from '@/app/api/driver/cabinet/help/route'
import { computeIdentifierHash } from '@/lib/chatwoot-identity'
import { parseDriverHelpConfig } from '@/lib/driver-help-contract'

const DRIVER = 'a0000002-0000-4000-8000-000000000002'
const OTHER = 'a0000009-0000-4000-8000-000000000009'
const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ENV_KEYS = [
  'CHATWOOT_BASE_URL',
  'CHATWOOT_WEBSITE_TOKEN',
  'CHATWOOT_WIDGET_HMAC_SECRET',
  'CHATWOOT_DRIVER_WEBSITE_TOKEN',
  'CHATWOOT_DRIVER_WIDGET_HMAC_SECRET',
] as const
const saved: Record<string, string | undefined> = {}

let db: FakeDriverCabinetDb

function booking(n: number, status: string) {
  return {
    id: bid(n),
    status,
    pickup_date: '2026-10-01',
    pickup_time: '10:00',
    pickup_utc: null,
    origin_address: 'A',
    destination_address: 'B',
    client_first_name: 'Anna',
    vehicle_class: 'business_sedan',
    driver_price_czk: 1000,
  }
}

let seq = 0
function assignment(n: number, bookingN: number, status: string, driverId = DRIVER) {
  seq += 1
  return {
    id: aid(n),
    booking_id: bid(bookingN),
    driver_id: driverId,
    status,
    created_at: new Date(Date.UTC(2026, 9, 1, 8, 0, seq)).toISOString(),
  }
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER, name: 'Ana Novak', email: 'ana@example.com', phone: '', vehicle_info: 'Mercedes V-Class', vehicle_plate: ' 1ab 2345 ', cabinet_enabled: true },
      { id: OTHER, name: 'Other Driver', email: 'other@example.com', phone: '+420111222333', cabinet_enabled: true },
    ],
  })
  h.db = db
  h.session = { driverId: DRIVER, sessionId: 's1' }
  h.rateLimit.mockReset()
  h.rateLimit.mockResolvedValue({ allowed: true })
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('getDriverProfile', () => {
  it('returns the six printed fields, an empty phone as null, the plate normalised', async () => {
    const profile = await getDriverProfile(db.client, DRIVER)
    expect(profile).toEqual({
      name: 'Ana Novak',
      phone: null,
      email: 'ana@example.com',
      vehicleInfo: 'Mercedes V-Class',
      plate: '1AB 2345',
    })
  })

  it('selects only the profile columns and filters on the driver id', async () => {
    await getDriverProfile(db.client, DRIVER)
    const call = db.calls.find((c) => c.table === 'drivers')
    expect(call?.columns).toBe('name, phone, email, vehicle_info, vehicle_plate')
    expect(call?.filters).toEqual(['eq id'])
  })

  it('null for an unknown driver', async () => {
    expect(await getDriverProfile(db.client, 'f0000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('keeps a real phone and maps empty vehicle info to null', async () => {
    const profile = await getDriverProfile(db.client, OTHER)
    expect(profile?.phone).toBe('+420111222333')
    expect(profile?.vehicleInfo).toBeNull()
    expect(profile?.plate).toBeNull()
  })
})

describe('getDriverStats', () => {
  it('3 accepted + 1 declined -> 75, pending excluded', async () => {
    db = createFakeDriverCabinetDb({
      drivers: [{ id: DRIVER, name: 'Ana', email: 'a@example.com', cabinet_enabled: true }],
      bookings: [booking(1, 'completed'), booking(2, 'completed'), booking(3, 'assigned'), booking(4, 'assigned'), booking(5, 'assigned')],
      driver_assignments: [
        assignment(1, 1, 'accepted'),
        assignment(2, 2, 'accepted'),
        assignment(3, 3, 'accepted'),
        assignment(4, 4, 'declined'),
        assignment(5, 5, 'pending'),
      ],
    })
    const stats = await getDriverStats(db.client, DRIVER)
    expect(stats.offersAcceptedPercent).toBe(75)
    expect(stats.ridesCompleted).toBe(2)
  })

  it('rounds to an integer', async () => {
    db = createFakeDriverCabinetDb({
      drivers: [{ id: DRIVER, name: 'Ana', email: 'a@example.com', cabinet_enabled: true }],
      bookings: [booking(1, 'assigned'), booking(2, 'assigned'), booking(3, 'assigned')],
      driver_assignments: [assignment(1, 1, 'accepted'), assignment(2, 2, 'accepted'), assignment(3, 3, 'declined')],
    })
    expect((await getDriverStats(db.client, DRIVER)).offersAcceptedPercent).toBe(67)
  })

  it('no answered offer -> null, no rides -> 0', async () => {
    db = createFakeDriverCabinetDb({
      drivers: [{ id: DRIVER, name: 'Ana', email: 'a@example.com', cabinet_enabled: true }],
      bookings: [booking(1, 'assigned')],
      driver_assignments: [assignment(1, 1, 'pending')],
    })
    expect(await getDriverStats(db.client, DRIVER)).toEqual({ ridesCompleted: 0, offersAcceptedPercent: null })
  })

  it("another driver's assignments never count", async () => {
    db = createFakeDriverCabinetDb({
      drivers: [
        { id: DRIVER, name: 'Ana', email: 'a@example.com', cabinet_enabled: true },
        { id: OTHER, name: 'Bob', email: 'b@example.com', cabinet_enabled: true },
      ],
      bookings: [booking(1, 'completed'), booking(2, 'completed')],
      driver_assignments: [assignment(1, 1, 'accepted', OTHER), assignment(2, 2, 'declined', OTHER)],
    })
    expect(await getDriverStats(db.client, DRIVER)).toEqual({ ridesCompleted: 0, offersAcceptedPercent: null })
    expect(await getDriverStats(db.client, OTHER)).toEqual({ ridesCompleted: 1, offersAcceptedPercent: 50 })
  })

  it('every assignment read carries the driver id filter', async () => {
    await getDriverStats(db.client, DRIVER)
    const reads = db.calls.filter((c) => c.table === 'driver_assignments' && c.filters.includes('eq driver_id'))
    expect(reads.length).toBeGreaterThanOrEqual(2)
  })
})

describe('driverHelpWidgetEnv', () => {
  it('uses the dedicated driver pair when both values are set', () => {
    process.env.CHATWOOT_BASE_URL = 'https://chat.example.test/'
    process.env.CHATWOOT_WEBSITE_TOKEN = 'web-token'
    process.env.CHATWOOT_WIDGET_HMAC_SECRET = 'web-secret'
    process.env.CHATWOOT_DRIVER_WEBSITE_TOKEN = 'drv-token'
    process.env.CHATWOOT_DRIVER_WIDGET_HMAC_SECRET = 'drv-secret'
    expect(driverHelpWidgetEnv()).toEqual({
      baseUrl: 'https://chat.example.test/',
      websiteToken: 'drv-token',
      hmacSecret: 'drv-secret',
    })
  })

  it('falls back to the website pair when only one driver value is set', () => {
    process.env.CHATWOOT_BASE_URL = 'https://chat.example.test/'
    process.env.CHATWOOT_WEBSITE_TOKEN = 'web-token'
    process.env.CHATWOOT_WIDGET_HMAC_SECRET = 'web-secret'
    process.env.CHATWOOT_DRIVER_WEBSITE_TOKEN = 'drv-token'
    expect(driverHelpWidgetEnv()).toEqual({
      baseUrl: 'https://chat.example.test/',
      websiteToken: 'web-token',
      hmacSecret: 'web-secret',
    })
  })
})

describe('POST /api/driver/cabinet/help', () => {
  function setEnv() {
    process.env.CHATWOOT_BASE_URL = 'https://chat.example.test/'
    process.env.CHATWOOT_WEBSITE_TOKEN = 'web-token'
    process.env.CHATWOOT_WIDGET_HMAC_SECRET = 'web-secret'
  }

  function req(body = '{}') {
    return new Request('http://localhost/api/driver/cabinet/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }

  it('401 without a session and no Chatwoot config is built', async () => {
    setEnv()
    h.session = null
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(db.calls.filter((c) => c.table === 'drivers')).toHaveLength(0)
  })

  it('mints the identity of the session driver with the fixed DRIVER-CABINET reference', async () => {
    setEnv()
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    const parsed = parseDriverHelpConfig(body)
    expect(parsed).not.toBeNull()
    expect(parsed?.user.identifier).toBe(`driver:${DRIVER}`)
    expect(parsed?.user.name).toBe('Ana Novak (driver)')
    expect(parsed?.user.identifierHash).toBe(computeIdentifierHash('web-secret', `driver:${DRIVER}`))
    expect(parsed?.conversation.driver_trip_ref).toBe('DRIVER-CABINET')
  })

  it('ignores a driverId in the request body', async () => {
    setEnv()
    const res = await POST(req(JSON.stringify({ driverId: OTHER, driver_id: OTHER })))
    const parsed = parseDriverHelpConfig(await res.json())
    expect(parsed?.user.identifier).toBe(`driver:${DRIVER}`)
  })

  it('uses the dedicated driver inbox pair when set', async () => {
    setEnv()
    process.env.CHATWOOT_DRIVER_WEBSITE_TOKEN = 'drv-token'
    process.env.CHATWOOT_DRIVER_WIDGET_HMAC_SECRET = 'drv-secret'
    const parsed = parseDriverHelpConfig(await (await POST(req())).json())
    expect(parsed?.websiteToken).toBe('drv-token')
    expect(parsed?.user.identifierHash).toBe(computeIdentifierHash('drv-secret', `driver:${DRIVER}`))
  })

  it('answers { enabled: false } when Chatwoot is not configured', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
  })

  it('rate limits under the cabinet help key', async () => {
    setEnv()
    await POST(req())
    expect(h.rateLimit).toHaveBeenCalledWith('/api/driver/cabinet/help', '127.0.0.1')
    h.rateLimit.mockResolvedValue({ allowed: false })
    const res = await POST(req())
    expect(res.status).toBe(429)
  })

  it('413 for an oversized body before anything else runs', async () => {
    setEnv()
    const big = new Request('http://localhost/api/driver/cabinet/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '5000' },
      body: '{}',
    })
    const res = await POST(big)
    expect(res.status).toBe(413)
    expect(h.rateLimit).not.toHaveBeenCalled()
  })
})
