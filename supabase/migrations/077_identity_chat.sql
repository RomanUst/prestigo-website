-- 077_identity_chat.sql
-- Phase 83 (83-02): the identity layer for the chat path (D-16, D-01 input).
--
-- Why basis 'chat': a stranger who writes to the website chat with a usable email becomes an
-- ordinary site identity (contact_identities + identity_emails), so the Phase 82 rules (email is
-- the key, a phone merges once and is then shared, the split page, GDPR erasure) apply to them
-- unchanged. 'chat' records only HOW the email arrived; it grants nothing.
--
-- The chat path does NOT re-implement matching. identity_resolve_chat takes the same global
-- advisory lock as every other resolver (069 identity_resolve_booking / 073 identity_split) and
-- calls identity_resolve_core(email, phone, 'chat', NULL). Two first conversations of one new email
-- therefore create exactly one identity (global lock + identity_emails primary key).
--
-- "customer" everywhere in this file means: the identity has an account (user_id) OR at least one
-- booking_identity row. This resolves the D-01 / D-16 collision: a chat stranger is an identity but
-- NOT a customer until they book or sign up.
--
-- Operator attach (D-12): an operator may type an email or phone into a Chatwoot contact. It is
-- attached to the EXISTING identity only when no other identity owns it. An email owned by another
-- identity is skipped with 'owned_elsewhere' and nothing changes: no automatic merge (the owner
-- merges or splits on /admin/identities), because an operator typo must never join two people.
-- Attach deliberately does not use core rule 4 and never writes phone_flags.
--
-- Prohibitions (T-83-09): no function here merges two identities, sets user_id or writes
-- booking_identity / bookings / customer_profiles / auth.users. A phone alone never creates an
-- identity (072 rule 1 stays in force for the chat basis).
--
-- Every function: SECURITY DEFINER, SET search_path = '', own REVOKE ... FROM PUBLIC, anon,
-- authenticated (DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE), GRANT to
-- service_role only.

