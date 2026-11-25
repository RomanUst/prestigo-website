-- 100: driver cabinet schema (Phase 94 plan 94-01, DCAB-01/02/03/12/13, D-05/D-06/D-16).
--
-- Applied LIVE by the orchestrator via the Supabase MCP (plan 94-01 Task 3); additive only: drivers / driver_assignments /
-- bookings keep their live RLS and policies untouched. Nobody is invited by this migration (cabinet_enabled defaults to
-- false, no row changes value, no data is inserted).
--
-- What it adds:
--   drivers.cabinet_enabled / cabinet_invited_at / vehicle_plate
--   driver_login_codes        6-digit email codes, stored as sha256(codeId:code) only
--   driver_sessions           30-day cabinet sessions, stored as sha256(token) only
--   driver_push_subscriptions Web Push endpoints (one row per browser)
--   two driver_assignments indexes for the cabinet lists
--   consume_driver_login_code atomic attempt counting / expiry / single use under a row lock
--
-- Rollback: DROP FUNCTION public.consume_driver_login_code(uuid, uuid, text); DROP the two driver_assignments indexes;
-- DROP TABLE public.driver_push_subscriptions, public.driver_sessions, public.driver_login_codes;
-- ALTER TABLE public.drivers DROP CONSTRAINT drivers_vehicle_plate_check, DROP COLUMN vehicle_plate,
-- DROP COLUMN cabinet_invited_at, DROP COLUMN cabinet_enabled.

-- == 1. drivers: cabinet columns =====================================================================================
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS cabinet_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS cabinet_invited_at timestamptz NULL;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS vehicle_plate text NULL;

ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_vehicle_plate_check;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_vehicle_plate_check
  CHECK (vehicle_plate IS NULL OR char_length(vehicle_plate) BETWEEN 1 AND 16);

-- == 2. driver_login_codes ===========================================================================================
-- The server always passes its own id: the id salts the hash.
CREATE TABLE IF NOT EXISTS public.driver_login_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  code_hash   text        NOT NULL
    CONSTRAINT driver_login_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  attempts    smallint    NOT NULL DEFAULT 0
    CONSTRAINT driver_login_codes_attempts_check CHECK (attempts BETWEEN 0 AND 5),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_login_codes_driver_idx
  ON public.driver_login_codes (driver_id, created_at DESC);

-- == 3. driver_sessions ==============================================================================================
-- Sign-out and disable DELETE rows (no revoked flag).
CREATE TABLE IF NOT EXISTS public.driver_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE
    CONSTRAINT driver_sessions_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_sessions_driver_idx
  ON public.driver_sessions (driver_id);

-- == 4. driver_push_subscriptions ====================================================================================
CREATE TABLE IF NOT EXISTS public.driver_push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE
    CONSTRAINT driver_push_endpoint_check CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh      text        NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 200),
  auth        text        NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_push_subscriptions_driver_idx
  ON public.driver_push_subscriptions (driver_id);

-- == 5. driver_assignments: indexes for the cabinet lists ============================================================
CREATE INDEX IF NOT EXISTS driver_assignments_driver_created_idx
  ON public.driver_assignments (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS driver_assignments_booking_created_idx
  ON public.driver_assignments (booking_id, created_at DESC);

-- == 6. deny-all for the three new tables ============================================================================
-- Only the service role (which bypasses RLS) reads and writes them; nothing is granted to anon or authenticated.
REVOKE ALL ON public.driver_login_codes FROM anon, authenticated;
ALTER TABLE public.driver_login_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_login_codes_no_public_read ON public.driver_login_codes;
CREATE POLICY driver_login_codes_no_public_read
  ON public.driver_login_codes FOR SELECT
  USING (false);
DROP POLICY IF EXISTS driver_login_codes_no_public_insert ON public.driver_login_codes;
CREATE POLICY driver_login_codes_no_public_insert
  ON public.driver_login_codes FOR INSERT
  WITH CHECK (false);

REVOKE ALL ON public.driver_sessions FROM anon, authenticated;
ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_sessions_no_public_read ON public.driver_sessions;
CREATE POLICY driver_sessions_no_public_read
  ON public.driver_sessions FOR SELECT
  USING (false);
DROP POLICY IF EXISTS driver_sessions_no_public_insert ON public.driver_sessions;
CREATE POLICY driver_sessions_no_public_insert
  ON public.driver_sessions FOR INSERT
  WITH CHECK (false);

REVOKE ALL ON public.driver_push_subscriptions FROM anon, authenticated;
ALTER TABLE public.driver_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_push_subscriptions_no_public_read ON public.driver_push_subscriptions;
CREATE POLICY driver_push_subscriptions_no_public_read
  ON public.driver_push_subscriptions FOR SELECT
  USING (false);
DROP POLICY IF EXISTS driver_push_subscriptions_no_public_insert ON public.driver_push_subscriptions;
CREATE POLICY driver_push_subscriptions_no_public_insert
  ON public.driver_push_subscriptions FOR INSERT
  WITH CHECK (false);

-- == 7. consume_driver_login_code ====================================================================================
-- Locks the code row, so five parallel guesses still count five. Returns:
--   'dead'  : missing, belongs to another driver, already consumed, expired, or 5 attempts already used
--   'ok'    : the hash matched; the code is consumed (single use)
--   'wrong' : the hash did not match; the attempt is counted
CREATE OR REPLACE FUNCTION public.consume_driver_login_code(
  p_driver_id uuid,
  p_code_id   uuid,
  p_code_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.driver_login_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.driver_login_codes
   WHERE id = p_code_id
     AND driver_id = p_driver_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_row.consumed_at IS NOT NULL
     OR v_row.expires_at <= now()
     OR v_row.attempts >= 5 THEN
    RETURN 'dead';
  END IF;

  UPDATE public.driver_login_codes
     SET attempts = attempts + 1
   WHERE id = v_row.id;

  IF v_row.code_hash = p_code_hash THEN
    UPDATE public.driver_login_codes
       SET consumed_at = now()
     WHERE id = v_row.id;
    RETURN 'ok';
  END IF;

  RETURN 'wrong';
END;
$$;

-- A freshly created function is executable by PUBLIC: re-revoke after every (re-)create.
REVOKE EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, uuid, text) TO service_role;
