/**
 * lib/payments/consent.ts — server-side consent text and its SHA-256
 * (Phase 88-03, HOLD-01, D-12).
 *
 * buildConsentText renders the same catalog key with the same variables the
 * checkout uses (lib/payments/consent-text.ts), through next-intl's
 * createTranslator over the locale's committed catalog. consentSha256 hashes
 * the UTF-8 bytes of the NFC-normalised text, so the same inputs always give
 * the same text and the same hash.
 */
import crypto from 'node:crypto'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { normalizeSiteLocale } from '@/i18n/locales'
import { loadMessages } from '@/lib/payments/emails/render'
import { consentMessageKey, consentVars, type ConsentMode } from '@/lib/payments/consent-text'
import type { PaymentCurrency } from '@/lib/payments/money'

function hasCardOnFile(messages: AbstractIntlMessages): boolean {
  const booking = (messages as Record<string, unknown>).Booking as Record<string, unknown> | undefined
  const step6 = booking?.step6 as Record<string, unknown> | undefined
  return Boolean(step6?.cardOnFile)
}

export async function buildConsentText(input: {
  locale: unknown
  mode: ConsentMode
  amountMinor: number
  currency: PaymentCurrency
  holdDateIso: string | null
  /** The booking's free-cancellation moment (epoch ms); named in the text as {freeUntil} (Phase 89-10, D-16). */
  freeUntilMs?: number | null
  /** True when that moment has already passed: the NoFree wording variant is used. */
  freeUntilPassed?: boolean
}): Promise<string> {
  let locale = normalizeSiteLocale(input.locale)
  let messages = await loadMessages(locale)
  if (locale !== 'en' && !hasCardOnFile(messages)) {
    // Catalog without the cardOnFile namespace yet: English, consistently.
    locale = 'en'
    messages = await loadMessages('en')
  }
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Booking.step6.cardOnFile',
    onError: (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error))
    },
  } as never) as unknown as (key: string, values: Record<string, string>) => string
  return t(
    consentMessageKey(input.mode, input.freeUntilPassed === true),
    consentVars({
      amountMinor: input.amountMinor,
      currency: input.currency,
      holdDateIso: input.holdDateIso,
      locale,
      freeUntilMs: input.freeUntilMs ?? null,
    }),
  )
}

/** Lowercase hex SHA-256 of the UTF-8 bytes of the NFC-normalised text. */
export function consentSha256(text: string): string {
  return crypto.createHash('sha256').update(Buffer.from(text.normalize('NFC'), 'utf8')).digest('hex')
}
