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
    // D-15: free waiting minutes before a driver may request a no-show (same 1..240 bounds as the
    // migration 084 CHECK)
    noshow_wait_city_min: z.number().int().min(1).max(240).optional(),
    noshow_wait_airport_min: z.number().int().min(1).max(240).optional(),
    // Phase 88 (D-01): hold lead hours; same 6..96 bounds as the migration 085 CHECK
    payment_hold_lead_hours: z.number().int().min(6).max(96).optional(),
    // Phase 88 (PAYF-05): 'on' is rejected here and by the 085 CHECK until Phase 89 opens the flow
    card_flow_mode: z.enum(['off', 'canary']).optional(),
    // Phase 88 (PAYF-05): canary allowlist, normalised (trimmed, lower-cased) then de-duplicated below
    card_flow_canary_emails: z.array(z.string().trim().toLowerCase().max(254).email()).max(20).optional(),
  })
  .refine(
    d =>
      d.notification_flags !== undefined ||
      d.dispatch_default_horizon !== undefined ||
      d.dispatch_horizon_days !== undefined ||
      d.noshow_wait_city_min !== undefined ||
      d.noshow_wait_airport_min !== undefined ||
      d.payment_hold_lead_hours !== undefined ||
      d.card_flow_mode !== undefined ||
      d.card_flow_canary_emails !== undefined,
    { message: 'At least one settings field must be provided' }
  )

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('pricing_globals')
    .select(
      'notification_flags, dispatch_default_horizon, dispatch_horizon_days, noshow_wait_city_min, noshow_wait_airport_min, payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails'
    )
    .eq('id', 1)
    .single()

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })

  return NextResponse.json({
    notification_flags: data.notification_flags,
    dispatch_default_horizon: data.dispatch_default_horizon,
    dispatch_horizon_days: data.dispatch_horizon_days,
    noshow_wait_city_min: data.noshow_wait_city_min,
    noshow_wait_airport_min: data.noshow_wait_airport_min,
    payment_hold_lead_hours: data.payment_hold_lead_hours,
    card_flow_mode: data.card_flow_mode,
    card_flow_canary_emails: data.card_flow_canary_emails,
  })
}

export async function PATCH(request: Request) {
  const tooBig = enforceMaxBody(request, 8_192)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
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
  if (parsed.data.noshow_wait_city_min !== undefined) {
    updates.noshow_wait_city_min = parsed.data.noshow_wait_city_min
  }
  if (parsed.data.noshow_wait_airport_min !== undefined) {
    updates.noshow_wait_airport_min = parsed.data.noshow_wait_airport_min
  }
  if (parsed.data.payment_hold_lead_hours !== undefined) {
    updates.payment_hold_lead_hours = parsed.data.payment_hold_lead_hours
  }
  if (parsed.data.card_flow_mode !== undefined) {
    updates.card_flow_mode = parsed.data.card_flow_mode
  }
  if (parsed.data.card_flow_canary_emails !== undefined) {
    // First-occurrence order, no duplicates (the schema already trimmed and lower-cased each address)
    updates.card_flow_canary_emails = Array.from(new Set(parsed.data.card_flow_canary_emails))
  }

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase.from('pricing_globals').update(updates).eq('id', 1)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
