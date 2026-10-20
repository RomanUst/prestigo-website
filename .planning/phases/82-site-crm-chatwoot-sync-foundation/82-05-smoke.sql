-- 82-05 smoke: rolled-back, fixture-driven proof of migration 072 (identity phone rules).
--
-- GENERATED from tests/fixtures/identity-cases.json (the same file drives tests/identity.test.ts).
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `072_identity_phone_rules`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (auth users, identities,
-- phone flags, bookings) is rolled back. ONLY the message SMOKE_OK_82_05 means success; any other
-- exception message names the failed assertion (FAIL ...).
--
-- Marker data: emails smoke+82-05-<scenario>-<label>@rideprestigo.com, test phones +420777 9xx xxx.
-- Preconditions: capture is off (integration_config key crm_sync_start absent) and no +420777 phone
-- exists in identity_phones / phone_flags.

DO $smoke$
DECLARE
  r         record;
  v_ids     uuid[];
  v_ord     integer[];
  v_pos     integer;
  v_u1      uuid;
  v_u2      uuid;
  v_j       jsonb;
  v_n       integer;
  v_asserts integer := 0;
  v_b1      uuid;
  v_b2      uuid;
BEGIN
  -- The public resolvers hold this lock; the core assumes it.
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  -- ── Preconditions ───────────────────────────────────────────────────────
  IF to_regprocedure('public.identity_normalize_phone(text)') IS NULL THEN
    RAISE EXCEPTION 'FAIL pre: identity_normalize_phone is missing (072 not applied)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'crm_sync_start') THEN
    RAISE EXCEPTION 'FAIL pre: crm_sync_start is already set (capture is live); aborting smoke';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_phones WHERE phone LIKE '+420777%')
     OR EXISTS (SELECT 1 FROM public.phone_flags WHERE phone LIKE '+420777%') THEN
    RAISE EXCEPTION 'FAIL pre: +420777 test phones are already in use';
  END IF;

  -- ── Function shape ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.identity_normalize_phone(text)'::regprocedure
       AND p.provolatile = 'i'
       AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'FAIL shape: identity_normalize_phone must be IMMUTABLE with search_path = empty';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.identity_resolve_core(text, text, text, uuid)'::regprocedure
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'FAIL shape: identity_resolve_core must stay SECURITY DEFINER with search_path = empty';
  END IF;
  v_asserts := v_asserts + 2;

  -- ── Phone normaliser fixtures (57) ─────────────────────────────────────────
  IF public.identity_normalize_phone('+420 725 123 456') IS DISTINCT FROM '+420725123456' THEN
    RAISE EXCEPTION 'FAIL phone fixture 0: got %', public.identity_normalize_phone('+420 725 123 456');
  END IF;
  IF public.identity_normalize_phone('+420-725-123-456') IS DISTINCT FROM '+420725123456' THEN
    RAISE EXCEPTION 'FAIL phone fixture 1: got %', public.identity_normalize_phone('+420-725-123-456');
  END IF;
  IF public.identity_normalize_phone('(+44) 20 7946 0958') IS DISTINCT FROM '+442079460958' THEN
    RAISE EXCEPTION 'FAIL phone fixture 2: got %', public.identity_normalize_phone('(+44) 20 7946 0958');
  END IF;
  IF public.identity_normalize_phone('00420725123456') IS DISTINCT FROM '+420725123456' THEN
    RAISE EXCEPTION 'FAIL phone fixture 3: got %', public.identity_normalize_phone('00420725123456');
  END IF;
  IF public.identity_normalize_phone('  +1 (415) 555-2671 ') IS DISTINCT FROM '+14155552671' THEN
    RAISE EXCEPTION 'FAIL phone fixture 4: got %', public.identity_normalize_phone('  +1 (415) 555-2671 ');
  END IF;
  IF public.identity_normalize_phone('+4.9.30.1234567') IS DISTINCT FROM '+49301234567' THEN
    RAISE EXCEPTION 'FAIL phone fixture 5: got %', public.identity_normalize_phone('+4.9.30.1234567');
  END IF;
  IF public.identity_normalize_phone('00 420 777 900 101') IS DISTINCT FROM '+420777900101' THEN
    RAISE EXCEPTION 'FAIL phone fixture 6: got %', public.identity_normalize_phone('00 420 777 900 101');
  END IF;
  IF public.identity_normalize_phone(E'\u0009+420\u0009777 900 101\u000a') IS DISTINCT FROM '+420777900101' THEN
    RAISE EXCEPTION 'FAIL phone fixture 7: got %', public.identity_normalize_phone(E'\u0009+420\u0009777 900 101\u000a');
  END IF;
  IF public.identity_normalize_phone('725123456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 8: got %', public.identity_normalize_phone('725123456');
  END IF;
  IF public.identity_normalize_phone('420725123456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 9: got %', public.identity_normalize_phone('420725123456');
  END IF;
  IF public.identity_normalize_phone('+0725123456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 10: got %', public.identity_normalize_phone('+0725123456');
  END IF;
  IF public.identity_normalize_phone('+1234567') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 11: got %', public.identity_normalize_phone('+1234567');
  END IF;
  IF public.identity_normalize_phone('+1234567890123456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 12: got %', public.identity_normalize_phone('+1234567890123456');
  END IF;
  IF public.identity_normalize_phone('+420 72a 123 456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 13: got %', public.identity_normalize_phone('+420 72a 123 456');
  END IF;
  IF public.identity_normalize_phone('+1 415 555 2671 ext 5') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 14: got %', public.identity_normalize_phone('+1 415 555 2671 ext 5');
  END IF;
  IF public.identity_normalize_phone('++420777900101') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 15: got %', public.identity_normalize_phone('++420777900101');
  END IF;
  IF public.identity_normalize_phone('') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 16: got %', public.identity_normalize_phone('');
  END IF;
  IF public.identity_normalize_phone('   ') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 17: got %', public.identity_normalize_phone('   ');
  END IF;
  IF public.identity_normalize_phone('unknown') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 18: got %', public.identity_normalize_phone('unknown');
  END IF;
  IF public.identity_normalize_phone(NULL) IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 19: got %', public.identity_normalize_phone(NULL);
  END IF;
  IF public.identity_normalize_phone('+44 (0) 20 7946 0958') IS DISTINCT FROM '+442079460958' THEN
    RAISE EXCEPTION 'FAIL phone fixture 20: got %', public.identity_normalize_phone('+44 (0) 20 7946 0958');
  END IF;
  IF public.identity_normalize_phone('0049 030 1234567') IS DISTINCT FROM '+49301234567' THEN
    RAISE EXCEPTION 'FAIL phone fixture 21: got %', public.identity_normalize_phone('0049 030 1234567');
  END IF;
  IF public.identity_normalize_phone('+49 (0)30 1234567') IS DISTINCT FROM '+49301234567' THEN
    RAISE EXCEPTION 'FAIL phone fixture 22: got %', public.identity_normalize_phone('+49 (0)30 1234567');
  END IF;
  IF public.identity_normalize_phone('+44 020 7946 0958') IS DISTINCT FROM '+442079460958' THEN
    RAISE EXCEPTION 'FAIL phone fixture 23: got %', public.identity_normalize_phone('+44 020 7946 0958');
  END IF;
  IF public.identity_normalize_phone('+43 01 234 5678') IS DISTINCT FROM '+4312345678' THEN
    RAISE EXCEPTION 'FAIL phone fixture 24: got %', public.identity_normalize_phone('+43 01 234 5678');
  END IF;
  IF public.identity_normalize_phone('+41 (0)44 668 18 00') IS DISTINCT FROM '+41446681800' THEN
    RAISE EXCEPTION 'FAIL phone fixture 25: got %', public.identity_normalize_phone('+41 (0)44 668 18 00');
  END IF;
  IF public.identity_normalize_phone('+31 06 12345678') IS DISTINCT FROM '+31612345678' THEN
    RAISE EXCEPTION 'FAIL phone fixture 26: got %', public.identity_normalize_phone('+31 06 12345678');
  END IF;
  IF public.identity_normalize_phone('+48 022 123 45 67') IS DISTINCT FROM '+48221234567' THEN
    RAISE EXCEPTION 'FAIL phone fixture 27: got %', public.identity_normalize_phone('+48 022 123 45 67');
  END IF;
  IF public.identity_normalize_phone('+39 06 1234 5678') IS DISTINCT FROM '+390612345678' THEN
    RAISE EXCEPTION 'FAIL phone fixture 28: got %', public.identity_normalize_phone('+39 06 1234 5678');
  END IF;
  IF public.identity_normalize_phone('+44 20 7046 0958') IS DISTINCT FROM '+442070460958' THEN
    RAISE EXCEPTION 'FAIL phone fixture 29: got %', public.identity_normalize_phone('+44 20 7046 0958');
  END IF;
  IF public.identity_normalize_phone('+420 (0) 725 986 855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 30: got %', public.identity_normalize_phone('+420 (0) 725 986 855');
  END IF;
  IF public.identity_normalize_phone('+420 ( 0 ) 777 900 103') IS DISTINCT FROM '+420777900103' THEN
    RAISE EXCEPTION 'FAIL phone fixture 31: got %', public.identity_normalize_phone('+420 ( 0 ) 777 900 103');
  END IF;
  IF public.identity_normalize_phone('+420 0725 986 855') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 32: got %', public.identity_normalize_phone('+420 0725 986 855');
  END IF;
  IF public.identity_normalize_phone('+4200725986855') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 33: got %', public.identity_normalize_phone('+4200725986855');
  END IF;
  IF public.identity_normalize_phone('00420 0725 986 855') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 34: got %', public.identity_normalize_phone('00420 0725 986 855');
  END IF;
  IF public.identity_normalize_phone('+421 0905 123 456') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 35: got %', public.identity_normalize_phone('+421 0905 123 456');
  END IF;
  IF public.identity_normalize_phone(E'+\u0664\u0662\u0660 \u0667\u0662\u0665 \u0669\u0668\u0666 \u0668\u0665\u0665') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 36: got %', public.identity_normalize_phone(E'+\u0664\u0662\u0660 \u0667\u0662\u0665 \u0669\u0668\u0666 \u0668\u0665\u0665');
  END IF;
  IF public.identity_normalize_phone(E'+\u06f4\u06f2\u06f0 \u06f7\u06f2\u06f5 \u06f9\u06f8\u06f6 \u06f8\u06f5\u06f5') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 37: got %', public.identity_normalize_phone(E'+\u06f4\u06f2\u06f0 \u06f7\u06f2\u06f5 \u06f9\u06f8\u06f6 \u06f8\u06f5\u06f5');
  END IF;
  IF public.identity_normalize_phone(E'+\u096a\u0968\u0966 \u096d\u0968\u096b \u096f\u096e\u096c \u096e\u096b\u096b') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 38: got %', public.identity_normalize_phone(E'+\u096a\u0968\u0966 \u096d\u0968\u096b \u096f\u096e\u096c \u096e\u096b\u096b');
  END IF;
  IF public.identity_normalize_phone(E'+\uff14\uff12\uff10\uff17\uff12\uff15\uff19\uff18\uff16\uff18\uff15\uff15') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 39: got %', public.identity_normalize_phone(E'+\uff14\uff12\uff10\uff17\uff12\uff15\uff19\uff18\uff16\uff18\uff15\uff15');
  END IF;
  IF public.identity_normalize_phone(E'\uff0b420725986855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 40: got %', public.identity_normalize_phone(E'\uff0b420725986855');
  END IF;
  IF public.identity_normalize_phone(E'\uff0b\uff14\uff12\uff10\uff08\uff10\uff09\uff17\uff17\uff17 \uff19\uff10\uff10 \uff11\uff10\uff12') IS DISTINCT FROM '+420777900102' THEN
    RAISE EXCEPTION 'FAIL phone fixture 41: got %', public.identity_normalize_phone(E'\uff0b\uff14\uff12\uff10\uff08\uff10\uff09\uff17\uff17\uff17 \uff19\uff10\uff10 \uff11\uff10\uff12');
  END IF;
  IF public.identity_normalize_phone(E'+420\u2013725\u2014986\u2011855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 42: got %', public.identity_normalize_phone(E'+420\u2013725\u2014986\u2011855');
  END IF;
  IF public.identity_normalize_phone(E'+420\u2212725\u2212986\u2212855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 43: got %', public.identity_normalize_phone(E'+420\u2212725\u2212986\u2212855');
  END IF;
  IF public.identity_normalize_phone(E'\uff08+420\uff09725\uff0d986\uff0d855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 44: got %', public.identity_normalize_phone(E'\uff08+420\uff09725\uff0d986\uff0d855');
  END IF;
  IF public.identity_normalize_phone(E'\u0660\u0660\u0664\u0662\u0660\u0667\u0662\u0665\u0669\u0668\u0666\u0668\u0665\u0665') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 45: got %', public.identity_normalize_phone(E'\u0660\u0660\u0664\u0662\u0660\u0667\u0662\u0665\u0669\u0668\u0666\u0668\u0665\u0665');
  END IF;
  IF public.identity_normalize_phone(E'+420 \u246625 986 855') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 46: got %', public.identity_normalize_phone(E'+420 \u246625 986 855');
  END IF;
  IF public.identity_normalize_phone(E'+\u0664\u0662\u0660 \u0667\u0662a \u0669\u0668\u0666 \u0668\u0665\u0665') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 47: got %', public.identity_normalize_phone(E'+\u0664\u0662\u0660 \u0667\u0662a \u0669\u0668\u0666 \u0668\u0665\u0665');
  END IF;
  IF public.identity_normalize_phone(E'\u0667\u0662\u0665\u0669\u0668\u0666\u0668\u0665\u0665') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL phone fixture 48: got %', public.identity_normalize_phone(E'\u0667\u0662\u0665\u0669\u0668\u0666\u0668\u0665\u0665');
  END IF;
  IF public.identity_normalize_phone(E'+420\u00a0725\u3000986\u2009855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 49: got %', public.identity_normalize_phone(E'+420\u00a0725\u3000986\u2009855');
  END IF;
  IF public.identity_normalize_phone(E'+420\u1680777900101') IS DISTINCT FROM '+420777900101' THEN
    RAISE EXCEPTION 'FAIL phone fixture 50: got %', public.identity_normalize_phone(E'+420\u1680777900101');
  END IF;
  IF public.identity_normalize_phone(E'+420\u2028777\u2029900\u202f101\u205f') IS DISTINCT FROM '+420777900101' THEN
    RAISE EXCEPTION 'FAIL phone fixture 51: got %', public.identity_normalize_phone(E'+420\u2028777\u2029900\u202f101\u205f');
  END IF;
  IF public.identity_normalize_phone(E'\u200e+420 725 986 855\u200f') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 52: got %', public.identity_normalize_phone(E'\u200e+420 725 986 855\u200f');
  END IF;
  IF public.identity_normalize_phone(E'\u202a+420 725 986 855\u202c') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 53: got %', public.identity_normalize_phone(E'\u202a+420 725 986 855\u202c');
  END IF;
  IF public.identity_normalize_phone(E'\u2066+420 725 986 855\u2069') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 54: got %', public.identity_normalize_phone(E'\u2066+420 725 986 855\u2069');
  END IF;
  IF public.identity_normalize_phone(E'\ufeff\u061c+420 725 986 855') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 55: got %', public.identity_normalize_phone(E'\ufeff\u061c+420 725 986 855');
  END IF;
  IF public.identity_normalize_phone(E'\u200f+\u0664\u0662\u0660\u00a0\u0667\u0662\u0665\u200f\u0669\u0668\u0666\u200f\u0668\u0665\u0665') IS DISTINCT FROM '+420725986855' THEN
    RAISE EXCEPTION 'FAIL phone fixture 56: got %', public.identity_normalize_phone(E'\u200f+\u0664\u0662\u0660\u00a0\u0667\u0662\u0665\u200f\u0669\u0668\u0666\u200f\u0668\u0665\u0665');
  END IF;
  v_asserts := v_asserts + 57;

  -- ── Email normaliser fixtures (12) ─────────────────────────────────────────
  IF public.identity_normalize_email('A@B.com') IS DISTINCT FROM 'a@b.com' THEN
    RAISE EXCEPTION 'FAIL email fixture 0: got %', public.identity_normalize_email('A@B.com');
  END IF;
  IF public.identity_normalize_email(E'  Mixed.Case@Example.CZ \u000a') IS DISTINCT FROM 'mixed.case@example.cz' THEN
    RAISE EXCEPTION 'FAIL email fixture 1: got %', public.identity_normalize_email(E'  Mixed.Case@Example.CZ \u000a');
  END IF;
  IF public.identity_normalize_email(E'\u0009x@y.cz\u000d\u000a') IS DISTINCT FROM 'x@y.cz' THEN
    RAISE EXCEPTION 'FAIL email fixture 2: got %', public.identity_normalize_email(E'\u0009x@y.cz\u000d\u000a');
  END IF;
  IF public.identity_normalize_email('smoke+82-05-x@rideprestigo.com') IS DISTINCT FROM 'smoke+82-05-x@rideprestigo.com' THEN
    RAISE EXCEPTION 'FAIL email fixture 3: got %', public.identity_normalize_email('smoke+82-05-x@rideprestigo.com');
  END IF;
  IF public.identity_normalize_email('no-at-sign') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 4: got %', public.identity_normalize_email('no-at-sign');
  END IF;
  IF public.identity_normalize_email('@nolocal.com') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 5: got %', public.identity_normalize_email('@nolocal.com');
  END IF;
  IF public.identity_normalize_email('') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 6: got %', public.identity_normalize_email('');
  END IF;
  IF public.identity_normalize_email('   ') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 7: got %', public.identity_normalize_email('   ');
  END IF;
  IF public.identity_normalize_email(NULL) IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 8: got %', public.identity_normalize_email(NULL);
  END IF;
  IF public.identity_normalize_email('guest@gnet.local') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 9: got %', public.identity_normalize_email('guest@gnet.local');
  END IF;
  IF public.identity_normalize_email('Gone@Erased.Invalid') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 10: got %', public.identity_normalize_email('Gone@Erased.Invalid');
  END IF;
  IF public.identity_normalize_email('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@b.cz') IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'FAIL email fixture 11: got %', public.identity_normalize_email('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@b.cz');
  END IF;
  v_asserts := v_asserts + 12;

  -- ── Scenario 1: email-merge ─────────────────────────────────────────
  -- The same email always lands on the same person; every phone it brings is stored.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-email-merge-a@rideprestigo.com', '+420777901101', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL email-merge step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL email-merge step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-email-merge-a@rideprestigo.com', '+420777901102', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL email-merge step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL email-merge step 1: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 1 THEN
      RAISE EXCEPTION 'FAIL email-merge: % identities, expected 1', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-email-merge-_@rideprestigo.com';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL email-merge: % identities own the marker emails, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL email-merge: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL email-merge: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL email-merge: % identity_phones rows, expected 2', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901101', '+420777901102']::text[]);
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL email-merge: shared phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 10;
  END;

  -- ── Scenario 2: phone-merge-then-shared ─────────────────────────────────────────
  -- D-04 + D-05: a new email with a known un-shared phone joins its owner, and the number is shared from then on.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-phone-merge-then-shared-a@rideprestigo.com', '+420777901201', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-phone-merge-then-shared-b@rideprestigo.com', '+420777901201', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared step 1: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: % identities, expected 1', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-phone-merge-then-shared-_@rideprestigo.com';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: % identities own the marker emails, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: % phone merges, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901201']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901201","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: shared phones %, expected [{"phone":"+420777901201","source":"auto"}]', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[1]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL phone-merge-then-shared: identity_person(0).phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 11;
  END;

  -- ── Scenario 3: third-email-new-identity ─────────────────────────────────────────
  -- After the one allowed phone merge the number is shared: a third email gets its own identity.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-third-email-new-identity-a@rideprestigo.com', '+420777901301', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-third-email-new-identity-b@rideprestigo.com', '+420777901301', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-third-email-new-identity-c@rideprestigo.com', '+420777901301', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 2: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity step 2: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-third-email-new-identity-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: % phone merges, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901301']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901301","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL third-email-new-identity: shared phones %, expected [{"phone":"+420777901301","source":"auto"}]', v_j;
    END IF;
    v_asserts := v_asserts + 12;
  END;

  -- ── Scenario 4: adjacency-single-not-shared ─────────────────────────────────────────
  -- A phone seen with exactly one email is not shared, however often that email returns.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-adjacency-single-not-shared-a@rideprestigo.com', '+420777901401', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-adjacency-single-not-shared-a@rideprestigo.com', '+420777901401', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-adjacency-single-not-shared-a@rideprestigo.com', '+420777901401', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 2: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared step 2: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: % identities, expected 1', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-adjacency-single-not-shared-_@rideprestigo.com';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: % identities own the marker emails, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901401']::text[]);
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: shared phones %, expected []', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[1]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '["+420777901401"]'::jsonb THEN
      RAISE EXCEPTION 'FAIL adjacency-single-not-shared: identity_person(0).phones %, expected ["+420777901401"]', v_j;
    END IF;
    v_asserts := v_asserts + 13;
  END;

  -- ── Scenario 5: collision-shared ─────────────────────────────────────────
  -- An email-matched person brings a phone another person owns: flag it shared, merge nothing.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-collision-shared-a@rideprestigo.com', '+420777901501', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL collision-shared step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL collision-shared step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-collision-shared-b@rideprestigo.com', '+420777901502', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL collision-shared step 1: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL collision-shared step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-collision-shared-b@rideprestigo.com', '+420777901501', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL collision-shared step 2: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL collision-shared step 2: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 3
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-collision-shared-c@rideprestigo.com', '+420777901501', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'FAIL collision-shared step 3: identity ordinal %, expected 3', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL collision-shared step 3: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 3 THEN
      RAISE EXCEPTION 'FAIL collision-shared: % identities, expected 3', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-collision-shared-_@rideprestigo.com';
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'FAIL collision-shared: % identities own the marker emails, expected 3', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL collision-shared: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL collision-shared: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL collision-shared: % identity_phones rows, expected 2', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901501', '+420777901502']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901501","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL collision-shared: shared phones %, expected [{"phone":"+420777901501","source":"auto"}]', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[1]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL collision-shared: identity_person(0).phones %, expected []', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[2]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '["+420777901502"]'::jsonb THEN
      RAISE EXCEPTION 'FAIL collision-shared: identity_person(1).phones %, expected ["+420777901502"]', v_j;
    END IF;
    v_asserts := v_asserts + 16;
  END;

  -- ── Scenario 6: manual-shared ─────────────────────────────────────────
  -- A number the owner marked shared is never used for matching and is never stored.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0: owner marks +420777901601 shared
    INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420777901601', true, 'manual');
    v_ord := array_append(v_ord, NULL::integer);
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-manual-shared-a@rideprestigo.com', '+420777901601', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL manual-shared step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL manual-shared step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-manual-shared-b@rideprestigo.com', '+420777901601', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared step 2: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL manual-shared step 2: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-manual-shared-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL manual-shared: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL manual-shared: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL manual-shared: % identity_phones rows, expected 0', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901601']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901601","source":"manual"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL manual-shared: shared phones %, expected [{"phone":"+420777901601","source":"manual"}]', v_j;
    END IF;
    v_asserts := v_asserts + 10;
  END;

  -- ── Scenario 7: manual-shared-after-owner ─────────────────────────────────────────
  -- Marking a stored number shared afterwards hides it from identity_person and stops every merge.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-manual-shared-after-owner-a@rideprestigo.com', '+420777901701', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1: owner marks +420777901701 shared
    INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420777901701', true, 'manual');
    v_ord := array_append(v_ord, NULL::integer);
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-manual-shared-after-owner-b@rideprestigo.com', '+420777901701', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner step 2: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner step 2: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-manual-shared-after-owner-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901701']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901701","source":"manual"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: shared phones %, expected [{"phone":"+420777901701","source":"manual"}]', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[1]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: identity_person(0).phones %, expected []', v_j;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_j
      FROM jsonb_array_elements_text(public.identity_person(v_ids[2]) -> 'phones') AS x;
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL manual-shared-after-owner: identity_person(1).phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 12;
  END;

  -- ── Scenario 8: signup-guard ─────────────────────────────────────────
  -- A signup is never phone-merged into an identity that belongs to another account.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    v_u1 := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (v_u1, 'authenticated', 'authenticated', 'smoke+82-05-user-signup-guard-u1@rideprestigo.com', '', '', '', '');
    v_u2 := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (v_u2, 'authenticated', 'authenticated', 'smoke+82-05-user-signup-guard-u2@rideprestigo.com', '', '', '', '');
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-guard-a@rideprestigo.com', '+420777901801', 'signup', v_u1);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL signup-guard step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-guard step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-guard-b@rideprestigo.com', '+420777901801', 'signup', v_u2);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL signup-guard step 1: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-guard step 1: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL signup-guard: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-signup-guard-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL signup-guard: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL signup-guard: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL signup-guard: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL signup-guard: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901801']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901801","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL signup-guard: shared phones %, expected [{"phone":"+420777901801","source":"auto"}]', v_j;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contact_identities c WHERE c.id = v_ids[1] AND c.user_id = v_u1) THEN
      RAISE EXCEPTION 'FAIL signup-guard: identity 0 does not belong to account U1';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contact_identities c WHERE c.id = v_ids[2] AND c.user_id = v_u2) THEN
      RAISE EXCEPTION 'FAIL signup-guard: identity 1 does not belong to account U2';
    END IF;
    v_asserts := v_asserts + 12;
  END;

  -- ── Scenario 9: signup-phone-merge ─────────────────────────────────────────
  -- A signup whose phone belongs to a guest (no account yet) joins that guest and claims it.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    v_u1 := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (v_u1, 'authenticated', 'authenticated', 'smoke+82-05-user-signup-phone-merge-u1@rideprestigo.com', '', '', '', '');
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-phone-merge-a@rideprestigo.com', '+420777901901', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-phone-merge-b@rideprestigo.com', '+420777901901', 'signup', v_u1);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge step 1: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge step 1: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: % identities, expected 1', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-signup-phone-merge-_@rideprestigo.com';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: % identities own the marker emails, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: % phone merges, expected 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777901901']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777901901","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: shared phones %, expected [{"phone":"+420777901901","source":"auto"}]', v_j;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contact_identities c WHERE c.id = v_ids[1] AND c.user_id = v_u1) THEN
      RAISE EXCEPTION 'FAIL signup-phone-merge: identity 0 does not belong to account U1';
    END IF;
    v_asserts := v_asserts + 11;
  END;

  -- ── Scenario 10: signup-existing-account ─────────────────────────────────────────
  -- A signed-in user with a new email joins their own identity (basis signup); the phone is not used to merge elsewhere.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    v_u1 := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (v_u1, 'authenticated', 'authenticated', 'smoke+82-05-user-signup-existing-account-u1@rideprestigo.com', '', '', '', '');
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-existing-account-a@rideprestigo.com', '+420777902001', 'signup', v_u1);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-existing-account-b@rideprestigo.com', '+420777902002', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 1: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-signup-existing-account-c@rideprestigo.com', '+420777902002', 'signup', v_u1);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 2: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL signup-existing-account step 2: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-signup-existing-account-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: % identity_phones rows, expected 2', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777902001', '+420777902002']::text[]);
    IF v_j IS DISTINCT FROM '[{"phone":"+420777902002","source":"auto"}]'::jsonb THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: shared phones %, expected [{"phone":"+420777902002","source":"auto"}]', v_j;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contact_identities c WHERE c.id = v_ids[1] AND c.user_id = v_u1) THEN
      RAISE EXCEPTION 'FAIL signup-existing-account: identity 0 does not belong to account U1';
    END IF;
    v_asserts := v_asserts + 13;
  END;

  -- ── Scenario 11: erasing-owner ─────────────────────────────────────────
  -- A number owned only by an identity being erased is ignored: no merge, no shared flag.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-erasing-owner-a@rideprestigo.com', '+420777902101', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1: erasure starts for the identity of step 0
    UPDATE public.contact_identities SET erasing_at = now() WHERE id = v_ids[v_ord[1]];
    v_ord := array_append(v_ord, NULL::integer);
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-erasing-owner-b@rideprestigo.com', '+420777902101', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 2: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 2: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 3
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-erasing-owner-a@rideprestigo.com', '+420777902101', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 3: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'erasing' THEN
      RAISE EXCEPTION 'FAIL erasing-owner step 3: outcome %, expected erasing', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 2 THEN
      RAISE EXCEPTION 'FAIL erasing-owner: % identities, expected 2', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-erasing-owner-_@rideprestigo.com';
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'FAIL erasing-owner: % identities own the marker emails, expected 2', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL erasing-owner: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL erasing-owner: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL erasing-owner: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777902101']::text[]);
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL erasing-owner: shared phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 12;
  END;

  -- ── Scenario 12: phone-without-email ─────────────────────────────────────────
  -- A phone alone never creates or extends an identity.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    v_u1 := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (v_u1, 'authenticated', 'authenticated', 'smoke+82-05-user-phone-without-email-u1@rideprestigo.com', '', '', '', '');
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core(NULL, '+420777902201', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM NULL::integer THEN
      RAISE EXCEPTION 'FAIL phone-without-email step 0: identity ordinal %, expected none', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'no_identity' THEN
      RAISE EXCEPTION 'FAIL phone-without-email step 0: outcome %, expected no_identity', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core(NULL, '+420777902201', 'signup', v_u1);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM NULL::integer THEN
      RAISE EXCEPTION 'FAIL phone-without-email step 1: identity ordinal %, expected none', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'no_identity' THEN
      RAISE EXCEPTION 'FAIL phone-without-email step 1: outcome %, expected no_identity', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-without-email: % identities, expected 0', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-phone-without-email-_@rideprestigo.com';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-without-email: % identities own the marker emails, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-without-email: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-without-email: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL phone-without-email: % identity_phones rows, expected 0', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777902201']::text[]);
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL phone-without-email: shared phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 10;
  END;

  -- ── Scenario 13: unusable-phone ─────────────────────────────────────────
  -- A phone without a country code, empty or "unknown" never matches and is never stored.
  BEGIN
    v_ids := ARRAY[]::uuid[];
    v_ord := ARRAY[]::integer[];
    -- step 0
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-unusable-phone-a@rideprestigo.com', '+420777902301', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 0: identity ordinal %, expected 1', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 0: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 1
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-unusable-phone-b@rideprestigo.com', '0777 902 301', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 1: identity ordinal %, expected 2', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 1: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 2
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-unusable-phone-c@rideprestigo.com', 'unknown', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 2: identity ordinal %, expected 3', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 2: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 3
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-unusable-phone-d@rideprestigo.com', '', 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 4 THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 3: identity ordinal %, expected 4', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 3: outcome %, expected resolved', r.outcome;
    END IF;
    -- step 4
    SELECT * INTO r FROM public.identity_resolve_core('smoke+82-05-unusable-phone-e@rideprestigo.com', NULL, 'email', NULL::uuid);
    v_pos := CASE WHEN r.identity_id IS NULL THEN NULL ELSE array_position(v_ids, r.identity_id) END;
    IF r.identity_id IS NOT NULL AND v_pos IS NULL THEN
      v_ids := array_append(v_ids, r.identity_id);
      v_pos := cardinality(v_ids);
    END IF;
    v_ord := array_append(v_ord, v_pos);
    IF v_pos IS DISTINCT FROM 5 THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 4: identity ordinal %, expected 5', v_pos;
    END IF;
    IF r.outcome IS DISTINCT FROM 'resolved' THEN
      RAISE EXCEPTION 'FAIL unusable-phone step 4: outcome %, expected resolved', r.outcome;
    END IF;
    IF cardinality(v_ids) <> 5 THEN
      RAISE EXCEPTION 'FAIL unusable-phone: % identities, expected 5', cardinality(v_ids);
    END IF;
    SELECT count(DISTINCT e.identity_id) INTO v_n FROM public.identity_emails e
     WHERE e.email LIKE 'smoke+82-05-unusable-phone-_@rideprestigo.com';
    IF v_n <> 5 THEN
      RAISE EXCEPTION 'FAIL unusable-phone: % identities own the marker emails, expected 5', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND e.basis = 'phone' AND e.via_phone IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL unusable-phone: % phone merges, expected 0', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_emails e
     WHERE e.identity_id = ANY(v_ids) AND ((e.basis = 'phone') <> (e.via_phone IS NOT NULL));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL unusable-phone: basis phone and via_phone disagree on % row(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.identity_phones p WHERE p.identity_id = ANY(v_ids);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL unusable-phone: % identity_phones rows, expected 1', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', f.phone, 'source', f.source) ORDER BY f.phone), '[]'::jsonb)
      INTO v_j FROM public.phone_flags f WHERE f.shared AND f.phone = ANY(ARRAY['+420777902301']::text[]);
    IF v_j IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'FAIL unusable-phone: shared phones %, expected []', v_j;
    END IF;
    v_asserts := v_asserts + 16;
  END;

  -- ── Through the public booking resolver (069 callers pass the phone to the 072 core) ──
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-05-1', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', '82-05', 'smoke+82-05-booking-1@rideprestigo.com', '+420 777 999 001'
  ) RETURNING id INTO v_b1;
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-05-2', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', '82-05', 'smoke+82-05-booking-2@rideprestigo.com', '+420777999001'
  ) RETURNING id INTO v_b2;
  SELECT * INTO r FROM public.identity_resolve_booking(v_b1);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS NULL THEN
    RAISE EXCEPTION 'FAIL booking path: first booking outcome %', r.outcome;
  END IF;
  v_ids := ARRAY[r.identity_id];
  SELECT * INTO r FROM public.identity_resolve_booking(v_b2);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS DISTINCT FROM v_ids[1] THEN
    RAISE EXCEPTION 'FAIL booking path: second booking (new email, same phone) did not join the first person';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.identity_emails e
     WHERE e.email = 'smoke+82-05-booking-2@rideprestigo.com' AND e.identity_id = v_ids[1]
       AND e.basis = 'phone' AND e.via_phone = '+420777999001'
  ) THEN
    RAISE EXCEPTION 'FAIL booking path: merged email is not marked basis phone / via_phone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = '+420777999001' AND f.shared AND f.source = 'auto') THEN
    RAISE EXCEPTION 'FAIL booking path: the merge did not flag the number shared (auto)';
  END IF;
  v_asserts := v_asserts + 4;

  -- ── Privileges: nobody but service_role ────────────────────────────────
  IF has_function_privilege('anon', 'public.identity_normalize_phone(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_normalize_phone(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_resolve_core(text, text, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_resolve_core(text, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL privileges: anon/authenticated can execute a 072 function';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.identity_normalize_phone(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL privileges: service_role cannot execute identity_normalize_phone';
  END IF;
  v_asserts := v_asserts + 2;

  -- Everything above is rolled back by this exception.
  RAISE EXCEPTION 'SMOKE_OK_82_05' USING DETAIL = format('%s assertions', v_asserts);
END
$smoke$;
