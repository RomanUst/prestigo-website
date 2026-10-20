-- 075: GDPR erasure saga backend (Phase 82, plan 82-12, GDPR-01 / D-07..D-10)
--
-- One admin-confirmed request (erasure_requests, status confirmed) is executed by the outbox event
-- 'erase.person:<requestId>' (lib/erasure.ts) and removes or anonymises ONE person in Chatwoot,
-- EspoCRM and Supabase. This file is the Supabase half: the audit table and the RPCs the saga and
-- the admin routes (plan 82-13) call. Every function is SECURITY DEFINER, search_path = '' and
-- callable by service_role only; the table is deny-all.
--
-- ORDER (RESEARCH "Erasure saga"): freeze -> Chatwoot -> EspoCRM -> verify -> Supabase -> auth user
-- -> audit completion. Supabase is anonymised LAST, on purpose: the identity, booking and email rows
-- are the only index that says which CRM / chat records belong to the person, so a retry after a
-- timeout or a VPS outage can always find them. erasure_anonymise_person enforces the order in the
-- database too: it refuses to run unless the chatwoot, espocrm and a verified verify step are
-- recorded on the request.
--
-- Freeze: erasure_confirm sets contact_identities.erasing_at in the SAME transaction that confirms
-- the request and enqueues the event. From then on the resolvers answer 'erasing' (069/072), the
-- sync handlers skip the person, and the erase row shares the person aggregate (outbox_claim mutex),
-- so a sync row can never run beside it. The bookings sync trigger ignores rows with anonymised_at.
-- A second confirm for the same identity (or the same email hash) hits the partial unique indexes.
--
-- Accounting data the law requires (booking date, amount, vehicle class, reference, invoice data)
-- is never deleted: bookings are ANONYMISED, not removed (D-08). Placeholders follow
-- 82-LIVE-SCHEMA.md: bookings.client_* are NOT NULL, so names/phone get '' and the email gets the
-- unique non-routable erased-<bookingId>@erased.invalid address (identity_normalize_email maps the
-- domain to NULL, so an anonymised booking never gets an identity again); nullable columns get NULL.
--
-- The audit row holds the plaintext scope (emails, phones, ids) ONLY until completion. erasure_complete
-- clears all of it and keeps the HMAC-SHA256 (keyed, computed by the route), the dates, the per-system
-- step results and counts, and the verified flag. Residual copies outside the saga (mail archive,
-- backups, Stripe, Resend, EspoCRM Email/Task/stream records) are covered by the runbook (plan 82-15).
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the
-- bottom must always be re-run.

-- ── Audit table ─────────────────────────────────────────────────────────────
-- No foreign keys: the audit row must outlive the identity, the bookings' links and the auth user.
CREATE TABLE IF NOT EXISTS public.erasure_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by   uuid        NOT NULL,
  email_hmac     text        NOT NULL CHECK (email_hmac ~ '^[0-9a-f]{64}$'),
  identity_id    uuid,
  user_id        uuid,
  booking_ids    uuid[]      NOT NULL DEFAULT '{}',
  inquiry_ids    uuid[]      NOT NULL DEFAULT '{}',
  subject_emails text[]      NOT NULL DEFAULT '{}',
  subject_phones text[]      NOT NULL DEFAULT '{}',
  status         text        NOT NULL CHECK (status IN ('previewed', 'confirmed', 'running', 'completed', 'failed')),
  expires_at     timestamptz NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at   timestamptz,
  completed_at   timestamptz,
  steps          jsonb       NOT NULL DEFAULT '{}',
  counts         jsonb       NOT NULL DEFAULT '{}',
  verified       boolean
);

-- One active request per identity and per person (email hash).
CREATE UNIQUE INDEX IF NOT EXISTS erasure_requests_active_identity_idx
  ON public.erasure_requests (identity_id)
  WHERE status IN ('confirmed', 'running') AND identity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS erasure_requests_active_hmac_idx
  ON public.erasure_requests (email_hmac)
  WHERE status IN ('confirmed', 'running');

CREATE INDEX IF NOT EXISTS erasure_requests_requested_idx
  ON public.erasure_requests (requested_at DESC);

