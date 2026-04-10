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
  bookingType: 'confirmed' | 'quote'
) {
  return {
    booking_reference: meta.bookingReference,
    payment_intent_id: paymentIntentId,
    leg: 'outbound' as const, // webhooks and quote submissions always create the outbound leg
    booking_type: bookingType,
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
 */
export function buildBookingRows(
  meta: Record<string, string>,
  paymentIntentId: string
): {
  outbound: ReturnType<typeof buildBookingRow>
  return: ReturnType<typeof buildBookingRow>
} {
  // Outbound mirrors buildBookingRow shape but with per-leg amount columns
  // populated from the dedicated metadata fields.
  const outbound = {
    ...buildBookingRow(meta, paymentIntentId, 'confirmed'),
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
