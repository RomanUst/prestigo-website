-- 074: one-time CRM / chat backfill (Phase 82, plan 82-09, SYNC-04)
--
-- The backfill has NO mapping code of its own. It replays history through the same
-- path the live sync uses:
--
--   crm_backfill_identity_pass()   resolves every past booking (oldest first) and every
--                                  customer profile through identity_resolve_booking /
--                                  identity_resolve_user (069/072), in ONE transaction.
--                                  Order is (created_at, id), so "first seen wins" for
--                                  phone merges is deterministic. Returns counts only.
--   crm_identity_report()          counts only (no names, emails or phones) so the owner
--                                  can review merges before anything reaches the CRM.
--   crm_backfill_enqueue(tag, s)   enqueues 'sync.booking:<id>:<tag>' for every
--                                  non-abandoned booking and 'sync.signup:<userId>:<tag>'
--                                  for every profile, available now() + n * stagger in
--                                  chronological order, and kicks each key through
--                                  outbox_kick. The live handlers (82-07, 82-10) do every
--                                  CRM and Chatwoot write.
--
-- Run order (plans 82-14 / 82-15):
--   1. owner marks desk numbers as shared (identity_mark_shared)
--   2. crm_backfill_identity_pass()
--   3. crm_identity_report() reviewed by the owner; wrong merges are split
--   4. integration_config key crm_sync_start is set (live capture on)
--   5. crm_backfill_enqueue('bf', 5)
-- A re-run uses a new tag ('bf2', 'bf3', ...): earlier rows stay untouched and the
-- convergent handlers make the repeat a no-op. Bookings written after step 4 are
-- covered by both the live trigger (bucket tag) and the backfill (bf tag).
--
-- QStash budget: about 4 messages per booking (RESEARCH A10), free plan ~1000/day.
--
-- Functions only: nothing runs until the go-live plans call them.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the REVOKE
-- lines at the bottom must always be re-run.

-- ── Identity pass ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_backfill_identity_pass()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  b                 record;
  p                 record;
  v_outcome         text;
  v_bookings_seen   integer := 0;
  v_bookings_linked integer := 0;
  v_no_identity     integer := 0;
  v_erasing         integer := 0;
  v_abandoned       integer := 0;
  v_profiles_seen   integer := 0;
  v_profiles_linked integer := 0;
BEGIN
  -- Oldest first: the first booking that carries a phone decides the merge.
  FOR b IN
    SELECT bk.id, bk.status, bk.booking_source, bk.payment_link_id
      FROM public.bookings bk
     ORDER BY bk.created_at, bk.id
  LOOP
    v_bookings_seen := v_bookings_seen + 1;

    IF public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id) THEN
      v_abandoned := v_abandoned + 1;
      CONTINUE;
    END IF;

    SELECT r.outcome INTO v_outcome FROM public.identity_resolve_booking(b.id) r;

    IF v_outcome = 'resolved' THEN
      v_bookings_linked := v_bookings_linked + 1;
    ELSIF v_outcome = 'erasing' THEN
      v_erasing := v_erasing + 1;
    ELSE
      v_no_identity := v_no_identity + 1;
    END IF;
  END LOOP;

  FOR p IN
    SELECT cp.user_id
      FROM public.customer_profiles cp
     ORDER BY cp.created_at, cp.user_id
  LOOP
    v_profiles_seen := v_profiles_seen + 1;

    SELECT r.outcome INTO v_outcome FROM public.identity_resolve_user(p.user_id) r;

    IF v_outcome = 'resolved' THEN
      v_profiles_linked := v_profiles_linked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'bookings_seen',        v_bookings_seen,
    'bookings_linked',      v_bookings_linked,
    'bookings_no_identity', v_no_identity,
    'bookings_erasing',     v_erasing,
    'abandoned_skipped',    v_abandoned,
    'profiles_seen',        v_profiles_seen,
    'profiles_linked',      v_profiles_linked
  );
END;
$$;

