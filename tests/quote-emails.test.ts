// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { locales, rtlLocales, type AppLocale } from '@/i18n/locales'
import { escapeHtml } from '@/lib/email'
import { formatLocaleDate } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import { boxHtml, joinLocaleSentences, renderPaymentEmail, shellStyle } from '@/lib/payments/emails/render'
import { quoteEmailTranslator, renderQuoteEmailShell, sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { renderQuoteSentEmail } from '@/lib/quotes/emails/sent'

/**
 * Phase 92 plan 92-13 (QUOTE-07; D-09; W1, B1): the quote email is built on the per-locale pieces EXPORTED from
 * lib/payments/emails/render.ts, in every locale of `locales` (8, zh-hant included). Nothing is mocked except Resend.
 */

const { mockResendSend } = vi.hoisted(() => ({ mockResendSend: vi.fn() }))
process.env.RESEND_API_KEY = 're_test'
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

const URL_OK = 'https://rideprestigo.com/quote/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const EXPIRES = '2099-03-05T22:59:59.000Z' // the Prague day 2099-03-05 (winter time)

const quote = { reference: 'Q-20261114-ABC123', client_first_name: 'Ivan', expires_at: null as string | null }
const version = (locale: string) => ({ locale, currency: 'eur' as const, total_minor: 48000, deposit_minor: 14400 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const catalog = async (locale: AppLocale): Promise<any> => (await import(`@/messages/${locale}.json`)).default

beforeEach(() => {
  vi.clearAllMocks()
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
})

describe('joinLocaleSentences (W1: the one joiner of render.ts)', () => {
  it('uses no space for zh and zh-hant', () => {
    expect(joinLocaleSentences('zh', ['a', 'b'])).toBe('ab')
    expect(joinLocaleSentences('zh-hant', ['a', 'b'])).toBe('ab')
  })

  it.each(locales.filter((l) => l !== 'zh' && l !== 'zh-hant'))('joins with one space for %s and drops empty parts', (locale) => {
    expect(joinLocaleSentences(locale, ['a', 'b'])).toBe('a b')
    expect(joinLocaleSentences(locale, ['a', '', 'b'])).toBe('a b')
  })
})

describe('B1: the quote email renders in every locale of `locales`', () => {
  it('covers all 8 locales including zh-hant', () => {
    expect(locales).toHaveLength(8)
    expect(locales).toContain('zh-hant')
  })

  it.each([...locales])('%s: subject from QuoteEmails.sent.subject, lang, dir, link, total and deposit', async (locale) => {
    const messages = await catalog(locale)
    const out = await renderQuoteSentEmail({
      quote: { ...quote, expires_at: EXPIRES },
      version: version(locale),
      url: URL_OK,
      pdfAttached: false,
    })

    expect(out.subject).toBe(String(messages.QuoteEmails.sent.subject).replace('{reference}', quote.reference))
    expect(out.subject).not.toMatch(/[\r\n]/)
    expect(out.html).toContain(`<html lang="${locale}"`)
    const rtl = (rtlLocales as readonly string[]).includes(locale)
    expect(out.html.includes('dir="rtl"')).toBe(rtl)
    expect(out.html).toContain(`href="${URL_OK}"`)
    expect(out.html).toContain(escapeHtml(formatMinor(48000, 'eur')))
    expect(out.html).toContain(escapeHtml(formatMinor(14400, 'eur')))
    // The last day is a Prague calendar date in the client's language.
    expect(out.html).toContain(escapeHtml(formatLocaleDate('2099-03-05', locale)))
    // The label style is the one render.ts computes for the locale (no second copy of the rule).
    expect(out.html).toContain(shellStyle(locale).goldLabel)
  })

  it.each([...locales])('%s: the sentences under the button are joined by the render.ts rule', async (locale) => {
    const messages = await catalog(locale)
    const out = await renderQuoteSentEmail({
      quote: { ...quote, expires_at: EXPIRES },
      version: version(locale),
      url: URL_OK,
      pdfAttached: false,
    })
    const pdfLink = escapeHtml(String(messages.QuoteEmails.sent.pdfLink))
    const pragueTime = escapeHtml(String(messages.QuoteEmails.common.pragueTime))
    const joined = joinLocaleSentences(locale, [pdfLink, pragueTime])
    expect(out.html).toContain(joined)
    if (locale === 'zh' || locale === 'zh-hant') expect(joined).toBe(`${pdfLink}${pragueTime}`)
    else expect(joined).toBe(`${pdfLink} ${pragueTime}`)
  })

  it('pdfAttached picks the attached sentence, otherwise the page-link sentence (D-14)', async () => {
    const messages = await catalog('en')
    const attached = await renderQuoteSentEmail({ quote, version: version('en'), url: URL_OK, pdfAttached: true })
    const linked = await renderQuoteSentEmail({ quote, version: version('en'), url: URL_OK, pdfAttached: false })
    expect(attached.html).toContain(escapeHtml(messages.QuoteEmails.sent.pdfAttached))
    expect(attached.html).not.toContain(escapeHtml(messages.QuoteEmails.sent.pdfLink))
    expect(linked.html).toContain(escapeHtml(messages.QuoteEmails.sent.pdfLink))
  })

  it('an unknown locale renders in English', async () => {
    const out = await renderQuoteSentEmail({ quote, version: version('xx'), url: URL_OK, pdfAttached: false })
    expect(out.html).toContain('<html lang="en"')
  })
})

describe('what the client sees', () => {
  it('one total and the deposit; no waiting amount, no operator field', async () => {
    const out = await renderQuoteSentEmail({ quote, version: version('en'), url: URL_OK, pdfAttached: false })
    expect(out.html).toContain(formatMinor(48000, 'eur'))
    expect(out.html).toContain(formatMinor(14400, 'eur'))
    expect(out.html.toLowerCase()).not.toContain('waiting')
    expect(out.html).not.toContain('remainder')
  })

  it('escapes the client name and keeps the subject on one line (T-92-43)', async () => {
    const out = await renderQuoteSentEmail({
      quote: { ...quote, client_first_name: '<b>Ivan</b>\r\nBcc: evil@example.com' },
      version: version('en'),
      url: URL_OK,
      pdfAttached: false,
    })
    expect(out.html).toContain('&lt;b&gt;Ivan&lt;/b&gt;')
    expect(out.html).not.toContain('<b>Ivan</b>')
    expect(out.subject).not.toMatch(/[\r\n]/)
    expect(out.subject).not.toContain('Ivan')
  })

  it('refuses a link that is not http(s)', async () => {
    await expect(
      renderQuoteSentEmail({ quote, version: version('en'), url: 'javascript:alert(1)', pdfAttached: false }),
    ).rejects.toThrow()
  })

  it('has the navy brand shell values', async () => {
    const out = await renderQuoteSentEmail({ quote, version: version('en'), url: URL_OK, pdfAttached: false })
    expect(out.html).toContain('#0F1D2C')
    expect(out.html).toContain('#BFA06A')
    expect(out.html).toContain('#F3EEE3')
    expect(out.html).toContain('max-width: 600px')
  })
})

describe('W1: payment emails are untouched by the exports', () => {
  it('renderPaymentEmail still renders and boxHtml is the same box', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', {
      reference: 'PRG-1',
      amountMinor: 10000,
      currency: 'eur',
      pickupDateIso: '2099-03-05',
      pickupTime: '10:00',
      origin: 'A',
      destination: 'B',
      vehicleClass: 'business',
      passengers: 2,
    })
    expect(out.html).toContain(boxHtml(shellStyle('en'), 'Booking reference', '<div style="font-size: 22px; font-weight: 600; color: #BFA06A;"><bdi dir="ltr">PRG-1</bdi></div>'))
  })
})

