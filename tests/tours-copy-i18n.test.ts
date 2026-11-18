// @vitest-environment node
/**
 * Phase 93, Plan 02 - TRIP-01 / TRIP-02 / TRIP-04 / TRIP-06: the client-facing copy of the day-trip pages (Tours.*) and of
 * the custom-tour acknowledgement e-mail (TourEmails.*) exists in every catalog of `locales` as a real translation
 * (zh-hant is generated from zh by scripts/zh-hant-sync.mjs), keeps the ICU arguments and plural categories of the English
 * source, formats through next-intl, and never types a price, a scarcity claim, a rating or a ride-hailing comparison
 * (T-93-05). The key names are a contract for the UI plans 93-11..14, 93-18, 93-19, 93-32 and 93-34: do not rename them.
 *
 * PENDING lists the locales whose translation is not written yet; each plan task removes the locales it delivers.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { locales } from '@/i18n/locales'

type Json = string | { [k: string]: Json }

const PENDING = new Set(['es', 'fr', 'ar', 'hi', 'zh', 'zh-hant'])

/** The planned key tree: namespace path -> space separated leaf names. */
const KEY_TREE: Record<string, string> = {
  'Tours.page':
    'eyebrow breadcrumbLabel breadcrumbHome breadcrumbServices breadcrumbHub readMore showLess pickupFixed importantFixed ' +
    'cancelFree cancelAfter cancelOverrun cancelTermsLink oneWayLink routeToTour',
  'Tours.facts': 'total atDestination addTime private upTo freeCancel payLater payModes',
  'Tours.sections': 'highlights about itinerary included notIncluded pickup important cancellation faq related credits',
  'Tours.gallery': 'showAll more counter lightboxLabel close prev next alt open credit creditItem',
  'Tours.box':
    'heading from perCar date chooseDate time pragueTime dateFirst passengers paxHelper paxMore car onlyFit carUpTo extra ' +
    'extraNone extraCount extraHelperCar extraHelperNoCar extraMax total totalHours barTotal fewer more lessTime moreTime ' +
    'errDate errTime errCar cta',
  'Tours.custom': 'heading compactBody bandLabel bandBody cta',
  'Tours.hub': 'label heading cardEyebrow cardFrom emptyHeading emptyBody',
  'Tours.checkout':
    'title metaTitle yourTrip date start startValue passengers car timeAtDest included extra pickupReturn totalPerCar change ' +
    'pickupLabel pickupPlaceholder pickupHelper details wishes wishesPlaceholder wishesHelper counter continue checking ' +
    'editDetails refusalOutside refusalAirport refusalCta missingTitle missingBody seeAll unavailableTitle unavailableBody ' +
    'tooLate bookingOff networkError serverError',
  'Tours.confirmation': 'title intro next step1 step2 step3 addToCalendar seeOther icsTitle',
  'Tours.request':
    'label title metaTitle metaDescription intro basedOn remove where wherePlaceholder date people wishes wishesPlaceholder ' +
    'name email phone phoneHelper privacy send sending sentTitle sentBody seeTrips errWhere errDate errPeople errName ' +
    'errEmail errPhone err429 errGeneric errNetwork',
  'Tours.manage': 'dayTrip',
  'TourEmails.ack': 'subject heading body where date people',
}

const KEYS = Object.entries(KEY_TREE).flatMap(([ns, leaves]) => leaves.split(' ').map((leaf) => `${ns}.${leaf}`))

