-- Migration 047: customer_profiles profile fields
-- Phase 58 — Sign-in UI + Account Dashboard (ACCT-02, ACCT-03, D-03, D-06)
-- Adds full_name, phone (D-06) and ico, vat_id (D-03) to customer_profiles.
-- NOTE: full_name and phone are required by ACCT-02 and do NOT exist in migration 044.
-- All four columns are added in one idempotent ALTER TABLE so 047 is a single unit.
-- No RLS changes — the existing SELECT/INSERT/UPDATE policies from migration 044
-- already cover the new columns; no new policies are required.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone     TEXT,
  ADD COLUMN IF NOT EXISTS ico       TEXT,
  ADD COLUMN IF NOT EXISTS vat_id    TEXT;
