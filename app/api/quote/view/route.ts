import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { QUOTE_TOKEN_RE } from '@/lib/quotes/token'
import { markQuoteViewed, resolveQuoteToken } from '@/lib/quotes/resolve'

/**
 * Phase 92, plan 92-09 (QUOTE-02; D-10, T-92-29, T-92-30, T-92-32): the client opened the quote.
 *
 * Public, unauthenticated, token-gated POST (the CSRF prefix `/api/quote` and the rate-limit key below exist since plan
 * 92-04). The quote page GET writes nothing, because mail scanners prefetch links; this explicit POST, sent by the
 * page's QuoteViewedPing island, is the only thing that records "viewed" (compare-and-set sent -> viewed plus one
 * 'viewed' event, idempotent). Some scanners run scripts, so "viewed" is informational and never gates money.
 *
 * - The token travels in the body (never a URL, never logged) and is checked against QUOTE_TOKEN_RE before any
 *   database call, then resolved. Every token that does not lead to a live quote link gets the same 404 body.
 * - A viewed, accepted or paid quote answers 200 and is left unchanged.
 */

const bodySchema = z.object({ token: z.string().regex(QUOTE_TOKEN_RE) }).strict()

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) {
    tooBig.headers.set('Cache-Control', 'no-store')
    return tooBig
  }

  const { allowed } = await checkRateLimit('/api/quote/view', getClientIp(request))
  if (!allowed) return json({ error: 'Too many requests' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400)

  const resolved = await resolveQuoteToken(parsed.data.token)
  if (!resolved) return json({ error: 'invalid_link' }, 404)

  try {
    await markQuoteViewed(resolved)
  } catch {
    // Informational only: a failed write must not turn into an error the client sees. No token or id in the log line.
    console.error('[quote-view] could not record the view')
  }
  return json({ ok: true })
}
