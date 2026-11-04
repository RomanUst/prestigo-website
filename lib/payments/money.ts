/**
 * lib/payments/money.ts — integer minor units to display strings (Phase 88-03).
 *
 * Client-safe: imports only lib/currency (no node modules), so the checkout
 * consent text and the server-side hashed consent text render the same amount.
 *
 * Whole units (amountMinor divisible by 100) go through formatEUR / formatCZK
 * unchanged; any other amount keeps the same symbol and placement with a
 * two-decimal value. No amount is ever typed in a message catalog.
 */
import { formatCZK, formatEUR } from '@/lib/currency'

export type PaymentCurrency = 'eur' | 'czk'

export function formatMinor(amountMinor: number, currency: PaymentCurrency): string {
  const minor = Math.round(amountMinor)
  const major = minor / 100
  if (minor % 100 === 0) {
    return currency === 'czk' ? formatCZK(major) : formatEUR(major)
  }
  // Reuse the helpers' own symbol and placement by formatting 0 and swapping
  // the digit for the two-decimal value.
  if (currency === 'czk') {
    const fixed = major.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return formatCZK(0).replace('0', fixed)
  }
  return formatEUR(0).replace('0', major.toFixed(2))
}
