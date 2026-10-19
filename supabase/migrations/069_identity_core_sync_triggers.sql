-- 069: identity core + booking sync capture (Phase 82, plan 82-01)
--
-- ONE capture point for every booking writer. An AFTER trigger on bookings
-- enqueues an ids-only 'sync.booking:<id>:<bucket>' outbox row whenever a booking
-- is inserted or one of the synced columns changes, so the checkout capture, the
-- Stripe webhook, submit-quote, admin create/PATCH/cancel, GNet and plain SQL all
-- reach the CRM and the chat inbox WITHOUT any change to those call sites.
-- (Signup capture, the user resolver and the profile trigger are added further
-- down in this same file.)
--
-- Bucketed keys (RESEARCH Pattern 1): the key carries floor(epoch / 90). A plain
-- 'sync.booking:<id>' key would swallow every edit after the first (ON CONFLICT
-- DO NOTHING), so a second edit inside the same 90 s bucket reuses the pending
-- row (its available_at is at or after the bucket end, so no write of the bucket
-- is processed early) and an edit in the next bucket gets a row of its own.
--
-- Exception-safe by design: the whole trigger bodies run in an exception block,
-- and the pg_net kick runs in its own nested block. A sync problem (unreadable
-- config, missing outbox, Vault trouble) is reported as a WARNING and can never
-- abort, delay or change a booking or profile write (threat T-82-01).
--
-- Capture is OFF until go-live (plan 82-14) writes integration_config key
-- 'crm_sync_start'. While the key is absent, or its value is unreadable, nothing
-- is enqueued.
--
-- Identity (D-04 email half, D-06): contact_identities / identity_emails /
-- identity_phones / phone_flags / booking_identity live only in Supabase. Phones
-- are stored from plan 82-05 on (this plan's identity_resolve_core matches by
-- email only and accepts the phone argument without using it). Identity links
-- NEVER grant customer-facing access: every table is deny-all (RLS on, no
-- privileges for anon/authenticated) and no customer route or account page reads
-- them, so a merge can never show one customer another person's bookings.
--
-- A signup creates its identity (and later its CRM contact) right at the
-- customer_profiles INSERT, i.e. before the email address is confirmed
-- (RESEARCH Pitfall 13). That is intended: D-01 wants everyone who signed up.
--
-- Concurrency: every public resolver takes ONE global transaction-scoped
-- advisory lock before it reads or writes identity rows, so two first bookings
-- of one new email, resolved at the same time, create exactly one identity.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the
-- REVOKE lines at the bottom must always be re-run.

-- ── Source columns ──────────────────────────────────────────────────────────
-- Set by the erasure job (plan 82-12). A booking with anonymised_at set never
-- gets an identity and never syncs.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;

