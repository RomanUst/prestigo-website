-- 072: identity phone rules (Phase 82, plan 82-05, SYNC-03)
--
-- Adds phone matching to the identity resolver exactly as D-04 and D-05 say:
--
--   D-04  a new email that arrives with an E.164 phone that is NOT shared and that belongs to
--         exactly one identity joins that identity automatically. The new identity_emails row
--         carries basis 'phone' and via_phone = that phone: the "merged by phone" marker the
--         Identities page lists (and can split).
--   D-05  a number seen with two different emails, or that collides between two identities, or
--         that the owner marked shared, is a shared (desk / hotel / agency) number and is NEVER
--         used for matching again and never reaches identity_person.phones (069 filters it).
--
-- D-04/D-05 interplay (RESEARCH Open Question 1): the first phone-only merge for a number DOES
-- happen, and that very merge makes the number "seen with two emails", so phone_flags gets
-- (phone, shared = true, source 'auto') in the same transaction. A desk number can therefore
-- cause at most one wrong merge. Known agency / hotel desk numbers (TravelExpress, TLTGO,
-- Traveltime, ...) are marked shared by the owner BEFORE the identity pass (plan 82-14), so even
-- that one merge never happens for them. No extra guard (for example "last names differ") is
-- added: no locked decision asks for it. A phone-only merge is always listed for review and can
-- be split on the Identities page. Identity links grant no customer access (069), so a wrong
-- merge is an operator problem, never a data leak to a customer (T-82-14).
--
-- Guards (all inside identity_resolve_core, so the live resolvers and the backfill pass share them):
--   * A phone alone never creates or extends an identity: an unusable email resolves to
--     'no_identity' whatever the phone.
--   * Signup guard: a signup is never phone-merged into an identity that already belongs to a
--     different account (user_id differs). It gets its own identity and the number becomes shared.
--   * Erasing guard: a number owned only by an identity with erasing_at set is ignored (no
--     merge, no shared flag), so an erasure in progress cannot absorb a new person.
--   * Only lib/phone.ts normalizePhone semantics are used (identity_normalize_phone below is a
--     line-by-line port; tests/fixtures/identity-cases.json drives the TypeScript test AND the
--     live smoke so the two cannot drift). The backfill-only "+420" guessing never appears here.
--   * Rows of phone_flags with shared = false (an owner's explicit "not shared") are respected:
--     the automatic flag is INSERT ... ON CONFLICT DO NOTHING and never overrides an owner's row.
--
-- Ordering (live): when two new emails with the same new phone are processed live, which one
-- becomes the primary and which the "merged by phone" email depends on delivery order. The
-- backfill pass (82-09) is chronological and deterministic; either live outcome is listed on
-- the Identities page for a split.
--
-- identity_person (069) is deliberately untouched: it already filters shared phones out.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE lines at the
-- bottom must always be re-run (CREATE OR REPLACE keeps grants; the lines are written anyway).

-- ── Phone normaliser (port of lib/phone.ts normalizePhone) ──────────────────
-- Returns the number in E.164 form, or NULL when it has no country code or is not a plausible
-- international number. Character classes are built with chr() so the file is ASCII-clean and
-- no regex \u escape is relied upon:
--   whitespace  = JS \s and trim(): U+0009..000D, space, U+00A0, U+1680, U+2000..200A,
--                 U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF (listed explicitly, not [[:space:]])
--   invisible   = U+200B..200F, U+202A..202E, U+2066..2069, U+061C, U+FEFF
--   dashes      = U+2010..2015, U+2212, U+FE58, U+FE63, U+FF0D
--   digit zeros = U+0660 (Arabic-Indic), U+06F0 (Extended Arabic-Indic), U+0966 (Devanagari),
--                 U+FF10 (fullwidth)
--   fullwidth   = U+FF0B plus, U+FF08 / U+FF09 brackets, U+FF0E dot
CREATE OR REPLACE FUNCTION public.identity_normalize_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  c_ws        constant text := chr(9) || '-' || chr(13) || ' ' || chr(160) || chr(5760)
                            || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233)
                            || chr(8239) || chr(8287) || chr(12288) || chr(65279);
  c_invisible constant text := chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
                            || chr(8294) || '-' || chr(8297) || chr(1564) || chr(65279);
  c_dashes    constant text := chr(8208) || '-' || chr(8213) || chr(8722) || chr(65112)
                            || chr(65123) || chr(65293);
  v_s         text;
  v_digits    text;
  v_cc        text;
  v_zero      integer;
  v_i         integer;
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- foldUnicode: invisible marks out, non-ASCII digits to 0-9, fullwidth + ( ) . and dashes.
  v_s := regexp_replace(p_raw, '[' || c_invisible || ']', '', 'g');
  FOREACH v_zero IN ARRAY ARRAY[1632, 1776, 2406, 65296] LOOP
    FOR v_i IN 0..9 LOOP
      v_s := replace(v_s, chr(v_zero + v_i), v_i::text);
    END LOOP;
  END LOOP;
  v_s := replace(v_s, chr(65291), '+');
  v_s := replace(v_s, chr(65288), '(');
  v_s := replace(v_s, chr(65289), ')');
  v_s := replace(v_s, chr(65294), '.');
  v_s := regexp_replace(v_s, '[' || c_dashes || ']', '-', 'g');

  -- "(0)" is the optional trunk digit written in brackets: drop it before the brackets go.
  v_s := regexp_replace(v_s, '\([' || c_ws || ']*0[' || c_ws || ']*\)', '', 'g');
  v_s := regexp_replace(v_s, '[' || c_ws || '.()-]', '', 'g');

  IF left(v_s, 2) = '00' THEN
    v_s := '+' || substr(v_s, 3);
  END IF;
  IF left(v_s, 1) <> '+' THEN
    RETURN NULL;
  END IF;

  -- Czechia / Slovakia have no trunk prefix: a 0 after +420 / +421 is rejected, not repaired.
  v_digits := substr(v_s, 2);
  IF left(v_digits, 4) IN ('4200', '4210') THEN
    RETURN NULL;
  END IF;

  -- A single trunk 0 directly after the country code is dropped for these codes (Italy keeps it).
  FOREACH v_cc IN ARRAY ARRAY['44', '49', '43', '41', '31', '32', '33', '36', '48'] LOOP
    IF left(v_digits, 3) = v_cc || '0' THEN
      v_s := '+' || v_cc || substr(v_digits, 4);
      EXIT;
    END IF;
  END LOOP;

  IF v_s ~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN v_s;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Resolver core (internal: the caller holds the global identity lock) ─────
