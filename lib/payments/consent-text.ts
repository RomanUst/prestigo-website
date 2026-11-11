/**
 * lib/payments/consent-text.ts — client-safe pieces of the card-on-file
 * consent text (Phase 88-03, HOLD-01, D-12; final wording Phase 89-10, D-10, D-16).
 *
 * The checkout renders the consent label from the catalog key and variables
 * defined here; the server renders the SAME key with the SAME variables
 * (lib/payments/consent.ts) and hashes the result, so the string the client
 * ticked and the string stored per booking cannot diverge (Research Pitfall 9).
 *
 * No node imports: this module is bundled into the browser.
 */
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

/**
 * Version of the authorisation wording. ANY change to a consent catalog string
 * (Booking.step6.cardOnFile.consentSetup / consentHoldNow / consentCash and their
 * *NoFree variants, any locale) must bump this constant; tests/payments-consent.test.ts
 * pins the EN strings to it. The version is stored with every consent record and the
 * stored text of an older booking never changes (D-16: the owner decided to go without
 * a lawyer review and accepts that risk).
 *
 * The rendered text also carries the Prague time-zone label that formatLocaleDateTime appends to the free-until moment
 * (lib/locale-date.ts PRAGUE_TIME_LABEL): a change to a label is a change to the consent text and bumps this version too.
 * 2026-11-2: the deadline is labelled "(Prague time)" in the stored text (review WR-04).
 * 2026-11-3: extras sentence, Phase 91 D-12 (waiting beyond the booked time and extras agreed during the trip).
 *
 * A version bump that keeps the extras sentence MUST also be added to EXTRAS_CONSENT_VERSIONS below, otherwise
 * new bookings could not be charged an extra (tests/payments-consent.test.ts fails on that).
 */
export const CARD_CONSENT_VERSION = '2026-11-3'

/**
 * Consent versions whose wording authorises a post-trip charge for waiting beyond the booked time and for extras
 * (Phase 91 D-12, T-91-17). The stored consent of an older booking never changes, so a booking stored under any other
 * version cannot be charged an extra.
 */
export const EXTRAS_CONSENT_VERSIONS: ReadonlySet<string> = new Set(['2026-11-3'])

/** True only for a stored consent version in EXTRAS_CONSENT_VERSIONS; false for older, draft, empty or missing versions. */
export function consentCoversExtras(version: string | null | undefined): boolean {
  return typeof version === 'string' && EXTRAS_CONSENT_VERSIONS.has(version)
}

/** setup / hold_now: the card flow (Phase 88). cash_setup: pay cash to the driver, card saved as a guarantee (Phase 89). */
export type ConsentMode = 'setup' | 'hold_now' | 'cash_setup'

export type ConsentMessageKey =
  | 'consentSetup'
  | 'consentSetupNoFree'
  | 'consentHoldNow'
  | 'consentHoldNowNoFree'
  | 'consentCash'
  | 'consentCashNoFree'

/**
 * The catalog key of a consent variant. `freeUntilPassed` is true when the free-cancellation moment of the booking has
 * already passed at checkout (a late booking): the wording then drops "after {freeUntil}".
 */
export function consentMessageKey(mode: ConsentMode, freeUntilPassed = false): ConsentMessageKey {
  if (mode === 'cash_setup') return freeUntilPassed ? 'consentCashNoFree' : 'consentCash'
  if (mode === 'setup') return freeUntilPassed ? 'consentSetupNoFree' : 'consentSetup'
  return freeUntilPassed ? 'consentHoldNowNoFree' : 'consentHoldNow'
}

export function consentVars(input: {
  amountMinor: number
  currency: PaymentCurrency
  holdDateIso: string | null
  locale: string
  /** The booking's free-cancellation moment, epoch ms (Europe/Prague wall clock, 24 h). Absent: an empty string. */
  freeUntilMs?: number | null
}): { amount: string; holdDate: string; freeUntil: string } {
  return {
    amount: formatMinor(input.amountMinor, input.currency),
    holdDate: input.holdDateIso ? formatLocaleDate(input.holdDateIso, input.locale) : '',
    freeUntil:
      typeof input.freeUntilMs === 'number' && Number.isFinite(input.freeUntilMs)
        ? formatLocaleDateTime(input.freeUntilMs, input.locale)
        : '',
  }
}
