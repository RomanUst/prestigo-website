import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth guard
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Extract booking ID from params
  const { id: bookingId } = await params

  const supabase = createSupabaseServiceClient()

  // 3. Query latest assignment with driver join
  const { data } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, status, created_at, drivers(name, email)')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 4. Return assignment (null if no assignment exists)
  return NextResponse.json({ assignment: data })
}
