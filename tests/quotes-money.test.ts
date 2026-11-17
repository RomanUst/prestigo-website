// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  QUOTE_MIN_CHARGE_MINOR,
  allocateDeposit,
  bookingModeFor,
  depositMinorFor,
  lineMajorAmounts,
  remainderDueMinor,
  validateVersionMoney,
} from '@/lib/quotes/money'
import { eurToCzk } from '@/lib/currency'

/**
 * Phase 92 plan 92-02 (QUOTE-03, QUOTE-04; D-07, D-12, D-15, Pitfall 11, T-92-07): deposit, allocation, floors and
 * the remainder-to-booking-mode table, all in integer minor units.
 */

describe('depositMinorFor (D-07)', () => {
  it('computes a percent of the total, rounded to the cent', () => {
    expect(depositMinorFor('percent', 30, 100001)).toBe(30000)
    expect(depositMinorFor('percent', 100, 5000)).toBe(5000)
  })

  it('takes a fixed amount as is', () => {
    expect(depositMinorFor('fixed', 2500, 10000)).toBe(2500)
    expect(depositMinorFor('fixed', 10000, 10000)).toBe(10000)
  })

  it('refuses zero, negative, above-total and out-of-range values', () => {
    expect(depositMinorFor('fixed', 0, 10000)).toBeNull()
    expect(depositMinorFor('fixed', 10001, 10000)).toBeNull()
    expect(depositMinorFor('percent', 0, 10000)).toBeNull()
    expect(depositMinorFor('percent', 101, 10000)).toBeNull()
    expect(depositMinorFor('percent', -5, 10000)).toBeNull()
    expect(depositMinorFor('fixed', -1, 10000)).toBeNull()
  })

  it('refuses non-integer fixed amounts, non-finite numbers and an empty total', () => {
    expect(depositMinorFor('fixed', 25.5, 10000)).toBeNull()
    expect(depositMinorFor('fixed', Number.NaN, 10000)).toBeNull()
    expect(depositMinorFor('percent', 30, 0)).toBeNull()
  })

  it('never returns 0 for a tiny percent of a tiny total', () => {
    expect(depositMinorFor('percent', 1, 10)).toBeNull()
  })
})

describe('allocateDeposit (D-12)', () => {
  it('sums to the deposit exactly and no share exceeds its line', () => {
    const lines = [10000, 20000, 30001]
    const shares = allocateDeposit(lines, 18000)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(18000)
    shares.forEach((s, i) => expect(s).toBeLessThanOrEqual(lines[i]))
  })

  it('gives rounding remainders to the largest fractions, ties to the lower position', () => {
    // three equal lines, deposit 100: exact 33.33 each, one extra cent goes to the first.
    expect(allocateDeposit([100, 100, 100], 100)).toEqual([34, 33, 33])
    expect(allocateDeposit([100, 100, 100], 101)).toEqual([34, 34, 33])
  })

  it('a deposit equal to the total gives every line its full amount', () => {
    expect(allocateDeposit([100], 100)).toEqual([100])
    expect(allocateDeposit([5000, 7000], 12000)).toEqual([5000, 7000])
  })

  it('works for one line and for 20 lines with an awkward deposit', () => {
    const many = Array.from({ length: 20 }, (_, i) => 10001 + i * 37)
    const total = many.reduce((a, b) => a + b, 0)
    const deposit = Math.round(total * 0.3) + 1
    const shares = allocateDeposit(many, deposit)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(deposit)
    shares.forEach((s, i) => {
      expect(s).toBeLessThanOrEqual(many[i])
      expect(s).toBeGreaterThanOrEqual(0)
    })
  })

  it('returns an empty list for no lines', () => {
    expect(allocateDeposit([], 100)).toEqual([])
  })
})

