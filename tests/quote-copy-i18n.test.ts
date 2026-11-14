// @vitest-environment node
/**
 * Phase 92, Plan 03 - QUOTE-02 / QUOTE-03 / QUOTE-04 / QUOTE-07: the client-facing copy of the quote page, the
 * acceptance consent per remainder method and the PDF document exists in every catalog of `locales` as a real
 * translation (zh-hant is generated from zh by scripts/zh-hant-sync.mjs), keeps the ICU parameters of the English
 * source, formats through next-intl, and never types an amount or names a separate waiting price (T-92-09, T-92-10).
 *
 * KEYS lists: one per plan task. Plan 92-29 adds the QuoteEmails namespace in its own test file section; this file
 * compares the Quote namespace key set exactly, so a key added or dropped without a test update fails here.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { locales } from '@/i18n/locales'

type Json = string | { [k: string]: Json }

/** Task 2: page, consent, remainder, terms, accept, paid, invalid, contact (70 keys). */
const PAGE_KEYS = [
  'meta.title', 'eyebrow', 'title', 'version', 'preparedFor', 'intro', 'validUntil', 'pragueTime',
  'status.offer', 'status.accepted', 'status.paid',
  'lines.heading', 'lines.trip', 'lines.tripType.transfer', 'lines.tripType.hourly', 'lines.tripType.daily',
  'lines.date', 'lines.pickupTime', 'lines.landing', 'lines.from', 'lines.to', 'lines.stops', 'lines.stopWait',
  'lines.vehicle', 'lines.passengers', 'lines.luggage', 'lines.duration', 'lines.price',
  'summary.heading', 'summary.total', 'summary.deposit', 'summary.remainder',
  'remainder.saved_card', 'remainder.payment_link', 'remainder.cash', 'remainder.invoice',
  'terms.heading', 'terms.free', 'terms.lateAll', 'terms.latePercent', 'terms.noFree', 'terms.cap', 'terms.howToCancel',
  'accept.heading', 'accept.button', 'accept.consentRequired', 'accept.processing', 'accept.confirming',
  'accept.declined', 'accept.error', 'accept.changed', 'accept.unavailable',
  'consent.saved_card', 'consent.payment_link', 'consent.cash', 'consent.invoice',
  'paid.heading', 'paid.body', 'paid.booking',
  'remainderPay.heading', 'remainderPay.due', 'remainderPay.button', 'remainderPay.confirming', 'remainderPay.paid',
  'invoice.note',
  'invalid.title', 'invalid.body',
  'contact.heading', 'contact.call', 'contact.email',
] as const

/** Task 3: PDF download and print fallback, return page, PDF document (11 keys). */
const DOCUMENT_KEYS = [
  'pdf.download', 'pdf.preparing', 'pdf.unavailable', 'pdf.print',
  'done.title', 'done.body',
  'document.title', 'document.issued', 'document.reference', 'document.acceptOnline', 'document.operator',
] as const

const KEYS = [...PAGE_KEYS, ...DOCUMENT_KEYS].map((k) => `Quote.${k}`)

/** Sample ICU values: a leftover '{' after formatting means a parameter was lost or misspelt. */
const SAMPLE: Record<string, string | number> = {
  reference: 'Q-2026-0042',
  number: 2,
  name: 'Anna Novak',
  date: '14. 11. 2026',
  time: '18:40',
  minutes: 20,
  hours: 4,
  freeUntil: '1. 12. 2026 18:00',
  percent: 50,
  amount: '120,00 EUR',
  deposit: '120,00 EUR',
  version: 3,
  company: 'Example s.r.o.',
}

function loadCatalog(locale: string): AbstractIntlMessages {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as AbstractIntlMessages
}

function flatten(node: Json | undefined, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (node === undefined) return out
  if (typeof node === 'string') {
    out[prefix] = node
    return out
  }
  for (const [k, v] of Object.entries(node)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k))
  return out
}

function quoteOf(catalog: AbstractIntlMessages): Record<string, string> {
  return flatten((catalog as Record<string, Json>).Quote, 'Quote')
}

function params(s: string): string[] {
  return [...new Set([...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]))].sort()
}

const CATALOGS = Object.fromEntries(locales.map((l) => [l, loadCatalog(l)])) as Record<string, AbstractIntlMessages>
const EN = quoteOf(CATALOGS.en)
const NON_EN = locales.filter((l) => l !== 'en')

