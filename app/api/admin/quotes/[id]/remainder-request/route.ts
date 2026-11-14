import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { requestRemainder } from '@/lib/quotes/invoice'

// Ask the client to pay the remainder of a payment-link quote (Phase 92, plan 92-24; QUOTE-04; D-16, D-22).
//
//   POST (no input)
//     mints a fresh quote link and emails it, with the amount still due, in the quote's language; the client pays on
//     the quote page. Nothing is charged here.
//   -> 200 { amountMinor }   the amount named in the email, in minor units of the quote currency
//      | 400 invalid | 404 | 413
//      | 422 { error: 'action_not_allowed', reason }   reason: not_payment_link | not_paid | nothing_due
//      | 429 { error: 'recently_sent' }                 a request went out less than 10 minutes ago
//      | 502 { error: 'email_failed' }                  the email could not be sent; the operator can try again
//      | 500
//
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON (400, 413) ->
// strict schema (400) -> engine (404, 422, 429, 502). Never cached; logs carry ids only: no token, no address.

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
    const result = await requestRemainder({ quoteId: id, actor: { id: user.id } })
    if (result.ok) return NextResponse.json({ amountMinor: result.amountMinor }, { headers: NO_STORE })
    switch (result.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
      case 'recently_sent':
        return NextResponse.json({ error: 'recently_sent' }, { status: 429, headers: NO_STORE })
      case 'email_failed':
        return NextResponse.json({ error: 'email_failed' }, { status: 502, headers: NO_STORE })
      default:
        return NextResponse.json({ error: 'action_not_allowed', reason: result.code }, { status: 422, headers: NO_STORE })
    }
  } catch {
    console.error('[admin/quotes/[id]/remainder-request] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to send the remainder request' }, { status: 500, headers: NO_STORE })
  }
}
