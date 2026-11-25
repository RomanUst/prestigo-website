// The quote as a document (Phase 92, plan 92-20; QUOTE-07; D-03, D-09, D-14; T-92-64).
//
// renderQuoteDocumentHtml builds ONE self-contained HTML document of a frozen quote version in the version's language:
// dir rtl for Arabic, the embedded font faces of that language (lib/quotes/pdf-fonts.ts), inline CSS for A4, no script,
// no link, no image and no external URL. lib/quotes/documents.ts renders it once into the stored PDF that the email
// attaches and the quote page offers for download, so the attached file, the download and what was accepted are the
// same document.
//
// It says what the quote page says (app/[locale]/quote/[token]/page.tsx), from the same Quote.* catalog keys: reference,
// version, issue date, the client's first name, each trip with ONE price (owner rule 2026-11-12: a stop shows its
// waiting minutes, never a waiting amount), total, deposit, remainder and the remainder sentence of the method, the
// cancellation terms of THIS quote (D-03: read from the frozen snapshot, the free window measured from the first trip),
// and the operator's legal name. It carries the first name only: no last name, email, phone, billing data, flight
// number or special requests. A tour line is headed by its title and any line shows the operator's description
// (migration 096), both escaped.
//
// Every operator and client value is HTML-escaped (escapeHtml, or html() of render.ts which escapes the sentence and
// isolates each value in a bdi). The translator throws on a missing message, so a hole in a catalog fails the render
// (the caller then sends the email without the PDF) instead of printing a key into a client document.
//
// Server only (reads the font files and the catalogs).

import { normalizeSiteLocale, rtlLocales, type AppLocale } from '@/i18n/locales'
import { BUSINESS_PHONE_DISPLAY } from '@/lib/contact-channels'
import { escapeHtml } from '@/lib/email'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import { html, joinLocaleSentences, loadMessages, makeTranslator, type Translator } from '@/lib/payments/emails/render'
import { getPragueTodayISO } from '@/lib/prague-date'
import { fontFaceCss, fontStacks } from '@/lib/quotes/pdf-fonts'
import { firstPickupMs } from '@/lib/quotes/status'
import { quoteFreeUntilMs, termsFromSnapshot } from '@/lib/quotes/terms'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'
import { VEHICLE_CLASS_KEY } from '@/types/booking'

export interface QuoteDocumentInput {
  quote: QuoteRow
  version: QuoteVersionRow
  lines: Array<QuoteLineRow & { stops: QuoteStopRow[] }>
}

/** The operator of the service, as in the site footer (components/Footer.tsx). Not translated: legal names. */
export const QUOTE_OPERATOR_LEGAL = {
  name: 'chelautotrans s.r.o.',
  companyId: '05650801',
  address: 'Spojovací 685, Vysoký Újezd, Czech Republic',
  email: 'info@rideprestigo.com',
} as const

const esc = (value: string | number): string => escapeHtml(String(value))
/** A value written left-to-right whatever the page direction: amounts, references, dates, times, counts. */
const ltr = (value: string | number): string => `<bdi dir="ltr">${esc(value)}</bdi>`
/** A free text value (a name, an address) that keeps its own direction. */
const auto = (value: string): string => `<bdi dir="auto">${esc(value)}</bdi>`
/** A multi-line plain text of the operator (a line description): escaped, every line break kept as <br>. */
const multiline = (value: string): string =>
  `<div dir="auto" class="desc">${value.split(/\r\n|\r|\n/).map((part) => esc(part)).join('<br>')}</div>`

/** The moment the version was issued (frozen); now for a version that is not frozen. */
function issuedAtMs(version: QuoteVersionRow): number {
  const at = version.frozen_at ? Date.parse(version.frozen_at) : NaN
  return Number.isFinite(at) ? at : Date.now()
}