/** Sample ICU values: a leftover '{' after formatting means an argument was lost or misspelt. */
const SAMPLE: Record<string, string | number | ((chunks: unknown) => unknown)> = {
  hours: 4,
  count: 4,
  n: 2,
  amount: '120,00 EUR',
  title: 'Karlovy Vary',
  destination: 'Vienna',
  date: '14. 11. 2026',
  time: '09:30',
  credit: 'Jane Doe',
  license: 'CC BY 4.0',
  email: 'anna@example.com',
  name: 'Anna Novak',
  link: (chunks) => chunks,
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

function tourCopyOf(catalog: AbstractIntlMessages): Record<string, string> {
  const c = catalog as Record<string, Json>
  return { ...flatten(c.Tours, 'Tours'), ...flatten(c.TourEmails, 'TourEmails') }
}

/** ICU argument names (plain, plural and select heads, nested uses) and rich-text tag names, sorted and unique. */
function params(s: string): string[] {
  const names = [...s.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map((m) => m[1])
  const tags = [...s.matchAll(/<\/?([A-Za-z0-9_]+)>/g)].map((m) => `<${m[1]}>`)
  return [...new Set([...names, ...tags])].sort()
}

/** Removes every `{...}` block (nested braces included) and the rich-text tags. */
function stripIcu(s: string): string {
  let depth = 0
  let out = ''
  for (const ch of s) {
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += ch
  }
  return out.replace(/<\/?[A-Za-z0-9_]+>/g, ' ')
}

/** Plural heads of a message: argument name -> branch selectors (`one`, `few`, `=0`, `other`, ...). */
function pluralHeads(s: string): { arg: string; selectors: string[] }[] {
  const heads: { arg: string; selectors: string[] }[] = []
  const re = /\{\s*([A-Za-z0-9_]+)\s*,\s*plural\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const selectors: string[] = []
    let i = re.lastIndex
    let depth = 1
    let buf = ''
    while (i < s.length && depth > 0) {
      const ch = s[i]
      if (ch === '{') {
        if (depth === 1) {
          selectors.push(buf.trim())
          buf = ''
        }
        depth++
      } else if (ch === '}') {
        depth--
      } else if (depth === 1) {
        buf += ch
      }
      i++
    }
    heads.push({ arg: m[1], selectors })
  }
  return heads
}

/** Plural categories a catalog must spell out: every category of the language, `many` only where CLDR needs it for integers. */
function requiredCategories(locale: string): string[] {
  const lang = locale === 'zh-hant' ? 'zh-Hant' : locale
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories as string[]
  return cats.filter((c) => !((locale === 'es' || locale === 'fr') && c === 'many'))
}

const CATALOGS = Object.fromEntries(locales.map((l) => [l, loadCatalog(l)])) as Record<string, AbstractIntlMessages>
const EN = tourCopyOf(CATALOGS.en)
const NON_EN = locales.filter((l) => l !== 'en')
const READY = NON_EN.filter((l) => !PENDING.has(l))

/** Spelled like the English word in that language (genuine cognates). */
const SAME_AS_EN: Record<string, ReadonlySet<string>> = {
  es: new Set(['Tours.box.barTotal']),
  fr: new Set(['Tours.box.barTotal', 'Tours.checkout.date', 'Tours.request.date', 'TourEmails.ack.date', 'Tours.checkout.change']),
}

/** A typed amount or currency: a digit next to a currency sign or code, or a currency word on its own. */
const TYPED_MONEY =
  /\d+\s?(€|eur\b|czk|kč)|€|\$|£|\bEUR\b|\bCZK\b|\bUSD\b|Kč|\beuros?\b|евро|يورو|यूरो|欧元|歐元|\d\s?(korun|dollars?)\b/i

/** Scarcity, popularity and urgency claims (T-93-05), English plus the claims of the other catalogs. */
const SCARCITY =
  /booked \d+ times|sell(s|ing)? out|spots? left|only \d+ left|last chance|popular choice|осталось \d+ мест|последний шанс|популярный выбор|últim[ao]s? plazas|última oportunidad|elección popular|dernières places|dernière chance|choix populaire|آخر فرصة|الخيار الأكثر شعبية|आखिरी मौका|最后机会|最後機會|热门之选|熱門之選/i

/** Ride-hailing names and comparisons (marketing rule: no Uber / ride-hailing comparison). */
const RIDE_HAILING = /uber|bolt|taxi app|ride-?hailing/i

/** A rating or review claim: tours carry no reviews or rating (D-14). */
const RATING = /\b(rating|rated|reviews?|stars?)\b/i

describe('tour copy: the EN source', () => {
  it('has exactly the planned Tours and TourEmails key set', () => {
    expect(Object.keys(EN).sort()).toEqual([...KEYS].sort())
  })

  it('carries the D-12 cancellation copy with hours as a plural ICU argument', () => {
    for (const key of ['Tours.page.cancelFree', 'Tours.facts.freeCancel']) {
      expect(pluralHeads(EN[key]).map((h) => h.arg)).toEqual(['hours'])
    }
    expect(EN['Tours.page.cancelAfter'].length).toBeGreaterThan(0)
    expect(EN['Tours.page.cancelOverrun'].length).toBeGreaterThan(0)
  })

  it('has no rating or review key or string (D-14)', () => {
    for (const [key, value] of Object.entries(EN)) {
      expect({ key, rating: /rating|review|stars?\b/i.test(key.split('.').pop() ?? '') }).toEqual({ key, rating: false })
      expect({ key, rating: RATING.test(value) }).toEqual({ key, rating: false })
    }
  })

  it('has no price, scarcity claim or ride-hailing comparison', () => {
    for (const [key, value] of Object.entries(EN)) {
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, scarcity: SCARCITY.test(value) }).toEqual({ key, scarcity: false })
      expect({ key, rideHailing: RIDE_HAILING.test(value) }).toEqual({ key, rideHailing: false })
    }
  })

  it('does not copy or touch the Phase 88/89 consent keys', () => {
    expect(Object.keys(EN).some((k) => /cardOnFile|vehicleClasses|step6/i.test(k))).toBe(false)
  })
})

