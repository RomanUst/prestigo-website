-- 073: identities admin backend (Phase 82, plan 82-08, SYNC-03 / D-05 / D-06)
--
-- The owner reviews phone-based merges, marks desk / agency numbers as shared by
-- hand, and splits a wrong merge. Everything is a SECURITY DEFINER RPC callable
-- only by service_role (the admin routes); the identity tables stay deny-all.
--
-- identity_split moves ONE email out of a phone merge into a new identity, in one
-- transaction under the same global advisory lock the resolver takes (T-82-25):
--   - the identity_emails row is re-homed (basis 'split'; via_phone kept as history)
--   - the booking_identity rows whose booking client email is that address follow it
--   - when the old identity's account (user_id) has that email, the account link follows
--   - the phone that caused the merge becomes a shared number (source 'split', unless
--     the owner already marked it manually), so the same merge cannot happen again
--   - an ids-only audit row is written (T-82-24)
--   - sync.espo / sync.chatwoot rows are enqueued for BOTH identities; the handlers
--     (plans 82-07 / 82-10) converge the two systems. No CRM call is made from here.
--
-- Known limits (RESEARCH Pitfall 12): a Chatwoot split cannot move past conversations
-- to the new contact; EspoCRM removes only the split email from the old Contact
-- (82-07 convergence). Nothing here deletes or rewrites CRM / chat data directly.
--
-- This file does not call identity_normalize_phone (it arrives with 072 in the same
-- wave): the phone checks use the E.164 regex, the routes normalise with lib/phone.ts.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE
-- lines at the bottom must always be re-run.

-- ── Audit log (ids only, T-82-24) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_admin_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL CHECK (action IN ('split', 'mark_shared')),
  actor       uuid        NOT NULL,
  identity_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.identity_admin_log FROM anon, authenticated;
ALTER TABLE public.identity_admin_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text := 'identity_admin_log';
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

-- ── identity_split ──────────────────────────────────────────────────────────
-- Returns { outcome, old_identity_id, new_identity_id, keys }.
-- outcome: 'split' | 'not_found' | 'not_phone_merge' | 'erasing'.
CREATE OR REPLACE FUNCTION public.identity_split(p_email text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_email   text;
  v_old     uuid;
  v_basis   text;
  v_phone   text;
  v_erasing timestamptz;
  v_uid     uuid;
  v_new     uuid;
  v_auth    text;
  v_ts      bigint;
  v_keys    text[] := ARRAY[]::text[];
  v_id      uuid;
  v_key     text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  v_email := public.identity_normalize_email(p_email);
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'old_identity_id', NULL,
                              'new_identity_id', NULL, 'keys', '[]'::jsonb);
  END IF;

  SELECT e.identity_id, e.basis, e.via_phone, c.erasing_at, c.user_id
    INTO v_old, v_basis, v_phone, v_erasing, v_uid
    FROM public.identity_emails e
    JOIN public.contact_identities c ON c.id = e.identity_id
   WHERE e.email = v_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'old_identity_id', NULL,
                              'new_identity_id', NULL, 'keys', '[]'::jsonb);
  END IF;

  IF v_basis <> 'phone' THEN
    RETURN jsonb_build_object('outcome', 'not_phone_merge', 'old_identity_id', v_old,
                              'new_identity_id', NULL, 'keys', '[]'::jsonb);
  END IF;

  IF v_erasing IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'erasing', 'old_identity_id', v_old,
                              'new_identity_id', NULL, 'keys', '[]'::jsonb);
  END IF;

  INSERT INTO public.contact_identities DEFAULT VALUES
  RETURNING id INTO v_new;

  UPDATE public.identity_emails
     SET identity_id = v_new, basis = 'split'
   WHERE email = v_email;

  -- Bookings placed with this address follow it.
  UPDATE public.booking_identity bi
     SET identity_id = v_new, resolved_at = now()
    FROM public.bookings b
   WHERE b.id = bi.booking_id
     AND bi.identity_id = v_old
     AND public.identity_normalize_email(b.client_email) = v_email;

  -- The account link follows only when the account's own login email is this address.
  IF v_uid IS NOT NULL THEN
    SELECT public.identity_normalize_email(u.email) INTO v_auth
      FROM auth.users u
     WHERE u.id = v_uid;
    IF v_auth = v_email THEN
      UPDATE public.contact_identities SET user_id = NULL, updated_at = now() WHERE id = v_old;
      UPDATE public.contact_identities SET user_id = v_uid, updated_at = now() WHERE id = v_new;
    END IF;
  END IF;

  -- The number that caused the merge is now a shared number (a manual mark stays manual).
  IF v_phone IS NOT NULL THEN
    INSERT INTO public.phone_flags (phone, shared, source, created_by)
    VALUES (v_phone, true, 'split', p_actor)
    ON CONFLICT (phone) DO UPDATE
       SET shared = true, source = 'split'
     WHERE public.phone_flags.source <> 'manual';
  END IF;

  UPDATE public.contact_identities SET updated_at = now() WHERE id IN (v_old, v_new);

  INSERT INTO public.identity_admin_log (action, actor, identity_id)
  VALUES ('split', p_actor, v_new);

  -- Both persons are refreshed in both systems; the handlers converge them.
  v_ts := floor(extract(epoch FROM clock_timestamp()))::bigint;
  FOREACH v_id IN ARRAY ARRAY[v_new, v_old]
  LOOP
    v_key := 'sync.espo:' || v_id::text || ':s' || v_ts::text;
    PERFORM public.outbox_enqueue('sync.espo', 'person', v_id, v_key, now());
    v_keys := v_keys || v_key;

    v_key := 'sync.chatwoot:' || v_id::text || ':s' || v_ts::text;
    PERFORM public.outbox_enqueue('sync.chatwoot', 'person', v_id, v_key, now());
    v_keys := v_keys || v_key;
  END LOOP;

  RETURN jsonb_build_object('outcome', 'split', 'old_identity_id', v_old,
                            'new_identity_id', v_new, 'keys', to_jsonb(v_keys));
