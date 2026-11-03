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
