-- Migration 082: stats_customers_b2b — repeat customers and corporate accounts behind /admin/stats
-- (Phase 85, plan 85-03, STAT-02 and STAT-03).
--
-- What it answers
--   stats_b2b(p_from, p_to)       how much each corporate account booked and paid in the period, and the
--                                 two totals that give the "B2B share of all revenue" (STAT-03).
--   stats_customers(p_from, p_to) what share of our customers came back for a second paid order, how much
--                                 of the period's revenue they brought, and the top 10 (STAT-02).
--
-- Why it reuses stats_trips (D-18): "a paid order" and "the same person" are defined once, in migration
-- 081 (public.stats_trips()). This file never repeats the paid-status list and never re-creates that
-- function, so a change of the rule is made in one place and the funnel, the repeat rate and the B2B
-- table can never disagree.
--
-- D-19 (which trip belongs to which account): the same precedence as /admin/accounts
-- (app/api/admin/accounts/route.ts): bookings.user_id first, and only when it is NULL the auth.users row
-- whose normalised email equals the normalised booking email. A guest booking with the account's address
-- (any case, surrounding spaces) is therefore attributed, and a trip is attributed to exactly one user,
-- so it can never be counted for two accounts (T-85-12). If two auth.users rows normalise to the same
-- address the lowest id wins. One difference to the account detail page is accepted: a booking whose
-- user_id belongs to ANOTHER user but whose email is the account's appears there and not here.
--
-- Group payments: a booking paid through a group payment link carries amount 0 on its own row (the
-- Stripe webhook books the money on the group). Such a trip counts as a booking with 0 EUR and is
-- surfaced by without_amount, so the table never hides that its revenue figure is incomplete.
--
-- Period (D-14): both RPCs filter on pickup_date, which is TEXT, between to_char(p_from, 'YYYY-MM-DD')
-- and to_char(p_to, 'YYYY-MM-DD') inclusive. pickup_date is never cast, so one malformed value cannot
-- raise and break a tab. Amounts are EUR integers straight from stats_trips (D-15).
--
-- Why STABLE and read-only: the stats page can never change data. No statement here writes, and the
-- functions are not callable by anon or authenticated (they read customer names, emails and auth.users).
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the bottom
-- must always be re-run on the NEW signature (see 079).

-- ── stats_b2b: revenue and bookings per corporate account ───────────────────
CREATE OR REPLACE FUNCTION public.stats_b2b(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from   text;
  v_to     text;
  v_result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid period';
  END IF;

  v_from := to_char(p_from, 'YYYY-MM-DD');
  v_to   := to_char(p_to, 'YYYY-MM-DD');

  v_result := (
    WITH trips AS MATERIALIZED (
      SELECT t.client_email, t.user_id, t.pickup_date, t.amount_eur
        FROM public.stats_trips() t
       WHERE t.pickup_date >= v_from
         AND t.pickup_date <= v_to
    ),
    owners AS (
      SELECT (array_agg(u.id ORDER BY u.id))[1] AS id,
             public.identity_normalize_email(u.email) AS nemail
        FROM auth.users u
       WHERE public.identity_normalize_email(u.email) IS NOT NULL
       GROUP BY public.identity_normalize_email(u.email)
    ),
    keyed AS (
      SELECT COALESCE(t.user_id, o.id) AS acct_id,
             t.pickup_date,
             t.amount_eur
        FROM trips t
        LEFT JOIN owners o ON o.nemail = public.identity_normalize_email(t.client_email)
    ),
    per_acct AS (
      SELECT k.acct_id,
             count(*)::integer AS bookings,
             COALESCE(sum(k.amount_eur), 0)::integer AS revenue_eur,
             max(k.pickup_date) AS last_trip,
             (count(*) FILTER (WHERE COALESCE(k.amount_eur, 0) = 0))::integer AS without_amount
        FROM keyed k
       WHERE k.acct_id IS NOT NULL
       GROUP BY k.acct_id
    ),
    accts AS (
      SELECT cp.user_id,
             cp.company_name,
             cp.full_name,
             u.email,
             a.bookings,
             a.revenue_eur,
             round(a.revenue_eur::numeric / a.bookings)::integer AS avg_eur,
             a.last_trip,
             a.without_amount
        FROM per_acct a
        JOIN public.customer_profiles cp ON cp.user_id = a.acct_id AND cp.account_type = 'corporate'
        JOIN auth.users u ON u.id = cp.user_id
    )
    SELECT jsonb_build_object(
      'from', v_from,
      'to',   v_to,
      'accounts_total',  (SELECT count(*)::integer FROM public.customer_profiles c WHERE c.account_type = 'corporate'),
      'b2b_bookings',    (SELECT COALESCE(sum(a.bookings), 0)::integer FROM accts a),
      'b2b_revenue_eur', (SELECT COALESCE(sum(a.revenue_eur), 0)::integer FROM accts a),
      'all_bookings',    (SELECT count(*)::integer FROM trips),
      'all_revenue_eur', (SELECT COALESCE(sum(t.amount_eur), 0)::integer FROM trips t),
      'accounts', COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object(
                    'user_id',        a.user_id,
                    'company_name',   a.company_name,
                    'full_name',      a.full_name,
                    'email',          a.email,
                    'bookings',       a.bookings,
                    'revenue_eur',    a.revenue_eur,
                    'avg_eur',        a.avg_eur,
                    'last_trip',      a.last_trip,
                    'without_amount', a.without_amount
                  )
                  ORDER BY a.revenue_eur DESC, a.bookings DESC, a.company_name ASC NULLS LAST, a.user_id ASC)
           FROM accts a),
        '[]'::jsonb)
    )
  );

  RETURN v_result;
