/**
 * Byte-parity proof for /book/multi-day (75-07-PLAN.md): a golden EN
 * snapshot captured from the pre-refactor page (every visible string still
 * hardcoded in JSX) proves the content-model refactor — moving every EN
 * string verbatim into content/pages/en/book/multi-day.json and wiring the
 * page to getPageContent('book/multi-day', locale) — produces byte-identical
 * EN output.
 *
 * Mirrors tests/book-page-render.test.tsx's technique (75-06).
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function readContentJson(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'content', 'pages', locale, 'book', 'multi-day.json')
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// Flattens every leaf value of a JSON content tree into a map of
// dot/bracket path -> { type, arrayLength? } so two locale files can be
// compared key-by-key, type-by-type, array-length-by-array-length without
// caring about the actual translated text (75-06 pattern).
type LeafInfo = { type: string; arrayLength?: number }
function flattenLeaves(obj: unknown, prefix = ''): Record<string, LeafInfo> {
  const out: Record<string, LeafInfo> = {}
  if (Array.isArray(obj)) {
    out[`${prefix}[]`] = { type: 'array', arrayLength: obj.length }
    obj.forEach((item, i) => Object.assign(out, flattenLeaves(item, `${prefix}[${i}]`)))
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      Object.assign(out, flattenLeaves(v, prefix ? `${prefix}.${k}` : k))
    }
  } else {
    out[prefix] = { type: typeof obj }
  }
  return out
}

// DNT tokens (i18n/glossary.json doNotTranslate, plus the {day} ICU-style
// placeholder) that must reappear verbatim in every translated locale
// (T-75-17).
const DNT_TOKENS = ['PRESTIGO', 'E-Class', 'S-Class', 'V-Class', '{day}']

// Values allowed to stay byte-identical to EN per locale without failing
// the "no non-DNT value is byte-identical to EN" check below — narrower
// than DNT_TOKENS because these are locale-specific choices, not universal
// do-not-translate terms. hi keeps the TRANSFER badge in Latin script,
// matching the established convention in messages/hi.json's
// Booking.dayCard.transferTab (the badge is still translated in every
// other locale, so this must not be a global DNT_TOKENS entry).
const PER_LOCALE_IDENTICAL_EXEMPTIONS: Record<string, string[]> = {
  hi: ['TRANSFER'],
}

function collectStrings(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.flatMap(collectStrings)
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStrings)
  }
  return typeof obj === 'string' ? [obj] : []
}

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/booking/MultiDayForm', () => ({
  default: () => <div data-testid="multiday-form-marker" />,
}))
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    ...rest
  }: {
    src: string
    alt: string
    fill?: boolean
    [key: string]: unknown
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />
  },
}))

describe('MultiDayPage — render byte-parity proof (EN golden)', () => {
  it('renders and matches the golden EN snapshot', async () => {
    const { default: MultiDayPage } = await import('@/app/[locale]/book/multi-day/page')
    const { render } = await import('@testing-library/react')

    const PageElement = await MultiDayPage({ params: Promise.resolve({ locale: 'en' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toMatchSnapshot()
  })
})

// 75-07 D-06/D-08: /book/multi-day is now driven by
// content/pages/<locale>/book/multi-day.json — a real Russian render must
// show the translated first example itinerary title and the translated
// first FAQ question, and show NEITHER of the corresponding hardcoded EN
// strings (nor the EN 'Example itineraries' section heading).
describe('MultiDayPage — ru render shows localized content, not EN (VER-01)', () => {
  it('renders the ru first example title and first FAQ question, and contains no EN equivalents', async () => {
    const { default: MultiDayPage } = await import('@/app/[locale]/book/multi-day/page')
    const { render } = await import('@testing-library/react')
    const ru = readContentJson('ru') as {
      examples: { items: { title: string }[] }
      faq: { items: { q: string }[] }
    }

    const PageElement = await MultiDayPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(ru.examples.items[0].title)
    expect(html).toContain(ru.faq.items[0].q)
    expect(html).not.toContain('Executive trip — Prague to Vienna')
    expect(html).not.toContain('Example itineraries')
  })
})

// 75-07 Task 2: structural + DNT parity across all 6 non-EN locale files
// (T-75-17). Text VALUES are not compared to EN here (that's the point of
// translation) — only key set, leaf type, array length, and DNT-token
// verbatim reappearance.
describe('book/multi-day.json — structural + DNT parity across all 6 non-EN locales', () => {
  const en = readContentJson('en')
  const enLeaves = flattenLeaves(en)

  it.each(['ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const)(
    '%s: same flattened key set, leaf types, array lengths as EN; no non-DNT value is byte-identical to EN; every DNT token reappears verbatim',
    (locale) => {
      const content = readContentJson(locale)
      const leaves = flattenLeaves(content)

      expect(Object.keys(leaves).sort()).toEqual(Object.keys(enLeaves).sort())
      for (const key of Object.keys(enLeaves)) {
        expect(leaves[key].type).toBe(enLeaves[key].type)
        if (enLeaves[key].type === 'array') {
          expect(leaves[key].arrayLength).toBe(enLeaves[key].arrayLength)
        }
      }

      // No translated (non-DNT) string value is left byte-identical to EN.
      const exemptions = [...DNT_TOKENS, ...(PER_LOCALE_IDENTICAL_EXEMPTIONS[locale] ?? [])]
      const translatedStrings = collectStrings(content).filter((s) => !exemptions.includes(s))
      const enStrings = new Set(collectStrings(en))
      for (const s of translatedStrings) {
        expect(enStrings.has(s)).toBe(false)
      }

      // Every DNT token that appears in an EN string reappears verbatim in
      // the translated locale (checked over the whole joined text so a
      // token embedded mid-sentence still counts).
      const localeText = collectStrings(content).join(' \u0000 ')
      const enText = collectStrings(en).join(' \u0000 ')
      for (const token of DNT_TOKENS) {
        if (enText.includes(token)) {
          expect(localeText).toContain(token)
        }
      }
    }
  )
})

// 75-07 Task 2: render assertions for ar and hi — the two locales the plan
// explicitly names for a real-render backstop beyond the JSON-structural
// parity check above.
describe('MultiDayPage — ar and hi render show the localized first example title (VER-01)', () => {
  it('ar: renders the Arabic first example title and not the EN title', async () => {
    const { default: MultiDayPage } = await import('@/app/[locale]/book/multi-day/page')
    const { render } = await import('@testing-library/react')
    const ar = readContentJson('ar') as { examples: { items: { title: string }[] } }

    const PageElement = await MultiDayPage({ params: Promise.resolve({ locale: 'ar' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(ar.examples.items[0].title)
    expect(html).not.toContain('Executive trip — Prague to Vienna')
  })

  it('hi: renders the Hindi first example title and not the EN title', async () => {
    const { default: MultiDayPage } = await import('@/app/[locale]/book/multi-day/page')
    const { render } = await import('@testing-library/react')
    const hi = readContentJson('hi') as { examples: { items: { title: string }[] } }

    const PageElement = await MultiDayPage({ params: Promise.resolve({ locale: 'hi' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(hi.examples.items[0].title)
    expect(html).not.toContain('Executive trip — Prague to Vienna')
  })
})
