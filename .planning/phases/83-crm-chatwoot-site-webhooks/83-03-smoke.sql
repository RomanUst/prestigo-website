-- 83-03 rolled-back smoke for migration 078 (chat registry). Run via execute_sql AFTER apply_migration.
-- Everything happens inside one DO block that ends in RAISE EXCEPTION, so nothing persists.
-- Success = error message exactly SMOKE_OK_83_03. Any other message names the failed step (a1..h4).
DO $smoke$
DECLARE
  v_i  uuid;
  v_l1 uuid;
  v_l2 uuid;
  v_l3 uuid;
  v_r  record;
  v_j  jsonb;
  v_n  integer;
  v_ref1 text := 'chat:' || gen_random_uuid()::text;
  v_ref2 text := 'chat:' || gen_random_uuid()::text;
  v_ref3 text := 'chat:' || gen_random_uuid()::text;
  v_ref4 text := 'chat:' || gen_random_uuid()::text;
  v_bad boolean := false;
BEGIN
  -- (a) go-live gate
  DELETE FROM public.integration_config WHERE key = 'chat_hooks_start';
  ASSERT public.chat_hooks_start() IS NULL, 'a1 gate absent';
  INSERT INTO public.integration_config (key, value) VALUES ('chat_hooks_start', 'not-a-date');
  ASSERT public.chat_hooks_start() IS NULL, 'a2 gate unparseable';
  UPDATE public.integration_config SET value = now()::text WHERE key = 'chat_hooks_start';
  ASSERT public.chat_hooks_start() IS NOT NULL, 'a3 gate set';

  -- (b) one open lead per person
  INSERT INTO public.contact_identities (id) VALUES (gen_random_uuid()) RETURNING id INTO v_i;
  SELECT * INTO v_r FROM public.chat_lead_reserve('i:' || v_i::text, v_i, NULL, NULL, v_ref1);
  v_l1 := v_r.chat_lead_id;
  ASSERT v_l1 IS NOT NULL AND v_r.own, 'b1 first reserve own';
  SELECT * INTO v_r FROM public.chat_lead_reserve('i:' || v_i::text, v_i, NULL, NULL, v_ref2);
  ASSERT v_r.chat_lead_id = v_l1 AND NOT v_r.own, 'b2 second conversation gets the first lead, own=false';
  SELECT * INTO v_r FROM public.chat_lead_reserve('i:' || v_i::text, v_i, NULL, NULL, v_ref1);
  ASSERT v_r.chat_lead_id = v_l1 AND v_r.own, 'b3 retry of the same conversation is own';
  SELECT count(*) INTO v_n FROM public.chat_leads WHERE person_key = 'i:' || v_i::text;
  ASSERT v_n = 1, 'b4 exactly one row';

  -- (c) espo ids, conversation record and read-back
  ASSERT public.chat_lead_set_espo(v_l1, 'ccccccccccccccccc', NULL), 'c1 set_espo';
  ASSERT public.chat_conversation_record(9000301, 9000083, v_i, v_l1, 'ccccccccccccccccc', NULL, 'lead_created'), 'c2 record';
  v_j := public.chat_conversation(9000301);
  ASSERT (v_j -> 'chat_lead' ->> 'open')::boolean, 'c3 chat_lead.open';
  ASSERT NOT (v_j -> 'identity' ->> 'customer')::boolean, 'c4 identity.customer false';
  ASSERT public.chat_conversation(9000399) IS NULL, 'c5 unknown conversation is NULL';

  -- (d) close frees the slot
  ASSERT public.chat_lead_close(v_l1, 'dead', NULL), 'd1 close';
  ASSERT NOT public.chat_lead_close(v_l1, 'dead', NULL), 'd2 second close is false';
  SELECT * INTO v_r FROM public.chat_lead_reserve('i:' || v_i::text, v_i, NULL, NULL, v_ref3);
  v_l2 := v_r.chat_lead_id;
  ASSERT v_l2 <> v_l1 AND v_r.own, 'd3 next reserve inserts a new row';

  -- (e) phone-only lead, D-05 lookup, identity link while the identity already has an open lead
  SELECT * INTO v_r FROM public.chat_lead_reserve('c:9000084', NULL, 9000084, '+420700000086', v_ref4);
  v_l3 := v_r.chat_lead_id;
  ASSERT v_l3 IS NOT NULL AND v_r.own, 'e1 phone-only lead';
  SELECT count(*) INTO v_n FROM public.chat_open_leads_for_person(NULL, ARRAY['+420700000086']) o WHERE o.chat_lead_id = v_l3;
  ASSERT v_n = 1, 'e2 found by phone';
  ASSERT public.chat_lead_link_identity(9000084, v_i) = 0, 'e3 both open: no key moved';
  ASSERT (SELECT identity_id FROM public.chat_leads WHERE id = v_l3) = v_i, 'e4 c: lead gained the identity';
  ASSERT (SELECT person_key FROM public.chat_leads WHERE id = v_l3) = 'c:9000084', 'e5 c: lead kept its key';
  -- once the identity's lead closes, a fresh link moves nothing (the c: lead is already linked) but must not fail
  ASSERT public.chat_lead_close(v_l2, 'converted', NULL), 'e6 close l2';
  ASSERT public.chat_lead_link_identity(9000084, v_i) = 1, 'e7 identity free: c: lead moves to i:';
  ASSERT (SELECT person_key FROM public.chat_leads WHERE id = v_l3) = 'i:' || v_i::text, 'e8 moved key';
  ASSERT (SELECT phone FROM public.chat_leads WHERE id = v_l3) IS NULL, 'e9 phone cleared';

  -- (f) erasure scope and erase
  SELECT count(*) INTO v_n FROM public.chat_erasure_scope(v_i, ARRAY[9000084]::bigint[], ARRAY[]::text[]);
  ASSERT v_n >= 2, 'f1 scope rows';
  ASSERT public.chat_erase(v_i, ARRAY[9000084]::bigint[], ARRAY[]::text[]) > 0, 'f2 erase count';
  SELECT count(*) INTO v_n FROM public.chat_leads WHERE identity_id = v_i;
  ASSERT v_n = 0, 'f3 no lead of the identity remains';
  ASSERT public.chat_conversation(9000301) IS NULL, 'f4 conversation erased';
  ASSERT public.chat_erase(NULL, ARRAY[]::bigint[], ARRAY[]::text[]) = 0, 'f5 empty scope deletes nothing';

  -- (g) outcome vocabulary is enforced
  BEGIN
    INSERT INTO public.chat_conversations (conversation_id, outcome) VALUES (9000302, 'bogus');
  EXCEPTION WHEN check_violation THEN
    v_bad := true;
  END;
  ASSERT v_bad, 'g1 bogus outcome accepted';

  -- (h) no anon access
  ASSERT NOT has_function_privilege('anon', 'public.chat_lead_reserve(text,uuid,bigint,text,text)', 'EXECUTE'), 'h1 reserve anon';
  ASSERT NOT has_function_privilege('anon', 'public.chat_erase(uuid,bigint[],text[])', 'EXECUTE'), 'h2 erase anon';
  ASSERT NOT has_function_privilege('anon', 'public.chat_conversation(bigint)', 'EXECUTE'), 'h3 conversation anon';
  ASSERT NOT has_table_privilege('anon', 'public.chat_leads', 'SELECT'), 'h4 chat_leads anon select';

  RAISE EXCEPTION 'SMOKE_OK_83_03';
END
$smoke$;
