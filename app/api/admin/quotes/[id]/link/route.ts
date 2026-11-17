import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { mintQuoteLink } from '@/lib/quotes/lifecycle'

// A fresh secret link for a quote (Phase 92, plan 92-13; QUOTE-02): "Copy link".
//
//   POST (no input)
//   -> 200 { url }   a new link of the current version; only its hash is stored, so an old link cannot be shown again
//      | 400 invalid | 404 | 413 | 422 { error: 'action_not_allowed', reason: 'not_live' }   (draft, voided, cancelled)
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
    const result = await mintQuoteLink(id, { id: user.id })
    if (result.ok) return NextResponse.json({ url: result.url }, { headers: NO_STORE })
    if (result.code === 'not_found') return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ error: 'action_not_allowed', reason: result.code }, { status: 422, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]/link] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500, headers: NO_STORE })
  }
}
