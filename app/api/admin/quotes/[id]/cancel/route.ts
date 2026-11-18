import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { cancelQuote, readQuoteCancelPreview } from '@/lib/quotes/cancel'

// Cancel a paid quote as a whole (Phase 92, plan 92-22; QUOTE-03, QUOTE-04; D-03, D-06, D-11, D-12, D-13). Operator only.
//
//   GET ?initiator=admin_client|admin_prestigo (default admin_client)
//   -> 200 { outcome, freeUntilMs, depositMinor, refundedMinor, keptMinor, proposedRefundMinor, remainderRefundMinor }
//      the decision the cancel would make now, for the dialog (never cached)
//   POST { initiator, refund_minor: int >= 0 | null }
//   -> 200 { ok: true, outcome, refundedMinor, refundFailed }   the quote is cancelled; refundFailed true keeps the cancel
//      | 400 invalid | 404 | 413
//      | 409 { error: 'busy' }                       another click won, or a trip could not be cancelled: nothing more changed
//      | 422 { error: 'not_paid' | 'already_cancelled' | 'trips_started' | 'refund_out_of_range' }
//
// refund_minor is ignored when the outcome is free (the whole deposit not yet refunded goes back) and required when late.
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> uuid (400) -> JSON (400, 413) -> strict
// schema (400) -> engine. Never cached; logs carry ids only.

const MAX_BODY_BYTES = 1_000
const idSchema = z.string().uuid()
const initiatorSchema = z.enum(['admin_client', 'admin_prestigo'])
const bodySchema = z
  .object({
    initiator: initiatorSchema,
    refund_minor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  })
  .strict()

const REFUSALS = new Set(['not_paid', 'already_cancelled', 'trips_started', 'refund_out_of_range'])

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid quote id' }, { status: 400, headers: NO_STORE })
  }
  const asked = new URL(request.url).searchParams.get('initiator') ?? 'admin_client'
  const initiator = initiatorSchema.safeParse(asked)
  if (!initiator.success) {
    return NextResponse.json({ error: 'Invalid initiator' }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await readQuoteCancelPreview(id, initiator.data)
    if (result.ok) return NextResponse.json(result.preview, { headers: NO_STORE })
    if (result.code === 'not_found') return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ error: result.code }, { status: 422, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]/cancel] preview failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to read the cancellation' }, { status: 500, headers: NO_STORE })
  }
}

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
    const result = await cancelQuote({
      quoteId: id,
      initiator: parsed.data.initiator,
      refundMinor: parsed.data.refund_minor ?? null,
      actor: { id: user.id },
    })
    if (result.ok) {
      return NextResponse.json(
        { ok: true, outcome: result.outcome, refundedMinor: result.refundedMinor, refundFailed: result.refundFailed },
        { headers: NO_STORE },
      )
    }
    if (result.code === 'not_found') return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    if (result.code === 'busy') return NextResponse.json({ error: 'busy' }, { status: 409, headers: NO_STORE })
    if (REFUSALS.has(result.code)) return NextResponse.json({ error: result.code }, { status: 422, headers: NO_STORE })
    return NextResponse.json({ error: 'Failed to cancel quote' }, { status: 500, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]/cancel] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to cancel quote' }, { status: 500, headers: NO_STORE })
  }
}
