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

    const { container } = render(MultiDayPage())

    expect(container.innerHTML).toMatchSnapshot()
  })
})
