-- Migration 081: stats_conversion — the inquiry -> booking funnel behind /admin/stats
-- (Phase 85, plan 85-01, STAT-01).
--
-- What it answers: how many inquiries of each source (chat channel, site form, abandoned checkout)
-- created in a Prague-local period turned into a paid order within 90 days, and which paid orders
-- arrived with no inquiry at all ("direct"). Read-only; the admin route calls it with the service role.
--
-- Why it lives in SQL (D-03): "same person" must mean exactly what the CRM sync and panel_bookings
-- (080) mean. It reuses the Phase 82 helpers identity_normalize_email and identity_is_abandoned and the
-- identity tables (booking_identity, identity_emails, identity_phones, phone_flags). Nothing here reads
-- EspoCRM or Chatwoot (Backlog 999.11 WR-03): conversion comes from Supabase rows only.
--
-- Why STABLE and read-only: the stats page can never change data. No statement in stats_trips or
-- stats_conversion writes, and neither function is callable by anon or authenticated.
--
-- D-18 (paid statuses): a qualifying trip is a bookings row that is not the return leg of a round trip
-- and whose status is confirmed, assigned, en_route, on_location or completed. 'pending' is an unpriced
-- quote or a GNet booking still awaiting acceptance, not revenue; 'unpaid' and 'cancelled' never convert
-- and never add revenue. The status list lives in stats_trips() only; plan 85-03 (migration 082) reuses
-- that function, so a change is made in one place.
--
-- D-21 (window rule): an inquiry converts when the same person has a qualifying trip created in
-- [inquiry.created_at, inquiry.created_at + 90 days]. A chat lead whose converted_booking_id equals a
-- currently qualifying trip converts regardless of the window and is matched first. Each inquiry
-- converts at most once (LIMIT 1); one booking may convert several inquiries of the same person, so the
-- totals count DISTINCT bookings.
--
-- O-3 (abandoned rows): each abandoned order row is its own inquiry. A checkout that is later reconciled
-- to paid stops satisfying identity_is_abandoned, so it leaves the abandoned set and is simply a paid
-- trip; an abandoned checkout converts only through a DIFFERENT paid row of the same person.
--
-- Period (D-14): inquiries are counted when created_at falls in the Prague-local calendar days
-- p_from..p_to inclusive. The converting booking may be created after p_to.
--
-- Money: amounts are EUR (amount_eur, with the 080 round-trip fallback). pickup_date is text and is
-- never cast here; the funnel filters on created_at only.
--
-- chat_leads.channel (D-04, database half): the bucket of the Chatwoot channel class that created the
-- lead. It is written by chat_lead_reserve on INSERT only. The mapping lives in chat_channel_bucket so the
-- intake and the one-time backfill share one definition.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the bottom
-- must always be re-run on the NEW signature (see 079).

-- ── chat_leads.channel ───────────────────────────────────────────────────────
ALTER TABLE public.chat_leads ADD COLUMN IF NOT EXISTS channel text;

ALTER TABLE public.chat_leads DROP CONSTRAINT IF EXISTS chat_leads_channel_check;
ALTER TABLE public.chat_leads ADD CONSTRAINT chat_leads_channel_check
  CHECK (channel IS NULL OR channel IN ('web', 'whatsapp', 'email', 'telegram', 'other'));

