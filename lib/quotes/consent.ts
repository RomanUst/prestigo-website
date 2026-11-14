// The consent and terms text of a quote acceptance (Phase 92, plan 92-16; QUOTE-05; D-03, D-08, D-21, D-22).
//
// renderQuoteTerms builds, on the SERVER, the exact text the client agrees to when they accept a quote: the consent
// sentence of the quote's remainder method (Quote.consent.<method>, D-21 / D-22), the remainder sentence it refers to
// ("as described above"), and the cancellation terms as the quote page shows them (free / noFree, lateAll /
// latePercent, cap). It is rendered in the locale of the quote version from the committed catalog, and the SHA-256 of
// that text is stored next to it in quote_acceptances, so the log proves what was shown. A client-supplied text is
// never stored: the accept request carries no text at all.
//
// A change to the wording of any Quote.consent.* key (any locale) must bump QUOTE_CONSENT_VERSION
// (lib/payments/consent-text.ts).
//
// Server only (it imports node:crypto through the payments consent module). No logging.

import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { normalizeSiteLocale } from '@/i18n/locales'
import { formatLocaleDateTime } from '@/lib/locale-date'
import { consentSha256 } from '@/lib/payments/consent'
import { QUOTE_CONSENT_VERSION } from '@/lib/payments/consent-text'
import { loadMessages } from '@/lib/payments/emails/render'
import { formatMinor } from '@/lib/payments/money'
import { firstPickupMs } from '@/lib/quotes/status'
import { quoteFreeUntilMs, termsFromSnapshot } from '@/lib/quotes/terms'
import type { ResolvedQuote } from '@/lib/quotes/resolve'

type Translate = (key: string, values?: Record<string, string | number>) => string

/** The same left-to-right isolates the quote page puts around dates, references and amounts (plain-text form of bdi). */
const ltr = (value: string | number): string => `⁦${value}⁩`

export interface RenderedQuoteTerms {
  text: string
  sha256: string
  version: string
}

export async function renderQuoteTerms(input: { resolved: ResolvedQuote; nowMs: number }): Promise<RenderedQuoteTerms> {
  const { quote, version } = input.resolved
  const locale = normalizeSiteLocale(version.locale)
  const messages: AbstractIntlMessages = await loadMessages(locale)
  const t = createTranslator({
    locale,
    messages,
    namespace: 'Quote',
    // A missing key or a placeholder mismatch is a bug, never a silently shorter consent: fail the accept.
    onError: (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error))
    },
  } as never) as unknown as Translate

  const method = version.remainder_method ?? 'saved_card'
  const depositMinor = version.deposit_minor ?? 0

  const { freeHours, feePercent } = termsFromSnapshot(version.cancel_policy)
  const first = firstPickupMs(input.resolved.lines)
  const freeUntilMs = first === null ? null : quoteFreeUntilMs(first, freeHours)
  // Same rule as buildQuoteView: no readable pickup, or a passed deadline, means the "no longer free" wording.
  const freePassed = freeUntilMs === null ? true : input.nowMs > freeUntilMs
  const freeUntil = freeUntilMs === null ? '' : formatLocaleDateTime(freeUntilMs, locale)
  const showFree = !freePassed && freeUntil !== ''

  const lines = [
    t(`consent.${method}`, {
      reference: ltr(quote.reference),
      version: ltr(version.version_no),
      deposit: ltr(formatMinor(depositMinor, version.currency)),
    }),
    t(`remainder.${method}`),
    showFree ? t('terms.free', { freeUntil: ltr(freeUntil) }) : t('terms.noFree'),
    feePercent >= 100 ? t('terms.lateAll') : t('terms.latePercent', { percent: feePercent }),
    t('terms.cap'),
  ]

  const text = lines.join('\n')
  return { text, sha256: consentSha256(text), version: QUOTE_CONSENT_VERSION }
}
