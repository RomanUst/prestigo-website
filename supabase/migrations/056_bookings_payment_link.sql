-- Migration 056: bookings_payment_link
-- Phase 64 — Admin-Created Bookings with Payment Link (D-03/D-04/D-05/D-09)
--
-- Payment Links are STATIC, reusable URLs — re-calling paymentLinks.create()
-- would mint a second, different URL, violating D-04 ("one link per booking,
-- reusable, re-sendable"). These columns persist the ONE link generated for
-- a booking so it can be displayed, copied, and re-sent without regenerating.
--
-- Nullable — most bookings (cash/invoice, D-05/ANEW-05) never get a payment
-- link. No status-enum change needed here — this migration reuses the
-- 'unpaid' status value already added by migration 053.
--
-- Schema FILE only — live application against the remote Supabase project is
-- the [BLOCKING] task in Plan 64-04.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_url text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_id text;