/** Spelled the same as the English word in that language (genuine cognates), or a parameter-only value. */
const SAME_AS_EN: Record<string, ReadonlySet<string>> = {
  es: new Set(['Quote.summary.total', 'Quote.lines.duration']),
  fr: new Set(['Quote.summary.total', 'Quote.lines.duration', 'Quote.lines.date', 'Quote.version']),
}

/** A typed amount: a digit next to a currency sign or code. Amounts are ICU parameters only. */
const TYPED_MONEY = /\d\s?(€|Kč|CZK|EUR|USD|\$|£)|(€|\$|£)\s?\d|\d\s?(euros?|korun|dollars?)\b/i

/** No copy may name a separate waiting price (owner rule 2026-11-12: a line has one price). */
const WAITING_PRICE: Record<string, RegExp> = {
  en: /waiting (fee|charge|cost|price|rate)/i,
  ru: /(плата|цена|стоимость|тариф) за ожидание|стоимость ожидания|плата за простой/i,
  es: /(tarifa|cargo|coste|precio|importe) (de|por) (la )?espera/i,
  fr: /(tarif|frais|coût|prix|supplément) (de|d'|pour l')attente/i,
  ar: /(رسوم|أجرة|سعر|تكلفة) الانتظار/,
  hi: /इंतज़ार (शुल्क|का शुल्क|की कीमत)|प्रतीक्षा शुल्क/,
  zh: /等候(费|费用|价格)/,
  'zh-hant': /等候(費|費用|價格)/,
}

describe('quote copy: the EN source', () => {
  it('has exactly the planned Quote key set', () => {
    expect(Object.keys(EN).sort()).toEqual([...KEYS].sort())
  })

  it('has a consent sentence per remainder method naming reference, version and deposit (D-08)', () => {
    for (const method of ['saved_card', 'payment_link', 'cash', 'invoice']) {
      expect(params(EN[`Quote.consent.${method}`])).toEqual(['deposit', 'reference', 'version'])
      expect(EN[`Quote.remainder.${method}`].length).toBeGreaterThan(0)
    }
  })

  it('never types an amount or names a separate waiting price', () => {
    for (const [key, value] of Object.entries(EN)) {
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, waiting: WAITING_PRICE.en.test(value) }).toEqual({ key, waiting: false })
    }
    expect(KEYS.some((k) => /waiting(fee|charge|cost|price)/i.test(k.replace(/[._]/g, '')))).toBe(false)
  })
})

describe.each(NON_EN)('quote copy parity: %s', (locale) => {
  const tr = quoteOf(CATALOGS[locale])

  it('has exactly the EN key set', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(EN).sort())
  })

  it('keeps exactly the ICU parameters of every EN leaf', () => {
    for (const [key, en] of Object.entries(EN)) {
      expect({ key, params: params(tr[key] ?? '') }).toEqual({ key, params: params(en) })
    }
  })

  it('is a real translation: no [XX] stub, differs from EN (cognates excepted)', () => {
    for (const [key, en] of Object.entries(EN)) {
      const value = tr[key]
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
      expect({ key, stub: /^\[[A-Za-z-]{2,7}\]/.test(value) }).toEqual({ key, stub: false })
      if (SAME_AS_EN[locale]?.has(key)) continue
      expect({ key, sameAsEn: value === en }).toEqual({ key, sameAsEn: false })
    }
  })

  it('keeps the brand spelling, types no amount and names no separate waiting price', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, misspelt: /Prestigio/i.test(value) }).toEqual({ key, misspelt: false })
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, waiting: WAITING_PRICE[locale].test(value) }).toEqual({ key, waiting: false })
    }
  })

  it('has no English left: Latin words appear only in the brand and the PDF / e-mail acronyms', () => {
    if (locale === 'es' || locale === 'fr') return
    for (const [key, value] of Object.entries(tr)) {
      const words = (value.replace(/\{[^}]*\}/g, ' ').match(/[A-Za-z]{2,}/g) ?? []).filter(
        (w) => w !== 'Prestigo' && w !== 'PDF',
      )
      expect({ key, latin: words }).toEqual({ key, latin: [] })
    }
  })

  it('Arabic, Hindi and Chinese use Latin digits only (no native digit forms)', () => {
    if (!['ar', 'hi', 'zh', 'zh-hant'].includes(locale)) return
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, native: /[٠-٩۰-۹०-९]/.test(value) }).toEqual({ key, native: false })
    }
  })
})

