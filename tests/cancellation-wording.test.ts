// @vitest-environment node
// Phase 89, plan 89-20 (CANC-02, D-16, D-18, D-24): the cancellation wording in the terms and the FAQ.
// The numbers are admin settings, so the locale files carry ICU-style variables and no typed number.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPageContent } from '@/lib/page-content'
import { routing } from '@/i18n/routing'
import {
  assertNoUnresolved,
  fillPolicyDeep,
  fillPolicyNumbers,
  getPolicyNumbers,
  policyVariablesIn,
  type PolicyNumbers,
} from '@/lib/cancellation-wording'

const mocks = vi.hoisted(() => ({
  getCancellationPolicy: vi.fn(),
  getNoShowThresholds: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/cancellation-settings', () => ({ getCancellationPolicy: mocks.getCancellationPolicy }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: mocks.createClient }))
vi.mock('@/lib/no-show-wait', async (orig) => {
  const actual = await orig<typeof import('@/lib/no-show-wait')>()
  return { ...actual, getNoShowThresholds: mocks.getNoShowThresholds }
})
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'en'), setRequestLocale: vi.fn() }))
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/Divider', () => ({ default: () => null }))
vi.mock('@/components/Reveal', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children ?? null,
}))

const NUMBERS: PolicyNumbers = {
  km: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  percent: 100,
  waitCityMin: 30,
  waitAirportMin: 60,
}
const OTHER: PolicyNumbers = {
  km: 250,
  freeHoursShort: 3,
  freeHoursLong: 24,
  freeHoursHourly: 6,
  percent: 50,
  waitCityMin: 15,
  waitAirportMin: 45,
}

const LOCALES = routing.locales
const NON_EN = LOCALES.filter((l) => l !== 'en')

type TermsContent = { section4: { title: string; items: { label: string; desc: string }[] } }
type FaqContent = { sections: { title: string; faqs: { q: string; a: string }[] }[] }
const terms = (l: string) => getPageContent('terms', l) as TermsContent
const faq = (l: string) => getPageContent('faq', l) as FaqContent

// A typed number: any digit that is not the refund-processing window (5 to 10 business days, which is not an admin setting).
function hasTypedNumber(text: string): boolean {
  return /\d/.test(text.replace(/\b(?:5|10)\b/g, ''))
}

/** The cancellation answers of the FAQ: the two questions of the cancellation section (index 3). */
const FAQ_CANCEL = { section: 3, faqs: [0, 1] }

