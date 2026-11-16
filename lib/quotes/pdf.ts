/**
 * lib/quotes/pdf.ts — the one entry to the quote PDF engine (Phase 92, plan 92-07; D-14, QUOTE-07).
 *
 * Server only. renderQuotePdf(html) returns A4 PDF bytes, or null on any failure or after QUOTE_PDF_TIMEOUT_MS; it
 * never throws, so a caller can always fall back to the link in the email. The engine lives behind this function:
 *   - QUOTE_PDF_CHROME_PATH set: that local Chrome (development, the spike);
 *   - VERCEL set: @sparticuz/chromium-min with the pinned Chromium pack (T-92-23);
 *   - otherwise: no engine, null.
 *
 * The page is hardened (T-92-21, T-92-22): JavaScript is off and every request except data: URLs is aborted, so a
 * document cannot reach the network or run script. Nothing is fetched at render time; fonts are embedded
 * (lib/quotes/pdf-fonts.ts). The html is never logged.
 */
import type { Browser, Page } from 'puppeteer-core'

export const QUOTE_PDF_TIMEOUT_MS = 20_000

/**
 * Release asset of github.com/Sparticuz/chromium matching the installed @sparticuz/chromium-min major (v153.0.0, x64).
 * Pinned to a versioned tag over HTTPS (T-92-23); the pack is downloaded once per cold start into /tmp.
 */
export const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar'

export type PdfEngineKind = 'local' | 'chromium-min' | 'none'

/** Which engine this host would use, from the environment alone (nothing is launched). */
export function pdfEngineKind(): PdfEngineKind {
  if (process.env.QUOTE_PDF_CHROME_PATH) return 'local'
  if (process.env.VERCEL) return 'chromium-min'
  return 'none'
}

function logCode(code: string): void {
  console.error(`[quote-pdf] ${code}`)
}

interface LaunchPlan {
  executablePath: string
  args: string[]
  headless: boolean | 'shell'
}

async function resolveLaunchPlan(kind: Exclude<PdfEngineKind, 'none'>): Promise<LaunchPlan> {
  if (kind === 'local') {
    return {
      executablePath: process.env.QUOTE_PDF_CHROME_PATH as string,
      args: ['--disable-gpu', '--font-render-hinting=none'],
      headless: true,
    }
  }
  const chromium = (await import('@sparticuz/chromium-min')).default
  return {
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    args: chromium.args,
    headless: 'shell',
  }
}

/** JavaScript off, every non-data: request aborted — set before any content is loaded. */
async function hardenPage(page: Page): Promise<void> {
  await page.setJavaScriptEnabled(false)
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) void request.continue()
    else void request.abort()
  })
}

/**
 * Launches the engine, opens a hardened page with the document loaded, runs `use` on it and closes the browser, all
 * inside one QUOTE_PDF_TIMEOUT_MS budget. Returns null on any failure (a short code is logged) or when there is no
 * engine.
 */
async function withHardenedPage<T>(html: string, use: (page: Page) => Promise<T | null>): Promise<T | null> {
  const kind = pdfEngineKind()
  if (kind === 'none') {
    logCode('engine_none')
    return null
  }

  let browser: Browser | undefined
  const closeBrowser = async (): Promise<void> => {
    const b = browser
    browser = undefined
    if (b) await b.close().catch(() => undefined)
  }

  const work = (async (): Promise<T | null> => {
    const plan = await resolveLaunchPlan(kind)
    const puppeteer = (await import('puppeteer-core')).default
    browser = await puppeteer.launch({
      executablePath: plan.executablePath,
      args: plan.args,
      headless: plan.headless,
    })
    const page = await browser.newPage()
    await hardenPage(page)
    await page.setContent(html, { waitUntil: 'load' })
    return use(page)
  })()
  // A late launch after the timeout must not leave a browser running.
  work.then(closeBrowser, closeBrowser)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), QUOTE_PDF_TIMEOUT_MS)
  })
  try {
    return await Promise.race([work, timeout])
  } catch (error) {
    logCode(error instanceof Error && error.message === 'timeout' ? 'timeout' : 'render_failed')
    return null
  } finally {
    if (timer) clearTimeout(timer)
    await closeBrowser()
  }
}

/** A4 PDF bytes of a self-contained HTML document, or null (no engine, any failure, or QUOTE_PDF_TIMEOUT_MS). */
export async function renderQuotePdf(html: string): Promise<Buffer | null> {
  try {
    return await withHardenedPage<Buffer>(html, async (page) => {
      const bytes = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
      return Buffer.from(bytes)
    })
  } catch {
    return null
  }
}

interface CdpNode {
  nodeId: number
  nodeType: number
  nodeName: string
  nodeValue?: string
  children?: CdpNode[]
}

interface PlatformFont {
  familyName: string
  isCustomFont: boolean
  glyphCount?: number
}

/** Nodes under <body> that directly hold visible text (a text child with a non-blank value). */
function textElements(node: CdpNode, out: CdpNode[] = []): CdpNode[] {
  const children = node.children ?? []
  if (node.nodeType === 1 && children.some((c) => c.nodeType === 3 && (c.nodeValue ?? '').trim() !== '')) out.push(node)
  for (const child of children) if (child.nodeType === 1) textElements(child, out)
  return out
}

function findBody(node: CdpNode): CdpNode | null {
  if (node.nodeName === 'BODY') return node
  for (const child of node.children ?? []) {
    const found = findBody(child)
    if (found) return found
  }
  return null
}

/**
 * B1: renders the page in the same hardened engine and asks Chromium (CDP CSS.getPlatformFontsForNode) which fonts drew
 * the text of every element. `fallback` is the distinct family name of the fonts that are not embedded (isCustomFont
 * false): a glyph missing from the embedded face is then drawn by a system font and shows up here instead of passing
 * silently. Null when there is no engine, on any failure, or when the engine answered for no node at all.
 */
export async function checkFontCoverage(html: string): Promise<{ fallback: string[] } | null> {
  try {
    return await withHardenedPage<{ fallback: string[] }>(html, async (page) => {
      const client = await page.createCDPSession()
      try {
        await client.send('DOM.enable')
        await client.send('CSS.enable')
        const { root } = (await client.send('DOM.getDocument', { depth: -1, pierce: true })) as { root: CdpNode }
        const body = findBody(root)
        if (!body) return null
        const fallback = new Set<string>()
        let answered = 0
        for (const node of textElements(body)) {
          try {
            const { fonts } = (await client.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId })) as {
              fonts: PlatformFont[]
            }
            answered += 1
            for (const font of fonts) if (!font.isCustomFont) fallback.add(font.familyName)
          } catch {
            // an element without layout has no fonts to report
          }
        }
        if (answered === 0) return null
        return { fallback: [...fallback].sort() }
      } finally {
        await client.detach().catch(() => undefined)
      }
    })
  } catch {
    return null
  }
}
