import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { tourSettingsSchema } from '@/lib/tours/admin-schemas'
import { readTourSettings, updateTourSettings } from '@/lib/tours/admin-store'
import { invalidPayload, tourErrorResponse } from '@/lib/tours/admin-http'

// The global tour settings (Phase 93, plan 93-07; TRIP-03; D-02, D-12, D-22): extra-hour prices E/S/V, free-cancellation
// hours (0..72) and pickup radius in km (1..50, step 0.5), edited once for every tour.
//
//   GET    the singleton row (numbers, not strings)
//   PATCH  only the sent fields -> { settings }
//
// Bookings already made keep their stored snapshot (D-12); nothing here touches bookings.
// Guard order: admin session (401 / 403) -> body cap (413) -> JSON (400) -> strict schema (400) -> store.

const MAX_BODY_BYTES = 2_000

export async function GET() {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  try {
    return NextResponse.json(await readTourSettings(), { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tour-settings')
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourSettingsSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const settings = await updateTourSettings(parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json({ settings }, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tour-settings')
  }
}
