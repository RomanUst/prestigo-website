import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { UUID_RE, invalidPayload, notFound } from '@/lib/tours/admin-http'
import { deleteTourPhoto, photoErrorResponse, tourPhotoPatchSchema, updateTourPhoto } from '@/lib/tours/admin-photos'

// One tour photo (Phase 93, plan 93-08; TRIP-02, TRIP-05; D-15).
//
//   PATCH   set the cover (the old cover is cleared, never two covers), move one place up / down (no-op at the ends),
//           edit source / credit text / licence / https source link; answers { photos } in display order
//   DELETE  removes the row, then the Storage object; the next photo becomes the cover when the cover goes; the last
//           photo of a published tour is refused (409 LAST_PHOTO); answers { photos }
//
// Guard order: admin session (401 / 403) -> ids (404) -> body cap (413) -> JSON (400) -> strict schema (400) -> store.

const MAX_BODY_BYTES = 2_000

type Ctx = { params: Promise<{ id: string; photoId: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id, photoId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(photoId)) return notFound()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourPhotoPatchSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const photos = await updateTourPhoto(id, photoId, parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ photos }, { headers: NO_STORE })
  } catch (e) {
    return photoErrorResponse(e, 'tours/[id]/photos/[photoId]')
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id, photoId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(photoId)) return notFound()

  try {
    const photos = await deleteTourPhoto(id, photoId)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ photos }, { headers: NO_STORE })
  } catch (e) {
    return photoErrorResponse(e, 'tours/[id]/photos/[photoId]')
  }
}