-- ── chat_channel_bucket: Chatwoot channel class -> five buckets ─────────────
-- The four class strings are the same ones leadSourceForChannel (lib/chat-classify.ts) maps; a static
-- test pins that both lists stay equal. NULL in means unknown (NULL out), any other class is 'other'.
CREATE OR REPLACE FUNCTION public.chat_channel_bucket(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN p_raw = 'Channel::WebWidget' THEN 'web'
    WHEN p_raw = 'Channel::Whatsapp' THEN 'whatsapp'
    WHEN p_raw = 'Channel::Email' THEN 'email'
    WHEN p_raw = 'Channel::Telegram' THEN 'telegram'
    ELSE 'other'
  END;
$$;

-- ── chat_lead_reserve: 078 body + the channel of the creating conversation ──
-- The old 5-arg signature is dropped first: two overloads would make PostgREST named-argument calls
-- ambiguous. p_channel has a DEFAULT so an intake deployed before this migration is applied keeps
-- working. Only the INSERT path stores the channel; the open-row and lead_ref paths never touch it, so a
-- later conversation of the same person never relabels the lead.
DROP FUNCTION IF EXISTS public.chat_lead_reserve(text, uuid, bigint, text, text);

CREATE OR REPLACE FUNCTION public.chat_lead_reserve(
  p_person_key          text,
  p_identity_id         uuid,
  p_chatwoot_contact_id bigint,
  p_phone               text,
  p_lead_ref            text,
  p_channel             text DEFAULT NULL
)
RETURNS TABLE (
  chat_lead_id    uuid,
  lead_ref        text,
  espo_lead_id    text,
  espo_contact_id text,
  own             boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_row public.chat_leads%ROWTYPE;
BEGIN
  -- Serialise every reserve for this person until the transaction ends.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_lead:' || p_person_key, 0));

  -- The person already has an open chat Lead: return it (own only when it is this conversation's).
  SELECT l.* INTO v_row
    FROM public.chat_leads l
   WHERE l.person_key = p_person_key AND l.open;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.lead_ref, v_row.espo_lead_id, v_row.espo_contact_id,
                        (v_row.lead_ref = p_lead_ref);
    RETURN;
  END IF;

  -- A retry of a conversation whose Lead is already closed or filed under another key.
  SELECT l.* INTO v_row
    FROM public.chat_leads l
   WHERE l.lead_ref = p_lead_ref;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.lead_ref, v_row.espo_lead_id, v_row.espo_contact_id, true;
    RETURN;
  END IF;

  INSERT INTO public.chat_leads
    (lead_ref, person_key, identity_id, chatwoot_contact_id, phone, channel)
  VALUES
    (p_lead_ref, p_person_key, p_identity_id, p_chatwoot_contact_id, p_phone,
     public.chat_channel_bucket(p_channel))
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.lead_ref, v_row.espo_lead_id, v_row.espo_contact_id, true;
END;
$$;

-- ── stats_trips: one row per paid ORDER ─────────────────────────────────────
-- person_key is the identity uuid (as text) when the booking is linked, else 'e:' plus the normalised
-- booking email, else NULL (anonymised rows and GNet placeholder emails never match a person).
CREATE OR REPLACE FUNCTION public.stats_trips()
RETURNS TABLE (
  booking_id     uuid,
  person_key     text,
  user_id        uuid,
  booking_source text,
  lead_channel   text,
  created_at     timestamptz,
  pickup_date    text,
  amount_eur     integer,
  anonymised     boolean,
  client_name    text,
  client_email   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    b.id,
    CASE
      WHEN b.anonymised_at IS NOT NULL THEN NULL
      ELSE COALESCE(bi.identity_id::text, 'e:' || public.identity_normalize_email(b.client_email))
    END,
    b.user_id,
    b.booking_source,
    b.lead_channel,
    b.created_at,
    b.pickup_date,
    COALESCE(
      b.amount_eur,
      CASE
        WHEN b.trip_type = 'round_trip'
         AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
        THEN round((COALESCE(b.outbound_amount_czk, 0) + COALESCE(b.return_amount_czk, 0)) * 0.04)::integer
        ELSE round(b.amount_czk * 0.04)::integer
      END
    ),
    b.anonymised_at IS NOT NULL,
    btrim(b.client_first_name || ' ' || b.client_last_name),
    b.client_email
  FROM public.bookings b
  LEFT JOIN public.booking_identity bi ON bi.booking_id = b.id
  WHERE b.leg IS DISTINCT FROM 'return'
    AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed');
$$;

-- ── stats_conversion: the funnel ────────────────────────────────────────────
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
      'attributed_bookings', (SELECT count(*)::integer FROM period_trips x WHERE NOT x.is_direct)
    )
  );

  RETURN v_result;
END;
$$;

-- ── Grants: service role only (per function; DROP+CREATE re-grants PUBLIC) ──
REVOKE EXECUTE ON FUNCTION public.chat_channel_bucket(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_trips() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_conversion(date, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_channel_bucket(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stats_trips() TO service_role;
GRANT EXECUTE ON FUNCTION public.stats_conversion(date, date) TO service_role;
