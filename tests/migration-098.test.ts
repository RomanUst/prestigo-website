import { describe, it, expect } from 'vitest'
import { latestFunctionBody, loadMigration } from './helpers/latest-migration'

// Migration 098 (a quote without a deposit): the conversion function is the 096 body plus the no-deposit paths, and
// the deposit path is unchanged. Comments are stripped by loadMigration.

const m098 = loadMigration('098_quote_no_deposit.sql')
const m096 = loadMigration('096_quote_tour_lines.sql')
const flat = m098.replace(/\s+/g, ' ')

function bodyIn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const close = sql.indexOf('\n$$;', sql.indexOf('AS $$', start))
  return sql.slice(start, close + 4)
}

describe('098 quote_versions and acceptances', () => {
  it("allows deposit_kind 'none' with no value and a deposit of 0, and only then", () => {
    expect(flat).toContain("CHECK (deposit_kind IS NULL OR deposit_kind IN ('percent', 'fixed', 'none'))")
    expect(flat).toContain("CHECK (deposit_minor IS NULL OR deposit_minor > 0 OR (deposit_kind = 'none' AND deposit_minor = 0))")
    expect(flat).toContain("CHECK (deposit_kind IS DISTINCT FROM 'none' OR (deposit_value IS NULL AND (deposit_minor IS NULL OR deposit_minor = 0)))")
    expect(flat).toContain("AND (deposit_value IS NOT NULL OR deposit_kind = 'none')")
    expect(flat).toContain('quote_acceptances_deposit_minor_check CHECK (deposit_minor >= 0)')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS card_setup_intent_id text')
  })
})

describe('098 quote_convert_to_bookings', () => {
  const body = bodyIn(m098, 'quote_convert_to_bookings')
  const bodyFlat = body.replace(/\s+/g, ' ')

  it('is the live definition', () => {
    expect(latestFunctionBody('quote_convert_to_bookings')).toBe(body)
  })

  it('keeps the deposit path: a quote with a deposit still needs its recorded deposit intent', () => {
    expect(bodyFlat).toContain(
      'IF v_version.deposit_minor > 0 THEN IF p_payment_intent_id IS NULL OR v_quote.deposit_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN',
    )
  })

  it('no deposit with a card: the recorded SetupIntent; without a card: no Stripe object at all', () => {
    expect(bodyFlat).toContain(
      "ELSIF v_version.remainder_method IN ('saved_card', 'cash') THEN IF p_payment_intent_id IS NULL OR v_quote.card_setup_intent_id IS DISTINCT FROM p_payment_intent_id THEN",
    )
    expect(bodyFlat).toContain("ELSE IF p_payment_intent_id IS NOT NULL THEN RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');")
  })

  it('writes no deposit ledger row and no deposit_paid event without a deposit', () => {
    expect(bodyFlat).toMatch(/IF v_version\.deposit_minor > 0 THEN PERFORM public\.append_payment_event\(/)
    expect(bodyFlat).toMatch(/IF v_version\.deposit_minor > 0 THEN INSERT INTO public\.quote_events .*'deposit_paid'/)
  })

  it('keeps every booking column of 096 (the insert is unchanged)', () => {
    const insert = (b: string) => b.slice(b.indexOf('INSERT INTO public.bookings'), b.indexOf('RETURNING id INTO v_booking_id'))
    expect(insert(body)).toBe(insert(bodyIn(m096, 'quote_convert_to_bookings')))
  })

  it('stays SECURITY DEFINER and service_role only after re-creation', () => {
    expect(m098).toContain('SECURITY DEFINER')
    expect(flat).toContain(
      'REVOKE EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;',
    )
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text) TO service_role;')
  })
})
