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
