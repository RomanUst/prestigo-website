-- Migration 045: bookings_user_id
-- Phase 57 — Customer Auth Foundation (ACCT-04)
-- Adds a NULLABLE user_id FK to bookings so logged-in customers' bookings can be
-- linked later (Phase 60). CRITICAL: no NOT NULL, no DEFAULT — existing anonymous
-- bookings (buildBookingRow never sets user_id) continue to insert with NULL.
-- This migration adds NO customer-facing RLS to bookings (that is Phase 60 scope).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id uuid
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_user_id_idx
  ON public.bookings (user_id)
  WHERE user_id IS NOT NULL;
