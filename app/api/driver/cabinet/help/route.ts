import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { getDriverSession } from '@/lib/driver-cabinet/auth'
import { driverHelpWidgetEnv } from '@/lib/driver-help-inbox'
import { buildDriverWidgetConfig } from '@/lib/chatwoot-identity'

/**
 * Phase 94 plan 94-12 (DCAB-05; D-13, T-94-54, T-94-55): session-gated Chatwoot identity for the cabinet "Chat with
 * the office" row. Same widget config as the trip help route, but the driver comes from the session cookie only: the
 * request body is never read, so a driver id in it cannot mint an identity for someone else. The conversation
 * reference is the fixed DRIVER-CABINET (no booking). Never log the name, the identifier or the HMAC.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/driver/cabinet/help', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE })
  }

  const session = await getDriverSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const supabase = createSupabaseServiceClient()
  const { data } = await supabase.from('drivers').select('name').eq('id', session.driverId).maybeSingle()
  const driverName = (data as { name: string | null } | null)?.name ?? null

  const config = buildDriverWidgetConfig({
    ...driverHelpWidgetEnv(),
    driverId: session.driverId,
    driverName,
    bookingReference: 'DRIVER-CABINET',
  })

  return NextResponse.json(config, { headers: NO_STORE })
}
