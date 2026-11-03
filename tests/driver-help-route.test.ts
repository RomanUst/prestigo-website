import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Phase 87 plan 18 (UAT gap 3, T-87-56..60): token-gated endpoint that turns a live trip link into a
// Chatwoot widget identity for the driver. Mirrors the progress route: size guard, rate limit, uuid check
// before any DB call, one live lookup, uniform invalid_token.

const REPO_ROOT = path.resolve(__dirname, '..')

const { stubSupabaseFrom, mockCheckRateLimit, mockGetClientIp, mockCreateClient } = vi.hoisted(() => ({
  stubSupabaseFrom: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(() => '127.0.0.1'),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: mockCreateClient,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}))

import { POST } from '@/app/api/driver/trip/[token]/help/route'
import { computeIdentifierHash } from '@/lib/chatwoot-identity'
import { parseDriverHelpConfig } from '@/lib/driver-help-contract'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'
const SECRET = 'website-hmac-secret-value'
const DRIVER_SECRET = 'driver-inbox-hmac-secret-value'

const ENV_KEYS = [
  'CHATWOOT_BASE_URL',
  'CHATWOOT_WEBSITE_TOKEN',
  'CHATWOOT_WIDGET_HMAC_SECRET',
  'CHATWOOT_DRIVER_WEBSITE_TOKEN',
  'CHATWOOT_DRIVER_WIDGET_HMAC_SECRET',
] as const

function setWebsiteEnv() {
  process.env.CHATWOOT_BASE_URL = 'https://chat.example.test/'
  process.env.CHATWOOT_WEBSITE_TOKEN = 'website-token-abc'
  process.env.CHATWOOT_WIDGET_HMAC_SECRET = SECRET
}

function makeRequest(token: string): Request {
  return new Request(`http://localhost/api/driver/trip/${token}/help`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

function callRoute(token: string) {
  return POST(makeRequest(token), { params: Promise.resolve({ token }) })
}

function makeRow(
  overrides: {
    assignmentDriverId?: string
    assignmentStatus?: string | null
    bookingDriverId?: string | null
    bookingStatus?: string
    bookingReference?: string
    driverName?: string | null
  } = {},
) {
  return {
    id: 'assign-1',
    driver_id: overrides.assignmentDriverId ?? driverId,
    status: overrides.assignmentStatus === undefined ? 'accepted' : overrides.assignmentStatus,
    bookings: {
      booking_reference: overrides.bookingReference ?? 'PRG-20261104-ABC123',
      status: overrides.bookingStatus ?? 'assigned',
      driver_id: overrides.bookingDriverId === undefined ? driverId : overrides.bookingDriverId,
    },
    drivers: { name: overrides.driverName === undefined ? 'Ivan Petrov' : overrides.driverName },
  }
}

function mockLookup(data: unknown, error: unknown = null) {
  const selectFn = vi.fn()
  const eqFn = vi.fn()
  const singleFn = vi.fn().mockResolvedValue({ data, error })
  eqFn.mockReturnValue({ single: singleFn })
  selectFn.mockReturnValue({ eq: eqFn })
  stubSupabaseFrom.mockImplementation(() => ({ select: selectFn }))
  return { selectFn, eqFn, singleFn }
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  mockCreateClient.mockImplementation(() => ({ from: stubSupabaseFrom }))
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  mockGetClientIp.mockReturnValue('127.0.0.1')
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('POST /api/driver/trip/[token]/help: tracer (T-87-56, T-87-58)', () => {
  it('a live link gets the identified driver widget config and no-store', async () => {
    setWebsiteEnv()
    const { selectFn, eqFn } = mockLookup(makeRow())

    const res = await callRoute(validToken)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const identifier = `driver:${driverId}`
    expect(await res.json()).toEqual({
      enabled: true,
      baseUrl: 'https://chat.example.test',
      websiteToken: 'website-token-abc',
      user: {
        identifier,
        identifierHash: computeIdentifierHash(SECRET, identifier),
        name: 'Ivan Petrov (driver)',
        email: null,
        phone: null,
      },
      conversation: { chat_role: 'driver', driver_trip_ref: 'PRG-20261104-ABC123' },
    })

    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(selectFn).toHaveBeenCalledWith(
      'id, driver_id, status, bookings!inner(booking_reference, status, driver_id), drivers(name)',
    )
    expect(eqFn).toHaveBeenCalledWith('trip_token', validToken)
  })

  it('the 87-17 parser accepts the response unchanged', async () => {
    setWebsiteEnv()
    mockLookup(makeRow())

    const body = await (await callRoute(validToken)).json()
    expect(parseDriverHelpConfig(body)).toEqual(body)
  })

  it('rate limits by the literal key and the client IP; LIMITS carries the key at 10', async () => {
    setWebsiteEnv()
    mockLookup(makeRow())
    mockGetClientIp.mockReturnValue('203.0.113.9')

    await callRoute(validToken)
    expect(mockCheckRateLimit).toHaveBeenCalledWith('/api/driver/trip/help', '203.0.113.9')

    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib/rate-limit.ts'), 'utf8')
    expect(src).toMatch(/'\/api\/driver\/trip\/help':\s+10/)
  })

  it('exports only POST', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'app/api/driver/trip/[token]/help/route.ts'), 'utf8')
    expect(src).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/)
    expect(src).toMatch(/export async function POST/)
  })
})

