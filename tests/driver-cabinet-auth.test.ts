import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-01 (tracer, DCAB-01 / DCAB-02 / DCAB-04, D-05 / D-06 / D-07 / D-16): an invited driver asks for a
// 6-digit code by email, signs in with it and holds a 30-day driver-only session that is checked on every request.
// Proven end-to-end in-process: request-code route -> email -> verify route -> cookie -> getDriverSession().

const REPO_ROOT = path.resolve(__dirname, '..')

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  cookieJar: new Map<string, string>(),
  checkRateLimit: vi.fn(),
  sendCode: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => h.db.client,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: h.checkRateLimit,
  getClientIp: () => '203.0.113.7',
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
  }),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (cb: () => unknown) => void cb() }
})

vi.mock('@/lib/email', () => ({
  sendDriverLoginCodeEmail: h.sendCode,
}))

import { POST as requestCode } from '@/app/api/driver/cabinet/request-code/route'
import { POST as verify } from '@/app/api/driver/cabinet/verify/route'
import {
  DRIVER_SESSION_COOKIE,
  getDriverSession,
  hashLoginCode,
  sha256Hex,
} from '@/lib/driver-cabinet/auth'

const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const INVITED_EMAIL = 'Ana.Driver@Example.com'

let db: FakeDriverCabinetDb

function seed(extra: Array<Record<string, unknown>> = []) {
  db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER_ID, name: 'Ana', email: INVITED_EMAIL, cabinet_enabled: true },
      { id: 'a0000003-0000-4000-8000-000000000003', name: 'Off', email: 'off@example.com', cabinet_enabled: false },
      ...extra,
    ],
  })
  h.db = db
}

