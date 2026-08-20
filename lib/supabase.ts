import { createClient } from '@supabase/supabase-js'
import { czkToEur, eurToCzk } from '@/lib/currency'

export function createSupabaseServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

/**
 * Least-privilege read-only client for tables with a `public_read` RLS policy
 * (currently: pricing_config, pricing_globals, coverage_zones).
 *
 * Using the anon key here instead of the service_role key means a bug that
 * accidentally calls `.delete()` or `.update()` on these tables silently
 * no-ops instead of corrupting data. Prefer this client in route handlers
 * that only need to READ public-config tables.
 */
export function createSupabasePublicReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt - 1))
        )
      }
    }
  }
  throw lastError
}

export function buildBookingRow(
  meta: Record<string, string>,
  paymentIntentId: string | null,
  bookingType: 'confirmed' | 'quote' | 'unpaid'
) {
  return {
    booking_reference: meta.bookingReference,
    payment_intent_id: paymentIntentId,
    leg: 'outbound' as const, // webhooks and quote submissions always create the outbound leg
    // booking_type encodes the ORIGIN dimension (checkout-originated vs a
    // manually-priced quote request) — a Phase 62 'unpaid' capture row is
    // still checkout-originated, so it reuses 'confirmed' here. `status`
    // (below) is what encodes the unpaid/confirmed lifecycle distinction
    // (D-01 rationale: keep the two dimensions separate; `booking_type` has
    // no verified live CHECK constraint permitting a third distinct value).
    booking_type: bookingType === 'quote' ? 'quote' : 'confirmed',
    // Paid bookings start as 'confirmed' — Stripe already validated the charge.
    // Quotes stay 'pending' until an operator prices them and sends a payment link.
    // Phase 62 unpaid-capture rows start as 'unpaid' — a checkout attempt
    // that reached the payment step but has not (yet) paid (D-02/ABND-02).
    status: bookingType === 'confirmed' ? 'confirmed' : bookingType === 'unpaid' ? 'unpaid' : 'pending',
    trip_type: meta.tripType,
    origin_address: meta.originAddress ?? meta.origin ?? null,
    origin_lat: meta.originLat ? parseFloat(meta.originLat) : null,
    origin_lng: meta.originLng ? parseFloat(meta.originLng) : null,
    destination_address: meta.destinationAddress ?? meta.destination ?? null,
    destination_lat: meta.destinationLat ? parseFloat(meta.destinationLat) : null,
    destination_lng: meta.destinationLng ? parseFloat(meta.destinationLng) : null,
    hours: meta.hours ? parseInt(meta.hours) : null,
    passengers: parseInt(meta.passengers) || 1,
    luggage: parseInt(meta.luggage) || 0,
    pickup_date: meta.pickupDate,
    pickup_time: meta.pickupTime,
    return_date: meta.returnDate || null,
    vehicle_class: meta.vehicleClass,
    distance_km: meta.distanceKm ? parseFloat(meta.distanceKm) : null,
    amount_czk: meta.amountCzk ? parseInt(meta.amountCzk) : (meta.amountEur ? eurToCzk(parseFloat(meta.amountEur)) : 0),
    amount_eur: meta.amountEur ? parseFloat(meta.amountEur) : (meta.amountCzk ? czkToEur(parseInt(meta.amountCzk)) : null),
    extra_child_seat: meta.extraChildSeat === 'true',
    extra_meet_greet: meta.extraMeetGreet === 'true',
    extra_luggage: meta.extraLuggage === 'true',
    client_first_name: meta.firstName,
    client_last_name: meta.lastName,
    client_email: meta.email,
    client_phone: meta.phone,
    flight_number: meta.flightNumber || null,
    terminal: meta.terminal || null,
    special_requests: meta.specialRequests || null,
    user_id: meta.userId || null,
  }
}

/**
 * Insert a booking row. Returns the inserted rows (one element) if the row
 * was new, or an empty array if the row was a duplicate of an existing
 * (payment_intent_id, leg) pair — which is the idempotency signal for the
 * webhook to skip sending emails on Stripe retries.
 *
 * Uses upsert with ignoreDuplicates so concurrent duplicate inserts do NOT
 * raise an error — the DB constraint enforces atomicity, eliminating the
 * TOCTOU race of a SELECT-then-INSERT pattern.
 */
