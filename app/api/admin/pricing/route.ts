import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const pricingConfigSchema = z.object({
  vehicle_class: z.string(),
  rate_per_km: z.number().positive(),
  hourly_rate: z.number().positive(),
  daily_rate: z.number().positive(),
  min_fare: z.number().min(0),
})

const pricingPutSchema = z.object({
  config: z.array(pricingConfigSchema),
  globals: z.object({
    airport_fee: z.number().min(0),
    night_coefficient: z.number().positive(),
    holiday_coefficient: z.number().positive(),
    extra_child_seat: z.number().min(0),
    extra_meet_greet: z.number().min(0),
    extra_luggage: z.number().min(0),
    return_discount_percent: z.number().min(0).max(100),
    holiday_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  }),
})

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()

  const [configResult, globalsResult] = await Promise.all([
    supabase.from('pricing_config').select('*'),
    supabase.from('pricing_globals').select('*').eq('id', 1).single(),
  ])

  return NextResponse.json({
    config: configResult.data,
    globals: globalsResult.data,
  })
}

export async function PUT(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = pricingPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const [configResult, globalsResult] = await Promise.all([
    supabase.from('pricing_config').upsert(parsed.data.config),
    supabase.from('pricing_globals').upsert(
      { id: 1, ...parsed.data.globals },
      { onConflict: 'id' }
    ),
  ])

  if (configResult.error || globalsResult.error) {
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  revalidateTag('pricing-config', 'max')
  return NextResponse.json({ ok: true })
}
