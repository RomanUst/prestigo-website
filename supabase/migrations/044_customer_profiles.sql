-- Migration 044: customer_profiles
-- Phase 57 — Customer Auth Foundation (AUTH-06)
-- Creates the customer_profiles table keyed to auth.users with RLS isolating
-- each customer to their own row. account_type uses TEXT + CHECK (not an enum)
-- to stay alterable, matching the existing bookings status/source convention.

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type TEXT        NOT NULL DEFAULT 'personal'
                           CHECK (account_type IN ('personal', 'corporate')),
  company_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_profiles_user_id_idx
  ON public.customer_profiles (user_id);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
DROP POLICY IF EXISTS customer_profiles_select_own ON public.customer_profiles;
CREATE POLICY customer_profiles_select_own
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Users can insert only their own row
DROP POLICY IF EXISTS customer_profiles_insert_own ON public.customer_profiles;
CREATE POLICY customer_profiles_insert_own
  ON public.customer_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Users can update only their own row
DROP POLICY IF EXISTS customer_profiles_update_own ON public.customer_profiles;
CREATE POLICY customer_profiles_update_own
  ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- No DELETE policy: customers cannot delete their profile row (rows are removed
-- only via ON DELETE CASCADE when the auth.users row is deleted).
-- service_role bypasses RLS by default — no explicit service-role policy needed.
