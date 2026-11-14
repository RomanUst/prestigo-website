// The quote email (Phase 92, plan 92-13; QUOTE-07; D-09, D-14).
//
// "Your quote is ready": one total, the deposit, an optional last day, a button with the secret link, and the PDF
// sentence. The client sees one total for the whole quote and the deposit; there is no waiting amount and no line list
// here (the quote page shows the trips). Language = the version's locale (D-09). Amounts are formatted once with
// formatMinor and passed to the catalog as strings; no price is typed anywhere.

import { formatLocaleDate } from '@/lib/locale-date'
import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { html, text } from '@/lib/payments/emails/render'
import { getPragueTodayISO } from '@/lib/prague-date'
import { quoteEmailTranslator, renderQuoteEmailShell } from '@/lib/quotes/emails/shell'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/** A user-supplied word (a name) isolated with its own direction so Arabic and Latin text keep their order. */
const bdiAuto = (value: string): string => `<bdi dir="auto">${escapeHtml(value)}</bdi>`

export async function renderQuoteSentEmail(input: {
  quote: Pick<QuoteRow, 'reference' | 'client_first_name' | 'expires_at'>
  version: Pick<QuoteVersionRow, 'locale' | 'currency' | 'total_minor' | 'deposit_minor'>
  url: string
  /** True when the PDF is attached; false gives the "download it on the quote page" sentence instead (D-14). */
  pdfAttached: boolean
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  const tr = await quoteEmailTranslator(version.locale)
  const { t, locale } = tr

  if (version.deposit_minor === null) throw new Error('renderQuoteSentEmail: the version has no deposit')
  const total = formatMinor(Number(version.total_minor), version.currency)
  const deposit = formatMinor(Number(version.deposit_minor), version.currency)

  const subject = text(t, 'sent.subject', { reference: quote.reference })

  // The operator's last day (D-02), shown as a Prague calendar date in the client's language.
  let validUntil = ''
  let pragueTime = ''
  if (quote.expires_at && Number.isFinite(Date.parse(quote.expires_at))) {
    const date = formatLocaleDate(getPragueTodayISO(new Date(quote.expires_at)), locale)
    validUntil = html(t, 'sent.validUntil', {}, { date: bdiAuto(date) })
    pragueTime = html(t, 'common.pragueTime')
  }

  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'sent.h1'),
    paragraphs: [html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }), html(t, 'sent.intro')],
    reference: quote.reference,
    lines: [
      html(t, 'sent.total', { amount: total }),
      html(t, 'sent.deposit', { amount: deposit }),
      ...(validUntil ? [validUntil] : []),
    ],
    button: { label: t('common.openQuote'), url: input.url },
    footnotes: [input.pdfAttached ? html(t, 'sent.pdfAttached') : html(t, 'sent.pdfLink'), pragueTime],
  })

  return { subject, html: body }
}
