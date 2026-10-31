import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { parsePeriod, b2bStatsSchema } from '@/lib/admin-stats'

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const period = parsePeriod(new URL(request.url).searchParams)
  if (!period.ok) return NextResponse.json({ error: 'Invalid period' }, { status: 400 })

  const supabase = createSupabaseServiceClient()
  const { data, error: rpcError } = await supabase.rpc('stats_b2b', {
    p_from: period.period.from,
    p_to: period.period.to,
  })
  if (rpcError) {
    console.error('[admin/stats/b2b.GET] rpc failed:', rpcError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  const parsed = b2bStatsSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[admin/stats/b2b.GET] unexpected shape')
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }
  return NextResponse.json(parsed.data)
}
