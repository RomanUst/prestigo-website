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
