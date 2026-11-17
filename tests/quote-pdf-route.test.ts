// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 92 plan 92-27 Task 1 (QUOTE-07; D-14; T-92-83, T-92-84): POST /api/quote/pdf. The route runs for real; the
 * resolver and getOrRenderQuotePdf are doubles (their own behaviour is covered by tests/quote-resolve.test.ts and
 * tests/quote-pdf.test.ts). Asserted here: the guard order of the other /api/quote routes, the one 404 for every dead
 * link, the download headers, no-store on every answer, the 503 fallback and that no token reaches a body or a log line.
 */

const { resolveMock, pdfMock, rate } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  pdfMock: vi.fn(),
  rate: { allowed: true, calls: [] as Array<[string, string]> },
}))

vi.mock('@/lib/quotes/resolve', () => ({ resolveQuoteToken: resolveMock }))
vi.mock('@/lib/quotes/documents', () => ({ getOrRenderQuotePdf: pdfMock }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (path: string, ip: string) => {
    rate.calls.push([path, ip])
    return { allowed: rate.allowed, remaining: 1, limit: 10 }
  }),
  getClientIp: () => '203.0.113.9',
}))

import { POST, maxDuration } from '@/app/api/quote/pdf/route'

const TOKEN = 'A'.repeat(43)
const VERSION_ID = '00000000-0000-4000-8000-0000000b0001'
const PDF = Buffer.from('%PDF-1.7\n% the stored quote document\n%%EOF\n', 'latin1')

function resolved(over: { state?: 'offer' | 'paid'; versionNo?: number; reference?: string } = {}) {
  return {
    quote: { id: '00000000-0000-4000-8000-0000000a0001', reference: over.reference ?? 'Q-20261114-ABC123', status: 'sent' },
    version: { id: VERSION_ID, version_no: over.versionNo ?? 1 },
    lines: [],
    linkId: 'link',
    state: over.state ?? 'offer',
    bookings: [],
  }
}

function req(body: unknown, raw?: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/quote/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rate.allowed = true
  rate.calls = []
  resolveMock.mockResolvedValue(resolved())
  pdfMock.mockResolvedValue(PDF)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quote/pdf (tracer)', () => {
  it('a live offer answers the stored PDF of its version as an attachment, never cached', async () => {
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Prestigo-quote-Q-20261114-ABC123-v1.pdf"')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)
    expect(resolveMock).toHaveBeenCalledWith(TOKEN)
    expect(pdfMock).toHaveBeenCalledWith(VERSION_ID)
    expect(rate.calls).toEqual([['/api/quote/pdf', '203.0.113.9']])
  })

  it('a paid quote downloads too, with its version number in the file name', async () => {
    resolveMock.mockResolvedValue(resolved({ state: 'paid', versionNo: 3 }))
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Prestigo-quote-Q-20261114-ABC123-v3.pdf"')
  })

  it('the file name keeps only safe characters of the reference (no header injection)', async () => {
    resolveMock.mockResolvedValue(resolved({ reference: 'Q-1"\r\nX-Evil: 1' }))
    const res = await POST(req({ token: TOKEN }))
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Prestigo-quote-Q-1X-Evil1-v1.pdf"')
  })

  it('D-14: no PDF (no engine, render failure, database error) is 503 pdf_unavailable', async () => {
    pdfMock.mockResolvedValue(null)
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'pdf_unavailable' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('an empty buffer is the same 503', async () => {
    pdfMock.mockResolvedValue(Buffer.alloc(0))
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(503)
  })

  it('a resolver that throws is 503, never a stack trace', async () => {
    resolveMock.mockRejectedValue(new Error('db down: secret detail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })
})

describe('POST /api/quote/pdf: guard order (as /api/quote/view)', () => {
  it('a body over 2_000 bytes is 413 before the rate limit, with no-store', async () => {
    const res = await POST(req({ token: TOKEN }, undefined, { 'content-length': '2001' }))
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rate.calls).toEqual([])
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('a denied rate limit is 429 before the body is read or the link resolved', async () => {
    rate.allowed = false
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(resolveMock).not.toHaveBeenCalled()
    expect(pdfMock).not.toHaveBeenCalled()
  })

  it('invalid JSON is 400', async () => {
    const res = await POST(req(null, '{nope'))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('a wrong shape is 400 and never reaches the resolver: bad token, extra key, missing token', async () => {
    for (const body of [{ token: 'short' }, { token: 42 }, { token: TOKEN, versionId: VERSION_ID }, {}, [], null]) {
      const res = await POST(req(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('every dead link (unknown, revoked, superseded, cancelled, expired) is the one 404 invalid_link and renders nothing', async () => {
    resolveMock.mockResolvedValue(null)
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'invalid_link' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(pdfMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/quote/pdf: no token in a URL, a body or a log line (T-92-84)', () => {
  it('no answer and no log line carries the token', async () => {
    const logs: string[] = []
    const capture = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    }
    vi.spyOn(console, 'error').mockImplementation(capture)
    vi.spyOn(console, 'warn').mockImplementation(capture)
    vi.spyOn(console, 'log').mockImplementation(capture)

    const bodies: string[] = []
    for (const setup of [
      () => pdfMock.mockResolvedValue(PDF),
      () => pdfMock.mockResolvedValue(null),
      () => resolveMock.mockResolvedValue(null),
      () => resolveMock.mockRejectedValue(new Error(TOKEN)),
    ]) {
      setup()
      const res = await POST(req({ token: TOKEN }))
      bodies.push(Buffer.from(await res.arrayBuffer()).toString('latin1'))
      bodies.push([...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n'))
    }
    for (const text of [...bodies, ...logs]) expect(text).not.toContain(TOKEN)
  })

  it('the source is POST only, no-store, rendering-sized and builds no URL from the token', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/quote/pdf/route.ts'), 'utf8')
    expect(source).toMatch(/export async function POST/)
    expect(source).not.toMatch(/export async function GET/)
    expect(source).toContain("checkRateLimit('/api/quote/pdf'")
    expect(maxDuration).toBeGreaterThanOrEqual(60)
    expect(source).not.toMatch(/searchParams|new URL\(/)
  })
})
