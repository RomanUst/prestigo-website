import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateBookingReference } from '@/lib/booking-reference'
import { czkToEur } from '@/lib/currency'

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

  const rawPage  = parseInt(searchParams.get('page')  ?? '0', 10)
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10)
  const page  = Math.max(0,   isNaN(rawPage)  ? 0  : rawPage)
  const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const tripType = searchParams.get('tripType')
  const search = searchParams.get('search')

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('bookings')
    .select('*, linked_booking:linked_booking_id(booking_reference)', { count: 'exact' })
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

const manualBookingSchema = z.object({
  trip_type:           z.enum(['transfer', 'hourly', 'daily']),
  pickup_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_time:         z.string().regex(/^\d{2}:\d{2}$/),
  origin_address:      z.string().min(1).max(500),
  destination_address: z.string().max(500).optional(),
  vehicle_class:       z.enum(['business', 'first_class', 'business_van']),
  passengers:          z.number().int().min(1).max(20),
  luggage:             z.number().int().min(0).max(20),
  amount_czk:          z.number().int().positive(),
  client_first_name:   z.string().min(1).max(100),
  client_last_name:    z.string().min(1).max(100),
  client_email:        z.string().email(),
  client_phone:        z.string().min(1).max(50),
  hours:               z.number().int().min(1).max(24).optional(),
  return_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flight_number:       z.string().max(20).optional(),
  terminal:            z.string().max(20).optional(),
  special_requests:    z.string().max(1000).optional(),
  // Extras — populated when booking is created via the wizard
  extra_child_seat:    z.boolean().optional(),
  extra_meet_greet:    z.boolean().optional(),
  extra_luggage:       z.boolean().optional(),
  // Coordinates — populated when addresses were selected via Google Places
  origin_lat:          z.number().nullable().optional(),
  origin_lng:          z.number().nullable().optional(),
  destination_lat:     z.number().nullable().optional(),
  destination_lng:     z.number().nullable().optional(),
  distance_km:         z.number().nullable().optional(),
})

export async function POST(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = manualBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const bookingReference = generateBookingReference()
  const amount_eur = czkToEur(parsed.data.amount_czk)

  const d = parsed.data
  const row = {
    trip_type:           d.trip_type,
    pickup_date:         d.pickup_date,
    pickup_time:         d.pickup_time,
    origin_address:      d.origin_address,
    destination_address: d.destination_address ?? null,
    vehicle_class:       d.vehicle_class,
    passengers:          d.passengers,
    luggage:             d.luggage,
    amount_czk:          d.amount_czk,
    client_first_name:   d.client_first_name,
    client_last_name:    d.client_last_name,
    client_email:        d.client_email,
    client_phone:        d.client_phone,
    hours:               d.hours ?? null,
    return_date:         d.return_date ?? null,
    flight_number:       d.flight_number ?? null,
    terminal:            d.terminal ?? null,
    special_requests:    d.special_requests ?? null,
    extra_child_seat:    d.extra_child_seat ?? false,
    extra_meet_greet:    d.extra_meet_greet ?? false,
    extra_luggage:       d.extra_luggage ?? false,
    origin_lat:          d.origin_lat ?? null,
    origin_lng:          d.origin_lng ?? null,
    destination_lat:     d.destination_lat ?? null,
    destination_lng:     d.destination_lng ?? null,
    distance_km:         d.distance_km ?? null,
    booking_reference:   bookingReference,
    booking_source:      'manual',
    booking_type:        'confirmed',
    payment_intent_id:   null,
    status:              'pending',
    amount_eur,
  }

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('bookings')
    .insert([row])
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })

  return NextResponse.json({ booking: data }, { status: 201 })
}
