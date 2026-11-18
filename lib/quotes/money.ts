// Quote money rules (Phase 92, plan 92-02; QUOTE-03, QUOTE-04; D-07, D-12, D-15, Pitfall 11, T-92-07).
//
// Deposit maths, the proportional allocation over the trips, the Stripe floors and the table that turns a line's
// remainder into a booking payment mode. Integer minor units throughout; the only float step is the proportional
// share inside allocateDeposit. Pure and client-safe.

import { CZK_TO_EUR_RATE, EUR_TO_CZK_RATE } from '@/lib/currency'
import type { DepositKind, QuoteCurrency, RemainderMethod } from '@/lib/quotes/vocabulary'

/** Smallest amount Stripe charges, per currency, in minor units (50 cents, 15 CZK). */
export const QUOTE_MIN_CHARGE_MINOR: Record<QuoteCurrency, number> = { eur: 50, czk: 1500 }

/**
 * The deposit in minor units, or null when it is not a valid one (D-07: there is no default deposit, the operator
 * always chooses). A percent is 1..100 and is rounded to the cent; a fixed amount is a whole number of minor units.
 * Never 0, never more than the total.
 */
export function depositMinorFor(kind: DepositKind, value: number, totalMinor: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(totalMinor) || totalMinor <= 0) return null
  let deposit: number
  if (kind === 'percent') {
    if (value < 1 || value > 100) return null
    deposit = Math.round((totalMinor * value) / 100)
  } else {
    if (!Number.isInteger(value) || value <= 0) return null
    deposit = value
  }
  if (deposit <= 0 || deposit > totalMinor) return null
  return deposit
}

/**
 * Spreads the deposit over the lines in proportion to their amounts (D-12, research A3) with largest-remainder
 * rounding: the shares sum to the deposit exactly, no share exceeds its line, ties go to the lower position.
 */
export function allocateDeposit(lineAmounts: readonly number[], depositMinor: number): number[] {
  const total = lineAmounts.reduce((a, b) => a + b, 0)
  if (lineAmounts.length === 0 || total <= 0) return lineAmounts.map(() => 0)
  const exact = lineAmounts.map((amount) => (amount * depositMinor) / total)
  const shares = exact.map(Math.floor)
  let left = depositMinor - shares.reduce((a, b) => a + b, 0)
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  // More than one pass is only needed when a capped line could not take its extra unit.
  while (left > 0) {
    let placed = false
    for (const { index } of order) {
      if (left === 0) break
      if (shares[index] < lineAmounts[index]) {
        shares[index] += 1
        left -= 1
        placed = true
      }
    }
    if (!placed) break
  }
  return shares
}

export type VersionMoneyRefusal =
  | 'no_lines'
  | 'amount_invalid'
  | 'deposit_zero'
  | 'deposit_above_total'
  | 'deposit_below_minimum'
  | 'remainder_below_minimum'

/**
 * Checked when a version is frozen. The deposit and every remainder that will be charged by card or collected in
 * cash must reach the Stripe minimum (Pitfall 11); a remainder of exactly 0 is fine (the line becomes a quote-mode
 * booking). A payment link charges the total remainder once, so only the total is checked; an invoice has no floor.
 */
export function validateVersionMoney(input: {
  currency: QuoteCurrency
  remainderMethod: RemainderMethod
  lineAmounts: number[]
  depositMinor: number
}): { ok: true; shares: number[]; remainders: number[] } | { ok: false; reason: VersionMoneyRefusal } {
  const { currency, remainderMethod, lineAmounts, depositMinor } = input
  if (lineAmounts.length === 0) return { ok: false, reason: 'no_lines' }
  if (lineAmounts.some((a) => !Number.isInteger(a) || a <= 0)) return { ok: false, reason: 'amount_invalid' }
  if (!Number.isFinite(depositMinor) || depositMinor <= 0) return { ok: false, reason: 'deposit_zero' }
  if (!Number.isInteger(depositMinor)) return { ok: false, reason: 'amount_invalid' }
  const total = lineAmounts.reduce((a, b) => a + b, 0)
  if (depositMinor > total) return { ok: false, reason: 'deposit_above_total' }
  const floor = QUOTE_MIN_CHARGE_MINOR[currency]
  if (depositMinor < floor) return { ok: false, reason: 'deposit_below_minimum' }

  const shares = allocateDeposit(lineAmounts, depositMinor)
  const remainders = lineAmounts.map((amount, i) => amount - shares[i])

  if (remainderMethod === 'saved_card' || remainderMethod === 'cash') {
    if (remainders.some((r) => r > 0 && r < floor)) return { ok: false, reason: 'remainder_below_minimum' }
  } else if (remainderMethod === 'payment_link') {
    const remainderTotal = remainders.reduce((a, b) => a + b, 0)
    if (remainderTotal > 0 && remainderTotal < floor) return { ok: false, reason: 'remainder_below_minimum' }
  }
  return { ok: true, shares, remainders }
}

/**
 * The booking payment mode of one line (D-15): a saved card is held (card_hold), cash is guaranteed by the card
 * on file (cash_guarantee), a payment link or an invoice leaves the booking in plain quote mode. A line with
 * nothing left to collect is always quote mode (a hold or guarantee needs an amount above 0).
 */
export function bookingModeFor(method: RemainderMethod, remainderMinor: number): 'card_hold' | 'cash_guarantee' | 'quote' {
  if (remainderMinor <= 0) return 'quote'
  if (method === 'saved_card') return 'card_hold'
  if (method === 'cash') return 'cash_guarantee'
  return 'quote'
}

/** The bookings.amount_eur / amount_czk pair of a line: euros to the cent, crowns whole. */
export function lineMajorAmounts(amountMinor: number, currency: QuoteCurrency): { amountEur: number; amountCzk: number } {
  if (currency === 'eur') {
    const amountEur = Math.round(amountMinor) / 100
    return { amountEur, amountCzk: Math.round(amountEur * EUR_TO_CZK_RATE) }
  }
  const amountCzk = Math.round(amountMinor / 100)
  return { amountCzk, amountEur: Math.round(amountCzk * CZK_TO_EUR_RATE) }
}

/** Sum of the line remainders whose booking is in quote mode, not cancelled and not yet paid. */
export function remainderDueMinor(
  lines: Array<{ id: string; remainder_minor: number | null }>,
  bookings: Array<{ quote_line_id: string | null; status: string; paid_at: string | null; payment_mode: string }>,
): number {
  const byLine = new Map(lines.map((l) => [l.id, l.remainder_minor ?? 0]))
  let due = 0
  for (const b of bookings) {
    if (!b.quote_line_id || b.payment_mode !== 'quote' || b.status === 'cancelled' || b.paid_at) continue
    due += byLine.get(b.quote_line_id) ?? 0
  }
  return due
}
