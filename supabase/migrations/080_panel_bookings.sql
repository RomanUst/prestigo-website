-- Migration 080: panel_bookings — read-only booking lookup behind the Chatwoot Dashboard App
-- (Phase 84, plan 84-01, PANEL-01 / PANEL-02).
--
-- Why it exists: the Dashboard App iframe shows the operator the bookings of the person they are
-- chatting with. The API route takes the contact's email / phone from the verified Chatwoot
-- conversation (never from the browser) and calls this function through the service role.
--
-- Why it is read-only and STABLE (PANEL-02): the panel can never change data. No INSERT, UPDATE,
-- DELETE or outbox call appears in the body; the function is not callable by anon or authenticated.
--
-- Why identity resolution lives here and not in TypeScript (D-10): the panel must see exactly what
-- the CRM / Chatwoot sync sees. It reuses the Phase 82 helpers identity_normalize_email (069),
-- identity_normalize_phone (072) and identity_is_abandoned (069) and the identity tables.
--   * The normalised email owns the identity.
--   * A phone is used only when the email resolves to nothing, it is not flagged shared in
--     phone_flags, and exactly one identity owns it. Two identities are never unioned.
--   * When the email resolves to identity A and the phone to a different identity B, A's bookings
--     are returned and phone_mismatch is true; nothing else about B leaves this function.
--
-- Why booker-only (D-11): bookings are reached through booking_identity, the same key the sync and
-- the erasure job use. A passenger name or passenger phone is never matched.
--
-- Eligible rows: linked through booking_identity, anonymised_at IS NULL, not an abandoned checkout.
-- An identity with erasing_at set returns identity_found false, zero rows and no Lead id.
--
-- Counters (total, trip_count, spent_eur) are computed over ALL eligible rows, never over the capped
-- list, with the same rules as the Chatwoot attributes (82 D-02): a trip is a non-return leg that is
-- not cancelled; spent_eur sums amount_eur (or, for a round trip without amount_eur, the two per-leg
-- CZK amounts at 0.04) over trips whose status is confirmed, assigned, en_route, on_location or
-- completed.
--
-- Rows: explicit allowlisted projection (D-06), at most 200, ordered so that every future booking
-- falls inside the cap (pickup_utc DESC NULLS LAST, then the text pickup columns, which are never
-- cast because a cast could raise on a bad value).
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the
-- bottom must always be re-run (see 079).

CREATE OR REPLACE FUNCTION public.panel_bookings(
  p_email           text,
  p_phone           text,
  p_conversation_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email          text;
  v_identity       uuid;
  v_erasing        timestamptz;
  v_total         integer := 0;
  v_trips          integer := 0;
  v_spent          integer := 0;
  v_rows           jsonb   := '[]'::jsonb;
BEGIN
  v_email := public.identity_normalize_email(p_email);

  IF v_email IS NOT NULL THEN
    SELECT e.identity_id INTO v_identity
      FROM public.identity_emails e
     WHERE e.email = v_email;
  END IF;

  IF v_identity IS NOT NULL THEN
    SELECT c.erasing_at INTO v_erasing
      FROM public.contact_identities c
     WHERE c.id = v_identity;
  END IF;

  -- Unknown person, or a person under erasure: nothing leaves the function.
  IF v_identity IS NULL OR v_erasing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'identity_found', false,
      'phone_mismatch', false,
      'espo_lead_id',   NULL,
      'total',          0,
      'trip_count',     0,
      'spent_eur',      0,
      'rows',           '[]'::jsonb
    );
  END IF;

  -- Totals over ALL eligible rows.
  SELECT
    count(*)::integer,
    (count(*) FILTER (
       WHERE b.leg IS DISTINCT FROM 'return' AND b.status <> 'cancelled'
     ))::integer,
    COALESCE(sum(
      COALESCE(
        b.amount_eur,
        CASE
          WHEN b.trip_type = 'round_trip'
           AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
          THEN round((COALESCE(b.outbound_amount_czk, 0) + COALESCE(b.return_amount_czk, 0)) * 0.04)::integer
        END
      )
    ) FILTER (
       WHERE b.leg IS DISTINCT FROM 'return'
         AND b.status <> 'cancelled'
         AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed')
     ), 0)::integer
    INTO v_total, v_trips, v_spent
    FROM public.booking_identity bi
    JOIN public.bookings b ON b.id = bi.booking_id
   WHERE bi.identity_id = v_identity
     AND b.anonymised_at IS NULL
     AND NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id);

  -- Capped, allowlisted rows.
  SELECT COALESCE(jsonb_agg(s.j ORDER BY s.rn), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT
        jsonb_build_object(
          'id',                       b.id,
          'booking_reference',        b.booking_reference,
          'status',                   b.status,
          'leg',                      b.leg,
          'trip_type',                b.trip_type,
          'pickup_utc',               b.pickup_utc,
          'pickup_date',              b.pickup_date,
          'pickup_time',              b.pickup_time,
          'origin_address',           b.origin_address,
          'destination_address',      b.destination_address,
          'hours',                    b.hours,
          'vehicle_class',            b.vehicle_class,
          'passengers',               b.passengers,
          'luggage',                  b.luggage,
          'amount_eur',               b.amount_eur,
          'outbound_amount_czk',      b.outbound_amount_czk,
          'return_amount_czk',        b.return_amount_czk,
          'paid_at',                  b.paid_at,
          'payment_link_url',         b.payment_link_url,
          'flight_number',            b.flight_number,
          'special_requests',         b.special_requests,
          'driver_name',              acc.driver_name,
          'trip_progress',            acc.trip_progress,
          'trip_progress_updated_at', acc.trip_progress_updated_at
        ) AS j,
        row_number() OVER (
          ORDER BY b.pickup_utc DESC NULLS LAST, b.pickup_date DESC, b.pickup_time DESC, b.created_at DESC
        ) AS rn
        FROM public.booking_identity bi
        JOIN public.bookings b ON b.id = bi.booking_id
        LEFT JOIN LATERAL (
          SELECT dr.name AS driver_name, da.trip_progress, da.trip_progress_updated_at
            FROM public.driver_assignments da
            JOIN public.drivers dr ON dr.id = da.driver_id
           WHERE da.booking_id = b.id
             AND da.status = 'accepted'
           ORDER BY da.created_at DESC
           LIMIT 1
        ) acc ON true
       WHERE bi.identity_id = v_identity
         AND b.anonymised_at IS NULL
         AND NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
       ORDER BY b.pickup_utc DESC NULLS LAST, b.pickup_date DESC, b.pickup_time DESC, b.created_at DESC
       LIMIT 200
    ) s;

  RETURN jsonb_build_object(
    'identity_found', true,
    'phone_mismatch', false,
    'espo_lead_id',   NULL,
    'total',          v_total,
    'trip_count',     v_trips,
    'spent_eur',      v_spent,
    'rows',           v_rows
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) TO service_role;