function documentCss(locale: AppLocale): string {
  const stacks = fontStacks(locale)
  return `${fontFaceCss(locale)}
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${stacks.body}; font-size: 10pt; line-height: 1.55; color: #0F1D2C; background: #FFFFFF; }
p { margin: 0; }
.brand { font-family: ${stacks.heading}; font-size: 22pt; letter-spacing: .38em; font-weight: 400; color: #0F1D2C; }
.rule { height: 0.6mm; background: #BFA06A; margin: 3mm 0 6mm; }
h1 { font-family: ${stacks.heading}; font-size: 18pt; font-weight: 400; margin: 0 0 2mm; color: #0F1D2C; }
h2 { font-family: ${stacks.heading}; font-size: 13pt; font-weight: 500; color: #0F1D2C; margin: 7mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 0.3mm solid #BFA06A; }
h3 { font-size: 10.5pt; font-weight: 600; margin: 0 0 2mm; color: #0F1D2C; }
.meta { color: #4A5560; }
.note { color: #4A5560; font-size: 9pt; margin-top: 2mm; }
.trip { border: 0.3mm solid #E6D6B0; border-inline-start: 1.2mm solid #BFA06A; padding: 3mm 4mm; margin-bottom: 3mm; break-inside: avoid; page-break-inside: avoid; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: start; vertical-align: top; padding: 1mm 0; }
th { width: 32%; font-weight: 600; color: #4A5560; padding-inline-end: 4mm; }
.stops { margin: 0; padding: 0; list-style: none; }
.desc { overflow-wrap: anywhere; }
.muted { color: #4A5560; }
.price td, .price th { border-top: 0.3mm solid #E6D6B0; padding-top: 2mm; font-weight: 600; color: #0F1D2C; }
.summary { background: #0F1D2C; color: #F3EEE3; padding: 5mm 6mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.summary h2 { color: #E6D6B0; border-bottom-color: #BFA06A; margin-top: 0; }
.summary th { color: #E6D6B0; }
.summary td { text-align: end; font-weight: 600; }
.summary .total th, .summary .total td { font-size: 12pt; }
.summary p { margin-top: 3mm; }
.terms p { margin-bottom: 1.5mm; }
.terms { break-inside: avoid; page-break-inside: avoid; }
footer { margin-top: 8mm; padding-top: 3mm; border-top: 0.3mm solid #BFA06A; font-size: 8.5pt; color: #4A5560; }`
}

function headerHtml(t: Translator, quote: QuoteRow, version: QuoteVersionRow, locale: AppLocale): string {
  const issued = formatLocaleDate(getPragueTodayISO(new Date(issuedAtMs(version))), locale)
  const validUntil =
    quote.expires_at && Number.isFinite(Date.parse(quote.expires_at))
      ? `<p class="meta">${html(t, 'validUntil', {}, { date: auto(formatLocaleDateTime(Date.parse(quote.expires_at), locale)) })}</p>`
      : ''
  return `<header>
<p class="brand">PRESTIGO</p>
<div class="rule"></div>
<h1>${esc(t('document.title'))}</h1>
<p class="meta">${esc(t('document.reference'))}: ${ltr(quote.reference)}</p>
<p class="meta">${html(t, 'version', { number: String(version.version_no) })}</p>
<p class="meta">${html(t, 'document.issued', {}, { date: auto(issued) })}</p>
${validUntil}
<p style="margin-top: 4mm;">${html(t, 'preparedFor', {}, { name: auto(quote.client_first_name) })}</p>
<p class="note">${joinLocaleSentences(locale, [esc(t(Number(version.deposit_minor ?? 0) === 0 ? 'noDeposit.acceptOnline' : 'document.acceptOnline')), esc(t('pragueTime'))])}</p>
</header>`
}

const row = (label: string, value: string, extra = ''): string => `<tr${extra}><th scope="row">${esc(label)}</th><td>${value}</td></tr>`

function tripHtml(
  t: Translator,
  vt: Translator,
  line: QuoteLineRow & { stops: QuoteStopRow[] },
  money: (minor: number) => string,
  locale: AppLocale,
): string {
  const pickupNotes = [
    line.landing_time ? `<div class="muted">${html(t, 'lines.landing', { time: line.landing_time })}</div>` : '',
    line.hours !== null && line.hours !== undefined
      ? `<div class="muted">${html(t, 'lines.duration', { hours: String(line.hours) })}</div>`
      : '',
  ].join('')

  // A stop shows its address and its waiting minutes. Its waiting fee is part of the one price of the trip.
  const stops =
    line.stops.length > 0
      ? row(
          t('lines.stops'),
          `<ul class="stops">${line.stops
            .map(
              (s) =>
                `<li>${auto(s.address)}${
                  s.wait_minutes > 0 ? ` <span class="muted">· ${html(t, 'lines.stopWait', { minutes: String(s.wait_minutes) })}</span>` : ''
                }</li>`,
            )
            .join('')}</ul>`,
        )
      : ''

  // A tour reads under its own headline; every other line under its trip-type label.
  const heading = line.trip_type === 'tour' && line.title ? auto(line.title) : esc(t(`lines.tripType.${line.trip_type}`))

  return `<section class="trip" data-trip="${esc(line.position)}">
<h3>${esc(t('lines.trip', { number: String(line.position) }))} · ${heading}</h3>
<table>
${row(t('lines.date'), auto(formatLocaleDate(line.pickup_date ?? '', locale)))}
${row(t('lines.pickupTime'), `${ltr(line.pickup_time ?? '')}${pickupNotes}`)}
${row(t('lines.from'), auto(line.origin_address ?? ''))}
${stops}
${line.destination_address ? row(t('lines.to'), auto(line.destination_address)) : ''}
${line.description ? row(t('lines.description'), multiline(line.description)) : ''}
${row(t('lines.vehicle'), esc(vt(`${VEHICLE_CLASS_KEY[line.vehicle_class]}.label`)))}
${row(t('lines.passengers'), ltr(line.passengers))}
${line.luggage > 0 ? row(t('lines.luggage'), ltr(line.luggage)) : ''}
${row(t('lines.price'), `<span data-line-price>${ltr(money(Number(line.amount_minor)))}</span>`, ' class="price"')}
</table>
</section>`
}

