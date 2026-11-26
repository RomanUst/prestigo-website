import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-04 (DCAB-03; D-06, D-18, T-94-19, T-94-20, T-94-22): the operator invites, enables and
// disables a driver's cabinet.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  adminError: null as null | '401' | '403',
  sendInvite: vi.fn(),
  cookieJar: new Map<string, string>(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () =>
    h.adminError ? { user: null, error: h.adminError } : { user: { id: 'admin-1' }, error: null },
  ),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => h.db.client,
}))

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendDriverCabinetInviteEmail: h.sendInvite }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { POST } from '@/app/api/admin/drivers/[id]/cabinet/route'
import { buildDriverCabinetInviteHtml } from '@/lib/email'
import { DRIVER_SESSION_COOKIE, createDriverSession, getDriverSession } from '@/lib/driver-cabinet/auth'

const DRIVER_ID = 'a0000002-0000-4000-8000-000000000002'
const OTHER_ID = 'a0000003-0000-4000-8000-000000000003'

let db: FakeDriverCabinetDb

function req(body: unknown, raw = false): Request {
  return new Request(`http://localhost/api/admin/drivers/${DRIVER_ID}/cabinet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

const ctx = (id: string = DRIVER_ID) => ({ params: Promise.resolve({ id }) })
const driverRow = () => db.tables.drivers.find((d) => d.id === DRIVER_ID)!

beforeEach(() => {
  db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER_ID, name: 'Ana', email: 'ana@example.com', cabinet_enabled: false, cabinet_invited_at: null },
      { id: OTHER_ID, name: 'Ben', email: 'ben@example.com', cabinet_enabled: true },
    ],
  })
  h.db = db
  h.adminError = null
  h.sendInvite.mockReset()
  h.sendInvite.mockResolvedValue(true)
  h.cookieJar.clear()
})

describe('guards run before any read or write', () => {
  it('401 without an admin session', async () => {
    h.adminError = '401'
    const res = await POST(req({ action: 'invite' }), ctx())
    expect(res.status).toBe(401)
    expect(db.calls).toHaveLength(0)
    expect(h.sendInvite).not.toHaveBeenCalled()
  })

  it('403 for a non-admin', async () => {
    h.adminError = '403'
    const res = await POST(req({ action: 'disable' }), ctx())
    expect(res.status).toBe(403)
    expect(db.calls).toHaveLength(0)
  })

  it('400 for a malformed id', async () => {
    const res = await POST(req({ action: 'invite' }), ctx('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(db.calls).toHaveLength(0)
  })

  it.each([
    ['missing action', {}],
    ['unknown action', { action: 'delete' }],
    ['non-string action', { action: 7 }],
  ])('400 for %s', async (_label, body) => {
    const res = await POST(req(body), ctx())
    expect(res.status).toBe(400)
    expect(db.calls).toHaveLength(0)
  })

  it('400 for an unparseable body', async () => {
    const res = await POST(req('{not json', true), ctx())
    expect(res.status).toBe(400)
    expect(db.calls).toHaveLength(0)
  })

  it('404 for an unknown driver, with no write', async () => {
    const res = await POST(req({ action: 'invite' }), ctx('a0000009-0000-4000-8000-000000000009'))
    expect(res.status).toBe(404)
    expect(db.calls.every((c) => c.op === 'select')).toBe(true)
    expect(h.sendInvite).not.toHaveBeenCalled()
  })
})

describe('invite', () => {
  it('turns the cabinet on, stamps the invite time and sends one email to the driver', async () => {
    const res = await POST(req({ action: 'invite' }), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.emailSent).toBe(true)
    expect(json.driver.id).toBe(DRIVER_ID)
    expect(json.driver.cabinet_enabled).toBe(true)
    expect(typeof json.driver.cabinet_invited_at).toBe('string')
    expect(driverRow().cabinet_enabled).toBe(true)
    expect(driverRow().cabinet_invited_at).toBe(json.driver.cabinet_invited_at)
    expect(h.sendInvite).toHaveBeenCalledTimes(1)
    expect(h.sendInvite).toHaveBeenCalledWith({ to: 'ana@example.com', driverName: 'Ana' })
    // the invite is an existing row: nothing is inserted
    expect(db.tables.drivers).toHaveLength(2)
    expect(db.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('a failing email gives 502 email_failed and the flag stays set so Resend invite can retry', async () => {
    h.sendInvite.mockResolvedValue(false)
    const res = await POST(req({ action: 'invite' }), ctx())
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('email_failed')
    expect(json.driver.cabinet_enabled).toBe(true)
    expect(driverRow().cabinet_enabled).toBe(true)
  })

  it('Resend invite re-stamps the invite time and sends again', async () => {
    db.tables.drivers[0].cabinet_enabled = true
    db.tables.drivers[0].cabinet_invited_at = '2026-01-01T00:00:00.000Z'
    const res = await POST(req({ action: 'invite' }), ctx())
    expect(res.status).toBe(200)
    expect(driverRow().cabinet_invited_at).not.toBe('2026-01-01T00:00:00.000Z')
    expect(h.sendInvite).toHaveBeenCalledTimes(1)
  })
})

describe('enable', () => {
  it('turns a disabled driver back on without an email and keeps the invite time', async () => {
    db.tables.drivers[0].cabinet_enabled = false
    db.tables.drivers[0].cabinet_invited_at = '2026-01-01T00:00:00.000Z'
    const res = await POST(req({ action: 'enable' }), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.driver).toEqual({
      id: DRIVER_ID,
      cabinet_enabled: true,
      cabinet_invited_at: '2026-01-01T00:00:00.000Z',
    })
    expect(driverRow().cabinet_enabled).toBe(true)
    expect(driverRow().cabinet_invited_at).toBe('2026-01-01T00:00:00.000Z')
    expect(h.sendInvite).not.toHaveBeenCalled()
  })

  it('stamps the invite time when the driver was never invited', async () => {
    const res = await POST(req({ action: 'enable' }), ctx())
    expect(res.status).toBe(200)
    expect(typeof driverRow().cabinet_invited_at).toBe('string')
    expect(h.sendInvite).not.toHaveBeenCalled()
  })
})

describe('disable (D-06, T-94-20)', () => {
  function seedDriverAndOther() {
    db.tables.drivers[0].cabinet_enabled = true
    db.tables.drivers[0].cabinet_invited_at = '2026-01-01T00:00:00.000Z'
    db.tables.driver_sessions.push(
      { driver_id: DRIVER_ID, token_hash: 'h1', expires_at: '2099-01-01T00:00:00.000Z' },
      { driver_id: OTHER_ID, token_hash: 'h2', expires_at: '2099-01-01T00:00:00.000Z' },
    )
    db.tables.driver_login_codes.push(
      { driver_id: DRIVER_ID, code_hash: 'c1', expires_at: '2099-01-01T00:00:00.000Z' },
      { driver_id: OTHER_ID, code_hash: 'c2', expires_at: '2099-01-01T00:00:00.000Z' },
    )
    db.tables.driver_push_subscriptions.push(
      { driver_id: DRIVER_ID, endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' },
      { driver_id: OTHER_ID, endpoint: 'https://push.example/2', p256dh: 'a', auth: 'b' },
    )
  }

  it('clears the flag and deletes only this driver sessions, codes and push subscriptions', async () => {
    seedDriverAndOther()
    const res = await POST(req({ action: 'disable' }), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.driver).toEqual({
      id: DRIVER_ID,
      cabinet_enabled: false,
      cabinet_invited_at: '2026-01-01T00:00:00.000Z',
    })
    expect(driverRow().cabinet_enabled).toBe(false)
    expect(db.tables.driver_sessions.map((r) => r.driver_id)).toEqual([OTHER_ID])
    expect(db.tables.driver_login_codes.map((r) => r.driver_id)).toEqual([OTHER_ID])
    expect(db.tables.driver_push_subscriptions.map((r) => r.driver_id)).toEqual([OTHER_ID])
    expect(h.sendInvite).not.toHaveBeenCalled()
  })

  it('the cookie that worked before the call is rejected afterwards', async () => {
    db.tables.drivers[0].cabinet_enabled = true
    const { token } = await createDriverSession(db.client as never, DRIVER_ID)
    h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
    expect(await getDriverSession()).toMatchObject({ driverId: DRIVER_ID })

    const res = await POST(req({ action: 'disable' }), ctx())
    expect(res.status).toBe(200)
    expect(await getDriverSession()).toBeNull()
  })

  it('a database failure while clearing sessions is surfaced, not hidden', async () => {
    seedDriverAndOther()
    db.failWritesOn.add('driver_sessions')
    const res = await POST(req({ action: 'disable' }), ctx())
    expect(res.status).toBe(500)
  })

  it('never touches assignments or bookings (D-18)', async () => {
    seedDriverAndOther()
    await POST(req({ action: 'disable' }), ctx())
    expect(db.calls.some((c) => c.table === 'driver_assignments' || c.table === 'bookings')).toBe(false)
  })
})

describe('buildDriverCabinetInviteHtml', () => {
  const html = buildDriverCabinetInviteHtml({
    driverName: '<script>alert(1)</script>Ana',
    loginUrl: 'https://rideprestigo.com/driver/login',
  })

  it('escapes the driver name', () => {
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('has exactly one link, to the sign-in page', () => {
    const hrefs = html.match(/href="[^"]*"/g) ?? []
    expect(hrefs).toEqual(['href="https://rideprestigo.com/driver/login"'])
  })

  it('carries the UI-SPEC copy and the Home Screen tip', () => {
    expect(html).toContain('Your driver cabinet is ready')
    expect(html).toContain('Sign in with this email address: we send you a 6-digit code, no password needed.')
    expect(html).toContain('Open the cabinet')
    expect(html).toContain('Tip: add the page to your Home Screen to get notifications.')
    expect(html).toContain('tap Share, then Add to Home Screen.')
  })

  it('shows no price or euro sign', () => {
    expect(html).not.toMatch(/€|&euro;|EUR|CZK/)
  })
})
