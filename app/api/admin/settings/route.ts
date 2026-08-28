import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

const settingsPatchSchema = z
  .object({
    notification_flags: z.record(z.string(), z.boolean()).optional(),
    dispatch_default_horizon: z.enum(['future', 'last_n_days', 'all']).optional(),
    dispatch_horizon_days: z.number().int().min(1).max(365).optional(),
  })
  .refine(
    d =>
      d.notification_flags !== undefined ||
      d.dispatch_default_horizon !== undefined ||
      d.dispatch_horizon_days !== undefined,
    { message: 'At least one settings field must be provided' }
  )

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('pricing_globals')
    .select('notification_flags, dispatch_default_horizon, dispatch_horizon_days')
    .eq('id', 1)
    .single()

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })

  return NextResponse.json({
    notification_flags: data.notification_flags,
    dispatch_default_horizon: data.dispatch_default_horizon,
    dispatch_horizon_days: data.dispatch_horizon_days,
  })
}

export async function PATCH(request: Request) {
  const tooBig = enforceMaxBody(request, 2_048)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = settingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.notification_flags !== undefined) {
    updates.notification_flags = parsed.data.notification_flags
  }
  if (parsed.data.dispatch_default_horizon !== undefined) {
    updates.dispatch_default_horizon = parsed.data.dispatch_default_horizon
  }
  if (parsed.data.dispatch_horizon_days !== undefined) {
    updates.dispatch_horizon_days = parsed.data.dispatch_horizon_days
  }

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase.from('pricing_globals').update(updates).eq('id', 1)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
