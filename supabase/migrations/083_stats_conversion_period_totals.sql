-- Migration 083: stats_conversion — every paid booking of the period is accounted for
-- (Phase 85, review WR-01).
--
-- The problem (85-REVIEW.md WR-01): the funnel counts inquiries created in the period and the booking
-- each one converted into first; the direct table counts bookings of the period with no inquiry in the
-- 90 days before. A booking that followed an inquiry but was not that inquiry's FIRST conversion (a
-- second trip of the same person, or a trip whose inquiry was created before the period) was in neither
-- table, so the tab could not show where all of the period's revenue came from.
--
-- The fix: stats_conversion also returns, for the bookings CREATED in the period,
--   attributed_total  bookings / revenue of the ones with a recorded inquiry (not direct)
--   period_total      bookings / revenue of all of them
-- so attributed_total + direct_total = period_total exactly, by bookings and by revenue. The funnel
-- itself is unchanged (it stays a cohort of the period's inquiries). Everything else in the body is
-- byte-identical to 081; only the two keys above are added. stats_trips() is untouched.
--
-- Same signature, so CREATE OR REPLACE keeps the grants; the REVOKE/GRANT lines are re-run anyway.

CREATE OR REPLACE FUNCTION public.stats_conversion(
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
  v_lo     timestamptz;
  v_hi     timestamptz;
  v_result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid period';
  END IF;

  -- Prague-local calendar days, upper bound exclusive.
  v_lo := (p_from::timestamp AT TIME ZONE 'Europe/Prague');
  v_hi := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Prague');

  v_result := (
    WITH trips AS MATERIALIZED (
      SELECT * FROM public.stats_trips()
    ),
    inq_all AS MATERIALIZED (
      SELECT 'form_' || i.kind AS src,
             i.created_at,
             COALESCE(ie.identity_id::text, 'e:' || public.identity_normalize_email(i.email)) AS pkey,
             NULL::uuid AS explicit_booking
        FROM public.inquiries i
        LEFT JOIN public.identity_emails ie ON ie.email = public.identity_normalize_email(i.email)
      UNION ALL
      SELECT 'chat_' || COALESCE(l.channel, 'other'),
             l.created_at,
             COALESCE(
               l.identity_id::text,
               (SELECT (array_agg(DISTINCT p.identity_id))[1]::text
                  FROM public.identity_phones p
                 WHERE l.phone IS NOT NULL
                   AND p.phone = l.phone
                   AND NOT EXISTS (
                     SELECT 1 FROM public.phone_flags f WHERE f.phone = l.phone AND f.shared
                   )
                HAVING count(DISTINCT p.identity_id) = 1)
             ),
             l.converted_booking_id
        FROM public.chat_leads l
      UNION ALL
      SELECT 'abandoned',
             b.created_at,
             COALESCE(ie.identity_id::text, 'e:' || public.identity_normalize_email(b.client_email)),
             NULL::uuid
        FROM public.bookings b
        LEFT JOIN public.identity_emails ie ON ie.email = public.identity_normalize_email(b.client_email)
       WHERE public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
         AND b.leg IS DISTINCT FROM 'return'
         AND b.anonymised_at IS NULL
    ),
    inq AS (
      SELECT q.*
        FROM inq_all q
       WHERE q.created_at >= v_lo
         AND q.created_at < v_hi
    ),
    matched AS (
      SELECT q.src, q.created_at, m.booking_id, m.amount_eur
        FROM inq q
        LEFT JOIN LATERAL (
          SELECT t.booking_id, t.amount_eur
            FROM trips t
           WHERE (q.explicit_booking IS NOT NULL AND t.booking_id = q.explicit_booking)
              OR (q.pkey IS NOT NULL
                  AND t.person_key = q.pkey
                  AND t.created_at >= q.created_at
                  AND t.created_at <= q.created_at + interval '90 days')
           ORDER BY (t.booking_id = q.explicit_booking) DESC NULLS LAST, t.created_at
           LIMIT 1
        ) m ON true
    ),
    by_src AS (
      SELECT x.src,
             count(*)::integer AS inquiries,
             count(x.booking_id)::integer AS converted,
             (count(*) FILTER (
                WHERE x.booking_id IS NULL AND x.created_at + interval '90 days' > now()
              ))::integer AS window_open
        FROM matched x
       GROUP BY x.src
    ),
    rev_src AS (
      SELECT d.src, COALESCE(sum(d.amount_eur), 0)::integer AS revenue_eur
        FROM (
          SELECT DISTINCT x.src, x.booking_id, x.amount_eur
            FROM matched x
           WHERE x.booking_id IS NOT NULL
        ) d
       GROUP BY d.src
    ),
    dist AS (
      SELECT DISTINCT x.booking_id, x.amount_eur
        FROM matched x
       WHERE x.booking_id IS NOT NULL
    ),
    period_trips AS (
      SELECT t.booking_id,
             t.amount_eur,
             CASE t.booking_source
               WHEN 'manual' THEN 'manual_' || COALESCE(t.lead_channel, 'unknown')
               WHEN 'gnet' THEN 'gnet'
               ELSE 'online'
             END AS dsrc,
             (
               NOT EXISTS (
                 SELECT 1
                   FROM inq_all q
                  WHERE t.person_key IS NOT NULL
                    AND q.pkey = t.person_key
                    AND q.created_at >= t.created_at - interval '90 days'
                    AND q.created_at <= t.created_at
               )
               AND NOT EXISTS (
                 SELECT 1
                   FROM public.chat_leads l
                  WHERE l.converted_booking_id = t.booking_id
               )
             ) AS is_direct
        FROM trips t
       WHERE t.created_at >= v_lo
         AND t.created_at < v_hi
    ),
    direct_src AS (
      SELECT x.dsrc,
             count(*)::integer AS bookings,
             COALESCE(sum(x.amount_eur), 0)::integer AS revenue_eur
        FROM period_trips x
       WHERE x.is_direct
       GROUP BY x.dsrc
    )
    SELECT jsonb_build_object(
      'from', to_char(p_from, 'YYYY-MM-DD'),
      'to',   to_char(p_to, 'YYYY-MM-DD'),
      'funnel', (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'source',      s.src,
                   'inquiries',   COALESCE(b.inquiries, 0),
                   'converted',   COALESCE(b.converted, 0),
                   'window_open', COALESCE(b.window_open, 0),
                   'revenue_eur', COALESCE(r.revenue_eur, 0)
                 ) ORDER BY s.ord)
          FROM (VALUES
                 (1, 'chat_web'),
                 (2, 'chat_whatsapp'),
                 (3, 'chat_email'),
                 (4, 'chat_telegram'),
                 (5, 'chat_other'),
                 (6, 'form_contact'),
                 (7, 'form_corporate'),
                 (8, 'form_multiday_quote'),
                 (9, 'abandoned')
               ) AS s(ord, src)
          LEFT JOIN by_src b ON b.src = s.src
          LEFT JOIN rev_src r ON r.src = s.src
      ),
      'funnel_total', jsonb_build_object(
        'inquiries',           (SELECT count(*)::integer FROM matched),
        'converted',           (SELECT count(x.booking_id)::integer FROM matched x),
        'window_open',         (SELECT count(*)::integer FROM matched x
                                 WHERE x.booking_id IS NULL AND x.created_at + interval '90 days' > now()),
        'converting_bookings', (SELECT count(DISTINCT x.booking_id)::integer FROM matched x),
        'revenue_eur',         (SELECT COALESCE(sum(d.amount_eur), 0)::integer FROM dist d)
      ),
      'direct', (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'source',      d.src,
                   'bookings',    COALESCE(ds.bookings, 0),
                   'revenue_eur', COALESCE(ds.revenue_eur, 0)
                 ) ORDER BY d.ord)
          FROM (VALUES
                 (1, 'manual_whatsapp'),
                 (2, 'manual_phone'),
                 (3, 'manual_email'),
                 (4, 'manual_partner'),
                 (5, 'manual_other'),
                 (6, 'manual_unknown'),
                 (7, 'gnet'),
                 (8, 'online')
               ) AS d(ord, src)
          LEFT JOIN direct_src ds ON ds.dsrc = d.src
      ),
      'direct_total', jsonb_build_object(
        'bookings',    (SELECT COALESCE(sum(s.bookings), 0)::integer FROM direct_src s),
        'revenue_eur', (SELECT COALESCE(sum(s.revenue_eur), 0)::integer FROM direct_src s)
      ),
      'trips_in_period',     (SELECT count(*)::integer FROM period_trips),
      'attributed_bookings', (SELECT count(*)::integer FROM period_trips x WHERE NOT x.is_direct),
      'attributed_total', jsonb_build_object(
        'bookings',    (SELECT count(*)::integer FROM period_trips x WHERE NOT x.is_direct),
        'revenue_eur', (SELECT COALESCE(sum(x.amount_eur), 0)::integer FROM period_trips x WHERE NOT x.is_direct)
      ),
      'period_total', jsonb_build_object(
        'bookings',    (SELECT count(*)::integer FROM period_trips),
        'revenue_eur', (SELECT COALESCE(sum(x.amount_eur), 0)::integer FROM period_trips x)
      )
    )
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stats_conversion(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stats_conversion(date, date) TO service_role;
