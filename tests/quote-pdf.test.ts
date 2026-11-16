// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { locales } from '@/i18n/locales'

/**
 * Phase 92 plan 92-07 (QUOTE-07, D-14, B1): the one PDF entry, the per-locale font faces, the sample document and the
 * admin check route. puppeteer-core and @sparticuz/chromium-min are mocked; only the opt-in spike test
 * (tests/quote-pdf-spike.test.ts) launches a browser.
 */

const m = vi.hoisted(() => {
  const state = {
    requestHandlers: [] as Array<(req: unknown) => void>,
    cdpFonts: [] as Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>,
    cdpNodeFails: false,
  }
  const cdp = {
    send: vi.fn(async (method: string, params?: { nodeId?: number }) => {
      if (method === 'DOM.getDocument') {
        return {
          root: {
            nodeId: 1,
            nodeType: 9,
            nodeName: '#document',
            children: [
              {
                nodeId: 2,
                nodeType: 1,
                nodeName: 'HTML',
                children: [
                  {
                    nodeId: 3,
                    nodeType: 1,
                    nodeName: 'HEAD',
                    children: [
                      { nodeId: 4, nodeType: 1, nodeName: 'STYLE', children: [{ nodeId: 5, nodeType: 3, nodeName: '#text', nodeValue: 'p{}' }] },
                    ],
                  },
                  {
                    nodeId: 6,
                    nodeType: 1,
                    nodeName: 'BODY',
                    children: [
                      { nodeId: 7, nodeType: 1, nodeName: 'P', children: [{ nodeId: 8, nodeType: 3, nodeName: '#text', nodeValue: 'text' }] },
                      { nodeId: 9, nodeType: 1, nodeName: 'DIV', children: [{ nodeId: 10, nodeType: 3, nodeName: '#text', nodeValue: '   ' }] },
                    ],
                  },
                ],
              },
            ],
          },
        }
      }
      if (method === 'CSS.getPlatformFontsForNode') {
        if (state.cdpNodeFails) throw new Error('no layout')
        return params?.nodeId === 7 ? { fonts: state.cdpFonts } : { fonts: [] }
      }
      return {}
    }),
    detach: vi.fn(async () => {}),
  }
  const page = {
    setJavaScriptEnabled: vi.fn(async () => {}),
    setRequestInterception: vi.fn(async () => {}),
    on: vi.fn((event: string, handler: (req: unknown) => void) => {
      if (event === 'request') state.requestHandlers.push(handler)
    }),
    setContent: vi.fn(async () => {}),
    pdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    createCDPSession: vi.fn(async () => cdp),
  }
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  }
  const launch = vi.fn(async () => browser)
  const executablePath = vi.fn(async () => '/tmp/chromium')
  return { state, cdp, page, browser, launch, executablePath }
})

vi.mock('puppeteer-core', () => ({ default: { launch: m.launch }, launch: m.launch }))
vi.mock('@sparticuz/chromium-min', () => ({
  default: { args: ['--no-sandbox'], executablePath: m.executablePath },
}))

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

