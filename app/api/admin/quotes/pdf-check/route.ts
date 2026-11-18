import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { locales } from '@/i18n/locales'
import { checkFontCoverage, pdfEngineKind, renderQuotePdf } from '@/lib/quotes/pdf'
import { samplePdfHtml } from '@/lib/quotes/pdf-sample'

// Phase 92, plan 92-07 (QUOTE-07, D-14, B1, T-92-24): the production platform proof of the PDF renderer.
//
//   GET -> 200 { engine, results: [{ locale, ok, ms, bytes, fallback }] }   one fixed sample per site locale
//
// Admin session first (401 / 403). It renders only the built-in sample documents (no client data, no input), one after
// another, and returns neither the PDF nor any text of it: per locale whether a PDF came out, the render time, its size
// and the names of the fonts that drew text WITHOUT being embedded (empty = every glyph came from an embedded face).

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

  const results: Array<{ locale: string; ok: boolean; ms: number; bytes: number; fallback: string[] }> = []
  for (const locale of locales) {
    const html = await samplePdfHtml(locale)
    const started = Date.now()
    const pdf = await renderQuotePdf(html)
    const ms = Date.now() - started
    const coverage = pdf ? await checkFontCoverage(html) : null
    const fallback = coverage?.fallback ?? []
    results.push({
      locale,
      ok: pdf !== null && pdf.subarray(0, 4).toString('latin1') === '%PDF' && coverage !== null && fallback.length === 0,
      ms,
      bytes: pdf?.length ?? 0,
      fallback,
    })
  }

  return NextResponse.json({ engine: pdfEngineKind(), results }, { headers: NO_STORE })
}