REVOKE ALL ON public.erasure_requests FROM anon, authenticated;
ALTER TABLE public.erasure_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text := 'erasure_requests';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_read', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (false)', t || '_no_public_read', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_insert', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (false)', t || '_no_public_insert', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_update', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (false) WITH CHECK (false)', t || '_no_public_update', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_delete', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (false)', t || '_no_public_delete', t);
END;
$$;

-- ── Scope helpers (internal: not granted to anyone) ─────────────────────────

-- Bookings of one person that are not anonymised yet: the identity's bookings, every booking whose
-- (normalised) client email is one of the person's emails, and every booking of the person's account.
CREATE OR REPLACE FUNCTION public.erasure_booking_ids(p_identity uuid, p_user uuid, p_emails text[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT b.id), '{}'::uuid[])
    FROM public.bookings b
   WHERE b.anonymised_at IS NULL
     AND (
       b.id IN (SELECT bi.booking_id FROM public.booking_identity bi WHERE bi.identity_id = p_identity)
       OR public.identity_normalize_email(b.client_email) = ANY (p_emails)
       OR (p_user IS NOT NULL AND b.user_id = p_user)
     );
$$;

-- Inquiries by (normalised) email.
CREATE OR REPLACE FUNCTION public.erasure_inquiry_ids(p_emails text[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(i.id), '{}'::uuid[])
    FROM public.inquiries i
   WHERE COALESCE(i.email_normalized, public.identity_normalize_email(i.email)) = ANY (p_emails);
$$;

-- ── erasure_confirm: freeze + enqueue in ONE transaction ─────────────────────
-- Returns 'confirmed' | 'not_found' | 'already_in_progress' | 'not_previewed' | 'expired' |
-- 'actor_mismatch'. The identity lock is taken FIRST (the same lock every resolver takes, and the
-- order every erasure function uses), then the request row: one lock order, no deadlock.
-- The scope is refreshed under the lock: the person may have booked or signed up since the preview.
CREATE OR REPLACE FUNCTION public.erasure_confirm(p_request_id uuid, p_actor uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  r           record;
  v_identity  uuid;
  v_user      uuid;
  v_emails    text[];
  v_phones    text[];
  v_bookings  uuid[];
  v_inquiries uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT * INTO r FROM public.erasure_requests e WHERE e.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF r.status IN ('confirmed', 'running') THEN
    RETURN 'already_in_progress';
  END IF;
  IF r.status <> 'previewed' THEN
    RETURN 'not_previewed';
  END IF;
  IF r.expires_at <= now() THEN
    RETURN 'expired';
  END IF;
  IF r.requested_by <> p_actor THEN
    RETURN 'actor_mismatch';
  END IF;

  v_identity := r.identity_id;
  IF v_identity IS NULL THEN
    SELECT ie.identity_id INTO v_identity
      FROM public.identity_emails ie
     WHERE ie.email = ANY (r.subject_emails)
     LIMIT 1;
  END IF;

  v_emails := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_emails
             || ARRAY(SELECT ie.email FROM public.identity_emails ie WHERE ie.identity_id = v_identity)
           ) AS x
  );

  -- Only numbers that are not flagged shared: a desk / hotel number must never pull another
  -- person's chat contact into the deletion.
  v_phones := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_phones
             || ARRAY(
                  SELECT p.phone
                    FROM public.identity_phones p
                    LEFT JOIN public.phone_flags f ON f.phone = p.phone
                   WHERE p.identity_id = v_identity
                     AND (f.phone IS NULL OR f.shared = false)
                )
           ) AS x
  );

  v_user := COALESCE(
    r.user_id,
    (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_identity),
    (SELECT u.id FROM auth.users u WHERE public.identity_normalize_email(u.email) = ANY (v_emails) LIMIT 1)
  );

  v_bookings := public.erasure_booking_ids(v_identity, v_user, v_emails);
  v_inquiries := public.erasure_inquiry_ids(v_emails);

  -- The partial unique indexes decide a race between two confirms: nothing else is written then.
  BEGIN
    UPDATE public.erasure_requests e
       SET status         = 'confirmed',
           confirmed_at   = now(),
           identity_id    = v_identity,
           user_id        = v_user,
           subject_emails = v_emails,
           subject_phones = v_phones,
           booking_ids    = v_bookings,
           inquiry_ids    = v_inquiries
     WHERE e.id = p_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already_in_progress';
  END;

  IF v_identity IS NOT NULL THEN
    UPDATE public.contact_identities c
       SET erasing_at = COALESCE(c.erasing_at, now()), updated_at = now()
     WHERE c.id = v_identity;
  END IF;

  -- The erase row shares the person aggregate (the identity id), so the claim mutex of 064 never runs
  -- it beside a sync row. A person without an identity uses the request id.
  PERFORM public.outbox_enqueue(
    'erase.person',
    'person',
    COALESCE(v_identity, p_request_id),
    'erase.person:' || p_request_id::text,
    now()
  );

  RETURN 'confirmed';
