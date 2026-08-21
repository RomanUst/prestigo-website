import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse, after } from 'next/server'
import { pushGnetStatus, prestigoToGnetStatus } from '@/lib/gnet-client'
import { z } from 'zod'
import { generateBookingReference } from '@/lib/booking-reference'
import { eurToCzk, czkToEur } from '@/lib/currency'
import { computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeExtrasTotal } from '@/lib/extras'
import { getPricingConfig } from '@/lib/pricing-config'
import { dateDiffDays } from '@/lib/pricing'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail, sendStatusCancelledEmail, sendPostTripEmail, sendBookingChangedEmail, type BookingChangeEntry } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'

// VALID_TRANSITIONS is the canonical map from lib/booking-transitions.ts (the
// same source assign/route.ts imports and BookingsTable's UI_TRANSITIONS derives
// from). Previously this route kept a drifted inline copy whose `en_route` entry
// lacked `completed`, so the admin dropdown offered en_route → Completed but the
// API always 422'd it (WR-01). Importing the canonical map keeps API and UI in sync.

// Whitelist for GET's `status` filter param — bound as p_status to the
// admin_search_bookings RPC. Only known status strings are accepted; anything
// else is treated as "no filter" (D-08).
const KNOWN_STATUSES = new Set([
  'unpaid',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'assigned',
  'en_route',
  'on_location',
])

// Single-line PII fields: block CRLF to prevent header injection in email subjects.
// Hoisted above bookingPatchSchema (originally defined later, near manualBookingSchema)
// so it can be reused by the cheap trip-field edit fields below.
const NO_CRLF = /^[^\r\n]*$/

// Cheap trip-field edits (AEDIT-01, AEDIT-04) — Phase 63 Plan 02. These are the
// fields the PATCH trip-edit branch diffs/audits/emails; kept as a single source
// of truth for the schema, the .refine() presence check, and buildFieldChanges().
const TRIP_EDIT_FIELDS = [
  'pickup_date',
  'pickup_time',
  'client_first_name',
  'client_last_name',
  'client_email',
  'client_phone',
  'flight_number',
] as const

type TripEditField = typeof TRIP_EDIT_FIELDS[number]

const bookingPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    'unpaid',
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location',
  ]).optional(),
  operator_notes: z.string().max(2000).optional(),
  // Driver fee (manual entry). null clears it; used in the driver assignment email.
  driver_price_czk: z.number().int().min(0).max(1_000_000).nullable().optional(),
  // Cheap trip-field edits (AEDIT-01, AEDIT-04)
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  client_first_name: z.string().min(1).max(100).regex(NO_CRLF).optional(),
  client_last_name: z.string().min(1).max(100).regex(NO_CRLF).optional(),
  client_email: z.string().email().max(200).regex(NO_CRLF).optional(),
  client_phone: z.string().min(1).max(50).regex(NO_CRLF).optional(),
  flight_number: z.string().max(20).regex(NO_CRLF).optional(),
  // Per-save "notify client" toggle (D-08) — AND-gated with notification_flags.booking_changed.
  notify_client: z.boolean().optional(),
}).refine(
  d => d.status !== undefined || d.operator_notes !== undefined || d.driver_price_czk !== undefined
    || TRIP_EDIT_FIELDS.some(field => d[field] !== undefined),
  { message: 'At least one of status, operator_notes, driver_price_czk, or a trip field must be provided' },
)

const TRIP_EDIT_FIELD_LABELS: Record<TripEditField, string> = {
  pickup_date: 'Pickup date',
  pickup_time: 'Pickup time',
  client_first_name: 'First name',
  client_last_name: 'Last name',
  client_email: 'Email',
  client_phone: 'Phone',
  flight_number: 'Flight number',
}

/**
 * Diffs the current booking row against the incoming trip-field patch,
 * skipping any field whose new value equals the current value (no-op edit).
 * Returns both the client-email-ready `entries` (human labels + display
 * strings) and the DB-ready `auditRows` (raw old/new values for
 * booking_edit_audit_log).
 */