-- Replaces the 069 email-only core. Same signature. With e = normalised email and
-- p = identity_normalize_phone(p_phone_raw) (treated as NULL when phone_flags says it is shared):
--   1. e NULL                                  -> (NULL, 'no_identity')
--   2. an identity I owns e                    -> I erasing: (I, 'erasing'); else claim the
--                                                 account when I has none, handle p, (I, 'resolved')
--   3. e new, p_user_id already has identity J -> e joins J (basis 'signup'), handle p for J
--   4. e new, p owned by exactly one live identity J that is not another account's
--                                              -> e joins J (basis 'phone', via_phone p), p shared
--   5. otherwise                               -> new identity N (user_id = p_user_id)
-- "handle p for X": a different live identity owns p -> flag p shared (auto); otherwise remember
-- p for X in identity_phones.
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
  v_phone   text;
  v_id      uuid;
  v_erasing timestamptz;
  v_uid     uuid;
  v_j       uuid;
  v_owners  uuid[];
BEGIN
  -- Rule 1: a phone alone never creates or extends an identity.
  v_email := public.identity_normalize_email(p_email_raw);
  IF v_email IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'no_identity'::text;
    RETURN;
  END IF;

  -- A number flagged shared (automatically or by the owner) is never used again.
  v_phone := public.identity_normalize_phone(p_phone_raw);
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared
  ) THEN
    v_phone := NULL;
  END IF;

  -- Rule 2: the email already belongs to an identity.
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
    IF v_phone IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
          FROM public.identity_phones p
          JOIN public.contact_identities o ON o.id = p.identity_id
         WHERE p.phone = v_phone AND p.identity_id <> v_id AND o.erasing_at IS NULL
      ) THEN
        -- Collision: another live person has this number too -> shared, nothing merged.
        INSERT INTO public.phone_flags (phone, shared, source)
        VALUES (v_phone, true, 'auto')
        ON CONFLICT (phone) DO NOTHING;
      ELSE
        INSERT INTO public.identity_phones (identity_id, phone)
        VALUES (v_id, v_phone)
        ON CONFLICT (identity_id, phone) DO NOTHING;
      END IF;
    END IF;
    RETURN QUERY SELECT v_id, 'resolved'::text;
    RETURN;
  END IF;

  -- Rule 3: new email, but the signed-in user already has an identity: join it.
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
      IF v_phone IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
            FROM public.identity_phones p
            JOIN public.contact_identities o ON o.id = p.identity_id
           WHERE p.phone = v_phone AND p.identity_id <> v_j AND o.erasing_at IS NULL
        ) THEN
          INSERT INTO public.phone_flags (phone, shared, source)
          VALUES (v_phone, true, 'auto')
          ON CONFLICT (phone) DO NOTHING;
        ELSE
          INSERT INTO public.identity_phones (identity_id, phone)
          VALUES (v_j, v_phone)
          ON CONFLICT (identity_id, phone) DO NOTHING;
        END IF;
      END IF;
      RETURN QUERY SELECT v_j, 'resolved'::text;
      RETURN;
    END IF;
  END IF;

  -- Rule 4: new email, un-shared phone owned by exactly one identity -> "merged by phone".
  IF v_phone IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT p.identity_id), '{}'::uuid[])
      INTO v_owners
      FROM public.identity_phones p
     WHERE p.phone = v_phone;

    IF cardinality(v_owners) = 1 THEN
      SELECT c.id, c.erasing_at, c.user_id
        INTO v_j, v_erasing, v_uid
        FROM public.contact_identities c
       WHERE c.id = v_owners[1];

      -- Signup guard: never absorb a signup into an identity of a different account.
      IF FOUND
         AND v_erasing IS NULL
         AND NOT (p_user_id IS NOT NULL AND v_uid IS NOT NULL AND v_uid <> p_user_id)
      THEN
        INSERT INTO public.identity_emails (email, identity_id, basis, via_phone)
        VALUES (v_email, v_j, 'phone', v_phone);
        -- A signup that lands on a guest identity claims it (same as rule 2).
        IF p_user_id IS NOT NULL AND v_uid IS NULL THEN
          UPDATE public.contact_identities c
             SET user_id = p_user_id, updated_at = now()
           WHERE c.id = v_j
             AND c.user_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM public.contact_identities x WHERE x.user_id = p_user_id
             );
        END IF;
        -- The merge itself makes the number "seen with two emails": shared from now on.
        INSERT INTO public.phone_flags (phone, shared, source)
        VALUES (v_phone, true, 'auto')
        ON CONFLICT (phone) DO NOTHING;
        RETURN QUERY SELECT v_j, 'resolved'::text;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Rule 5: brand-new person.
  INSERT INTO public.contact_identities (user_id)
  VALUES (p_user_id)
  RETURNING id INTO v_id;
  INSERT INTO public.identity_emails (email, identity_id, basis)
  VALUES (v_email, v_id, p_basis);

  IF v_phone IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM public.identity_phones p
        JOIN public.contact_identities o ON o.id = p.identity_id
       WHERE p.phone = v_phone AND p.identity_id <> v_id AND o.erasing_at IS NULL
    ) THEN
      -- Signup-guard / collision case: a live person owns it -> shared, not stored.
      INSERT INTO public.phone_flags (phone, shared, source)
      VALUES (v_phone, true, 'auto')
      ON CONFLICT (phone) DO NOTHING;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.identity_phones p WHERE p.phone = v_phone AND p.identity_id <> v_id
    ) THEN
      -- Unowned: remember it for this person. (Owned only by an erasing identity: ignored.)
      INSERT INTO public.identity_phones (identity_id, phone)
      VALUES (v_id, v_phone)
      ON CONFLICT (identity_id, phone) DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, 'resolved'::text;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Both are internal helpers. identity_resolve_core is not granted to anyone (callers are the
-- 069 resolvers, which run as the function owner); the normaliser is readable by service_role
-- for the backfill pass and admin tooling.
REVOKE EXECUTE ON FUNCTION public.identity_normalize_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_resolve_core(text, text, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.identity_normalize_phone(text) TO service_role;
