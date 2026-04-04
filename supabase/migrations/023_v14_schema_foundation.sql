-- 023_v14_schema_foundation.sql
-- Phase 23: v1.4 schema additions for round-trip booking support
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-04

-- STEP 1 — Add `leg` column to bookings
-- Default 'outbound' auto-backfills all existing one-way rows. No separate UPDATE needed.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS leg TEXT NOT NULL DEFAULT 'outbound'
    CHECK (leg IN ('outbound', 'return'));

-- STEP 2 — Replace single-column UNIQUE with composite UNIQUE
-- The old constraint name bookings_payment_intent_id_key is the Postgres auto-generated name
-- from `payment_intent_id text UNIQUE` in 0001_create_bookings.sql.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_intent_id_key;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_intent_id_leg_key
    UNIQUE (payment_intent_id, leg);

-- STEP 3 — Add self-referential `linked_booking_id` FK
-- Must be SET NULL (not CASCADE) — cancelling one leg must not delete the other.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS linked_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- STEP 4 — Add per-leg amount columns to bookings
-- Both nullable. One-way bookings leave these NULL; round-trip bookings populate both.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS outbound_amount_czk INTEGER,
  ADD COLUMN IF NOT EXISTS return_amount_czk   INTEGER;

-- STEP 5 — Add `return_discount_pct` to pricing_globals
-- Default 10 means 10% discount on return leg.
-- The singleton pricing_globals row (id=1) gets this value automatically.
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS return_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10;

-- STEP 6 — Create atomic round-trip booking RPC
-- Accepts two JSONB arguments (outbound and return row data).
-- Inserts both rows inside a single transaction and cross-links them after both have IDs.
-- If either INSERT raises an exception, the entire transaction rolls back automatically.
CREATE OR REPLACE FUNCTION create_round_trip_bookings(
  p_outbound JSONB,
  p_return   JSONB
)
RETURNS TABLE(outbound_id UUID, return_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_outbound_id UUID;
  v_return_id   UUID;
BEGIN
  -- Insert outbound row (leg = 'outbound' already in p_outbound)
  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source
  )
  SELECT
    p_outbound->>'booking_reference',
    p_outbound->>'payment_intent_id',
    'outbound',
    p_outbound->>'booking_type',
    p_outbound->>'trip_type',
    p_outbound->>'origin_address',
    (p_outbound->>'origin_lat')::float8,
    (p_outbound->>'origin_lng')::float8,
    p_outbound->>'destination_address',
    (p_outbound->>'destination_lat')::float8,
    (p_outbound->>'destination_lng')::float8,
    (p_outbound->>'passengers')::integer,
    (p_outbound->>'luggage')::integer,
    p_outbound->>'pickup_date',
    p_outbound->>'pickup_time',
    p_outbound->>'vehicle_class',
    (p_outbound->>'distance_km')::float8,
    (p_outbound->>'amount_czk')::integer,
    (p_outbound->>'outbound_amount_czk')::integer,
    (p_outbound->>'return_amount_czk')::integer,
    (p_outbound->>'extra_child_seat')::boolean,
    (p_outbound->>'extra_meet_greet')::boolean,
    (p_outbound->>'extra_luggage')::boolean,
    p_outbound->>'client_first_name',
    p_outbound->>'client_last_name',
    p_outbound->>'client_email',
    p_outbound->>'client_phone',
    p_outbound->>'flight_number',
    p_outbound->>'terminal',
    p_outbound->>'special_requests',
    COALESCE(p_outbound->>'status', 'confirmed'),
    COALESCE(p_outbound->>'booking_source', 'online')
  RETURNING id INTO v_outbound_id;

  -- Insert return row (leg = 'return' already in p_return)
  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source,
    linked_booking_id
  )
  SELECT
    p_return->>'booking_reference',
    p_return->>'payment_intent_id',
    'return',
    p_return->>'booking_type',
    p_return->>'trip_type',
    p_return->>'origin_address',
    (p_return->>'origin_lat')::float8,
    (p_return->>'origin_lng')::float8,
    p_return->>'destination_address',
    (p_return->>'destination_lat')::float8,
    (p_return->>'destination_lng')::float8,
    (p_return->>'passengers')::integer,
    (p_return->>'luggage')::integer,
    p_return->>'pickup_date',
    p_return->>'pickup_time',
    p_return->>'vehicle_class',
    (p_return->>'distance_km')::float8,
    (p_return->>'amount_czk')::integer,
    (p_return->>'outbound_amount_czk')::integer,
    (p_return->>'return_amount_czk')::integer,
    (p_return->>'extra_child_seat')::boolean,
    (p_return->>'extra_meet_greet')::boolean,
    (p_return->>'extra_luggage')::boolean,
    p_return->>'client_first_name',
    p_return->>'client_last_name',
    p_return->>'client_email',
    p_return->>'client_phone',
    p_return->>'flight_number',
    p_return->>'terminal',
    p_return->>'special_requests',
    COALESCE(p_return->>'status', 'confirmed'),
    COALESCE(p_return->>'booking_source', 'online'),
    v_outbound_id  -- links return -> outbound
  RETURNING id INTO v_return_id;

  -- Cross-link: update outbound row to point to return
  UPDATE bookings SET linked_booking_id = v_return_id WHERE id = v_outbound_id;

  RETURN QUERY SELECT v_outbound_id, v_return_id;
END;
$$;