function json(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const reqCode = (email: unknown) => requestCode(json('/api/driver/cabinet/request-code', { email }))
const reqVerify = (email: string, code: string) => verify(json('/api/driver/cabinet/verify', { email, code }))

function lastCode(): string {
  const calls = h.sendCode.mock.calls
  return (calls[calls.length - 1][0] as { code: string }).code
}

function cookieValue(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${DRIVER_SESSION_COOKIE}=([^;]+)`).exec(header)
  return m ? m[1] : ''
}

beforeEach(() => {
  seed()
  h.cookieJar.clear()
  h.checkRateLimit.mockReset()
  h.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, limit: 5 })
  h.sendCode.mockReset()
  h.sendCode.mockResolvedValue(true)
  vi.unstubAllEnvs()
})

describe('POST /api/driver/cabinet/request-code', () => {
  it('invited driver: 200 ok, one email with a 6-digit code to the stored address, only a hash stored', async () => {
    const res = await reqCode(' Ana.driver@example.COM ')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('cache-control')).toBe('no-store')

    expect(h.sendCode).toHaveBeenCalledTimes(1)
    const arg = h.sendCode.mock.calls[0][0] as { to: string; code: string }
    expect(arg.to).toBe(INVITED_EMAIL)
    expect(arg.code).toMatch(/^\d{6}$/)

    expect(db.tables.driver_login_codes).toHaveLength(1)
    const row = db.tables.driver_login_codes[0]
    expect(row.driver_id).toBe(DRIVER_ID)
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.code_hash).toBe(hashLoginCode(row.id as string, arg.code))
    expect(JSON.stringify(row)).not.toContain(arg.code)
    const ttl = new Date(row.expires_at as string).getTime() - Date.now()
    expect(ttl).toBeGreaterThan(9 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000)
  })

  it('unknown, not-invited and disabled emails get the byte-identical answer, no email, no row', async () => {
    const invited = await reqCode(INVITED_EMAIL)
    const invitedBody = await invited.text()
    db.tables.driver_login_codes.length = 0
    h.sendCode.mockClear()

    for (const email of ['nobody@example.com', 'off@example.com', 'another.unknown@example.org']) {
      const res = await reqCode(email)
      expect(res.status).toBe(invited.status)
      expect(await res.text()).toBe(invitedBody)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(h.sendCode).not.toHaveBeenCalled()
    expect(db.tables.driver_login_codes).toHaveLength(0)
  })

  it('malformed email -> 400 invalid_email; non-JSON -> 400 invalid_json', async () => {
    const bad = await reqCode('not-an-email')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_email' })

    const missing = await requestCode(json('/api/driver/cabinet/request-code', {}))
    expect(missing.status).toBe(400)

    const notJson = await requestCode(json('/api/driver/cabinet/request-code', 'not json{'))
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toEqual({ error: 'invalid_json' })
    expect(db.tables.driver_login_codes).toHaveLength(0)
  })

  it('413 for an oversized body', async () => {
    const req = new Request('http://localhost/api/driver/cabinet/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '5000' },
      body: '{}',
    })
    expect((await requestCode(req)).status).toBe(413)
  })

  it('rate limit: per IP and per hashed email, both fail-closed; either denial -> 429 and no row', async () => {
    await reqCode(INVITED_EMAIL)
    expect(h.checkRateLimit).toHaveBeenCalledWith('/api/driver/cabinet/request-code', '203.0.113.7', { failClosed: true })
    expect(h.checkRateLimit).toHaveBeenCalledWith(
      '/api/driver/cabinet/request-code#email',
      sha256Hex(INVITED_EMAIL.toLowerCase()),
      { failClosed: true },
    )

    db.tables.driver_login_codes.length = 0
    h.sendCode.mockClear()
    h.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 5 })
    const ipDenied = await reqCode(INVITED_EMAIL)
    expect(ipDenied.status).toBe(429)
    expect(await ipDenied.json()).toEqual({ error: 'rate_limited' })

    h.checkRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 4, limit: 5 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 3 })
    const emailDenied = await reqCode(INVITED_EMAIL)
    expect(emailDenied.status).toBe(429)
    expect(db.tables.driver_login_codes).toHaveLength(0)
    expect(h.sendCode).not.toHaveBeenCalled()
  })

  it('a second request kills the first unconsumed code', async () => {
    await reqCode(INVITED_EMAIL)
    const first = lastCode()
    await reqCode(INVITED_EMAIL)
    const second = lastCode()
    expect(db.tables.driver_login_codes).toHaveLength(1)

    const old = await reqVerify(INVITED_EMAIL, first === second ? String((Number(first) + 1) % 1_000_000).padStart(6, '0') : first)
    expect(old.status).toBe(400)
    // the first code is gone: with the second code still pending, a wrong try is wrong_code, never ok
    expect((await old.json()).error).toMatch(/wrong_code|code_expired/)
    const good = await reqVerify(INVITED_EMAIL, second)
    expect(good.status).toBe(200)
  })

  it('the first code answers code_expired once a second one has replaced it and been used', async () => {
    await reqCode(INVITED_EMAIL)
    const first = lastCode()
    await reqCode(INVITED_EMAIL)
    const second = lastCode()
    expect((await reqVerify(INVITED_EMAIL, second)).status).toBe(200)
    if (first !== second) {
      const res = await reqVerify(INVITED_EMAIL, first)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'code_expired' })
    }
  })
})

describe('POST /api/driver/cabinet/verify', () => {
  it('wrong code -> 400 wrong_code and attempts 1; five wrong tries then the right code -> code_expired', async () => {
    await reqCode(INVITED_EMAIL)
    const code = lastCode()
    const wrong = code === '000000' ? '000001' : '000000'

    const first = await reqVerify(INVITED_EMAIL, wrong)
    expect(first.status).toBe(400)
    expect(await first.json()).toEqual({ error: 'wrong_code' })
    expect(db.tables.driver_login_codes[0].attempts).toBe(1)

    for (let i = 0; i < 4; i++) {
      expect((await (await reqVerify(INVITED_EMAIL, wrong)).json()).error).toBe('wrong_code')
    }
    expect(db.tables.driver_login_codes[0].attempts).toBe(5)

    const right = await reqVerify(INVITED_EMAIL, code)
    expect(right.status).toBe(400)
    expect(await right.json()).toEqual({ error: 'code_expired' })
    expect(db.tables.driver_sessions).toHaveLength(0)
  })

  it('the 6th try on the same code answers code_expired', async () => {
    await reqCode(INVITED_EMAIL)
    const code = lastCode()
    const wrong = code === '000000' ? '000001' : '000000'
    for (let i = 0; i < 5; i++) await reqVerify(INVITED_EMAIL, wrong)
    const sixth = await reqVerify(INVITED_EMAIL, wrong)
    expect(await sixth.json()).toEqual({ error: 'code_expired' })
  })

  it('an expired code -> code_expired', async () => {
    await reqCode(INVITED_EMAIL)
    const code = lastCode()
    db.tables.driver_login_codes[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const res = await reqVerify(INVITED_EMAIL, code)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'code_expired' })
  })

  it('the right code -> 200 + a hardened session cookie; the same code again -> code_expired', async () => {
    await reqCode(INVITED_EMAIL)
    const code = lastCode()
    const res = await reqVerify(` ${INVITED_EMAIL.toUpperCase()} `.trim(), code)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('cache-control')).toBe('no-store')

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(new RegExp(`${DRIVER_SESSION_COOKIE}=[A-Za-z0-9_-]{43}(;|$)`))
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\//)
    expect(setCookie).toMatch(/Max-Age=2592000/)

    const token = cookieValue(res)
    expect(db.tables.driver_sessions).toHaveLength(1)
    const session = db.tables.driver_sessions[0]
    expect(session.driver_id).toBe(DRIVER_ID)
    expect(session.token_hash).toBe(sha256Hex(token))
    expect(JSON.stringify(session)).not.toContain(token)
    const ahead = new Date(session.expires_at as string).getTime() - Date.now()
    expect(Math.abs(ahead - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(60 * 1000)

    const replay = await reqVerify(INVITED_EMAIL, code)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toEqual({ error: 'code_expired' })
  })

  it('a fresh token on every sign-in (no session fixation)', async () => {
    await reqCode(INVITED_EMAIL)
    const a = cookieValue(await reqVerify(INVITED_EMAIL, lastCode()))
    await reqCode(INVITED_EMAIL)
    const b = cookieValue(await reqVerify(INVITED_EMAIL, lastCode()))
    expect(a).not.toBe(b)
    expect(db.tables.driver_sessions).toHaveLength(2)
  })

  it('an unknown or disabled email can never verify, even with a well-formed code', async () => {
    for (const email of ['nobody@example.com', 'off@example.com']) {
      const res = await reqVerify(email, '123456')
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'code_expired' })
    }
    expect(db.tables.driver_sessions).toHaveLength(0)
  })

  it('invalid payloads -> 400 invalid_payload / invalid_json; rate limit fail-closed -> 429', async () => {
    const badCode = await verify(json('/api/driver/cabinet/verify', { email: INVITED_EMAIL, code: '12ab56' }))
    expect(badCode.status).toBe(400)
    expect(await badCode.json()).toEqual({ error: 'invalid_payload' })

    const badEmail = await verify(json('/api/driver/cabinet/verify', { email: 'x', code: '123456' }))
    expect(badEmail.status).toBe(400)

    const notJson = await verify(json('/api/driver/cabinet/verify', '{{'))
    expect(await notJson.json()).toEqual({ error: 'invalid_json' })

    expect(h.checkRateLimit).toHaveBeenCalledWith('/api/driver/cabinet/verify', '203.0.113.7', { failClosed: true })
    h.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 10 })
    const limited = await reqVerify(INVITED_EMAIL, '123456')
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
  })

  it('an rpc error is treated as a dead code, never as a sign-in', async () => {
    await reqCode(INVITED_EMAIL)
    const code = lastCode()
    db.failRpc.value = true
    const res = await reqVerify(INVITED_EMAIL, code)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'code_expired' })
    expect(db.tables.driver_sessions).toHaveLength(0)
  })
})

describe('getDriverSession', () => {
  async function signIn(): Promise<string> {
    await reqCode(INVITED_EMAIL)
    return cookieValue(await reqVerify(INVITED_EMAIL, lastCode()))
  }

  it('resolves the driver for the cookie issued at verify', async () => {
    const token = await signIn()
    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    const session = await getDriverSession()
    expect(session).toEqual({ driverId: DRIVER_ID, sessionId: db.tables.driver_sessions[0].id })
    const read = db.calls.filter((c) => c.table === 'driver_sessions' && c.op === 'select').pop()
    expect(read?.columns).toContain('drivers!inner(cabinet_enabled)')
  })

  it('null for: no cookie, wrong shape (no DB call), unknown token, expired row, disabled driver', async () => {
    expect(await getDriverSession()).toBeNull()

    const token = await signIn()
    const before = db.calls.length
    for (const bad of ['short', 'x'.repeat(44), 'has space ' + 'a'.repeat(33), '']) {
      h.cookieJar.set(DRIVER_SESSION_COOKIE, bad)
      expect(await getDriverSession()).toBeNull()
    }
    expect(db.calls.length).toBe(before)

    h.cookieJar.set(DRIVER_SESSION_COOKIE, 'A'.repeat(43))
    expect(await getDriverSession()).toBeNull()

    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    expect(await getDriverSession()).not.toBeNull()

    db.tables.driver_sessions[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await getDriverSession()).toBeNull()
    db.tables.driver_sessions[0].expires_at = new Date(Date.now() + 60_000).toISOString()
    expect(await getDriverSession()).not.toBeNull()

    db.tables.drivers.find((d) => d.id === DRIVER_ID)!.cabinet_enabled = false
    expect(await getDriverSession()).toBeNull()
  })
})

describe('source gates (D-07: no mixing with Supabase Auth)', () => {
  const files = [
    'lib/driver-cabinet/auth.ts',
    'app/api/driver/cabinet/request-code/route.ts',
    'app/api/driver/cabinet/verify/route.ts',
  ]

  it.each(files)('%s imports no Supabase-Auth cookie module and calls no auth API', (file) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')
    expect(src).not.toMatch(/@\/lib\/supabase\/(server|middleware|client)/)
    expect(src).not.toMatch(/@supabase\/ssr/)
    expect(src).not.toMatch(/signInWithOtp/)
    expect(src).not.toMatch(/auth\.admin/)
  })

  it('the driver cookie name differs from the sb-* auth cookies', () => {
    expect(DRIVER_SESSION_COOKIE).toBe('prestigo_driver_session')
    expect(DRIVER_SESSION_COOKIE.startsWith('sb-')).toBe(false)
  })

  it('the request-code route does not go through the email dedup log', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'app/api/driver/cabinet/request-code/route.ts'), 'utf8')
    expect(src).not.toMatch(/logEmail/)
  })
})
