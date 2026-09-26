/**
 * Byte-parity proof for /fleet (75-08-PLAN.md): a golden EN snapshot
 * captured from the pre-refactor page (every visible string still
 * hardcoded in JSX) proves the content-model refactor — moving every EN
 * string verbatim into content/pages/en/fleet.json and wiring the page to
 * getPageContent('fleet', locale) — produces byte-identical EN output.
 *
 * Mirrors tests/book-page-render.test.tsx's technique (real content JSON on
 * disk via fs, no getPageContent mock — same as production).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function readContentJson(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'content', 'pages', locale, 'fleet.json')
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

// DNT tokens (i18n/glossary.json doNotTranslate + email + structural
// placeholders) that must reappear verbatim in every translated locale
// (T-75-17). Numeric facts embedded in FAQ prose (540-litre, 25,000 km,
// etc.) are DELIBERATELY excluded here — thousands-separator style is a
// locale-formatting concern (Russian/French use a space, not a comma), not
// a DNT concern; the actual structural specs (seating, luggage counts,
// cargoVolume) live in code (VehicleSpec), never in content JSON.
const DNT_TOKENS = [
  'PRESTIGO',
  'Mercedes-Benz',
  'E-Class',
  'S-Class',
  'V-Class',
  'info@rideprestigo.com',
  '{model}',
  '{className}',
  '{n}',
  '{cases}',
  '{bags}',
]

function collectStrings(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.flatMap(collectStrings)
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStrings)
  }
  return typeof obj === 'string' ? [obj] : []
}

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

beforeEach(() => {
  // jsdom does not implement IntersectionObserver — Reveal (used throughout
  // the page) creates one in a useEffect. A minimal stub is enough here.
  class MockIntersectionObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

describe('FleetPage — render byte-parity proof (EN golden)', () => {
  it('renders and matches the golden EN snapshot', async () => {
    const { default: FleetPage } = await import('@/app/[locale]/fleet/page')
    const { render } = await import('@testing-library/react')

    const PageElement = await FleetPage({ params: Promise.resolve({ locale: 'en' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toMatchSnapshot()
  })
})

// 75-08 D-06/D-08: /fleet is now driven by content/pages/<locale>/fleet.json —
// a real Russian render must show the translated hero headline and step 1
// FAQ question, and show NEITHER of the corresponding hardcoded EN strings.
// The FAQPage JSON-LD first question must equal the ru visible first
// question (D-06 — visible and structured FAQ never diverge).
describe('FleetPage — ru render shows localized content, not EN (VER-01)', () => {
  it('renders the ru hero italic line and first FAQ question, contains no EN hero/standards strings, and the FAQPage JSON-LD first question matches the visible one', async () => {
    const { default: FleetPage } = await import('@/app/[locale]/fleet/page')
    const { render } = await import('@testing-library/react')
    const ru = readContentJson('ru') as { hero: { headlineItalic: string }; faq: { items: { q: string }[] } }

    const PageElement = await FleetPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(ru.hero.headlineItalic)
    expect(html).toContain(ru.faq.items[0].q)
    expect(html).not.toContain('Part of the experience.')
    expect(html).not.toContain('Every vehicle, every time')

    const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(scriptMatch).not.toBeNull()
    const jsonLd = JSON.parse(scriptMatch![1])
    const faqNode = jsonLd['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faqNode.mainEntity[0].name).toBe(ru.faq.items[0].q)
  })

  it('generateMetadata returns the ru title', async () => {
    const { generateMetadata } = await import('@/app/[locale]/fleet/page')
    const ru = readContentJson('ru') as { metadata: { title: string } }

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })

    expect(metadata.title).toBe(ru.metadata.title)
  })
})

// 75-08 Task 2: structural + DNT parity across all 6 non-EN locale files
// (T-75-17). Text VALUES are not compared to EN here (that's the point of
// translation) — only key set, leaf type, array length, and DNT-token
// verbatim reappearance.
describe('fleet.json — structural + DNT parity across all 6 non-EN locales', () => {
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

// 75-08 Task 2: render assertions for ar and zh — the hero italic line
// renders localized (and the EN hero italic is absent), and the FAQPage
// JSON-LD first question equals the visible first question.
describe('FleetPage — ar and zh render show localized content with matching FAQ schema (VER-01)', () => {
  it.each(['ar', 'zh'] as const)('%s: renders the localized hero italic line, no EN hero italic, and FAQPage JSON-LD matches visible FAQ', async (locale) => {
    const { default: FleetPage } = await import('@/app/[locale]/fleet/page')
    const { render } = await import('@testing-library/react')
    const localeContent = readContentJson(locale) as { hero: { headlineItalic: string }; faq: { items: { q: string }[] } }

    const PageElement = await FleetPage({ params: Promise.resolve({ locale }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(localeContent.hero.headlineItalic)
    expect(html).not.toContain('Part of the experience.')

    const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(scriptMatch).not.toBeNull()
    const jsonLd = JSON.parse(scriptMatch![1])
    const faqNode = jsonLd['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faqNode.mainEntity[0].name).toBe(localeContent.faq.items[0].q)
  })
})
