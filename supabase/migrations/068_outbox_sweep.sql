-- 068: daily outbox sweep (Phase 81, plan 81-10)
--
-- Three service-role functions behind ONE daily Vercel cron (/api/cron/outbox-sweep):
--
--   outbox_enqueue_expired_unpaid()   D-03: an unpaid outbound booking whose pickup is strictly in
--                                     the past gets the key 'lead.booking:<id>:dead'. The dispatcher
--                                     then builds the Lead from the CURRENT booking row, so a booking
--                                     that was paid in the meantime stays Converted.
--   outbox_enqueue_abandoned_purge()  D-15 / D-20: an abandoned ONLINE checkout (unpaid, no payment
--                                     link, outbound) whose pickup is strictly more than 90 days
--                                     behind gets the key 'lead.purge:<id>'. Manual and payment-link
--                                     bookings are never selected: their Leads stay.
--   outbox_due_keys(p_limit)          keys of rows that are due (pending, available_at <= now()) or
--                                     stuck (processing with an expired lease), so the sweep can
--                                     re-publish them. This is the safety net behind success
--                                     criterion 7: a lost QStash message or kick delays a Lead by
--                                     at most a day and never loses it.
--
-- Cadence: the cron runs once a day, so "Dead after pickup" may lag the pickup by up to ~25 h.
--
-- Forward-only (D-21): only bookings created at or after integration_config 'lead_capture_start'
-- are considered. While that key is absent (capture off) both enqueue functions return 0.
--
-- The functions only INSERT into integration_outbox (ON CONFLICT DO NOTHING on the key, so a
-- repeated run never duplicates work). They never touch the bookings table. The purge itself
-- (delete of the EspoCRM Lead) happens in the dispatcher, which re-checks the live booking row.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the
-- bottom must always be re-run.

-- ── D-03: unpaid checkouts past pickup become Dead ──────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_enqueue_expired_unpaid()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_n     integer;
BEGIN
  v_start := (
    SELECT c.value FROM public.integration_config c WHERE c.key = 'lead_capture_start'
  )::timestamptz;
  IF v_start IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, available_at)
  SELECT 'lead.booking', 'booking', b.id, 'lead.booking:' || b.id::text || ':dead', now()
    FROM public.bookings b
   WHERE b.status = 'unpaid'
     AND b.pickup_utc < now()
     AND b.leg IS DISTINCT FROM 'return'
     AND b.created_at >= v_start
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── D-15 / D-20: abandoned ONLINE checkouts are purged from the CRM after 90 days ──
CREATE OR REPLACE FUNCTION public.outbox_enqueue_abandoned_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_n     integer;
BEGIN
  v_start := (
    SELECT c.value FROM public.integration_config c WHERE c.key = 'lead_capture_start'
  )::timestamptz;
  IF v_start IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, available_at)
  SELECT 'lead.purge', 'booking', b.id, 'lead.purge:' || b.id::text, now()
    FROM public.bookings b
   WHERE b.booking_source = 'online'
     AND b.status = 'unpaid'
     AND b.payment_link_id IS NULL
     AND b.leg IS DISTINCT FROM 'return'
     AND b.created_at >= v_start
     AND b.pickup_utc < now() - interval '90 days'
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── Safety net: keys the sweep must re-publish ──────────────────────────────
CREATE OR REPLACE FUNCTION public.outbox_due_keys(p_limit integer)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT o.idempotency_key
    FROM public.integration_outbox o
   WHERE (o.status = 'pending' AND o.available_at <= now())
      OR (o.status = 'processing' AND o.lease_until < now())
   ORDER BY o.available_at
   LIMIT least(greatest(p_limit, 1), 500);
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it.
REVOKE EXECUTE ON FUNCTION public.outbox_enqueue_expired_unpaid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_enqueue_abandoned_purge() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_due_keys(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outbox_enqueue_expired_unpaid() TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_enqueue_abandoned_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_due_keys(integer) TO service_role;
