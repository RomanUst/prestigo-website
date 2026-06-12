-- Migration 048: saved_passengers
-- Phase 58 — Sign-in UI + Account Dashboard (ACCT-02, D-07)
-- Creates the saved_passengers table with own-row RLS mirroring migration 044.
-- Key differences from customer_profiles:
--   - user_id is NOT UNIQUE (one user has many passengers)
--   - DELETE policy IS included (users can delete their own passengers)
--   - Partial unique index enforces a single default passenger per user (DB-layer,
--     race-condition-free — see RESEARCH Pattern 5 / Pitfall 3)

CREATE TABLE IF NOT EXISTS public.saved_passengers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  email      TEXT,
  notes      TEXT,
  is_default BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on user_id for fast own-row lookups
CREATE INDEX IF NOT EXISTS saved_passengers_user_id_idx
  ON public.saved_passengers (user_id);

-- Partial unique index: only one row per user can have is_default = true.
-- Concurrent "set default" requests will get a unique-constraint violation
-- rather than producing two defaults (DB-enforced, no app-logic race window).
CREATE UNIQUE INDEX IF NOT EXISTS saved_passengers_one_default_per_user
  ON public.saved_passengers (user_id)
  WHERE is_default = true;

ALTER TABLE public.saved_passengers ENABLE ROW LEVEL SECURITY;

-- Users can only read their own rows
DROP POLICY IF EXISTS saved_passengers_select_own ON public.saved_passengers;
CREATE POLICY saved_passengers_select_own
  ON public.saved_passengers FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Users can insert only their own rows
DROP POLICY IF EXISTS saved_passengers_insert_own ON public.saved_passengers;
CREATE POLICY saved_passengers_insert_own
  ON public.saved_passengers FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Users can update only their own rows
DROP POLICY IF EXISTS saved_passengers_update_own ON public.saved_passengers;
CREATE POLICY saved_passengers_update_own
  ON public.saved_passengers FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Users CAN delete their own passengers (unlike customer_profiles where rows
-- are removed only via ON DELETE CASCADE from auth.users).
DROP POLICY IF EXISTS saved_passengers_delete_own ON public.saved_passengers;
CREATE POLICY saved_passengers_delete_own
  ON public.saved_passengers FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- updated_at trigger: keep updated_at fresh on every UPDATE
-- (mirrors migration 046 pattern for customer_profiles)
CREATE OR REPLACE FUNCTION public.saved_passengers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_passengers_set_updated_at ON public.saved_passengers;
CREATE TRIGGER saved_passengers_set_updated_at
  BEFORE UPDATE ON public.saved_passengers
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_passengers_set_updated_at();
