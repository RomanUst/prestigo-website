-- 078_chat_registry.sql
-- Phase 83 (plan 83-03): chat registry for the inbound Chatwoot / EspoCRM webhooks.
--
-- Person key (D-02): a person is `i:<contact_identities.id>` when an identity exists, else
-- `c:<chatwoot contact id>` (a Telegram / phone-only visitor with no email yet). At most ONE open
-- chat Lead exists per person. That is a database guarantee, not handler discipline: Phase 85 counts
-- chat conversions on it, so it is a partial unique index (chat_leads_one_open) plus a per-person
-- advisory lock in chat_lead_reserve that serialises concurrent conversations of one person.
-- A closed chat Lead (converted, dead, closed_in_crm) frees the slot; the next reserve inserts a row.
--
-- D-12: chat_lead_link_identity moves a `c:` lead to `i:<identity>` once an email appears.
-- D-05 (phone half): a phone number is stored on a lead ONLY while it has no identity (phone-only
-- lead), so chat_open_leads_for_person can find it by phone; it is cleared when the identity links.
-- D-11: chat_conversations records, per conversation, the outcome and the CRM ids so a later
-- message can be appended to the right Lead / Contact history.
-- D-16: chat_erasure_scope / chat_erase cover chat data in the erasure saga.
--
-- The registry holds ids, outcome codes and (phone-only leads) an E.164 number; never a name, an
-- email or message content. No function here writes the booking, profile or auth tables (D-17).
-- The gate key chat_hooks_start in integration_config is shared with webhook_ingest (076): the
-- handlers ignore events older than the go-live instant (forward-only).
--
-- All tables are deny-all RLS; the service role reaches them only through the SECURITY DEFINER
-- functions below. DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE, so every
-- function has its own REVOKE ... FROM PUBLIC, anon, authenticated and a GRANT to service_role.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_leads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_ref             text        NOT NULL UNIQUE
                                   CHECK (lead_ref ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  person_key           text        NOT NULL
                                   CHECK (person_key ~ '^(i:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c:[1-9][0-9]{0,17})$'),
  identity_id          uuid        REFERENCES public.contact_identities(id) ON DELETE CASCADE,
  chatwoot_contact_id  bigint      CHECK (chatwoot_contact_id IS NULL OR chatwoot_contact_id > 0),
  phone                text        CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  espo_lead_id         text        CHECK (espo_lead_id IS NULL OR espo_lead_id ~ '^[0-9a-f]{17}$'),
  espo_contact_id      text        CHECK (espo_contact_id IS NULL OR espo_contact_id ~ '^[0-9a-f]{17}$'),
  open                 boolean     NOT NULL DEFAULT true,
  closed_reason        text        CHECK (closed_reason IS NULL OR closed_reason IN ('converted', 'dead', 'closed_in_crm')),
  converted_booking_id uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_leads_one_open
  ON public.chat_leads (person_key) WHERE open;
CREATE INDEX IF NOT EXISTS chat_leads_identity_idx
  ON public.chat_leads (identity_id);
CREATE INDEX IF NOT EXISTS chat_leads_chatwoot_contact_idx
  ON public.chat_leads (chatwoot_contact_id);
CREATE INDEX IF NOT EXISTS chat_leads_phone_idx
  ON public.chat_leads (phone);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  conversation_id     bigint      PRIMARY KEY CHECK (conversation_id > 0),
  chatwoot_contact_id bigint      CHECK (chatwoot_contact_id IS NULL OR chatwoot_contact_id > 0),
  identity_id         uuid        REFERENCES public.contact_identities(id) ON DELETE CASCADE,
  chat_lead_id        uuid        REFERENCES public.chat_leads(id) ON DELETE SET NULL,
  espo_lead_id        text        CHECK (espo_lead_id IS NULL OR espo_lead_id ~ '^[0-9a-f]{17}$'),
  espo_contact_id     text        CHECK (espo_contact_id IS NULL OR espo_contact_id ~ '^[0-9a-f]{17}$'),
  outcome             text        NOT NULL
                                  CHECK (outcome IN ('lead_created', 'lead_appended', 'lead_adopted', 'customer',
                                                     'known_contact', 'filtered', 'no_lead_label')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_identity_idx
  ON public.chat_conversations (identity_id);
CREATE INDEX IF NOT EXISTS chat_conversations_chatwoot_contact_idx
  ON public.chat_conversations (chatwoot_contact_id);
CREATE INDEX IF NOT EXISTS chat_conversations_chat_lead_idx
  ON public.chat_conversations (chat_lead_id);

-- ── RLS: deny-all, service role bypasses (064 shape) ────────────────────────
REVOKE ALL ON public.chat_leads FROM anon, authenticated;
REVOKE ALL ON public.chat_conversations FROM anon, authenticated;

ALTER TABLE public.chat_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_leads_no_public_read ON public.chat_leads;
CREATE POLICY chat_leads_no_public_read
  ON public.chat_leads FOR SELECT
  USING (false);

DROP POLICY IF EXISTS chat_leads_no_public_insert ON public.chat_leads;
CREATE POLICY chat_leads_no_public_insert
  ON public.chat_leads FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS chat_conversations_no_public_read ON public.chat_conversations;
CREATE POLICY chat_conversations_no_public_read
  ON public.chat_conversations FOR SELECT
  USING (false);

DROP POLICY IF EXISTS chat_conversations_no_public_insert ON public.chat_conversations;
CREATE POLICY chat_conversations_no_public_insert
  ON public.chat_conversations FOR INSERT
  WITH CHECK (false);

-- ── chat_hooks_start: go-live instant (forward-only gate) ───────────────────
-- NULL when the key is absent or its value is not a timestamp (handlers then do nothing).
CREATE OR REPLACE FUNCTION public.chat_hooks_start()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT c.value FROM public.integration_config c WHERE c.key = 'chat_hooks_start'
  )::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ── chat_lead_reserve: the one open chat Lead of a person, race-free ────────
CREATE OR REPLACE FUNCTION public.chat_lead_reserve(
  p_person_key          text,
  p_identity_id         uuid,
  p_chatwoot_contact_id bigint,
  p_phone               text,
  p_lead_ref            text
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
    (lead_ref, person_key, identity_id, chatwoot_contact_id, phone)
  VALUES
    (p_lead_ref, p_person_key, p_identity_id, p_chatwoot_contact_id, p_phone)
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.lead_ref, v_row.espo_lead_id, v_row.espo_contact_id, true;
END;
$$;

-- ── chat_lead_set_espo: remember the EspoCRM ids (NULL keeps the stored value)
CREATE OR REPLACE FUNCTION public.chat_lead_set_espo(
  p_chat_lead_id    uuid,
  p_espo_lead_id    text,
  p_espo_contact_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chat_leads l
     SET espo_lead_id    = COALESCE(p_espo_lead_id, l.espo_lead_id),
         espo_contact_id = COALESCE(p_espo_contact_id, l.espo_contact_id)
   WHERE l.id = p_chat_lead_id;
  RETURN FOUND;
END;
$$;

-- ── chat_lead_close: frees the person's slot (only while open) ──────────────
CREATE OR REPLACE FUNCTION public.chat_lead_close(
  p_chat_lead_id uuid,
  p_reason       text,
  p_booking_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chat_leads l
     SET open                 = false,
         closed_reason        = p_reason,
         closed_at            = now(),
         converted_booking_id = p_booking_id
   WHERE l.id = p_chat_lead_id AND l.open;
  RETURN FOUND;
END;
$$;

-- ── chat_lead_link_identity: a `c:` lead joins the identity (D-12) ──────────
-- Returns how many chat_leads rows moved to `i:<identity>` (0 in the both-open case, where the
-- `c:` lead keeps its key and only gains the identity id).
CREATE OR REPLACE FUNCTION public.chat_lead_link_identity(
  p_chatwoot_contact_id bigint,
  p_identity_id         uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c_key   text := 'c:' || p_chatwoot_contact_id::text;
  v_i_key   text := 'i:' || p_identity_id::text;
  v_first   text;
  v_second  text;
  v_lead_id uuid;
  v_moved   integer := 0;
BEGIN
  -- Lock both person keys, lower key first, so two links cannot deadlock.
  v_first  := LEAST(v_c_key, v_i_key);
  v_second := GREATEST(v_c_key, v_i_key);
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_lead:' || v_first, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_lead:' || v_second, 0));

  SELECT l.id INTO v_lead_id
    FROM public.chat_leads l
   WHERE l.person_key = v_c_key AND l.open;

  IF v_lead_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_leads l WHERE l.person_key = v_i_key AND l.open
    ) THEN
      UPDATE public.chat_leads l
         SET person_key  = v_i_key,
             identity_id = p_identity_id,
             phone       = NULL
       WHERE l.id = v_lead_id;
      v_moved := 1;
    ELSE
      UPDATE public.chat_leads l
         SET identity_id = p_identity_id
       WHERE l.id = v_lead_id;
    END IF;
  END IF;

  UPDATE public.chat_conversations c
     SET identity_id = p_identity_id,
         updated_at  = now()
   WHERE c.chatwoot_contact_id = p_chatwoot_contact_id
     AND c.identity_id IS NULL;

  RETURN v_moved;
END;
$$;

-- ── chat_conversation_record: upsert the per-conversation outcome ───────────
CREATE OR REPLACE FUNCTION public.chat_conversation_record(
  p_conversation_id     bigint,
  p_chatwoot_contact_id bigint,
  p_identity_id         uuid,
  p_chat_lead_id        uuid,
  p_espo_lead_id        text,
  p_espo_contact_id     text,
  p_outcome             text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.chat_conversations AS c
    (conversation_id, chatwoot_contact_id, identity_id, chat_lead_id, espo_lead_id, espo_contact_id, outcome)
  VALUES
    (p_conversation_id, p_chatwoot_contact_id, p_identity_id, p_chat_lead_id, p_espo_lead_id,
     p_espo_contact_id, p_outcome)
  ON CONFLICT (conversation_id) DO UPDATE
    SET chatwoot_contact_id = COALESCE(EXCLUDED.chatwoot_contact_id, c.chatwoot_contact_id),
        identity_id         = COALESCE(EXCLUDED.identity_id, c.identity_id),
        chat_lead_id        = COALESCE(EXCLUDED.chat_lead_id, c.chat_lead_id),
        espo_lead_id        = COALESCE(EXCLUDED.espo_lead_id, c.espo_lead_id),
        espo_contact_id     = COALESCE(EXCLUDED.espo_contact_id, c.espo_contact_id),
        outcome             = EXCLUDED.outcome,
        updated_at          = now();
  RETURN true;
END;
$$;

-- ── chat_conversation: what happened to one conversation (NULL when unknown)
CREATE OR REPLACE FUNCTION public.chat_conversation(p_conversation_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv     public.chat_conversations%ROWTYPE;
  v_lead     public.chat_leads%ROWTYPE;
  v_ident    public.contact_identities%ROWTYPE;
  v_lead_j   jsonb := NULL;
  v_ident_j  jsonb := NULL;
  v_customer boolean;
BEGIN
  SELECT c.* INTO v_conv
    FROM public.chat_conversations c
   WHERE c.conversation_id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_conv.chat_lead_id IS NOT NULL THEN
    SELECT l.* INTO v_lead FROM public.chat_leads l WHERE l.id = v_conv.chat_lead_id;
    IF FOUND THEN
      v_lead_j := jsonb_build_object(
        'id', v_lead.id,
        'lead_ref', v_lead.lead_ref,
        'espo_lead_id', v_lead.espo_lead_id,
        'espo_contact_id', v_lead.espo_contact_id,
        'open', v_lead.open
      );
    END IF;
  END IF;

  IF v_conv.identity_id IS NOT NULL THEN
    SELECT i.* INTO v_ident FROM public.contact_identities i WHERE i.id = v_conv.identity_id;
    IF FOUND THEN
      v_customer := v_ident.user_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.booking_identity b WHERE b.identity_id = v_ident.id);
      v_ident_j := jsonb_build_object(
        'id', v_ident.id,
        'customer', v_customer,
        'erasing', v_ident.erasing_at IS NOT NULL,
        'espo_contact_id', v_ident.espo_contact_id,
        'chatwoot_contact_id', v_ident.chatwoot_contact_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', v_conv.conversation_id,
    'outcome', v_conv.outcome,
    'chatwoot_contact_id', v_conv.chatwoot_contact_id,
    'identity_id', v_conv.identity_id,
    'espo_lead_id', v_conv.espo_lead_id,
    'espo_contact_id', v_conv.espo_contact_id,
    'chat_lead', v_lead_j,
    'identity', v_ident_j
  );
END;
$$;

-- ── chat_open_leads_for_person: D-05 (identity, or phone for phone-only leads)
CREATE OR REPLACE FUNCTION public.chat_open_leads_for_person(
  p_identity_id uuid,
  p_phones      text[]
)
RETURNS TABLE (
  chat_lead_id uuid,
  lead_ref     text,
  espo_lead_id text,
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT l.id, l.lead_ref, l.espo_lead_id, l.created_at
    FROM public.chat_leads l
   WHERE l.open
     AND (
       l.identity_id = p_identity_id
       OR (l.identity_id IS NULL AND l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[])))
     )
   ORDER BY l.created_at, l.id;
END;
$$;

-- ── chat_erasure_scope: every chat Lead / Contact id of a person (D-16) ─────
-- A person is an identity, a set of Chatwoot contact ids and a set of phones; any NULL or empty
-- part matches nothing, so an empty request never selects the whole registry.
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
  SELECT l.lead_ref, l.espo_lead_id, l.espo_contact_id
    FROM public.chat_leads l
   WHERE l.identity_id = p_identity_id
      OR l.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
      OR l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]))
  UNION
  SELECT l.lead_ref, c.espo_lead_id, c.espo_contact_id
    FROM public.chat_conversations c
    LEFT JOIN public.chat_leads l ON l.id = c.chat_lead_id
   WHERE (c.espo_lead_id IS NOT NULL OR c.espo_contact_id IS NOT NULL)
     AND (
       c.identity_id = p_identity_id
       OR c.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
       OR c.chat_lead_id IN (
         SELECT x.id FROM public.chat_leads x
          WHERE x.identity_id = p_identity_id
             OR x.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
             OR x.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]))
       )
     );
