import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { NO_STORE, forbidden, unauthorized } from '@/lib/quotes/admin-http'
import { decodeCursor, listCustomTourRequests, type CustomTourStatusFilter } from '@/lib/custom-tours/admin-store'

// The operator's list of custom-tour requests (Phase 93, plan 93-31; TRIP-07; D-18, D-19).
//
//   GET ?status=all|open|quoted&cursor=<opaque>   custom_tour inquiries newest first, 50 per page, each with its
//                                                 derived status (open / quoted) and the linked quote id + reference
//   -> 200 { items, nextCursor } | 400 invalid status or cursor | 401 | 403
//
// Guard order (project API patterns): admin session (401 / 403) -> query shape (400) -> store. The list carries
// personal data: it is admin-only and never cached. Logs carry codes only.

const STATUSES: ReadonlySet<string> = new Set(['all', 'open', 'quoted'])

export async function GET(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'all'
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers: NO_STORE })
  }
  const cursor = url.searchParams.get('cursor')
  if (cursor !== null && (cursor === '' || !decodeCursor(cursor))) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await listCustomTourRequests({ status: status as CustomTourStatusFilter, cursor })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch {
    console.error('[admin/custom-tours] list failed')
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500, headers: NO_STORE })
  }
}
