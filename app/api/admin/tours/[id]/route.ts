import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { tourBasicsSchema } from '@/lib/tours/admin-schemas'
import { getAdminTour, updateTourBasics } from '@/lib/tours/admin-store'
import { UUID_RE, invalidPayload, notFound, tourErrorResponse } from '@/lib/tours/admin-http'

// One tour for the admin editor (Phase 93, plan 93-07; TRIP-05).
//
//   GET    the tour, its 8 locale slots (null where absent), its photos and the publish checklist
//   PATCH  the basics (hours, drive minutes, start window, destination label, E/S/V prices, slug while unpublished)
//
// Guard order: admin session (401 / 403) -> id (404) -> body cap (413) -> JSON (400) -> strict schema (400) -> store
// (404, 409 SLUG_LOCKED / SLUG_TAKEN, 422 INVALID_WINDOW). A write purges the locale layout so the site changes
// without a redeploy. The slug is locked once first_published_at is set (D-07, SLUG_LOCKED).

const MAX_BODY_BYTES = 5_000

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

export async function PATCH(request: Request, { params }: Ctx) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourBasicsSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const tour = await updateTourBasics(id, parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ tour }, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours/[id]')
  }
}
