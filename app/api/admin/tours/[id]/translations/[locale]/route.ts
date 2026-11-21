import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { tourTranslationSchema } from '@/lib/tours/admin-schemas'
import { saveTourTranslation } from '@/lib/tours/admin-store'
import { UUID_RE, invalidPayload, isAppLocale, notFound, tourErrorResponse } from '@/lib/tours/admin-http'

// Saves the content of one locale of a tour (Phase 93, plan 93-07; TRIP-05; D-08, D-23).
//
//   PUT { title, short_description, ..., faq }  -> { translation, complete, missing, leak }
//
// is_complete is computed by the server with isLocaleComplete; a body that carries it is a 400 (strict schema).
// Guard order: admin session (401 / 403) -> tour id and locale (404) -> body cap (413) -> JSON (400) -> schema (400).

const MAX_BODY_BYTES = 64_000

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; locale: string }> }) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id, locale } = await params
  if (!UUID_RE.test(id) || !isAppLocale(locale)) return notFound()

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig
  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = tourTranslationSchema.safeParse(body.json)
  if (!parsed.success) return invalidPayload(parsed.error.flatten())

  try {
    const result = await saveTourTranslation(id, locale, parsed.data)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours/translations')
  }
}
