-- 018_v13_schema_foundation.sql
-- Phase 18: v1.3 schema additions
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-03

-- 1. bookings: make payment_intent_id nullable (manual bookings have no Stripe reference)
ALTER TABLE bookings ALTER COLUMN payment_intent_id DROP NOT NULL;

-- 2. bookings: add status, operator_notes, booking_source columns
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'online'
    CHECK (booking_source IN ('online', 'manual'));

-- 3. Backfill existing rows: all existing bookings are paid wizard bookings
UPDATE bookings SET status = 'confirmed', booking_source = 'online';

-- 4. promo_codes table (empty — admin CRUD comes in Phase 22)
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE,
  discount_type  TEXT        NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC(5,2) NOT NULL,
  expiry_date    DATE,
  max_uses       INTEGER,
  current_uses   INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. pricing_globals: holiday_dates column (admin UI comes in Phase 21)
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS holiday_dates JSONB NOT NULL DEFAULT '[]';
