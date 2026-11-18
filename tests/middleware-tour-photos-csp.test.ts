// @vitest-environment node
/**
 * Phase 93 plan 93-08 (D-15; T-93-24): the Supabase project origin is allowed in img-src of the public, static and
 * admin CSPs (tour photos live in the public tour-photos bucket) and in next/image remotePatterns. The host is derived
 * from NEXT_PUBLIC_SUPABASE_URL; nothing is added when the env is absent, and only img-src grows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockCreateServerClient = vi.fn(() => ({ auth: { getUser: mockGetUser } }))
  const mockHandleI18nRouting = vi.fn()
  const mockCreateMiddleware = vi.fn(() => mockHandleI18nRouting)
  return { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware }
})

vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))
vi.mock('next-intl/middleware', () => ({ default: mockCreateMiddleware }))

import { middleware } from '@/middleware'

const SUPABASE_ORIGIN = 'https://abc.supabase.co'
const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://prestigo.cz${pathname}`)
}

function intlRewrite(): NextResponse {
  const res = NextResponse.next()
  res.headers.set('x-middleware-rewrite', 'https://prestigo.cz/en/marker')
  return res
}

async function cspOf(pathname: string): Promise<string> {
  const response = await middleware(makeRequest(pathname))
  return response.headers.get('Content-Security-Policy')!
}

function directive(csp: string, name: string): string {
  return csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''
}

/** The directives other than img-src, in order: they must not change when the env changes. */
function withoutImgSrc(csp: string): string[] {
  return csp.split('; ').filter((d) => !d.startsWith('img-src '))
}

const NONCE_RE = /'nonce-[^']+'/g

beforeEach(() => {
  vi.clearAllMocks()
  mockHandleI18nRouting.mockReturnValue(intlRewrite())
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-user-id', app_metadata: { is_admin: true }, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } },
    error: null,
  })
})

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV
  vi.resetModules()
})

describe('CSP img-src carries the Supabase project origin (tour photos)', () => {
  it.each([
    ['public static CSP (GET /)', '/'],
    ['static CSP of a dynamic public path (/ru/book)', '/ru/book'],
    ['tour page path', '/tours/karlstejn-day-trip'],
    ['admin nonce CSP (/admin)', '/admin'],
    ['driver nonce CSP (/driver/trip/help)', '/driver/trip/help'],
  ])('%s has the origin in img-src', async (_label, path) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${SUPABASE_ORIGIN}`
    const img = directive(await cspOf(path), 'img-src')
    expect(img.split(' ')).toContain(SUPABASE_ORIGIN)
    expect(img.endsWith(SUPABASE_ORIGIN)).toBe(true)
  })

  it('the origin is the bare https origin: a path, a trailing slash or a port in the env value is dropped', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co/rest/v1/'
    expect(directive(await cspOf('/'), 'img-src').split(' ')).toContain(SUPABASE_ORIGIN)
  })

  it('only img-src grows: every other directive is identical with and without the env (nonces normalised)', async () => {
    for (const path of ['/', '/admin', '/driver/trip/help']) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      const before = withoutImgSrc((await cspOf(path)).replace(NONCE_RE, "'nonce-X'"))
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN
      const after = withoutImgSrc((await cspOf(path)).replace(NONCE_RE, "'nonce-X'"))
      expect(after, path).toEqual(before)
    }
  })

  it('removing the origin restores the previous img-src exactly', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const plain = directive(await cspOf('/'), 'img-src')
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN
    const grown = directive(await cspOf('/'), 'img-src')
    expect(grown).toBe(`${plain} ${SUPABASE_ORIGIN}`)
  })

  it('nothing is added and nothing throws without the env, with a non-URL value, or with a non-https URL', async () => {
    for (const value of [undefined, '', 'not a url', 'http://localhost:54321', 'ftp://abc.supabase.co']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = value
      for (const path of ['/', '/admin']) {
        const csp = await cspOf(path)
        expect(csp, `${String(value)} ${path}`).toBeTruthy()
        expect(directive(csp, 'img-src')).not.toMatch(/localhost|abc\.supabase|ftp:/)
      }
    }
  })

  it('no wildcard is added to img-src (the exact project origin only)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN
    for (const path of ['/', '/admin']) {
      const img = directive(await cspOf(path), 'img-src')
      expect(img).not.toContain('https://*.supabase.co')
      expect(img).not.toMatch(/\*\.supabase/)
    }
  })

  it('the Chatwoot /embed policy is unchanged', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN
    expect(directive(await cspOf('/embed/chatwoot-dashboard'), 'img-src')).toBe("img-src 'self' data:")
  })
})

describe('next.config images.remotePatterns', () => {
  async function patterns(): Promise<Array<{ protocol?: string; hostname: string; pathname?: string }>> {
    vi.resetModules()
    const mod = await import('../next.config')
    return (mod.default as { images: { remotePatterns: Array<{ protocol?: string; hostname: string; pathname?: string }> } }).images.remotePatterns
  }

  it('contains the project host for the tour-photos bucket when the env is set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN
    const list = await patterns()
    expect(list).toContainEqual({
      protocol: 'https',
      hostname: 'abc.supabase.co',
      pathname: '/storage/v1/object/public/tour-photos/**',
    })
    expect(list.some((p) => p.hostname === 'images.unsplash.com')).toBe(true)
  })

  it('adds nothing for a missing, invalid or non-https env, and does not throw', async () => {
    for (const value of [undefined, 'not a url', 'http://localhost:54321']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = value
      const list = await patterns()
      expect(list.some((p) => p.pathname?.includes('tour-photos')), String(value)).toBe(false)
      expect(list.some((p) => p.hostname === 'images.unsplash.com')).toBe(true)
    }
  })
})

describe('middleware matcher is untouched', () => {
  it('still excludes the static / metadata extensions and adds no new one', () => {
    const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    const matcher = /matcher:\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? ''
    for (const ext of ['avif', 'ico', 'txt', 'xml']) expect(matcher).toContain(ext)
  })
})
