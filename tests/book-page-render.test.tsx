/**
 * Byte-parity proof for /book (75-06-PLAN.md): a golden EN snapshot
 * captured from the pre-refactor page (every visible string still
 * hardcoded in JSX) proves the content-model refactor — moving every EN
 * string verbatim into content/pages/en/book.json and wiring the page to
 * getPageContent('book', locale) — produces byte-identical EN output.
 *
 * Mirrors tests/route-page-render.test.tsx's render-and-snapshot technique
 * and tests/force-static-metadata.test.tsx's real-content-JSON-on-disk
 * pattern (no getPageContent mock — content/pages/<locale>/book.json is
 * read directly from disk via fs, same as production).
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function readContentJson(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'content', 'pages', locale, 'book.json')
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// Flattens every leaf value of a JSON content tree into a map of
// dot/bracket path -> { type, arrayLength? } so two locale files can be
// compared key-by-key, type-by-type, array-length-by-array-length without
// caring about the actual translated text.
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

// DNT tokens (i18n/glossary.json doNotTranslate + phone/email) that must
// reappear verbatim in every translated locale (T-75-17).
const DNT_TOKENS = ['PRESTIGO', 'E-Class', 'S-Class', 'V-Class', '+420 725 986 855', 'info@rideprestigo.com']

function collectStrings(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.flatMap(collectStrings)
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStrings)
  }
  return typeof obj === 'string' ? [obj] : []
}

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/booking/BookingWizard', () => ({
  default: () => <div data-testid="booking-wizard-marker" />,
}))

describe('BookPage — render byte-parity proof (EN golden)', () => {
  it('renders and matches the golden EN snapshot', async () => {
    const { default: BookPage } = await import('@/app/[locale]/book/page')
    const { render } = await import('@testing-library/react')

    const PageElement = await BookPage({ params: Promise.resolve({ locale: 'en' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toMatchSnapshot()
  })
})

// 75-06 D-06/D-08: /book is now driven by content/pages/<locale>/book.json —
// a real Russian render must show the translated hero headline and step 1
// title, and show NEITHER of the corresponding hardcoded EN strings.
describe('BookPage — ru render shows localized content, not EN (VER-01)', () => {
  it('renders the ru hero headline and step-1 title, and contains no EN hero/step strings', async () => {
    const { default: BookPage } = await import('@/app/[locale]/book/page')
    const { render } = await import('@testing-library/react')

    const PageElement = await BookPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain('подтверждён за секунды.')
    expect(html).toContain('Выберите маршрут')
    expect(html).not.toContain('confirmed in seconds.')
    expect(html).not.toContain('Choose your route')
  })
})

// 75-06 Task 2: structural + DNT parity across all 6 non-EN locale files
// (T-75-17). Text VALUES are not compared to EN here (that's the point of
// translation) — only key set, leaf type, array length, and DNT-token
// verbatim reappearance.
describe('book.json — structural + DNT parity across all 6 non-EN locales', () => {
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
      const enStrings = new Set(collectStrings(en))
      const translatedStrings = collectStrings(content).filter((s) => !DNT_TOKENS.includes(s))
      for (const s of translatedStrings) {
        if (DNT_TOKENS.some((t) => s === t)) continue
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

// 75-06 Task 2: render assertions for ar and zh — the two locales the plan
// explicitly names for a real-render backstop beyond the JSON-structural
// parity check above.
describe('BookPage — ar and zh render show the localized hero headline (VER-01)', () => {
  it('ar: renders the Arabic hero headline', async () => {
    const { default: BookPage } = await import('@/app/[locale]/book/page')
    const { render } = await import('@testing-library/react')
    const ar = readContentJson('ar') as { hero: { headlineItalic: string } }

    const PageElement = await BookPage({ params: Promise.resolve({ locale: 'ar' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toContain(ar.hero.headlineItalic)
  })

  it('zh: renders the Chinese hero headline', async () => {
    const { default: BookPage } = await import('@/app/[locale]/book/page')
    const { render } = await import('@testing-library/react')
    const zh = readContentJson('zh') as { hero: { headlineItalic: string } }

    const PageElement = await BookPage({ params: Promise.resolve({ locale: 'zh' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toContain(zh.hero.headlineItalic)
  })
})
