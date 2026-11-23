import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { NO_STORE, forbidden, unauthorized } from '@/lib/quotes/admin-http'
import { getCustomTourRequest } from '@/lib/custom-tours/admin-store'

// One custom-tour request for the operator (Phase 93, plan 93-31; TRIP-07; D-18, D-19).
//
//   GET  the full request (where, date, people, wishes, starting tour, language, contact) and the linked quote
//   -> 200 | 400 id is not a uuid | 401 | 403 | 404 unknown id, an erased request or an inquiry of another kind
//
// Guard order (project API patterns): admin session (401 / 403) -> await params -> id is a uuid (400) -> row (404).
// Personal data: admin-only, never cached, never logged.

const idSchema = z.string().uuid()

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid request id' }, { status: 400, headers: NO_STORE })
  }

  try {
    const detail = await getCustomTourRequest(id)
    if (!detail) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json(detail, { headers: NO_STORE })
  } catch {
    console.error('[admin/custom-tours/[id]] read failed', { requestId: id })
    return NextResponse.json({ error: 'Failed to load request' }, { status: 500, headers: NO_STORE })
  }
}
