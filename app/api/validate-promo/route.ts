import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const { allowed } = await checkRateLimit('/api/validate-promo', getClientIp(request))
  if (!allowed) {
    return NextResponse.json(
      { valid: false, error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) {
    return NextResponse.json({ valid: false, error: 'No code provided.' })
  }

  const today = new Date().toISOString().split('T')[0]
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('promo_codes')
    .select('discount_value, max_uses, current_uses')
    .eq('code', code)
    .eq('is_active', true)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .maybeSingle()

  if (error) {
    console.error('validate-promo error:', error)
    return NextResponse.json({ valid: false, error: 'Something went wrong. Please try again.' })
  }

  if (!data) {
    return NextResponse.json({ valid: false, error: 'Code not found, expired, or inactive.' })
  }

  if (data.max_uses !== null && data.current_uses >= data.max_uses) {
    return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' })
  }

  return NextResponse.json({ valid: true, discountPct: Number(data.discount_value) })
}
