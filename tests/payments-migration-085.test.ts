// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { createFakePaymentsDb, FAKE_PAYMENT_VOCABULARY } from './helpers/fake-payments-db'
import { LEDGER_KINDS, PAYMENT_STATES } from '@/lib/payments/state'

// Text-level contract tests for migration 085 (Phase 88, plan 88-01): payment columns, the
// append-only money ledger, the consent record, the card-flow settings and the three payment RPCs.
// The live behaviour is proven by the rolled-back smoke 88-01-smoke.sql; these tests pin the guards
// that must never be edited out. Comment lines are stripped, so a rule mentioned only in a comment
// does not count. The last block pins the in-memory fake that later plans test against.

const m085 = loadMigration('085_payment_state_card_on_file.sql')
const sorted = (xs: Iterable<string>) => [...xs].sort()

/** Body of one CREATE TABLE of 085: from its opening parenthesis to the closing `);`. */
function tableBody(name: string): string {
  const start = m085.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  expect(start, `${name} must be created in 085`).toBeGreaterThan(-1)
  return m085.slice(start, m085.indexOf('\n);', start))
}

/** Column names of a table body (lines that start a column, not a table constraint). */
function columnNames(body: string): string[] {
  return body
    .split('\n')
    .slice(1)
    .map((l) => /^ {2}([a-z_]+)\s/.exec(l)?.[1])
    .filter((n): n is string => !!n && !['constraint', 'primary', 'unique', 'check', 'foreign'].includes(n))
}

