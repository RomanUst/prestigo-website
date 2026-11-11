// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { createFakePaymentsDb, FAKE_PAYMENT_VOCABULARY } from './helpers/fake-payments-db'
import { LEDGER_KINDS } from '@/lib/payments/state'

// Text-level contract of migration 089 (Phase 91 plan 91-01: stops, landing time, waiting rate, extra charges).
// Comments are stripped by loadMigration, so a rule mentioned only in a comment does not count.

const m089 = loadMigration('089_stops_landing_extra_charges.sql')
const m088 = loadMigration('088_erasure_payment_pii.sql')
const m087 = loadMigration('087_cancellation_cash_fee.sql')
const flat = m089.replace(/\s+/g, ' ')
const norm = (v: string) => v.replace(/\s+/g, ' ').trim()

/** The statement (up to its closing semicolon) that starts at the first occurrence of `needle`. */
function statementFrom(needle: string): string {
  const start = flat.indexOf(needle)
  expect(start, `"${needle}" is in 089`).toBeGreaterThanOrEqual(0)
  const end = flat.indexOf(';', start)
  return flat.slice(start, end + 1)
}

describe('089 booking_stops (STOP-04)', () => {
  const stops = statementFrom('CREATE TABLE IF NOT EXISTS public.booking_stops')

  it('creates the table with every column and CHECK of the contract', () => {
    expect(stops).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(stops).toContain('booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE')
    expect(stops).toContain('position smallint NOT NULL CHECK (position BETWEEN 1 AND 5)')
    expect(stops).toContain('address text CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 500)')
    expect(stops).toContain('lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90)')
    expect(stops).toContain('lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)')
    expect(stops).toContain(
      'wait_minutes smallint NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 120 AND wait_minutes % 15 = 0)',
    )
    expect(stops).toContain('free_minutes smallint NOT NULL CHECK (free_minutes >= 0)')
    expect(stops).toContain('blocks smallint NOT NULL DEFAULT 0 CHECK (blocks >= 0)')
    expect(stops).toContain('fee_per_block_eur numeric CHECK (fee_per_block_eur IS NULL OR fee_per_block_eur > 0)')
    expect(stops).toContain('fee_eur numeric NOT NULL DEFAULT 0 CHECK (fee_eur >= 0)')
    expect(stops).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })

  it('has one row per (booking, position)', () => {
    expect(stops).toContain('CONSTRAINT booking_stops_booking_position_key UNIQUE (booking_id, position)')
  })

  it('is deny-all: no anon / authenticated grants, RLS on, SELECT and INSERT denied', () => {
    expect(flat).toContain('REVOKE ALL ON public.booking_stops FROM anon, authenticated;')
    expect(flat).toContain('ALTER TABLE public.booking_stops ENABLE ROW LEVEL SECURITY;')
    expect(flat).toMatch(
      /CREATE POLICY booking_stops_no_public_read ON public\.booking_stops FOR SELECT USING \(false\);/,
    )
    expect(flat).toMatch(
      /CREATE POLICY booking_stops_no_public_insert ON public\.booking_stops FOR INSERT WITH CHECK \(false\);/,
    )
    expect(flat).not.toMatch(/GRANT [A-Z, ]+ ON (TABLE )?public\.booking_stops/i)
  })
})

describe('089 landing columns (STOP-05, D-18)', () => {
  it('adds landing_date, landing_time and pickup_offset_min idempotently', () => {
    expect(flat).toContain('ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS landing_date text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS landing_time text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS pickup_offset_min smallint')
  })

  it('checks the formats and the offset list', () => {
    expect(flat).toContain("CHECK (landing_date IS NULL OR landing_date ~ '^\\d{4}-\\d{2}-\\d{2}$')")
    expect(flat).toContain("CHECK (landing_time IS NULL OR landing_time ~ '^\\d{2}:\\d{2}$')")
    expect(flat).toContain('CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0, 15, 30, 45, 60, 90))')
  })

  it('requires all three landing columns together or none, and drops the constraint before re-adding it', () => {
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS bookings_landing_complete_check')
    expect(flat).toContain(
      'ADD CONSTRAINT bookings_landing_complete_check CHECK ( (landing_date IS NULL) = (landing_time IS NULL) AND (landing_time IS NULL) = (pickup_offset_min IS NULL) )',
    )
  })

  it('never touches pickup_date, pickup_time or the generated pickup_utc', () => {
    // The erasure copies in section 6 only READ it (the 088 request guard); no schema statement may name it.
    const schemaPart = m089.slice(0, m089.indexOf('CREATE OR REPLACE FUNCTION'))
    expect(schemaPart).not.toMatch(/pickup_utc/)
    expect(m089).not.toMatch(/(SET|ALTER COLUMN)\s+pickup_utc/i)
    expect(m089).not.toMatch(/ALTER COLUMN\s+pickup_(date|time)/i)
    expect(m089).not.toMatch(/DROP COLUMN/i)
  })
})

