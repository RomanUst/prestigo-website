import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { NO_STORE, forbidden, unauthorized } from '@/lib/quotes/admin-http'
import { getAdminTour } from '@/lib/tours/admin-store'
import { UUID_RE, notFound, tourErrorResponse } from '@/lib/tours/admin-http'

// One tour for the admin editor (Phase 93, plan 93-07; TRIP-05).
//
//   GET    the tour, its 8 locale slots (null where absent), its photos and the publish checklist
//
// Guard order: admin session (401 / 403) -> id (404) -> store (404).

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()

  try {
    return NextResponse.json(await getAdminTour(id), { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours/[id]')
  }
}
