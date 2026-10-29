/**
 * middleware-embed.test.ts — Phase 84 Plan 05 (PANEL-02)
 *
 * Locks the framing boundary for the Chatwoot Dashboard App:
 *  - /embed and /embed/* get a dedicated nonce CSP whose frame-ancestors names
 *    only Prestigo's Chatwoot origin, never run next-intl or updateSession, and
 *    reach the renderer WITHOUT the cookie request header (the iframe is
 *    same-site with /admin, so the browser would otherwise send its cookies).
 *  - The panel API path is cookie-less, skips updateSession and keeps the
 *    CSRF Origin check (non-strict).
 *
 * Mocks follow tests/middleware-i18n.test.ts (copied, not imported).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware } =
  vi.hoisted(() => {
    const mockGetUser = vi.fn()
    const mockCreateServerClient = vi.fn(() => ({
      auth: { getUser: mockGetUser },
    }))
    const mockHandleI18nRouting = vi.fn()
    const mockCreateMiddleware = vi.fn(() => mockHandleI18nRouting)
    return { mockGetUser, mockCreateServerClient, mockHandleI18nRouting, mockCreateMiddleware }
  })

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next-intl/middleware', () => ({
  default: mockCreateMiddleware,
}))

import { middleware } from '@/middleware'

const SITE_ORIGIN = 'https://prestigo.cz'

function makeRequest(
  pathname: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`${SITE_ORIGIN}${pathname}`, {
    method: init.method ?? 'GET',
    headers: init.headers,
  })
}

function makeIntlRewriteResponse(): NextResponse {
  const res = NextResponse.next()
  res.headers.set('x-middleware-rewrite', `${SITE_ORIGIN}/en/marker`)
  return res
}

const COOKIE = 'sb-access-token=x; NEXT_LOCALE=ru'

/** Names of request headers Next forwards (x-middleware-override-headers). */
function forwardedHeaderNames(res: Response): string[] {
  const list = res.headers.get('x-middleware-override-headers')
  return list ? list.split(',').map((s) => s.trim().toLowerCase()) : []
}

function forwardedHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name.toLowerCase()}`)
}

function normalizeNonce(csp: string): string {
  return csp.replace(/'nonce-[^']+'/, "'nonce-<n>'")
}

const EMBED_CSP_PROD = [
  "default-src 'none'",
  "script-src 'nonce-<n>' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  'frame-ancestors https://chat.rideprestigo.com',
  'report-uri /api/csp-report',
].join('; ')

describe('middleware.ts — /embed branch (PANEL-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockHandleI18nRouting.mockReturnValue(makeIntlRewriteResponse())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('GET /embed/chatwoot-dashboard carries exactly the production embed CSP (nonce normalized)', async () => {
    const res = await middleware(
      makeRequest('/embed/chatwoot-dashboard', { headers: { cookie: COOKIE } }),
    )
    const csp = res.headers.get('Content-Security-Policy')!
    expect(csp).toBeTruthy()
    expect(normalizeNonce(csp)).toBe(EMBED_CSP_PROD)
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('development form adds unsafe-eval and self to script-src only', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const res = await middleware(makeRequest('/embed/chatwoot-dashboard'))
    const csp = res.headers.get('Content-Security-Policy')!
    expect(normalizeNonce(csp)).toBe(
      EMBED_CSP_PROD.replace(
        "script-src 'nonce-<n>' 'strict-dynamic'",
        "script-src 'nonce-<n>' 'strict-dynamic' 'unsafe-eval' 'self'",
      ),
    )
  })

  it('each request gets a fresh nonce', async () => {
    const a = await middleware(makeRequest('/embed/chatwoot-dashboard'))
    const b = await middleware(makeRequest('/embed/chatwoot-dashboard'))
    const na = /'nonce-([^']+)'/.exec(a.headers.get('Content-Security-Policy')!)![1]
    const nb = /'nonce-([^']+)'/.exec(b.headers.get('Content-Security-Policy')!)![1]
    expect(na).not.toBe(nb)
  })

  it('forwards the same CSP and x-nonce to the renderer and no cookie header', async () => {
    const res = await middleware(
      makeRequest('/embed/chatwoot-dashboard', { headers: { cookie: COOKIE } }),
    )
    const csp = res.headers.get('Content-Security-Policy')!
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]
    const names = forwardedHeaderNames(res)
    expect(names).toContain('content-security-policy')
    expect(names).toContain('x-nonce')
    expect(names).not.toContain('cookie')
    expect(forwardedHeader(res, 'content-security-policy')).toBe(csp)
    expect(forwardedHeader(res, 'x-nonce')).toBe(nonce)
    expect(forwardedHeader(res, 'cookie')).toBeNull()
  })

  it('never calls next-intl or updateSession, sets no cookie, no rewrite', async () => {
    const res = await middleware(
      makeRequest('/embed/chatwoot-dashboard', { headers: { cookie: COOKIE } }),
    )
    expect(mockHandleI18nRouting).not.toHaveBeenCalled()
    expect(mockCreateServerClient).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('response is no-store and no-referrer', async () => {
    const res = await middleware(makeRequest('/embed/chatwoot-dashboard'))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('bare /embed gets the same treatment', async () => {
    const res = await middleware(makeRequest('/embed', { headers: { cookie: COOKIE } }))
    expect(normalizeNonce(res.headers.get('Content-Security-Policy')!)).toBe(EMBED_CSP_PROD)
    expect(forwardedHeaderNames(res)).not.toContain('cookie')
    expect(mockHandleI18nRouting).not.toHaveBeenCalled()
  })

  it('/embedded-page and /ru/embed/chatwoot-dashboard do NOT take the embed branch', async () => {
    const a = await middleware(makeRequest('/embedded-page'))
    const b = await middleware(makeRequest('/ru/embed/chatwoot-dashboard'))
    expect(mockHandleI18nRouting).toHaveBeenCalledTimes(2)
    expect(a.headers.get('Content-Security-Policy')).not.toContain('frame-ancestors')
    expect(b.headers.get('Content-Security-Policy')).not.toContain('frame-ancestors')
  })

  it('frame-ancestors host equals the single chat host of the public CSP (WR-02) and is not a wildcard', async () => {
    const pub = await middleware(makeRequest('/'))
    const pubCsp = pub.headers.get('Content-Security-Policy')!
    const pubHosts = new Set(
      [...pubCsp.matchAll(/(?:https|wss):\/\/(chat\.[a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()),
    )
    expect([...pubHosts]).toHaveLength(1)

    const emb = await middleware(makeRequest('/embed/chatwoot-dashboard'))
    const csp = emb.headers.get('Content-Security-Policy')!
    const fa = /frame-ancestors ([^;]*)/.exec(csp)![1].trim()
    expect(fa).toBe(`https://${[...pubHosts][0]}`)
    expect(fa).not.toContain('*')
  })

  it('does not alter the public CSP for other paths', async () => {
    const res = await middleware(makeRequest('/'))
    const csp = res.headers.get('Content-Security-Policy')!
    expect(csp).not.toContain('frame-ancestors')
    expect(csp).not.toMatch(/nonce-/)
  })
})

