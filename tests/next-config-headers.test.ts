// @vitest-environment node
/**
 * next-config-headers.test.ts — Phase 84 Plan 05 (PANEL-02)
 *
 * The Dashboard App page (/embed) must be frameable by Prestigo's Chatwoot
 * only, through CSP frame-ancestors set in middleware. X-Frame-Options: DENY
 * from next.config.ts would block that framing, so the global header entry is
 * restricted to every path EXCEPT /embed and /embed/*, and /embed gets its own
 * entry with every other security header and no X-Frame-Options.
 *
 * Sources are compiled with the same path-to-regexp Next uses for headers().
 * The live `curl -sI` in plan 84-09 is the behavioural proof against the real
 * deployment.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => RegExp
}

import nextConfig from '../next.config'

interface HeaderEntry {
  source: string
  headers: { key: string; value: string }[]
}

async function loadEntries(): Promise<HeaderEntry[]> {
  const fn = (nextConfig as { headers?: () => Promise<HeaderEntry[]> }).headers
  expect(typeof fn).toBe('function')
  return fn!()
}

function matching(entries: HeaderEntry[], pathname: string): HeaderEntry[] {
  return entries.filter((e) => pathToRegexp(e.source).test(pathname))
}

function headerOf(entries: HeaderEntry[], key: string): string | undefined {
  const values = entries.flatMap((e) =>
    e.headers.filter((h) => h.key.toLowerCase() === key.toLowerCase()).map((h) => h.value),
  )
  return values.length ? values[values.length - 1] : undefined
}

describe('next.config.ts headers() — X-Frame-Options excluded for /embed', () => {
  it.each(['/embed', '/embed/chatwoot-dashboard', '/embed/a/b'])(
    '%s: no matching entry sets X-Frame-Options',
    async (pathname) => {
      const hit = matching(await loadEntries(), pathname)
      expect(hit.length).toBeGreaterThan(0)
      expect(headerOf(hit, 'X-Frame-Options')).toBeUndefined()
    },
  )

  it.each(['/', '/admin', '/embeddings', '/embedded-page', '/ru/fleet', '/ru/embed/chatwoot-dashboard', '/book'])(
    '%s: the DENY entry matches',
    async (pathname) => {
      const hit = matching(await loadEntries(), pathname)
      expect(headerOf(hit, 'X-Frame-Options')).toBe('DENY')
    },
  )

  it('keeps the other security headers on /embed with Referrer-Policy no-referrer', async () => {
    const entries = await loadEntries()
    const hit = matching(entries, '/embed/chatwoot-dashboard')
    const global = matching(entries, '/')
    expect(headerOf(hit, 'X-Content-Type-Options')).toBe('nosniff')
    expect(headerOf(hit, 'X-XSS-Protection')).toBe('0')
    expect(headerOf(hit, 'Referrer-Policy')).toBe('no-referrer')
    expect(headerOf(hit, 'Permissions-Policy')).toBe(headerOf(global, 'Permissions-Policy'))
    expect(headerOf(hit, 'Strict-Transport-Security')).toBe(
      headerOf(global, 'Strict-Transport-Security'),
    )
    expect(headerOf(hit, 'Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
  })

  it('the global entry keeps its previous values for ordinary pages', async () => {
    const hit = matching(await loadEntries(), '/ru/fleet')
    expect(headerOf(hit, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerOf(hit, 'X-Content-Type-Options')).toBe('nosniff')
  })
})