describe('renderQuoteEmailShell', () => {
  it('escapes the subject in the title and drops the box when there are no lines', async () => {
    const tr = await quoteEmailTranslator('fr')
    const html = renderQuoteEmailShell({ tr, subject: 'a <script> b', h1: 'H', paragraphs: ['P'] })
    expect(html).toContain('<title>a &lt;script&gt; b</title>')
    expect(html).not.toContain('#17293B')
  })
})

describe('sendQuoteEmail', () => {
  it('sends from the bookings address with the idempotency key and a one-line subject', async () => {
    const outcome = await sendQuoteEmail({
      to: 'ivan@example.com',
      subject: 'Hello\r\nBcc: x',
      html: '<p>x</p>',
      idempotencyKey: 'quote-sent:link-1',
    })
    expect(outcome).toBe('sent')
    const [message, options] = mockResendSend.mock.calls[0]
    expect(message.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
    expect(message.to).toEqual(['ivan@example.com'])
    expect(message.subject).not.toMatch(/[\r\n]/)
    expect(message.attachments).toBeUndefined()
    expect(options).toEqual({ idempotencyKey: 'quote-sent:link-1' })
  })

  it('passes attachments through', async () => {
    await sendQuoteEmail({
      to: 'a@example.com',
      subject: 's',
      html: 'h',
      idempotencyKey: 'k',
      attachments: [{ filename: 'q.pdf', content: Buffer.from('pdf') }],
    })
    expect(mockResendSend.mock.calls[0][0].attachments).toHaveLength(1)
  })

  it('answers failed (never throws) when Resend rejects or answers an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockResendSend.mockRejectedValueOnce(new Error('network down for ivan@example.com'))
    expect(await sendQuoteEmail({ to: 'ivan@example.com', subject: 's', html: 'h', idempotencyKey: 'k1' })).toBe('failed')
    mockResendSend.mockResolvedValueOnce({ data: null, error: { message: 'bad' } })
    expect(await sendQuoteEmail({ to: 'ivan@example.com', subject: 's', html: 'h', idempotencyKey: 'k2' })).toBe('failed')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('ivan@example.com')
    spy.mockRestore()
  })
})
