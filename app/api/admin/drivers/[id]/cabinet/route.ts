// Phase 94 plan 94-04 (DCAB-03; D-06, D-18): the operator grants and cuts driver cabinet access.
//
//   invite  -> cabinet_enabled = true, cabinet_invited_at = now(), "your cabinet is ready" email
//   enable  -> cabinet_enabled = true, no email (cabinet_invited_at set only when it was never set)
//   disable -> cabinet_enabled = false, then the driver's sessions, sign-in codes and push subscriptions are deleted
//
// Admin only. Nothing here touches assignments, bookings or the assign flow: a disabled driver can still be
// assigned and the token links in old emails keep working (D-18).

import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { sendDriverCabinetInviteEmail } from '@/lib/email'

const cabinetActionSchema = z.object({
  action: z.enum(['invite', 'enable', 'disable']),
})

interface DriverRow {
  id: string
  name: string
  email: string
  cabinet_enabled: boolean
  cabinet_invited_at: string | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooBig = enforceMaxBody(request, 50_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params  // Next.js 15+ params is a Promise
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const parsed = cabinetActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }
  const { action } = parsed.data

  const supabase = createSupabaseServiceClient()
  const { data: found, error: readError } = await supabase
    .from('drivers')
    .select('id, name, email, cabinet_enabled, cabinet_invited_at')
    .eq('id', id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  const driver = found as DriverRow | null
  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  const nowIso = new Date().toISOString()

  if (action === 'disable') {
    const { error: updateError } = await supabase
      .from('drivers')
      .update({ cabinet_enabled: false })
      .eq('id', id)
    if (updateError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // The session gate also checks the flag on every request; the deletes sign every phone out and drop the
    // stored push endpoints.
    const cleanup = await Promise.all([
      supabase.from('driver_sessions').delete().eq('driver_id', id),
      supabase.from('driver_login_codes').delete().eq('driver_id', id),
      supabase.from('driver_push_subscriptions').delete().eq('driver_id', id),
    ])
    if (cleanup.some((r) => r.error)) {
      return NextResponse.json({ error: 'DB cleanup failed' }, { status: 500 })
    }
    return NextResponse.json({
      driver: { id, cabinet_enabled: false, cabinet_invited_at: driver.cabinet_invited_at },
    })
  }

  const patch: Record<string, unknown> = { cabinet_enabled: true }
  if (action === 'invite' || driver.cabinet_invited_at === null) patch.cabinet_invited_at = nowIso
  const { error: updateError } = await supabase.from('drivers').update(patch).eq('id', id)
  if (updateError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  const invitedAt = (patch.cabinet_invited_at as string | undefined) ?? driver.cabinet_invited_at
  const result = { id, cabinet_enabled: true, cabinet_invited_at: invitedAt }

  if (action === 'enable') return NextResponse.json({ driver: result })

  // invite: the flag is already set, so a failed email is retried with "Resend invite".
  const emailSent = await sendDriverCabinetInviteEmail({ to: driver.email, driverName: driver.name })
  if (!emailSent) return NextResponse.json({ error: 'email_failed', driver: result }, { status: 502 })
  return NextResponse.json({ driver: result, emailSent: true })
}