function buildFieldChanges(
  current: Record<string, unknown>,
  patch: Partial<Record<TripEditField, string>>,
): {
  entries: BookingChangeEntry[]
  auditRows: Array<{ field: string; old_value: string | null; new_value: string | null }>
} {
  const entries: BookingChangeEntry[] = []
  const auditRows: Array<{ field: string; old_value: string | null; new_value: string | null }> = []

  for (const field of TRIP_EDIT_FIELDS) {
    const newValue = patch[field]
    if (newValue === undefined) continue

    const oldValueRaw = current[field]
    const oldValueDisplay = oldValueRaw === null || oldValueRaw === undefined ? '' : String(oldValueRaw)

    if (oldValueDisplay === newValue) continue // no-op edit — skip

    entries.push({
      field,
      label: TRIP_EDIT_FIELD_LABELS[field],
      oldValue: oldValueDisplay,
      newValue,
    })
    auditRows.push({
      field,
      old_value: oldValueRaw === null || oldValueRaw === undefined ? null : String(oldValueRaw),
      new_value: newValue,
    })
  }

  return { entries, auditRows }
}

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
  // D-08: whitelist the status filter — only a known status string is passed
  // through as p_status; anything else (including garbage/unknown values)
  // is treated as "no filter" rather than forwarded to the RPC.
  const rawStatusFilter = searchParams.get('status')
  const statusFilter = rawStatusFilter && KNOWN_STATUSES.has(rawStatusFilter) ? rawStatusFilter : null

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
      p_status:     statusFilter,
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

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = bookingPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload' },
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

    const updatePayload: Record<string, unknown> = {}
    if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status
    if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes
    if (parsed.data.driver_price_czk !== undefined) updatePayload.driver_price_czk = parsed.data.driver_price_czk

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

  // ── Trip-edit branch (Phase 63 Plan 02 — AEDIT-01, AEDIT-04, AEDIT-05, AEDIT-06, FOLLOW-02) ──
  // Cheap-field edit: pickup date/time + passenger/contact + flight number.
  // Runs when any TRIP_EDIT_FIELDS key is present (mutually exclusive with the
  // status branch above — a request never carries both `status` and a trip field).
  const hasTripField = TRIP_EDIT_FIELDS.some(field => parsed.data[field] !== undefined)

  if (hasTripField) {
    const { data: current, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', parsed.data.id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Terminal-status gate — completed/cancelled bookings are final and read-only.
    if (current.status === 'completed' || current.status === 'cancelled') {
      return NextResponse.json(
        { error: `${current.status} bookings are final and cannot be edited` },
        { status: 422 }
      )
    }

    // Build updatePayload field-by-field (mass-assignment guard) — never spread the body.
    const tripUpdatePayload: Record<string, unknown> = {}
    for (const field of TRIP_EDIT_FIELDS) {
      const value = parsed.data[field]
      if (value !== undefined) tripUpdatePayload[field] = value
    }

    // Diff current vs incoming — skips fields whose new value equals current (no-op).
    const { entries, auditRows } = buildFieldChanges(current, parsed.data)

    const { error: dbError } = await supabase
      .from('bookings')
      .update(tripUpdatePayload)
      .eq('id', parsed.data.id)

    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // Notification AND-gate (D-08): per-save notify_client toggle AND the global
    // notification_flags.booking_changed flag must both hold. logEmail runs as the
    // dedup gate BEFORE Resend (AEDIT-05 idempotency) — computed before the audit
    // insert so the inserted rows' `notified` column reflects the real outcome.
    let shouldSend = false
    if (entries.length > 0 && parsed.data.notify_client === true) {
      const { data: flagsRow } = await supabase
        .from('pricing_globals')
        .select('notification_flags')
        .eq('id', 1)
        .single()

      const flags = flagsRow?.notification_flags as Record<string, boolean> | null
      const flagEnabled = !flags || flags['booking_changed'] !== false

      if (flagEnabled) {
        shouldSend = await logEmail({
          bookingId: current.id,
          emailType: 'booking_changed',
          recipient: current.client_email,
        })
      }
    }

    // Per-field audit trail — one row per changed field, sharing one changed_at (D-10).
    if (entries.length > 0) {
      const changedAt = new Date().toISOString()
      const { error: auditError } = await supabase
        .from('booking_edit_audit_log')
        .insert(
          auditRows.map(row => ({
            booking_id: current.id,
            field: row.field,
            old_value: row.old_value,
            new_value: row.new_value,
            operator_id: user?.id ?? null,
            changed_at: changedAt,
            notified: shouldSend,
          }))
        )

      if (auditError) {
        console.error('[admin/bookings.PATCH] audit log insert failed:', auditError.message)
      }
    }

    if (shouldSend) {
      after(() => sendBookingChangedEmail(current, entries).catch(err =>
        console.error('[booking-notify] changed:', err)
      ))
    }

    return NextResponse.json({ ok: true })
  }

  const updatePayload: Record<string, unknown> = {}
  if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes
  if (parsed.data.driver_price_czk !== undefined) updatePayload.driver_price_czk = parsed.data.driver_price_czk

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
  // When true, admin explicitly accepts amount_czk even if it diverges from the
  // server-computed price (e.g. negotiated/discounted fare). Still requires
  // admin auth; the divergence is logged server-side for audit purposes.
  override_price:      z.boolean().optional(),
  // Optional account link — when the booking is created from an account page,
  // this attaches it to that customer's auth user (customer_profiles.user_id).
  // The FK on bookings.user_id enforces it references a real auth.users row.
  user_id:             z.string().uuid().optional(),
})

/** Max diff in CZK between client-sent and server-computed price before rejecting. */
const ADMIN_PRICE_TOLERANCE_CZK = 2

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 20_000)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = manualBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload' },
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
  const priceDiverges = Math.abs(computedTotalCzk - d.amount_czk) > ADMIN_PRICE_TOLERANCE_CZK

  if (priceDiverges && !d.override_price) {
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
  // Use the SERVER-COMPUTED amount by default. Only fall back to the admin's
  // submitted amount when they explicitly opted into override_price — this is
  // logged below for audit purposes since it bypasses the standard pricing rules.
  const authoritativeAmountCzk = priceDiverges ? d.amount_czk : computedTotalCzk
  const amount_eur = priceDiverges ? czkToEur(d.amount_czk) : computedTotalEur

  if (priceDiverges) {
    console.warn('[admin/bookings.POST] price override applied', {
      adminUserId: user?.id,
      submittedCzk: d.amount_czk,
      computedCzk: computedTotalCzk,
    })
  }

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
    user_id:             d.user_id ?? null,
    operator_notes:      priceDiverges
      ? `Price manually overridden by admin: ${authoritativeAmountCzk} CZK (standard rate would be ${computedTotalCzk} CZK).`
      : null,
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