describe.each(locales)('quote copy formats through next-intl: %s', (locale) => {
  it('formats every key with sample values, no throw and no leftover brace', () => {
    const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: 'Quote' as never })
    for (const key of KEYS) {
      const inner = key.slice('Quote.'.length)
      const text = (t as unknown as (k: string, v: Record<string, string | number>) => string)(inner, SAMPLE)
      expect({ key, text: typeof text }).toEqual({ key, text: 'string' })
      expect({ key, leftover: /[{}]/.test(text) }).toEqual({ key, leftover: false })
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('quote copy: zh-hant is generated from zh', () => {
  it('equals the OpenCC (cn -> twp) conversion of zh when opencc-js is installed, else keeps key and parameter parity', async () => {
    const zh = quoteOf(CATALOGS.zh)
    const hant = quoteOf(CATALOGS['zh-hant'])
    expect(Object.keys(hant).sort()).toEqual(Object.keys(zh).sort())
    for (const [key, value] of Object.entries(zh)) expect({ key, params: params(hant[key]) }).toEqual({ key, params: params(value) })

    let convert: ((s: string) => string) | null = null
    try {
      // opencc-js ships no type declarations: import it through a variable specifier.
      const specifier = 'opencc-js'
      const OpenCC = (await import(/* @vite-ignore */ specifier)) as {
        Converter: (o: { from: string; to: string }) => (s: string) => string
      }
      convert = OpenCC.Converter({ from: 'cn', to: 'twp' })
    } catch {
      convert = null
    }
    if (!convert) return
    for (const [key, value] of Object.entries(zh)) expect({ key, text: hant[key] }).toEqual({ key, text: convert(value) })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Plan 92-29 - QUOTE-04 / QUOTE-05 / QUOTE-07: the QuoteEmails namespace (the quote e-mails in the quote's language).
// Same checks as the Quote namespace above, over every catalog of `locales`.
// ---------------------------------------------------------------------------------------------------------------------

/** Task 1: common and sent (13 keys). */
const EMAIL_SENT_KEYS = [
  'common.greeting', 'common.signoff', 'common.contact', 'common.openQuote', 'common.pragueTime',
  'sent.subject', 'sent.h1', 'sent.intro', 'sent.total', 'sent.deposit', 'sent.validUntil', 'sent.pdfAttached', 'sent.pdfLink',
] as const

/** Task 2 (plan 92-29) extends this list: confirmed, remainder due / paid, cancelled, refunded (26 keys). */
const EMAIL_LIFECYCLE_KEYS = [] as const

const EMAIL_KEYS = [...EMAIL_SENT_KEYS, ...EMAIL_LIFECYCLE_KEYS].map((k) => `QuoteEmails.${k}`)

function emailsOf(catalog: AbstractIntlMessages): Record<string, string> {
  return flatten((catalog as Record<string, Json>).QuoteEmails, 'QuoteEmails')
}

const EMAIL_EN = emailsOf(CATALOGS.en)

/** Genuine cognates / parameter-led values spelled like the English source. */
const EMAIL_SAME_AS_EN: Record<string, ReadonlySet<string>> = {
  es: new Set(['QuoteEmails.sent.total']),
}

describe('quote e-mail copy: the EN source', () => {
  it('has exactly the planned QuoteEmails key set (13 keys)', () => {
    expect(EMAIL_KEYS).toHaveLength(13)
    expect(Object.keys(EMAIL_EN).sort()).toEqual([...EMAIL_KEYS].sort())
  })

  it('subjects carry the reference only and no line break (T-92-91)', () => {
    for (const [key, value] of Object.entries(EMAIL_EN)) {
      if (!key.endsWith('.subject')) continue
      expect({ key, br: /[\r\n]/.test(value) }).toEqual({ key, br: false })
      expect(params(value)).toEqual(['reference'])
    }
  })

  it('never types an amount or names a separate waiting price (T-92-90)', () => {
    for (const [key, value] of Object.entries(EMAIL_EN)) {
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, waiting: WAITING_PRICE.en.test(value) }).toEqual({ key, waiting: false })
    }
  })

  it('names the card only where D-21 / D-22 allow: saved-card remainder and the refund sentences', () => {
    for (const key of ['payment_link', 'cash', 'invoice', 'none']) {
      expect({ key, card: /card/i.test(EMAIL_EN[`QuoteEmails.confirmed.remainder.${key}`]) }).toEqual({ key, card: false })
    }
  })
})

describe.each(NON_EN)('quote e-mail copy parity: %s', (locale) => {
  const tr = emailsOf(CATALOGS[locale])

  it('has exactly the EN key set', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(EMAIL_EN).sort())
  })

  it('keeps exactly the ICU parameters of every EN leaf, subjects without a line break', () => {
    for (const [key, en] of Object.entries(EMAIL_EN)) {
      expect({ key, params: params(tr[key] ?? '') }).toEqual({ key, params: params(en) })
      if (key.endsWith('.subject')) expect({ key, br: /[\r\n]/.test(tr[key]) }).toEqual({ key, br: false })
    }
  })

  it('is a real translation: no [XX] stub, differs from EN (cognates excepted)', () => {
    for (const [key, en] of Object.entries(EMAIL_EN)) {
      const value = tr[key]
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
      expect({ key, stub: /^\[[A-Za-z-]{2,7}\]/.test(value) }).toEqual({ key, stub: false })
      if (EMAIL_SAME_AS_EN[locale]?.has(key)) continue
      expect({ key, sameAsEn: value === en }).toEqual({ key, sameAsEn: false })
    }
  })

  it('keeps the brand spelling, types no amount and names no separate waiting price', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, misspelt: /Prestigio/i.test(value) }).toEqual({ key, misspelt: false })
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, waiting: WAITING_PRICE[locale].test(value) }).toEqual({ key, waiting: false })
    }
  })

  it('has no English left: Latin words appear only in the brand and the PDF acronym', () => {
    if (locale === 'es' || locale === 'fr') return
    for (const [key, value] of Object.entries(tr)) {
      const words = (value.replace(/\{[^}]*\}/g, ' ').match(/[A-Za-z]{2,}/g) ?? []).filter(
        (w) => w !== 'Prestigo' && w !== 'PDF',
      )
      expect({ key, latin: words }).toEqual({ key, latin: [] })
    }
  })

  it('Arabic, Hindi and Chinese use Latin digits only (no native digit forms)', () => {
    if (!['ar', 'hi', 'zh', 'zh-hant'].includes(locale)) return
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, native: /[٠-٩۰-۹०-९]/.test(value) }).toEqual({ key, native: false })
    }
  })
})

