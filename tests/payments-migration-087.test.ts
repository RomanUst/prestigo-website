// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { createFakePaymentsDb } from './helpers/fake-payments-db'

// Text-level contract of migration 087 (Phase 89: cancellation policy, cash guarantee, fee cases): the state and
// ledger vocabulary, the five policy settings with their bounds, the consent mode, the policy snapshot columns, the
// three deny-all tables and the status mirror trigger. Plus the fake DB mirrors the new tables.

const m087 = loadMigration('087_cancellation_cash_fee.sql')
const SIG6 = 'uuid, text[], text, jsonb, jsonb, text[]'

describe('087 vocabulary', () => {
  it('payment_state gains cash_settled and keeps every earlier state', () => {
    const states = latestCheckValues('bookings_payment_state_check', 'payment_state')
    expect(states).toContain('cash_settled')
    for (const s of ['none', 'card_saved', 'failed', 'captured', 'released']) expect(states).toContain(s)
  })

  it('the ledger kinds gain fee_opened, cash_settled, cash_reopened', () => {
    const kinds = latestCheckValues('booking_payment_events_kind_check', 'kind')
    for (const k of ['fee_opened', 'cash_settled', 'cash_reopened', 'waived', 'setup_started']) expect(kinds).toContain(k)
  })

  it('the consent mode gains cash_setup', () => {
    // Later migrations widen the list again (091 adds 'quote'); 087's own addition must stay in it.
    expect(latestCheckValues('booking_payment_consents_mode_check', 'mode')).toEqual(
      expect.arrayContaining(['cash_setup', 'hold_now', 'setup']),
    )
  })
})

describe('087 apply_payment_transition', () => {
  const body = latestFunctionBody('apply_payment_transition')

  it('still carries the 086 status gate word for word', () => {
    expect(body).toMatch(/p_require_status text\[\] DEFAULT NULL/)
    expect(body).toMatch(/SELECT b\.payment_state, b\.status INTO v_prev, v_status[\s\S]*?FOR UPDATE;/)
    expect(body).toMatch(/IF p_require_status IS NOT NULL AND NOT COALESCE\(v_status = ANY \(p_require_status\), false\) THEN/)
    expect(body).toContain("'status_blocked', true")
    const gate = body.indexOf('p_require_status IS NOT NULL')
    expect(gate).toBeGreaterThan(body.indexOf('FOR UPDATE;'))
    expect(gate).toBeLessThan(body.indexOf('UPDATE public.bookings b SET'))
  })

  it('accepts cash_settled and keeps the 085 compare-and-set rules', () => {
    expect(body).toMatch(/v_states constant text\[\] := ARRAY\[[\s\S]*?'cash_settled'[\s\S]*?\];/)
    expect(body).toMatch(/b\.payment_state = ANY \(p_from\)/)
    expect(body).toMatch(/COALESCE\(b\.payment_lease_until > now\(\), false\)/)
    expect(body).toMatch(/ON CONFLICT \(booking_id, event_key\) DO NOTHING/)
    expect(body).toMatch(/v_patch \? 'payment_intent_id' AND p_to NOT IN \('captured', 'balance_due'\)/)
  })

  it('is SECURITY DEFINER with an empty search_path and re-revokes PUBLIC / anon / authenticated', () => {
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toContain("SET search_path = ''")
    expect(m087).toContain(`REVOKE EXECUTE ON FUNCTION public.apply_payment_transition(${SIG6}) FROM PUBLIC, anon, authenticated;`)
    expect(m087).toContain(`GRANT EXECUTE ON FUNCTION public.apply_payment_transition(${SIG6}) TO service_role;`)
    expect(m087).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_payment_transition[^;]*TO (PUBLIC|anon|authenticated)/)
  })

  it('does not drop the function (the signature is unchanged, the 086 grants stay)', () => {
    expect(m087).not.toMatch(/DROP FUNCTION[^;]*apply_payment_transition/)
  })

  it('leaves claim_due_payment_work alone (its card_hold filter is the no-hold-on-cash guarantee)', () => {
    expect(m087).not.toContain('claim_due_payment_work')
  })
})

describe('087 pricing_globals policy settings (UI-SPEC 7.1 bounds)', () => {
  it.each([
    ['cancel_free_km_threshold', 100, 'BETWEEN 1 AND 1000'],
    ['cancel_free_hours_short', 1, 'BETWEEN 0 AND 72'],
    ['cancel_free_hours_long', 12, 'BETWEEN 0 AND 72'],
    ['cancel_free_hours_hourly', 12, 'BETWEEN 0 AND 72'],
    ['cancel_fee_percent', 100, 'BETWEEN 1 AND 100'],
  ])('%s defaults to %i and is bounded %s', (col, def, bounds) => {
    const re = new RegExp(
      `ADD COLUMN IF NOT EXISTS ${col} integer NOT NULL DEFAULT ${def}\\s+CONSTRAINT pricing_globals_${col}_range\\s+CHECK \\(${col} ${bounds}\\)`,
    )
    expect(m087).toMatch(re)
  })

  it('a long trip never gets a shorter free window than a short one', () => {
    expect(m087).toMatch(
      /pricing_globals_cancel_free_hours_order\s+CHECK \(cancel_free_hours_long >= cancel_free_hours_short\)/,
    )
  })

  it('card_flow_mode allows off, canary and on, and the stored value is not touched', () => {
    expect(latestCheckValues('pricing_globals_card_flow_mode_check', 'card_flow_mode').sort()).toEqual(
      ['canary', 'off', 'on'],
    )
    expect(m087).not.toMatch(/UPDATE public\.pricing_globals/)
    expect(m087).not.toMatch(/SET card_flow_mode/)
  })
})

