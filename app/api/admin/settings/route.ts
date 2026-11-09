import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

// Settings printed on public pages: the terms and FAQ (ISR, 300 s) print the cancellation windows, km, fee and the
// no-show waits; llms.txt and llms-full.txt (3600 s) print the cancellation numbers. New bookings snapshot a saved
// value at once, so the pages are purged on save instead of drifting for one revalidate window (89-REVIEW-wording WR-07).
const PUBLIC_WORDING_KEYS = [
  'cancel_free_km_threshold',
  'cancel_free_hours_short',
  'cancel_free_hours_long',
  'cancel_free_hours_hourly',
  'cancel_fee_percent',
  'noshow_wait_city_min',
  'noshow_wait_airport_min',
] as const

/**
 * Purges the localized terms and FAQ (every locale: app/[locale] is the route, so the dynamic pattern with type
 * 'page' is the path to purge, as the price routes do with '/[locale]') and the two llms route handlers.
 */
function revalidatePublicWording(): void {
  try {
    revalidatePath('/[locale]/terms', 'page')
    revalidatePath('/[locale]/faq', 'page')
    revalidatePath('/llms.txt')
    revalidatePath('/llms-full.txt')
  } catch (err) {
    // The save already succeeded; a failed purge only leaves the pages to their ISR window.
    console.error('admin settings: revalidate failed:', err instanceof Error ? err.message : 'unknown')
  }
}

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
    // Phase 88 (PAYF-05) / Phase 89 (D-17): 'on' opens the flow to every client; same values as the 087 CHECK
    card_flow_mode: z.enum(['off', 'canary', 'on']).optional(),
    // Phase 88 (PAYF-05): canary allowlist, normalised (trimmed, lower-cased) then de-duplicated below
    card_flow_canary_emails: z.array(z.string().trim().toLowerCase().max(254).email()).max(20).optional(),
    // Phase 89 (CANC-01, D-06): cancellation policy numbers; same bounds as the migration 087 CHECKs
    cancel_free_km_threshold: z.number().int().min(1).max(1000).optional(),
    cancel_free_hours_short: z.number().int().min(0).max(72).optional(),
    cancel_free_hours_long: z.number().int().min(0).max(72).optional(),
    cancel_free_hours_hourly: z.number().int().min(0).max(72).optional(),
    cancel_fee_percent: z.number().int().min(1).max(100).optional(),
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
      d.card_flow_canary_emails !== undefined ||
      d.cancel_free_km_threshold !== undefined ||
      d.cancel_free_hours_short !== undefined ||
      d.cancel_free_hours_long !== undefined ||
      d.cancel_free_hours_hourly !== undefined ||
      d.cancel_fee_percent !== undefined,
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
      'notification_flags, dispatch_default_horizon, dispatch_horizon_days, noshow_wait_city_min, noshow_wait_airport_min, payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails, cancel_free_km_threshold, cancel_free_hours_short, cancel_free_hours_long, cancel_free_hours_hourly, cancel_fee_percent'
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
    cancel_free_km_threshold: data.cancel_free_km_threshold,
    cancel_free_hours_short: data.cancel_free_hours_short,
    cancel_free_hours_long: data.cancel_free_hours_long,
    cancel_free_hours_hourly: data.cancel_free_hours_hourly,
    cancel_fee_percent: data.cancel_fee_percent,
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

  // Two-step rule: the schema above is the 400; business rules across fields are 422. When a request
  // carries only one side of a pair, the other side comes from the stored row (WR-06, CANC-01).
  const d = parsed.data
  const hoursPair = [d.cancel_free_hours_short, d.cancel_free_hours_long]
  const waitPair = [d.noshow_wait_city_min, d.noshow_wait_airport_min]
  const needsStored = [hoursPair, waitPair].some(([a, b]) => (a === undefined) !== (b === undefined))

  let stored: Record<string, unknown> = {}
  if (needsStored) {
    const reader = createSupabaseServiceClient()
    const { data: row, error: readError } = await reader
      .from('pricing_globals')
      .select('noshow_wait_city_min, noshow_wait_airport_min, cancel_free_hours_short, cancel_free_hours_long')
      .eq('id', 1)
      .single()
    if (readError || !row) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
    stored = row as Record<string, unknown>
  }
  const num = (v: number | undefined, key: string): number | null => {
    if (v !== undefined) return v
    const s = stored[key]
    return typeof s === 'number' ? s : null
  }

  const shortH = num(d.cancel_free_hours_short, 'cancel_free_hours_short')
  const longH = num(d.cancel_free_hours_long, 'cancel_free_hours_long')
  if (shortH !== null && longH !== null && longH < shortH) {
    return NextResponse.json({ error: 'long_below_short' }, { status: 422 })
  }
  const cityMin = num(d.noshow_wait_city_min, 'noshow_wait_city_min')
  const airportMin = num(d.noshow_wait_airport_min, 'noshow_wait_airport_min')
  if (cityMin !== null && airportMin !== null && airportMin < cityMin) {
    return NextResponse.json({ error: 'airport_below_city' }, { status: 422 })
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

  for (const key of [
    'cancel_free_km_threshold',
    'cancel_free_hours_short',
    'cancel_free_hours_long',
    'cancel_free_hours_hourly',
    'cancel_fee_percent',
  ] as const) {
    if (parsed.data[key] !== undefined) updates[key] = parsed.data[key]
  }

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase.from('pricing_globals').update(updates).eq('id', 1)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  if (PUBLIC_WORDING_KEYS.some((key) => key in updates)) revalidatePublicWording()

  return NextResponse.json({ ok: true })
}
