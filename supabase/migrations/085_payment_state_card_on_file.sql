-- Migration 085: payment_state_card_on_file
-- Phase 88 — Card-on-file & Scheduled Holds (PAYF-01, D-01, D-04, D-05)
--
-- Adds the payment model next to the trip model: every booking row carries a payment_mode (how the
-- client pays) and a payment_state (where the money is), both separate from bookings.status.
--
--   * payment_mode  — pay_now | card_hold | cash_guarantee | quote | partner. Legacy rows read
--                     'pay_now' (the column default); GNet partner rows are backfilled to 'partner'.
--                     cash_guarantee (Phase 89) and quote (Phase 92) are reserved now so the CHECK
--                     does not churn; the hold engine acts on card_hold only.
--   * payment_state — none | checkout_pending | card_saved | placing_hold | authorized | capturing |
--                     captured | balance_due | failed | expired | released.
--
-- The state lists below must stay equal to PAYMENT_STATES / PAYMENT_MODES / LEDGER_KINDS in
-- lib/payments/state.ts (tests/payments-state.test.ts reads the latest CHECK and fails on drift).
-- lib/payments/state.ts is the only module that calls apply_payment_transition, append_payment_event
-- and claim_due_payment_work (D-05; tests/payment-state-writers-gate.test.ts).
--
-- 085 is purely additive for old code (new columns with defaults, new tables, new functions), so
-- applying it before the code merges is safe; the reverse order makes every payment write fail.
--
-- Schema FILE only — live application is the [BLOCKING] Task 3 of plan 88-01, run by the
-- orchestrator via Supabase MCP.

