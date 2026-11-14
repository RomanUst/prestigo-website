import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { QUOTE_TOKEN_RE } from '@/lib/quotes/token'
import { createRemainderIntent } from '@/lib/quotes/remainder'

/**
 * Phase 92, plan 92-23 (QUOTE-04; D-16, D-22; T-92-73, T-92-74): the client pays the remainder of a paid payment-link quote on
 * the quote page.
 *
 * Public, unauthenticated, token-gated POST (CSRF prefix `/api/quote` and the rate-limit key exist since plan 92-04). It
 * creates a Stripe PaymentIntent, so the order is strict: body cap, rate limit, JSON, strict schema, then
 * createRemainderIntent (which resolves the token, computes the amount on the server and only then calls Stripe).
 *
 * - The server is the price authority: the body carries the token and the amount the client was shown (a cross-check, 409
 *   amount_changed on a difference). Any other key, an amount or a currency included, is a 400 (strict schema).
 * - A dead link (cancelled, voided, superseded, unknown) is one 404 invalid_link; an unpaid quote or one with nothing due is a
 *   422 with the error key only. No answer carries price data.
 * - Every answer is Cache-Control no-store. No body or log line carries the token, a Stripe message or a database detail.
 */

const MAX_BODY_BYTES = 2_000

const bodySchema = z
  .object({
    token: z.string().regex(QUOTE_TOKEN_RE),
    displayedAmountMinor: z.number().int().positive(),
  })
  .strict()

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

  const { allowed } = await checkRateLimit('/api/quote/remainder', getClientIp(request))
  if (!allowed) return json({ error: 'Too many requests' }, 429)

  // The declared length can be absent (chunked): the cap is enforced on the bytes actually read as well.
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid payload' }, 400)

  let result: Awaited<ReturnType<typeof createRemainderIntent>>
  try {
    result = await createRemainderIntent({
      token: parsed.data.token,
      displayedAmountMinor: parsed.data.displayedAmountMinor,
    })
  } catch {
    // A database or Stripe-side failure: a fixed line (no token, no message), a generic answer.
    console.error('[quote-remainder] remainder failed')
    return json({ error: 'payment_unavailable' }, 502)
  }

  if (result.ok) {
    return json({ clientSecret: result.clientSecret, amountMinor: result.amountMinor, currency: result.currency })
  }
  switch (result.code) {
    case 'invalid_link':
      return json({ error: 'invalid_link' }, 404)
    case 'not_payable':
    case 'nothing_due':
      return json({ error: result.code }, 422)
    case 'amount_changed':
    case 'already_paying':
    case 'busy':
      return json({ error: result.code }, 409)
    default:
      return json({ error: 'payment_unavailable' }, 502)
  }
}
