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