-- ── 1. bookings: payment columns (PAYF-01) ──────────────────────────────────────
-- Every trigger on public.bookings is UPDATE OF <named columns> and none of them names a payment
-- column, so writing these columns (and the backfill below) fires no gcal / CRM / lead / status-log
-- trigger.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_mode             text        NOT NULL DEFAULT 'pay_now',
  ADD COLUMN IF NOT EXISTS payment_state            text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_currency         text,
  ADD COLUMN IF NOT EXISTS payment_amount_minor     bigint,
  ADD COLUMN IF NOT EXISTS stripe_customer_id       text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS setup_intent_id          text,
  ADD COLUMN IF NOT EXISTS hold_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS hold_payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS hold_amount_minor        bigint,
  ADD COLUMN IF NOT EXISTS hold_placed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS capture_before           timestamptz,
  ADD COLUMN IF NOT EXISTS hold_attempts            smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_attempts          smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_lease_until      timestamptz,
  ADD COLUMN IF NOT EXISTS captured_amount_minor    bigint      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at              timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_at         timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_count      smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_error       text,
  ADD COLUMN IF NOT EXISTS recovery_link_id         text,
  ADD COLUMN IF NOT EXISTS recovery_link_url        text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_mode_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_mode_check
  CHECK (payment_mode IN (
    'pay_now',
    'card_hold',
    'cash_guarantee',
    'quote',
    'partner'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_state_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_state_check
  CHECK (payment_state IN (
    'none',
    'checkout_pending',
    'card_saved',
    'placing_hold',
    'authorized',
    'capturing',
    'captured',
    'balance_due',
    'failed',
    'expired',
    'released'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_currency_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_currency_check
  CHECK (payment_currency IS NULL OR payment_currency IN ('eur', 'czk'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_amount_minor_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_amount_minor_check
  CHECK (payment_amount_minor IS NULL OR payment_amount_minor > 0);

-- A Stripe error/decline CODE only (no message, no PII).
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_last_payment_error_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_last_payment_error_check
  CHECK (last_payment_error IS NULL OR char_length(last_payment_error) <= 60);

-- Backfill: partner (GNet) bookings are paid outside Prestigo (PAYF-01). Everything else keeps the
-- 'pay_now' default. assertMoneyEligible stays the runtime guard.
UPDATE public.bookings
   SET payment_mode = 'partner'
 WHERE booking_source = 'gnet'
   AND payment_mode = 'pay_now';

-- ── 2. booking_payment_events: the append-only money ledger (PAYF-01, D-05) ─────
-- One row per money event. Rows hold ids, amounts, currency, states, actor and a short error CODE,
-- never a name, email, phone or IP: the ledger is visible to every operator and is never erased
-- (bookings with money history are anonymised in place by 075_erasure, never deleted, hence
-- ON DELETE RESTRICT). UNIQUE (booking_id, event_key) is the exactly-once guard for webhook replays
-- and re-driven sweeps. Service role only: RLS deny-all, no table privileges for public keys.
CREATE TABLE IF NOT EXISTS public.booking_payment_events (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id       uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  event_key        text        NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 200),
  kind             text        NOT NULL,
  stripe_object_id text        CHECK (stripe_object_id IS NULL OR char_length(stripe_object_id) <= 100),
  amount_minor     bigint,
  currency         text        CHECK (currency IS NULL OR currency IN ('eur', 'czk')),
  from_state       text,
  to_state         text,
  actor_type       text        NOT NULL CHECK (actor_type IN ('system', 'webhook', 'admin')),
  actor_id         text        CHECK (actor_id IS NULL OR char_length(actor_id) <= 64),
  error_code       text        CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_payment_events_key_unique UNIQUE (booking_id, event_key)
);

-- The ledger kind list is its own named CHECK so it can be widened by a later migration and pinned
-- to LEDGER_KINDS in lib/payments/state.ts by the parity test.
ALTER TABLE public.booking_payment_events
  DROP CONSTRAINT IF EXISTS booking_payment_events_kind_check;
ALTER TABLE public.booking_payment_events
  ADD CONSTRAINT booking_payment_events_kind_check
  CHECK (kind IN (
    'setup_started',
    'setup_succeeded',
    'setup_failed',
    'hold_scheduled',
    'hold_started',
    'hold_authorized',
    'hold_failed',
    'hold_released',
    'hold_expired',
    'capture_started',
    'captured',
    'charge_succeeded',
    'charge_failed',
    'difference_charged',
    'difference_failed',
    'recovery_link_created',
    'recovery_paid',
    'alert_sent',
    'email_sent',
    'admin_action',
    'refund_observed',
    'refund_failed',
    'edit_reevaluated',
    'waived'
  ));

CREATE INDEX IF NOT EXISTS booking_payment_events_booking_idx
  ON public.booking_payment_events (booking_id, created_at);

CREATE OR REPLACE FUNCTION public.booking_payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'booking_payment_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS booking_payment_events_append_only ON public.booking_payment_events;
CREATE TRIGGER booking_payment_events_append_only
  BEFORE UPDATE OR DELETE ON public.booking_payment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.booking_payment_events_append_only();

REVOKE ALL ON public.booking_payment_events FROM anon, authenticated;

ALTER TABLE public.booking_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_payment_events_no_public_read ON public.booking_payment_events;
CREATE POLICY booking_payment_events_no_public_read
  ON public.booking_payment_events FOR SELECT
  USING (false);

DROP POLICY IF EXISTS booking_payment_events_no_public_insert ON public.booking_payment_events;
CREATE POLICY booking_payment_events_no_public_insert
  ON public.booking_payment_events FOR INSERT
  WITH CHECK (false);

-- ── 3. booking_payment_consents: what the client agreed to, and when (HOLD-01, D-12) ──
-- The full rendered consent text is stored next to its version and sha256 so a later wording change
-- can still prove what the client saw. ip and user_agent are NEW personal data: the 075 erasure
-- function does not cover them yet (D-23, a Phase 89 go-live blocker). RLS deny-all, service role only.
CREATE TABLE IF NOT EXISTS public.booking_payment_consents (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  setup_intent_id   text,
  payment_intent_id text,
  mode              text        NOT NULL CHECK (mode IN ('setup', 'hold_now')),
  text_version      text        NOT NULL CHECK (char_length(text_version) BETWEEN 1 AND 40),
  text_sha256       text        NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  text_rendered     text        NOT NULL CHECK (char_length(text_rendered) <= 2000),
  locale            text        NOT NULL CHECK (locale IN ('en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh')),
  amount_minor      bigint      CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency          text        CHECK (currency IS NULL OR currency IN ('eur', 'czk')),
  planned_hold_at   timestamptz,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  ip                text        CHECK (ip IS NULL OR char_length(ip) <= 64),
  user_agent        text        CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  confirmed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS booking_payment_consents_booking_idx
  ON public.booking_payment_consents (booking_id, accepted_at);

REVOKE ALL ON public.booking_payment_consents FROM anon, authenticated;

ALTER TABLE public.booking_payment_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_payment_consents_no_public_read ON public.booking_payment_consents;
CREATE POLICY booking_payment_consents_no_public_read
  ON public.booking_payment_consents FOR SELECT
  USING (false);

DROP POLICY IF EXISTS booking_payment_consents_no_public_insert ON public.booking_payment_consents;
CREATE POLICY booking_payment_consents_no_public_insert
  ON public.booking_payment_consents FOR INSERT
  WITH CHECK (false);

-- ── 4. pricing_globals: card-flow settings (D-01, D-04) ─────────────────────────
-- payment_hold_lead_hours: the hold is placed this many hours before pickup. The 96 h ceiling stays
-- under the 114 h card-network window by construction, so 120 h is impossible (D-01).
-- card_flow_mode: 'off' or 'canary' ONLY. There is deliberately no 'on' value until the Phase 89
-- legal gate widens this CHECK, which makes "closed to every client except the owner's canary
-- allowlist" a database invariant (D-04).
ALTER TABLE public.pricing_globals
  ADD COLUMN IF NOT EXISTS payment_hold_lead_hours integer NOT NULL DEFAULT 72
    CONSTRAINT pricing_globals_payment_hold_lead_hours_range
    CHECK (payment_hold_lead_hours BETWEEN 6 AND 96),
  ADD COLUMN IF NOT EXISTS card_flow_mode text NOT NULL DEFAULT 'off'
    CONSTRAINT pricing_globals_card_flow_mode_check
    CHECK (card_flow_mode IN ('off', 'canary')),
  ADD COLUMN IF NOT EXISTS card_flow_canary_emails text[] NOT NULL DEFAULT '{}'
    CONSTRAINT pricing_globals_card_flow_canary_emails_max
    CHECK (cardinality(card_flow_canary_emails) <= 20);

-- ── 5. apply_payment_transition: atomic compare-and-set plus ledger row (D-05) ──
-- One transaction. The booking row is locked first, so under READ COMMITTED a concurrent writer
-- waits and re-reads: exactly one of two racing callers is applied.
--   * Same (booking_id, event_key) seen before: no-op, { applied: false, duplicate: true }.
--   * The compare-and-set misses (state not in p_from, or the lease rule): { applied: false,
--     current_state }.
--   * Applied: the allow-listed patch keys are read one by one with the ? operator (never a
--     record-populating helper, so a caller can not mass-assign money columns) and one ledger row is written. If that insert
--     still collides (race with append_payment_event) a dedicated error rolls the UPDATE back inside
--     the sub-transaction and the call reports duplicate.
--   * payment_intent_id is the PaymentIntent that COLLECTED the money: accepted only when p_to is
--     captured or balance_due.
--   * Lease rule: a row in placing_hold / capturing can be moved into placing_hold / capturing again
--     only after payment_lease_until has passed. The lease holder completes its own claim by moving
--     out of those states, which is never blocked.
CREATE OR REPLACE FUNCTION public.apply_payment_transition(
  p_booking_id uuid,
  p_from       text[],
  p_to         text,
  p_patch      jsonb,
  p_event      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_states constant text[] := ARRAY[
    'none', 'checkout_pending', 'card_saved', 'placing_hold', 'authorized', 'capturing',
    'captured', 'balance_due', 'failed', 'expired', 'released'
  ];
  v_patch jsonb := COALESCE(p_patch, '{}'::jsonb);
  v_key   text  := p_event->>'key';
  v_prev  text;
  v_row   public.bookings;
  v_rows  integer;
BEGIN
  IF p_to IS NULL OR NOT (p_to = ANY (v_states)) THEN
    RAISE EXCEPTION 'invalid payment state';
  END IF;
  IF p_from IS NULL OR cardinality(p_from) = 0 THEN
    RAISE EXCEPTION 'invalid from states';
  END IF;
  IF v_key IS NULL OR p_event->>'kind' IS NULL OR p_event->>'actor_type' IS NULL THEN
    RAISE EXCEPTION 'invalid payment event';
  END IF;
  IF v_patch ? 'payment_intent_id' AND p_to NOT IN ('captured', 'balance_due') THEN
    RAISE EXCEPTION 'payment_intent_id is set only when money is collected';
  END IF;

  SELECT b.payment_state INTO v_prev
    FROM public.bookings b
   WHERE b.id = p_booking_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'current_state', NULL);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_payment_events e
     WHERE e.booking_id = p_booking_id AND e.event_key = v_key
  ) THEN
    RETURN jsonb_build_object('applied', false, 'duplicate', true, 'current_state', v_prev);
  END IF;

  BEGIN
    UPDATE public.bookings b SET
        payment_state            = p_to,
        payment_currency         = CASE WHEN v_patch ? 'payment_currency'
                                        THEN v_patch->>'payment_currency' ELSE b.payment_currency END,
        payment_amount_minor     = CASE WHEN v_patch ? 'payment_amount_minor'
                                        THEN (v_patch->>'payment_amount_minor')::bigint ELSE b.payment_amount_minor END,
        stripe_customer_id       = CASE WHEN v_patch ? 'stripe_customer_id'
                                        THEN v_patch->>'stripe_customer_id' ELSE b.stripe_customer_id END,
        stripe_payment_method_id = CASE WHEN v_patch ? 'stripe_payment_method_id'
                                        THEN v_patch->>'stripe_payment_method_id' ELSE b.stripe_payment_method_id END,
        setup_intent_id          = CASE WHEN v_patch ? 'setup_intent_id'
                                        THEN v_patch->>'setup_intent_id' ELSE b.setup_intent_id END,
        hold_at                  = CASE WHEN v_patch ? 'hold_at'
                                        THEN (v_patch->>'hold_at')::timestamptz ELSE b.hold_at END,
        hold_payment_intent_id   = CASE WHEN v_patch ? 'hold_payment_intent_id'
                                        THEN v_patch->>'hold_payment_intent_id' ELSE b.hold_payment_intent_id END,
        hold_amount_minor        = CASE WHEN v_patch ? 'hold_amount_minor'
                                        THEN (v_patch->>'hold_amount_minor')::bigint ELSE b.hold_amount_minor END,
        hold_placed_at           = CASE WHEN v_patch ? 'hold_placed_at'
                                        THEN (v_patch->>'hold_placed_at')::timestamptz ELSE b.hold_placed_at END,
        capture_before           = CASE WHEN v_patch ? 'capture_before'
                                        THEN (v_patch->>'capture_before')::timestamptz ELSE b.capture_before END,
        hold_attempts            = CASE WHEN v_patch ? 'hold_attempts'
                                        THEN (v_patch->>'hold_attempts')::smallint ELSE b.hold_attempts END,
        charge_attempts          = CASE WHEN v_patch ? 'charge_attempts'
                                        THEN (v_patch->>'charge_attempts')::smallint ELSE b.charge_attempts END,
        payment_lease_until      = CASE WHEN v_patch ? 'payment_lease_until'
                                        THEN (v_patch->>'payment_lease_until')::timestamptz ELSE b.payment_lease_until END,
        captured_amount_minor    = CASE WHEN v_patch ? 'captured_amount_minor'
                                        THEN (v_patch->>'captured_amount_minor')::bigint ELSE b.captured_amount_minor END,
        captured_at              = CASE WHEN v_patch ? 'captured_at'
                                        THEN (v_patch->>'captured_at')::timestamptz ELSE b.captured_at END,
        payment_failed_at        = CASE WHEN v_patch ? 'payment_failed_at'
                                        THEN (v_patch->>'payment_failed_at')::timestamptz ELSE b.payment_failed_at END,
        payment_retry_at         = CASE WHEN v_patch ? 'payment_retry_at'
                                        THEN (v_patch->>'payment_retry_at')::timestamptz ELSE b.payment_retry_at END,
        payment_retry_count      = CASE WHEN v_patch ? 'payment_retry_count'
                                        THEN (v_patch->>'payment_retry_count')::smallint ELSE b.payment_retry_count END,
        last_payment_error       = CASE WHEN v_patch ? 'last_payment_error'
                                        THEN v_patch->>'last_payment_error' ELSE b.last_payment_error END,
        recovery_link_id         = CASE WHEN v_patch ? 'recovery_link_id'
                                        THEN v_patch->>'recovery_link_id' ELSE b.recovery_link_id END,
        recovery_link_url        = CASE WHEN v_patch ? 'recovery_link_url'
                                        THEN v_patch->>'recovery_link_url' ELSE b.recovery_link_url END,
        payment_intent_id        = CASE WHEN v_patch ? 'payment_intent_id'
                                        THEN v_patch->>'payment_intent_id' ELSE b.payment_intent_id END
      WHERE b.id = p_booking_id
        AND b.payment_state = ANY (p_from)
        AND NOT (
          b.payment_state IN ('placing_hold', 'capturing')
          AND p_to IN ('placing_hold', 'capturing')
          AND COALESCE(b.payment_lease_until > now(), false)
        )
      RETURNING b.* INTO v_row;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'applied', false,
        'current_state', (SELECT x.payment_state FROM public.bookings x WHERE x.id = p_booking_id)
      );
    END IF;

    INSERT INTO public.booking_payment_events
      (booking_id, event_key, kind, stripe_object_id, amount_minor, currency,
       from_state, to_state, actor_type, actor_id, error_code)
    VALUES
      (p_booking_id, v_key, p_event->>'kind', p_event->>'stripe_object_id',
       (p_event->>'amount_minor')::bigint, p_event->>'currency',
       v_prev, p_to, p_event->>'actor_type', p_event->>'actor_id', p_event->>'error_code')
    ON CONFLICT (booking_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment_event_duplicate' USING ERRCODE = 'P0D01';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'P0D01' THEN
      -- The sub-transaction rolled the UPDATE back: a replay of a recorded event is a no-op.
      RETURN jsonb_build_object('applied', false, 'duplicate', true, 'current_state', v_prev);
  END;

  RETURN jsonb_build_object(
    'applied', true,
    'previous_state', v_prev,
    'booking', to_jsonb(v_row)
  );
END;
$$;

-- ── 6. append_payment_event: a ledger row without a state change ────────────────
-- from_state = to_state = the current payment_state. Same event key again: { inserted: false }.
CREATE OR REPLACE FUNCTION public.append_payment_event(
  p_booking_id uuid,
  p_event      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state text;
  v_rows  integer;
BEGIN
  IF p_event->>'key' IS NULL OR p_event->>'kind' IS NULL OR p_event->>'actor_type' IS NULL THEN
    RAISE EXCEPTION 'invalid payment event';
  END IF;

  SELECT b.payment_state INTO v_state
    FROM public.bookings b
   WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  INSERT INTO public.booking_payment_events
    (booking_id, event_key, kind, stripe_object_id, amount_minor, currency,
     from_state, to_state, actor_type, actor_id, error_code)
  VALUES
    (p_booking_id, p_event->>'key', p_event->>'kind', p_event->>'stripe_object_id',
     (p_event->>'amount_minor')::bigint, p_event->>'currency',
     v_state, v_state, p_event->>'actor_type', p_event->>'actor_id', p_event->>'error_code')
  ON CONFLICT (booking_id, event_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('inserted', v_rows > 0);
END;
$$;

-- ── 7. claim_due_payment_work: lease claim of due scheduled holds (HOLD-02) ─────
-- Claims card_hold rows in card_saved with hold_at <= now() (or in placing_hold whose lease has
-- expired) that are still active and have a future pickup, oldest hold_at first. FOR UPDATE SKIP
-- LOCKED means overlapping ticks never claim the same row. Pattern: outbox_claim (064).
-- One hold_started ledger row per claimed id; the key carries the attempt number and the claim
-- instant, so a later re-claim of the same booking gets its own row.
CREATE OR REPLACE FUNCTION public.claim_due_payment_work(
  p_limit         integer,
  p_lease_seconds integer
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 50);
  v_lease integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 1), 86400);
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT b.id, b.payment_state AS prev_state
      FROM public.bookings b
     WHERE b.payment_mode = 'card_hold'
       AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location')
       AND b.pickup_utc > now()
       AND (
         (b.payment_state = 'card_saved' AND b.hold_at <= now())
         OR (b.payment_state = 'placing_hold' AND b.payment_lease_until <= now())
       )
     ORDER BY b.hold_at ASC, b.id ASC
     LIMIT v_limit
       FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.bookings b
       SET payment_state       = 'placing_hold',
           payment_lease_until = now() + make_interval(secs => v_lease)
      FROM due
     WHERE b.id = due.id
    RETURNING b.*
  ),
  logged AS (
    INSERT INTO public.booking_payment_events
      (booking_id, event_key, kind, amount_minor, currency, from_state, to_state, actor_type, actor_id)
    SELECT c.id,
           'hold_started:' || c.hold_attempts::text || ':' || extract(epoch FROM now())::text,
           'hold_started',
           c.payment_amount_minor,
           c.payment_currency,
           d.prev_state,
           'placing_hold',
           'system',
           'claim_due_payment_work'
      FROM claimed c
      JOIN due d ON d.id = c.id
    ON CONFLICT (booking_id, event_key) DO NOTHING
  )
  SELECT c.* FROM claimed c;
END;
$$;

-- ── 8. Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bookings_hold_due_idx
  ON public.bookings (hold_at)
  WHERE payment_mode = 'card_hold' AND payment_state = 'card_saved';

CREATE INDEX IF NOT EXISTS bookings_payment_attention_idx
  ON public.bookings (payment_state)
  WHERE payment_mode = 'card_hold'
    AND payment_state IN ('checkout_pending', 'placing_hold', 'authorized', 'capturing', 'failed', 'balance_due', 'expired');

CREATE UNIQUE INDEX IF NOT EXISTS bookings_hold_payment_intent_id_key
  ON public.bookings (hold_payment_intent_id)
  WHERE hold_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_setup_intent_id_leg_key
  ON public.bookings (setup_intent_id, leg)
  WHERE setup_intent_id IS NOT NULL;

-- ── 9. Grants: a re-created SECURITY DEFINER function regains PUBLIC EXECUTE, always re-revoke ──
REVOKE EXECUTE ON FUNCTION public.booking_payment_events_append_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_payment_transition(uuid, text[], text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_payment_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_due_payment_work(integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_payment_transition(uuid, text[], text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_payment_event(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_payment_work(integer, integer) TO service_role;
