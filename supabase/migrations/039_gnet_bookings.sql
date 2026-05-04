-- Migration 039: gnet_bookings
-- Phase 47 — GNet Integration DB foundation (GNET-01, GNET-02)
-- Creates gnet_bookings table + extends bookings.booking_source CHECK to allow 'gnet'.
-- Inspection result from Task 1: constraint bookings_booking_source_check existed (CHECK (booking_source IN ('online', 'manual')))

-- Extend booking_source CHECK constraint to include 'gnet'
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_source_check
  CHECK (booking_source IN ('online', 'manual', 'gnet'));

-- Create gnet_bookings table
CREATE TABLE IF NOT EXISTS public.gnet_bookings (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID          NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  gnet_res_no       TEXT          NOT NULL,
  transaction_id    TEXT          NOT NULL,
  raw_payload       JSONB         NOT NULL DEFAULT '{}'::jsonb,
  last_push_status  TEXT,
  last_push_error   TEXT,
  last_pushed_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT gnet_bookings_gnet_res_no_key   UNIQUE (gnet_res_no),
  CONSTRAINT gnet_bookings_transaction_id_key UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS gnet_bookings_booking_id_idx
  ON public.gnet_bookings (booking_id);

-- RLS lockdown (deny all public access — service_role only via bypass)
ALTER TABLE public.gnet_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gnet_bookings_no_public_read ON public.gnet_bookings;
CREATE POLICY gnet_bookings_no_public_read
  ON public.gnet_bookings FOR SELECT
  USING (false);

DROP POLICY IF EXISTS gnet_bookings_no_public_insert ON public.gnet_bookings;
CREATE POLICY gnet_bookings_no_public_insert
  ON public.gnet_bookings FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS gnet_bookings_no_public_update ON public.gnet_bookings;
CREATE POLICY gnet_bookings_no_public_update
  ON public.gnet_bookings FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS gnet_bookings_no_public_delete ON public.gnet_bookings;
CREATE POLICY gnet_bookings_no_public_delete
  ON public.gnet_bookings FOR DELETE
  USING (false);
