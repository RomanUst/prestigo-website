import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody, safeEmail } from '@/lib/request-guards'
import {
  DRIVER_SESSION_COOKIE,
  createDriverSession,
  driverSessionCookieOptions,
  verifyLoginCode,
} from '@/lib/driver-cabinet/auth'

/**
 * Phase 94 plan 94-01 (DCAB-01, DCAB-02, DCAB-13; D-05, D-16): exchange an emailed 6-digit code for the driver
 * session cookie. The attempt counter (5 per code), expiry and single use live in consume_driver_login_code under a
 * row lock; the per-IP limit is fail-closed. A fresh token is minted on every sign-in (no session fixation).
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const bodySchema = z.object({
  email: z.string().trim().pipe(safeEmail(254)),
  code: z.string().regex(/^\d{6}$/),
})

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/driver/cabinet/verify', getClientIp(request), { failClosed: true })
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, headers: NO_STORE })
  }

  const supabase = createSupabaseServiceClient()
  const result = await verifyLoginCode(supabase, parsed.data.email, parsed.data.code)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === 'wrong' ? 'wrong_code' : 'code_expired' },
      { status: 400, headers: NO_STORE },
    )
  }

  let session: { token: string }
  try {
    session = await createDriverSession(supabase, result.driverId)
  } catch {
    return NextResponse.json({ error: 'code_expired' }, { status: 400, headers: NO_STORE })
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE })
  response.cookies.set(DRIVER_SESSION_COOKIE, session.token, driverSessionCookieOptions())
  return response
}