describe('validateVersionMoney (Pitfall 11)', () => {
  const ok = { currency: 'eur' as const, remainderMethod: 'saved_card' as const }

  it('refuses no lines', () => {
    expect(validateVersionMoney({ ...ok, lineAmounts: [], depositMinor: 1000 })).toEqual({ ok: false, reason: 'no_lines' })
  })

  it('refuses a line amount that is not a positive integer', () => {
    expect(validateVersionMoney({ ...ok, lineAmounts: [0], depositMinor: 1000 })).toEqual({ ok: false, reason: 'amount_invalid' })
    expect(validateVersionMoney({ ...ok, lineAmounts: [100.5], depositMinor: 1000 })).toEqual({ ok: false, reason: 'amount_invalid' })
  })

  it('refuses a zero deposit and a deposit above the total', () => {
    expect(validateVersionMoney({ ...ok, lineAmounts: [10000], depositMinor: 0 })).toEqual({ ok: false, reason: 'deposit_zero' })
    expect(validateVersionMoney({ ...ok, lineAmounts: [10000], depositMinor: 10001 })).toEqual({ ok: false, reason: 'deposit_above_total' })
  })

  it('refuses a deposit below the Stripe minimum: 40 eur minor, 1000 czk minor', () => {
    expect(validateVersionMoney({ ...ok, lineAmounts: [10000], depositMinor: 40 })).toEqual({ ok: false, reason: 'deposit_below_minimum' })
    expect(
      validateVersionMoney({ currency: 'czk', remainderMethod: 'saved_card', lineAmounts: [500000], depositMinor: 1000 }),
    ).toEqual({ ok: false, reason: 'deposit_below_minimum' })
  })

  it('accepts a deposit at the minimum', () => {
    expect(QUOTE_MIN_CHARGE_MINOR).toEqual({ eur: 50, czk: 1500 })
    expect(validateVersionMoney({ ...ok, lineAmounts: [10000], depositMinor: 50 }).ok).toBe(true)
    expect(
      validateVersionMoney({ currency: 'czk', remainderMethod: 'saved_card', lineAmounts: [500000], depositMinor: 1500 }).ok,
    ).toBe(true)
  })

  it('saved_card: a line remainder of 30 eur minor is below the floor', () => {
    // one line, deposit leaves 30 minor
    expect(validateVersionMoney({ ...ok, lineAmounts: [10000], depositMinor: 9970 })).toEqual({
      ok: false,
      reason: 'remainder_below_minimum',
    })
  })

  it('saved_card: a line with remainder 0 is fine (it becomes a quote-mode booking)', () => {
    const full = validateVersionMoney({ ...ok, lineAmounts: [10000, 20000], depositMinor: 30000 })
    expect(full).toEqual({ ok: true, shares: [10000, 20000], remainders: [0, 0] })
  })

  it('cash: each line remainder must meet the floor too', () => {
    expect(
      validateVersionMoney({ currency: 'eur', remainderMethod: 'cash', lineAmounts: [10000], depositMinor: 9970 }),
    ).toEqual({ ok: false, reason: 'remainder_below_minimum' })
  })

  it('payment_link checks the total remainder only', () => {
    // two lines: shares 4985/4985 leave 15/15 each (below floor per line) but total 30 is also below -> refused
    const refused = validateVersionMoney({ currency: 'eur', remainderMethod: 'payment_link', lineAmounts: [5000, 5000], depositMinor: 9970 })
    expect(refused).toEqual({ ok: false, reason: 'remainder_below_minimum' })
    // per-line remainders 30/30 are below the floor, total 60 is above: accepted for a payment link
    const accepted = validateVersionMoney({ currency: 'eur', remainderMethod: 'payment_link', lineAmounts: [5000, 5000], depositMinor: 9940 })
    expect(accepted.ok).toBe(true)
  })

  it('invoice has no remainder floor', () => {
    const res = validateVersionMoney({ currency: 'eur', remainderMethod: 'invoice', lineAmounts: [10000], depositMinor: 9990 })
    expect(res).toEqual({ ok: true, shares: [9990], remainders: [10] })
  })

  it('a 100% deposit is ok with all remainders 0, for every method', () => {
    for (const remainderMethod of ['saved_card', 'payment_link', 'cash', 'invoice'] as const) {
      expect(validateVersionMoney({ currency: 'eur', remainderMethod, lineAmounts: [10000, 5000], depositMinor: 15000 })).toEqual({
        ok: true,
        shares: [10000, 5000],
        remainders: [0, 0],
      })
    }
  })

  it('returns shares that sum to the deposit and remainders that complete each line', () => {
    const res = validateVersionMoney({ ...ok, lineAmounts: [10000, 20000, 30001], depositMinor: 18000 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.shares.reduce((a, b) => a + b, 0)).toBe(18000)
    res.remainders.forEach((r, i) => expect(r + res.shares[i]).toBe([10000, 20000, 30001][i]))
  })
})

describe('bookingModeFor (D-15)', () => {
  it('maps the remainder method to the booking mode', () => {
    expect(bookingModeFor('saved_card', 5000)).toBe('card_hold')
    expect(bookingModeFor('cash', 5000)).toBe('cash_guarantee')
    expect(bookingModeFor('payment_link', 5000)).toBe('quote')
    expect(bookingModeFor('invoice', 5000)).toBe('quote')
  })

  it('a line with nothing left to collect is a quote-mode booking', () => {
    expect(bookingModeFor('saved_card', 0)).toBe('quote')
    expect(bookingModeFor('cash', 0)).toBe('quote')
    expect(bookingModeFor('payment_link', 0)).toBe('quote')
  })
})

describe('lineMajorAmounts', () => {
  it('converts eur minor to euros to the cent and crowns whole', () => {
    expect(lineMajorAmounts(12345, 'eur')).toEqual({ amountEur: 123.45, amountCzk: eurToCzk(123.45) })
  })

  it('converts czk minor to whole crowns and euros', () => {
    expect(lineMajorAmounts(250000, 'czk')).toEqual({ amountCzk: 2500, amountEur: 100 })
  })
})

describe('remainderDueMinor', () => {
  const lines = [
    { id: 'l1', remainder_minor: 1000 },
    { id: 'l2', remainder_minor: 2000 },
    { id: 'l3', remainder_minor: 4000 },
    { id: 'l4', remainder_minor: null },
  ]

  it('counts only quote-mode, not cancelled, unpaid bookings', () => {
    const bookings = [
      { quote_line_id: 'l1', status: 'confirmed', paid_at: null, payment_mode: 'quote' },
      { quote_line_id: 'l2', status: 'cancelled', paid_at: null, payment_mode: 'quote' },
      { quote_line_id: 'l3', status: 'confirmed', paid_at: '2027-04-01T00:00:00Z', payment_mode: 'quote' },
      { quote_line_id: 'l4', status: 'confirmed', paid_at: null, payment_mode: 'quote' },
    ]
    expect(remainderDueMinor(lines, bookings)).toBe(1000)
  })

  it('ignores card_hold and cash_guarantee bookings and unknown lines', () => {
    const bookings = [
      { quote_line_id: 'l1', status: 'confirmed', paid_at: null, payment_mode: 'card_hold' },
      { quote_line_id: 'l2', status: 'confirmed', paid_at: null, payment_mode: 'cash_guarantee' },
      { quote_line_id: 'zzz', status: 'confirmed', paid_at: null, payment_mode: 'quote' },
      { quote_line_id: null, status: 'confirmed', paid_at: null, payment_mode: 'quote' },
    ]
    expect(remainderDueMinor(lines, bookings)).toBe(0)
  })

  it('sums several open quote-mode lines', () => {
    const bookings = [
      { quote_line_id: 'l1', status: 'confirmed', paid_at: null, payment_mode: 'quote' },
      { quote_line_id: 'l2', status: 'confirmed', paid_at: null, payment_mode: 'quote' },
    ]
    expect(remainderDueMinor(lines, bookings)).toBe(3000)
  })
})