describe('085 bookings payment columns', () => {
  const columns: Array<[string, RegExp]> = [
    ['payment_mode', /payment_mode\s+text\s+NOT NULL DEFAULT 'pay_now'/],
    ['payment_state', /payment_state\s+text\s+NOT NULL DEFAULT 'none'/],
    ['payment_currency', /payment_currency\s+text/],
    ['payment_amount_minor', /payment_amount_minor\s+bigint/],
    ['stripe_customer_id', /stripe_customer_id\s+text/],
    ['stripe_payment_method_id', /stripe_payment_method_id\s+text/],
    ['setup_intent_id', /setup_intent_id\s+text/],
    ['hold_at', /hold_at\s+timestamptz/],
    ['hold_payment_intent_id', /hold_payment_intent_id\s+text/],
    ['hold_amount_minor', /hold_amount_minor\s+bigint/],
    ['hold_placed_at', /hold_placed_at\s+timestamptz/],
    ['capture_before', /capture_before\s+timestamptz/],
    ['hold_attempts', /hold_attempts\s+smallint\s+NOT NULL DEFAULT 0/],
    ['charge_attempts', /charge_attempts\s+smallint\s+NOT NULL DEFAULT 0/],
    ['payment_lease_until', /payment_lease_until\s+timestamptz/],
    ['captured_amount_minor', /captured_amount_minor\s+bigint\s+NOT NULL DEFAULT 0/],
    ['captured_at', /captured_at\s+timestamptz/],
    ['payment_failed_at', /payment_failed_at\s+timestamptz/],
    ['payment_retry_at', /payment_retry_at\s+timestamptz/],
    ['payment_retry_count', /payment_retry_count\s+smallint\s+NOT NULL DEFAULT 0/],
    ['last_payment_error', /last_payment_error\s+text/],
    ['recovery_link_id', /recovery_link_id\s+text/],
    ['recovery_link_url', /recovery_link_url\s+text/],
  ]

  for (const [name, re] of columns) {
    it(`adds ${name} with IF NOT EXISTS`, () => {
      expect(m085).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${re.source}`))
    })
  }

  it('names the five CHECK constraints', () => {
    for (const c of [
      'bookings_payment_mode_check',
      'bookings_payment_state_check',
      'bookings_payment_currency_check',
      'bookings_payment_amount_minor_check',
      'bookings_last_payment_error_check',
    ]) {
      expect(m085).toContain(`ADD CONSTRAINT ${c}`)
    }
    expect(m085).toMatch(/char_length\(last_payment_error\) <= 60/)
    expect(m085).toMatch(/payment_amount_minor > 0/)
  })

  it('backfills gnet rows to partner and leaves every other row on pay_now', () => {
    expect(m085).toMatch(
      /UPDATE public\.bookings\s+SET payment_mode = 'partner'\s+WHERE booking_source = 'gnet'\s+AND payment_mode = 'pay_now'/,
    )
  })

  it('does not touch status or any column a bookings trigger watches', () => {
    const backfill = m085.slice(m085.indexOf('UPDATE public.bookings'), m085.indexOf("AND payment_mode = 'pay_now';"))
    expect(backfill).not.toMatch(/\bstatus\b\s*=/)
  })
})

describe('085 booking_payment_events', () => {
  const body = tableBody('booking_payment_events')

  it('has the agreed key columns and constraints', () => {
    expect(body).toMatch(/id\s+bigint\s+GENERATED ALWAYS AS IDENTITY PRIMARY KEY/)
    expect(body).toMatch(/booking_id\s+uuid\s+NOT NULL REFERENCES public\.bookings\(id\) ON DELETE RESTRICT/)
    expect(body).toMatch(/UNIQUE \(booking_id, event_key\)/)
    expect(body).toMatch(/actor_type\s+text\s+NOT NULL CHECK \(actor_type IN \('system', 'webhook', 'admin'\)\)/)
    expect(body).toMatch(/actor_id\s+text\s+CHECK \(actor_id IS NULL OR char_length\(actor_id\) <= 64\)/)
    expect(body).toMatch(/error_code\s+text\s+CHECK \(error_code IS NULL OR char_length\(error_code\) <= 60\)/)
  })

  it('stores no name, email, phone or IP column (the ledger is never erased)', () => {
    const forbidden = /(name|email|phone|address)|(^|_)ip($|_)/
    for (const c of columnNames(body)) expect(c, `column ${c}`).not.toMatch(forbidden)
    expect(columnNames(body)).toEqual(
      expect.arrayContaining(['booking_id', 'event_key', 'kind', 'amount_minor', 'from_state', 'to_state']),
    )
  })

  it('the kind CHECK equals LEDGER_KINDS, order included, and includes refund_failed', () => {
    const values = latestCheckValues('booking_payment_events_kind_check', 'kind')
    expect(values).toEqual([...LEDGER_KINDS])
    expect(values).toContain('refund_failed')
  })

  it('is append-only: a BEFORE UPDATE OR DELETE trigger raises', () => {
    const fn = latestFunctionBody('booking_payment_events_append_only')
    expect(fn).toContain('SECURITY DEFINER')
    expect(fn).toContain("SET search_path = ''")
    expect(fn).toContain("RAISE EXCEPTION 'booking_payment_events is append-only'")
    expect(m085).toMatch(
      /CREATE TRIGGER booking_payment_events_append_only\s+BEFORE UPDATE OR DELETE ON public\.booking_payment_events\s+FOR EACH ROW/,
    )
  })

  it('denies public access: REVOKE, RLS and deny-all policies', () => {
    expect(m085).toContain('REVOKE ALL ON public.booking_payment_events FROM anon, authenticated;')
    expect(m085).toContain('ALTER TABLE public.booking_payment_events ENABLE ROW LEVEL SECURITY;')
    expect(m085).toMatch(/ON public\.booking_payment_events FOR SELECT\s+USING \(false\)/)
    expect(m085).toMatch(/ON public\.booking_payment_events FOR INSERT\s+WITH CHECK \(false\)/)
  })
})

describe('085 booking_payment_consents', () => {
  const body = tableBody('booking_payment_consents')

  it('stores version, hash, full rendered text, locale, IP and user agent with limits', () => {
    expect(body).toMatch(/text_version\s+text\s+NOT NULL/)
    expect(body).toMatch(/text_sha256\s+text\s+NOT NULL CHECK \(text_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(body).toMatch(/text_rendered\s+text\s+NOT NULL CHECK \(char_length\(text_rendered\) <= 2000\)/)
    expect(body).toMatch(/mode\s+text\s+NOT NULL CHECK \(mode IN \('setup', 'hold_now'\)\)/)
    expect(body).toMatch(
      /locale\s+text\s+NOT NULL CHECK \(locale IN \('en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'\)\)/,
    )
    expect(body).toMatch(/ip\s+text\s+CHECK \(ip IS NULL OR char_length\(ip\) <= 64\)/)
    expect(body).toMatch(/user_agent\s+text\s+CHECK \(user_agent IS NULL OR char_length\(user_agent\) <= 300\)/)
    expect(body).toMatch(/accepted_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/)
    expect(body).toMatch(/confirmed_at\s+timestamptz/)
    expect(body).toMatch(/booking_id\s+uuid\s+NOT NULL REFERENCES public\.bookings\(id\) ON DELETE RESTRICT/)
  })

  it('denies public access: REVOKE, RLS and deny-all policies', () => {
    expect(m085).toContain('REVOKE ALL ON public.booking_payment_consents FROM anon, authenticated;')
    expect(m085).toContain('ALTER TABLE public.booking_payment_consents ENABLE ROW LEVEL SECURITY;')
    expect(m085).toMatch(/ON public\.booking_payment_consents FOR SELECT\s+USING \(false\)/)
    expect(m085).toMatch(/ON public\.booking_payment_consents FOR INSERT\s+WITH CHECK \(false\)/)
  })
})

describe('085 pricing_globals card-flow settings (D-01, D-04)', () => {
  it('payment_hold_lead_hours defaults to 72 within 6..96', () => {
    expect(m085).toMatch(/ADD COLUMN IF NOT EXISTS payment_hold_lead_hours integer NOT NULL DEFAULT 72/)
    expect(m085).toMatch(/CHECK \(payment_hold_lead_hours BETWEEN 6 AND 96\)/)
  })

  it("card_flow_mode defaults to 'off' and allows only off and canary (no 'on' until Phase 89)", () => {
    expect(m085).toMatch(/ADD COLUMN IF NOT EXISTS card_flow_mode text NOT NULL DEFAULT 'off'/)
    const m = /CHECK \(card_flow_mode IN \(([^)]*)\)\)/.exec(m085)
    expect(m).not.toBeNull()
    expect([...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual(['off', 'canary'])
    expect(m![1]).not.toContain("'on'")
  })

  it('card_flow_canary_emails is a text[] defaulting to empty with at most 20 entries', () => {
    expect(m085).toMatch(/ADD COLUMN IF NOT EXISTS card_flow_canary_emails text\[\] NOT NULL DEFAULT '\{\}'/)
    expect(m085).toMatch(/CHECK \(cardinality\(card_flow_canary_emails\) <= 20\)/)
  })
})

describe('085 functions', () => {
  const RPCS: Array<[string, string]> = [
    ['apply_payment_transition', 'uuid, text[], text, jsonb, jsonb'],
    ['append_payment_event', 'uuid, jsonb'],
    ['claim_due_payment_work', 'integer, integer'],
  ]

  for (const [name, sig] of RPCS) {
    it(`${name} is SECURITY DEFINER with an empty search_path, revoked from public roles, granted to service_role`, () => {
      const body = latestFunctionBody(name)
      expect(body).toContain('SECURITY DEFINER')
      expect(body).toContain("SET search_path = ''")
      expect(m085).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${sig}) FROM PUBLIC, anon, authenticated;`)
      expect(m085).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO service_role;`)
      expect(m085).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[^;]*TO (PUBLIC|anon|authenticated)`))
    })
  }

  it('the append-only trigger function is revoked from public roles too', () => {
    expect(m085).toContain(
      'REVOKE EXECUTE ON FUNCTION public.booking_payment_events_append_only() FROM PUBLIC, anon, authenticated;',
    )
  })

  describe('apply_payment_transition', () => {
    const body = latestFunctionBody('apply_payment_transition')

    it('reads patch keys one by one with the ? operator and never mass-assigns', () => {
      expect(m085).not.toContain('jsonb_populate_record')
      expect(body).not.toContain('jsonb_populate')
      const keys = (body.match(/v_patch \? '([a-z_]+)'/g) ?? []).length
      expect(keys).toBeGreaterThanOrEqual(22)
    })

    it('rejects payment_intent_id unless the target is captured or balance_due', () => {
      expect(body).toMatch(/v_patch \? 'payment_intent_id' AND p_to NOT IN \('captured', 'balance_due'\)/)
    })

    it('compare-and-sets on payment_state = ANY(p_from) and applies the lease rule', () => {
      expect(body).toMatch(/b\.payment_state = ANY \(p_from\)/)
      expect(body).toMatch(/b\.payment_state IN \('placing_hold', 'capturing'\)/)
      expect(body).toMatch(/p_to IN \('placing_hold', 'capturing'\)/)
      expect(body).toMatch(/COALESCE\(b\.payment_lease_until > now\(\), false\)/)
    })

    it('treats a repeated (booking_id, event_key) as a no-op that rolls the UPDATE back', () => {
      expect(body).toMatch(/ON CONFLICT \(booking_id, event_key\) DO NOTHING/)
      expect(body).toContain("'duplicate', true")
      expect(body).toMatch(/EXCEPTION\s+WHEN SQLSTATE 'P0D01'/)
    })

    it('validates p_to against the eleven states of PAYMENT_STATES', () => {
      const arr = /v_states constant text\[\] := ARRAY\[([^\]]*)\]/.exec(body)
      expect(arr).not.toBeNull()
      expect([...arr![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual([...PAYMENT_STATES])
    })
  })

  describe('append_payment_event', () => {
    const body = latestFunctionBody('append_payment_event')

    it('writes from_state = to_state = the current state and ignores a repeated key', () => {
      expect(body).toMatch(/v_state, v_state/)
      expect(body).toMatch(/ON CONFLICT \(booking_id, event_key\) DO NOTHING/)
      expect(body).toContain("jsonb_build_object('inserted', v_rows > 0)")
    })
  })

  describe('claim_due_payment_work', () => {
    const body = latestFunctionBody('claim_due_payment_work')

    it('claims in hold_at, id order with FOR UPDATE SKIP LOCKED and clamps the limit to 1..50', () => {
      expect(body).toContain('FOR UPDATE SKIP LOCKED')
      expect(body).toMatch(/ORDER BY b\.hold_at ASC, b\.id ASC/)
      expect(body).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 1\), 1\), 50\)/)
    })

    it('claims only active card_hold rows with a future pickup', () => {
      expect(body).toContain("b.payment_mode = 'card_hold'")
      expect(body).toContain("b.status IN ('confirmed', 'assigned', 'en_route', 'on_location')")
      expect(body).toContain('b.pickup_utc > now()')
      expect(body).toMatch(/b\.payment_state = 'card_saved' AND b\.hold_at <= now\(\)/)
      expect(body).toMatch(/b\.payment_state = 'placing_hold' AND b\.payment_lease_until <= now\(\)/)
    })

    it('writes one hold_started ledger row per claimed id', () => {
      expect(body).toContain("'hold_started'")
      expect(body).toMatch(/'hold_started:' \|\| c\.hold_attempts::text \|\| ':' \|\| extract\(epoch FROM now\(\)\)::text/)
    })
  })
})

