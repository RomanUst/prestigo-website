import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { tourCreateSchema } from '@/lib/tours/admin-schemas'
import { createTourDraft, listAdminTours } from '@/lib/tours/admin-store'
import { invalidPayload, tourErrorResponse } from '@/lib/tours/admin-http'

// The operator's tour list and tour creation (Phase 93, plan 93-07; TRIP-05).
//
//   GET   all tours in sort order with English title, cover and completeness per locale
//   POST  { slug, title }  a new draft tour (sort_order = max + 1) with an English row holding the title
//
// Guard order (project API patterns): admin session (401 / 403) -> body cap (413) -> JSON (400) -> strict schema (400)
// -> store (409 SLUG_TAKEN). Logs carry codes only. The admin check is the shared getAdminUser
// (app_metadata.is_admin) of lib/supabase/server.

const MAX_BODY_BYTES = 5_000

export async function GET() {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  try {
    const tours = await listAdminTours()
    return NextResponse.json({ tours }, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours')
  }
}

export async function POST(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourCreateSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const { id } = await createTourDraft(parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours')
  }
}