describe('089 waiting rate (D-04, D-05)', () => {
  it('adds pricing_config.waiting_rate_per_15min as a nullable numeric with CHECK > 0', () => {
    expect(flat).toContain('ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS waiting_rate_per_15min numeric;')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS pricing_config_waiting_rate_check')
    expect(flat).toContain(
      'ADD CONSTRAINT pricing_config_waiting_rate_check CHECK (waiting_rate_per_15min IS NULL OR waiting_rate_per_15min > 0)',
    )
  })

  it('D-05: the waiting_rate_per_15min column line carries no DEFAULT and no pricing_config row is written', () => {
    const column = statementFrom('ADD COLUMN IF NOT EXISTS waiting_rate_per_15min')
    expect(column).not.toMatch(/DEFAULT/i)
    expect(column).not.toMatch(/NOT NULL/i)
    expect(m089).not.toMatch(/UPDATE\s+public\.pricing_config/i)
    expect(m089).not.toMatch(/INSERT\s+INTO\s+public\.pricing_config/i)
    expect(m089).not.toMatch(/waiting_rate_per_15min[^;]*DEFAULT/i)
  })
})

describe('089 booking_extra_charges (EXTRA-01)', () => {
  const extras = statementFrom('CREATE TABLE IF NOT EXISTS public.booking_extra_charges')

  it('creates the table with every column and CHECK of the contract', () => {
    expect(extras).toContain('booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT')
    expect(extras).toContain("kind text NOT NULL CHECK (kind IN ('waiting', 'other'))")
    expect(extras).toContain(
      "status text NOT NULL DEFAULT 'charging' CHECK (status IN ('charging', 'charged', 'failed'))",
    )
    expect(extras).toContain("currency text NOT NULL CHECK (currency IN ('eur', 'czk'))")
    expect(extras).toContain('amount_minor bigint NOT NULL CHECK (amount_minor > 0)')
    expect(extras).toContain('minutes integer CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 480)')
    expect(extras).toContain('blocks integer CHECK (blocks IS NULL OR blocks >= 1)')
    expect(extras).toContain('rate_per_block_eur numeric CHECK (rate_per_block_eur IS NULL OR rate_per_block_eur > 0)')
    expect(extras).toContain('description text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200)')
    expect(extras).toContain('attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1)')
    expect(extras).toContain('stripe_payment_intent_id text,')
    expect(extras).toContain('last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 60)')
    expect(extras).toContain('requested_by uuid,')
    expect(extras).toContain('requested_at timestamptz NOT NULL DEFAULT now()')
    expect(extras).toContain('charged_at timestamptz,')
    expect(extras).toContain('updated_at timestamptz NOT NULL DEFAULT now()')
  })

  it('allows one charging row per booking through a partial unique index, and indexes the history', () => {
    expect(flat).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS booking_extra_charges_one_charging ON public.booking_extra_charges (booking_id) WHERE status = 'charging';",
    )
    expect(flat).toContain(
      'CREATE INDEX IF NOT EXISTS booking_extra_charges_booking_idx ON public.booking_extra_charges (booking_id, requested_at);',
    )
  })

  it('is deny-all like booking_stops', () => {
    expect(flat).toContain('REVOKE ALL ON public.booking_extra_charges FROM anon, authenticated;')
    expect(flat).toContain('ALTER TABLE public.booking_extra_charges ENABLE ROW LEVEL SECURITY;')
    expect(flat).toMatch(
      /CREATE POLICY booking_extra_charges_no_public_read ON public\.booking_extra_charges FOR SELECT USING \(false\);/,
    )
    expect(flat).toMatch(
      /CREATE POLICY booking_extra_charges_no_public_insert ON public\.booking_extra_charges FOR INSERT WITH CHECK \(false\);/,
    )
  })
})