describe('085 indexes', () => {
  it('has the hold-due and attention partial indexes', () => {
    expect(m085).toMatch(
      /CREATE INDEX IF NOT EXISTS bookings_hold_due_idx\s+ON public\.bookings \(hold_at\)\s+WHERE payment_mode = 'card_hold' AND payment_state = 'card_saved'/,
    )
    expect(m085).toMatch(/CREATE INDEX IF NOT EXISTS bookings_payment_attention_idx\s+ON public\.bookings \(payment_state\)/)
  })

  it('has the unique hold payment intent and (setup_intent_id, leg) indexes', () => {
    expect(m085).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS bookings_hold_payment_intent_id_key\s+ON public\.bookings \(hold_payment_intent_id\)\s+WHERE hold_payment_intent_id IS NOT NULL/,
    )
    expect(m085).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS bookings_setup_intent_id_leg_key\s+ON public\.bookings \(setup_intent_id, leg\)\s+WHERE setup_intent_id IS NOT NULL/,
    )
  })
})

// ── fake-payments-db mirrors 085 ───────────────────────────────────────────────

const T0 = Date.parse('2026-11-10T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()
const HOUR = 3_600_000
const ev = (key: string, kind = 'setup_started') => ({
  key,
  kind,
  stripe_object_id: null,
  amount_minor: null,
  currency: null,
  actor_type: 'system',
  actor_id: null,
  error_code: null,
})

describe('fake-payments-db mirrors 085', () => {
  it('enforces the same vocabulary as the latest migration CHECKs', () => {
    expect(sorted(FAKE_PAYMENT_VOCABULARY.states)).toEqual(
      sorted(latestCheckValues('bookings_payment_state_check', 'payment_state')),
    )
    expect(sorted(FAKE_PAYMENT_VOCABULARY.kinds)).toEqual(
      sorted(latestCheckValues('booking_payment_events_kind_check', 'kind')),
    )
  })

  it('seeds pricing_globals with the 085 defaults and a booking with the column defaults', () => {
    const db = createFakePaymentsDb({ bookings: [{}], nowMs: T0 })
    expect(db.state.pricing_globals[0]).toMatchObject({
      payment_hold_lead_hours: 72,
      card_flow_mode: 'off',
      card_flow_canary_emails: [],
    })
    expect(db.state.bookings[0]).toMatchObject({ payment_mode: 'pay_now', payment_state: 'none', hold_attempts: 0 })
  })

  it('a booking with no ledger rows reads state none; append_payment_event inserts one row with from = to', async () => {
    const db = createFakePaymentsDb({ bookings: [{}], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    expect(db.state.booking_payment_events).toHaveLength(0)
    const first = await db.client.rpc('append_payment_event', { p_booking_id: id, p_event: ev('alert:1', 'alert_sent') })
    expect(first.data).toEqual({ inserted: true })
    expect(db.state.booking_payment_events).toHaveLength(1)
    expect(db.state.booking_payment_events[0]).toMatchObject({ from_state: 'none', to_state: 'none' })
    const again = await db.client.rpc('append_payment_event', { p_booking_id: id, p_event: ev('alert:1', 'alert_sent') })
    expect(again.data).toEqual({ inserted: false })
    expect(db.state.booking_payment_events).toHaveLength(1)
  })

  it('applies a transition, writes the ledger row and returns the previous state', async () => {
    const db = createFakePaymentsDb({ bookings: [{}], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    const res = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['none'],
      p_to: 'checkout_pending',
      p_patch: { payment_amount_minor: 4500, payment_currency: 'eur', not_a_column: 'ignored' },
      p_event: ev('setup_started:si_1'),
    })
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ applied: true, previous_state: 'none' })
    expect(db.state.bookings[0]).toMatchObject({
      payment_state: 'checkout_pending',
      payment_amount_minor: 4500,
      payment_currency: 'eur',
    })
    expect(db.state.bookings[0]).not.toHaveProperty('not_a_column')
    expect(db.state.booking_payment_events[0]).toMatchObject({ from_state: 'none', to_state: 'checkout_pending' })
  })

  it('a same-key second transition is a duplicate no-op and the booking keeps the first state', async () => {
    const db = createFakePaymentsDb({ bookings: [{}], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    const call = () =>
      db.client.rpc('apply_payment_transition', {
        p_booking_id: id,
        p_from: ['none'],
        p_to: 'checkout_pending',
        p_patch: {},
        p_event: ev('setup_started:si_1'),
      })
    expect((await call()).data).toMatchObject({ applied: true })
    const second = await call()
    expect(second.data).toEqual({ applied: false, duplicate: true, current_state: 'checkout_pending' })
    expect(db.state.bookings[0].payment_state).toBe('checkout_pending')
    expect(db.state.booking_payment_events).toHaveLength(1)
  })

  it('a lost compare-and-set reports the current state and writes nothing', async () => {
    const db = createFakePaymentsDb({ bookings: [{ payment_state: 'captured' }], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    const res = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['none'],
      p_to: 'checkout_pending',
      p_patch: {},
      p_event: ev('k1'),
    })
    expect(res.data).toEqual({ applied: false, current_state: 'captured' })
    expect(db.state.booking_payment_events).toHaveLength(0)
  })

  it('an unknown booking is not applied with a null current state', async () => {
    const db = createFakePaymentsDb({ nowMs: T0 })
    const res = await db.client.rpc('apply_payment_transition', {
      p_booking_id: 'nope',
      p_from: ['none'],
      p_to: 'checkout_pending',
      p_patch: {},
      p_event: ev('k1'),
    })
    expect(res.data).toEqual({ applied: false, current_state: null })
  })

  it('payment_intent_id in the patch is rejected unless the target is captured or balance_due', async () => {
    const db = createFakePaymentsDb({ bookings: [{ payment_state: 'checkout_pending' }], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    const bad = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['checkout_pending'],
      p_to: 'card_saved',
      p_patch: { payment_intent_id: 'pi_1' },
      p_event: ev('k1'),
    })
    expect(bad.error).not.toBeNull()
    expect(db.state.bookings[0].payment_state).toBe('checkout_pending')

    const cap = createFakePaymentsDb({ bookings: [{ payment_state: 'capturing' }], nowMs: T0 })
    const ok = await cap.client.rpc('apply_payment_transition', {
      p_booking_id: cap.state.bookings[0].id,
      p_from: ['capturing'],
      p_to: 'captured',
      p_patch: { payment_intent_id: 'pi_1' },
      p_event: ev('k2', 'captured'),
    })
    expect(ok.error).toBeNull()
    expect(cap.state.bookings[0].payment_intent_id).toBe('pi_1')
  })

  it('re-claiming a capturing row is refused while the lease is in the future and allowed after it', async () => {
    const db = createFakePaymentsDb({
      bookings: [{ payment_state: 'capturing', payment_lease_until: iso(60_000) }],
      nowMs: T0,
    })
    const id = db.state.bookings[0].id as string
    const args = (key: string) => ({
      p_booking_id: id,
      p_from: ['capturing'],
      p_to: 'capturing',
      p_patch: { payment_lease_until: iso(120_000) },
      p_event: ev(key, 'capture_started'),
    })
    const held = await db.client.rpc('apply_payment_transition', args('cap:1'))
    expect(held.data).toEqual({ applied: false, current_state: 'capturing' })

    db.state.nowMs = T0 + 61_000
    const expired = await db.client.rpc('apply_payment_transition', args('cap:2'))
    expect(expired.data).toMatchObject({ applied: true })
    expect(db.state.bookings[0].payment_lease_until).toBe(iso(120_000))
  })

  it('the lease holder can always complete its own claim', async () => {
    const db = createFakePaymentsDb({
      bookings: [{ payment_state: 'capturing', payment_lease_until: iso(60_000) }],
      nowMs: T0,
    })
    const res = await db.client.rpc('apply_payment_transition', {
      p_booking_id: db.state.bookings[0].id,
      p_from: ['capturing'],
      p_to: 'captured',
      p_patch: { payment_intent_id: 'pi_9' },
      p_event: ev('cap:done', 'captured'),
    })
    expect(res.data).toMatchObject({ applied: true })
  })

  it('claim_due_payment_work returns rows oldest hold_at first and skips cancelled and past pickups', async () => {
    const base = { payment_mode: 'card_hold', payment_state: 'card_saved', status: 'confirmed' }
    const db = createFakePaymentsDb({
      nowMs: T0,
      bookings: [
        { ...base, id: 'b-late', hold_at: iso(-HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-old', hold_at: iso(-5 * HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-tie-b', hold_at: iso(-3 * HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-tie-a', hold_at: iso(-3 * HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-cancelled', status: 'cancelled', hold_at: iso(-9 * HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-past', hold_at: iso(-9 * HOUR), pickup_utc: iso(-HOUR) },
        { ...base, id: 'b-future', hold_at: iso(HOUR), pickup_utc: iso(70 * HOUR) },
        { ...base, id: 'b-paynow', payment_mode: 'pay_now', hold_at: iso(-9 * HOUR), pickup_utc: iso(70 * HOUR) },
      ],
    })
    const res = await db.client.rpc('claim_due_payment_work', { p_limit: 10, p_lease_seconds: 60 })
    const rows = res.data as Array<Record<string, unknown>>
    expect(rows.map((r) => r.id)).toEqual(['b-old', 'b-tie-a', 'b-tie-b', 'b-late'])
    for (const r of rows) {
      expect(r.payment_state).toBe('placing_hold')
      expect(r.payment_lease_until).toBe(iso(60_000))
    }
    const started = db.state.booking_payment_events.filter((e) => e.kind === 'hold_started')
    expect(started).toHaveLength(4)
    expect(started[0]).toMatchObject({ from_state: 'card_saved', to_state: 'placing_hold', actor_type: 'system' })
  })

  it('claim_due_payment_work honours the limit and never claims the same row twice in a lease', async () => {
    const base = { payment_mode: 'card_hold', payment_state: 'card_saved', status: 'confirmed', pickup_utc: iso(70 * HOUR) }
    const db = createFakePaymentsDb({
      nowMs: T0,
      bookings: [
        { ...base, id: 'a', hold_at: iso(-3 * HOUR) },
        { ...base, id: 'b', hold_at: iso(-2 * HOUR) },
        { ...base, id: 'c', hold_at: iso(-1 * HOUR) },
      ],
    })
    const first = (await db.client.rpc('claim_due_payment_work', { p_limit: 2, p_lease_seconds: 60 })).data as Array<Record<string, unknown>>
    expect(first.map((r) => r.id)).toEqual(['a', 'b'])
    const second = (await db.client.rpc('claim_due_payment_work', { p_limit: 5, p_lease_seconds: 60 })).data as Array<Record<string, unknown>>
    expect(second.map((r) => r.id)).toEqual(['c'])
    db.state.nowMs = T0 + 61_000
    const reclaim = (await db.client.rpc('claim_due_payment_work', { p_limit: 5, p_lease_seconds: 60 })).data as Array<Record<string, unknown>>
    expect(reclaim.map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('the ledger is append-only through the query builder too', async () => {
    const db = createFakePaymentsDb({ bookings: [{}], nowMs: T0 })
    const id = db.state.bookings[0].id as string
    await db.client.rpc('append_payment_event', { p_booking_id: id, p_event: ev('k1', 'alert_sent') })
    const upd = await db.client.from('booking_payment_events').update({ kind: 'waived' }).eq('booking_id', id)
    expect(upd.error?.message).toContain('append-only')
    const del = await db.client.from('booking_payment_events').delete().eq('booking_id', id)
    expect(del.error?.message).toContain('append-only')
    expect(db.state.booking_payment_events).toHaveLength(1)
  })

  it('serves select / eq / in / order / limit / single over bookings and pricing_globals', async () => {
    const db = createFakePaymentsDb({
      nowMs: T0,
      bookings: [
        { id: 'x1', payment_state: 'failed', hold_at: iso(2 * HOUR) },
        { id: 'x2', payment_state: 'failed', hold_at: iso(HOUR) },
        { id: 'x3', payment_state: 'captured', hold_at: iso(3 * HOUR) },
      ],
    })
    const list = await db.client
      .from('bookings')
      .select('id')
      .in('payment_state', ['failed'])
      .order('hold_at', { ascending: true })
      .limit(1)
    expect((list.data as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['x2'])
    const one = await db.client.from('bookings').select('*').eq('id', 'x3').single()
    expect(one.data).toMatchObject({ id: 'x3' })
    const missing = await db.client.from('bookings').select('*').eq('id', 'zz').maybeSingle()
    expect(missing.data).toBeNull()
    const settings = await db.client.from('pricing_globals').select('card_flow_mode').eq('id', 1).single()
    expect(settings.data).toMatchObject({ card_flow_mode: 'off' })
  })

  it('an unknown RPC is an error, not a crash', async () => {
    const db = createFakePaymentsDb({ nowMs: T0 })
    const res = await db.client.rpc('no_such_rpc', {})
    expect(res.error).not.toBeNull()
  })
})
