/**
 * Regression lock for middleware.ts `config.matcher`: static files served
 * from /public or root metadata routes must never enter the middleware,
 * or next-intl rewrites them to /en/<file> and they 404 in production
 * (broke every .avif, then robots.txt / sitemap.xml / llms.txt).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn() }))

import { config } from '@/middleware'

// Next.js anchors matcher sources to the full pathname.
const matcher = new RegExp(`^${config.matcher[0]}$`)
const entersMiddleware = (pathname: string) => matcher.test(pathname)

describe('middleware matcher — static/SEO files bypass locale routing', () => {
  it.each([
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/llms-full.txt',
    '/BingSiteAuth.xml',
    '/a3f8e2d1c9b765432fedcba987654321.txt',
    '/favicon.ico',
    '/icon.svg',
    '/vehicles/s-class.avif',
    '/hero-about.png',
  ])('%s does not enter middleware', (pathname) => {
    expect(entersMiddleware(pathname)).toBe(false)
  })

  it.each(['/', '/about', '/ru', '/ru/routes/prague-vienna', '/book', '/admin', '/api/bookings'])(
    '%s still enters middleware',
    (pathname) => {
      expect(entersMiddleware(pathname)).toBe(true)
    }
  )
})
