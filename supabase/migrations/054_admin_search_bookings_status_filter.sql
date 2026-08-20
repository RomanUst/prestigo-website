-- Migration 054: admin_search_bookings status filter
-- Phase 62 — Abandoned & Unpaid Booking Capture (ABND-02/ABND-04, D-08)
--
-- Adds a `p_status text DEFAULT NULL` parameter to admin_search_bookings and a
-- `(p_status IS NULL OR b.status = p_status)` predicate so the admin bookings
-- queue can filter by status (the "Unpaid" chip, 62-03). The GET handler in
-- app/api/admin/bookings/route.ts already passes p_status by name.
--
-- The function BODY below was pulled VERBATIM from the live project via
--   SELECT pg_get_functiondef('admin_search_bookings'::regproc);
-- (there is no prior local migration for this RPC) on 2026-08-20. Only two
-- things were changed relative to the live body: (1) the new p_status parameter
-- and (2) the new status predicate. Search, pagination, ordering, the
-- { rows, total_count } return shape, SECURITY DEFINER, and search_path are
-- preserved exactly.
--
-- Adding a parameter changes the function signature, so a plain CREATE OR
-- REPLACE would leave the old 6-arg function behind as an overload. We DROP the
-- exact old signature first, then recreate, then re-GRANT EXECUTE to
-- service_role (the live ACL was {service_role=X/postgres}; pg_get_functiondef
-- does not carry GRANTs, so it must be restored explicitly or the admin
-- service-role client loses access).
--
-- Live apply of 053 + 054 is the [BLOCKING] operator step in Plan 62-04.

DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_search_bookings(
  p_query      text    DEFAULT NULL::text,
  p_start_date text    DEFAULT NULL::text,
  p_end_date   text    DEFAULT NULL::text,
  p_trip_type  text    DEFAULT NULL::text,
  p_status     text    DEFAULT NULL::text,
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
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC
    OFFSET p_offset
    LIMIT  p_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY paged.created_at DESC), '[]'::jsonb) AS rows,
    (SELECT c FROM counted) AS total_count
  FROM paged;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, integer, integer) TO service_role;