describe('087 bookings snapshot columns', () => {
  it('adds the policy snapshot and the status mirror, all nullable', () => {
    expect(m087).toMatch(/ADD COLUMN IF NOT EXISTS cancel_policy_version text,/)
    expect(m087).toMatch(/ADD COLUMN IF NOT EXISTS cancel_policy\s+jsonb,/)
    expect(m087).toMatch(/ADD COLUMN IF NOT EXISTS fee_case_status\s+text;/)
    expect(m087).toMatch(/cancel_policy_version IS NULL OR char_length\(cancel_policy_version\) <= 40/)
    expect(m087).toMatch(/fee_case_status IS NULL OR fee_case_status IN \('pending', 'charged', 'waived'\)/)
    expect(m087).toMatch(/CREATE INDEX IF NOT EXISTS bookings_fee_case_pending_idx[\s\S]*?WHERE fee_case_status = 'pending'/)
  })

  it('keeps fee amounts, notes and tokens out of bookings (Pitfall 11)', () => {
    const alter = m087.slice(m087.indexOf('ALTER TABLE public.bookings\n  ADD COLUMN IF NOT EXISTS cancel_policy_version'))
    const block = alter.slice(0, alter.indexOf(';'))
    expect(block).not.toMatch(/token|note|amount|minor|reason/i)
  })
})

describe('087 new tables', () => {
  const tables = ['booking_fee_cases', 'booking_manage_tokens', 'booking_payment_notes']

  it.each(tables)('%s is deny-all: REVOKE ALL, RLS on, select and insert policies false', (t) => {
    expect(m087).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`)
    expect(m087).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated;`)
    expect(m087).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)
    expect(m087).toMatch(new RegExp(`CREATE POLICY ${t}_no_public_read\\s+ON public\\.${t} FOR SELECT\\s+USING \\(false\\)`))
    expect(m087).toMatch(new RegExp(`CREATE POLICY ${t}_no_public_insert\\s+ON public\\.${t} FOR INSERT\\s+WITH CHECK \\(false\\)`))
  })

  it('booking_fee_cases: one case per booking, kind, status, amounts bounded by the base', () => {
    expect(m087).toMatch(/booking_id\s+uuid\s+NOT NULL UNIQUE REFERENCES public\.bookings\(id\) ON DELETE CASCADE/)
    expect(m087).toMatch(/kind\s+text\s+NOT NULL CHECK \(kind IN \('late_cancel', 'no_show'\)\)/)
    expect(m087).toMatch(/status\s+text\s+NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'charged', 'waived'\)\)/)
    expect(m087).toMatch(/proposed_minor\s+bigint\s+NOT NULL CHECK \(proposed_minor > 0 AND proposed_minor <= base_minor\)/)
    expect(m087).toMatch(/decided_minor IS NULL OR \(decided_minor > 0 AND decided_minor <= base_minor\)/)
    expect(m087).toMatch(/currency\s+text\s+NOT NULL CHECK \(currency IN \('eur', 'czk'\)\)/)
  })

  it('booking_manage_tokens: a 43 character url-safe token, unique', () => {
    expect(m087).toMatch(/token\s+text\s+NOT NULL UNIQUE CHECK \(token ~ '\^\[A-Za-z0-9_-\]\{43\}\$'\)/)
  })

  it('booking_payment_notes: two kinds, note at most 500 characters', () => {
    expect(m087).toMatch(/kind\s+text\s+NOT NULL CHECK \(kind IN \('cash_card_charge', 'cash_reopen'\)\)/)
    expect(m087).toMatch(/note\s+text\s+NOT NULL CHECK \(char_length\(note\) <= 500\)/)
  })
})

describe('087 status mirror trigger', () => {
  const body = latestFunctionBody('booking_fee_cases_sync_status')

  it('copies the case status onto bookings.fee_case_status', () => {
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toContain("SET search_path = ''")
    expect(body).toMatch(/SET fee_case_status = NEW\.status/)
    expect(body).toMatch(/WHERE b\.id = NEW\.booking_id/)
  })

  it('fires after insert or update of status and is not executable by public roles', () => {
    expect(m087).toMatch(
      /CREATE TRIGGER booking_fee_cases_sync_status\s+AFTER INSERT OR UPDATE OF status ON public\.booking_fee_cases\s+FOR EACH ROW/,
    )
    expect(m087).toContain('REVOKE EXECUTE ON FUNCTION public.booking_fee_cases_sync_status() FROM PUBLIC, anon, authenticated;')
  })
})

