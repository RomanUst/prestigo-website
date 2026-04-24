import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const promoPutSchema = z.object({
  active: z.boolean(),
  regularPriceEur: z.coerce.number().positive(),
  promoPriceEur: z.coerce.number().positive(),
})

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()

  const { data, error: dbError } = await supabase
    .from('pricing_globals')
    .select('airport_promo_active, airport_regular_price_eur, airport_promo_price_eur')
    .eq('id', 1)
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  return NextResponse.json({
    active: Boolean(data.airport_promo_active),
    regularPriceEur: Number(data.airport_regular_price_eur),
    promoPriceEur: Number(data.airport_promo_price_eur),
  })
}

export async function PUT(request: Request) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = promoPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  if (parsed.data.promoPriceEur > parsed.data.regularPriceEur) {
    return NextResponse.json(
      { error: 'Promo price must not exceed regular price.' },
      { status: 422 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const { error: dbError } = await supabase
    .from('pricing_globals')
    .update({
      airport_promo_active: parsed.data.active,
      airport_regular_price_eur: parsed.data.regularPriceEur,
      airport_promo_price_eur: parsed.data.promoPriceEur,
    })
    .eq('id', 1)

  if (dbError) {
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  revalidatePath('/services/airport-transfer')
  revalidatePath('/')
  revalidatePath('/services')

  return NextResponse.json({ ok: true })
}