describe('POST /api/driver/trip/[token]/help: uniform rejections (T-87-56)', () => {
  const INVALID = { error: 'invalid_token' }

  it('a non-uuid token is rejected before any DB call', async () => {
    setWebsiteEnv()
    mockLookup(makeRow())

    const res = await callRoute('not-a-uuid')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(INVALID)
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  const rejected: Array<[string, () => void]> = [
    ['unknown token', () => mockLookup(null, { message: 'Not found' })],
    ['lookup error with data', () => mockLookup(makeRow(), { message: 'boom' })],
    ['declined assignment', () => mockLookup(makeRow({ assignmentStatus: 'declined' }))],
    ['reassigned booking', () => mockLookup(makeRow({ assignmentDriverId: driverId, bookingDriverId: otherDriverId }))],
    ['driverless booking', () => mockLookup(makeRow({ bookingDriverId: null }))],
    ['completed booking', () => mockLookup(makeRow({ bookingStatus: 'completed' }))],
    ['cancelled booking', () => mockLookup(makeRow({ bookingStatus: 'cancelled' }))],
    ['no_show booking', () => mockLookup(makeRow({ bookingStatus: 'no_show' }))],
  ]

  it.each(rejected)('%s: 400 with the same body as an unknown token', async (_label, arrange) => {
    setWebsiteEnv()
    arrange()

    const res = await callRoute(validToken)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(INVALID)
  })

  it('rate limit denied: 429 and no DB call', async () => {
    setWebsiteEnv()
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, limit: 10 })
    mockLookup(makeRow())

    const res = await callRoute(validToken)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/driver/trip/[token]/help: inbox selection and fail closed (T-87-60)', () => {
  it('both driver-inbox values set: the driver pair is used', async () => {
    setWebsiteEnv()
    process.env.CHATWOOT_DRIVER_WEBSITE_TOKEN = 'driver-token-xyz'
    process.env.CHATWOOT_DRIVER_WIDGET_HMAC_SECRET = DRIVER_SECRET
    mockLookup(makeRow())

    const body = await (await callRoute(validToken)).json()
    expect(body.websiteToken).toBe('driver-token-xyz')
    expect(body.user.identifierHash).toBe(computeIdentifierHash(DRIVER_SECRET, `driver:${driverId}`))
  })

  it.each([
    ['only the driver token', { CHATWOOT_DRIVER_WEBSITE_TOKEN: 'driver-token-xyz' }],
    ['only the driver secret', { CHATWOOT_DRIVER_WIDGET_HMAC_SECRET: DRIVER_SECRET }],
  ])('%s set: the Website pair is used', async (_label, extra) => {
    setWebsiteEnv()
    Object.assign(process.env, extra)
    mockLookup(makeRow())

    const body = await (await callRoute(validToken)).json()
    expect(body.websiteToken).toBe('website-token-abc')
    expect(body.user.identifierHash).toBe(computeIdentifierHash(SECRET, `driver:${driverId}`))
  })

  it.each([
    ['base URL missing', () => { delete process.env.CHATWOOT_BASE_URL }],
    ['base URL over http', () => { process.env.CHATWOOT_BASE_URL = 'http://chat.example.test' }],
    ['base URL with a path', () => { process.env.CHATWOOT_BASE_URL = 'https://chat.example.test/app' }],
    ['website token missing', () => { delete process.env.CHATWOOT_WEBSITE_TOKEN }],
    ['HMAC secret missing', () => { delete process.env.CHATWOOT_WIDGET_HMAC_SECRET }],
  ])('%s: 200 { enabled: false }', async (_label, breakEnv) => {
    setWebsiteEnv()
    breakEnv()
    mockLookup(makeRow())

    const res = await callRoute(validToken)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
  })
})

describe('POST /api/driver/trip/[token]/help: name and reference hardening', () => {
  it('an empty or missing driver name falls back to "Driver"', async () => {
    setWebsiteEnv()
    mockLookup(makeRow({ driverName: '   ' }))
    expect((await (await callRoute(validToken)).json()).user.name).toBe('Driver')

    mockLookup(makeRow({ driverName: null }))
    expect((await (await callRoute(validToken)).json()).user.name).toBe('Driver')
  })

  it('a 200-character name is capped at 120', async () => {
    setWebsiteEnv()
    mockLookup(makeRow({ driverName: 'A'.repeat(200) }))

    const body = await (await callRoute(validToken)).json()
    expect(body.user.name.length).toBe(120)
    expect(parseDriverHelpConfig(body)).not.toBeNull()
  })

  it('a booking reference loses control characters and is capped at 60', async () => {
    setWebsiteEnv()
    mockLookup(makeRow({ bookingReference: `PRG-1\u0000\n${'X'.repeat(100)}` }))

    const body = await (await callRoute(validToken)).json()
    const ref: string = body.conversation.driver_trip_ref
    expect(ref.length).toBe(60)
    expect(ref.startsWith('PRG-1XXX')).toBe(true)
    // eslint-disable-next-line no-control-regex
    expect(ref).not.toMatch(/[\u0000-\u001f\u007f]/)
    expect(parseDriverHelpConfig(body)).not.toBeNull()
  })
})

describe('POST /api/driver/trip/[token]/help: response hygiene (T-87-57)', () => {
  it('the body holds no token, passenger data, address, phone or HMAC secret, and nothing is logged with the token', async () => {
    setWebsiteEnv()
    process.env.CHATWOOT_DRIVER_WEBSITE_TOKEN = 'driver-token-xyz'
    process.env.CHATWOOT_DRIVER_WIDGET_HMAC_SECRET = DRIVER_SECRET
    const base = makeRow()
    mockLookup({
      ...base,
      bookings: {
        ...base.bookings,
        client_name: 'Passenger Smith',
        client_phone: '+420123456789',
        origin_address: 'Old Town Square 1',
      },
    })
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ]

    const res = await callRoute(validToken)
    const raw = JSON.stringify(await res.json())

    expect(raw).not.toContain(validToken)
    expect(raw).not.toContain('Passenger')
    expect(raw).not.toContain('+420')
    expect(raw).not.toContain('Old Town')
    expect(raw).not.toContain('@')
    expect(raw).not.toContain(SECRET)
    expect(raw).not.toContain(DRIVER_SECRET)
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(validToken)
      spy.mockRestore()
    }
  })

  it('a rejection body carries no token either', async () => {
    mockLookup(null, { message: 'Not found' })
    const rejected = await callRoute(validToken)
    expect(JSON.stringify(await rejected.json())).not.toContain(validToken)
  })
})
