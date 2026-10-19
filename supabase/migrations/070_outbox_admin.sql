-- 070: Outbox admin health + retry (Phase 82, plan 82-02, SYNC-05, D-12)
--
-- Four service-role functions behind the /admin/outbox page:
--
--   outbox_health()                 counts of pending / processing / failed / stuck rows, the age
--                                   of the oldest pending row, sent in the last 24 h, and a
--                                   per-event-type breakdown of the open rows. "Stuck" = pending
--                                   with available_at more than 6 hours in the past, or
--                                   processing with an expired lease. The pending and processing
--                                   counts exclude stuck rows, so the buckets never overlap.
--   outbox_open_events(status, n)   the latest open rows (pending, processing, failed), newest
--                                   first, capped at 100. Ids, codes and the booking reference
--                                   only: a reference is not PII, and no name, email or phone
--                                   column is ever selected.
--   outbox_retry(key)               puts ONE failed (or still-pending) row back on the queue.
--   outbox_retry_failed(n)          puts every failed row back on the queue (oldest first,
--                                   cap 500) and returns the keys so the route can publish them.
--
-- Why outbox_reschedule (064) cannot be reused: it only accepts rows in `processing`, so it
-- cannot revive a terminal `failed` row.
--
-- A retry sets status pending, attempts 0, available_at now() and clears the lease. It KEEPS
-- last_error: the owner keeps seeing why the row failed until a delivery succeeds (the dispatcher
-- clears it on success).
--
-- Processing rows are NEVER touched by a retry. A row in `processing` is in flight; the claim
-- lease and the per-aggregate advisory lock of outbox_claim (064) stay the only authority over
-- it, so a retry-all during a delivery cannot make the same event run twice.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the
-- bottom must always be re-run.

-- ── Health counters ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pending    integer;
  v_processing integer;
  v_failed     integer;
  v_stuck      integer;
  v_oldest     numeric;
  v_sent_24h   integer;
  v_by_type    jsonb;
BEGIN
  SELECT
    count(*) FILTER (WHERE o.status = 'pending'
                       AND o.available_at >= now() - interval '6 hours'),
    count(*) FILTER (WHERE o.status = 'processing'
                       AND (o.lease_until IS NULL OR o.lease_until >= now())),
    count(*) FILTER (WHERE o.status = 'failed'),
    count(*) FILTER (WHERE (o.status = 'pending' AND o.available_at < now() - interval '6 hours')
                        OR (o.status = 'processing' AND o.lease_until < now())),
    extract(epoch FROM (now() - min(o.available_at) FILTER (WHERE o.status = 'pending'))),
    count(*) FILTER (WHERE o.status = 'sent' AND o.sent_at >= now() - interval '24 hours')
  INTO v_pending, v_processing, v_failed, v_stuck, v_oldest, v_sent_24h
  FROM public.integration_outbox o;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'event_type', t.event_type, 'status', t.status, 'count', t.n
         ) ORDER BY t.event_type, t.status), '[]'::jsonb)
    INTO v_by_type
    FROM (
      SELECT o.event_type, o.status, count(*)::integer AS n
        FROM public.integration_outbox o
       WHERE o.status IN ('pending', 'processing', 'failed')
       GROUP BY o.event_type, o.status
    ) t;

  RETURN jsonb_build_object(
    'pending',                v_pending,
    'processing',             v_processing,
    'failed',                 v_failed,
    'stuck',                  v_stuck,
    'open_total',             v_pending + v_processing + v_failed + v_stuck,
    'oldest_pending_seconds', CASE WHEN v_oldest IS NULL THEN NULL ELSE greatest(floor(v_oldest), 0) END,
    'sent_last_24h',          v_sent_24h,
    'by_type',                v_by_type
  );
END;
$$;

-- ── Latest open events ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_open_events(p_status text, p_limit integer)
RETURNS TABLE (
  idempotency_key   text,
  event_type        text,
  aggregate_type    text,
  aggregate_id      uuid,
  status            text,
  stuck             boolean,
  attempts          integer,
  last_error        text,
  available_at      timestamptz,
  updated_at        timestamptz,
  booking_reference text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT o.idempotency_key,
         o.event_type,
         o.aggregate_type,
         o.aggregate_id,
         o.status,
         ((o.status = 'pending' AND o.available_at < now() - interval '6 hours')
           OR (o.status = 'processing' AND o.lease_until < now())),
         o.attempts,
         o.last_error,
         o.available_at,
         o.updated_at,
         b.booking_reference
    FROM public.integration_outbox o
    LEFT JOIN public.bookings b
           ON o.aggregate_type = 'booking' AND b.id = o.aggregate_id
   WHERE o.status IN ('pending', 'processing', 'failed')
     AND (p_status IS NULL OR o.status = p_status)
   ORDER BY o.updated_at DESC
   LIMIT least(greatest(p_limit, 1), 100);
END;
$$;

-- ── Retry one ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_retry(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.integration_outbox o
     SET status       = 'pending',
         attempts     = 0,
         available_at = now(),
         lease_until  = NULL
   WHERE o.idempotency_key = p_key
     AND o.status IN ('failed', 'pending');
  RETURN FOUND;
END;
$$;

-- ── Retry every failed row ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_retry_failed(p_limit integer)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.integration_outbox o
     SET status       = 'pending',
         attempts     = 0,
         available_at = now(),
         lease_until  = NULL
   WHERE o.status = 'failed'
     AND o.idempotency_key IN (
       SELECT f.idempotency_key
         FROM public.integration_outbox f
        WHERE f.status = 'failed'
        ORDER BY f.updated_at
        LIMIT least(greatest(p_limit, 1), 500)
     )
  RETURNING o.idempotency_key;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it.
REVOKE EXECUTE ON FUNCTION public.outbox_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_open_events(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_retry(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_retry_failed(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outbox_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_open_events(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_retry(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_retry_failed(integer) TO service_role;
