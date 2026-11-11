-- Migration 089: admin_search_bookings can leave cancelled bookings out (p_hide_cancelled)
--
-- The admin list shows the working queue by default (Future). A cancelled booking is no longer work, so the
-- list asks for it to be left out there; it stays in the history (Past, All, a past date range, a search).
-- A cancelled booking whose fee case is still 'pending' is kept: the operator still has a decision to make.
--
-- ONE new argument, p_hide_cancelled boolean DEFAULT false, and ONE new clause in the filter. Everything else
-- is the 071 text: same return shape, same adaptive ORDER BY at both sites, SECURITY DEFINER,
-- SET search_path TO 'public', 'pg_temp'. With the default (false) the result is exactly what 071 returned,
-- so callers that pass the old eight named arguments (the dispatch route, code deployed before this
-- migration) keep working.
--
-- A new argument is a new signature, so the eight-argument function is dropped first: leaving both would make
-- an eight-argument call ambiguous. A re-created SECURITY DEFINER function gets the default PUBLIC EXECUTE
-- back, so it is revoked again; only service_role may call it.
--
-- Applied LIVE by the orchestrator via the Supabase MCP (no migrations are auto-pushed in this repo).

DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_search_bookings(
  p_query      text    DEFAULT NULL::text,
  p_start_date text    DEFAULT NULL::text,
  p_end_date   text    DEFAULT NULL::text,
  p_trip_type  text    DEFAULT NULL::text,
  p_status     text    DEFAULT NULL::text,
  p_sort       text    DEFAULT 'created_desc'::text,
  p_offset     integer DEFAULT 0,
  p_limit      integer DEFAULT 20,
  p_hide_cancelled boolean DEFAULT false
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
        NOT COALESCE(p_hide_cancelled, false)
        OR b.status <> 'cancelled'
        OR b.fee_case_status = 'pending'
      )
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

REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer, boolean) TO service_role;
