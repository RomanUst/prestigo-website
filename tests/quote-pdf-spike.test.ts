// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { locales } from '@/i18n/locales'
import { checkFontCoverage, renderQuotePdf } from '@/lib/quotes/pdf'
import { samplePdfHtml } from '@/lib/quotes/pdf-sample'

/**
 * Phase 92 plan 92-07 (QUOTE-07, D-14, B1): the opt-in local spike. It launches a real Chrome, so it only runs with
 *
 *   QUOTE_PDF_SPIKE=1 QUOTE_PDF_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     npx vitest run tests/quote-pdf-spike.test.ts
 *
 * One sample PDF per site locale is written to QUOTE_PDF_SPIKE_DIR (default os.tmpdir()/prestigo-quote-pdf-spike/<locale>.pdf).
 * The coverage check is what keeps a missing Traditional glyph honest: local Chrome would otherwise fill it from a
 * macOS system font and the PDF would still look right here.
 */
const enabled = process.env.QUOTE_PDF_SPIKE === '1' && !!process.env.QUOTE_PDF_CHROME_PATH
const outDir = process.env.QUOTE_PDF_SPIKE_DIR || path.join(os.tmpdir(), 'prestigo-quote-pdf-spike')

describe.skipIf(!enabled)('quote PDF spike (local Chrome)', () => {
  it('renders every site locale from embedded faces only', { timeout: 300_000 }, async () => {
    mkdirSync(outDir, { recursive: true })
    const table: Array<{ locale: string; ms: number; bytes: number; fallback: string }> = []

    for (const locale of locales) {
      const html = await samplePdfHtml(locale)
      const started = Date.now()
      const pdf = await renderQuotePdf(html)
      const ms = Date.now() - started
      expect(pdf, `${locale}: renderQuotePdf returned null`).not.toBeNull()
      const bytes = pdf as Buffer
      expect(bytes.subarray(0, 4).toString('latin1'), `${locale}: not a PDF`).toBe('%PDF')
      expect(bytes.length, `${locale}: PDF over 2 MB`).toBeLessThan(2 * 1024 * 1024)
      writeFileSync(path.join(outDir, `${locale}.pdf`), bytes)

      const coverage = await checkFontCoverage(html)
      expect(coverage, `${locale}: the font check could not run`).not.toBeNull()
      table.push({ locale, ms, bytes: bytes.length, fallback: coverage!.fallback.join(', ') })
      expect(coverage!.fallback, `${locale}: text drawn by a non-embedded font`).toEqual([])
    }

    const lines = ['locale   ms      bytes    fallback', ...table.map((r) => `${r.locale.padEnd(8)} ${String(r.ms).padEnd(7)} ${String(r.bytes).padEnd(8)} [${r.fallback}]`)]
    process.stdout.write(`\nquote PDF spike -> ${outDir}\n${lines.join('\n')}\n`)
    writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(table, null, 2))
  })
})
