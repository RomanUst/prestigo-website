import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-02 (DCAB-01 / DCAB-02, D-05, Pitfall 4 + 5): every cabinet page gates itself with
// requireDriver(); the sign-in "next" parameter is a strict allow-list of the three tab paths.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  cookieJar: new Map<string, string>(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => h.db.client,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
  }),
}))

class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
}))

import { safeDriverNext } from '@/lib/driver-cabinet/safe-next'
import { DRIVER_SESSION_COOKIE, createDriverSession, requireDriver } from '@/lib/driver-cabinet/auth'

const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const UUID = 'b0000001-0000-4000-8000-000000000001'

let db: FakeDriverCabinetDb

beforeEach(() => {
  db = createFakeDriverCabinetDb({
    drivers: [{ id: DRIVER_ID, name: 'Ana', email: 'ana@example.com', cabinet_enabled: true }],
  })
  h.db = db
  h.cookieJar.clear()
})

async function redirectTarget(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (e) {
    if (e instanceof RedirectError) return e.url
    throw e
  }
}

describe('safeDriverNext (Pitfall 5, T-94-09, T-94-10)', () => {
  it.each([
    '/driver/rides',
    '/driver/rides?view=past&month=2026-11',
    `/driver/rides/${UUID}`,
    '/driver/offers',
    '/driver/you#notifications',
    '/driver/you',
  ])('accepts %s unchanged', (value) => {
    expect(safeDriverNext(value)).toBe(value)
  })

  it.each([
    ['non-string number', 42],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
    ['empty', ''],
    ['too long', '/driver/rides?x=' + 'a'.repeat(512)],
    ['protocol-relative', '//evil.com'],
    ['double slash inside', '/driver//rides'],
    ['backslash', '/\\evil.com'],
    ['dot-dot traversal', '/driver/rides/../../admin'],
    ['login page', '/driver/login'],
    ['login page with next', '/driver/login?next=/driver/rides'],
    ['trip token page', `/driver/trip/${UUID}`],
    ['response token page', '/driver/response?token=x'],
    ['bare /driver', '/driver'],
    ['prefix lookalike', '/driverx'],
    ['rides lookalike', '/driver/ridesx'],
    ['absolute url', 'https://evil.com/driver/rides'],
    ['space', '/driver/rides x'],
    ['tab', '/driver/rides\t'],
    ['newline', '/driver/rides\n'],
    ['line separator', '/driver/rides '],
    ['DEL', '/driver/rides\u007f'],
  ])('rejects %s', (_label, value) => {
    expect(safeDriverNext(value)).toBeNull()
  })
})

describe('requireDriver', () => {
  it('returns the driver for a valid session and does not redirect', async () => {
    const { token } = await createDriverSession(db.client as never, DRIVER_ID)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    const session = await requireDriver('/driver/offers')
    expect(session).toEqual({ driverId: DRIVER_ID, sessionId: db.tables.driver_sessions[0].id })
  })

  it('redirects to sign-in with the safe next and no ended flag when there is no cookie', async () => {
    const url = await redirectTarget(() => requireDriver('/driver/offers'))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Foffers')
  })

  it('adds ended=1 when a cookie was present but the session is no longer valid (unknown token)', async () => {
    h.cookieJar.set(DRIVER_SESSION_COOKIE, 'A'.repeat(43))
    const url = await redirectTarget(() => requireDriver('/driver/offers'))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Foffers&ended=1')
  })

  it('adds ended=1 for an expired session', async () => {
    const { token } = await createDriverSession(db.client as never, DRIVER_ID)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    db.tables.driver_sessions[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const url = await redirectTarget(() => requireDriver('/driver/rides'))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Frides&ended=1')
  })

  it('adds ended=1 when the driver was disabled', async () => {
    const { token } = await createDriverSession(db.client as never, DRIVER_ID)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    db.tables.drivers.find((d) => d.id === DRIVER_ID)!.cabinet_enabled = false
    const url = await redirectTarget(() => requireDriver('/driver/you'))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Fyou&ended=1')
  })

  it('falls back to /driver/rides for an unsafe nextPath', async () => {
    const url = await redirectTarget(() => requireDriver('//evil'))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Frides')
  })

  it('never carries a trip token into the sign-in URL', async () => {
    const url = await redirectTarget(() => requireDriver(`/driver/trip/${UUID}`))
    expect(url).toBe('/driver/login?next=%2Fdriver%2Frides')
    expect(url).not.toContain(UUID)
  })
})