describe('fake-payments-db mirrors 087', () => {
  const feeCase = (bookingId: string, extra: Record<string, unknown> = {}) => ({
    booking_id: bookingId,
    kind: 'no_show',
    currency: 'eur',
    base_minor: 10000,
    proposed_minor: 10000,
    ...extra,
  })

  it('seeds the five policy settings with the 087 defaults', () => {
    const db = createFakePaymentsDb()
    expect(db.state.pricing_globals[0]).toMatchObject({
      cancel_free_km_threshold: 100,
      cancel_free_hours_short: 1,
      cancel_free_hours_long: 12,
      cancel_free_hours_hourly: 12,
      cancel_fee_percent: 100,
    })
  })

  it('a booking row starts without a policy snapshot or a fee case status', () => {
    const db = createFakePaymentsDb({ bookings: [{}] })
    expect(db.state.bookings[0]).toMatchObject({ cancel_policy_version: null, cancel_policy: null, fee_case_status: null })
  })

  it('mirrors a case status into bookings.fee_case_status on insert and on update, like the trigger', async () => {
    const db = createFakePaymentsDb({ bookings: [{}] })
    const id = db.state.bookings[0].id as string

    const ins = await db.client.from('booking_fee_cases').insert(feeCase(id))
    expect(ins.error).toBeNull()
    expect(db.state.bookings[0].fee_case_status).toBe('pending')

    const upd = await db.client.from('booking_fee_cases').update({ status: 'charged', decided_minor: 10000 }).eq('booking_id', id)
    expect(upd.error).toBeNull()
    expect(db.state.bookings[0].fee_case_status).toBe('charged')

    await db.client.from('booking_fee_cases').update({ status: 'waived' }).eq('booking_id', id)
    expect(db.state.bookings[0].fee_case_status).toBe('waived')
  })

  it('enforces one case per booking and the amount CHECKs', async () => {
    const db = createFakePaymentsDb({ bookings: [{}] })
    const id = db.state.bookings[0].id as string
    expect((await db.client.from('booking_fee_cases').insert(feeCase(id))).error).toBeNull()
    expect((await db.client.from('booking_fee_cases').insert(feeCase(id))).error?.code).toBe('23505')

    const other = createFakePaymentsDb({ bookings: [{}] })
    const oid = other.state.bookings[0].id as string
    expect((await other.client.from('booking_fee_cases').insert(feeCase(oid, { proposed_minor: 10001 }))).error?.code).toBe('23514')
    expect((await other.client.from('booking_fee_cases').insert(feeCase(oid, { kind: 'weather' }))).error?.code).toBe('23514')
    expect(other.state.booking_fee_cases).toHaveLength(0)
    expect(other.state.bookings[0].fee_case_status).toBeNull()
  })

  it('stores a manage token only when it is 43 url-safe characters', async () => {
    const db = createFakePaymentsDb({ bookings: [{}] })
    const id = db.state.bookings[0].id as string
    expect((await db.client.from('booking_manage_tokens').insert({ booking_id: id, token: 'short' })).error?.code).toBe('23514')
    const token = 'A'.repeat(43)
    expect((await db.client.from('booking_manage_tokens').insert({ booking_id: id, token })).error).toBeNull()
    expect(db.state.booking_manage_tokens[0]).toMatchObject({ booking_id: id, token, revoked_at: null })
  })

  it('stores payment notes of the two kinds and refuses an unknown kind', async () => {
    const db = createFakePaymentsDb({ bookings: [{}] })
    const id = db.state.bookings[0].id as string
    expect((await db.client.from('booking_payment_notes').insert({ booking_id: id, kind: 'cash_reopen', note: 'driver was not paid' })).error).toBeNull()
    expect((await db.client.from('booking_payment_notes').insert({ booking_id: id, kind: 'other', note: 'x' })).error?.code).toBe('23514')
    expect(db.state.booking_payment_notes).toHaveLength(1)
  })

  it('moves a cash booking through cash_settled and back with a ledger row each (tracer, fake DB)', async () => {
    const db = createFakePaymentsDb({ bookings: [{ payment_mode: 'cash_guarantee', payment_state: 'card_saved' }] })
    const id = db.state.bookings[0].id as string
    const ev = (key: string, kind: string) => ({ key, kind, actor_type: 'admin', actor_id: 'op' })
    const a = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id, p_from: ['card_saved'], p_to: 'cash_settled', p_patch: {}, p_event: ev('k1', 'cash_settled'),
    })
    expect(a.data).toMatchObject({ applied: true })
    const b = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id, p_from: ['cash_settled'], p_to: 'card_saved', p_patch: {}, p_event: ev('k2', 'cash_reopened'),
    })
    expect(b.data).toMatchObject({ applied: true })
    expect(db.state.booking_payment_events).toHaveLength(2)
  })
})
