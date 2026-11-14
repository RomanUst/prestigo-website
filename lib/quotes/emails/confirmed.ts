// The quote confirmation email (Phase 92, plan 92-21; QUOTE-05; D-15, D-21, D-22).
//
// "Your trips are booked": sent once, after the deposit became bookings. One greeting, the deposit received, one line per
// booking (reference, date, time, route) and the remainder sentence of the method. The client sees no waiting amount and
// no per-trip price here; only the saved-card sentence mentions the card (D-21 / D-22). Language = the version's locale
// (D-09). Amounts are formatted once with formatMinor and handed to the catalog as strings; nothing is typed here.
//
// The PDF of the quote is NOT attached to this email (plan 92-20 owns the attachment; it is not part of this plan).

import { formatLocaleDate } from '@/lib/locale-date'
import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { html, text } from '@/lib/payments/emails/render'
import { quoteEmailTranslator, renderQuoteEmailShell } from '@/lib/quotes/emails/shell'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/** A user-supplied word (an address) isolated with its own direction so Arabic and Latin text keep their order. */
const bdiAuto = (value: string): string => `<bdi dir="auto">${escapeHtml(value)}</bdi>`
const bdiLtr = (value: string): string => `<bdi dir="ltr">${escapeHtml(value)}</bdi>`

export interface QuoteConfirmedBooking {
  booking_reference: string
  pickup_date: string
  pickup_time: string
  origin_address: string
  destination_address: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function renderQuoteConfirmedEmail(input: {
  quote: Pick<QuoteRow, 'reference' | 'client_first_name'>
  version: Pick<QuoteVersionRow, 'locale' | 'currency' | 'deposit_minor' | 'remainder_method'>
  bookings: QuoteConfirmedBooking[]
  /**
   * What the client still has to pay, in minor units of the quote currency: the sum of the remainders of the live trips.
   * 0 means the trips are fully paid. Named in the sentence of the payment-link and the invoice methods.
   */
  remainderDueMinor: number
  /** The quote page; when given, the email carries the "open your quote" button. */
  quoteUrl: string | null
}): Promise<{ subject: string; html: string }> {
  const { quote, version } = input
  if (version.deposit_minor === null) throw new Error('renderQuoteConfirmedEmail: the version has no deposit')
  if (!Number.isSafeInteger(input.remainderDueMinor) || input.remainderDueMinor < 0) {
    throw new Error('renderQuoteConfirmedEmail: the remainder must be a non-negative integer')
  }
  const tr = await quoteEmailTranslator(version.locale)
  const { t, locale } = tr

  const deposit = formatMinor(Number(version.deposit_minor), version.currency)
  const subject = text(t, 'confirmed.subject', { reference: quote.reference })

  const bookingLines = input.bookings.map((b) => {
    const date = ISO_DATE.test(b.pickup_date) ? formatLocaleDate(b.pickup_date, locale) : b.pickup_date
    const route = b.destination_address ? `${bdiAuto(b.origin_address)} → ${bdiAuto(b.destination_address)}` : bdiAuto(b.origin_address)
    return [html(t, 'confirmed.booking', { reference: b.booking_reference }), bdiAuto(date), bdiLtr(b.pickup_time.slice(0, 5)), route].join(' · ')
  })

  // The remainder sentence: nothing left is "fully paid" whatever the method; the card is named only by the saved-card text.
  const method = version.remainder_method
  const remainder =
    input.remainderDueMinor <= 0 || method === null
      ? html(t, 'confirmed.remainder.none')
      : method === 'payment_link' || method === 'invoice'
        ? html(t, `confirmed.remainder.${method}`, { amount: formatMinor(input.remainderDueMinor, version.currency) })
        : html(t, `confirmed.remainder.${method}`)

  const body = renderQuoteEmailShell({
    tr,
    subject,
    h1: html(t, 'confirmed.h1'),
    paragraphs: [
      html(t, 'common.greeting', {}, { name: bdiAuto(quote.client_first_name) }),
      html(t, 'confirmed.intro', { amount: deposit }),
    ],
    reference: quote.reference,
    lines: bookingLines,
    ...(input.quoteUrl ? { button: { label: t('common.openQuote'), url: input.quoteUrl } } : {}),
    footnotes: [remainder, html(t, 'common.pragueTime')],
  })

  return { subject, html: body }
}
