import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { reviseQuote } from '@/lib/quotes/lifecycle'

// Revise a sent quote into a new version (Phase 92, plan 92-13; QUOTE-06).
//
//   POST (no input)
//   -> 200 { versionId }   version n+1 is a new draft copy and the current version; every link of version n is dead
//      | 400 invalid | 404 | 413
//      | 409 { error: 'deposit_in_flight' }   the client's deposit is processing or paid: nothing changed
//      | 409 { error: 'busy' }                a concurrent change won; nothing changed
//      | 422 { error: 'action_not_allowed', reason: 'not_revisable' }   draft, paid, voided, cancelled
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
    const result = await reviseQuote(id, { id: user.id })
    if (result.ok) return NextResponse.json({ versionId: result.versionId }, { headers: NO_STORE })
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
    console.error('[admin/quotes/[id]/revise] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to revise quote' }, { status: 500, headers: NO_STORE })
  }
}