describe.each(READY)('tour copy parity: %s', (locale) => {
  const tr = tourCopyOf(CATALOGS[locale])

  it('has exactly the EN key set', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(EN).sort())
  })

  it('keeps exactly the ICU placeholders (arguments and tags) of every EN leaf', () => {
    for (const [key, en] of Object.entries(EN)) {
      expect({ key, params: params(tr[key] ?? '') }).toEqual({ key, params: params(en) })
    }
  })

  it('spells out the plural categories of the language for every plural argument', () => {
    const required = requiredCategories(locale)
    for (const [key, en] of Object.entries(EN)) {
      const enHeads = pluralHeads(en)
      const heads = pluralHeads(tr[key])
      expect({ key, args: heads.map((h) => h.arg) }).toEqual({ key, args: enHeads.map((h) => h.arg) })
      for (const head of heads) {
        const named = head.selectors.filter((s) => !s.startsWith('='))
        expect({ key, arg: head.arg, other: named.includes('other') }).toEqual({ key, arg: head.arg, other: true })
        for (const category of required) {
          expect({ key, arg: head.arg, category, has: named.includes(category) }).toEqual({
            key,
            arg: head.arg,
            category,
            has: true,
          })
        }
        for (const s of named) expect({ key, selector: s, known: ['zero', 'one', 'two', 'few', 'many', 'other'].includes(s) }).toEqual({ key, selector: s, known: true })
      }
    }
  })

  it('is a real translation: no [XX] stub, differs from EN (cognates and argument-only values excepted)', () => {
    for (const [key, en] of Object.entries(EN)) {
      const value = tr[key]
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
      expect({ key, stub: /^\[[A-Za-z-]{2,7}\]/.test(value) }).toEqual({ key, stub: false })
      if (SAME_AS_EN[locale]?.has(key)) continue
      if (stripIcu(en).replace(/Prestigo/g, '').replace(/[\s\p{P}\p{S}]/gu, '').length <= 3) continue
      expect({ key, sameAsEn: value === en }).toEqual({ key, sameAsEn: false })
    }
  })

  it('has no price, scarcity claim, rating or ride-hailing comparison, and keeps the brand spelling', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, misspelt: /Prestigio/i.test(value) }).toEqual({ key, misspelt: false })
      expect({ key, money: TYPED_MONEY.test(value) }).toEqual({ key, money: false })
      expect({ key, scarcity: SCARCITY.test(value) }).toEqual({ key, scarcity: false })
      expect({ key, rideHailing: RIDE_HAILING.test(value) }).toEqual({ key, rideHailing: false })
      expect({ key, rating: RATING.test(value) }).toEqual({ key, rating: false })
    }
  })

  it('has no English left: Latin words appear only in the brand and WhatsApp', () => {
    if (locale === 'es' || locale === 'fr') return
    for (const [key, value] of Object.entries(tr)) {
      const words = (stripIcu(value).match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !['Prestigo', 'WhatsApp', 'WHATSAPP'].includes(w))
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

describe.each(READY)('tour copy script: %s', (locale) => {
  const SCRIPT: Record<string, RegExp> = {
    ru: /[Ѐ-ӿ]/,
    ar: /[؀-ۿ]/,
    hi: /[ऀ-ॿ]/,
    zh: /[一-鿿]/,
    'zh-hant': /[一-鿿]/,
  }

  it('writes the call to action, the eyebrow and the acknowledgement subject in the language own script', () => {
    const script = SCRIPT[locale]
    if (!script) return
    const tr = tourCopyOf(CATALOGS[locale])
    for (const key of ['Tours.box.cta', 'Tours.page.eyebrow', 'TourEmails.ack.subject']) {
      expect({ key, script: script.test(tr[key]) }).toEqual({ key, script: true })
    }
  })
})

describe.each(['en', ...READY])('tour copy formats through next-intl: %s', (locale) => {
  it('formats every key with sample values, no throw and no leftover brace', () => {
    const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: undefined as never })
    for (const key of KEYS) {
      const text = (t as unknown as { rich: (k: string, v: typeof SAMPLE) => unknown }).rich(key, SAMPLE)
      const flat = Array.isArray(text) ? text.join('') : String(text)
      expect({ key, text: typeof flat }).toEqual({ key, text: 'string' })
      expect({ key, leftover: /[{}]/.test(flat) }).toEqual({ key, leftover: false })
      expect(flat.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('tour copy: zh-hant is generated from zh', () => {
  it('equals the OpenCC (cn -> twp) conversion of zh when opencc-js is installed, else keeps key and argument parity', async () => {
    if (PENDING.has('zh') || PENDING.has('zh-hant')) return
    const zh = tourCopyOf(CATALOGS.zh)
    const hant = tourCopyOf(CATALOGS['zh-hant'])
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