END;
$$;

-- ── erasure_load: everything the saga reads ─────────────────────────────────
-- NULL when the request does not exist. The 82-13 confirm route reads email_hmac, expires_at and
-- counts.upcoming from it.
CREATE OR REPLACE FUNCTION public.erasure_load(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'status', e.status,
    'requested_by', e.requested_by,
    'email_hmac', e.email_hmac,
    'expires_at', e.expires_at,
    'identity', (
      SELECT jsonb_build_object(
               'id', c.id,
               'espo_contact_id', c.espo_contact_id,
               'chatwoot_contact_id', c.chatwoot_contact_id,
               'user_id', c.user_id
             )
        FROM public.contact_identities c
       WHERE c.id = e.identity_id
    ),
    'user_id', e.user_id,
    'emails', to_jsonb(e.subject_emails),
    'phones', to_jsonb(e.subject_phones),
    'booking_ids', to_jsonb(e.booking_ids),
    'inquiry_ids', to_jsonb(e.inquiry_ids),
    'counts', e.counts,
    'steps', e.steps
  )
  FROM public.erasure_requests e
  WHERE e.id = p_request_id;
$$;

-- ── erasure_record_step: one finished step, with counts only ────────────────
CREATE OR REPLACE FUNCTION public.erasure_record_step(p_request_id uuid, p_step text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_step IS NULL OR p_step NOT IN ('chatwoot', 'espocrm', 'verify', 'supabase', 'auth') THEN
    RAISE EXCEPTION 'erasure_record_step: invalid step';
  END IF;
  IF p_result IS NOT NULL AND jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'erasure_record_step: result must be an object';
  END IF;

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object(
                    p_step,
                    COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('done_at', now())
                  ),
         status = CASE WHEN e.status = 'confirmed' THEN 'running' ELSE e.status END
   WHERE e.id = p_request_id
     AND e.status IN ('confirmed', 'running');
END;
$$;

-- ── erasure_anonymise_person: the Supabase half, ONE transaction ────────────
-- Returns the counts (and records the 'supabase' step itself in the same transaction, so there is no
-- window between "anonymised" and "recorded"). A repeat call after success returns the stored counts.
CREATE OR REPLACE FUNCTION public.erasure_anonymise_person(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  r         record;
  v_ids     uuid[];
  v_emails  text[];
  v_phones  text[];
  n_book    integer := 0;
  n_audit   integer := 0;
  n_mail    integer := 0;
  n_gnet    integer := 0;
  n_notes   integer := 0;
  n_inq     integer := 0;
  n_ql      integer := 0;
  n_ident   integer := 0;
  v_counts  jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT * INTO r FROM public.erasure_requests e WHERE e.id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('confirmed', 'running') THEN
    RAISE EXCEPTION 'erasure_anonymise_person: request is not active';
  END IF;

  IF r.steps -> 'supabase' IS NOT NULL THEN
    RETURN (r.steps -> 'supabase') - 'done_at';
  END IF;

  -- Supabase is last: the CRM and chat steps must be done and verified first.
  IF r.steps -> 'chatwoot' IS NULL
     OR r.steps -> 'espocrm' IS NULL
     OR COALESCE(r.steps -> 'verify' ->> 'verified', 'false') <> 'true' THEN
    RAISE EXCEPTION 'erasure_anonymise_person: CRM steps are not finished';
  END IF;

  v_emails := r.subject_emails;
  v_ids := ARRAY(
    SELECT DISTINCT x
      FROM unnest(r.booking_ids || public.erasure_booking_ids(r.identity_id, r.user_id, v_emails)) AS x
  );
  v_phones := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_phones
             || ARRAY(SELECT p.phone FROM public.identity_phones p WHERE p.identity_id = r.identity_id)
           ) AS x
  );

  -- D-08: bookings keep date, amount, vehicle class, reference and invoice data; personal data goes.
  UPDATE public.bookings b
     SET client_first_name   = '',
         client_last_name    = '',
         client_email        = 'erased-' || b.id::text || '@erased.invalid',
         client_phone        = '',
         special_requests    = NULL,
         operator_notes      = NULL,
         origin_address      = NULL,
         origin_lat          = NULL,
         origin_lng          = NULL,
         destination_address = NULL,
         destination_lat     = NULL,
         destination_lng     = NULL,
         flight_number       = NULL,
         flight_iata         = NULL,
         user_id             = NULL,
         anonymised_at       = now()
   WHERE b.id = ANY (v_ids)
     AND b.anonymised_at IS NULL;
  GET DIAGNOSTICS n_book = ROW_COUNT;

  -- Residual copies of the same data. Edit-audit rows keep the field name and the accounting values
  -- (price, status, schedule); every other old/new value is wiped.
  UPDATE public.booking_edit_audit_log a
     SET old_value = NULL, new_value = NULL
   WHERE a.booking_id = ANY (v_ids)
     AND (a.old_value IS NOT NULL OR a.new_value IS NOT NULL)
     AND a.field NOT IN (
       'amount_czk', 'amount_eur', 'outbound_amount_czk', 'return_amount_czk', 'driver_price_czk',
       'status', 'vehicle_class', 'pickup_date', 'pickup_time', 'return_date', 'passengers',
       'luggage', 'hours', 'distance_km'
     );
  GET DIAGNOSTICS n_audit = ROW_COUNT;

  UPDATE public.email_log l
     SET recipient = 'erased@erased.invalid'
   WHERE (l.booking_id = ANY (v_ids) OR public.identity_normalize_email(l.recipient) = ANY (v_emails))
     AND l.recipient <> 'erased@erased.invalid';
  GET DIAGNOSTICS n_mail = ROW_COUNT;

  UPDATE public.gnet_bookings g
     SET raw_payload = '{}'::jsonb, last_push_error = NULL
   WHERE g.booking_id = ANY (v_ids)
     AND (g.raw_payload <> '{}'::jsonb OR g.last_push_error IS NOT NULL);
  GET DIAGNOSTICS n_gnet = ROW_COUNT;

  UPDATE public.driver_assignments d
     SET trip_note = NULL
   WHERE d.booking_id = ANY (v_ids)
     AND d.trip_note IS NOT NULL;
  GET DIAGNOSTICS n_notes = ROW_COUNT;

  -- Contact forms and quote requests of the person's emails are removed, not kept.
  DELETE FROM public.inquiries i
   WHERE i.id = ANY (r.inquiry_ids)
      OR COALESCE(i.email_normalized, public.identity_normalize_email(i.email)) = ANY (v_emails);
  GET DIAGNOSTICS n_inq = ROW_COUNT;

  DELETE FROM public.quote_leads q
   WHERE public.identity_normalize_email(q.email) = ANY (v_emails);
  GET DIAGNOSTICS n_ql = ROW_COUNT;

  -- The identity rows (emails, phones, booking links cascade).
  IF r.identity_id IS NOT NULL THEN
    DELETE FROM public.contact_identities c WHERE c.id = r.identity_id;
    GET DIAGNOSTICS n_ident = ROW_COUNT;
  END IF;

  -- Automatic "shared" flags for the person's numbers, when no other identity holds the number.
  DELETE FROM public.phone_flags f
   WHERE f.phone = ANY (v_phones)
     AND f.source = 'auto'
     AND NOT EXISTS (SELECT 1 FROM public.identity_phones p WHERE p.phone = f.phone);

  v_counts := jsonb_build_object(
    'bookings_anonymised', n_book,
    'inquiries_deleted', n_inq,
    'quote_leads_deleted', n_ql,
    'audit_values_scrubbed', n_audit,
    'email_log_scrubbed', n_mail,
    'gnet_payloads_scrubbed', n_gnet,
    'trip_notes_scrubbed', n_notes,
    'identity_deleted', n_ident
  );

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object('supabase', v_counts || jsonb_build_object('done_at', now())),
         status = 'running'
   WHERE e.id = p_request_id;

  RETURN v_counts;
