import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = new URL(request.url).searchParams

  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const tripType = searchParams.get('tripType')
  const search = searchParams.get('search')

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('bookings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (startDate) query = query.gte('pickup_date', startDate)
  if (endDate) query = query.lte('pickup_date', endDate)
  if (tripType) query = query.eq('trip_type', tripType)
  if (search) {
    // Strip characters that have structural meaning in PostgREST filter expressions
    // before interpolating into the .or() string.
    const safeSearch = search.replace(/[^a-zA-Z0-9 \-]/g, '').slice(0, 100)
    if (safeSearch) {
      query = query.or(
        `client_first_name.ilike.%${safeSearch}%,client_last_name.ilike.%${safeSearch}%,booking_reference.ilike.%${safeSearch}%`
      )
    }
  }

  query = query.range(page * limit, page * limit + limit - 1)

  const { data, count, error: dbError } = await query

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })

  return NextResponse.json({ bookings: data, total: count ?? 0, page, limit })
}
