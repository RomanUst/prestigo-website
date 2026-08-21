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

// Max diff in CZK between client-sent and server-computed price before rejecting.
// Hoisted above bookingPatchSchema/manualBookingSchema (originally defined only
// near the POST handler) — Phase 63 Plan 03 reuses this exact constant for the
// PATCH price-affecting sub-branch. Declared ONCE; both POST and PATCH import it
// from this single top-level declaration (do NOT redefine a second tolerance).
const ADMIN_PRICE_TOLERANCE_CZK = 2

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

// Price-affecting trip-field edits (AEDIT-02, AEDIT-03, AEDIT-07) — Phase 63
// Plan 03. Presence of ANY of these triggers the server-side recompute +
// tolerance + override sub-branch (ported from the POST handler's
// recompute+override block). distance_km is client-supplied (from the
// admin UI's /api/calculate-price round trip) and trusted only at the price
// level — see Pitfall 2 in 63-RESEARCH.md.
const PRICE_EDIT_FIELDS = [
  'vehicle_class',
  'origin_address',
  'destination_address',
  'distance_km',
] as const

type PriceEditField = typeof PRICE_EDIT_FIELDS[number]

const PRICE_EDIT_FIELD_LABELS: Record<PriceEditField, string> = {
  vehicle_class: 'Vehicle class',
  origin_address: 'Pickup address',
  destination_address: 'Drop-off address',
  distance_km: 'Distance (km)',
}

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
  // Price-affecting trip-field edits (AEDIT-02, AEDIT-03, AEDIT-07) — Phase 63 Plan 03.
  vehicle_class: z.enum(['business', 'first_class', 'business_van']).optional(),
  origin_address: z.string().min(1).max(500).optional(),
  destination_address: z.string().max(500).optional(),
  origin_lat: z.number().optional(),
  origin_lng: z.number().optional(),
  destination_lat: z.number().optional(),
  destination_lng: z.number().optional(),
  distance_km: z.number().nullable().optional(),
  // Operator's reviewed/submitted amount — REQUIRED (see second .refine below)
  // whenever a price-affecting field is present, so the server always has
  // something to tolerance-check against (mirrors manualBookingSchema).
  amount_czk: z.number().int().positive().optional(),
  // When true, admin explicitly accepts amount_czk even if it diverges from the
  // server-computed price. Still requires admin auth; divergence is logged
  // server-side for audit purposes (mirrors POST handler's override_price).
  override_price: z.boolean().optional(),
}).refine(
  d => d.status !== undefined || d.operator_notes !== undefined || d.driver_price_czk !== undefined
    || TRIP_EDIT_FIELDS.some(field => d[field] !== undefined)
    || PRICE_EDIT_FIELDS.some(field => d[field] !== undefined),
  { message: 'At least one of status, operator_notes, driver_price_czk, or a trip field must be provided' },
).refine(
  d => {
    const priceFieldPresent = PRICE_EDIT_FIELDS.some(field => d[field] !== undefined)
    return !priceFieldPresent || d.amount_czk !== undefined
  },
  { message: 'amount_czk is required when vehicle_class, origin_address, destination_address, or distance_km is provided' },
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
 * Diffs the current booking row against an incoming patch for a given field
 * set, skipping any field whose new value equals the current value (no-op
 * edit). Shared by buildFieldChanges() (cheap trip fields, Plan 02) and the
 * price-affecting sub-branch (vehicle_class/origin_address/destination_address/
 * distance_km, Plan 03) so both diff paths stay byte-identical in shape.
 * Returns both the client-email-ready `entries` (human labels + display
 * strings) and the DB-ready `auditRows` (raw old/new values for
 * booking_edit_audit_log).
 */
function diffFields<F extends string>(
  current: Record<string, unknown>,
  patch: Partial<Record<F, unknown>>,
  fields: readonly F[],
  labels: Record<F, string>,
): {
  entries: BookingChangeEntry[]
  auditRows: Array<{ field: string; old_value: string | null; new_value: string | null }>
} {
  const entries: BookingChangeEntry[] = []
  const auditRows: Array<{ field: string; old_value: string | null; new_value: string | null }> = []

  for (const field of fields) {
    const newValue = patch[field]
    if (newValue === undefined) continue

    const oldValueRaw = current[field]
    const oldValueDisplay = oldValueRaw === null || oldValueRaw === undefined ? '' : String(oldValueRaw)
    const newValueDisplay = String(newValue)

    if (oldValueDisplay === newValueDisplay) continue // no-op edit — skip

    entries.push({
      field,
      label: labels[field],
      oldValue: oldValueDisplay,
      newValue: newValueDisplay,
    })
    auditRows.push({
      field,
      old_value: oldValueRaw === null || oldValueRaw === undefined ? null : String(oldValueRaw),
      new_value: newValueDisplay,
    })
  }

  return { entries, auditRows }
}

/** Cheap trip-field diff (AEDIT-01, AEDIT-04) — thin wrapper over diffFields(). */
function buildFieldChanges(
  current: Record<string, unknown>,
  patch: Partial<Record<TripEditField, string>>,
): {
  entries: BookingChangeEntry[]
  auditRows: Array<{ field: string; old_value: string | null; new_value: string | null }>
} {
  return diffFields(current, patch, TRIP_EDIT_FIELDS, TRIP_EDIT_FIELD_LABELS)
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
  // Extended by Plan 03 (AEDIT-02, AEDIT-03, AEDIT-07) with a price-affecting
  // sub-branch: vehicle_class / origin_address / destination_address / distance_km.
  // Runs when any TRIP_EDIT_FIELDS or PRICE_EDIT_FIELDS key is present (mutually
  // exclusive with the status branch above — a request never carries both
  // `status` and a trip field).
  const hasCheapField = TRIP_EDIT_FIELDS.some(field => parsed.data[field] !== undefined)
  const hasPriceField = PRICE_EDIT_FIELDS.some(field => parsed.data[field] !== undefined)
  const hasTripField = hasCheapField || hasPriceField

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
    const { entries: cheapEntries, auditRows: cheapAuditRows } = buildFieldChanges(current, parsed.data)

    // ── Price-affecting sub-branch (Phase 63 Plan 03 — AEDIT-02, AEDIT-03, AEDIT-07) ──
    // Server NEVER trusts a client-supplied amount_czk. Recompute from
    // pricing_config (ported verbatim from the POST handler's recompute+
    // override block, lines ~547-641), tolerance-check, accept the operator's
    // amount only via explicit override_price. distance_km is trusted only at
    // the price level (Pitfall 2) — no second geocode call is made here.
    let priceEntries: BookingChangeEntry[] = []
    let priceAuditRows: Array<{ field: string; old_value: string | null; new_value: string | null }> = []

    if (hasPriceField) {
      let rates
      try {
        rates = await getPricingConfig()
      } catch (err) {
        console.error('[admin/bookings.PATCH] failed to load pricing config:', err)
        return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
      }

      // Effective trip inputs: submitted fields overlaid on the current row.
      const effectiveVehicleClass = parsed.data.vehicle_class ?? current.vehicle_class
      const effectiveDistanceKm = parsed.data.distance_km !== undefined ? parsed.data.distance_km : current.distance_km
      const effectiveTripType = current.trip_type as 'transfer' | 'hourly' | 'daily'
      const effectivePickupDate = (parsed.data.pickup_date ?? current.pickup_date) as string
      const effectivePickupTime = (parsed.data.pickup_time ?? current.pickup_time) as string | null
      const effectiveReturnDate = current.return_date as string | null
      const effectiveIsAirport = Boolean(current.is_airport)
      const effectiveHours = (current.hours as number | null) ?? 2

      if (effectiveTripType === 'transfer' && (effectiveDistanceKm === null || effectiveDistanceKm === undefined || effectiveDistanceKm <= 0)) {
        return NextResponse.json(
          { error: 'distance_km is required and must be positive for transfer trips' },
          { status: 400 }
        )
      }

      const days = effectiveReturnDate ? dateDiffDays(effectivePickupDate, effectiveReturnDate) : 1

      const outboundLegEur = computeOutboundLegTotal(
        effectiveVehicleClass,
        effectiveDistanceKm ?? null,
        effectiveHours,
        days,
        effectiveTripType,
        effectivePickupDate,
        effectivePickupTime,
        effectiveIsAirport,
        rates,
      )

      const extrasEur = computeExtrasTotal(
        {
          infantSeat: false,
          childSeat: Boolean(current.extra_child_seat),
          boosterSeat: false,
          meetAndGreet: Boolean(current.extra_meet_greet),
          extraLuggage: Boolean(current.extra_luggage),
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
      // amount_czk is guaranteed present by the schema's second .refine() whenever
      // a PRICE_EDIT_FIELDS key is set.
      const submittedAmountCzk = parsed.data.amount_czk as number
      const priceDiverges = Math.abs(computedTotalCzk - submittedAmountCzk) > ADMIN_PRICE_TOLERANCE_CZK

      if (priceDiverges && !parsed.data.override_price) {
        return NextResponse.json(
          {
            error: 'Price mismatch — server recompute diverges from submitted amount',
            submittedCzk: submittedAmountCzk,
            computedCzk: computedTotalCzk,
          },
          { status: 422 }
        )
      }

      // Authoritative amount = recompute unless the operator explicitly overrode it.
      const authoritativeAmountCzk = priceDiverges ? submittedAmountCzk : computedTotalCzk
      const amount_eur = priceDiverges ? czkToEur(submittedAmountCzk) : computedTotalEur

      // Raw price-affecting fields (mass-assignment guard — never spread the body).
      if (parsed.data.vehicle_class !== undefined) tripUpdatePayload.vehicle_class = parsed.data.vehicle_class
      if (parsed.data.origin_address !== undefined) tripUpdatePayload.origin_address = parsed.data.origin_address
      if (parsed.data.destination_address !== undefined) tripUpdatePayload.destination_address = parsed.data.destination_address
      if (parsed.data.origin_lat !== undefined) tripUpdatePayload.origin_lat = parsed.data.origin_lat
      if (parsed.data.origin_lng !== undefined) tripUpdatePayload.origin_lng = parsed.data.origin_lng
      if (parsed.data.destination_lat !== undefined) tripUpdatePayload.destination_lat = parsed.data.destination_lat
      if (parsed.data.destination_lng !== undefined) tripUpdatePayload.destination_lng = parsed.data.destination_lng
      if (parsed.data.distance_km !== undefined) tripUpdatePayload.distance_km = parsed.data.distance_km
      tripUpdatePayload.amount_czk = authoritativeAmountCzk
      tripUpdatePayload.amount_eur = amount_eur

      if (priceDiverges) {
        // D-05: Phase 63 only RECORDS the new amount — no payment link, no
        // auto-charge, no top-up. The override note is an audit trail, not a
        // collection action.
        console.warn('[admin/bookings.PATCH] price override applied', {
          adminUserId: user?.id,
          bookingId: current.id,
          submittedCzk: submittedAmountCzk,
          computedCzk: computedTotalCzk,
        })
        const overrideNote = `Price manually overridden by admin: ${authoritativeAmountCzk} CZK (standard rate would be ${computedTotalCzk} CZK).`
        tripUpdatePayload.operator_notes = current.operator_notes
          ? `${current.operator_notes}\n${overrideNote}`
          : overrideNote
      }

      // Diff the raw price-affecting fields (vehicle_class/route/distance) using
      // the same shared diffFields() helper as the cheap fields.
      const { entries: rawFieldEntries, auditRows: rawFieldAuditRows } = diffFields(
        current,
        parsed.data,
        PRICE_EDIT_FIELDS,
        PRICE_EDIT_FIELD_LABELS,
      )
      priceEntries = [...rawFieldEntries]
      priceAuditRows = [...rawFieldAuditRows]

      // D-10: the amount itself is always audited/emailed as its own entry
      // whenever it actually changes (recompute or override).
      const oldAmountCzk = current.amount_czk === null || current.amount_czk === undefined
        ? null
        : String(current.amount_czk)
      const newAmountCzk = String(authoritativeAmountCzk)
      if (oldAmountCzk !== newAmountCzk) {
        priceEntries.push({
          field: 'amount_czk',
          label: 'Price (CZK)',
          oldValue: oldAmountCzk ?? '',
          newValue: newAmountCzk,
        })
        priceAuditRows.push({
          field: 'amount_czk',
          old_value: oldAmountCzk,
          new_value: newAmountCzk,
        })
      }
    }

    const entries = [...cheapEntries, ...priceEntries]
    const auditRows = [...cheapAuditRows, ...priceAuditRows]

    // GNet guard: no trip-detail push exists for GNet (lib/gnet-client.ts only
    // pushes status) — trip-field edits on booking_source='gnet' bookings are
    // ALWAYS local-only (persist + audit + optional email), regardless of
    // whether the edit was a cheap field or a price-affecting field. No push
    // call is made here — this is intentionally the absence of a GNet call.

    const { error: dbError } = await supabase
      .from('bookings')
      .update(tripUpdatePayload)
      .eq('id', parsed.data.id)

    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // Post-update view: the notification recipient and email body must reflect the
    // MERGED post-update state, not the stale `current` row. Critical when the edited
    // field IS client_email — otherwise the "your booking changed" notice (and its
    // dedup recipient key) goes to the OLD address and the client never learns.
    const updatedBooking = { ...current, ...tripUpdatePayload }

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
          recipient: updatedBooking.client_email,
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
      after(() => sendBookingChangedEmail(updatedBooking, entries).catch(err =>
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

// ADMIN_PRICE_TOLERANCE_CZK is declared once, near the top of the file
// (Phase 63 Plan 03) — reused unchanged by both this POST handler and the
// PATCH price-affecting sub-branch. Do not redeclare it here.

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
