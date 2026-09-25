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

    // Pre-refactor signature: FleetPage() takes no params.
    const PageElement = FleetPage()
    const { container } = render(PageElement)

    expect(container.innerHTML).toMatchSnapshot()
  })
})
