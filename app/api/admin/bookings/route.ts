import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const bookingPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  operator_notes: z.string().max(2000).optional(),
}).refine(d => d.status !== undefined || d.operator_notes !== undefined, {
  message: 'At least one of status or operator_notes must be provided',
})

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

export async function PATCH(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = bookingPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  if (parsed.data.status !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', parsed.data.id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const allowed = VALID_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${parsed.data.status}'` },
        { status: 422 }
      )
    }
  }

  const updatePayload: Record<string, string> = {}
  if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status
  if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes

  const { error: dbError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', parsed.data.id)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
