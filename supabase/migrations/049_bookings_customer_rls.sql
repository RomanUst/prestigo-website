-- Migration 049: bookings customer RLS
-- Phase 60 — Auth-in-Checkout + Guest Path (ACCT-04)
-- Allows authenticated customers to SELECT their own bookings (where user_id matches auth.uid()).
-- Operators/service_role are unaffected — service_role bypasses RLS by default.
-- NO insert/update/delete policies for customers — all booking mutations go through
-- service_role (API routes and Stripe webhook).

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select_own ON public.bookings;
CREATE POLICY bookings_select_own
  ON public.bookings FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));
