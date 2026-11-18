import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { refundQuotePayment } from '@/lib/quotes/cancel'

// Refund part of a paid quote payment by hand (Phase 92, plan 92-22; QUOTE-04; D-12). Operator only.
//
//   POST { source: 'deposit' | 'remainder', amount_minor: int > 0 }
//   -> 200 { ok: true }   the amount is refunded and the client gets a refund email
//      | 400 invalid | 404 | 413
//      | 422 { error: 'not_paid' }       that payment of the quote was never made
//      | 422 { error: 'out_of_range' }   more than what was paid minus what was already refunded
//      | 502 { error: 'refund_failed' }  Stripe refused; recorded, the operator alert went out, nothing else changed
//
// Works on a cancelled quote too (that is how a failed refund of a cancel is retried). Guard order: enforceMaxBody ->
// admin session (401 / 403) -> await params -> uuid (400) -> JSON (400, 413) -> strict schema (400) -> engine.
// Never cached; logs carry ids only.

const MAX_BODY_BYTES = 1_000
const idSchema = z.string().uuid()
const bodySchema = z
  .object({
    source: z.enum(['deposit', 'remainder']),
    amount_minor: z.number().int().min(1).max(1_000_000_000),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid quote id' }, { status: 400, headers: NO_STORE })
  }

  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = bodySchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await refundQuotePayment({
      quoteId: id,
      source: parsed.data.source,
      amountMinor: parsed.data.amount_minor,
      actor: { id: user.id },
    })
    if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE })
    switch (result.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
      case 'refund_failed':
        return NextResponse.json({ error: 'refund_failed' }, { status: 502, headers: NO_STORE })
      default:
        return NextResponse.json({ error: result.code }, { status: 422, headers: NO_STORE })
    }
  } catch {
    console.error('[admin/quotes/[id]/refund] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to refund' }, { status: 500, headers: NO_STORE })
  }
}
