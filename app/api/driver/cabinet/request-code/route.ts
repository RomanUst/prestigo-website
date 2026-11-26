import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody, safeEmail } from '@/lib/request-guards'
import { sendDriverLoginCodeEmail } from '@/lib/email'
import { issueLoginCode, normalizeDriverEmail, sha256Hex } from '@/lib/driver-cabinet/auth'

/**
 * Phase 94 plan 94-01 (DCAB-01, DCAB-13; D-05, D-06): an invited driver asks for a 6-digit sign-in code.
 *
 * Every well-formed email gets the identical 200 { ok: true }: an unknown, not-invited or disabled address creates no
 * row and sends no email, and the email is sent inside after() so the answer time does not depend on whether the
 * address exists. Two fail-closed limits (per IP, and per hashed address to bound mail bombing of one inbox). The
 * address is never logged. No email dedup log: it would suppress "Send a new code" for 10 minutes.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const bodySchema = z.object({ email: z.string().trim().pipe(safeEmail(254)) })

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const ip = await checkRateLimit('/api/driver/cabinet/request-code', getClientIp(request), { failClosed: true })
  if (!ip.allowed) {
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
    return NextResponse.json({ error: 'invalid_email' }, { status: 400, headers: NO_STORE })
  }
  const email = normalizeDriverEmail(parsed.data.email)

  const perEmail = await checkRateLimit('/api/driver/cabinet/request-code#email', sha256Hex(email), { failClosed: true })
  if (!perEmail.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  }

  const issued = await issueLoginCode(createSupabaseServiceClient(), email)
  if (issued) {
    after(async () => {
      await sendDriverLoginCodeEmail({ to: issued.to, code: issued.code })
    })
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
