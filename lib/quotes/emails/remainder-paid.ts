// The receipt of a remainder paid on the quote page (Phase 92, plan 92-23; QUOTE-04; D-16).
//
// "We received your payment of <amount>. Your trips are fully paid." One greeting, one sentence, the quote reference.
// Language = the quote version's locale (D-09). The amount is formatted once with formatMinor and handed to the catalog
// as a string; no price is typed here and there is no waiting amount.

import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { html, text } from '@/lib/payments/emails/render'
import { quoteEmailTranslator, renderQuoteEmailShell } from '@/lib/quotes/emails/shell'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/** A user-supplied word (a name) isolated with its own direction so Arabic and Latin text keep their order. */
const bdiAuto = (value: string): string => `<bdi dir="auto">${escapeHtml(value)}</bdi>`

export async function renderQuoteRemainderPaidEmail(input: {
  quote: Pick<QuoteRow, 'reference' | 'client_first_name'>
  version: Pick<QuoteVersionRow, 'locale' | 'currency'>
  /** What was paid, in minor units of the quote currency. */
  amountMinor: number
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('renderQuoteRemainderPaidEmail: the amount paid must be a positive integer')
  }
  const tr = await quoteEmailTranslator(version.locale)
  const { t } = tr

  const amount = formatMinor(input.amountMinor, version.currency)
  const subject = text(t, 'remainderPaid.subject', { reference: quote.reference })

  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'remainderPaid.h1'),
    paragraphs: [
      html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }),
      html(t, 'remainderPaid.intro', { amount }),
    ],
    reference: quote.reference,
  })

  return { subject, html: body }
}
