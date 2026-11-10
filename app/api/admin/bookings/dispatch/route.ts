import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Admin-only range read for the dispatch board and calendar (DISP-01).
// Reads through the existing admin_search_bookings RPC; no new SQL.

const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE_SIZE = 100

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

  const searchParams = new URL(request.url).searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const search = searchParams.get('search')
  const tripType = searchParams.get('tripType')

  const supabase = createSupabaseServiceClient()

  const { data, error: dbError } = await supabase.rpc('admin_search_bookings', {
    p_query: search ? search.trim().slice(0, 100) : null,
    p_start_date: startDate,
    p_end_date: endDate,
    p_trip_type: tripType || null,
    p_status: null,
    p_sort: 'pickup_asc',
    p_offset: 0,
    p_limit: PAGE_SIZE,
  })

  if (dbError) {
    console.error('[admin/bookings/dispatch.GET] RPC failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500, headers: NO_STORE })
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  const bookings = row?.rows ?? []
  const total = row?.total_count != null ? Number(row.total_count) : 0

  return NextResponse.json(
    { bookings, truncated: total > bookings.length },
    { headers: NO_STORE },
  )
}
