-- 064: Integration outbox (Phase 81 — lead capture to EspoCRM)
--
-- A durable, PII-free work queue. Rows carry ONLY ids and an idempotency key
-- (e.g. 'lead.inquiry:<uuid>'); the dispatcher re-reads the source row when it
-- delivers, so nothing here ever holds an email, name, phone or message, and
-- Phase 82 erasure does not have to scrub this table. `last_error` is
-- constrained to a short lowercase code so a response body can never land in it.
--
-- Service-role only: RLS is on with explicit deny-all policies, privileges are
-- revoked from anon/authenticated, and every function has EXECUTE revoked from
-- PUBLIC, anon and authenticated (SECURITY DEFINER functions get PUBLIC EXECUTE
-- by default) and granted to service_role only.
--
-- outbox_claim takes a transaction-scoped advisory lock per aggregate BEFORE it
-- claims. Without the lock two concurrent claims for different keys of the same
-- aggregate (e.g. 'new' and 'converted' for one booking) could both pass the
-- NOT EXISTS check under READ COMMITTED and both run their side effect.
--
-- integration_config seeds NOTHING here: the `lead_capture_start` key is written
-- at go-live (plan 81-11); its absence means booking capture is off.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,
  aggregate_type  text        NOT NULL,
  aggregate_id    uuid        NOT NULL,
  idempotency_key text        NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempts        integer     NOT NULL DEFAULT 0,
  available_at    timestamptz NOT NULL DEFAULT now(),
  lease_until     timestamptz,
  last_error      text        CHECK (last_error IS NULL OR last_error ~ '^[a-z0-9_]{1,40}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_outbox_key_idx
  ON public.integration_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS integration_outbox_due_idx
  ON public.integration_outbox (available_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS integration_outbox_agg_idx
  ON public.integration_outbox (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS public.integration_config (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at maintenance (042 / 046 convention) ───────────────────────────
CREATE OR REPLACE FUNCTION public.integration_outbox_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS integration_outbox_set_updated_at ON public.integration_outbox;
CREATE TRIGGER integration_outbox_set_updated_at
  BEFORE UPDATE ON public.integration_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.integration_outbox_set_updated_at();

-- ── RLS: deny-all, service role bypasses ────────────────────────────────────
REVOKE ALL ON public.integration_outbox, public.integration_config FROM anon, authenticated;

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_outbox_no_public_read ON public.integration_outbox;
CREATE POLICY integration_outbox_no_public_read
  ON public.integration_outbox FOR SELECT
  USING (false);

DROP POLICY IF EXISTS integration_outbox_no_public_insert ON public.integration_outbox;
CREATE POLICY integration_outbox_no_public_insert
  ON public.integration_outbox FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS integration_config_no_public_read ON public.integration_config;
CREATE POLICY integration_config_no_public_read
  ON public.integration_config FOR SELECT
  USING (false);

DROP POLICY IF EXISTS integration_config_no_public_insert ON public.integration_config;
CREATE POLICY integration_config_no_public_insert
  ON public.integration_config FOR INSERT
  WITH CHECK (false);

-- ── outbox_enqueue: the single insert path into the outbox ──────────────────
CREATE OR REPLACE FUNCTION public.outbox_enqueue(
  p_event_type     text,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_key            text,
  p_available_at   timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.integration_outbox
    (event_type, aggregate_type, aggregate_id, idempotency_key, available_at)
  VALUES
    (p_event_type, p_aggregate_type, p_aggregate_id, p_key, COALESCE(p_available_at, now()))
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ── outbox_claim: lease claim with a per-aggregate mutex ────────────────────
CREATE OR REPLACE FUNCTION public.outbox_claim(p_key text, p_lease_seconds integer)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
  SELECT o.aggregate_type, o.aggregate_id
    INTO v_type, v_id
    FROM public.integration_outbox o
   WHERE o.idempotency_key = p_key;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Serialise every claim for this aggregate until the transaction ends.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_type || ':' || v_id::text, 0));

  RETURN QUERY
  UPDATE public.integration_outbox o
     SET status      = 'processing',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts    = o.attempts + 1,
         updated_at  = now()
   WHERE o.idempotency_key = p_key
     AND o.available_at <= now()
     AND (o.status = 'pending'
          OR (o.status = 'processing' AND o.lease_until < now()))
     AND NOT EXISTS (
           SELECT 1
             FROM public.integration_outbox x
            WHERE x.aggregate_type = o.aggregate_type
              AND x.aggregate_id   = o.aggregate_id
              AND x.id            <> o.id
              AND x.status         = 'processing'
              AND x.lease_until    > now()
         )
  RETURNING o.*;
END;
$$;

-- ── outbox_complete: terminal state for a claimed row ───────────────────────
CREATE OR REPLACE FUNCTION public.outbox_complete(
  p_key        text,
  p_status     text,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'outbox_complete: invalid status';
  END IF;

  UPDATE public.integration_outbox
     SET status      = p_status,
         lease_until = NULL,
         last_error  = p_error_code,
         sent_at     = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
         updated_at  = now()
   WHERE idempotency_key = p_key
     AND status = 'processing';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ── outbox_reschedule: back to pending for a later retry ────────────────────
CREATE OR REPLACE FUNCTION public.outbox_reschedule(
  p_key          text,
  p_available_at timestamptz,
  p_error_code   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.integration_outbox
     SET status       = 'pending',
         available_at = p_available_at,
         lease_until  = NULL,
         last_error   = p_error_code,
         updated_at   = now()
   WHERE idempotency_key = p_key
     AND status = 'processing';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default — revoke it, then
-- grant to service_role only (DROP+CREATE would re-grant PUBLIC; always re-run).
REVOKE EXECUTE ON FUNCTION public.integration_outbox_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_enqueue(text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_claim(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_complete(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_reschedule(text, timestamptz, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outbox_enqueue(text, text, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_claim(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_complete(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_reschedule(text, timestamptz, text) TO service_role;
