import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { generateBookingReference } from '@/lib/booking-reference'
import { eurToCzk, czkToEur } from '@/lib/currency'
import { computeOutboundLegTotal } from '@/lib/server-pricing'
import { computeExtrasTotal } from '@/lib/extras'
import { getPricingConfig } from '@/lib/pricing-config'
import { dateDiffDays } from '@/lib/pricing'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail, sendBookingChangedEmail, sendPaymentRequestEmail, type BookingChangeEntry } from '@/lib/email'
import { advanceBookingStatus, advanceResultToResponse } from '@/lib/booking-status-service'
import { BOOKING_STATUSES } from '@/lib/booking-status'
import { createBookingPaymentLink, deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'
import { haversineDistanceKm, DISTANCE_SANITY_MULTIPLIER } from '@/lib/geo-distance'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import { assertEditablePrecheck, assertQuoteEditAmount, reevaluateAfterEdit } from '@/lib/payments/edit-hook'
import { getPaymentSettings, isPolicyPublic } from '@/lib/payments/config'
import { buildPolicySnapshot, getCancellationPolicy } from '@/lib/cancellation-settings'
import { buildPolicyBlockHtml } from '@/lib/payments/emails/policy-block'
import { attachStops, loadStopsByBookingIds } from '@/lib/booking-stops'
import { LANDING_OFFSETS, pickupFromLanding } from '@/lib/airport-pickup'

// The status change itself (VALID_TRANSITIONS check, write, side effects) lives in
// lib/booking-status-service.ts (Phase 87 D-01). VALID_TRANSITIONS is the canonical
// map from lib/booking-transitions.ts that BookingsTable's UI_TRANSITIONS derives
// from, so API and UI stay in sync (WR-01).

// Whitelist for GET's `status` filter param — bound as p_status to the
// admin_search_bookings RPC. Only known status strings are accepted; anything
// else is treated as "no filter" (D-08).
const KNOWN_STATUSES = new Set<string>(BOOKING_STATUSES)

// Whitelist for GET's `horizon` filter param (DISP-01, D-01, D-02, D-06, D-07).
// Only a known horizon string is accepted; anything else is treated as "no
// override" (never forwarded raw to the resolver below) — mirrors KNOWN_STATUSES.
const KNOWN_HORIZONS = new Set(['future', 'past', 'all', 'last_n_days'])

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
  status: z.enum(BOOKING_STATUSES).optional(),
  // PAYF-02: the status the admin UI saw. A different stored status is a 409, not a silent overwrite.
  expected_status: z.enum(BOOKING_STATUSES).optional(),
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

  // DISP-01/DISP-03: whitelist the horizon filter param — anything not in
  // KNOWN_HORIZONS is treated as "no override" (never forwarded raw).
  const rawHorizon = searchParams.get('horizon')
  const horizon = rawHorizon && KNOWN_HORIZONS.has(rawHorizon) ? rawHorizon : null

  // Horizon → date-range + sort resolution (D-01: server-computed Prague
  // "today", never client-derived). D-07: an explicit manual startDate/endDate
  // takes session precedence over horizon — the horizon branch runs ONLY when
  // BOTH are absent. When either manual bound is present, sort stays
  // 'created_desc' and the manual bound is used as-is (also keeps the KPI
  // fetches, which always pass explicit startDate+endDate, untouched — D-05).
  let resolvedStartDate = startDate ?? null
  let resolvedEndDate = endDate ?? null
  let sort = 'created_desc'
  if (horizon && !startDate && !endDate) {
    const today = getPragueTodayISO()
    if (horizon === 'future') {
      resolvedStartDate = today
      sort = 'pickup_asc'
    } else if (horizon === 'past') {
      resolvedEndDate = shiftIsoDate(today, -1)
      sort = 'pickup_desc'
    } else if (horizon === 'last_n_days') {
      // V5/WR-01: defensive clamp — parseInt failure, non-positive, or
      // out-of-range value falls back to the default 7 (DoS mitigation,
      // T-65-03). The upper bound (3650 days / 10 years) mirrors the
      // persisted-settings max intent (dispatch_horizon_days is capped at
      // 365 by the Zod schema in app/api/admin/settings/route.ts) but is
      // set generously higher here since this is an ad-hoc query param, not
      // a persisted default — the real purpose is keeping shiftIsoDate()'s
      // date arithmetic well within JS's representable Date range
      // (~±100,000,000 days from the epoch), not enforcing a business rule.
      // Without an upper bound, an extreme horizonDays pushes the shifted
      // date past that range, Date becomes invalid, and toISOString() throws
      // an uncaught RangeError instead of the graceful clamp this comment
      // promises.
      const rawDays = parseInt(searchParams.get('horizonDays') ?? '7', 10)
      const days = Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 3650 ? rawDays : 7
      // D-06: end stays OPEN (future-inclusive) — no resolvedEndDate bound.
      resolvedStartDate = shiftIsoDate(today, -days)
      sort = 'pickup_desc'
    } else {
      // 'all' — no date bound, adaptive sort still applies.
      sort = 'pickup_desc'
    }
  }

  // The list asks (hideCancelled=1) for cancelled bookings to be left out of the working queue. They stay in
  // the history: the Past and All segments, a date range that ended before today, a search (a reference or
  // e-mail deep link must still find them) and an explicit status=cancelled. Callers that do not ask (the KPI
  // fetches) get every status as before. The RPC keeps a cancelled booking with a pending fee case.
  const isHistoryView =
    (horizon === 'all' && !startDate && !endDate) ||
    (resolvedEndDate !== null && resolvedEndDate < getPragueTodayISO()) ||
    Boolean(search && search.trim()) ||
    statusFilter === 'cancelled'
  const hideCancelled = searchParams.get('hideCancelled') === '1' && !isHistoryView

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
      p_start_date: resolvedStartDate,
      p_end_date:   resolvedEndDate,
      p_trip_type:  tripType ?? null,
      p_status:     statusFilter,
      p_sort:       sort,
      p_offset:     page * limit,
      p_limit:      limit,
      p_hide_cancelled: hideCancelled,
    })

  if (dbError) {
    console.error('[admin/bookings.GET] RPC failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  // admin_search_bookings returns a single row: { rows: JSONB[], total_count: bigint }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  const rpcRows: Array<{ id: string }> = Array.isArray(row?.rows) ? row.rows : []
  const total = row?.total_count != null ? Number(row.total_count) : 0

  // Phase 91 (STOP-04): every row carries its stops (ordered by position, [] when none) from the one loader.
  // landing_date, landing_time and pickup_offset_min already arrive with the row (select b.*). Stop addresses are
  // client PII: the log carries the error message only.
  let bookings: unknown[]
  try {
    bookings = await attachStops(rpcRows)
  } catch (stopsError) {
    console.error('[admin/bookings.GET] stops read failed:', stopsError instanceof Error ? stopsError.message : 'unknown')
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

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
    // Phase 87 D-01: the status change lives in lib/booking-status-service.ts —
    // this route only parses, authenticates and maps the result to HTTP.
    const patch: { operator_notes?: string; driver_price_czk?: number | null } = {}
    if (parsed.data.operator_notes !== undefined) patch.operator_notes = parsed.data.operator_notes
    if (parsed.data.driver_price_czk !== undefined) patch.driver_price_czk = parsed.data.driver_price_czk

    // 88-REVIEW T5 (C-CR-03): a card-on-file booking is cancelled only through POST /api/admin/bookings/cancel, the
    // payment-aware path (release the hold or refund, D-20 trail). The status select here would cancel it with the
    // hold still live and the recovery link still payable. The row read here is handed to the status service, so
    // the guard costs no extra query.
    let current: Record<string, unknown> | undefined

    // Phase 89 WR-04: a no-show is confirmed only through POST /api/admin/bookings/[id]/no-show, which checks the
    // driver's request and the waiting time and opens the fee case with its evidence. A money-bearing status must
    // not be reachable from a plain status select.
    if (parsed.data.status === 'no_show') {
      return NextResponse.json(
        {
          error: 'use_no_show_route',
          message: 'A no-show is confirmed from the driver request on the booking, after the waiting time.',
        },
        { status: 422 },
      )
    }

    if (parsed.data.status === 'cancelled') {
      const { data: row, error: rowError } = await supabase.from('bookings').select('*').eq('id', parsed.data.id).single()
      if (rowError || !row) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      current = row as Record<string, unknown>
      // Card hold, cash guarantee (a saved card behind it) and any booking that carries a payment intent (paid in
      // full) all have money behind them: only the cancel route releases, refunds or applies the policy.
      const hasPaymentIntent = typeof current.payment_intent_id === 'string' && current.payment_intent_id !== ''
      if (current.payment_mode === 'card_hold' || current.payment_mode === 'cash_guarantee' || hasPaymentIntent) {
        return NextResponse.json(
          {
            error: 'use_cancel_route',
            message: 'Bookings with a card or a payment are cancelled with Cancel booking, so the hold is released or the payment refunded.',
          },
          { status: 422 },
        )
      }
    }

    const result = await advanceBookingStatus({
      bookingId: parsed.data.id,
      to: parsed.data.status,
      actor: { type: 'admin', id: user?.id ?? null },
      source: 'admin_patch',
      profile: 'full',
      expectedFrom: parsed.data.expected_status,
      patch,
      ...(current ? { current } : {}),
    })

    const failure = advanceResultToResponse(result)
    if (failure) return failure

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

    // Terminal-status gate — completed/cancelled/no_show bookings are final and read-only (WR-02: no_show was missing;
    // a no-show can carry a fee case, so an edit of its price or pickup would rewrite what a charge is based on).
    if (current.status === 'completed' || current.status === 'cancelled' || current.status === 'no_show') {
      return NextResponse.json(
        { error: `${current.status} bookings are final and cannot be edited` },
        { status: 422 }
      )
    }

    // Phase 88 T-88-52: a card booking whose checkout, hold placement or capture is running is not editable.
    const inFlight = assertEditablePrecheck(current)
    if (inFlight) return NextResponse.json(inFlight.body, { status: inFlight.status })

    // Phase 91 Pitfall 10: the recompute below prices the vehicle, the route and the extras. It knows nothing of the
    // detour through the stops or of their waiting time, so repricing a booking that has stops would silently drop
    // what the client paid for them. The operator must set the price by hand (override_price, audited like every
    // override). Fail closed: a stops read that fails answers 500 and nothing is written.
    if (hasPriceField && parsed.data.override_price !== true) {
      let stopsOfBooking
      try {
        stopsOfBooking = await loadStopsByBookingIds([current.id as string])
      } catch (stopsError) {
        console.error('[admin/bookings.PATCH] stops read failed:', stopsError instanceof Error ? stopsError.message : 'unknown')
        return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
      }
      if ((stopsOfBooking.get(current.id as string) ?? []).length > 0) {
        return NextResponse.json({ error: 'stops_edit_unsupported' }, { status: 422 })
      }
    }

    // Phase 91 (D-07, D-18): an airport booking stores the flight's landing and the offset beside the pickup. A manual
    // pickup edit is accepted only when the new pickup IS landing + one of the allowed offsets; the matching offset is
    // written in the same update, so landing + offset always equals the pickup the driver and the hold use. Any other
    // pickup answers 422 before any write. A new landing time goes through Move pickup, not through this edit.
    let landingOffsetUpdate: { offset: number; auditRow: { field: string; old_value: string | null; new_value: string | null } | null } | null = null
    const hasLanding =
      typeof current.landing_date === 'string' && typeof current.landing_time === 'string' &&
      current.pickup_offset_min !== null && current.pickup_offset_min !== undefined
    if (hasLanding && (parsed.data.pickup_date !== undefined || parsed.data.pickup_time !== undefined)) {
      const currentClock = typeof current.pickup_time === 'string' ? current.pickup_time.slice(0, 5) : ''
      const newDate = parsed.data.pickup_date ?? (current.pickup_date as string)
      const newTime = parsed.data.pickup_time ?? currentClock
      if (newDate !== current.pickup_date || newTime !== currentClock) {
        // IN-05: on the autumn ambiguous hour two offsets can give the same wall-clock pickup. The booking's own offset wins when
        // it is one of the matches (a re-save never rewrites it); otherwise the smallest.
        const matches = LANDING_OFFSETS.filter((offset) => {
          const derived = pickupFromLanding(
            current.landing_date as string,
            (current.landing_time as string).slice(0, 5),
            offset,
          )
          return derived !== null && derived.pickupDate === newDate && derived.pickupTime === newTime
        })
        const storedOffset = Number(current.pickup_offset_min)
        const matching: number | undefined = (matches as number[]).includes(storedOffset)
          ? storedOffset
          : matches.length > 0
            ? Math.min(...matches)
            : undefined
        if (matching === undefined) {
          return NextResponse.json({ error: 'landing_pickup_mismatch' }, { status: 422 })
        }
        const oldOffset = String(current.pickup_offset_min)
        landingOffsetUpdate = {
          offset: matching,
          auditRow: oldOffset === String(matching)
            ? null
            : { field: 'pickup_offset_min', old_value: oldOffset, new_value: String(matching) },
        }
      }
    }

    // CR-02: a live Stripe Payment Link is a static object — its unit_amount
    // can never be updated after creation. Editing the price on a booking
    // that still carries a live payment_link_url would silently desync the
    // DB's "authoritative" amount from what Stripe will actually collect if
    // the client pays via the old link. Block unless the operator explicitly
    // acknowledges it via override_price (the existing price-tolerance
    // escape hatch, audited the same way). Deactivating/regenerating the
    // Stripe link itself is tracked as follow-up — see 64-REVIEW-FIX.md CR-02.
    if (hasPriceField && current.payment_link_url && !parsed.data.override_price) {
      return NextResponse.json(
        {
          error: 'This booking has a live payment link — its price cannot be edited without override_price, because the link would still charge the old amount',
        },
        { status: 409 }
      )
    }

    // Build updatePayload field-by-field (mass-assignment guard) — never spread the body.
    const tripUpdatePayload: Record<string, unknown> = {}
    for (const field of TRIP_EDIT_FIELDS) {
      const value = parsed.data[field]
      if (value !== undefined) tripUpdatePayload[field] = value
    }
    if (landingOffsetUpdate) tripUpdatePayload.pickup_offset_min = landingOffsetUpdate.offset

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
    // 88-REVIEW A-WR-11: what a card booking keeps when the operator did not set the amount explicitly.
    let amountKept: { kind: 'amount_kept'; currency: 'eur' | 'czk'; amount_minor: number | null; standard_czk: number } | null = null

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
      const effectiveOriginLat = parsed.data.origin_lat !== undefined ? parsed.data.origin_lat : (current.origin_lat as number | null)
      const effectiveOriginLng = parsed.data.origin_lng !== undefined ? parsed.data.origin_lng : (current.origin_lng as number | null)
      const effectiveDestinationLat = parsed.data.destination_lat !== undefined ? parsed.data.destination_lat : (current.destination_lat as number | null)
      const effectiveDestinationLng = parsed.data.destination_lng !== undefined ? parsed.data.destination_lng : (current.destination_lng as number | null)

      if (effectiveTripType === 'transfer' && (effectiveDistanceKm === null || effectiveDistanceKm === undefined || effectiveDistanceKm <= 0)) {
        return NextResponse.json(
          { error: 'distance_km is required and must be positive for transfer trips' },
          { status: 400 }
        )
      }

      // WR-02: cheap, no-API sanity check on the (fully client-controlled)
      // distance_km price input — only runs when both endpoints' coordinates
      // are known (skipped otherwise: no regression vs. current behavior when
      // addresses weren't geocoded). Requires override_price to accept a
      // distance_km implausibly smaller than the haversine straight-line
      // distance, closing the gap where a compromised admin session could
      // under-price a correctly-addressed transfer.
      if (
        effectiveTripType === 'transfer' &&
        typeof effectiveDistanceKm === 'number' &&
        typeof effectiveOriginLat === 'number' && typeof effectiveOriginLng === 'number' &&
        typeof effectiveDestinationLat === 'number' && typeof effectiveDestinationLng === 'number' &&
        !parsed.data.override_price
      ) {
        const haversineKm = haversineDistanceKm(effectiveOriginLat, effectiveOriginLng, effectiveDestinationLat, effectiveDestinationLng)
        if (haversineKm > 0 && effectiveDistanceKm < haversineKm / DISTANCE_SANITY_MULTIPLIER) {
          return NextResponse.json(
            {
              error: 'distance_km is implausibly small for the given coordinates — requires override_price to accept',
              submittedDistanceKm: effectiveDistanceKm,
              haversineDistanceKm: Math.round(haversineKm * 10) / 10,
            },
            { status: 422 }
          )
        }
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

      // 88-REVIEW A-WR-11: the recompute above knows neither the client's promo code nor the price they agreed to at
      // checkout, and since Phase 88 a card booking's amount is what the engine charges after the trip (a raise is
      // charged to the saved card, D-16). A card booking therefore keeps its agreed amount unless the operator set the
      // amount explicitly (override_price): an address fix or a vehicle edit alone never changes what the client pays.
      // Money WR-09: the same for a cash booking, whose amount is what the driver collects and the card can be charged (D-12).
      const agreedAmount = current.payment_mode === 'card_hold' || current.payment_mode === 'cash_guarantee'
      const cardKeepsAgreed = agreedAmount && parsed.data.override_price !== true
      const cardExplicit = agreedAmount && parsed.data.override_price === true

      if (priceDiverges && !parsed.data.override_price && !cardKeepsAgreed) {
        return NextResponse.json(
          {
            error: 'Price mismatch — server recompute diverges from submitted amount',
            submittedCzk: submittedAmountCzk,
            computedCzk: computedTotalCzk,
          },
          { status: 422 }
        )
      }

      // Authoritative amount = recompute unless the operator explicitly overrode it. A card booking: its agreed amount,
      // or exactly the amount the operator entered.
      const currentAmountCzk = typeof current.amount_czk === 'number' ? current.amount_czk : Number(current.amount_czk)
      const authoritativeAmountCzk = cardKeepsAgreed
        ? currentAmountCzk
        : priceDiverges || cardExplicit
          ? submittedAmountCzk
          : computedTotalCzk
      const amount_eur = cardKeepsAgreed
        ? (current.amount_eur as number | null)
        : priceDiverges || cardExplicit
          ? czkToEur(submittedAmountCzk)
          : computedTotalEur
      if (cardKeepsAgreed && computedTotalCzk !== currentAmountCzk) {
        amountKept = {
          kind: 'amount_kept',
          currency: current.payment_currency === 'czk' ? 'czk' : 'eur',
          amount_minor: typeof current.payment_amount_minor === 'number' ? current.payment_amount_minor : null,
          standard_czk: computedTotalCzk,
        }
      }

      // Raw price-affecting fields (mass-assignment guard — never spread the body).
      if (parsed.data.vehicle_class !== undefined) tripUpdatePayload.vehicle_class = parsed.data.vehicle_class
      if (parsed.data.origin_address !== undefined) tripUpdatePayload.origin_address = parsed.data.origin_address
      if (parsed.data.destination_address !== undefined) tripUpdatePayload.destination_address = parsed.data.destination_address
      if (parsed.data.origin_lat !== undefined) tripUpdatePayload.origin_lat = parsed.data.origin_lat
      if (parsed.data.origin_lng !== undefined) tripUpdatePayload.origin_lng = parsed.data.origin_lng
      if (parsed.data.destination_lat !== undefined) tripUpdatePayload.destination_lat = parsed.data.destination_lat
      if (parsed.data.destination_lng !== undefined) tripUpdatePayload.destination_lng = parsed.data.destination_lng
      if (parsed.data.distance_km !== undefined) tripUpdatePayload.distance_km = parsed.data.distance_km
      if (!cardKeepsAgreed) {
        tripUpdatePayload.amount_czk = authoritativeAmountCzk
        tripUpdatePayload.amount_eur = amount_eur
      }

      if (priceDiverges && !cardKeepsAgreed) {
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
    const auditRows = [
      ...cheapAuditRows,
      ...priceAuditRows,
      ...(landingOffsetUpdate?.auditRow ? [landingOffsetUpdate.auditRow] : []),
    ]

    // GNet guard: no trip-detail push exists for GNet (lib/gnet-client.ts only
    // pushes status) — trip-field edits on booking_source='gnet' bookings are
    // ALWAYS local-only (persist + audit + optional email), regardless of
    // whether the edit was a cheap field or a price-affecting field. No push
    // call is made here — this is intentionally the absence of a GNet call.

    // CR-02: a price-affecting edit only reaches here on a linked booking under
    // override_price (the 409 guard blocks it otherwise). The static link still
    // charges the OLD amount, so retire it when the CZK amount actually changed:
    // clear the link fields and deactivate it in Stripe after the row is updated.
    let staleLinkIdOnPrice: string | null = null
    if (
      hasPriceField &&
      current.payment_link_id &&
      current.payment_link_url &&
      tripUpdatePayload.amount_czk !== undefined &&
      tripUpdatePayload.amount_czk !== current.amount_czk
    ) {
      staleLinkIdOnPrice = current.payment_link_id as string
      tripUpdatePayload.payment_link_url = null
      tripUpdatePayload.payment_link_id = null
    }

    // Phase 92 (D-20): a booking created from a quote already collected its deposit share. A new price that leaves nothing
    // to charge after that share is refused before anything is written, so the deposit is never charged twice.
    const belowDeposit = assertQuoteEditAmount(current, {
      amount_czk: tripUpdatePayload.amount_czk,
      amount_eur: tripUpdatePayload.amount_eur,
    })
    if (belowDeposit) return NextResponse.json(belowDeposit.body, { status: belowDeposit.status })

    // WR-04 (D-18): when this edit derived pickup_offset_min from the landing it read, the update is compare-and-set on that
    // landing and that pickup (the contract of applyLandingChange): a concurrent Move pickup / trip edit matches no row and
    // answers 409 stale, so landing + offset can never differ from the stored pickup.
    const baseUpdate = supabase.from('bookings').update(tripUpdatePayload).eq('id', parsed.data.id)
    let dbError: unknown = null
    if (landingOffsetUpdate) {
      const cas = await baseUpdate
        .eq('landing_date', current.landing_date as string)
        .eq('landing_time', current.landing_time as string)
        .eq('pickup_date', current.pickup_date as string)
        .eq('pickup_time', current.pickup_time as string)
        .select('id')
      dbError = cas.error
      if (!cas.error && (!cas.data || cas.data.length === 0)) {
        return NextResponse.json({ error: 'stale' }, { status: 409 })
      }
    } else {
      dbError = (await baseUpdate).error
    }

    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    // CR-02: deactivate the now-cleared, stale-priced Stripe link (fire-and-forget).
    if (staleLinkIdOnPrice) {
      const staleId = staleLinkIdOnPrice
      after(() => deactivateBookingPaymentLink(staleId).catch(err =>
        console.error('[admin/bookings.PATCH] payment-link deactivate (price override):', err)
      ))
    }

    // Phase 88 D-16/D-17/D-18: keep a card booking's amount, planned hold date and hold consistent with the
    // saved row. Never fails the edit; the result (if any) is shown to the operator as payment_effect.
    const toNum = (v: unknown): number | null => {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
      return typeof n === 'number' && Number.isFinite(n) ? n : null
    }
    const clock = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 5) : '')
    const priceChanged =
      hasPriceField &&
      (toNum(tripUpdatePayload.amount_czk) !== toNum(current.amount_czk) ||
        toNum(tripUpdatePayload.amount_eur) !== toNum(current.amount_eur))
    const pickupChanged =
      (tripUpdatePayload.pickup_date !== undefined && tripUpdatePayload.pickup_date !== current.pickup_date) ||
      (tripUpdatePayload.pickup_time !== undefined && clock(tripUpdatePayload.pickup_time) !== clock(current.pickup_time))
    const paymentEffect = await reevaluateAfterEdit({
      bookingId: parsed.data.id,
      before: current,
      priceChanged,
      pickupChanged,
      actor: { type: 'admin', id: user?.id ?? null },
    })

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

    const effect = paymentEffect ?? amountKept
    return NextResponse.json(effect ? { ok: true, payment_effect: effect } : { ok: true })
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
  // Phase 64 ANEW-01/02/05 (D-01/D-02): when true, the server generates a
  // Stripe Payment Link at save time and the row lands in the Phase 62
  // 'unpaid' recovery queue. When false/omitted, `status` is the operator's
  // explicit choice for a no-link (cash/invoice) booking — default 'confirmed'.
  collect_payment:     z.boolean().optional(),
  status:              z.enum(['confirmed', 'pending']).optional(),
  // When true and the row lands as 'confirmed' (no payment link), the client
  // gets the standard booking-confirmed email right after the insert. An
  // explicit operator choice, so it is not gated by notification_flags.
  send_confirmation:   z.boolean().optional(),
  // Phase 81 D-08: how the lead reached the owner. Required for every new
  // manual booking; stored as bookings.lead_channel (Lead source in CRM).
  channel:             z.enum(['whatsapp', 'phone', 'email', 'partner', 'other']),
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

  // WR-02: cheap, no-API sanity check on the (fully client-controlled)
  // distance_km price input — only runs when both endpoints' coordinates are
  // known (skipped otherwise, e.g. free-text addresses with no Google Places
  // selection). Requires override_price to accept a distance_km implausibly
  // smaller than the haversine straight-line distance.
  if (
    d.trip_type === 'transfer' &&
    typeof d.distance_km === 'number' &&
    typeof d.origin_lat === 'number' && typeof d.origin_lng === 'number' &&
    typeof d.destination_lat === 'number' && typeof d.destination_lng === 'number' &&
    !d.override_price
  ) {
    const haversineKm = haversineDistanceKm(d.origin_lat, d.origin_lng, d.destination_lat, d.destination_lng)
    if (haversineKm > 0 && d.distance_km < haversineKm / DISTANCE_SANITY_MULTIPLIER) {
      return NextResponse.json(
        {
          error: 'distance_km is implausibly small for the given coordinates — requires override_price to accept',
          submittedDistanceKm: d.distance_km,
          haversineDistanceKm: Math.round(haversineKm * 10) / 10,
        },
        { status: 422 }
      )
    }
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
    lead_channel:        d.channel,
    booking_type:        'confirmed',
    payment_intent_id:   null,
    // D-01/D-02: collect_payment routes the row into the Phase 62 'unpaid'
    // recovery queue; otherwise the operator's explicit status choice applies
    // (default 'confirmed' — a no-link save is not a payment-pending state).
    status:              d.collect_payment ? 'unpaid' : (d.status ?? 'confirmed'),
    amount_eur,
    user_id:             d.user_id ?? null,
    operator_notes:      priceDiverges
      ? `Price manually overridden by admin: ${authoritativeAmountCzk} CZK (standard rate would be ${computedTotalCzk} CZK).`
      : null,
  }

  // Phase 89 D-18: store the terms when the policy is public for this client (mode on, or canary with the email
  // listed). Built server-side; a read failure leaves the columns NULL (legacy terms), never a failed create.
  let policyColumns: { cancel_policy_version: string; cancel_policy: Record<string, string | number> } | null = null
  try {
    if (isPolicyPublic(await getPaymentSettings(), d.client_email)) {
      const { version, snapshot } = buildPolicySnapshot(await getCancellationPolicy())
      policyColumns = { cancel_policy_version: version, cancel_policy: snapshot }
    }
  } catch (policyErr) {
    console.error('[admin/bookings.POST] policy snapshot skipped:', policyErr instanceof Error ? policyErr.message : String(policyErr))
  }

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('bookings')
    .insert([policyColumns ? { ...row, ...policyColumns } : row])
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })

  // A no-link manual booking saved as 'confirmed' otherwise sends nothing —
  // client emails only fire on PATCH status transitions.
  if (d.send_confirmation === true && data.status === 'confirmed') {
    const shouldSend = await logEmail({
      bookingId: data.id,
      emailType: 'booking_confirmed',
      recipient: d.client_email,
    })
    if (shouldSend) {
      // Phase 89 CANC-02: the inserted row carries the stored policy columns when the policy was public for this client.
      after(() => buildPolicyBlockHtml(data).catch(() => '')
        .then(policyBlockHtml => sendStatusConfirmedEmail(policyBlockHtml ? { ...data, policyBlockHtml } : data))
        .catch(err => console.error('[admin/bookings.POST] confirmation email:', err))
      )
    }
  }

  // Phase 64 ANEW-02/03: generate the Stripe Payment Link + persist + email
  // AFTER the booking row is committed — the booking insert and the
  // Stripe/email step are non-atomic. If this step throws, the booking (and
  // whatever of this step already landed, e.g. a persisted payment_link_url)
  // still survives; the response degrades to paymentLinkUrl: null.
  let paymentLinkUrl: string | null = null
  if (d.collect_payment === true) {
    try {
      const link = await createBookingPaymentLink({
        bookingId: data.id,
        bookingReference,
        amountEur: amount_eur,
        leg: null,
      })
      paymentLinkUrl = link.url

      const { error: linkUpdateError } = await supabase
        .from('bookings')
        .update({ payment_link_url: link.url, payment_link_id: link.id })
        .eq('id', data.id)
      if (linkUpdateError) {
        console.error('[admin/bookings.POST] failed to persist payment_link_url:', linkUpdateError.message)
      }

      const allowed = await logEmail({
        bookingId: data.id,
        emailType: 'payment_request',
        recipient: d.client_email,
      })
      if (allowed) {
        await sendPaymentRequestEmail({
          bookingReference,
          clientEmail: d.client_email,
          clientFirstName: d.client_first_name,
          clientLastName: d.client_last_name,
          originAddress: d.origin_address,
          destinationAddress: d.destination_address ?? null,
          pickupDate: d.pickup_date,
          pickupTime: d.pickup_time,
          vehicleClass: d.vehicle_class,
          amountEur: amount_eur,
          paymentLinkUrl: link.url,
          flightNumber: d.flight_number ?? null,
        })
      }
    } catch (err) {
      console.error('[admin/bookings.POST] payment link / payment-request email step failed:', err)
    }
  }

  return NextResponse.json(
    d.collect_payment === true ? { booking: data, paymentLinkUrl } : { booking: data },
    { status: 201 }
  )
}