END;
$$;

-- ── stats_customers: repeat customers, their revenue share, top 10 ─────────
-- Population (D-09, D-12): stats_trips rows that are not GNet (by SOURCE, not by missing identity: a GNet
-- row can carry a real passenger email and still is not our customer), not anonymised and with a person
-- key. A round trip is one trip (stats_trips skips the return leg). "Repeat" means 2 or more trips over
-- ALL time, so a trip after p_to still makes an earlier customer a repeat customer (D-10).
CREATE OR REPLACE FUNCTION public.stats_customers(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from   text;
  v_to     text;
  v_result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid period';
  END IF;

  v_from := to_char(p_from, 'YYYY-MM-DD');
  v_to   := to_char(p_to, 'YYYY-MM-DD');

  v_result := (
    WITH pop AS MATERIALIZED (
      SELECT t.booking_id, t.person_key, t.pickup_date, t.amount_eur,
             t.created_at, t.client_name, t.client_email
        FROM public.stats_trips() t
       WHERE t.booking_source <> 'gnet'
         AND NOT t.anonymised
         AND t.person_key IS NOT NULL
    ),
    per_person AS (
      SELECT p.person_key,
             count(*)::integer AS trips,
             COALESCE(sum(p.amount_eur), 0)::integer AS revenue_eur,
             min(p.pickup_date) AS first_trip,
             max(p.pickup_date) AS last_trip,
             (array_agg(p.client_name ORDER BY p.created_at DESC, p.booking_id DESC))[1] AS name,
             (array_agg(p.client_email ORDER BY p.created_at DESC, p.booking_id DESC))[1] AS email,
             (count(*) FILTER (WHERE p.pickup_date >= v_from AND p.pickup_date <= v_to))::integer AS period_trips,
             COALESCE(sum(p.amount_eur) FILTER (WHERE p.pickup_date >= v_from AND p.pickup_date <= v_to), 0)::integer AS period_revenue_eur
        FROM pop p
       GROUP BY p.person_key
    ),
    top AS (
      SELECT s.*,
             row_number() OVER (
               ORDER BY s.revenue_eur DESC, s.trips DESC, s.last_trip DESC, s.email ASC NULLS LAST, s.person_key ASC
             ) AS rn
        FROM per_person s
       WHERE s.trips >= 2
       ORDER BY rn
       LIMIT 10
    )
    SELECT jsonb_build_object(
      'from', v_from,
      'to',   v_to,
      'customers',        (SELECT count(*)::integer FROM per_person s WHERE s.period_trips >= 1),
      'repeat_customers', (SELECT count(*)::integer FROM per_person s WHERE s.period_trips >= 1 AND s.trips >= 2),
      'revenue_eur',      (SELECT COALESCE(sum(s.period_revenue_eur), 0)::integer FROM per_person s),
      'repeat_revenue_eur', (SELECT COALESCE(sum(s.period_revenue_eur), 0)::integer FROM per_person s WHERE s.trips >= 2),
      'repeat_customers_all_time', (SELECT count(*)::integer FROM per_person s WHERE s.trips >= 2),
      'top', COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object(
                    'name',        x.name,
                    'email',       x.email,
                    'trips',       x.trips,
                    'revenue_eur', x.revenue_eur,
                    'first_trip',  x.first_trip,
                    'last_trip',   x.last_trip
                  )
                  ORDER BY x.rn)
           FROM top x),
        '[]'::jsonb)
    )
  );

  RETURN v_result;
END;
$$;

-- ── Grants: service role only (per function; DROP+CREATE re-grants PUBLIC) ──
REVOKE EXECUTE ON FUNCTION public.stats_b2b(date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_customers(date, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.stats_b2b(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.stats_customers(date, date) TO service_role;
