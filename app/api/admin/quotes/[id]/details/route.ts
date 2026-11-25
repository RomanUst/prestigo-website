import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readOptionalCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { fillQuoteDetails } from '@/lib/quotes/details'
import { quoteDetailsSchema } from '@/lib/quotes/schemas'

// Fill the TBC fields of a sent quote (migration 099, owner request 2026-11-24).
//
//   POST { lines: [{ position, pickup_date?, pickup_time?, origin?, destination?, hours?, return_date?, title?,
//                    flight_number?, terminal? }] }
//   -> 200 { complete, bookings }   bookings: null, or what happened to the waiting bookings of a paid quote
//      | 400 invalid | 401 | 403 | 404 | 413
//      | 422 { error: 'action_not_allowed', code }   code: not_sendable | unknown_line | closed | not_current
//
// Only fields that are still empty are written (the database refuses to change what the client was shown).
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON (400, 413)
// -> strict schema (400) -> engine. The response is never cached. Logs carry ids only: no address.

// Making the waiting bookings may send the confirmation email.
export const maxDuration = 60

const MAX_BODY_BYTES = 40_000
const idSchema = z.string().uuid()

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
  const parsed = quoteDetailsSchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await fillQuoteDetails(id, parsed.data, { id: user.id })
    if (result.ok) {
      return NextResponse.json({ complete: result.complete, bookings: result.bookings }, { headers: NO_STORE })
    }
    if (result.code === 'not_found') return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ error: 'action_not_allowed', code: result.code }, { status: 422, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]/details] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to save the details' }, { status: 500, headers: NO_STORE })
  }
}
