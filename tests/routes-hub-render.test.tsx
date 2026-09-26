/**
 * Byte-parity proof for the /routes hub (75-09-PLAN.md): a golden EN
 * snapshot captured from the pre-refactor page (every visible string still
 * hardcoded in JSX, destination/country names read straight off
 * lib/routes.ts and the DB) proves the content-model refactor — moving
 * every EN chrome string verbatim into content/pages/en/routes.json,
 * localized destinationNames/countryNames maps, and locale-preserving
 * hrefs via getPathname() — produces byte-identical EN output.
 *
 * Mirrors tests/book-page-render.test.tsx's technique. Unlike /book, the
 * hub also calls @/lib/route-prices getAllRoutes (top-10 "Most popular"
 * section + generateMetadata's 4 headline prices), so that module is
 * mocked with a deterministic fixture (tests/helpers/route-content-parity's
 * FIXTURE_PRICES) instead of hitting Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { FIXTURE_PRICES } from './helpers/route-content-parity'

function readContentJson(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'content', 'pages', locale, 'routes.json')
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

// DNT tokens (i18n/glossary.json doNotTranslate + phone) that must reappear
// verbatim in every translated locale (T-75-17). PRESTIGO/E-Class/S-Class/
// V-Class/the dispatch phone all appear somewhere in the EN chrome.
const DNT_TOKENS = ['PRESTIGO', 'E-Class', 'S-Class', 'V-Class', '+420 725 986 855']

function collectStrings(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.flatMap(collectStrings)
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStrings)
  }
  return typeof obj === 'string' ? [obj] : []
}

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    ...rest
  }: {
    src: string
    alt: string
    fill?: boolean
    priority?: boolean
    [key: string]: unknown
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />
  },
}))

// Deterministic top-10 fixture ordered by display_order, covering the 4
// slugs generateMetadata() looks up (vienna/berlin/munich/budapest) plus 6
// more real ROUTES slugs. Every price field uses the shared FIXTURE_PRICES
// trio so the golden snapshot stays stable regardless of live DB data.
const MOCK_ROUTES = [
  { slug: 'prague-vienna', fromLabel: 'Prague', toLabel: 'Vienna', distanceKm: 295, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 1, placeIds: [] },
  { slug: 'prague-berlin', fromLabel: 'Prague', toLabel: 'Berlin', distanceKm: 350, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 2, placeIds: [] },
  { slug: 'prague-munich', fromLabel: 'Prague', toLabel: 'Munich', distanceKm: 385, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 3, placeIds: [] },
  { slug: 'prague-budapest', fromLabel: 'Prague', toLabel: 'Budapest', distanceKm: 535, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 4, placeIds: [] },
  { slug: 'prague-bratislava', fromLabel: 'Prague', toLabel: 'Bratislava', distanceKm: 330, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 5, placeIds: [] },
  { slug: 'prague-brno', fromLabel: 'Prague', toLabel: 'Brno', distanceKm: 205, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 6, placeIds: [] },
  { slug: 'prague-dresden', fromLabel: 'Prague', toLabel: 'Dresden', distanceKm: 150, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 7, placeIds: [] },
  { slug: 'prague-salzburg', fromLabel: 'Prague', toLabel: 'Salzburg', distanceKm: 305, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 8, placeIds: [] },
  { slug: 'prague-krakow', fromLabel: 'Prague', toLabel: 'Kraków', distanceKm: 385, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 9, placeIds: [] },
  { slug: 'prague-leipzig', fromLabel: 'Prague', toLabel: 'Leipzig', distanceKm: 270, eClassEur: FIXTURE_PRICES.ePrice, sClassEur: FIXTURE_PRICES.sPrice, vClassEur: FIXTURE_PRICES.vPrice, displayOrder: 10, placeIds: [] },
]

const getAllRoutesMock = vi.fn(async () => MOCK_ROUTES)

vi.mock('@/lib/route-prices', () => ({
  getAllRoutes: () => getAllRoutesMock(),
}))

beforeEach(() => {
  // jsdom does not implement IntersectionObserver — Reveal (used throughout
  // the hub) creates one in a useEffect. A minimal stub is enough here.
  class MockIntersectionObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

describe('RoutesPage — render byte-parity proof (EN golden)', () => {
  it('renders and matches the golden EN snapshot', async () => {
    const { default: RoutesPage } = await import('@/app/[locale]/routes/page')
    const { render } = await import('@testing-library/react')

    const PageElement = await RoutesPage({ params: Promise.resolve({ locale: 'en' }) })
    const { container } = render(PageElement)

    expect(container.innerHTML).toMatchSnapshot()
  })
})

// 75-09 D-06/D-07/D-08: /routes is now driven by content/pages/<locale>/routes.json
// plus localized destinationNames/countryNames — a real Russian render must
// show the translated hero headline, the ru name for Berlin, and the ru
// first FAQ question, contain neither "beats the train" nor "Most popular
// routes", every single-slash href must start with /ru/, the FAQPage
// JSON-LD first question must equal the visible first question, and
// generateMetadata('ru') must return the ru title.
describe('RoutesPage — ru render shows localized content, not EN (VER-01)', () => {
  it('renders ru hero/destination-name/FAQ content, hides EN strings, and locale-prefixes every href', async () => {
    const { default: RoutesPage } = await import('@/app/[locale]/routes/page')
    const { render } = await import('@testing-library/react')
    const ru = readContentJson('ru') as {
      hero: { headlineItalic: string }
      destinationNames: Record<string, string>
      faq: { items: { q: string }[] }
    }

    const PageElement = await RoutesPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(ru.hero.headlineItalic)
    expect(html).toContain(ru.destinationNames['prague-berlin'])
    expect(html).toContain(ru.faq.items[0].q)
    expect(html).not.toContain('beats the train')
    expect(html).not.toContain('Most popular routes')

    // Every single-slash-prefixed href in the rendered markup starts with
    // /ru/ (getPathname locale-prefixing, including the template-literal
    // /routes/<slug> card links).
    const hrefs = Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href.startsWith('/ru/')).toBe(true)
    }
  })

  it('FAQPage JSON-LD first question equals the visible ru first question', async () => {
    const { default: RoutesPage } = await import('@/app/[locale]/routes/page')
    const { render } = await import('@testing-library/react')
    const ru = readContentJson('ru') as { faq: { items: { q: string }[] } }

    const PageElement = await RoutesPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(scriptMatch).not.toBeNull()
    const jsonLd = JSON.parse(scriptMatch![1])
    const faqNode = jsonLd['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faqNode.mainEntity[0].name).toBe(ru.faq.items[0].q)
  })

  it("generateMetadata('ru') returns the ru title", async () => {
    const { generateMetadata } = await import('@/app/[locale]/routes/page')
    const ru = readContentJson('ru') as { metadata: { title: string } }

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })

    expect(metadata.title).toBe(ru.metadata.title)
  })
})

// 75-09 Task 2: structural + DNT parity across all 6 non-EN locale files
// (T-75-17). Text VALUES are not compared to EN here (that's the point of
// translation) — only key set, leaf type, array length, and DNT-token
// verbatim reappearance.
describe('routes.json — structural + DNT parity across all 6 non-EN locales', () => {
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

      // No translated (non-DNT) PROSE value is left byte-identical to EN.
      // destinationNames, countryNames, longDistance.destinations and
      // fromToLabel are excluded from this check: many Central/Western
      // European place and country names have no distinct exonym in a
      // given locale (e.g. "Linz", "Brno", "Innsbruck", "Austria" are
      // spelled identically in es/fr/en, and fromToLabel embeds "Prague"
      // which is unchanged in French) — that is a correct translation, not
      // a leak. The destinationNames<->route-file hero.label consistency
      // test below is the real fidelity check for the place-name field.
      const PLACE_NAME_FIELDS = ['destinationNames', 'countryNames', 'fromToLabel'] as const
      // A short, explicit allowlist of everyday words that happen to be
      // spelled identically across locales (Latin-root cognates) — narrower
      // than DNT_TOKENS (those are never translated; these ARE genuine,
      // correct translations that coincide with the EN spelling).
      const IDENTICAL_COGNATE_ALLOWLIST = ['Distance']
      function stripPlaceNameFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
        const copy: Record<string, unknown> = { ...obj }
        for (const f of PLACE_NAME_FIELDS) delete copy[f]
        const longDist = copy.longDistance as { destinations?: unknown; [k: string]: unknown } | undefined
        if (longDist) {
          const { destinations: _d, ...rest } = longDist
          copy.longDistance = rest
        }
        return copy
      }

      const enProse = stripPlaceNameFields(en)
      const localeProse = stripPlaceNameFields(content)

      const enStrings = new Set(collectStrings(enProse))
      const translatedStrings = collectStrings(localeProse).filter(
        (s) => !DNT_TOKENS.includes(s) && !IDENTICAL_COGNATE_ALLOWLIST.includes(s)
      )
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

  // Every locale's destinationNames[slug] occurs inside that same locale's
  // route file hero.label (single-naming consistency per slug).
  it.each(['ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const)(
    '%s: destinationNames[slug] occurs in content/routes/%s/<slug>.json hero.label',
    (locale) => {
      const content = readContentJson(locale) as { destinationNames: Record<string, string> }
      for (const [slug, name] of Object.entries(content.destinationNames)) {
        const routeFile = path.join(process.cwd(), 'content', 'routes', locale, `${slug}.json`)
        const routeContent = JSON.parse(fs.readFileSync(routeFile, 'utf-8')) as { hero: { label: string } }
        expect(routeContent.hero.label).toContain(name)
      }
    }
  )
})

// 75-09 Task 2: render assertions for ar and zh — the two RTL/CJK locales
// the plan explicitly names for a real-render backstop beyond the JSON
// structural parity check above.
describe('RoutesPage — ar and zh render show localized content with locale-prefixed hrefs (VER-01)', () => {
  it('ar: renders the Arabic hero headline and locale-prefixes every href', async () => {
    const { default: RoutesPage } = await import('@/app/[locale]/routes/page')
    const { render } = await import('@testing-library/react')
    const ar = readContentJson('ar') as { hero: { headlineItalic: string } }

    const PageElement = await RoutesPage({ params: Promise.resolve({ locale: 'ar' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(ar.hero.headlineItalic)

    const hrefs = Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href.startsWith('/ar/')).toBe(true)
    }
  })

  it('zh: renders the Chinese hero headline and locale-prefixes every href', async () => {
    const { default: RoutesPage } = await import('@/app/[locale]/routes/page')
    const { render } = await import('@testing-library/react')
    const zh = readContentJson('zh') as { hero: { headlineItalic: string } }

    const PageElement = await RoutesPage({ params: Promise.resolve({ locale: 'zh' }) })
    const { container } = render(PageElement)
    const html = container.innerHTML

    expect(html).toContain(zh.hero.headlineItalic)

    const hrefs = Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href.startsWith('/zh/')).toBe(true)
    }
  })
})