export async function saveBooking(row: ReturnType<typeof buildBookingRow>): Promise<{ id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .upsert([row], { onConflict: 'payment_intent_id,leg', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
  return data ?? []
}

/**
 * Reconcile a pre-captured `unpaid` bookings row to `confirmed` when its
 * PaymentIntent succeeds (Phase 62 D-11).
 *
 * Returns the updated row(s) (one element) when a matching `unpaid` row was
 * found and flipped, or an empty array when no row matched — either because
 * the row is already `confirmed` (a Stripe retry, correctly a no-op) or
 * because no capture row exists yet (a lost capture; the caller falls back
 * to a defensive INSERT via `buildBookingRow`/`saveBooking`).
 *
 * The UPDATE's WHERE clause encodes the idempotency condition directly
 * (`status = 'unpaid'`) instead of relying on `saveBooking`'s
 * `ignoreDuplicates` upsert semantics, which can only skip-or-insert and can
 * never flip an existing row's status — see 62-RESEARCH.md Pattern 2 /
 * Anti-Patterns.
 */
export async function reconcileBookingToConfirmed(
  paymentIntentId: string,
  leg: 'outbound' | 'return'
): Promise<{ id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('payment_intent_id', paymentIntentId)
    .eq('leg', leg)
    .eq('status', 'unpaid')
    .select('id')
  if (error) throw new Error(`Supabase reconcile failed: ${error.message}`)
  return data ?? []
}

/**
 * Attempt-keyed capture (Phase 62 D-06): dedups an unpaid checkout attempt so
 * a retry / currency-toggle / promo-apply re-POST UPDATEs the SAME row in
 * place instead of inserting a second one into the admin follow-up queue.
 *
 * SELECT-then-INSERT-or-UPDATE (not ON CONFLICT) per 62-RESEARCH.md Open
 * Question 3 — checkout is single-tab/sequential, no realistic double-submit
 * race; the partial unique index (attempt_id, leg) WHERE status='unpaid'
 * (migration 053) still guards the DB against a genuine race.
 *
 * - No existing row for (attempt_id, leg)      → INSERT a fresh unpaid row.
 * - Existing row is status='unpaid'             → UPDATE it in place,
 *   overwriting the FULL mutable field set (payment_intent_id,
 *   booking_reference, amounts, promo, PII — everything `row` carries) so the
 *   admin-visible unpaid row never shows a stale reference/amount that
 *   disagrees with the currently-active PaymentIntent (62-RESEARCH.md
 *   Pitfall 3).
 * - Existing row is already status='confirmed'  → no-op (never mutate a paid
 *   booking via this client-supplied key — T-62-01 IDOR mitigation).
 *
 * Returns the affected row (one element) on insert/update, or an empty array
 * on the confirmed no-op.
 */
export async function captureUnpaidBooking(
  row: ReturnType<typeof buildBookingRow>,
  attemptId: string,
  leg: 'outbound' | 'return'
): Promise<{ id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const rowWithAttempt = { ...row, attempt_id: attemptId }

  const { data: existing, error: selectError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('attempt_id', attemptId)
    .eq('leg', leg)
    .maybeSingle()
  if (selectError) throw new Error(`Supabase capture select failed: ${selectError.message}`)

  if (!existing) {
    const { data, error } = await supabase
      .from('bookings')
      .insert([rowWithAttempt])
      .select('id')
    if (error) throw new Error(`Supabase capture insert failed: ${error.message}`)
    return data ?? []
  }

  const existingRow = existing as { id: string; status: string }
  if (existingRow.status !== 'unpaid') {
    // Already confirmed (or some other terminal state) — never mutate via
    // a client-supplied attempt_id once the booking has been paid.
    return []
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(rowWithAttempt)
    .eq('id', existingRow.id)
    .eq('status', 'unpaid')
    .select('id')
  if (error) throw new Error(`Supabase capture update failed: ${error.message}`)
  return data ?? []
}

/**
 * Reconcile BOTH legs of a round-trip booking (Phase 62 D-07/D-11) from
 * `unpaid` to `confirmed` in a single atomic UPDATE — the two legs share one
 * `payment_intent_id`, so scoping by that column alone flips both rows at
 * once without a second query.
 *
 * Returns the updated row id(s) (0, 1, or 2 elements). An empty result means
 * no matching `unpaid` rows existed — either already `confirmed` (a Stripe
 * retry, correctly a no-op) or a lost capture (caller falls back to a
 * defensive `saveRoundTripBookings` insert). Mirrors
 * `reconcileBookingToConfirmed`'s one-way "empty = already handled" contract.
 */
export async function reconcileRoundTripToConfirmed(
  paymentIntentId: string
): Promise<{ id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('payment_intent_id', paymentIntentId)
    .eq('status', 'unpaid')
    .select('id')
  if (error) throw new Error(`Supabase round-trip reconcile failed: ${error.message}`)
  return data ?? []
}

/**
 * Build BOTH booking rows for a round-trip booking in a single call.
 *
 * Phase 27 D-03 (locked decision): the external API is a single function
 * returning `{ outbound, return }` — NOT a standalone `buildReturnBookingRow`.
 * The outbound row mirrors the existing `buildBookingRow` shape so the RPC
 * receives the exact same field set as one-way inserts; the return row
 * differs in ways that are load-bearing (see inline notes).
 *
 * Differences of the RETURN row from buildBookingRow:
 *   - `leg: 'return'` (vs outbound)
 *   - `booking_reference: meta.returnBookingReference`
 *   - origin ↔ destination swapped (return trip goes B→A)
 *   - `pickup_date`/`pickup_time` from `meta.returnDate`/`meta.returnTime`,
 *     NOT the outbound pickupDate/pickupTime
 *   - extras all `false` — attributed to outbound only per RTPR-03
 *   - `flight_number`/`terminal` null — flight arrival info applies to the
 *     outbound (arrival) leg only
 *   - `amount_czk` = return leg's own pre-promo amount (from
 *     `meta.returnAmountCzk`), NOT the combined total
 *
 * Both rows carry `outbound_amount_czk` and `return_amount_czk` so the
 * Phase 28 refund handler can compute leg-scoped refund amounts.
 *
 * @see 27-CONTEXT.md D-03
 * @see 27-RESEARCH.md Pattern 3, Pitfall 5 (amount double-counting)
 *
 * Phase 62 D-07: `bookingType` widened to accept `'unpaid'` (default stays
 * `'confirmed'` — every existing call site is unaffected) so the same builder
 * produces the two pre-payment capture rows for a round-trip attempt.
 * `buildBookingRow`'s own status ternary already derives `status: 'unpaid'`
 * while leaving `booking_type: 'confirmed'` (the origin dimension, unchanged)
 * for that value — see D-01 rationale in `buildBookingRow`.
 */
export function buildBookingRows(
  meta: Record<string, string>,
  paymentIntentId: string,
  bookingType: 'confirmed' | 'unpaid' = 'confirmed'
): {
  outbound: ReturnType<typeof buildBookingRow>
  return: ReturnType<typeof buildBookingRow>
} {
  // Outbound mirrors buildBookingRow shape but with per-leg amount columns
  // populated from the dedicated metadata fields.
  const outbound = {
    ...buildBookingRow(meta, paymentIntentId, bookingType),
    // Phase 27 adds per-leg amount columns to the outbound row too — this
    // overrides whatever buildBookingRow produced for amount_czk (which
    // reads meta.amountCzk = combined total). For round-trip, outbound
    // row's amount_czk must be the outbound leg's OWN pre-promo amount.
    amount_czk: meta.outboundAmountCzk ? parseInt(meta.outboundAmountCzk) : 0,
    outbound_amount_czk: meta.outboundAmountCzk ? parseInt(meta.outboundAmountCzk) : null,
    return_amount_czk: meta.returnAmountCzk ? parseInt(meta.returnAmountCzk) : null,
    trip_type: 'round_trip',
  }

  const returnRow = {
    booking_reference: meta.returnBookingReference,
    payment_intent_id: paymentIntentId,
    leg: 'return' as const,
    booking_type: 'confirmed' as const,
    status: bookingType, // 'confirmed' | 'unpaid' — Phase 62 D-07
    trip_type: 'round_trip',
    // Origin ↔ destination SWAPPED: return trip goes destination → origin
    origin_address: meta.destinationAddress ?? null,
    origin_lat: meta.destinationLat ? parseFloat(meta.destinationLat) : null,
    origin_lng: meta.destinationLng ? parseFloat(meta.destinationLng) : null,
    destination_address: meta.originAddress ?? null,
    destination_lat: meta.originLat ? parseFloat(meta.originLat) : null,
    destination_lng: meta.originLng ? parseFloat(meta.originLng) : null,
    hours: null,
    passengers: parseInt(meta.passengers) || 1,
    luggage: parseInt(meta.luggage) || 0,
    // Return leg pickup is the return_date/return_time, NOT the outbound pickup
    pickup_date: meta.returnDate,
    pickup_time: meta.returnTime,
    return_date: null,
    vehicle_class: meta.vehicleClass,
    distance_km: meta.distanceKm ? parseFloat(meta.distanceKm) : null,
    // Per-leg amounts (pre-promo)
    amount_czk: meta.returnAmountCzk ? parseInt(meta.returnAmountCzk) : 0,
    amount_eur: null,
    outbound_amount_czk: meta.outboundAmountCzk ? parseInt(meta.outboundAmountCzk) : null,
    return_amount_czk: meta.returnAmountCzk ? parseInt(meta.returnAmountCzk) : null,
    // Extras attributed to outbound only — RTPR-03
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    client_first_name: meta.firstName,
    client_last_name: meta.lastName,
    client_email: meta.email,
    client_phone: meta.phone,
    // Flight info applies to outbound (arrival) leg only
    flight_number: null,
    terminal: null,
    special_requests: meta.specialRequests || null,
    user_id: meta.userId || null,
    // Double-cast: `leg: 'return'` is intentionally incompatible with the
    // outbound-shape leg: 'outbound' literal from buildBookingRow, so a
    // direct `as` is rejected by TS strict mode. The runtime shape is
    // byte-compatible with the DB row, which is what saveRoundTripBookings
    // ultimately cares about. `as unknown as` is the TS-sanctioned escape
    // hatch for this case (suggested by the compiler error itself).
  } as unknown as ReturnType<typeof buildBookingRow>

  return { outbound, return: returnRow }
}

/**
 * Atomically insert both legs of a round-trip booking via the Postgres RPC
 * `create_round_trip_bookings`. Returns the new row IDs on success, or
 * `null` on idempotent retry.
 *
 * Phase 27 D-02 (locked): return shape is `{outbound_id, return_id} | null`
 * — IDs only, NOT full rows. Caller (Plan 27-04) uses the null return as
 * the email-send gate: non-null → fresh insert → send emails; null →
 * duplicate → skip.
 *
 * Idempotency contract:
 *   - First delivery:   RPC succeeds → returns { outbound_id, return_id }
 *   - Retry delivery:   RPC raises 23505 → returns null   ← email gate
 *   - Message fallback: error.message matches 'bookings_payment_intent_id_leg_key'
 *                       → also returns null (handles drivers that drop error.code)
 *   - Infra error:      re-throws so caller can withRetry(fn, 3, 1000) + emergency alert
 *
 * This matches saveBooking's "empty array on duplicate" shape so the webhook
 * can use the same "truthy = insert happened, send emails" gating pattern.
 *
 * @see 27-CONTEXT.md D-02
 * @see 27-RESEARCH.md §2 (idempotency Strategy A)
 */
export async function saveRoundTripBookings(
  outboundRow: ReturnType<typeof buildBookingRow>,
  returnRow: ReturnType<typeof buildBookingRow>
): Promise<{ outbound_id: string; return_id: string } | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.rpc('create_round_trip_bookings', {
    p_outbound: outboundRow,
    p_return: returnRow,
  })
  if (error) {
    const code = (error as { code?: string }).code
    const msg = error.message ?? ''
    // Postgres unique_violation via code OR constraint name in message.
    // Stripe webhook retry: composite UNIQUE (payment_intent_id, leg) caught
    // this race-free at the DB level. Signal caller to skip emails.
    if (code === '23505' || msg.includes('bookings_payment_intent_id_leg_key')) {
      return null
    }
    throw new Error(`create_round_trip_bookings RPC failed: ${msg}`)
  }
  if (!data || !Array.isArray(data) || data.length === 0) return null
  const row = data[0] as { outbound_id: string; return_id: string }
  return { outbound_id: row.outbound_id, return_id: row.return_id }
}
