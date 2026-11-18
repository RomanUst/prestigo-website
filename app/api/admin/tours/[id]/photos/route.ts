import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { UUID_RE, invalidPayload, notFound } from '@/lib/tours/admin-http'
import { photoErrorResponse, registerTourPhoto, tourPhotoRegisterSchema } from '@/lib/tours/admin-photos'

// Register an uploaded tour photo (Phase 93, plan 93-08; TRIP-02, D-15).
//
// Called after the browser finished the signed upload. The path must be tours/<this tour>/<uuid>.<ext> (400 otherwise)
// and the object must exist in the bucket (422 OBJECT_MISSING, no row). The first photo of a tour becomes the cover.
// Credit text, licence and an https source link are stored as given; a missing credit is reported by the publish
// checklist, not here.
//
// Guard order: admin session (401 / 403) -> id (404) -> body cap (413) -> JSON (400) -> strict schema (400) -> store.

const MAX_BODY_BYTES = 2_000

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
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
  const parsed = tourPhotoRegisterSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const photo = await registerTourPhoto(id, parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ photo }, { status: 201, headers: NO_STORE })
  } catch (e) {
    return photoErrorResponse(e, 'tours/[id]/photos')
  }
}
