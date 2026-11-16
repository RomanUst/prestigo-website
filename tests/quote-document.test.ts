// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { locales, rtlLocales, type AppLocale } from '@/i18n/locales'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import { QUOTE_OPERATOR_LEGAL, renderQuoteDocumentHtml, type QuoteDocumentInput } from '@/lib/quotes/document'
import { firstPickupMs } from '@/lib/quotes/status'
import { quoteFreeUntilMs } from '@/lib/quotes/terms'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'

/**
 * Phase 92 plan 92-20 (QUOTE-07; D-03, D-09, D-14; B1; T-92-64): the quote document. One self-contained HTML in the
 * quote's language, built from the Quote.* catalog, with one price per trip and no waiting amount. Nothing is mocked:
 * the real catalogs and the real embedded font faces are used.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const catalog = async (locale: AppLocale): Promise<any> => (await import(`@/messages/${locale}.json`)).default

const QUOTE: QuoteRow = {
  id: 'q-1',
  reference: 'Q-20261116-ABC123',
  status: 'sent',
  current_version_id: 'v-1',
  client_first_name: 'Ivan',
  client_last_name: 'Petrov',
  client_email: 'ivan@example.com',
  client_phone: '+420123456789',
  lead_channel: 'whatsapp',
  user_id: null,
  source_inquiry_id: null,
  expires_at: null,
  stripe_customer_id: null,
  stripe_payment_method_id: null,
  deposit_payment_intent_id: null,
  accepted_version_id: null,
  accepted_at: null,
  paid_at: null,
  remainder_payment_intent_id: null,
  remainder_amount_minor: null,
  remainder_attempt: 0,
  remainder_paid_at: null,
  invoice_requested_at: null,
  invoice_number: null,
  invoice_paid_at: null,
  voided_at: null,
  voided_by: null,
  cancelled_at: null,
  cancel_initiator: null,
  cancel_outcome: null,
  deposit_refunded_minor: 0,
  remainder_refunded_minor: 0,
  anonymised_at: null,
  created_by: null,
  created_at: '2026-11-16T09:00:00.000Z',
  updated_at: '2026-11-16T09:00:00.000Z',
}

const version = (locale: string, over: Partial<QuoteVersionRow> = {}): QuoteVersionRow => ({
  id: 'v-1',
  quote_id: 'q-1',
  version_no: 1,
  frozen_at: '2026-11-16T10:00:00.000Z',
  locale,
  currency: 'eur',
  total_minor: 48000,
  deposit_kind: 'percent',
  deposit_value: 30,
  deposit_minor: 14400,
  remainder_method: 'saved_card',
  cancel_free_hours: 48,
  cancel_fee_percent: 50,
  cancel_policy: {
    version: 'quote-2026-11',
    kmThreshold: 100,
    freeHoursShort: 48,
    freeHoursLong: 48,
    freeHoursHourly: 48,
    feePercent: 50,
  },
  cancel_policy_version: 'quote-2026-11',
  terms_version: 'quote-2026-11-1',
  billing_name: null,
  billing_address: null,
  billing_company_id: null,
  billing_vat_id: null,
  billing_note: null,
  created_by: null,
  created_at: '2026-11-16T09:00:00.000Z',
  ...over,
})

const line = (over: Partial<QuoteLineRow> = {}, stops: QuoteStopRow[] = []): QuoteLineRow & { stops: QuoteStopRow[] } => ({
  id: 'l-1',
  version_id: 'v-1',
  position: 1,
  trip_type: 'transfer',
  pickup_date: '2090-05-10',
  pickup_time: '12:00',
  landing_date: null,
  landing_time: null,
  pickup_offset_min: null,
  origin_address: 'Wenceslas Square, Prague',
  origin_lat: null,
  origin_lng: null,
  destination_address: 'Stephansplatz, Vienna',
  destination_lat: null,
  destination_lng: null,
  vehicle_class: 'business',
  passengers: 2,
  luggage: 1,
  hours: null,
  return_date: null,
  distance_km: 330,
  flight_number: 'OK123',
  terminal: null,
  special_requests: 'Operator-only note',
  extra_child_seat: false,
  extra_meet_greet: false,
  extra_luggage: false,
  suggested_amount_minor: null,
  amount_minor: 30000,
  price_overridden: false,
  deposit_share_minor: 9000,
  remainder_minor: 21000,
  amount_eur: 300,
  amount_czk: 7500,
  ...over,
  stops,
})

const STOP: QuoteStopRow = {
  id: 's-1',
  line_id: 'l-2',
  position: 1,
  address: 'Karlovy Vary, Lázeňská 1',
  lat: null,
  lng: null,
  wait_minutes: 30,
  free_minutes: 0,
  blocks: 2,
  fee_per_block_eur: 13.37,
  fee_eur: 26.74,
  created_at: '2026-11-16T09:00:00.000Z',
}

const input = (locale: string, over: { quote?: Partial<QuoteRow>; version?: Partial<QuoteVersionRow> } = {}): QuoteDocumentInput => ({
  quote: { ...QUOTE, ...over.quote },
  version: version(locale, over.version),
  lines: [
    line(),
    line({ id: 'l-2', position: 2, pickup_date: '2090-05-12', pickup_time: '09:30', amount_minor: 18000, destination_address: 'Old Town Square, Prague' }, [STOP]),
  ],
})

/** The visible text of the body: tags removed, the escapes the document uses decoded, white space collapsed. */
function textOf(html: string): string {
  const body = html.slice(html.indexOf('<body'))
  return body
    .replace(/<\/?(bdi|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
}

/** A catalog sentence with its {placeholders} filled in. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(values[k]))
}

describe('QUOTE-07: the en document', () => {
  it('has the title, reference, version, issue date, first name, two trips with one price each, total, deposit, remainder', async () => {
    const en = await catalog('en')
    const html = await renderQuoteDocumentHtml(input('en'))
    const text = textOf(html)

    expect(text).toContain(en.Quote.document.title)
    expect(text).toContain('Q-20261116-ABC123')
    expect(text).toContain('Version 1')
    expect(text).toContain(fill(en.Quote.document.issued, { date: formatLocaleDate('2026-11-16', 'en') }))
    expect(text).toContain('Prepared for Ivan')

    expect(html.match(/data-trip="/g)).toHaveLength(2)
    expect(text).toContain(fill(en.Quote.lines.trip, { number: 1 }))
    expect(text).toContain(fill(en.Quote.lines.trip, { number: 2 }))
    expect(html.match(/data-line-price/g)).toHaveLength(2)
    expect(text).toContain(formatMinor(30000, 'eur'))
    expect(text).toContain(formatMinor(18000, 'eur'))

    expect(text).toContain(`${en.Quote.summary.total} ${formatMinor(48000, 'eur')}`)
    expect(text).toContain(`${en.Quote.summary.deposit} ${formatMinor(14400, 'eur')}`)
    expect(text).toContain(`${en.Quote.summary.remainder} ${formatMinor(33600, 'eur')}`)
    expect(text).toContain(en.Quote.remainder.saved_card)
  })

  it('shows the stop and its waiting minutes, but never a waiting amount (owner rule 2026-11-12)', async () => {
    const html = await renderQuoteDocumentHtml(input('en'))
    const text = textOf(html)
    expect(text).toContain('Karlovy Vary, Lázeňská 1')
    expect(text).toContain('waiting 30 min')
    expect(text).not.toContain('26.74')
    expect(text).not.toContain('26,74')
    expect(text).not.toContain('13.37')
    expect(text).not.toContain('13,37')
    // Exactly the amounts of the page: two line prices, total, deposit, remainder. No other amount.
    const amounts = text.match(/€\s?[\d.,]+/g) ?? []
    expect(new Set(amounts)).toEqual(
      new Set([30000, 18000, 48000, 14400, 33600].map((m) => formatMinor(m, 'eur').match(/€\s?[\d.,]+/)![0])),
    )
  })

  it('never shows operator-only fields (last name, email, phone, special requests, flight number)', async () => {
    const text = textOf(await renderQuoteDocumentHtml(input('en')))
    for (const hidden of ['Petrov', 'ivan@example.com', '+420123456789', 'Operator-only note']) expect(text).not.toContain(hidden)
  })

  it('has the terms of this quote (D-03): free until in Prague time, the late percent, the cap', async () => {
    const en = await catalog('en')
    const text = textOf(await renderQuoteDocumentHtml(input('en')))
    const v = input('en')
    const freeUntil = formatLocaleDateTime(quoteFreeUntilMs(firstPickupMs(v.lines)!, 48), 'en')
    expect(freeUntil).toContain('Prague time')
    expect(text).toContain(fill(en.Quote.terms.free, { freeUntil }))
    expect(text).toContain(fill(en.Quote.terms.latePercent, { percent: 50 }))
    expect(text).not.toContain(en.Quote.terms.lateAll)
    expect(text).toContain(en.Quote.terms.cap)
  })

  it('a 100 percent fee reads "the deposit is kept"; a free window that had passed at issue reads noFree', async () => {
    const en = await catalog('en')
    const all = textOf(
      await renderQuoteDocumentHtml(input('en', { version: { cancel_policy: { ...version('en').cancel_policy!, feePercent: 100 } } })),
    )
    expect(all).toContain(en.Quote.terms.lateAll)
    expect(all).not.toContain(fill(en.Quote.terms.latePercent, { percent: 100 }))

    const late = textOf(await renderQuoteDocumentHtml(input('en', { version: { frozen_at: '2090-05-09T12:00:00.000Z' } })))
    expect(late).toContain(en.Quote.terms.noFree)
  })

  it('has the operator line with the legal name, company id and address', async () => {
    const en = await catalog('en')
    const text = textOf(await renderQuoteDocumentHtml(input('en')))
    expect(QUOTE_OPERATOR_LEGAL.name).toBe('chelautotrans s.r.o.')
    // The legal name ends with a period: the sentence does not add a second one.
    expect(text).toContain('Prestigo is operated by chelautotrans s.r.o.')
    expect(text).not.toContain('s.r.o..')
    expect(text).toContain(QUOTE_OPERATOR_LEGAL.companyId)
    expect(text).toContain(QUOTE_OPERATOR_LEGAL.address)
  })

  it('shows the last day of the offer when the quote has one', async () => {
    const en = await catalog('en')
    const expires = '2090-04-30T21:59:59.000Z'
    const text = textOf(await renderQuoteDocumentHtml(input('en', { quote: { expires_at: expires } })))
    expect(text).toContain(fill(en.Quote.validUntil, { date: formatLocaleDateTime(Date.parse(expires), 'en') }))
  })
})

describe('B1: scripts, direction and fonts', () => {
  it('ar: dir rtl, Arabic strings and the Noto Sans Arabic face', async () => {
    const ar = await catalog('ar')
    const html = await renderQuoteDocumentHtml(input('ar'))
    expect(html).toContain('<html lang="ar" dir="rtl"')
    expect(textOf(html)).toContain(ar.Quote.document.title)
    expect(textOf(html)).toContain(ar.Quote.terms.cap)
    expect(html).toContain("font-family: 'Noto Sans Arabic'")
  })

  it('zh: the Noto Sans SC face, no Traditional face', async () => {
    const html = await renderQuoteDocumentHtml(input('zh'))
    expect(html).toContain("font-family: 'Noto Sans SC'")
    expect(html).not.toContain("font-family: 'Noto Sans TC'")
  })

  it('ar: a localized date keeps its own order (dir auto), a reference stays left-to-right', async () => {
    const html = await renderQuoteDocumentHtml(input('ar'))
    expect(html).toContain(`<bdi dir="auto">${formatLocaleDate('2090-05-10', 'ar')}</bdi>`)
    expect(html).toContain('<bdi dir="ltr">Q-20261116-ABC123</bdi>')
  })

  it('zh and zh-hant join sentences without a space (the render.ts rule)', async () => {
    for (const locale of ['zh', 'zh-hant'] as const) {
      const messages = await catalog(locale)
      const html = await renderQuoteDocumentHtml(input(locale))
      expect(html).toContain(`${messages.Quote.document.acceptOnline}${messages.Quote.pragueTime}`)
    }
  })

  it('zh-hant: the Noto Sans TC face and the title of zh-hant.json', async () => {
    const zhHant = await catalog('zh-hant')
    const html = await renderQuoteDocumentHtml(input('zh-hant'))
    expect(html).toContain("font-family: 'Noto Sans TC'")
    expect(html).not.toContain("font-family: 'Noto Sans SC'")
    expect(textOf(html)).toContain(zhHant.Quote.document.title)
  })

  it.each([...locales])('%s: renders with its own Quote.document.title, no missing message, and its dir', async (locale) => {
    const messages = await catalog(locale)
    const html = await renderQuoteDocumentHtml(input(locale))
    expect(textOf(html)).toContain(messages.Quote.document.title)
    expect(textOf(html)).toContain(messages.Quote.terms.cap)
    expect(html).toContain(`<html lang="${locale}" dir="${(rtlLocales as readonly string[]).includes(locale) ? 'rtl' : 'ltr'}"`)
    // createTranslator prints the dotted key when a message is missing; the translator of the document throws instead.
    expect(textOf(html)).not.toMatch(/Quote\.\w+/)
  })
})

describe('T-92-64: injection and self-containment', () => {
  it('escapes the first name and the addresses', async () => {
    const evil = '<script>alert(1)</script>'
    const v = input('en', { quote: { client_first_name: `<img src=x onerror=alert(1)>${evil}` } })
    v.lines[0] = { ...v.lines[0], origin_address: `Hotel ${evil}` }
    v.lines[1] = { ...v.lines[1], stops: [{ ...STOP, address: `Stop "${evil}" & co` }] }
    const html = await renderQuoteDocumentHtml(v)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&amp; co')
  })

  it.each([...locales])('%s: no http(s) URL, no script, no link, no remote img', async (locale) => {
    const html = await renderQuoteDocumentHtml(input(locale))
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<link/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<iframe/i)
    expect(html).not.toMatch(/@import/i)
    // Every url() of the CSS is an embedded data: font.
    for (const m of html.matchAll(/url\(([^)]{0,20})/g)) expect(m[1].startsWith('data:')).toBe(true)
  })
})
