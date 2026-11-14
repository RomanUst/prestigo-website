import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { sendQuote } from '@/lib/quotes/lifecycle'

// Send a quote (Phase 92, plan 92-13; QUOTE-01, QUOTE-02, QUOTE-07; D-02, D-05, D-07).
//
//   POST { resend?: boolean }
//     a draft is frozen, set to sent, given a secret link and emailed in the quote's language;
//     resend: true on a sent, viewed, accepted or paid quote mints one more link and sends the email again.
//   -> 200 { status, url, emailed }   the URL is in this response and the email only: it cannot be shown again
//      | 400 invalid | 404 | 409 { error: 'busy' } | 413
//      | 422 { error: 'action_not_allowed', code, reason }   code: not_sendable | first_pickup_passed | expired |
//        money_invalid | distance_missing (reason: the money rule, or the code itself)
//
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON (400, 413)
// -> strict schema (400) -> engine. The response is never cached. Logs carry ids only: no token, no address.

const MAX_BODY_BYTES = 2_000
const idSchema = z.string().uuid()
const bodySchema = z.object({ resend: z.boolean().optional() }).strict()

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
  const parsed = bodySchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await sendQuote(id, { id: user.id }, { resend: parsed.data.resend === true })
    if (result.ok) {
      return NextResponse.json({ status: result.status, url: result.url, emailed: result.emailed }, { headers: NO_STORE })
    }
    switch (result.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
      case 'busy':
        return NextResponse.json({ error: 'busy' }, { status: 409, headers: NO_STORE })
      default:
        return NextResponse.json(
          { error: 'action_not_allowed', code: result.code, reason: result.reason ?? result.code },
          { status: 422, headers: NO_STORE },
        )
    }
  } catch {
    console.error('[admin/quotes/[id]/send] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to send quote' }, { status: 500, headers: NO_STORE })
  }
}