-- ── Counts-only review report ───────────────────────────────────────────────
-- Output keys are counts; there is no name, email or phone anywhere in the result.
CREATE OR REPLACE FUNCTION public.crm_identity_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'identities',
      (SELECT count(*) FROM public.contact_identities),
    'identities_with_user',
      (SELECT count(*) FROM public.contact_identities c WHERE c.user_id IS NOT NULL),
    'emails_by_basis', jsonb_build_object(
      'email',  (SELECT count(*) FROM public.identity_emails e WHERE e.basis = 'email'),
      'phone',  (SELECT count(*) FROM public.identity_emails e WHERE e.basis = 'phone'),
      'signup', (SELECT count(*) FROM public.identity_emails e WHERE e.basis = 'signup'),
      'split',  (SELECT count(*) FROM public.identity_emails e WHERE e.basis = 'split')
    ),
    'phone_merges',
      (SELECT count(*) FROM public.identity_emails e WHERE e.basis = 'phone'),
    'shared_phones', jsonb_build_object(
      'auto',   (SELECT count(*) FROM public.phone_flags f WHERE f.shared AND f.source = 'auto'),
      'manual', (SELECT count(*) FROM public.phone_flags f WHERE f.shared AND f.source = 'manual'),
      'split',  (SELECT count(*) FROM public.phone_flags f WHERE f.shared AND f.source = 'split')
    ),
    'bookings_total',
      (SELECT count(*) FROM public.bookings),
    'bookings_abandoned',
      (SELECT count(*) FROM public.bookings b
        WHERE public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)),
    'bookings_linked',
      (SELECT count(*) FROM public.bookings b
         JOIN public.booking_identity bi ON bi.booking_id = b.id
        WHERE NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)),
    'bookings_no_identity',
      (SELECT count(*) FROM public.bookings b
        WHERE NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
          AND NOT EXISTS (SELECT 1 FROM public.booking_identity bi WHERE bi.booking_id = b.id)),
    'bookings_placeholder_email',
      (SELECT count(*) FROM public.bookings b WHERE lower(btrim(b.client_email)) LIKE '%@gnet.local'),
    'bookings_unparseable_phone',
      (SELECT count(*) FROM public.bookings b
        WHERE btrim(b.client_phone) <> ''
          AND public.identity_normalize_phone(b.client_phone) IS NULL),
    'profiles',
      (SELECT count(*) FROM public.customer_profiles),
    'profiles_linked',
      (SELECT count(*) FROM public.customer_profiles cp
        WHERE EXISTS (SELECT 1 FROM public.contact_identities c WHERE c.user_id = cp.user_id))
  );
$$;

-- ── Staggered enqueue through the live sync keys ────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_backfill_enqueue(p_tag text, p_stagger_seconds integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  b         record;
  p         record;
  v_key     text;
  v_stagger integer;
  v_n       integer := 0;
BEGIN
  IF p_tag IS NULL OR p_tag !~ '^bf[0-9]{0,3}$' THEN
    RAISE EXCEPTION 'invalid_tag';
  END IF;

  v_stagger := least(greatest(COALESCE(p_stagger_seconds, 5), 1), 60);

  FOR b IN
    SELECT bk.id
      FROM public.bookings bk
     WHERE NOT public.identity_is_abandoned(bk.status, bk.booking_source, bk.payment_link_id)
     ORDER BY bk.created_at, bk.id
  LOOP
    v_key := 'sync.booking:' || b.id::text || ':' || p_tag;
    IF public.outbox_enqueue(
         'sync.booking', 'booking', b.id, v_key,
         now() + make_interval(secs => v_n * v_stagger)
       ) THEN
      v_n := v_n + 1;
      -- The kick must never undo the enqueue above.
      BEGIN
        PERFORM public.outbox_kick(v_key);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'crm_backfill_enqueue kick failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  FOR p IN
    SELECT cp.user_id
      FROM public.customer_profiles cp
     ORDER BY cp.created_at, cp.user_id
  LOOP
    v_key := 'sync.signup:' || p.user_id::text || ':' || p_tag;
    IF public.outbox_enqueue(
         'sync.signup', 'user', p.user_id, v_key,
         now() + make_interval(secs => v_n * v_stagger)
       ) THEN
      v_n := v_n + 1;
      BEGIN
        PERFORM public.outbox_kick(v_key);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'crm_backfill_enqueue kick failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it.
REVOKE EXECUTE ON FUNCTION public.crm_backfill_identity_pass() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_identity_report() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_backfill_enqueue(text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crm_backfill_identity_pass() TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_identity_report() TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_backfill_enqueue(text, integer) TO service_role;
