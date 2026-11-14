// @vitest-environment node
/**
 * Phase 89 review WR-02: a CSP violation report on a /manage/ or /driver/trip/ page carries the bearer link in
 * document-uri / referrer. /api/csp-report must not write that secret to the logs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/csp-report/route'
import { redactCspReport, redactSecretPaths } from '@/lib/csp-report-redact'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const DRIVER_TOKEN = 'zYxWvUtSrQpOnMlKjIhGfEdCbA9876543210-_edcba'

afterEach(() => vi.restoreAllMocks())

function post(body: unknown) {
  return POST(
    new Request('https://rideprestigo.com/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify(body),
    }),
  )
}

describe('redactSecretPaths', () => {
  it('replaces the token of a manage path, plain and locale-prefixed, and keeps the rest of the URL', () => {
    expect(redactSecretPaths(`https://rideprestigo.com/manage/${TOKEN}`)).toBe('https://rideprestigo.com/manage/[redacted]')
    expect(redactSecretPaths(`https://rideprestigo.com/fr/manage/${TOKEN}?x=1#y`)).toBe(
      'https://rideprestigo.com/fr/manage/[redacted]?x=1#y',
    )
  })

  it('replaces the token of a driver trip path', () => {
    expect(redactSecretPaths(`https://rideprestigo.com/driver/trip/${DRIVER_TOKEN}`)).toBe(
      'https://rideprestigo.com/driver/trip/[redacted]',
    )
  })

  it('replaces the token of a quote path, plain and locale-prefixed (zh-hant too)', () => {
    const q = 'Q'.repeat(43)
    expect(redactSecretPaths(`https://rideprestigo.com/quote/${q}`)).toBe('https://rideprestigo.com/quote/[redacted]')
    expect(redactSecretPaths(`https://rideprestigo.com/ar/quote/${q}?x=1`)).toBe(
      'https://rideprestigo.com/ar/quote/[redacted]?x=1',
    )
    expect(redactSecretPaths(`https://rideprestigo.com/zh-hant/quote/${q}`)).toBe(
      'https://rideprestigo.com/zh-hant/quote/[redacted]',
    )
    expect(redactSecretPaths(`https://rideprestigo.com/manage/${TOKEN}`)).toBe('https://rideprestigo.com/manage/[redacted]')
  })

  it('leaves other URLs alone', () => {
    const url = 'https://rideprestigo.com/routes/prague-vienna'
    expect(redactSecretPaths(url)).toBe(url)
  })
})

describe('redactCspReport', () => {
  it('cleans nested strings in the Reporting API shape too', () => {
    const out = redactCspReport([{ type: 'csp-violation', body: { documentURL: `https://x.test/manage/${TOKEN}`, blockedURL: 'inline' } }])
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(JSON.stringify(out)).toContain('/manage/[redacted]')
  })
})

describe('POST /api/csp-report', () => {
  it('logs the violation without the manage or driver token and answers 204', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await post({
      'csp-report': {
        'document-uri': `https://rideprestigo.com/manage/${TOKEN}`,
        referrer: `https://rideprestigo.com/driver/trip/${DRIVER_TOKEN}`,
        'blocked-uri': 'inline',
        'violated-directive': 'script-src-elem',
      },
    })
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain(DRIVER_TOKEN)
    expect(logged).toContain('script-src-elem')
    expect(logged).toContain('/manage/[redacted]')
    expect(logged).toContain('/driver/trip/[redacted]')
  })

  it('ignores a malformed body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await POST(new Request('https://rideprestigo.com/api/csp-report', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(204)
    expect(warn).not.toHaveBeenCalled()
  })
})
