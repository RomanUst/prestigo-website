/**
 * middleware-csrf-forms.test.ts — Phase 81 review WR-04
 *
 * The public lead forms (contact, corporate, multi-day quote) now feed a permanent
 * inquiries store and the CRM, so all three sit behind the Origin check: a
 * cross-site POST is refused, a same-origin POST (what the site's own fetch sends)
 * and a POST with no Origin (non-browser caller) pass through to the route.
 */

import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  })),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))
vi.mock('next-intl/middleware', () => ({ default: vi.fn(() => vi.fn()) }))

import { middleware } from '@/middleware'

function post(pathname: string, origin: string | null): NextRequest {
  const headers: Record<string, string> = { host: 'prestigo.cz', 'content-type': 'application/json' }
  if (origin) headers.origin = origin
  return new NextRequest(`https://prestigo.cz${pathname}`, { method: 'POST', headers, body: '{}' })
}

const FORM_ROUTES = ['/api/contact', '/api/corporate-contact', '/api/submit-multiday-quote']

describe('CSRF Origin check on the lead form endpoints (WR-04)', () => {
  it.each(FORM_ROUTES)('%s: a cross-site Origin is refused with 403', async (path) => {
    const res = await middleware(post(path, 'https://evil.example'))
    expect(res.status).toBe(403)
  })

  it.each(FORM_ROUTES)('%s: the site origin passes', async (path) => {
    const res = await middleware(post(path, 'https://prestigo.cz'))
    expect(res.status).not.toBe(403)
  })

  it.each(FORM_ROUTES)('%s: a missing Origin still passes (non-strict path)', async (path) => {
    const res = await middleware(post(path, null))
    expect(res.status).not.toBe(403)
  })
})