describe('089 ledger kinds', () => {
  const kinds = latestCheckValues('booking_payment_events_kind_check', 'kind')

  function kinds087(): string[] {
    const m = /booking_payment_events_kind_check\s+CHECK\s*\(\s*kind\s+IN\s*\(([\s\S]*?)\)\s*\)/.exec(m087)
    expect(m, '087 kind CHECK').not.toBeNull()
    return [...(m as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  }

  it('the latest CHECK is the full 087 list followed by extra_charged and extra_failed, in that order', () => {
    expect(kinds).toEqual([...kinds087(), 'extra_charged', 'extra_failed'])
    expect(kinds.slice(-2)).toEqual(['extra_charged', 'extra_failed'])
  })

  it('LEDGER_KINDS and the fake DB vocabulary list the same kinds in the same order', () => {
    expect(kinds).toEqual([...LEDGER_KINDS])
    expect([...FAKE_PAYMENT_VOCABULARY.kinds]).toEqual([...LEDGER_KINDS])
  })
})

describe('089 erasure functions', () => {
  const anonymise = latestFunctionBody('erasure_anonymise_person')
  const open = latestFunctionBody('erasure_payment_open')

  function bodyIn(sql: string, name: string): string {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
    expect(start, `${name} in the file`).toBeGreaterThan(-1)
    return sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start) + 5) + 3)
  }

  it('the latest definitions are the ones in 089', () => {
    expect(norm(anonymise)).toBe(norm(bodyIn(m089, 'erasure_anonymise_person')))
    expect(norm(open)).toBe(norm(bodyIn(m089, 'erasure_payment_open')))
  })

  it('erasure_anonymise_person keeps every statement of the 088 body', () => {
    const chunks = bodyIn(m088, 'erasure_anonymise_person')
      .split(';')
      .map(norm)
      .filter((c) => c.length > 0)
    expect(chunks.length).toBeGreaterThan(20)
    const next = norm(anonymise)
    for (const chunk of chunks) {
      expect(next, `statement missing from 089: ${chunk.slice(0, 80)}`).toContain(chunk)
    }
  })

  it('erasure_anonymise_person nulls stop addresses and coordinates and the extra-charge description', () => {
    const f = norm(anonymise)
    expect(f).toMatch(
      /UPDATE public\.booking_stops bs SET address = NULL, lat = NULL, lng = NULL WHERE bs\.booking_id = ANY \(v_ids\)/,
    )
    expect(f).toMatch(
      /UPDATE public\.booking_extra_charges ec SET description = NULL WHERE ec\.booking_id = ANY \(v_ids\)/,
    )
    // The stop rows and the money rows stay (accounting history).
    expect(anonymise).not.toMatch(/DELETE FROM public\.booking_stops/)
    expect(anonymise).not.toMatch(/DELETE FROM public\.booking_extra_charges/)
    // Both scrubs sit next to the 088 fee-case scrub, before the Stripe ids block.
    expect(f.indexOf('UPDATE public.booking_stops')).toBeGreaterThan(f.indexOf('UPDATE public.booking_fee_cases'))
    expect(f.indexOf('UPDATE public.booking_stops')).toBeLessThan(f.indexOf('SET stripe_customer_id = NULL'))
  })

  it('erasure_payment_open keeps the 088 conditions and counts a charging extra as open', () => {
    const f = norm(open)
    expect(f).toMatch(/payment_state IN \('placing_hold', 'authorized', 'capturing'\)/)
    expect(f).toMatch(/b\.fee_case_status = 'pending'/)
    expect(f).toMatch(/FROM public\.booking_fee_cases c WHERE c\.booking_id = b\.id AND c\.status = 'pending'/)
    expect(f).toMatch(
      /b\.pickup_utc >= now\(\) AND b\.status <> 'cancelled' AND b\.payment_state NOT IN \('none', 'captured', 'released', 'cash_settled'\)/,
    )
    expect(f).toMatch(
      /OR EXISTS \( SELECT 1 FROM public\.booking_extra_charges x WHERE x\.booking_id = b\.id AND x\.status = 'charging' \)/,
    )
    expect(open).toContain('SECURITY DEFINER')
    expect(open).toContain("SET search_path = ''")
  })

  it('repeats REVOKE FROM PUBLIC, anon, authenticated for both functions and grants only service_role', () => {
    expect(m089).toContain('REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;')
    expect(m089).toContain('REVOKE EXECUTE ON FUNCTION public.erasure_payment_open(uuid[]) FROM PUBLIC, anon, authenticated;')
    expect(m089).toContain('REVOKE EXECUTE ON FUNCTION public.erasure_payment_open(uuid[]) FROM service_role;')
    expect(m089).toContain('GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;')
    expect(m089).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.erasure_payment_open/)
    expect(m089).not.toMatch(/GRANT EXECUTE ON FUNCTION [^;]* TO (PUBLIC|anon|authenticated)/)
  })
})

