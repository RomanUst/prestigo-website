import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { QUOTE_TOKEN_RE } from '@/lib/quotes/token'
import { resolveQuoteToken } from '@/lib/quotes/resolve'

/**
 * Phase 92, plan 92-16 (QUOTE-03; D-05, T-92-30): the quote page polls this after the client pays, to see when the
 * quote is confirmed. It answers the state and the booking references and nothing else; a token that does not lead to
 * a live quote link gets the same 404 as everywhere. Read only (the resolver never writes).
 *
 * state: 'offer' (not accepted yet), 'accepted' (accepted, the deposit is pending) or 'paid' (confirmed; the booking
 * references are listed once the conversion has made them).
 */

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

  const { allowed } = await checkRateLimit('/api/quote/state', getClientIp(request))
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
    console.error('[quote-state] resolve failed')
    return json({ error: 'unavailable' }, 502)
  }
  if (!resolved) return json({ error: 'invalid_link' }, 404)

  const state = resolved.state === 'paid' ? 'paid' : resolved.quote.status === 'accepted' ? 'accepted' : 'offer'
  return json({ state, bookingReferences: resolved.bookings.map((b) => b.booking_reference) })
}