-- ── Basis CHECK: accept 'chat' ──────────────────────────────────────────────
-- The 069 CHECK is inline, so its live name is generated: find it by definition text instead of
-- hard-coding it (re-runnable: a previously re-added constraint matches and is replaced too).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.identity_emails'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%basis%'
  LOOP
    EXECUTE format('ALTER TABLE public.identity_emails DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.identity_emails
  ADD CONSTRAINT identity_emails_basis_check
  CHECK (basis IN ('email', 'phone', 'signup', 'split', 'chat'));

-- ── Read-only classification by email (D-01 input) ──────────────────────────
-- Zero rows when the email does not normalise or has no owner. Writes nothing.
CREATE OR REPLACE FUNCTION public.identity_chat_lookup(p_email_raw text)
RETURNS TABLE (
  identity_id         uuid,
  customer            boolean,
  erasing             boolean,
  espo_contact_id     text,
  chatwoot_contact_id bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id,
         (c.user_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.booking_identity b WHERE b.identity_id = c.id)),
         (c.erasing_at IS NOT NULL),
         c.espo_contact_id,
         c.chatwoot_contact_id
    FROM public.identity_emails e
    JOIN public.contact_identities c ON c.id = e.identity_id
   WHERE e.email = public.identity_normalize_email(p_email_raw);
$$;

-- ── Register / resolve a chat person (D-16) ─────────────────────────────────
-- Same lock as the other resolvers, then the shared core with basis 'chat' and no account.
-- outcome: resolved | no_identity | erasing (core vocabulary). customer is false when no identity.
CREATE OR REPLACE FUNCTION public.identity_resolve_chat(p_email_raw text, p_phone_raw text)
RETURNS TABLE (identity_id uuid, outcome text, customer boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_id       uuid;
  v_outcome  text;
  v_customer boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT r.identity_id, r.outcome
    INTO v_id, v_outcome
    FROM public.identity_resolve_core(p_email_raw, p_phone_raw, 'chat', NULL) r;

  IF v_id IS NOT NULL THEN
    SELECT (c.user_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.booking_identity b WHERE b.identity_id = c.id))
      INTO v_customer
      FROM public.contact_identities c
     WHERE c.id = v_id;
  END IF;

  RETURN QUERY SELECT v_id, v_outcome, COALESCE(v_customer, false);
END;
$$;

-- ── Read-only lookup by Chatwoot contact id ─────────────────────────────────
-- At most 2 rows ordered by created_at: two rows mean the contact id is ambiguous for the caller.
CREATE OR REPLACE FUNCTION public.identity_by_chatwoot_contact(p_contact_id bigint)
RETURNS TABLE (
  identity_id     uuid,
  customer        boolean,
  erasing         boolean,
  espo_contact_id text,
  emails          text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id,
         (c.user_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.booking_identity b WHERE b.identity_id = c.id)),
         (c.erasing_at IS NOT NULL),
         c.espo_contact_id,
         COALESCE(
           ARRAY(SELECT e.email FROM public.identity_emails e WHERE e.identity_id = c.id ORDER BY e.created_at, e.email),
           '{}'::text[]
         )
    FROM public.contact_identities c
   WHERE c.chatwoot_contact_id = p_contact_id
   ORDER BY c.created_at, c.id
   LIMIT 2;
$$;

-- ── The phone a chat Contact may be keyed on ────────────────────────────────
-- E.164 when it normalises and is not flagged shared; NULL otherwise (a shared desk number never
-- keys a chat Contact).
CREATE OR REPLACE FUNCTION public.identity_phone_usable(p_phone_raw text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.p
    FROM (SELECT public.identity_normalize_phone(p_phone_raw) AS p) n
   WHERE n.p IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = n.p AND f.shared);
$$;

-- ── Operator attach (D-12) ──────────────────────────────────────────────────
-- Same global lock. Never merges two identities, never sets user_id, never writes phone_flags.
-- email_outcome: attached | unchanged | owned_elsewhere | none | erasing | identity_missing
-- phone_outcome: attached | unchanged | owned_elsewhere | shared | none | erasing | identity_missing
CREATE OR REPLACE FUNCTION public.identity_attach_chat_contact(
  p_identity_id uuid,
  p_email_raw   text,
  p_phone_raw   text
)
RETURNS TABLE (email_outcome text, phone_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_erasing timestamptz;
  v_email   text;
  v_phone   text;
  v_owner   uuid;
  v_eo      text := 'none';
  v_po      text := 'none';
  v_changed boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT c.erasing_at INTO v_erasing
    FROM public.contact_identities c
   WHERE c.id = p_identity_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'identity_missing'::text, 'identity_missing'::text;
    RETURN;
  END IF;
  IF v_erasing IS NOT NULL THEN
    RETURN QUERY SELECT 'erasing'::text, 'erasing'::text;
    RETURN;
  END IF;

  -- Email: attached only when nobody owns it.
  v_email := public.identity_normalize_email(p_email_raw);
  IF v_email IS NOT NULL THEN
    SELECT e.identity_id INTO v_owner
      FROM public.identity_emails e
     WHERE e.email = v_email;
    IF NOT FOUND THEN
      INSERT INTO public.identity_emails (email, identity_id, basis)
      VALUES (v_email, p_identity_id, 'chat');
      v_eo := 'attached';
      v_changed := true;
    ELSIF v_owner = p_identity_id THEN
      v_eo := 'unchanged';
    ELSE
      v_eo := 'owned_elsewhere';
    END IF;
  END IF;

  -- Phone: stored for this identity only when it is not shared and no other live identity has it.
  v_phone := public.identity_normalize_phone(p_phone_raw);
  IF v_phone IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared) THEN
      v_po := 'shared';
    ELSIF EXISTS (
      SELECT 1
        FROM public.identity_phones p
        JOIN public.contact_identities o ON o.id = p.identity_id
       WHERE p.phone = v_phone AND p.identity_id <> p_identity_id AND o.erasing_at IS NULL
    ) THEN
      v_po := 'owned_elsewhere';
    ELSIF EXISTS (
      SELECT 1 FROM public.identity_phones p WHERE p.phone = v_phone AND p.identity_id = p_identity_id
    ) THEN
      v_po := 'unchanged';
    ELSE
      INSERT INTO public.identity_phones (identity_id, phone)
      VALUES (p_identity_id, v_phone)
      ON CONFLICT (identity_id, phone) DO NOTHING;
      v_po := 'attached';
      v_changed := true;
    END IF;
  END IF;

  IF v_changed THEN
    UPDATE public.contact_identities c
       SET updated_at = now()
     WHERE c.id = p_identity_id;
  END IF;

  RETURN QUERY SELECT v_eo, v_po;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.identity_chat_lookup(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_resolve_chat(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_by_chatwoot_contact(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_attach_chat_contact(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_phone_usable(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.identity_chat_lookup(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_resolve_chat(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_by_chatwoot_contact(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_attach_chat_contact(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_phone_usable(text) TO service_role;