describe('fillPolicyNumbers', () => {
  it('fills a plain variable', () => {
    expect(fillPolicyNumbers('up to {km} km, {percent}%', NUMBERS)).toBe('up to 100 km, 100%')
  })

  it('fills every supported variable', () => {
    const text = '{km} {freeHoursShort} {freeHoursLong} {freeHoursHourly} {percent} {waitCityMin} {waitAirportMin}'
    expect(fillPolicyNumbers(text, NUMBERS)).toBe('100 1 12 12 100 30 60')
  })

  it('chooses the plural arm by locale rules, with nested variables', () => {
    const t = '{freeHoursShort, plural, one {{freeHoursShort} hour} other {{freeHoursShort} hours}}'
    expect(fillPolicyNumbers(t, NUMBERS, 'en')).toBe('1 hour')
    expect(fillPolicyNumbers(t, OTHER, 'en')).toBe('3 hours')
  })

  it('uses the few and many arms of Russian and the zero arm of Arabic', () => {
    const ru = '{n, plural, one {{n} час} few {{n} часа} many {{n} часов} other {{n} часа}}'
    const values = (n: number) => ({ ...NUMBERS, n }) as unknown as PolicyNumbers
    expect(fillPolicyNumbers(ru, values(1), 'ru')).toBe('1 час')
    expect(fillPolicyNumbers(ru, values(3), 'ru')).toBe('3 часа')
    expect(fillPolicyNumbers(ru, values(12), 'ru')).toBe('12 часов')
    const ar = '{n, plural, zero {{n} صفر} one {{n} واحد} two {{n} اثنان} few {{n} قليل} many {{n} كثير} other {{n} آخر}}'
    expect(fillPolicyNumbers(ar, values(0), 'ar')).toBe('0 صفر')
    expect(fillPolicyNumbers(ar, values(3), 'ar')).toBe('3 قليل')
  })

  it('leaves an unknown variable visible and the test helper throws on it', () => {
    const out = fillPolicyNumbers('stay {unknown} here', NUMBERS)
    expect(out).toBe('stay {unknown} here')
    expect(() => assertNoUnresolved(out)).toThrow(/Unresolved policy variable/)
    expect(() => assertNoUnresolved('all good 12 hours')).not.toThrow()
  })

  it('keeps apostrophes and text without braces untouched', () => {
    expect(fillPolicyNumbers("jusqu'à {km} km, l'annulation", NUMBERS)).toBe("jusqu'à 100 km, l'annulation")
  })

  it('fills strings deep inside objects and arrays and passes other values through', () => {
    const filled = fillPolicyDeep({ a: ['{km} km', 5, null], b: { c: '{percent}%' } }, NUMBERS)
    expect(filled).toEqual({ a: ['100 km', 5, null], b: { c: '100%' } })
  })

  it('lists the variables a raw string uses, plural blocks included', () => {
    const t = '{km} and {freeHoursShort, plural, one {{freeHoursShort} hour} other {{freeHoursShort} hours}}'
    expect(policyVariablesIn(t)).toEqual(['freeHoursShort', 'km'])
  })
})

describe('getPolicyNumbers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the policy and the no-show wait to the wording variables', async () => {
    mocks.getCancellationPolicy.mockResolvedValue({
      version: 'v',
      kmThreshold: 250,
      freeHoursShort: 3,
      freeHoursLong: 24,
      freeHoursHourly: 6,
      feePercent: 50,
    })
    mocks.createClient.mockReturnValue({})
    mocks.getNoShowThresholds.mockResolvedValue({ cityMin: 15, airportMin: 45 })
    expect(await getPolicyNumbers()).toEqual(OTHER)
  })

  it('falls back to the default wait when the client cannot be built (build without Supabase env)', async () => {
    mocks.getCancellationPolicy.mockResolvedValue({
      version: 'v',
      kmThreshold: 100,
      freeHoursShort: 1,
      freeHoursLong: 12,
      freeHoursHourly: 12,
      feePercent: 100,
    })
    mocks.createClient.mockImplementation(() => {
      throw new Error('SUPABASE_URL missing')
    })
    expect(await getPolicyNumbers()).toEqual(NUMBERS)
  })
})

describe('terms page renders the numbers from settings (tracer, CANC-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function renderTerms(n: PolicyNumbers, locale = 'en'): Promise<string> {
    mocks.getCancellationPolicy.mockResolvedValue({
      version: 'v',
      kmThreshold: n.km,
      freeHoursShort: n.freeHoursShort,
      freeHoursLong: n.freeHoursLong,
      freeHoursHourly: n.freeHoursHourly,
      feePercent: n.percent,
    })
    mocks.createClient.mockReturnValue({})
    mocks.getNoShowThresholds.mockResolvedValue({ cityMin: n.waitCityMin, airportMin: n.waitAirportMin })
    const { default: TermsPage } = await import('@/app/[locale]/terms/page')
    const el = await TermsPage({ params: Promise.resolve({ locale }) })
    return renderToStaticMarkup(createElement('div', null, el))
  }

  it('shows the default settings and no unresolved brace', async () => {
    const html = await renderTerms(NUMBERS)
    expect(html).toContain('1 hour before')
    expect(html).toContain('12 hours before')
    expect(html).toContain('100 km')
    expect(html).toContain('30 minutes')
    expect(html).toContain('60 minutes')
    assertNoUnresolved(html.replace(/<[^>]*>/g, ''))
  })

  it('shows a changed setting on the next render (after revalidate)', async () => {
    const html = await renderTerms(OTHER)
    expect(html).toContain('3 hours before')
    expect(html).toContain('24 hours before')
    expect(html).toContain('250 km')
    expect(html).toContain('15 minutes')
    expect(html).toContain('45 minutes')
    expect(html).toContain('up to 50%')
    assertNoUnresolved(html.replace(/<[^>]*>/g, ''))
  })
})

