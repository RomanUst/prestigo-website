// The remainder request email (Phase 92, plan 92-24; QUOTE-04; D-16, D-22).
//
// "Please pay the remainder of <amount>": one greeting, one sentence with the amount, a button to the quote page where
// the client pays the remainder (plan 92-23), and no waiting amount (there is none on this email). Language = the quote
// version's locale (D-09). The amount is formatted once with formatMinor and handed to the catalog as a string; no
// price is typed here. The link is the one the caller just minted: only its hash is stored, so this email is the only
// place the URL ever appears.

import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { html, text } from '@/lib/payments/emails/render'
import { quoteEmailTranslator, renderQuoteEmailShell } from '@/lib/quotes/emails/shell'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/** A user-supplied word (a name) isolated with its own direction so Arabic and Latin text keep their order. */
const bdiAuto = (value: string): string => `<bdi dir="auto">${escapeHtml(value)}</bdi>`

export async function renderQuoteRemainderDueEmail(input: {
  quote: Pick<QuoteRow, 'reference' | 'client_first_name'>
  version: Pick<QuoteVersionRow, 'locale' | 'currency'>
  /** What is still due, in minor units of the quote currency. */
  amountMinor: number
  url: string
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('renderQuoteRemainderDueEmail: the amount due must be a positive integer')
  }
  const tr = await quoteEmailTranslator(version.locale)
  const { t } = tr

  const amount = formatMinor(input.amountMinor, version.currency)
  const subject = text(t, 'remainderDue.subject', { reference: quote.reference })

  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'remainderDue.h1'),
    paragraphs: [
      html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }),
      html(t, 'remainderDue.intro', { amount }),
    ],
    reference: quote.reference,
    button: { label: t('remainderDue.button'), url: input.url },
  })

  return { subject, html: body }
}