-- ── Identity tables (D-06) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_identities (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  espo_contact_id     text        CHECK (espo_contact_id IS NULL OR espo_contact_id ~ '^[0-9a-f]{17}$'),
  chatwoot_contact_id bigint      CHECK (chatwoot_contact_id IS NULL OR chatwoot_contact_id > 0),
  erasing_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.identity_emails (
  email       text        PRIMARY KEY
                          CHECK (email = lower(email) AND position('@' in email) > 1 AND char_length(email) <= 254),
  identity_id uuid        NOT NULL REFERENCES public.contact_identities(id) ON DELETE CASCADE,
  basis       text        NOT NULL CHECK (basis IN ('email', 'phone', 'signup', 'split')),
  via_phone   text        CHECK (via_phone IS NULL OR via_phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS identity_emails_identity_idx
  ON public.identity_emails (identity_id);

CREATE TABLE IF NOT EXISTS public.identity_phones (
  identity_id uuid        NOT NULL REFERENCES public.contact_identities(id) ON DELETE CASCADE,
  phone       text        NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  first_seen  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, phone)
);

CREATE INDEX IF NOT EXISTS identity_phones_phone_idx
  ON public.identity_phones (phone);

CREATE TABLE IF NOT EXISTS public.phone_flags (
  phone      text        PRIMARY KEY CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  shared     boolean     NOT NULL DEFAULT true,
  source     text        NOT NULL CHECK (source IN ('auto', 'manual', 'split')),
  note       text        CHECK (note IS NULL OR char_length(note) <= 80),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_identity (
  booking_id  uuid        PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  identity_id uuid        NOT NULL REFERENCES public.contact_identities(id) ON DELETE CASCADE,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_identity_identity_idx
  ON public.booking_identity (identity_id);

-- ── RLS: deny-all, service role bypasses (064 shape) ────────────────────────
REVOKE ALL ON public.contact_identities FROM anon, authenticated;
REVOKE ALL ON public.identity_emails FROM anon, authenticated;
REVOKE ALL ON public.identity_phones FROM anon, authenticated;
REVOKE ALL ON public.phone_flags FROM anon, authenticated;
REVOKE ALL ON public.booking_identity FROM anon, authenticated;

ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_identity ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contact_identities', 'identity_emails', 'identity_phones', 'phone_flags', 'booking_identity']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (false)', t || '_no_public_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (false)', t || '_no_public_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (false) WITH CHECK (false)', t || '_no_public_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_public_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (false)', t || '_no_public_delete', t);
  END LOOP;
END;
$$;

-- ── Pure helpers ────────────────────────────────────────────────────────────

-- Trim spaces, tabs, CR, LF, lower-case. NULL when empty, without '@', over 254
-- characters, or a placeholder domain (GNet '@gnet.local', erased '@erased.invalid').
CREATE OR REPLACE FUNCTION public.identity_normalize_email(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN s.n IS NULL OR s.n = '' THEN NULL
    WHEN position('@' in s.n) < 2 THEN NULL
    WHEN char_length(s.n) > 254 THEN NULL
    WHEN s.n LIKE '%@gnet.local' THEN NULL
    WHEN s.n LIKE '%@erased.invalid' THEN NULL
    ELSE s.n
  END
  FROM (SELECT lower(btrim(p_raw, E' \t\r\n')) AS n) s;
$$;

-- Abandoned online checkout (Phase 80 D-08 / D-21): never a customer yet.
CREATE OR REPLACE FUNCTION public.identity_is_abandoned(
  p_status          text,
  p_source          text,
  p_payment_link_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_status = 'unpaid' AND p_source = 'online' AND p_payment_link_id IS NULL,
    false
  );
$$;

-- ── Resolver core (internal: the caller holds the global identity lock) ─────
-- This plan: email rules only. Plan 82-05 replaces this function with the
-- D-04/D-05 phone rules; the signature stays.
CREATE OR REPLACE FUNCTION public.identity_resolve_core(
  p_email_raw text,
  p_phone_raw text,
  p_basis     text,
  p_user_id   uuid
)
RETURNS TABLE (identity_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_email   text;
  v_id      uuid;
  v_erasing timestamptz;
  v_uid     uuid;
  v_j       uuid;
BEGIN
  v_email := public.identity_normalize_email(p_email_raw);
  IF v_email IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'no_identity'::text;
    RETURN;
  END IF;

  -- The email already belongs to an identity.
  SELECT e.identity_id, c.erasing_at, c.user_id
    INTO v_id, v_erasing, v_uid
    FROM public.identity_emails e
    JOIN public.contact_identities c ON c.id = e.identity_id
   WHERE e.email = v_email;

  IF FOUND THEN
    IF v_erasing IS NOT NULL THEN
      RETURN QUERY SELECT v_id, 'erasing'::text;
      RETURN;
    END IF;
    -- A signup claims the identity, unless that user already has another one
    -- (merging two identities is out of scope here: user_id stays unique).
    IF p_user_id IS NOT NULL AND v_uid IS NULL THEN
      UPDATE public.contact_identities c
         SET user_id = p_user_id, updated_at = now()
       WHERE c.id = v_id
         AND c.user_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.contact_identities x WHERE x.user_id = p_user_id
         );
    END IF;
    RETURN QUERY SELECT v_id, 'resolved'::text;
    RETURN;
  END IF;

  -- New email, but the signed-in user already has an identity: join it.
  IF p_user_id IS NOT NULL THEN
    SELECT c.id, c.erasing_at
      INTO v_j, v_erasing
      FROM public.contact_identities c
     WHERE c.user_id = p_user_id;
    IF FOUND THEN
      IF v_erasing IS NOT NULL THEN
        RETURN QUERY SELECT v_j, 'erasing'::text;
        RETURN;
      END IF;
      INSERT INTO public.identity_emails (email, identity_id, basis)
      VALUES (v_email, v_j, 'signup');
      RETURN QUERY SELECT v_j, 'resolved'::text;
      RETURN;
    END IF;
  END IF;

  -- Brand-new person.
  INSERT INTO public.contact_identities (user_id)
  VALUES (p_user_id)
  RETURNING id INTO v_id;
  INSERT INTO public.identity_emails (email, identity_id, basis)
  VALUES (v_email, v_id, p_basis);
  RETURN QUERY SELECT v_id, 'resolved'::text;
END;
$$;

-- ── Public resolvers (take the global lock, read the source row themselves) ─
CREATE OR REPLACE FUNCTION public.identity_resolve_booking(p_booking_id uuid)
RETURNS TABLE (identity_id uuid, previous_identity_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  b      record;
  r      record;
  v_prev uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT bk.client_email, bk.client_phone, bk.status, bk.booking_source,
         bk.payment_link_id, bk.anonymised_at
    INTO b
    FROM public.bookings bk
   WHERE bk.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'source_missing'::text;
    RETURN;
  END IF;

  SELECT bi.identity_id INTO v_prev
    FROM public.booking_identity bi
   WHERE bi.booking_id = p_booking_id;

  IF b.anonymised_at IS NOT NULL THEN
    DELETE FROM public.booking_identity bi WHERE bi.booking_id = p_booking_id;
    RETURN QUERY SELECT NULL::uuid, v_prev, 'no_identity'::text;
    RETURN;
  END IF;

  IF public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id) THEN
    DELETE FROM public.booking_identity bi WHERE bi.booking_id = p_booking_id;
    RETURN QUERY SELECT NULL::uuid, v_prev, 'abandoned'::text;
    RETURN;
  END IF;

  SELECT * INTO r
    FROM public.identity_resolve_core(b.client_email, b.client_phone, 'email', NULL);

  IF r.outcome = 'resolved' THEN
    INSERT INTO public.booking_identity (booking_id, identity_id)
    VALUES (p_booking_id, r.identity_id)
    ON CONFLICT (booking_id)
    DO UPDATE SET identity_id = EXCLUDED.identity_id, resolved_at = now();
    RETURN QUERY SELECT
      r.identity_id,
      CASE WHEN v_prev IS DISTINCT FROM r.identity_id THEN v_prev ELSE NULL END,
      'resolved'::text;
    RETURN;
  END IF;

  IF r.outcome = 'erasing' THEN
    RETURN QUERY SELECT r.identity_id, NULL::uuid, 'erasing'::text;
    RETURN;
  END IF;

  DELETE FROM public.booking_identity bi WHERE bi.booking_id = p_booking_id;
  RETURN QUERY SELECT NULL::uuid, v_prev, 'no_identity'::text;
END;
$$;

-- ── Read contracts for the CRM / chat mappers ───────────────────────────────

-- One booking as the CRM mapper reads it. Columns absent from the live schema
-- would be emitted as JSON null (none are missing as of 82-LIVE-SCHEMA.md).
CREATE OR REPLACE FUNCTION public.crm_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'booking_reference', b.booking_reference,
    'status', b.status,
    'booking_source', b.booking_source,
    'lead_channel', b.lead_channel,
    'leg', b.leg,
    'trip_type', b.trip_type,
    'payment_intent_id', b.payment_intent_id,
    'payment_link_id', b.payment_link_id,
    'invoice_number', b.invoice_number,
    'pickup_utc', b.pickup_utc,
    'pickup_date', b.pickup_date,
    'pickup_time', b.pickup_time,
    'origin_address', b.origin_address,
    'destination_address', b.destination_address,
    'vehicle_class', b.vehicle_class,
    'passengers', b.passengers,
    'hours', b.hours,
    'amount_eur', b.amount_eur,
    'amount_czk', b.amount_czk,
    'outbound_amount_czk', b.outbound_amount_czk,
    'return_amount_czk', b.return_amount_czk,
    'client_first_name', b.client_first_name,
    'client_last_name', b.client_last_name,
    'client_email', b.client_email,
    'client_phone', b.client_phone,
    'flight_number', b.flight_number,
    -- Accepted driver only (same rule as getAcceptedDriver in lib/email.ts).
    'driver_name', (
      SELECT d.name
        FROM public.driver_assignments da
        JOIN public.drivers d ON d.id = da.driver_id
       WHERE da.booking_id = b.id AND da.status = 'accepted'
       ORDER BY da.created_at DESC
       LIMIT 1
    ),
    'user_id', b.user_id,
    'anonymised_at', b.anonymised_at,
    'created_at', b.created_at,
    'abandoned', public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$;

-- One person with everything the CRM and chat mappers need.
CREATE OR REPLACE FUNCTION public.identity_person(p_identity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'identity', jsonb_build_object(
      'id', c.id,
      'user_id', c.user_id,
      'espo_contact_id', c.espo_contact_id,
      'chatwoot_contact_id', c.chatwoot_contact_id,
      'erasing_at', c.erasing_at
    ),
    'emails', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('email', e.email, 'basis', e.basis, 'via_phone', e.via_phone)
               ORDER BY e.created_at, e.email)
        FROM public.identity_emails e
       WHERE e.identity_id = c.id
    ), '[]'::jsonb),
    -- Shared (desk / company) numbers never identify a person.
    'phones', COALESCE((
      SELECT jsonb_agg(p.phone ORDER BY p.first_seen, p.phone)
        FROM public.identity_phones p
        LEFT JOIN public.phone_flags f ON f.phone = p.phone
       WHERE p.identity_id = c.id
         AND (f.phone IS NULL OR f.shared = false)
    ), '[]'::jsonb),
    'profile', (
      SELECT jsonb_build_object('email', u.email, 'full_name', cp.full_name, 'phone', cp.phone)
        FROM public.customer_profiles cp
        JOIN auth.users u ON u.id = cp.user_id
       WHERE cp.user_id = c.user_id
    ),
    'bookings', COALESCE((
      SELECT jsonb_agg(public.crm_booking(bi.booking_id) ORDER BY bk.created_at, bk.id)
        FROM public.booking_identity bi
        JOIN public.bookings bk ON bk.id = bi.booking_id
       WHERE bi.identity_id = c.id
         AND NOT public.identity_is_abandoned(bk.status, bk.booking_source, bk.payment_link_id)
    ), '[]'::jsonb)
  )
  FROM public.contact_identities c
  WHERE c.id = p_identity_id;
$$;

-- Which identity owns each of these (raw) addresses?
CREATE OR REPLACE FUNCTION public.identity_email_owners(p_emails text[])
RETURNS TABLE (email text, identity_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.email, e.identity_id
    FROM public.identity_emails e
   WHERE e.email = ANY (
     ARRAY(SELECT public.identity_normalize_email(x) FROM unnest(p_emails) AS x)
   );
$$;

-- Store the CRM / chat contact ids on the identity (NULL clears).
CREATE OR REPLACE FUNCTION public.identity_set_espo_contact(p_identity_id uuid, p_contact_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.contact_identities c
     SET espo_contact_id = p_contact_id, updated_at = now()
   WHERE c.id = p_identity_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_set_chatwoot_contact(p_identity_id uuid, p_contact_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.contact_identities c
     SET chatwoot_contact_id = p_contact_id, updated_at = now()
   WHERE c.id = p_identity_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ── Booking capture trigger (function reuses outbox_enqueue 064 / outbox_kick 067) ──
CREATE OR REPLACE FUNCTION public.enqueue_booking_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_key   text;
BEGIN
  BEGIN
    -- An anonymised booking never syncs again.
    IF NEW.anonymised_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- An UPDATE that re-sends unchanged values (admin PATCH) enqueues nothing.
    IF TG_OP = 'UPDATE' THEN
      IF ROW(
           NEW.status, NEW.leg, NEW.booking_reference, NEW.pickup_utc, NEW.pickup_date,
           NEW.pickup_time, NEW.origin_address, NEW.destination_address, NEW.trip_type,
           NEW.vehicle_class, NEW.amount_eur, NEW.amount_czk, NEW.outbound_amount_czk,
           NEW.return_amount_czk, NEW.payment_intent_id, NEW.payment_link_id,
           NEW.invoice_number, NEW.booking_source, NEW.client_first_name,
           NEW.client_last_name, NEW.client_email, NEW.client_phone, NEW.flight_number,
           NEW.driver_id, NEW.user_id
         ) IS NOT DISTINCT FROM ROW(
           OLD.status, OLD.leg, OLD.booking_reference, OLD.pickup_utc, OLD.pickup_date,
           OLD.pickup_time, OLD.origin_address, OLD.destination_address, OLD.trip_type,
           OLD.vehicle_class, OLD.amount_eur, OLD.amount_czk, OLD.outbound_amount_czk,
           OLD.return_amount_czk, OLD.payment_intent_id, OLD.payment_link_id,
           OLD.invoice_number, OLD.booking_source, OLD.client_first_name,
           OLD.client_last_name, OLD.client_email, OLD.client_phone, OLD.flight_number,
           OLD.driver_id, OLD.user_id
         ) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Go-live switch: capture is off until crm_sync_start exists. The cast is
    -- inside this block, so an unreadable value lands in the handler below
    -- (WARNING, nothing enqueued).
    v_start := (
      SELECT c.value FROM public.integration_config c WHERE c.key = 'crm_sync_start'
    )::timestamptz;
    IF v_start IS NULL THEN
      RETURN NEW;
    END IF;

    v_key := 'sync.booking:' || NEW.id::text || ':'
             || (floor(extract(epoch FROM now()) / 90))::bigint::text;

    PERFORM public.outbox_enqueue(
      'sync.booking',
      'booking',
      NEW.id,
      v_key,
      now() + interval '90 seconds'
    );

    -- The kick must never undo the enqueue above.
    BEGIN
      PERFORM public.outbox_kick(v_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'enqueue_booking_sync kick failed: %', SQLERRM;
    END;
  EXCEPTION WHEN OTHERS THEN
    -- NEVER let sync trouble abort a booking INSERT/UPDATE.
    RAISE WARNING 'enqueue_booking_sync failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it, then
-- grant to service_role only (the core is internal: callers must hold the lock;
-- the trigger functions are only ever fired by their triggers).
REVOKE EXECUTE ON FUNCTION public.identity_normalize_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_is_abandoned(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_resolve_core(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_resolve_booking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_booking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_person(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_email_owners(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_set_espo_contact(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_set_chatwoot_contact(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_booking_sync() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.identity_normalize_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_is_abandoned(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_resolve_booking(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_booking(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_person(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_email_owners(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_set_espo_contact(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_set_chatwoot_contact(uuid, bigint) TO service_role;

-- bookings_lead_outbox (067) and bookings_gcal_sync (063) stay untouched.
DROP TRIGGER IF EXISTS bookings_crm_sync ON public.bookings;
CREATE TRIGGER bookings_crm_sync
  AFTER INSERT OR UPDATE OF
    status, leg, booking_reference, pickup_utc, pickup_date, pickup_time,
    origin_address, destination_address, trip_type, vehicle_class,
    amount_eur, amount_czk, outbound_amount_czk, return_amount_czk,
    payment_intent_id, payment_link_id, invoice_number, booking_source,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, driver_id, user_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_booking_sync();