describe.each(locales)('quote e-mail copy formats through next-intl: %s', (locale) => {
  it('formats every key with sample values, no throw and no leftover brace', () => {
    const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: 'QuoteEmails' as never })
    for (const key of EMAIL_KEYS) {
      const inner = key.slice('QuoteEmails.'.length)
      const text = (t as unknown as (k: string, v: Record<string, string | number>) => string)(inner, SAMPLE)
      expect({ key, text: typeof text }).toEqual({ key, text: 'string' })
      expect({ key, leftover: /[{}]/.test(text) }).toEqual({ key, leftover: false })
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('quote e-mail copy: zh-hant is generated from zh', () => {
  it('equals the OpenCC (cn -> twp) conversion of zh when opencc-js is installed, else keeps key and parameter parity', async () => {
    const zh = emailsOf(CATALOGS.zh)
    const hant = emailsOf(CATALOGS['zh-hant'])
    expect(Object.keys(hant).sort()).toEqual(Object.keys(zh).sort())
    for (const [key, value] of Object.entries(zh)) expect({ key, params: params(hant[key]) }).toEqual({ key, params: params(value) })

    let convert: ((s: string) => string) | null = null
    try {
      const specifier = 'opencc-js'
      const OpenCC = (await import(/* @vite-ignore */ specifier)) as {
        Converter: (o: { from: string; to: string }) => (s: string) => string
      }
      convert = OpenCC.Converter({ from: 'cn', to: 'twp' })
    } catch {
      convert = null
    }
    if (!convert) return
    for (const [key, value] of Object.entries(zh)) expect({ key, text: hant[key] }).toEqual({ key, text: convert(value) })
  })
})
