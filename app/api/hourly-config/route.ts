import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('pricing_globals')
    .select('hourly_min_hours, hourly_max_hours')
    .eq('id', 1)
    .single()

  if (error || !data) {
    // D-02: never block the booking wizard — always return a usable range.
    return NextResponse.json({ min: 2, max: 8 })
  }

  return NextResponse.json({
    min: Number(data.hourly_min_hours),
    max: Number(data.hourly_max_hours),
  })
}
