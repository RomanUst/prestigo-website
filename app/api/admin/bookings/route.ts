import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse, after } from 'next/server'
import { pushGnetStatus, prestigoToGnetStatus } from '@/lib/gnet-client'
import { z } from 'zod'
import { generateBookingReference } from '@/lib/booking-reference'
import { eurToCzk } from '@/lib/currency'
import { computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeExtrasTotal } from '@/lib/extras'
import { getPricingConfig } from '@/lib/pricing-config'
import { dateDiffDays } from '@/lib/pricing'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail, sendStatusCancelledEmail, sendPostTripEmail } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['completed', 'cancelled', 'assigned'],
  assigned:    ['en_route', 'cancelled'],
  en_route:    ['on_location', 'cancelled'],
  on_location: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
}

const bookingPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location',
  ]).optional(),
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

  // LOW-1 mitigation: route the search term through a parameterized RPC
  // (admin_search_bookings) instead of building a PostgREST `.or()` filter
  // from concatenated user input. Postgres binds p_query as a positional
  // parameter, eliminating any chance of filter-expression injection if a
  // future contributor relaxes the input whitelist.
  //
  // We still cap the search string length defensively.
  const boundedSearch = search ? search.trim().slice(0, 100) : null

  const { data, error: dbError } = await supabase
    .rpc('admin_search_bookings', {
      p_query:      boundedSearch,
      p_start_date: startDate ?? null,
      p_end_date:   endDate ?? null,
      p_trip_type:  tripType ?? null,
      p_offset:     page * limit,
      p_limit:      limit,
    })

  if (dbError) {
    console.error('[admin/bookings.GET] RPC failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  // admin_search_bookings returns a single row: { rows: JSONB[], total_count: bigint }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  const bookings = row?.rows ?? []
  const total = row?.total_count != null ? Number(row.total_count) : 0

  return NextResponse.json({ bookings, total, page, limit })
}

export async function PATCH(request: Request) {
  const tooBig = enforceMaxBody(request, 5_000)
  if (tooBig) return tooBig

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
      .select('*')
      .eq('id', parsed.data.id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const previousStatus = current.status
    const allowed = VALID_TRANSITIONS[previousStatus] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${previousStatus}' to '${parsed.data.status}'` },
        { status: 422 }
      )
    }

    const updatePayload: Record<string, string> = {}
    if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status
    if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes

    const { error: dbError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', parsed.data.id)

    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // D-11: Only fire email when status actually changed
    if (previousStatus !== parsed.data.status) {
      // D-12: Check notification_flags from pricing_globals
      const { data: flagsRow } = await supabase
        .from('pricing_globals')
        .select('notification_flags')
        .eq('id', 1)
        .single()

      const flags = flagsRow?.notification_flags as Record<string, boolean> | null

      const statusToFlagKey: Record<string, string> = {
        confirmed: 'confirmed',
        cancelled: 'cancelled',
        completed: 'completed',
      }
      const flagKey = statusToFlagKey[parsed.data.status]

      // If flags is null, treat as all-enabled (per D-12)
      const isEnabled = !flags || flags[flagKey] !== false

      if (flagKey && isEnabled) {
        // D-15: logEmail BEFORE Resend — dedup gate
        const shouldSend = await logEmail({
          bookingId: current.id,
          emailType: `booking_${parsed.data.status}`,
          recipient: current.client_email,
        })

        if (shouldSend) {
          // Use after() so Vercel serverless runtime keeps the promise alive
          // past the response return — void fn() was being killed on response.
          if (parsed.data.status === 'confirmed') {
            after(() => sendStatusConfirmedEmail(current).catch(err =>
              console.error('[booking-notify] confirmed:', err)
            ))
          } else if (parsed.data.status === 'cancelled') {
            after(() => sendStatusCancelledEmail(current).catch(err =>
              console.error('[booking-notify] cancelled:', err)
            ))
          } else if (parsed.data.status === 'completed') {
            after(() => sendPostTripEmail(current).catch(err =>
              console.error('[booking-notify] post-trip:', err)
            ))
          }
        }
      }
    }

    // Phase 41 D-01: Schedule 2h QStash reminder on transition to confirmed
    if (previousStatus !== parsed.data.status && parsed.data.status === 'confirmed') {
      if (current.pickup_utc) {
        after(() => scheduleQStashReminder(current.id, new Date(current.pickup_utc).getTime()))
      }
    }

    // Phase 50 — GNet status push (STATUS-01, STATUS-02, STATUS-03, STATUS-04)
    // Fire-and-forget per D-04; guarded by booking_source per D-03; mapping per D-01.
    if (
      current.booking_source === 'gnet' &&
      previousStatus !== parsed.data.status
    ) {
      const gnetStatus = prestigoToGnetStatus(parsed.data.status)
      if (gnetStatus) {
        after(async () => {
          // D-05: use service client inside after() — session client may be gone
          const svcSupabase = createSupabaseServiceClient()

          // D-02: separate query (not a JOIN) — surgical, isolated
          const { data: gnetRow } = await svcSupabase
            .from('gnet_bookings')
            .select('id, gnet_res_no')
            .eq('booking_id', current.id)
            .single()

          if (!gnetRow) {
            // booking_source === 'gnet' but no gnet_bookings row — log and exit
            console.error('[gnet-status-push] no gnet_bookings row for', current.id)
            return
          }

          // STATUS-01: push the mapped status
          let pushError: string | null = null
          try {
            const totalAmount = Number(current.amount_eur).toFixed(2)
            await pushGnetStatus(gnetRow.gnet_res_no, gnetStatus, totalAmount)
          } catch (err) {
            // STATUS-02: never block admin — swallow and log
            pushError = err instanceof Error ? err.message : String(err)
            console.error('[gnet-status-push] failed', {
              bookingId: current.id,
              gnetResNo: gnetRow.gnet_res_no,
              gnetStatus,
              error: pushError,
            })
          }

          // STATUS-03 + D-05: log outcome regardless of success/failure
          const { error: auditErr } = await svcSupabase
            .from('gnet_bookings')
            .update({
              last_push_status: gnetStatus,
              last_push_error: pushError,
              last_pushed_at: new Date().toISOString(),
            })
            .eq('id', gnetRow.id)

          if (auditErr) {
            console.error('[gnet-status-push] audit update failed', {
              bookingId: current.id,
              gnetResNo: gnetRow.gnet_res_no,
              error: auditErr.message,
            })
          }
        })
      }
    }

    return NextResponse.json({ ok: true })
  }

  const updatePayload: Record<string, string> = {}
  if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes

  const { error: dbError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', parsed.data.id)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

const NO_CRLF = /^[^\r\n]*$/

const manualBookingSchema = z.object({
  trip_type:           z.enum(['transfer', 'hourly', 'daily']),
  pickup_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_time:         z.string().regex(/^\d{2}:\d{2}$/),
  origin_address:      z.string().min(1).max(500),
  destination_address: z.string().max(500).optional(),
  vehicle_class:       z.enum(['business', 'first_class', 'business_van']),
  passengers:          z.number().int().min(1).max(20),
  luggage:             z.number().int().min(0).max(20),
  // amount_czk is client-provided but SERVER ALWAYS RECOMPUTES from pricing_config
  // and rejects with 422 if the client figure diverges by more than ADMIN_PRICE_TOLERANCE_CZK.
  // Prevents a compromised admin session from booking at arbitrary amounts.
  amount_czk:          z.number().int().positive(),
  // Single-line PII fields: block CRLF to prevent header injection in email subjects.
  client_first_name:   z.string().min(1).max(100).regex(NO_CRLF),
  client_last_name:    z.string().min(1).max(100).regex(NO_CRLF),
  client_email:        z.string().email().max(200).regex(NO_CRLF),
  client_phone:        z.string().min(1).max(50).regex(NO_CRLF),
  hours:               z.number().int().min(1).max(24).optional(),
  return_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flight_number:       z.string().max(20).regex(NO_CRLF).optional(),
  terminal:            z.string().max(20).regex(NO_CRLF).optional(),
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
  // Optional airport flag — when true, server applies airport fee in recompute
  is_airport:          z.boolean().optional(),
})

/** Max diff in CZK between client-sent and server-computed price before rejecting. */
const ADMIN_PRICE_TOLERANCE_CZK = 2

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 20_000)
  if (tooBig) return tooBig

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

  const d = parsed.data

  // ── Server-side price recompute (HIGH-3 mitigation) ──
  // Never trust the client-supplied amount_czk, even from an authenticated
  // admin. If an admin session is hijacked (cookie theft, XSS, CSRF bypass),
  // the attacker would otherwise be able to book at arbitrary prices, launder
  // refunds, or corrupt revenue reporting. The server recomputes the fare
  // from pricing_config and rejects any client amount that diverges by more
  // than ADMIN_PRICE_TOLERANCE_CZK.
  let rates
  try {
    rates = await getPricingConfig()
  } catch (err) {
    console.error('[admin/bookings.POST] failed to load pricing config:', err)
    return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
  }

  // Guard inputs required by the trip-type before computing
  if (d.trip_type === 'transfer' && (d.distance_km === null || d.distance_km === undefined || d.distance_km <= 0)) {
    return NextResponse.json(
      { error: 'distance_km is required and must be positive for transfer trips' },
      { status: 400 }
    )
  }
  if (d.trip_type === 'hourly' && (d.hours === null || d.hours === undefined || d.hours <= 0)) {
    return NextResponse.json(
      { error: 'hours is required and must be positive for hourly trips' },
      { status: 400 }
    )
  }
  if (d.trip_type === 'daily' && !d.return_date) {
    return NextResponse.json(
      { error: 'return_date is required for daily trips' },
      { status: 400 }
    )
  }

  const days = d.return_date ? dateDiffDays(d.pickup_date, d.return_date) : 1

  const outboundLegEur = computeOutboundLegTotal(
    d.vehicle_class,
    d.distance_km ?? null,
    d.hours ?? 2,
    days,
    d.trip_type,
    d.pickup_date,
    d.pickup_time,
    d.is_airport ?? false,
    rates,
  )

  const extrasEur = computeExtrasTotal(
    {
      infantSeat: false,
      childSeat: d.extra_child_seat ?? false,
      boosterSeat: false,
      meetAndGreet: d.extra_meet_greet ?? false,
      extraLuggage: d.extra_luggage ?? false,
    },
    {
      infantSeat: 0,
      childSeat: rates.globals.extraChildSeat,
      boosterSeat: 0,
      meetAndGreet: 0,
      extraLuggage: rates.globals.extraLuggage,
    },
  )

  const computedTotalEur = outboundLegEur + extrasEur
  const computedTotalCzk = eurToCzk(computedTotalEur)

  if (Math.abs(computedTotalCzk - d.amount_czk) > ADMIN_PRICE_TOLERANCE_CZK) {
    return NextResponse.json(
      {
        error: 'Price mismatch — server recompute diverges from submitted amount',
        submittedCzk: d.amount_czk,
        computedCzk: computedTotalCzk,
      },
      { status: 422 }
    )
  }

  const bookingReference = generateBookingReference()
  // From here on, use the SERVER-COMPUTED amount, never the client's value.
  const authoritativeAmountCzk = computedTotalCzk
  const amount_eur = computedTotalEur

  const row = {
    trip_type:           d.trip_type,
    pickup_date:         d.pickup_date,
    pickup_time:         d.pickup_time,
    origin_address:      d.origin_address,
    destination_address: d.destination_address ?? null,
    vehicle_class:       d.vehicle_class,
    passengers:          d.passengers,
    luggage:             d.luggage,
    amount_czk:          authoritativeAmountCzk,
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
