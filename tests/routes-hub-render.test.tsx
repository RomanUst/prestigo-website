/**
 * Byte-parity proof for the /routes hub (75-09-PLAN.md): a golden EN
 * snapshot captured from the pre-refactor page (every visible string still
 * hardcoded in JSX, destination/country names read straight off
 * lib/routes.ts and the DB) proves the content-model refactor — moving
 * every EN chrome string verbatim into content/pages/en/routes.json,
 * localized destinationNames/countryNames maps, and locale-preserving
 * hrefs via getPathname() — produces byte-identical EN output.
 *
 * This first commit captures ONLY the golden snapshot against the
 * still-unrefactored page (golden-snapshot-first ordering, 75-06/07/08
 * precedent) — the ru/ar/zh/parity assertions are added in the next commit
 * once the content model + refactor exist to satisfy them.
 *
 * Mirrors tests/book-page-render.test.tsx's technique. Unlike /book, the
 * hub also calls @/lib/route-prices getAllRoutes (top-10 "Most popular"
 * section + generateMetadata's 4 headline prices), so that module is
 * mocked with a deterministic fixture (tests/helpers/route-content-parity's
 * FIXTURE_PRICES) instead of hitting Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FIXTURE_PRICES } from './helpers/route-content-parity'

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
  getAllRoutes: (...args: unknown[]) => getAllRoutesMock(...args),
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
