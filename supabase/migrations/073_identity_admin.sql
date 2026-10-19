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

-- ── Privileges ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.identity_split(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.identity_split(text, uuid) TO service_role;