END;
$$;

-- ── erasure_complete: the PII-free audit record ─────────────────────────────
-- Keeps email_hmac, the dates, steps, counts and the verified flag. 'failed' (unverified CRM data) is
-- completed BEFORE Supabase is touched; the identity stays frozen and a new request can be made.
CREATE OR REPLACE FUNCTION public.erasure_complete(
  p_request_id uuid,
  p_verified   boolean,
  p_counts     jsonb,
  p_status     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'erasure_complete: invalid status';
  END IF;

  SELECT * INTO r FROM public.erasure_requests e WHERE e.id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('confirmed', 'running') THEN
    RETURN;
  END IF;

  IF p_status = 'completed' AND (p_verified IS NOT TRUE OR r.steps -> 'supabase' IS NULL) THEN
    RAISE EXCEPTION 'erasure_complete: completed needs a verified request with the supabase step done';
  END IF;

  UPDATE public.erasure_requests e
     SET status         = p_status,
         completed_at   = now(),
         counts         = COALESCE(p_counts, '{}'::jsonb),
         verified       = p_verified,
         identity_id    = NULL,
         user_id        = NULL,
         booking_ids    = '{}',
         inquiry_ids    = '{}',
         subject_emails = '{}',
         subject_phones = '{}'
   WHERE e.id = p_request_id;
END;
$$;

-- ── erasure_scope: Supabase-only preview data ──────────────────────────────
-- Outcomes: 'invalid' | 'shared_phone' (with the identities count) | 'not_found' |
-- 'already_in_progress' | 'ok'. An email search covers the identity's emails (phone-merged ones
-- included, D-10), its account, its bookings, inquiries and quote requests; a person who never got an
-- identity (inquiry-only, or before the backfill) is found through the email alone. A phone search
-- resolves ONLY through a non-shared identity phone: a desk / hotel number never picks a person.
-- When both an email and a phone are given the email wins. Read-only; nothing is locked.
CREATE OR REPLACE FUNCTION public.erasure_scope(p_email text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_email     text;
  v_phone     text;
  v_identity  uuid;
  v_user      uuid;
  v_emails    text[];
  v_phones    text[];
  v_owners    uuid[];
  v_shared    boolean;
  v_bookings  uuid[];
  v_inquiries uuid[];
  v_quote     integer;
  v_upcoming  integer;
  v_primary   text;
BEGIN
  v_email := public.identity_normalize_email(p_email);
  v_phone := public.identity_normalize_phone(p_phone);
  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT ie.identity_id INTO v_identity FROM public.identity_emails ie WHERE ie.email = v_email;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT p.identity_id), '{}'::uuid[])
      INTO v_owners
      FROM public.identity_phones p
     WHERE p.phone = v_phone;
    SELECT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared)
      INTO v_shared;
    IF v_shared OR cardinality(v_owners) > 1 THEN
      RETURN jsonb_build_object('outcome', 'shared_phone', 'identities', cardinality(v_owners));
    END IF;
    IF cardinality(v_owners) = 0 THEN
      RETURN jsonb_build_object('outcome', 'not_found');
    END IF;
    v_identity := v_owners[1];
  END IF;

  v_emails := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             CASE WHEN v_email IS NULL THEN '{}'::text[] ELSE ARRAY[v_email] END
             || ARRAY(SELECT ie.email FROM public.identity_emails ie WHERE ie.identity_id = v_identity)
           ) AS x
     ORDER BY x
  );
  SELECT ie.email INTO v_primary
    FROM public.identity_emails ie
   WHERE ie.identity_id = v_identity
   ORDER BY ie.created_at, ie.email
   LIMIT 1;
  v_primary := COALESCE(v_primary, v_email);

  v_user := COALESCE(
    (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_identity),
    (SELECT u.id FROM auth.users u WHERE public.identity_normalize_email(u.email) = ANY (v_emails) LIMIT 1)
  );

  v_phones := ARRAY(
    SELECT p.phone
      FROM public.identity_phones p
      LEFT JOIN public.phone_flags f ON f.phone = p.phone
     WHERE p.identity_id = v_identity
       AND (f.phone IS NULL OR f.shared = false)
     ORDER BY p.first_seen, p.phone
  );

  v_bookings := public.erasure_booking_ids(v_identity, v_user, v_emails);
  v_inquiries := public.erasure_inquiry_ids(v_emails);
  SELECT count(*)::integer INTO v_quote
    FROM public.quote_leads q
   WHERE public.identity_normalize_email(q.email) = ANY (v_emails);
  SELECT count(*)::integer INTO v_upcoming
    FROM public.bookings b
   WHERE b.id = ANY (v_bookings)
     AND b.pickup_utc >= now()
     AND b.status <> 'cancelled';

  IF v_identity IS NULL AND v_user IS NULL
     AND cardinality(v_bookings) = 0 AND cardinality(v_inquiries) = 0 AND v_quote = 0 THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.erasure_requests e
     WHERE e.status IN ('confirmed', 'running')
       AND ((v_identity IS NOT NULL AND e.identity_id = v_identity) OR e.subject_emails && v_emails)
  ) THEN
    RETURN jsonb_build_object('outcome', 'already_in_progress');
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'primary_email', v_primary,
    'emails', to_jsonb(v_emails),
    'phones', to_jsonb(v_phones),
    'identity_id', v_identity,
    'user_id', v_user,
    'booking_ids', to_jsonb(v_bookings),
    'inquiry_ids', to_jsonb(v_inquiries),
    'counts', jsonb_build_object(
      'bookings', cardinality(v_bookings),
      'upcoming', v_upcoming,
      'inquiries', cardinality(v_inquiries),
      'quote_leads', v_quote,
      'has_account', v_user IS NOT NULL
    )
  );