describe('middleware.ts — Dashboard App panel API (PANEL-02)', () => {
  const PANEL_API = '/api/chatwoot/dashboard-app'

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockHandleI18nRouting.mockReturnValue(makeIntlRewriteResponse())
  })

  it('POST with the site Origin passes CSRF, is forwarded without cookie, skips updateSession, sets no cookie', async () => {
    const res = await middleware(
      makeRequest(PANEL_API, {
        method: 'POST',
        headers: { origin: SITE_ORIGIN, cookie: 'sb-access-token=x' },
      }),
    )
    expect(res.status).toBe(200)
    expect(forwardedHeaderNames(res)).not.toContain('cookie')
    expect(forwardedHeader(res, 'cookie')).toBeNull()
    expect(mockCreateServerClient).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(mockHandleI18nRouting).not.toHaveBeenCalled()
  })

  it('carries the standard static CSP (no nonce, no frame-ancestors) and no-store', async () => {
    const res = await middleware(makeRequest(PANEL_API, { method: 'POST', headers: { origin: SITE_ORIGIN } }))
    const csp = res.headers.get('Content-Security-Policy')!
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toMatch(/nonce-/)
    expect(csp).not.toContain('frame-ancestors')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('POST with a foreign Origin is rejected 403 by the CSRF check', async () => {
    const res = await middleware(
      makeRequest(PANEL_API, { method: 'POST', headers: { origin: 'https://evil.example' } }),
    )
    expect(res.status).toBe(403)
  })

  it('POST with no Origin passes (non-strict, token-authenticated)', async () => {
    const res = await middleware(makeRequest(PANEL_API, { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(forwardedHeaderNames(res)).not.toContain('cookie')
  })

  it('GET (non-mutation) is also cookie-less', async () => {
    const res = await middleware(makeRequest(PANEL_API, { headers: { cookie: 'sb-access-token=x' } }))
    expect(forwardedHeaderNames(res)).not.toContain('cookie')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('other /api paths keep their behaviour: updateSession still runs and cookies are forwarded', async () => {
    const res = await middleware(makeRequest('/api/health', { headers: { cookie: 'sb-access-token=x' } }))
    expect(mockCreateServerClient).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('/api/admin paths still require Origin (strict) and are not affected', async () => {
    const res = await middleware(makeRequest('/api/admin/x', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('a longer sibling path is not treated as the panel API', async () => {
    await middleware(makeRequest('/api/chatwoot/dashboard-app-other', { headers: { cookie: 'sb-access-token=x' } }))
    expect(mockCreateServerClient).toHaveBeenCalled()
  })
})

describe('public/robots.txt — /embed is hidden from crawlers (T-84-25)', () => {
  it('Disallow: /embed/ appears in both groups, as often as Disallow: /admin/', () => {
    const txt = readFileSync(join(process.cwd(), 'public/robots.txt'), 'utf8')
    const count = (needle: string) => txt.split('\n').filter((l) => l.trim() === needle).length
    expect(count('Disallow: /admin/')).toBe(2)
    expect(count('Disallow: /embed/')).toBe(count('Disallow: /admin/'))
  })
})