function summaryHtml(t: Translator, version: QuoteVersionRow, money: (minor: number) => string): string {
  const total = Number(version.total_minor)
  const deposit = Number(version.deposit_minor ?? 0)
  const method = version.remainder_method ?? 'saved_card'
  if (deposit === 0) {
    // Migration 098: no deposit.
    return `<section class="summary">
<h2>${esc(t('summary.heading'))}</h2>
<table>
${row(t('summary.total'), ltr(money(total)), ' class="total"')}
${row(t('noDeposit.deposit'), esc(t('noDeposit.none')))}
${row(t('noDeposit.toPay'), ltr(money(total)))}
</table>
<p>${esc(t(`noDeposit.remainder.${method}`))}</p>
</section>`
  }
  return `<section class="summary">
<h2>${esc(t('summary.heading'))}</h2>
<table>
${row(t('summary.total'), ltr(money(total)), ' class="total"')}
${row(t('summary.deposit'), ltr(money(deposit)))}
${row(t('summary.remainder'), ltr(money(total - deposit)))}
</table>
<p>${esc(t(`remainder.${method}`))}</p>
</section>`
}

/** D-03: the terms of this quote, from the frozen snapshot; the free window as it stood when the version was issued. */
function termsHtml(t: Translator, input: QuoteDocumentInput, locale: AppLocale): string {
  const { freeHours, feePercent } = termsFromSnapshot(input.version.cancel_policy)
  const first = firstPickupMs(input.lines)
  const freeUntilMs = first === null ? null : quoteFreeUntilMs(first, freeHours)
  const freeUntil = freeUntilMs !== null ? formatLocaleDateTime(freeUntilMs, locale) : ''
  const showFree = freeUntilMs !== null && freeUntil !== '' && issuedAtMs(input.version) <= freeUntilMs

  if (Number(input.version.deposit_minor ?? 0) === 0) {
    // Migration 098: without a deposit there is nothing to keep on a cancellation.
    return `<section class="terms">
<h2>${esc(t('terms.heading'))}</h2>
<p>${esc(t('noDeposit.terms'))}</p>
<p>${esc(t('terms.howToCancel'))}</p>
</section>`
  }
  return `<section class="terms">
<h2>${esc(t('terms.heading'))}</h2>
<p>${showFree ? html(t, 'terms.free', { freeUntil }) : esc(t('terms.noFree'))}</p>
<p>${feePercent >= 100 ? esc(t('terms.lateAll')) : html(t, 'terms.latePercent', { percent: String(feePercent) })}</p>
<p>${esc(t('terms.cap'))}</p>
<p>${esc(t('terms.howToCancel'))}</p>
</section>`
}

/** "Prestigo is operated by {company}." — the legal name ends with a period, so the sentence's own period is dropped. */
function operatorSentence(t: Translator): string {
  return html(t, 'document.operator', { company: QUOTE_OPERATOR_LEGAL.name }).replace(/\.<\/bdi>\./, '.</bdi>')
}

function footerHtml(t: Translator): string {
  const legal = QUOTE_OPERATOR_LEGAL
  return `<footer>
<p>${esc(t('contact.heading'))} ${ltr(legal.email)} · ${ltr(BUSINESS_PHONE_DISPLAY)}</p>
<p style="margin-top: 1.5mm;">${operatorSentence(t)}</p>
<p>${ltr(`IČO ${legal.companyId}`)} · ${auto(legal.address)}</p>
</footer>`
}

/**
 * The document of one quote version, in the version's language. Throws when a catalog key is missing (the translator
 * fails loudly) or the version has no deposit: the caller renders no PDF rather than a document with holes.
 */
export async function renderQuoteDocumentHtml(input: QuoteDocumentInput): Promise<string> {
  const { quote, version } = input
  if (version.deposit_minor === null || version.deposit_minor === undefined) {
    throw new Error('renderQuoteDocumentHtml: the version has no deposit')
  }
  const locale = normalizeSiteLocale(version.locale)
  const messages = await loadMessages(locale)
  const t = makeTranslator(locale, messages, 'Quote')
  const vt = makeTranslator(locale, messages, 'Booking.vehicleClasses')
  const dir = (rtlLocales as readonly string[]).includes(locale) ? 'rtl' : 'ltr'
  const money = (minor: number) => formatMinor(minor, version.currency)
  const lines = [...input.lines].sort((a, b) => a.position - b.position)

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(`${t('document.title')} ${quote.reference}`)}</title>
<style>
${documentCss(locale)}
</style>
</head>
<body>
${headerHtml(t, quote, version, locale)}
<h2>${esc(t('lines.heading'))}</h2>
${lines.map((line) => tripHtml(t, vt, line, money, locale)).join('\n')}
${summaryHtml(t, version, money)}
${termsHtml(t, input, locale)}
${footerHtml(t)}
</body>
</html>`
}