describe('fake DB mirrors booking_stops and booking_extra_charges', () => {
  function seeded() {
    const db = createFakePaymentsDb({ bookings: [{ id: 'bk-1' }, { id: 'bk-2' }] })
    return db.client
  }
  const stop = (over: Record<string, unknown> = {}) => ({
    booking_id: 'bk-1',
    position: 1,
    address: 'Karlovo namesti 1, Praha',
    free_minutes: 15,
    ...over,
  })
  const extra = (over: Record<string, unknown> = {}) => ({
    booking_id: 'bk-1',
    kind: 'waiting',
    currency: 'eur',
    amount_minor: 3000,
    ...over,
  })

  it('accepts a valid stop and applies the column defaults', async () => {
    const c = seeded()
    const res = await c.from('booking_stops').insert(stop({ wait_minutes: 30 })).select('*').single()
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ wait_minutes: 30, blocks: 0, fee_eur: 0, free_minutes: 15, position: 1 })
  })

  it('rejects wait_minutes 20 and position 6 with the constraint name', async () => {
    const c = seeded()
    const wait = await c.from('booking_stops').insert(stop({ wait_minutes: 20 }))
    expect(wait.error?.message).toContain('booking_stops_wait_minutes_check')
    const pos = await c.from('booking_stops').insert(stop({ position: 6 }))
    expect(pos.error?.message).toContain('booking_stops_position_check')
  })

  it('returns 23505 for a second stop with the same booking and position, but accepts the next position', async () => {
    const c = seeded()
    expect((await c.from('booking_stops').insert(stop())).error).toBeNull()
    const dup = await c.from('booking_stops').insert(stop({ address: 'elsewhere' }))
    expect(dup.error?.code).toBe('23505')
    expect((await c.from('booking_stops').insert(stop({ position: 2 }))).error).toBeNull()
    expect((await c.from('booking_stops').insert(stop({ booking_id: 'bk-2' }))).error).toBeNull()
  })

  it('a booking_extra_charges row defaults to status charging and attempt 1', async () => {
    const c = seeded()
    const res = await c.from('booking_extra_charges').insert(extra()).select('*').single()
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ status: 'charging', attempt: 1, description: null })
  })

  it('a second charging row for the same booking is 23505; a charged row next to a charging one is accepted', async () => {
    const c = seeded()
    expect((await c.from('booking_extra_charges').insert(extra())).error).toBeNull()
    const second = await c.from('booking_extra_charges').insert(extra())
    expect(second.error?.code).toBe('23505')
    expect((await c.from('booking_extra_charges').insert(extra({ status: 'charged' }))).error).toBeNull()
    expect((await c.from('booking_extra_charges').insert(extra({ booking_id: 'bk-2' }))).error).toBeNull()
  })

  it('an update that sets status charging collides with the open charging row and is reverted', async () => {
    const c = seeded()
    await c.from('booking_extra_charges').insert(extra())
    const failed = await c.from('booking_extra_charges').insert(extra({ status: 'failed' })).select('*').single()
    const row = failed.data as { id: string }
    const retry = await c.from('booking_extra_charges').update({ status: 'charging' }).eq('id', row.id)
    expect(retry.error?.code).toBe('23505')
    const after = await c.from('booking_extra_charges').select('*').eq('id', row.id).single()
    expect((after.data as { status: string }).status).toBe('failed')
  })

  it('rejects an unknown kind, a zero amount and an over-long description with the constraint name', async () => {
    const c = seeded()
    expect((await c.from('booking_extra_charges').insert(extra({ kind: 'tip' }))).error?.message).toContain(
      'booking_extra_charges_kind_check',
    )
    expect((await c.from('booking_extra_charges').insert(extra({ amount_minor: 0 }))).error?.message).toContain(
      'booking_extra_charges_amount_minor_check',
    )
    expect(
      (await c.from('booking_extra_charges').insert(extra({ description: 'x'.repeat(201) }))).error?.message,
    ).toContain('booking_extra_charges_description_check')
  })

  it('the ledger accepts extra_charged and extra_failed through append_payment_event', async () => {
    const c = seeded()
    for (const kind of ['extra_charged', 'extra_failed']) {
      const res = await c.rpc('append_payment_event', {
        p_booking_id: 'bk-1',
        p_event: { key: `k-${kind}`, kind, actor_type: 'admin', actor_id: 'a' },
      })
      expect(res.error).toBeNull()
    }
  })
})
