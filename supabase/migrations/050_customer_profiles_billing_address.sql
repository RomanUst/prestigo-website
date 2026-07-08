-- Migration 050: customer_profiles billing address
-- Adds billing_address to customer_profiles so corporate accounts can store the
-- full postal address used on invoices (company registered / billing address).
-- Single idempotent ALTER, no RLS changes — the existing SELECT/INSERT/UPDATE
-- policies from migration 044 already cover the new column.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS billing_address TEXT;
