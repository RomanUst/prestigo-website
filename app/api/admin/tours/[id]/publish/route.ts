import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { UUID_RE, invalidPayload, notFound } from '@/lib/tours/admin-http'
import { photoErrorResponse, setTourStatus, tourPublishSchema } from '@/lib/tours/admin-photos'

// Publish / unpublish a tour (Phase 93, plan 93-08; TRIP-05; D-07).
//
//   { action: 'publish' }    setTourStatus runs publishChecklist (lib/tours/publish-checklist.ts) on the stored tour, its
//                            English completeness and its photos; any failure answers 422 CHECKLIST_FAILED with the
//                            failure codes and the status stays. first_published_at is set once and never cleared (it
//                            locks the slug).
//   { action: 'unpublish' }  needs no checklist; the tour goes back to draft and keeps first_published_at.
//
// Both revalidate the locale layout so the site changes without a redeploy.
// Guard order: admin session (401 / 403) -> id (404) -> body cap (413) -> JSON (400) -> strict schema (400) -> store.

const MAX_BODY_BYTES = 500

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
  const parsed = tourPublishSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const tour = await setTourStatus(id, parsed.data.action)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ tour }, { headers: NO_STORE })
  } catch (e) {
    // CHECKLIST_FAILED -> 422 { code, failures }
    return photoErrorResponse(e, 'tours/[id]/publish')
  }
}
