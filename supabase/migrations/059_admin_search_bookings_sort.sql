-- Migration 059: admin_search_bookings adaptive sort (Phase 65, DISP-01, D-02)
--
-- Adds a p_sort text DEFAULT 'created_desc' parameter to admin_search_bookings
-- so the dispatch bookings list can sort ascending-by-pickup (soonest trip
-- first) for the Future horizon, and descending-by-pickup (most recent first)
-- for Past/All. The RPC currently hardcodes ORDER BY created_at DESC; that
-- stays as the default/tiebreak when p_sort is omitted or unrecognized,
-- preserving pre-phase behavior for any caller that doesn't pass it.
--
-- The function BODY below is the verbatim 054 body (itself pulled verbatim
-- from the live project) with only two changes: (1) the new p_sort parameter
-- and (2) the adaptive CASE-expression ORDER BY, applied identically in BOTH
-- the `paged` CTE ORDER BY (decides which rows are selected for this page)
-- and the jsonb_agg(... ORDER BY ...) (decides display order within the JSON
-- array) — these are two independent ORDER BY sites and must stay in sync
-- (see Phase 65 RESEARCH.md Pitfall 1). Search, pagination, the
-- { rows, total_count } return shape, SECURITY DEFINER, and search_path are
-- preserved exactly.
--
-- The ORDER BY is a static CASE expression, never built via string
-- concatenation or dynamic SQL execution — injection-proof by construction
-- inside this SECURITY DEFINER function regardless of the upstream whitelist
-- already applied in app/api/admin/bookings/route.ts (T-65-01).
--
-- Adding a parameter changes the function signature, so a plain CREATE OR
-- REPLACE would leave the old 7-arg function behind as an overload. We DROP
-- the exact current live signature first (054's 7-arg shape, p_status
-- included), then recreate with the new 8-arg signature (p_sort inserted
-- before p_offset), then re-GRANT EXECUTE to service_role ONLY — per 057,
-- PUBLIC/anon/authenticated EXECUTE were already revoked from the prior
-- signature and must NOT be re-granted here (T-65-02).
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed). See Task 3 of Plan 65-01.

DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, text, integer, integer);

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

-- A newly-created function receives a DEFAULT EXECUTE grant to PUBLIC (and thus
-- anon/authenticated) — the DROP+CREATE above produces a brand-new function
-- object, so 057's revoke on the old 7-arg signature does NOT carry over. Revoke
-- it here to keep the RPC unreachable by anon/authenticated (T-65-02), mirroring
-- migration 057's revoke on the prior signature. postgres (owner) and
-- service_role retain their explicit grants.
REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) TO service_role;