describe('terms section 4 wording (EN)', () => {
  const items = terms('en').section4.items

  it('has the five items in order: free, late, no-show, saved card, refunds', () => {
    expect(items.map((i) => i.label)).toEqual([
      'Free cancellation',
      'Late cancellation',
      'No-show',
      'Saved card as a guarantee',
      'Refunds',
    ])
  })

  it('types no hour, km, minute or percent', () => {
    for (const item of items) {
      expect(hasTypedNumber(`${item.label} ${item.desc}`)).toBe(false)
    }
  })

  it('uses the policy variables and states the decisions of D-01..D-18', () => {
    const all = items.map((i) => i.desc).join(' ')
    for (const v of ['km', 'freeHoursShort', 'freeHoursLong', 'freeHoursHourly', 'percent', 'waitCityMin', 'waitAirportMin']) {
      expect(policyVariablesIn(all)).toContain(v)
    }
    expect(items[1].desc).toMatch(/decides/)
    expect(items[1].desc).toMatch(/waive/)
    expect(items[2].desc).toMatch(/decides/)
    expect(items[2].desc).toMatch(/full fare/)
    expect(items[3].desc).toMatch(/cash/)
    expect(items[3].desc).toMatch(/only by a person/)
    expect(items[4].desc).toMatch(/5.10 business days/)
    expect(items[4].desc).toMatch(/flight is cancelled/)
    expect(items[4].desc).toMatch(/full refund or a new booking/)
  })

  it('does not mention counsel', () => {
    expect(JSON.stringify(terms('en').section4)).not.toMatch(/counsel|lawyer|attorney/i)
  })
})

describe('FAQ cancellation answers (EN)', () => {
  const faqs = faq('en').sections[FAQ_CANCEL.section].faqs

  it('keeps the cancellation section at index 3 with the four questions', () => {
    expect(faq('en').sections[FAQ_CANCEL.section].title).toBe('Cancellation')
    expect(faqs.map((f) => f.q)).toEqual([
      'Can I cancel my booking?',
      'Can I change the pickup time?',
      'What happens if I do not show up?',
      'Why is my card saved if I pay cash to the driver?',
    ])
  })

  it('types no number in the cancellation answers', () => {
    for (const f of faqs) expect(/\d/.test(`${f.q} ${f.a}`)).toBe(false)
  })

  it('states the windows, the operator decision, the email link and that a change is a request', () => {
    expect(policyVariablesIn(faqs[0].a)).toEqual(['freeHoursHourly', 'freeHoursLong', 'freeHoursShort', 'km', 'percent'])
    expect(faqs[0].a).toMatch(/decides every charge and may waive it/)
    expect(faqs[0].a).toMatch(/confirmation email/)
    expect(faqs[1].a).toMatch(/is a request/)
    expect(faqs[1].a).toMatch(/we confirm it/)
    expect(policyVariablesIn(faqs[2].a)).toEqual(['waitAirportMin', 'waitCityMin'])
    expect(faqs[3].a).toMatch(/guarantee/)
  })

  it('keeps the cancelled-flight promise (full refund or reschedule, D-05)', () => {
    const q = faq('en').sections[2].faqs.find((f) => f.q === 'What if my flight is cancelled?')
    expect(q?.a).toMatch(/refund in full/)
  })
})

