import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { quoteDraftSchema } from '@/lib/quotes/schemas'
import { getQuoteDetail, saveQuoteDraft } from '@/lib/quotes/store'

// One quote for the operator (Phase 92, plan 92-08; QUOTE-01, QUOTE-06; D-04).
//
//   GET    the quote with its current version, lines (with stops), versions, latest events and bookings
//   PATCH  edits the DRAFT version: header fields and (optionally) the whole line list. The server computes the
//          distance through all stops and the live-tariff suggestion of every changed line; the operator's amount is
//          the line price. A frozen version answers 409 version_frozen.
//   -> 200 { ok: true } | 400 invalid | 404 | 409 { error: 'version_frozen' } | 413
//      | 422 { error: 'action_not_allowed' | 'invalid_lines', reason } | 503 { error: 'pricing_unavailable' }
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400)
// -> JSON (400, 413) -> strict schema (400) -> row (404) -> state rules (422, 409) -> engine. A shape error is 400; a
// well-formed request the state does not allow is 422. Logs carry ids and codes only.

const MAX_BODY_BYTES = 20_000
const idSchema = z.string().uuid()

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid quote id' }, { status: 400, headers: NO_STORE })
  }

  try {
    const detail = await getQuoteDetail(id)
    if (!detail) return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json(detail, { headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]] read failed', { quoteId: id })
    return NextResponse.json({ error: 'Failed to load quote' }, { status: 500, headers: NO_STORE })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = quoteDraftSchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await saveQuoteDraft(id, parsed.data, { type: 'admin', id: user.id })
    if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE })
    switch (result.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
      case 'version_frozen':
        return NextResponse.json({ error: 'version_frozen' }, { status: 409, headers: NO_STORE })
      case 'pricing_unavailable':
        return NextResponse.json({ error: 'pricing_unavailable' }, { status: 503, headers: NO_STORE })
      default:
        return NextResponse.json({ error: result.code, reason: result.reason }, { status: 422, headers: NO_STORE })
    }
  } catch {
    console.error('[admin/quotes/[id]] save failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to save quote' }, { status: 500, headers: NO_STORE })
  }
}
