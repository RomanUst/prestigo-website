import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { voidQuote } from '@/lib/quotes/lifecycle'

// Void a quote (Phase 92, plan 92-13; QUOTE-06; D-02: a link lives until the operator cancels it).
//
//   POST (no input)
//   -> 200 { ok: true }   voided at once, every link dead; voiding a voided quote is a success
//      | 400 invalid | 404 | 413
//      | 409 { error: 'deposit_in_flight' }   the client's deposit is processing or paid: nothing changed
//      | 409 { error: 'busy' }                a concurrent change won; nothing changed
//      | 422 { error: 'action_not_allowed', reason: 'already_paid' }   a paid quote is cancelled, not voided
//
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> uuid (400) -> JSON (400, 413) -> strict
// schema (400) -> engine. Never cached; logs carry ids only.

const MAX_BODY_BYTES = 1_000
const idSchema = z.string().uuid()
const bodySchema = z.object({}).strict()

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

  const body = await readOptionalCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  if (!bodySchema.safeParse(body.json).success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await voidQuote(id, { id: user.id })
    if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE })
    switch (result.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
      case 'deposit_in_flight':
      case 'busy':
        return NextResponse.json({ error: result.code }, { status: 409, headers: NO_STORE })
      default:
        return NextResponse.json({ error: 'action_not_allowed', reason: result.code }, { status: 422, headers: NO_STORE })
    }
  } catch {
    console.error('[admin/quotes/[id]/void] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to void quote' }, { status: 500, headers: NO_STORE })
  }
}
