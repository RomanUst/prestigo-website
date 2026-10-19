-- Migration 071: admin_search_bookings also matches client_email (Phase 82, D-02)
--
-- The Chatwoot contact carries a "Site bookings" link that opens
-- /admin/bookings?search=<email> (the Phase 80 deep link). Until now the search
-- box only matched first name, last name and booking reference, so that link
-- found nothing. This migration adds ONE clause, `OR b.client_email ILIKE v_like`,
-- so the list is filtered to the customer's bookings by email.
--
-- Nothing else changed. The function body is the live definition recorded in
-- .planning/phases/82-site-crm-chatwoot-sync-foundation/82-LIVE-SCHEMA.md
-- (identical to the 059 text): same 8-argument signature and defaults, same
-- { rows, total_count } return shape, same adaptive ORDER BY at both sites
-- (paged CTE and jsonb_agg), SECURITY DEFINER, and
-- SET search_path TO 'public', 'pg_temp'. The term is still a bound
-- parameter used in ILIKE inside plpgsql (no dynamic SQL).
--
-- CREATE OR REPLACE keeps the existing signature, so no DROP is needed. The
-- REVOKE/GRANT lines are repeated from 059 anyway: a re-created SECURITY
-- DEFINER function must never be left with the default PUBLIC EXECUTE
-- (T-82-10). Only service_role may call it.
--
-- Applied LIVE by the orchestrator via the Supabase MCP (no migrations are
-- auto-pushed in this repo).

CREATE OR REPLACE FUNCTION public.admin_search_bookings(
  p_query      text    DEFAULT NULL::text,
  p_start_date text    DEFAULT NULL::text,
  p_end_date   text    DEFAULT NULL::text,
  p_trip_type  text    DEFAULT NULL::text,
  p_status     text    DEFAULT NULL::text,
  p_sort       text    DEFAULT 'created_desc'::text,
  p_offset     integer DEFAULT 0,
  p_limit      integer DEFAULT 20
)
 RETURNS TABLE(rows jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_like TEXT;
BEGIN
  IF p_limit  IS NULL OR p_limit  < 1   THEN p_limit  := 20;  END IF;
  IF p_limit  > 100                     THEN p_limit  := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0   THEN p_offset := 0;   END IF;

  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN
    v_like := NULL;
  ELSE
    v_like := '%' || trim(p_query) || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT b.*
    FROM public.bookings b
    WHERE (p_start_date IS NULL OR b.pickup_date >= p_start_date)
      AND (p_end_date   IS NULL OR b.pickup_date <= p_end_date)
      AND (p_trip_type  IS NULL OR b.trip_type = p_trip_type)
      AND (p_status     IS NULL OR b.status = p_status)
      AND (
        v_like IS NULL
        OR b.client_first_name ILIKE v_like
        OR b.client_last_name  ILIKE v_like
        OR b.booking_reference ILIKE v_like
        OR b.client_email ILIKE v_like
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN pickup_date END DESC,
      created_at DESC
    OFFSET p_offset
    LIMIT  p_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN paged.pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN paged.pickup_date END DESC,
      paged.created_at DESC
    ), '[]'::jsonb) AS rows,
    (SELECT c FROM counted) AS total_count
  FROM paged;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) TO service_role;
