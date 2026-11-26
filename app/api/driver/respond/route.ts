import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { respondToOffer } from '@/lib/driver-offer'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Phase 94 (94-03, D-15): thin adapter over respondToOffer. The contract is unchanged: uniform invalid_token for
// unknown / used / expired tokens, 'used' on a lost race, 200 { ok: true } otherwise. The accepted-trip email and the
// decline notice run in after() through the shared effects closure.

const respondSchema = z.object({
  token: z.string().uuid(),
  action: z.enum(['accepted', 'declined']),
})

export async function POST(request: Request) {
  const { allowed } = await checkRateLimit('/api/driver/respond', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const { token, action } = parsed.data
  const supabase = createSupabaseServiceClient()

  const result = await respondToOffer(supabase, { action, caller: { kind: 'token', token } })
  if (!result.ok) {
    // not_available is session-only; the token path answers invalid_token or used.
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // Fire-and-forget inside after(): a failure here never changes the response (D-21).
  after(() => result.runEffects())

  return NextResponse.json({ ok: true })
}
