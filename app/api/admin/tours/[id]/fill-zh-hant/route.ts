import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { NO_STORE, forbidden, unauthorized } from '@/lib/quotes/admin-http'
import { fillZhHantFromZh } from '@/lib/tours/admin-store'
import { UUID_RE, notFound, tourErrorResponse } from '@/lib/tours/admin-http'

// "Fill zh-Hant from zh" (Phase 93, plan 93-07; D-24): converts the saved Simplified Chinese content with
// opencc-js (cn -> twp) and stores it as zh-hant, completeness recomputed. 409 ZH_INCOMPLETE while zh is incomplete.
// No body is read. Guard order: admin session (401 / 403) -> id (404) -> store.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()

  try {
    const result = await fillZhHantFromZh(id)
    revalidatePath('/[locale]', 'layout')
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return tourErrorResponse(e, 'tours/fill-zh-hant')
  }
}
