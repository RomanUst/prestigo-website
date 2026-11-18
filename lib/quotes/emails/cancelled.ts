// The cancellation and refund emails of a quote (Phase 92, plan 92-22; QUOTE-04; D-11, D-12).
//
// ONE email per quote cancellation (the trips are cancelled with suppressClientEmail), in the language of the version the
// client accepted, through the shared quote shell. Copy comes from QuoteEmails (92-29): `cancelled.*` and `refunded.*`.
// Amounts are formatted once with formatMinor and passed to the catalog as strings; no price is typed here and there is
// no waiting amount. The refund sentence appears only when money is being returned, the kept sentence only when part of
// the deposit stays with Prestigo (D-11), so a failed refund never promises money (the caller passes refundMinor 0).

import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { html, text } from '@/lib/payments/emails/render'
import { quoteEmailTranslator, renderQuoteEmailShell } from '@/lib/quotes/emails/shell'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/** A user-supplied word (a name) isolated with its own direction so Arabic and Latin text keep their order. */
const bdiAuto = (value: string): string => `<bdi dir="auto">${escapeHtml(value)}</bdi>`

type QuoteFacts = Pick<QuoteRow, 'reference' | 'client_first_name'>
type VersionFacts = Pick<QuoteVersionRow, 'locale' | 'currency'>

export async function renderQuoteCancelledEmail(input: {
  quote: QuoteFacts
  version: VersionFacts
  initiator: 'admin_client' | 'admin_prestigo'
  /** Money returned to the client by this cancellation (deposit part plus a remainder paid on the page). 0 = none. */
  refundMinor: number
  /** The part of the deposit that stays with Prestigo under the terms. 0 = nothing kept. */
  keptMinor: number
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  const tr = await quoteEmailTranslator(version.locale)
  const { t } = tr

  const subject = text(t, 'cancelled.subject', { reference: quote.reference })
  const lines: string[] = []
  if (input.refundMinor > 0) lines.push(html(t, 'cancelled.refund', { amount: formatMinor(input.refundMinor, version.currency) }))
  if (input.keptMinor > 0) lines.push(html(t, 'cancelled.kept', { amount: formatMinor(input.keptMinor, version.currency) }))

  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'cancelled.h1'),
    paragraphs: [
      html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }),
      html(t, input.initiator === 'admin_prestigo' ? 'cancelled.introPrestigo' : 'cancelled.introClient', { reference: quote.reference }),
    ],
    reference: quote.reference,
    lines,
    footnotes: [html(t, 'cancelled.nothingCharged')],
  })
  return { subject, html: body }
}

export async function renderQuoteRefundedEmail(input: {
  quote: QuoteFacts
  version: VersionFacts
  amountMinor: number
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  const tr = await quoteEmailTranslator(version.locale)
  const { t } = tr

  const subject = text(t, 'refunded.subject', { reference: quote.reference })
  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'refunded.h1'),
    paragraphs: [
      html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }),
      html(t, 'refunded.intro', { amount: formatMinor(input.amountMinor, version.currency) }),
    ],
    reference: quote.reference,
  })
  return { subject, html: body }
}
