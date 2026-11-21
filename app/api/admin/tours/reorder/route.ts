import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { tourReorderSchema } from '@/lib/tours/admin-schemas'
import { reorderTours } from '@/lib/tours/admin-store'
import { invalidPayload, tourErrorResponse } from '@/lib/tours/admin-http'

// Reorders the tours (Phase 93, plan 93-07; TRIP-05): { ids } is every tour id in the new order, sort_order = index.
// An unknown, missing or duplicate id is a 400.
// Guard order: admin session (401 / 403) -> body cap (413) -> JSON (400) -> strict schema (400) -> store.

const MAX_BODY_BYTES = 12_000

export async function POST(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourReorderSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    await reorderTours(parsed.data.ids)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours/reorder')
  }
}
