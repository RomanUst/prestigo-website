import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { getDriverSession } from '@/lib/driver-cabinet/auth'
import { pushConfigured } from '@/lib/driver-cabinet/push'

/**
 * Phase 94 plan 94-05 (DCAB-12; D-09): a signed-in driver stores (POST) or removes (DELETE) the push subscription of
 * the browser they are using. driver_id always comes from the session, never from the body; DELETE is filtered by it.
 * The endpoint is attacker-controllable: https only, bounded length, and the server only ever sends encrypted payloads
 * to it through web-push. Never log the endpoint or the keys.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const endpointSchema = z.string().url().startsWith('https://').max(1000)

const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{1,200}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{1,100}={0,2}$/),
  }),
})

const unsubscribeSchema = z.object({ endpoint: endpointSchema })

type Guarded = { response: NextResponse } | { driverId: string; body: unknown }

async function guard(request: Request): Promise<Guarded> {
  const tooBig = enforceMaxBody(request, 4_000)
  if (tooBig) return { response: tooBig }

  const { allowed } = await checkRateLimit('/api/driver/cabinet/push', getClientIp(request))
  if (!allowed) {
    return { response: NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE }) }
  }

  const session = await getDriverSession()
  if (!session) {
    return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE }) }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { response: NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE }) }
  }
  return { driverId: session.driverId, body }
}

export async function POST(request: Request) {
  const guarded = await guard(request)
  if ('response' in guarded) return guarded.response

  const parsed = subscribeSchema.safeParse(guarded.body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, headers: NO_STORE })
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: 'push_not_configured' }, { status: 503, headers: NO_STORE })
  }

  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.from('driver_push_subscriptions').upsert(
    {
      driver_id: guarded.driverId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

export async function DELETE(request: Request) {
  const guarded = await guard(request)
  if ('response' in guarded) return guarded.response

  const parsed = unsubscribeSchema.safeParse(guarded.body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, headers: NO_STORE })
  }

  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('driver_push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('driver_id', guarded.driverId)
  if (error) {
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
