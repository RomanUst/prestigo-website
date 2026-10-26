-- 079: Phase 83 code-review fixes (83-REVIEW.md CR-01, CR-02, CR-03).
--
-- CR-01 (identity takeover by phone). identity_resolve_chat passed the chat phone into
-- identity_resolve_core, whose rule 4 ("new email + un-shared phone owned by exactly one identity")
-- joins the new email to that identity. A chat visitor or an operator who types someone else's
-- phone next to their own email would then be filed under that person (even a customer with an
-- account). The chat path now resolves by EMAIL ONLY, and stores the phone afterwards through
-- identity_attach_chat_contact, which attaches a phone only when no other live identity owns it and
-- it is not shared, and never merges, never flags. The booking path (rule 4 for real bookings) is
-- unchanged.
--
-- CR-02 (repeated EspoCRM edits dropped). EspoCRM deliveries carry no id, so the receiver passes a
-- content hash; with a 30-day dedup an edit A->B, B->A, A->B inside 30 days lost the third edit. The
-- handler re-reads both systems on every run, so a long window buys nothing: a delivery id is now a
-- duplicate only if the same hash was received within the last hour (EspoCRM's retry horizon). An
-- older row is refreshed and the delivery counts as new.
--
-- CR-03 (erasure scope too wide). chat_erasure_scope / chat_erase matched registry rows by
-- Chatwoot contact id or phone regardless of the identity they belong to, so erasing one person
-- could delete another person's chat Lead / Contact ids when both shared a Chatwoot contact id or a
-- phone. Contact-id and phone matches now apply only to rows that have NO identity; rows with an
-- identity are erased only through that identity.
--
-- Every redefined function keeps SECURITY DEFINER, SET search_path = '' and is re-REVOKEd from
-- PUBLIC, anon, authenticated and GRANTed to service_role only.

-- ── CR-01: chat resolve by email only; phone attached without merge ─────────
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

  -- Email only: a phone typed in a chat must never join this email to another person (rule 4).
  SELECT r.identity_id, r.outcome
    INTO v_id, v_outcome
    FROM public.identity_resolve_core(p_email_raw, NULL, 'chat', NULL) r;

  -- The phone is stored for this identity only when nobody else owns it and it is not shared.
  IF v_id IS NOT NULL AND v_outcome = 'resolved' AND p_phone_raw IS NOT NULL THEN
    PERFORM public.identity_attach_chat_contact(v_id, NULL, p_phone_raw);
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.identity_resolve_chat(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_resolve_chat(text, text) TO service_role;

-- ── CR-02: EspoCRM content-hash dedup only within one hour ──────────────────
CREATE OR REPLACE FUNCTION public.webhook_ingest_espo(
  p_delivery_id     text,
  p_espo_contact_id text,
  p_fuse_limit      integer,
  p_bucket_seconds  integer,
  p_tag_suffix      text
)
RETURNS TABLE(outcome text, idempotency_key text, available_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start   timestamptz;
  v_rows    integer;
  v_recent  integer;
  v_person  uuid;
  v_erasing timestamptz;
  v_bucket  bigint;
  v_key     text;
  v_avail   timestamptz;
BEGIN
  IF p_espo_contact_id IS NULL OR p_espo_contact_id !~ '^[0-9a-f]{17}$'
     OR p_tag_suffix IS NULL OR p_tag_suffix !~ '^m[1-7]$'
     OR p_bucket_seconds IS NULL OR p_bucket_seconds NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'webhook_ingest_espo_bad_input';
  END IF;

  BEGIN
    SELECT c.value::timestamptz INTO v_start
      FROM public.integration_config c WHERE c.key = 'chat_hooks_start';
  EXCEPTION WHEN OTHERS THEN
    v_start := NULL;
  END;
  IF v_start IS NULL THEN
    RETURN QUERY SELECT 'off'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- A content hash is a duplicate only inside EspoCRM's retry horizon (1 hour). An older row with
  -- the same hash is a genuine new edit (for example a value changed back and forth): refresh it.
  INSERT INTO public.webhook_deliveries AS d (source, delivery_id, entity_key)
  VALUES ('espocrm', p_delivery_id, 'espo:contact:' || p_espo_contact_id)
  ON CONFLICT (source, delivery_id) DO UPDATE
    SET received_at = now()
    WHERE d.received_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN QUERY SELECT 'duplicate'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT c.id, c.erasing_at INTO v_person, v_erasing
    FROM public.contact_identities c
   WHERE c.espo_contact_id = p_espo_contact_id
   ORDER BY c.created_at
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unlinked'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_erasing IS NOT NULL THEN
    RETURN QUERY SELECT 'erasing'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_fuse_limit IS NOT NULL THEN
    SELECT count(*) INTO v_recent
      FROM public.webhook_deliveries d
     WHERE d.source = 'espocrm'
       AND d.entity_key = 'espo:contact:' || p_espo_contact_id
       AND d.received_at > now() - interval '10 minutes';
    IF v_recent > p_fuse_limit THEN
      RETURN QUERY SELECT 'fused'::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  v_bucket := floor(extract(epoch FROM now()) / p_bucket_seconds)::bigint;
  v_key    := 'hook.espo_contact:' || v_person::text || ':b' || v_bucket::text || p_tag_suffix;
  v_avail  := to_timestamp((v_bucket + 1) * p_bucket_seconds);

  IF public.outbox_enqueue(
       'hook.espo_contact',
       'person',
       v_person,
       v_key,
       v_avail
     ) THEN
    RETURN QUERY SELECT 'queued'::text, v_key, v_avail;
  ELSE
    RETURN QUERY SELECT 'exists'::text, v_key, v_avail;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.webhook_ingest_espo(text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_ingest_espo(text, text, integer, integer, text) TO service_role;

-- ── CR-03: erasure matches contact id / phone only on rows without an identity ─
CREATE OR REPLACE FUNCTION public.chat_erasure_scope(
  p_identity_id         uuid,
  p_chatwoot_contact_ids bigint[],
  p_phones              text[]
)
RETURNS TABLE (
  lead_ref        text,
  espo_lead_id    text,
  espo_contact_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH leads AS (
    SELECT l.id, l.lead_ref, l.espo_lead_id, l.espo_contact_id
      FROM public.chat_leads l
     WHERE l.identity_id = p_identity_id
        OR (l.identity_id IS NULL
            AND (l.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
                 OR l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]))))
  )
  SELECT x.lead_ref, x.espo_lead_id, x.espo_contact_id FROM leads x
  UNION
  SELECT l.lead_ref, c.espo_lead_id, c.espo_contact_id
    FROM public.chat_conversations c
    LEFT JOIN public.chat_leads l ON l.id = c.chat_lead_id
   WHERE (c.espo_lead_id IS NOT NULL OR c.espo_contact_id IS NOT NULL)
     AND (
       c.identity_id = p_identity_id
       OR (c.identity_id IS NULL
           AND c.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[])))
       OR c.chat_lead_id IN (SELECT y.id FROM leads y)
     );
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_erase(
  p_identity_id         uuid,
  p_chatwoot_contact_ids bigint[],
  p_phones              text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_leads     uuid[];
  v_conv_rows integer;
  v_lead_rows integer;
BEGIN
  SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) INTO v_leads
    FROM public.chat_leads l
   WHERE l.identity_id = p_identity_id
      OR (l.identity_id IS NULL
          AND (l.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
               OR l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]))));

  DELETE FROM public.chat_conversations c
   WHERE c.identity_id = p_identity_id
      OR (c.identity_id IS NULL
          AND c.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[])))
      OR c.chat_lead_id = ANY (v_leads);
  GET DIAGNOSTICS v_conv_rows = ROW_COUNT;

  DELETE FROM public.chat_leads l WHERE l.id = ANY (v_leads);
  GET DIAGNOSTICS v_lead_rows = ROW_COUNT;

  RETURN v_conv_rows + v_lead_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chat_erasure_scope(uuid, bigint[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_erase(uuid, bigint[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_erasure_scope(uuid, bigint[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_erase(uuid, bigint[], text[]) TO service_role;