END;
$$;

-- ── chat_erase: delete the registry rows of the same scope ──────────────────
-- Conversations first (they point at leads), then leads. Returns the deleted row count.
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
  v_conv_rows integer;
  v_lead_rows integer;
BEGIN
  DELETE FROM public.chat_conversations c
   WHERE c.identity_id = p_identity_id
      OR c.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
      OR c.chat_lead_id IN (
        SELECT x.id FROM public.chat_leads x
         WHERE x.identity_id = p_identity_id
            OR x.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
            OR x.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]))
      );
  GET DIAGNOSTICS v_conv_rows = ROW_COUNT;

  DELETE FROM public.chat_leads l
   WHERE l.identity_id = p_identity_id
      OR l.chatwoot_contact_id = ANY (COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[]))
      OR l.phone = ANY (COALESCE(p_phones, ARRAY[]::text[]));
  GET DIAGNOSTICS v_lead_rows = ROW_COUNT;

  RETURN v_conv_rows + v_lead_rows;
END;
$$;

-- ── Grants: service role only (per function; DROP+CREATE re-grants PUBLIC) ──
REVOKE EXECUTE ON FUNCTION public.chat_hooks_start() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_lead_set_espo(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_lead_close(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_lead_link_identity(bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_conversation_record(bigint, bigint, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_conversation(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_open_leads_for_person(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_erasure_scope(uuid, bigint[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_erase(uuid, bigint[], text[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_hooks_start() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_lead_set_espo(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_lead_close(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_lead_link_identity(bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_conversation_record(bigint, bigint, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_conversation(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_open_leads_for_person(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_erasure_scope(uuid, bigint[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_erase(uuid, bigint[], text[]) TO service_role;
