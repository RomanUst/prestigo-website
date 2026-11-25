import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { getDriverSession } from '@/lib/driver-cabinet/auth'
import { respondToOffer } from '@/lib/driver-offer'

/**
 * Phase 94 plan 94-03 (DCAB-05, DCAB-08; D-08, D-10): a signed-in driver accepts or declines an offer from the cabinet.
 * The session decides ownership; the assignment id in the URL is only a pointer. A missing, foreign, superseded,
 * answered or closed assignment all answer the same 409 not_available. The cabinet never writes bookings (D-01).
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  action: z.enum(['accepted', 'declined']),
})

export async function POST(request: Request, ctx: { params: Promise<{ assignmentId: string }> }) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/driver/cabinet/offers/respond', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  }

  const session = await getDriverSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const { assignmentId } = await ctx.params
  if (typeof assignmentId !== 'string' || !UUID_RE.test(assignmentId)) {
    return NextResponse.json({ error: 'not_available' }, { status: 409, headers: NO_STORE })
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

  const result = await respondToOffer(createSupabaseServiceClient(), {
    action: parsed.data.action,
    caller: { kind: 'session', driverId: session.driverId, assignmentId },
  })
  if (!result.ok) {
    return NextResponse.json({ error: 'not_available' }, { status: 409, headers: NO_STORE })
  }

  // Fire-and-forget inside after(): a failing email never changes the answer (D-21).
  after(() => result.runEffects())

  return NextResponse.json({ ok: true, assignmentId: result.assignmentId }, { headers: NO_STORE })
}
