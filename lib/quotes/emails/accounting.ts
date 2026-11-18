// The accounting copy of a paid quote deposit (Phase 92, plan 92-21; QUOTE-04; D-17, research Q3 / Q4).
//
// One English email per paid deposit to the business's own accounting mailbox, with everything the accountant needs to
// issue the tax document or the invoice by hand: the quote reference, the billing details, per line the amount and the
// deposit share, the deposit received with its date, the currency, the remainder method and the total. The system issues
// no tax document in this phase (Q4). For the invoice remainder method the email starts with "Invoice requested" (D-17).
//
// Client data: the client's name and the billing details the client gave for the invoice; never the client's email
// address or phone number (the booking alert to the manager carries the name, and the owner opens the quote in admin for
// the rest). Every value is escaped. Server side only; the amounts are formatted once with formatMinor.

import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import { getPragueTodayISO } from '@/lib/prague-date'
import type { QuoteLineRow, QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

const CELL = 'padding: 4px 12px 4px 0; vertical-align: top; font-size: 14px;'
const HEAD = `${CELL} font-weight: 600;`

const row = (label: string, value: string): string =>
  `<tr><td style="${HEAD}">${escapeHtml(label)}</td><td style="${CELL}">${value}</td></tr>`

/** The Prague calendar date of an instant, for the receipt date; the raw value when it is not a date. */
function receiptDate(value: string): string {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? `${getPragueTodayISO(new Date(ms))} (Prague time)` : escapeHtml(value)
}

export function renderQuoteAccountingEmail(input: {
  quote: Pick<QuoteRow, 'reference' | 'client_first_name' | 'client_last_name'>
  version: Pick<
    QuoteVersionRow,
    | 'currency'
    | 'total_minor'
    | 'deposit_minor'
    | 'remainder_method'
    | 'billing_name'
    | 'billing_address'
    | 'billing_company_id'
    | 'billing_vat_id'
    | 'billing_note'
  >
  lines: Array<
    Pick<QuoteLineRow, 'position' | 'pickup_date' | 'pickup_time' | 'origin_address' | 'destination_address' | 'amount_minor' | 'deposit_share_minor' | 'remainder_minor'>
  >
  /** quotes.paid_at: the moment the deposit was received. */
  depositPaidAt: string
  paymentIntentId: string
}): { subject: string; html: string } {
  const { quote, version } = input
  const money = (minor: number | null): string => (minor === null ? 'n/a' : escapeHtml(formatMinor(Number(minor), version.currency)))
  const invoice = version.remainder_method === 'invoice'
  const heading = invoice ? 'Invoice requested' : 'Deposit received'
  const subject = `${heading}: quote ${quote.reference}`

  const lines = [...input.lines]
    .sort((a, b) => a.position - b.position)
    .map(
      (l) =>
        `<tr><td style="${CELL}">${l.position}</td><td style="${CELL}">${escapeHtml(l.pickup_date)} ${escapeHtml(l.pickup_time.slice(0, 5))}</td>` +
        `<td style="${CELL}">${escapeHtml(l.origin_address)}${l.destination_address ? ` &rarr; ${escapeHtml(l.destination_address)}` : ''}</td>` +
        `<td style="${CELL}">${money(l.amount_minor)}</td><td style="${CELL}">${money(l.deposit_share_minor)}</td><td style="${CELL}">${money(l.remainder_minor)}</td></tr>`,
    )
    .join('')

  const optional = (label: string, value: string | null): string => (value ? row(label, escapeHtml(value)) : '')

  const body = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; color: #111111;">
  <h2 style="font-size: 18px;">${escapeHtml(heading)}</h2>
  ${invoice ? '<p style="font-size: 14px;">The client chose to pay the remainder against an invoice. Please issue it by hand; the system generates no invoice document.</p>' : ''}
  <table style="border-collapse: collapse;">
    ${row('Quote reference', escapeHtml(quote.reference))}
    ${row('Client', escapeHtml(`${quote.client_first_name} ${quote.client_last_name}`.trim()))}
    ${optional('Billing name', version.billing_name)}
    ${optional('Billing address', version.billing_address)}
    ${optional('Company ID', version.billing_company_id)}
    ${optional('VAT ID', version.billing_vat_id)}
    ${optional('Invoice note', version.billing_note)}
    ${row('Deposit received', money(version.deposit_minor))}
    ${row('Receipt date', receiptDate(input.depositPaidAt))}
    ${row('Currency', escapeHtml(version.currency.toUpperCase()))}
    ${row('Stripe payment', escapeHtml(input.paymentIntentId))}
    ${row('Remainder method', escapeHtml(version.remainder_method ?? 'n/a'))}
    ${row('Quote total', money(version.total_minor))}
  </table>
  <h3 style="font-size: 15px;">Trips</h3>
  <table style="border-collapse: collapse;">
    <tr><td style="${HEAD}">#</td><td style="${HEAD}">Pickup</td><td style="${HEAD}">Route</td><td style="${HEAD}">Amount</td><td style="${HEAD}">Deposit share</td><td style="${HEAD}">Remainder</td></tr>
    ${lines}
  </table>
</body>
</html>`

  return { subject, html: body }
}
