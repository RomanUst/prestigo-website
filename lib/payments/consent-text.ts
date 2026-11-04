/**
 * lib/payments/consent-text.ts — client-safe pieces of the card-on-file
 * consent text (Phase 88-03, HOLD-01, D-12).
 *
 * The checkout renders the consent label from the catalog key and variables
 * defined here; the server renders the SAME key with the SAME variables
 * (lib/payments/consent.ts) and hashes the result, so the string the client
 * ticked and the string stored per booking cannot diverge (Research Pitfall 9).
 *
 * No node imports: this module is bundled into the browser.
 */
import { formatLocaleDate } from '@/lib/locale-date'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

/**
 * Version of the authorisation wording. ANY change to a consent catalog string
 * (Booking.step6.cardOnFile.consentSetup / consentHoldNow, any locale) must
 * bump this constant; tests/payments-consent.test.ts pins the EN strings to it.
 * Draft wording, pending the Phase 89 legal review.
 */
export const CARD_CONSENT_VERSION = '2026-11-draft-1'

export type ConsentMode = 'setup' | 'hold_now'

export function consentMessageKey(mode: ConsentMode): 'consentSetup' | 'consentHoldNow' {
  return mode === 'setup' ? 'consentSetup' : 'consentHoldNow'
}

export function consentVars(input: {
  amountMinor: number
  currency: PaymentCurrency
  holdDateIso: string | null
  locale: string
}): { amount: string; holdDate: string } {
  return {
    amount: formatMinor(input.amountMinor, input.currency),
    holdDate: input.holdDateIso ? formatLocaleDate(input.holdDateIso, input.locale) : '',
  }
}
