/**
 * admin-login-next.test.ts (Phase 80 review IN-03)
 *
 * The CRM "Admin link" opens /admin/bookings?search=PRG-... . An operator who
 * is not signed in must land there after login. The destination travels as a
 * `next` query parameter, so it is attacker-controllable and must be
 * restricted to same-origin /admin paths (open-redirect guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockSignInWithPassword, mockRedirect, mockCheckRateLimit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockRedirect: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return { ...actual, redirect: mockRedirect }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithPassword: mockSignInWithPassword } }),
}))

import { safeAdminNext } from '@/lib/admin-next'
import { updateSession } from '@/lib/supabase/middleware'
import { signIn } from '@/app/(internal)/admin/login/actions'

describe('safeAdminNext', () => {
  it.each([
    '/admin',
    '/admin/bookings',
    '/admin/bookings?search=PRG-20260928-ABC123',
    '/admin/bookings?search=PRG-1&tab=all',
    '/admin/drivers#top',
    '/admin?x=1',
  ])('accepts %s', (raw) => {
    expect(safeAdminNext(raw)).toBe(raw)
  })

  it.each([
    ['absolute URL', 'https://evil.example/admin'],
    ['scheme without slashes', 'javascript:alert(1)'],
    ['protocol-relative', '//evil.example/admin'],
    ['protocol-relative after admin', '/admin//evil.example'],
    ['double slash in query', '/admin/bookings?u=http://evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['backslash inside admin path', '/admin\\evil.example'],
    ['admin-looking prefix', '/administrator'],
    ['admin-looking prefix 2', '/admin-evil/x'],
    ['outside admin', '/account'],
    ['site root', '/'],
    ['dot-dot escape', '/admin/../account'],
    ['dot-dot at end', '/admin/..'],
    ['relative path', 'admin/bookings'],
    ['the login page itself', '/admin/login'],
    ['login page with query', '/admin/login?next=/admin'],
    ['space', '/admin/book ings'],
    ['newline', '/admin/bookings\nSet-Cookie: x=1'],
    ['carriage return', '/admin/bookings\r'],
    ['tab', '/admin/\tbookings'],
    ['NUL byte', '/admin/\u0000'],
    ['empty', ''],
    ['too long', `/admin/${'a'.repeat(600)}`],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['array', ['/admin']],
  ])('rejects %s', (_label, raw) => {
    expect(safeAdminNext(raw)).toBeNull()
  })
})

describe('middleware: unauthenticated /admin/* keeps the destination', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
  })

  it('redirects /admin/bookings?search=... to /admin/login?next=<encoded path>', async () => {
    const response = await updateSession(
      new NextRequest('https://rideprestigo.com/admin/bookings?search=PRG-20260928-ABC123'),
    )
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/admin/login')
    expect(location.searchParams.get('next')).toBe('/admin/bookings?search=PRG-20260928-ABC123')
  })

  it('plain /admin redirects to a clean /admin/login (no next)', async () => {
    const response = await updateSession(new NextRequest('https://rideprestigo.com/admin'))
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/admin/login')
    expect(location.search).toBe('')
  })

  it('drops a destination that fails the whitelist but still redirects to login', async () => {
    const response = await updateSession(
      new NextRequest('https://rideprestigo.com/admin/bookings?u=http://evil.example'),
    )
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/admin/login')
    expect(location.searchParams.has('next')).toBe(false)
  })
})

describe('signIn action: redirect target', () => {
  function form(fields: Record<string, string>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  beforeEach(() => {
    mockRedirect.mockReset()
    mockSignInWithPassword.mockReset()
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockResolvedValue({ allowed: true })
    mockSignInWithPassword.mockResolvedValue({ error: null })
  })

  it('follows a safe admin next path', async () => {
    await signIn(null, form({ email: 'a@b.cz', password: 'x', next: '/admin/bookings?search=PRG-1' }))
    expect(mockRedirect).toHaveBeenCalledWith('/admin/bookings?search=PRG-1')
  })

  it.each([
    ['absolute URL', 'https://evil.example'],
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['non-admin path', '/account'],
    ['empty', ''],
  ])('falls back to /admin for %s', async (_label, next) => {
    await signIn(null, form({ email: 'a@b.cz', password: 'x', next }))
    expect(mockRedirect).toHaveBeenCalledWith('/admin')
  })

  it('falls back to /admin when next is absent', async () => {
    await signIn(null, form({ email: 'a@b.cz', password: 'x' }))
    expect(mockRedirect).toHaveBeenCalledWith('/admin')
  })

  it('does not redirect anywhere on a failed sign-in, whatever next says', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: new Error('bad') })
    const result = await signIn(null, form({ email: 'a@b.cz', password: 'x', next: '/admin/bookings' }))
    expect(result).toEqual({ error: 'Invalid email or password.' })
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