END;
$$;

-- ── identity_phone_merges ───────────────────────────────────────────────────
-- One row per email that joined an identity because of a shared phone number. A split
-- email has basis 'split' and drops out of this list.
CREATE OR REPLACE FUNCTION public.identity_phone_merges()
RETURNS TABLE (
  identity_id   uuid,
  contact_email text,
  merged_email  text,
  phone         text,
  bookings      integer,
  merged_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.identity_id,
         (SELECT c.email
            FROM public.identity_emails c
           WHERE c.identity_id = m.identity_id
             AND c.basis <> 'phone'
           ORDER BY c.created_at, c.email
           LIMIT 1) AS contact_email,
         m.email AS merged_email,
         m.via_phone AS phone,
         (SELECT count(*)::integer
            FROM public.booking_identity bi
            JOIN public.bookings b ON b.id = bi.booking_id
           WHERE bi.identity_id = m.identity_id
             AND public.identity_normalize_email(b.client_email) = m.email) AS bookings,
         m.created_at AS merged_at
    FROM public.identity_emails m
   WHERE m.basis = 'phone'
   ORDER BY m.created_at DESC, m.email;
$$;

-- ── identity_shared_phones ──────────────────────────────────────────────────
-- Numbers flagged as shared (auto, manual or split) with the emails that use them.
CREATE OR REPLACE FUNCTION public.identity_shared_phones()
RETURNS TABLE (
  phone     text,
  source    text,
  note      text,
  marked_at timestamptz,
  emails    text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.phone,
         f.source,
         f.note,
         f.created_at AS marked_at,
         COALESCE(
           (SELECT array_agg(DISTINCT x.email ORDER BY x.email)
              FROM (
                SELECT e.email
                  FROM public.identity_phones p
                  JOIN public.identity_emails e ON e.identity_id = p.identity_id
                 WHERE p.phone = f.phone
                UNION
                SELECT e2.email
                  FROM public.identity_emails e2
                 WHERE e2.via_phone = f.phone
              ) x),
           ARRAY[]::text[]
         ) AS emails
    FROM public.phone_flags f
   WHERE f.shared = true
   ORDER BY f.created_at DESC, f.phone;
$$;

-- ── identity_mark_shared ────────────────────────────────────────────────────
-- D-05 manual mark. There is no unmark operation. Returns 'marked' | 'already_shared' | 'invalid'.
CREATE OR REPLACE FUNCTION public.identity_mark_shared(p_phone text, p_note text, p_actor uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_shared boolean;
  v_found  boolean;
  v_note   text;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN 'invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  v_note := NULLIF(left(btrim(p_note), 80), '');

  SELECT f.shared INTO v_shared FROM public.phone_flags f WHERE f.phone = p_phone;
  v_found := FOUND;

  IF v_found AND v_shared THEN
    RETURN 'already_shared';
  END IF;

  IF v_found THEN
    UPDATE public.phone_flags
       SET shared = true, source = 'manual', note = v_note, created_by = p_actor
     WHERE phone = p_phone;
  ELSE
    INSERT INTO public.phone_flags (phone, shared, source, note, created_by)
    VALUES (p_phone, true, 'manual', v_note, p_actor);
  END IF;

  INSERT INTO public.identity_admin_log (action, actor, identity_id)
  VALUES ('mark_shared', p_actor, NULL);

  RETURN 'marked';
END;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.identity_phone_merges() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_shared_phones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_mark_shared(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_split(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.identity_phone_merges() TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_shared_phones() TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_mark_shared(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_split(text, uuid) TO service_role;
