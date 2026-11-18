import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { UUID_RE, invalidPayload, notFound } from '@/lib/tours/admin-http'
import { mintTourPhotoUpload, photoErrorResponse, tourPhotoSignSchema } from '@/lib/tours/admin-photos'

// Signed upload URL for a tour photo (Phase 93, plan 93-08; TRIP-02, D-15).
//
// The browser uploads straight to the tour-photos bucket (a function body is capped at 4.5 MB on Vercel). The server
// decides the storage path (tours/<tourId>/<uuid>.<ext>) and the extension comes from the declared content type
// (jpeg / png / webp / avif only), never from a client file name. SVG, HTML and files over 8 MB are refused here, and
// the bucket repeats both rules. Nothing is written to the database; the photo row is registered afterwards.
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
  const parsed = tourPhotoSignSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const upload = await mintTourPhotoUpload(id, parsed.data)
    return NextResponse.json(upload, { headers: NO_STORE })
  } catch (e) {
    return photoErrorResponse(e, 'tours/[id]/photos/sign')
  }
}
