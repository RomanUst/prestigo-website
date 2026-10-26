-- 076: Inbound webhooks (Phase 83 — Chatwoot / EspoCRM events -> site)
--
-- Why the receiver is thin (D-15): Chatwoot gives a webhook 5 seconds and never retries, so the
-- route does the minimum — verify the HMAC over the raw bytes, filter, then call ONE function
-- here. webhook_ingest dedups the delivery, applies the loop fuse and enqueues one ids-only
-- hook.* outbox row in a single transaction. All real work (reading Chatwoot / EspoCRM, creating
-- Leads) happens later in the QStash-invoked dispatcher, which re-reads the source system.
--
-- Capture is OFF until go-live (plan 83-14) writes integration_config key 'chat_hooks_start'.
-- While that key is absent or not a timestamp, webhook_ingest and webhook_ingest_espo return
-- 'off' and write nothing: fail-closed and forward-only, the same shape as lead_capture_start.
--
-- The event-type allowlist lives INSIDE webhook_ingest on purpose: the route runs with the
-- service role, so a bug (or a forged-but-validly-signed request) must still never be able to
-- enqueue lead.*, sync.*, erase.* or any other event type through this door.
--
-- webhook_deliveries holds ids and hashes only (no name, email, phone or message body), so
-- erasure does not have to scrub it. Service-role only: RLS on with deny-all policies, privileges
-- revoked from anon/authenticated, EXECUTE revoked from PUBLIC, anon and authenticated per
-- function (DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: always re-run
-- the REVOKE lines).

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  source      text        NOT NULL CHECK (source IN ('chatwoot', 'espocrm')),
  delivery_id text        NOT NULL CHECK (char_length(delivery_id) BETWEEN 8 AND 128 AND delivery_id ~ '^[A-Za-z0-9:_-]+$'),
  entity_key  text        NOT NULL CHECK (entity_key ~ '^(cw:conv|cw:contact|espo:contact):[0-9a-z]{1,24}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, delivery_id)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_entity_idx
  ON public.webhook_deliveries (source, entity_key, received_at);

-- ── RLS: deny-all, service role bypasses ────────────────────────────────────
REVOKE ALL ON public.webhook_deliveries FROM anon, authenticated;

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_deliveries_no_public_read ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_no_public_read
  ON public.webhook_deliveries FOR SELECT
  USING (false);

DROP POLICY IF EXISTS webhook_deliveries_no_public_insert ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_no_public_insert
  ON public.webhook_deliveries FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS webhook_deliveries_no_public_update ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_no_public_update
  ON public.webhook_deliveries FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS webhook_deliveries_no_public_delete ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_no_public_delete
  ON public.webhook_deliveries FOR DELETE
  USING (false);

-- ── webhook_ingest: the only database entry of the Chatwoot receiver ────────
-- Outcomes: 'off' (gate closed), 'duplicate' (delivery seen), 'fused' (entity over p_fuse_limit
-- deliveries in 10 minutes), 'queued' (outbox row inserted), 'exists' (outbox key already there).
CREATE OR REPLACE FUNCTION public.webhook_ingest(
  p_source         text,
  p_delivery_id    text,
  p_entity_key     text,
  p_fuse_limit     integer,
  p_event_type     text,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_key            text,
  p_available_at   timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start  timestamptz;
  v_rows   integer;
  v_recent integer;
BEGIN
  -- Allowlist: only the four Chatwoot hook types, and the key must belong to the event type.
  IF p_source IS DISTINCT FROM 'chatwoot'
     OR p_event_type IS NULL
     OR p_event_type !~ '^hook\.(chat_intake|chat_resolve|chat_label|chat_contact)$'
     OR p_key IS NULL
     OR NOT starts_with(p_key, p_event_type || ':') THEN
    RAISE EXCEPTION 'webhook_ingest_bad_event';
  END IF;

  -- Forward-only gate: an unreadable or non-timestamp value counts as "off".
  BEGIN
    SELECT c.value::timestamptz INTO v_start
      FROM public.integration_config c WHERE c.key = 'chat_hooks_start';
  EXCEPTION WHEN OTHERS THEN
    v_start := NULL;
  END;
  IF v_start IS NULL THEN
    RETURN 'off';
  END IF;

  INSERT INTO public.webhook_deliveries (source, delivery_id, entity_key)
  VALUES (p_source, p_delivery_id, p_entity_key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  -- Loop fuse: too many deliveries for one entity inside 10 minutes enqueues nothing.
  IF p_fuse_limit IS NOT NULL THEN
    SELECT count(*) INTO v_recent
      FROM public.webhook_deliveries d
     WHERE d.source = p_source
       AND d.entity_key = p_entity_key
       AND d.received_at > now() - interval '10 minutes';
    IF v_recent > p_fuse_limit THEN
      RETURN 'fused';
    END IF;
  END IF;

  IF public.outbox_enqueue(p_event_type, p_aggregate_type, p_aggregate_id, p_key, COALESCE(p_available_at, now())) THEN
    RETURN 'queued';
  END IF;
  RETURN 'exists';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.webhook_ingest(text, text, text, integer, text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_ingest(text, text, text, integer, text, text, uuid, text, timestamptz) TO service_role;
