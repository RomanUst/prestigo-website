import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-12 (DCAB-02; D-05, D-07, T-94-56): sign-out deletes this session's row, expires the session cookie and
// every cw_* chat cookie, and is idempotent.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  cookieJar: new Map<string, string>(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
    getAll: () => Array.from(h.cookieJar, ([name, value]) => ({ name, value })),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { POST } from '@/app/api/driver/cabinet/sign-out/route'
import { DRIVER_SESSION_COOKIE, createDriverSession, getDriverSession, sha256Hex } from '@/lib/driver-cabinet/auth'

const DRIVER = 'a0000002-0000-4000-8000-000000000002'

let db: FakeDriverCabinetDb

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/driver/cabinet/sign-out', { method: 'POST', headers, body: '{}' })
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie()
}

beforeEach(() => {
  db = createFakeDriverCabinetDb({
    drivers: [{ id: DRIVER, name: 'Ana', email: 'ana@example.com', cabinet_enabled: true }],
  })
  h.db = db
  h.cookieJar.clear()
})

describe('POST /api/driver/cabinet/sign-out', () => {
  it('deletes exactly this session row and keeps the same driver\'s other session', async () => {
    const mine = await createDriverSession(db.client as never, DRIVER)
    const other = await createDriverSession(db.client as never, DRIVER)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, mine.token)

    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const hashes = db.tables.driver_sessions.map((r) => r.token_hash)
    expect(hashes).toEqual([sha256Hex(other.token)])
  })

  it('expires the session cookie on Path / and every cw_* cookie, leaves others alone', async () => {
    const mine = await createDriverSession(db.client as never, DRIVER)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, mine.token)
    h.cookieJar.set('cw_conversation', 'abc')
    h.cookieJar.set('cw_d_session_xyz', 'def')
    h.cookieJar.set('NEXT_LOCALE', 'en')

    const res = await POST(req())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const cookies = setCookies(res)

    const session = cookies.find((c) => c.startsWith(`${DRIVER_SESSION_COOKIE}=`))
    expect(session).toBeDefined()
    expect(session).toMatch(/^prestigo_driver_session=;/)
    expect(session).toMatch(/Max-Age=0/i)
    expect(session).toMatch(/Path=\//i)
    expect(session).toMatch(/HttpOnly/i)

    for (const name of ['cw_conversation', 'cw_d_session_xyz']) {
      const c = cookies.find((x) => x.startsWith(`${name}=`))
      expect(c, name).toBeDefined()
      expect(c).toMatch(/Max-Age=0/i)
      expect(c).toMatch(/Path=\//i)
    }
    expect(cookies.some((c) => c.startsWith('NEXT_LOCALE='))).toBe(false)
  })

  it('afterwards the old cookie no longer opens a session', async () => {
    const mine = await createDriverSession(db.client as never, DRIVER)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, mine.token)
    expect(await getDriverSession()).not.toBeNull()

    await POST(req())
    expect(await getDriverSession()).toBeNull()
  })

  it('without a cookie: 200 { ok: true } and no database call', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(db.calls).toHaveLength(0)
  })

  it('with a malformed cookie: 200 { ok: true } and no database call', async () => {
    h.cookieJar.set(DRIVER_SESSION_COOKIE, 'not-a-token')
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(db.calls).toHaveLength(0)
  })

  it('a well-formed cookie of an unknown session is still a clean 200', async () => {
    h.cookieJar.set(DRIVER_SESSION_COOKIE, 'A'.repeat(43))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(setCookies(res).some((c) => c.startsWith(`${DRIVER_SESSION_COOKIE}=;`))).toBe(true)
  })

  it('deletes by token hash only', async () => {
    const mine = await createDriverSession(db.client as never, DRIVER)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, mine.token)
    db.calls.length = 0
    await POST(req())
    const del = db.calls.find((c) => c.op === 'delete')
    expect(del?.table).toBe('driver_sessions')
    expect(del?.filters).toEqual(['eq token_hash'])
  })

  it('413 for an oversized body before anything else', async () => {
    const mine = await createDriverSession(db.client as never, DRIVER)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, mine.token)
    const res = await POST(req({ 'Content-Length': '5000' }))
    expect(res.status).toBe(413)
    expect(db.tables.driver_sessions).toHaveLength(1)
  })
})
