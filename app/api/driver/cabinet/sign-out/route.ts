import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  DRIVER_SESSION_COOKIE,
  driverSessionCookieOptions,
  isDriverSessionTokenShape,
  sha256Hex,
} from '@/lib/driver-cabinet/auth'

/**
 * Phase 94 plan 94-12 (DCAB-02; D-05, D-07, T-94-56): end the cabinet session on this phone. The driver_sessions row
 * of this cookie is deleted (other phones keep their own sessions), the session cookie is expired and so is every
 * cw_* Chatwoot cookie, so the next user of a shared phone starts a fresh, unidentified chat (same rule as the
 * customer sign-out, T-77-20). Idempotent: with no cookie, a malformed one or an already deleted session it still
 * answers 200 { ok: true }, and a malformed cookie never reaches the database. Under the CSRF strict-Origin prefix.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const jar = await cookies()
  const raw = jar.get(DRIVER_SESSION_COOKIE)?.value

  if (isDriverSessionTokenShape(raw)) {
    const supabase = createSupabaseServiceClient()
    // Best effort: the cookie below is cleared either way, and an unreachable database must not trap the driver.
    await supabase.from('driver_sessions').delete().eq('token_hash', sha256Hex(raw))
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE })
  response.cookies.set(DRIVER_SESSION_COOKIE, '', { ...driverSessionCookieOptions(), maxAge: 0 })
  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith('cw_')) {
      response.cookies.set(cookie.name, '', { path: '/', maxAge: 0, expires: new Date(0) })
    }
  }
  return response
}