describe('FAQ page: visible text and FAQPage JSON-LD are the same filled copy (CANC-02)', () => {
  async function renderFaq(n: PolicyNumbers, locale = 'en'): Promise<string> {
    mocks.getCancellationPolicy.mockResolvedValue({
      version: 'v',
      kmThreshold: n.km,
      freeHoursShort: n.freeHoursShort,
      freeHoursLong: n.freeHoursLong,
      freeHoursHourly: n.freeHoursHourly,
      feePercent: n.percent,
    })
    mocks.createClient.mockReturnValue({})
    mocks.getNoShowThresholds.mockResolvedValue({ cityMin: n.waitCityMin, airportMin: n.waitAirportMin })
    const { default: FaqPage } = await import('@/app/[locale]/faq/page')
    const el = await FaqPage({ params: Promise.resolve({ locale }) })
    return renderToStaticMarkup(createElement('div', null, el))
  }

  type Schema = { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
  function faqSchema(html: string): Schema {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const found = blocks.find((b) => b['@type'] === 'FAQPage')
    expect(found).toBeDefined()
    return found as Schema
  }

  const decode = (s: string) =>
    s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  const visibleText = (html: string) =>
    decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '))

  it.each([
    ['defaults', NUMBERS],
    ['changed settings', OTHER],
  ])('%s: each JSON-LD answer is a plain filled string equal to the visible answer', async (_name, numbers) => {
    const html = await renderFaq(numbers)
    const schema = faqSchema(html)
    const text = visibleText(html)
    for (const e of schema.mainEntity) {
      expect(typeof e.acceptedAnswer.text).toBe('string')
      assertNoUnresolved(e.acceptedAnswer.text)
      expect(text).toContain(e.acceptedAnswer.text.replace(/\s+/g, ' '))
    }
    const cancel = schema.mainEntity.find((e) => e.name === 'Can I cancel my booking?')
    expect(cancel?.acceptedAnswer.text).toContain(`up to ${numbers.km} km`)
    expect(cancel?.acceptedAnswer.text).toContain(`${numbers.percent}%`)
    assertNoUnresolved(text)
  })

  it.each(LOCALES)('%s: the rendered page has no unresolved variable and the JSON-LD matches the visible text', async (locale) => {
    const html = await renderFaq(OTHER, locale)
    const schema = faqSchema(html)
    const text = visibleText(html)
    for (const e of schema.mainEntity) {
      assertNoUnresolved(e.acceptedAnswer.text)
      expect(text).toContain(e.acceptedAnswer.text.replace(/\s+/g, ' '))
    }
    assertNoUnresolved(text)
  })

  it('a changed setting shows in both places', async () => {
    const html = await renderFaq(OTHER)
    const cancel = faqSchema(html).mainEntity.find((e) => e.name === 'Can I cancel my booking?')
    expect(cancel?.acceptedAnswer.text).toContain('up to 3 hours before pickup on trips of up to 250 km')
    expect(visibleText(html)).toContain('up to 3 hours before pickup on trips of up to 250 km')
  })
})

describe('terms page in every locale: no unresolved variable (CANC-02)', () => {
  it.each(LOCALES)('%s', async (locale) => {
    mocks.getCancellationPolicy.mockResolvedValue({
      version: 'v',
      kmThreshold: OTHER.km,
      freeHoursShort: OTHER.freeHoursShort,
      freeHoursLong: OTHER.freeHoursLong,
      freeHoursHourly: OTHER.freeHoursHourly,
      feePercent: OTHER.percent,
    })
    mocks.createClient.mockReturnValue({})
    mocks.getNoShowThresholds.mockResolvedValue({ cityMin: OTHER.waitCityMin, airportMin: OTHER.waitAirportMin })
    const { default: TermsPage } = await import('@/app/[locale]/terms/page')
    const el = await TermsPage({ params: Promise.resolve({ locale }) })
    const text = renderToStaticMarkup(createElement('div', null, el)).replace(/<[^>]*>/g, ' ')
    assertNoUnresolved(text)
    for (const n of [OTHER.km, OTHER.freeHoursLong, OTHER.waitAirportMin]) expect(text).toContain(String(n))
  })
})

describe('translations of terms section 4 and the FAQ cancellation block (ru, es, fr, ar, hi, zh)', () => {
  const en = terms('en').section4.items
  const enFaq = faq('en').sections[FAQ_CANCEL.section].faqs

  it('covers all six non-English locales', () => {
    expect(NON_EN).toEqual(['ru', 'es', 'fr', 'ar', 'hi', 'zh'])
  })

  describe.each(NON_EN)('%s', (locale) => {
    const items = terms(locale).section4.items
    const faqs = faq(locale).sections[FAQ_CANCEL.section].faqs

    it('terms: five items, each really translated and carrying the same variables as English', () => {
      expect(items).toHaveLength(en.length)
      items.forEach((item, i) => {
        expect(item.label).not.toBe(en[i].label)
        expect(item.desc).not.toBe(en[i].desc)
        expect(policyVariablesIn(item.desc)).toEqual(policyVariablesIn(en[i].desc))
        expect(hasTypedNumber(`${item.label} ${item.desc}`)).toBe(false)
      })
    })

    it('terms: the brand is spelled Prestigo', () => {
      const all = JSON.stringify(items)
      expect(all).not.toMatch(/Prestigio/)
      expect(all).toMatch(/Prestigo/)
    })

    it('terms: rendered with two different settings, no brace is left and the numbers flow through', () => {
      for (const [numbers, shown] of [
        [NUMBERS, ['100', '12', '30', '60']],
        [OTHER, ['250', '3', '24', '6', '15', '45']],
      ] as [PolicyNumbers, string[]][]) {
        const rendered = fillPolicyDeep(items, numbers, locale)
        const text = rendered.map((i) => i.desc).join(' ')
        assertNoUnresolved(text)
        for (const n of shown) expect(text).toContain(n)
      }
    })

    it('faq: the same four questions, translated, with the same variables as English', () => {
      expect(faqs).toHaveLength(enFaq.length)
      faqs.forEach((f, i) => {
        expect(f.q).not.toBe(enFaq[i].q)
        expect(f.a).not.toBe(enFaq[i].a)
        expect(policyVariablesIn(f.a)).toEqual(policyVariablesIn(enFaq[i].a))
        expect(/\d/.test(`${f.q} ${f.a}`)).toBe(false)
      })
    })

    it('faq: rendered with a changed setting, no brace is left', () => {
      for (const f of fillPolicyDeep(faqs, OTHER, locale)) assertNoUnresolved(`${f.q} ${f.a}`)
    })

    it('terms and FAQ state the same numbers for the same settings', () => {
      const termsText = fillPolicyDeep(items, OTHER, locale).map((i) => i.desc).join(' ')
      const faqText = fillPolicyDeep(faqs, OTHER, locale).map((f) => f.a).join(' ')
      for (const n of ['250', '3', '24', '6', '15', '45']) {
        expect(termsText).toContain(n)
        expect(faqText).toContain(n)
      }
    })
  })

  it('Russian plural forms follow the setting (1 hour, 3 hours, 12 hours)', () => {
    const d = terms('ru').section4.items[0].desc
    expect(fillPolicyNumbers(d, NUMBERS, 'ru')).toContain('за 1 час до подачи')
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 3 }, 'ru')).toContain('за 3 часа до подачи')
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 12 }, 'ru')).toContain('за 12 часов до подачи')
  })

  it('Arabic plural forms follow the setting (one, two, few, many)', () => {
    const d = terms('ar').section4.items[0].desc
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 1 }, 'ar')).toContain('حتى ساعة واحدة قبل')
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 2 }, 'ar')).toContain('حتى ساعتين قبل')
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 5 }, 'ar')).toContain('حتى 5 ساعات قبل')
    expect(fillPolicyNumbers(d, { ...NUMBERS, freeHoursShort: 12 }, 'ar')).toContain('حتى 12 ساعة قبل')
  })

  it('French keeps its apostrophes and the singular hour', () => {
    const d = terms('fr').section4.items[0].desc
    expect(fillPolicyNumbers(d, NUMBERS, 'fr')).toContain("jusqu'à 1 heure avant la prise en charge")
  })
})
