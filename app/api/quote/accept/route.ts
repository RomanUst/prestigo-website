import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { QUOTE_TOKEN_RE } from '@/lib/quotes/token'
import { acceptQuote } from '@/lib/quotes/accept'

/**
 * Phase 92, plan 92-16 (QUOTE-03, QUOTE-05; D-05, D-08; T-92-49, T-92-52, T-92-53): the client accepts the quote and
 * starts the deposit payment.
 *
 * Public, unauthenticated, token-gated POST (CSRF prefix `/api/quote` and the rate-limit key exist since plan 92-04).
 * It creates a Stripe PaymentIntent, so the order is strict: body cap, rate limit, JSON, strict schema, consent, then
 * acceptQuote (which resolves the token, cross-checks, logs the acceptance and only then calls Stripe).
 *
 * - The server is the price authority: the body carries the token, the version number and deposit the client was
 *   shown (cross-checks only) and consent true. A key such as an amount or a consent text is a 400 (strict schema):
 *   nothing the client sends decides what is charged or what text is stored.
 * - A dead link (past first pickup, expired, voided, superseded, unknown) is one 404 invalid_link with no price data.
 * - Every answer is Cache-Control no-store. No body or log line carries the token, a Stripe message or a database detail.
 */

const MAX_BODY_BYTES = 2_000

const bodySchema = z
  .object({
    token: z.string().regex(QUOTE_TOKEN_RE),
    displayedVersionNo: z.number().int().min(1),
    displayedDepositMinor: z.number().int().positive(),
    consent: z.boolean(),
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

  const { allowed } = await checkRateLimit('/api/quote/accept', getClientIp(request))
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

  // Only the JSON boolean true is a consent. The stored text is the server rendering, never a client string.
  if (parsed.data.consent !== true) return json({ error: 'CONSENT_REQUIRED' }, 422)

  let result: Awaited<ReturnType<typeof acceptQuote>>
  try {
    result = await acceptQuote({
      token: parsed.data.token,
      displayedVersionNo: parsed.data.displayedVersionNo,
      displayedDepositMinor: parsed.data.displayedDepositMinor,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? '',
    })
  } catch {
    // A database or rendering failure: a fixed line (no token, no message), a generic answer.
    console.error('[quote-accept] accept failed')
    return json({ error: 'payment_unavailable' }, 502)
  }

  if (result.ok) {
    return json({ clientSecret: result.clientSecret, amountMinor: result.amountMinor, currency: result.currency })
  }
  switch (result.code) {
    case 'invalid_link':
      return json({ error: 'invalid_link' }, 404)
    case 'quote_changed':
    case 'already_paid':
    case 'already_paying':
    case 'busy':
      return json({ error: result.code }, 409)
    default:
      return json({ error: 'payment_unavailable' }, 502)
  }
}