END;
$$;

-- ── erasure_preview_create: the preview row the admin confirms ──────────────
-- Stores the scope as shown; expires_at = now() + the TTL, capped at one hour. A preview holds
-- plaintext scope, so expired unconfirmed previews are deleted on every new preview.
CREATE OR REPLACE FUNCTION public.erasure_preview_create(
  p_actor       uuid,
  p_email_hmac  text,
  p_scope       jsonb,
  p_ttl_seconds integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_scope IS NULL OR p_scope ->> 'outcome' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'erasure_preview_create: scope is not ok';
  END IF;

  DELETE FROM public.erasure_requests e
   WHERE e.status = 'previewed' AND e.expires_at < now();

  INSERT INTO public.erasure_requests (
    requested_by, email_hmac, identity_id, user_id, booking_ids, inquiry_ids,
    subject_emails, subject_phones, status, expires_at, counts
  )
  VALUES (
    p_actor,
    p_email_hmac,
    (p_scope ->> 'identity_id')::uuid,
    (p_scope ->> 'user_id')::uuid,
    ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(COALESCE(p_scope -> 'booking_ids', '[]'::jsonb)) AS x),
    ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(COALESCE(p_scope -> 'inquiry_ids', '[]'::jsonb)) AS x),
    ARRAY(SELECT x FROM jsonb_array_elements_text(COALESCE(p_scope -> 'emails', '[]'::jsonb)) AS x),
    ARRAY(SELECT x FROM jsonb_array_elements_text(COALESCE(p_scope -> 'phones', '[]'::jsonb)) AS x),
    'previewed',
    now() + make_interval(secs => least(greatest(COALESCE(p_ttl_seconds, 60), 60), 3600)),
    COALESCE(p_scope -> 'counts', '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── erasure_log: the PII-free list for the admin page ───────────────────────
-- reference = the first 10 hex characters of the keyed email hash; previews are not erasures.
CREATE OR REPLACE FUNCTION public.erasure_log(p_limit integer)
RETURNS TABLE (
  id           uuid,
  reference    text,
  status       text,
  requested_at timestamptz,
  completed_at timestamptz,
  steps        jsonb,
  verified     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id, left(e.email_hmac, 10), e.status, e.requested_at, e.completed_at, e.steps, e.verified
    FROM public.erasure_requests e
   WHERE e.status <> 'previewed'
   ORDER BY e.requested_at DESC
   LIMIT least(greatest(COALESCE(p_limit, 20), 1), 100);
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it, then grant to service_role
-- only. The two scope helpers are internal (called by the definer functions above): not granted.
REVOKE EXECUTE ON FUNCTION public.erasure_booking_ids(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_inquiry_ids(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_scope(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_preview_create(uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_load(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_record_step(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_complete(uuid, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_log(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.erasure_scope(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_preview_create(uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_load(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_record_step(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_complete(uuid, boolean, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_log(integer) TO service_role;