let savedChrome: string | undefined
let savedVercel: string | undefined
beforeEach(() => {
  savedChrome = process.env.QUOTE_PDF_CHROME_PATH
  savedVercel = process.env.VERCEL
  process.env.QUOTE_PDF_CHROME_PATH = CHROME
  delete process.env.VERCEL
  m.state.requestHandlers.length = 0
  m.state.cdpFonts = []
  m.state.cdpNodeFails = false
  m.launch.mockClear()
  m.launch.mockImplementation(async () => m.browser)
  m.executablePath.mockClear()
  m.browser.close.mockClear()
  m.browser.newPage.mockClear()
  m.page.setJavaScriptEnabled.mockClear()
  m.page.setRequestInterception.mockClear()
  m.page.setContent.mockClear()
  m.page.pdf.mockClear()
  m.page.pdf.mockImplementation(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
  m.page.createCDPSession.mockClear()
  m.cdp.send.mockClear()
})
afterEach(() => {
  if (savedChrome === undefined) delete process.env.QUOTE_PDF_CHROME_PATH
  else process.env.QUOTE_PDF_CHROME_PATH = savedChrome
  if (savedVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = savedVercel
  vi.useRealTimers()
  vi.restoreAllMocks()
})

import {
  renderQuotePdf,
  checkFontCoverage,
  pdfEngineKind,
  QUOTE_PDF_TIMEOUT_MS,
  CHROMIUM_PACK_URL,
} from '@/lib/quotes/pdf'
import { fontFaceCss } from '@/lib/quotes/pdf-fonts'
import { samplePdfHtml } from '@/lib/quotes/pdf-sample'

describe('renderQuotePdf (D-14, T-92-21, T-92-22)', () => {
  it('runs the page hardened: JavaScript off, interception on, every non-data request aborted', async () => {
    const out = await renderQuotePdf('<html><body>hello</body></html>')
    expect(out).toBeInstanceOf(Buffer)
    expect(out!.subarray(0, 4).toString('latin1')).toBe('%PDF')

    expect(m.page.setJavaScriptEnabled).toHaveBeenCalledWith(false)
    expect(m.page.setRequestInterception).toHaveBeenCalledWith(true)
    // both settings are in place before the document is loaded
    const setContentOrder = m.page.setContent.mock.invocationCallOrder[0]
    expect(m.page.setJavaScriptEnabled.mock.invocationCallOrder[0]).toBeLessThan(setContentOrder)
    expect(m.page.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(setContentOrder)

    expect(m.state.requestHandlers).toHaveLength(1)
    const handler = m.state.requestHandlers[0]
    const external = { url: () => 'https://example.com/x.png', abort: vi.fn(), continue: vi.fn() }
    handler(external)
    expect(external.abort).toHaveBeenCalledTimes(1)
    expect(external.continue).not.toHaveBeenCalled()
    for (const url of ['http://169.254.169.254/latest', 'file:///etc/passwd', 'ftp://x/y', 'ws://x/y']) {
      const req = { url: () => url, abort: vi.fn(), continue: vi.fn() }
      handler(req)
      expect(req.abort).toHaveBeenCalledTimes(1)
      expect(req.continue).not.toHaveBeenCalled()
    }
    const data = { url: () => 'data:font/ttf;base64,AAAA', abort: vi.fn(), continue: vi.fn() }
    handler(data)
    expect(data.continue).toHaveBeenCalledTimes(1)
    expect(data.abort).not.toHaveBeenCalled()
  })

  it('sets the content and prints A4 with backgrounds, then closes the browser', async () => {
    const html = '<html><body>hello</body></html>'
    await renderQuotePdf(html)
    expect(m.page.setContent).toHaveBeenCalledWith(html, expect.anything())
    expect(m.page.pdf).toHaveBeenCalledWith(expect.objectContaining({ format: 'A4', printBackground: true }))
    expect(m.browser.close).toHaveBeenCalled()
    expect(m.launch).toHaveBeenCalledWith(expect.objectContaining({ executablePath: CHROME }))
  })

  it('returns null, logging only a short code, when the launch fails', async () => {
    m.launch.mockRejectedValueOnce(new Error('boom SECRET-HTML-CONTENT'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await renderQuotePdf('<p>SECRET-HTML-CONTENT</p>')
    expect(out).toBeNull()
    const logged = spy.mock.calls.flat().map(String).join(' ')
    expect(logged).toMatch(/quote-pdf/)
    expect(logged).not.toContain('SECRET-HTML-CONTENT')
  })

  it('returns null and still closes the browser when pdf() fails', async () => {
    m.page.pdf.mockRejectedValueOnce(new Error('pdf failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await renderQuotePdf('<p>x</p>')).toBeNull()
    expect(m.browser.close).toHaveBeenCalled()
  })

  it('returns null after QUOTE_PDF_TIMEOUT_MS when the engine hangs', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.launch.mockImplementationOnce(() => new Promise(() => {}))
    const p = renderQuotePdf('<p>x</p>')
    await vi.advanceTimersByTimeAsync(QUOTE_PDF_TIMEOUT_MS + 1)
    expect(await p).toBeNull()
  })

  it('returns null without launching when no engine is configured (no env path, not on Vercel)', async () => {
    delete process.env.QUOTE_PDF_CHROME_PATH
    expect(pdfEngineKind()).toBe('none')
    expect(await renderQuotePdf('<p>x</p>')).toBeNull()
    expect(m.launch).not.toHaveBeenCalled()
  })

  it('uses the pinned Chromium pack on Vercel', async () => {
    delete process.env.QUOTE_PDF_CHROME_PATH
    process.env.VERCEL = '1'
    expect(pdfEngineKind()).toBe('chromium-min')
    const out = await renderQuotePdf('<p>x</p>')
    expect(out).not.toBeNull()
    expect(m.executablePath).toHaveBeenCalledWith(CHROMIUM_PACK_URL)
    expect(CHROMIUM_PACK_URL).toMatch(/^https:\/\/github\.com\/Sparticuz\/chromium\/releases\/download\/v153\.0\.0\/.*pack.*\.tar$/)
  })

  it('prefers the local Chrome path over Vercel when both are set', () => {
    process.env.VERCEL = '1'
    expect(pdfEngineKind()).toBe('local')
  })
})

describe('checkFontCoverage (B1, T-92-92)', () => {
  it('reports a system font that drew text as fallback and ignores the embedded one', async () => {
    m.state.cdpFonts = [
      { familyName: 'Noto Sans TC', isCustomFont: true, glyphCount: 12 },
      { familyName: 'PingFang TC', isCustomFont: false, glyphCount: 1 },
    ]
    const out = await checkFontCoverage('<p>x</p>')
    expect(out).toEqual({ fallback: ['PingFang TC'] })
    expect(m.page.setJavaScriptEnabled).toHaveBeenCalledWith(false)
    expect(m.page.setRequestInterception).toHaveBeenCalledWith(true)
    expect(m.cdp.send).toHaveBeenCalledWith('CSS.getPlatformFontsForNode', { nodeId: 7 })
    // style text in the head and whitespace-only nodes are not asked
    const asked = m.cdp.send.mock.calls.filter((c) => c[0] === 'CSS.getPlatformFontsForNode').map((c) => (c[1] as { nodeId: number }).nodeId)
    expect(asked).toEqual([7])
    expect(m.browser.close).toHaveBeenCalled()
  })

  it('returns an empty fallback when only embedded faces drew the text', async () => {
    m.state.cdpFonts = [{ familyName: 'Inter', isCustomFont: true, glyphCount: 4 }]
    expect(await checkFontCoverage('<p>x</p>')).toEqual({ fallback: [] })
  })

  it('returns null when no engine is configured', async () => {
    delete process.env.QUOTE_PDF_CHROME_PATH
    expect(await checkFontCoverage('<p>x</p>')).toBeNull()
    expect(m.launch).not.toHaveBeenCalled()
  })

  it('returns null when the engine could not answer for any node (a silent pass would hide a gap)', async () => {
    m.state.cdpNodeFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await checkFontCoverage('<p>x</p>')).toBeNull()
  })
})

describe('fontFaceCss (B1)', () => {
  it('zh embeds the Simplified face only, no Arabic face', () => {
    const css = fontFaceCss('zh')
    expect(css).toContain('Noto Sans SC')
    expect(css).not.toContain('Noto Sans TC')
    expect(css).not.toContain('Noto Sans Arabic')
    expect(css).toContain('Inter')
  })

  it('zh-hant embeds the Traditional face and not the Simplified one', () => {
    const css = fontFaceCss('zh-hant')
    expect(css).toContain('Noto Sans TC')
    expect(css).not.toContain('Noto Sans SC')
  })

  it('en embeds Inter and Fraunces only', () => {
    const css = fontFaceCss('en')
    expect(css).toContain("font-family: 'Inter'")
    expect(css).toContain("font-family: 'Fraunces'")
    expect(css).not.toContain('Noto')
  })

  it('ar and hi embed their own script face', () => {
    expect(fontFaceCss('ar')).toContain('Noto Sans Arabic')
    expect(fontFaceCss('ar')).not.toContain('Devanagari')
    expect(fontFaceCss('hi')).toContain('Noto Sans Devanagari')
    expect(fontFaceCss('hi')).not.toContain('Arabic')
  })

  it('embeds data: URLs only (the renderer blocks every other request)', () => {
    const css = fontFaceCss('ar')
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((x) => x[1].replace(/['"]/g, ''))
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(u.startsWith('data:')).toBe(true)
  })

  it.each(locales)('has fonts for %s and a sample document that renders', async (locale) => {
    expect(fontFaceCss(locale).length).toBeGreaterThan(1000)
    const html = await samplePdfHtml(locale)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('@font-face')
    // no URL a renderer could fetch
    expect(html).not.toMatch(/(?:src|href)=["']https?:/)
    expect(html).not.toMatch(/url\(\s*["']?https?:/)
  })
})

describe('samplePdfHtml', () => {
  it('ar is right-to-left and carries the Arabic catalog label', async () => {
    const ar = (await import('@/messages/ar.json')).default as unknown as { PaymentEmails: { common: { fromLabel: string } } }
    const html = await samplePdfHtml('ar')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain(ar.PaymentEmails.common.fromLabel)
  })

  it('zh-hant carries the Traditional catalog label, not the Simplified one', async () => {
    const hant = (await import('@/messages/zh-hant.json')).default as unknown as { PaymentEmails: { common: { fromLabel: string } } }
    const hans = (await import('@/messages/zh.json')).default as unknown as { PaymentEmails: { common: { fromLabel: string } } }
    const html = await samplePdfHtml('zh-hant')
    expect(html).toContain(hant.PaymentEmails.common.fromLabel)
    expect(hant.PaymentEmails.common.fromLabel).not.toBe(hans.PaymentEmails.common.fromLabel)
    expect(html).not.toContain('dir="rtl"')
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/quotes/pdf-check
// ---------------------------------------------------------------------------

const adminState = vi.hoisted(() => ({ auth: 'admin' as 'admin' | '401' | '403' }))
vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (adminState.auth === '401') return { user: null, error: '401' as const }
    if (adminState.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: '99999999-9999-4999-8999-999999999999' }, error: null }
  }),
}))

describe('GET /api/admin/quotes/pdf-check (T-92-24)', () => {
  async function call() {
    const { GET } = await import('@/app/api/admin/quotes/pdf-check/route')
    return GET()
  }

  it('401 without a session and nothing is rendered', async () => {
    adminState.auth = '401'
    const res = await call()
    expect(res.status).toBe(401)
    expect(m.launch).not.toHaveBeenCalled()
  })

  it('403 for a non-admin and nothing is rendered', async () => {
    adminState.auth = '403'
    const res = await call()
    expect(res.status).toBe(403)
    expect(m.launch).not.toHaveBeenCalled()
  })

  it('200 with one result per locale, no-store, and no PDF bytes in the body', async () => {
    adminState.auth = 'admin'
    m.state.cdpFonts = [{ familyName: 'Inter', isCustomFont: true, glyphCount: 3 }]
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const raw = await res.text()
    expect(raw).not.toContain('%PDF')
    const body = JSON.parse(raw) as {
      engine: string
      results: Array<{ locale: string; ok: boolean; ms: number; bytes: number; fallback: string[] }>
    }
    expect(body.engine).toBe('local')
    expect(body.results.map((r) => r.locale)).toEqual([...locales])
    for (const r of body.results) {
      expect(r.ok).toBe(true)
      expect(r.bytes).toBe(5)
      expect(typeof r.ms).toBe('number')
      expect(r.fallback).toEqual([])
    }
    expect(Object.keys(body.results[0]).sort()).toEqual(['bytes', 'fallback', 'locale', 'ms', 'ok'])
  })

  it('reports a non-embedded font and a failed render per locale without failing the request', async () => {
    adminState.auth = 'admin'
    m.state.cdpFonts = [{ familyName: 'Helvetica', isCustomFont: false, glyphCount: 2 }]
    const res = await call()
    const body = (await res.json()) as { results: Array<{ ok: boolean; fallback: string[] }> }
    expect(res.status).toBe(200)
    for (const r of body.results) {
      expect(r.ok).toBe(false)
      expect(r.fallback).toEqual(['Helvetica'])
    }
  })
})
