import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { QUOTE_TOKEN_RE } from '@/lib/quotes/token'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import { getOrRenderQuotePdf } from '@/lib/quotes/documents'
import { quotePdfFileName } from '@/lib/quotes/pdf-file-name'

/**
 * Phase 92, plan 92-27 (QUOTE-07; D-14; T-92-83, T-92-84): the client downloads the quote as a PDF.
 *
 * Public, unauthenticated, token-gated POST (the CSRF prefix `/api/quote` and the rate-limit key below exist since plan
 * 92-04). The download is a POST with the token in the body, so the token is never in a URL (no .pdf path under a
 * locale either: the middleware matcher excludes static extensions).
 *
 * Guard order as /api/quote/view: body cap (413), rate limit (429), JSON and strict schema (400), then the resolver.
 * - Only a live link (offer or paid) gets a file; every other token gets the same 404 invalid_link.
 * - The file is the stored PDF of the link's version (getOrRenderQuotePdf, plan 92-20): the same bytes as the email
 *   attachment and what the client accepted. No PDF (no engine, a render or database failure) is 503 pdf_unavailable,
 *   and the page offers Print instead (D-14 fallback).
 * - Every answer is Cache-Control no-store (a proxy must never keep a quote). No body or log line carries the token.
 */

// A cold render starts Chromium and renders inside QUOTE_PDF_TIMEOUT_MS (the same budget as the admin send route).
export const maxDuration = 60

const MAX_BODY_BYTES = 2_000

const bodySchema = z.object({ token: z.string().regex(QUOTE_TOKEN_RE) }).strict()

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) {
    tooBig.headers.set('Cache-Control', 'no-store')
    return tooBig
  }

  const { allowed } = await checkRateLimit('/api/quote/pdf', getClientIp(request))
  if (!allowed) return json({ error: 'Too many requests' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400)

  let resolved: Awaited<ReturnType<typeof resolveQuoteToken>>
  try {
    resolved = await resolveQuoteToken(parsed.data.token)
  } catch {
    // A fixed line: no token, no database message.
    console.error('[quote-pdf] resolve failed')
    return json({ error: 'pdf_unavailable' }, 503)
  }
  if (!resolved) return json({ error: 'invalid_link' }, 404)

  // Never throws; null is "no PDF on this host right now" and is logged inside with the version id and a code.
  const pdf = await getOrRenderQuotePdf(resolved.version.id)
  if (!pdf || pdf.length === 0) return json({ error: 'pdf_unavailable' }, 503)

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quotePdfFileName(resolved.quote.reference, resolved.version.version_no)}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
