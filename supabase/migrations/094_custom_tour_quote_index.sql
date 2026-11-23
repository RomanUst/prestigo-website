-- Migration 094: custom-tour quote index and request list
-- Phase 93 (PR 2 review fixes WR-01, WR-02) - follows 093, which is already live and is not edited.
--
-- Schema FILE only: the orchestrator applies it LIVE through the Supabase MCP. Nothing here is applied by the
-- application. The smoke block is .planning/phases/93-day-trips-custom-tours/93-PR2-094-smoke.sql.
--
-- What this file does:
--   1. quotes_source_inquiry_id_key  is re-created so a VOIDED quote no longer blocks its request (WR-01).
--      093 made the index unique over every quote with a source inquiry; a voided quote is terminal (nothing
--      un-voids it, no delete path exists), so after a void the request could never be quoted again.
--      The new definition is UNIQUE (source_inquiry_id) WHERE source_inquiry_id IS NOT NULL AND status <> 'voided':
--      at most one LIVE quote per request, any number of voided ones. The index keeps its name: the quote create
--      path tells "request already quoted" from a reference collision by that name in the 23505 message.
--   2. public.list_custom_tour_requests  the operator's list of custom-tour requests with the linked live quote,
--      filtered by derived status (all / open / quoted) and paged by keyset in SQL (WR-02). It replaces the
--      "read every quoted id and put it in the URL" filter, which broke at about 1000 quotes (PostgREST row cap)
--      and at a few hundred (URL length). SECURITY DEFINER, service_role only.
--
-- Quote status vocabulary (091 quotes_status_check, lib/quotes/vocabulary.ts): draft, sent, viewed, accepted,
-- paid, expired, voided. Only 'voided' is excluded here: an expired or cancelled quote is still the answer that
-- was given for the request.

-- == 1. one LIVE quote per request (WR-01) ============================================
DROP INDEX IF EXISTS public.quotes_source_inquiry_id_key;
CREATE UNIQUE INDEX quotes_source_inquiry_id_key
  ON public.quotes (source_inquiry_id)
  WHERE source_inquiry_id IS NOT NULL AND status <> 'voided';

-- == 2. the list of custom-tour requests with their live quote (WR-02) =================
-- p_status    'all' | 'open' (no live quote) | 'quoted' (has a live quote); anything else is an error.
-- p_cursor_*  keyset position of the last row of the previous page: rows strictly before (created_at, id) in the
--             newest-first order. Both or neither; one alone is ignored (first page).
-- p_limit     rows to return, clamped to 1..101 (the caller asks for page size + 1 to learn whether more exist).
-- A request has at most one live quote (the index above), so the LEFT JOIN never multiplies a row.
CREATE OR REPLACE FUNCTION public.list_custom_tour_requests(
  p_status            text,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id         uuid        DEFAULT NULL,
  p_limit             integer     DEFAULT 51
)
RETURNS TABLE (
  id               uuid,
  name             text,
  email            text,
  payload          jsonb,
  created_at       timestamptz,
  quote_id         uuid,
  quote_reference  text,
  quote_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 51), 1), 101);
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('all', 'open', 'quoted') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.name,
         i.email,
         i.payload,
         i.created_at,
         q.id,
         q.reference,
         q.created_at
    FROM public.inquiries i
    LEFT JOIN public.quotes q
           ON q.source_inquiry_id = i.id
          AND q.status <> 'voided'
   WHERE i.kind = 'custom_tour'
     AND (p_status = 'all'
          OR (p_status = 'quoted' AND q.id IS NOT NULL)
          OR (p_status = 'open'   AND q.id IS NULL))
     AND (p_cursor_created_at IS NULL
          OR p_cursor_id IS NULL
          OR (i.created_at, i.id) < (p_cursor_created_at, p_cursor_id))
   ORDER BY i.created_at DESC, i.id DESC
   LIMIT v_limit;
END;
$$;

-- A function created in a migration is callable by PUBLIC (and so by anon) until it is revoked: this one returns
-- names and emails, so it is service_role only.
REVOKE EXECUTE ON FUNCTION public.list_custom_tour_requests(text, timestamptz, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_custom_tour_requests(text, timestamptz, uuid, integer) TO service_role;
