/**
 * Phase 93, plan 93-13 (TRIP-02, TRIP-04; D-09, D-15; T-93-35/36) - the tour page gallery, lightbox, photo credits
 * and the booking area. Layout classes are asserted as literal Tailwind strings (jsdom applies no CSS); the
 * behaviours (focus, keys, restore) run for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import enMessages from '@/messages/en.json'
import arMessages from '@/messages/ar.json'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/',
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import TourGallery, { type TourGalleryPhoto } from '@/components/tours/TourGallery'

const TITLE = 'Dresden Day Trip'

let seq = 0
function photo(over: Partial<TourGalleryPhoto> = {}): TourGalleryPhoto {
  seq += 1
  return {
    id: `p${seq}`,
    storage_path: `tours/t1/p${seq}.jpg`,
    position: seq,
    is_cover: false,
    source: 'own',
    credit_text: null,
    license: null,
    credit_url: null,
    ...over,
  }
}

function photos(n: number): TourGalleryPhoto[] {
  seq = 0
  return Array.from({ length: n }, (_, i) => photo({ is_cover: i === 0 }))
}

function renderGallery(list: TourGalleryPhoto[], locale: 'en' | 'ar' = 'en') {
  const messages = (locale === 'ar' ? arMessages : enMessages) as unknown as AbstractIntlMessages
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TourGallery title={TITLE} photos={list} />
    </NextIntlClientProvider>
  )
}

const imgs = (c: HTMLElement) => Array.from(c.querySelectorAll('img'))
const tiles = () => screen.getAllByRole('listitem')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  pushMock.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  document.body.style.overflow = ''
})

describe('gallery layouts (Surface 1.3)', () => {
  it('1 photo: one full-width image, no Show all button, no counter chip', () => {
    const { container } = renderGallery(photos(1))
    expect(tiles()).toHaveLength(1)
    expect(imgs(container)).toHaveLength(1)
    expect(container.querySelector('ul')!.className).toContain('lg:grid-cols-1')
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    expect(screen.queryByTestId('tour-gallery-chip')).toBeNull()
  })

  it('2 photos: two equal halves and a Show all 2 photos button', () => {
    const { container } = renderGallery(photos(2))
    expect(container.querySelector('ul')!.className).toContain('lg:grid-cols-2')
    expect(screen.getByRole('button', { name: 'Show all 2 photos' })).toBeTruthy()
  })

  it('3 photos: one large tile (two columns, two rows) and two stacked', () => {
    const { container } = renderGallery(photos(3))
    const list = container.querySelector('ul')!
    expect(list.className).toContain('lg:grid-cols-3')
    expect(list.className).toContain('lg:grid-rows-2')
    const [large, ...small] = tiles()
    expect(large.className).toContain('lg:col-span-2')
    expect(large.className).toContain('lg:row-span-2')
    expect(small).toHaveLength(2)
    for (const s of small) expect(s.className).not.toMatch(/lg:(col|row)-span/)
  })

  it('4 photos: one large tile and three stacked with equal rows', () => {
    const { container } = renderGallery(photos(4))
    expect(container.querySelector('ul')!.className).toContain('lg:grid-rows-3')
    expect(tiles()[0].className).toContain('lg:row-span-3')
  })

  it('5 photos: large tile plus a 2x2 grid, no "+" tile', () => {
    const { container } = renderGallery(photos(5))
    const list = container.querySelector('ul')!
    expect(list.className).toContain('lg:grid-cols-6')
    expect(list.className).toContain('lg:grid-rows-2')
    expect(tiles()[0].className).toContain('lg:col-span-4')
    expect(screen.queryByText(/^\+\d/)).toBeNull()
    for (const li of tiles()) expect(li.className).not.toContain('lg:hidden')
  })

  it('9 photos: +4 on the fourth small tile, Show all 9 photos, photos 6-9 hidden on desktop only', () => {
    renderGallery(photos(9))
    const plus = screen.getByText('+4')
    expect(plus.tagName).toBe('BUTTON')
    expect(tiles()[4].contains(plus)).toBe(true)
    expect(screen.getByRole('button', { name: 'Show all 9 photos' })).toBeTruthy()
    expect(tiles()).toHaveLength(9)
    tiles().slice(5).forEach((li) => expect(li.className).toContain('lg:hidden'))
    tiles().slice(0, 5).forEach((li) => expect(li.className).not.toContain('lg:hidden'))
  })

  it('6 photos: +1 (count minus 5)', () => {
    renderGallery(photos(6))
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('the cover is first regardless of position; the first image loads eagerly (priority), the rest lazy', () => {
    seq = 0
    const list = [photo({ position: 1 }), photo({ position: 2 }), photo({ position: 7, is_cover: true })]
    const { container } = renderGallery(list)
    const [first, second, third] = imgs(container)
    expect(first.getAttribute('src')).toContain(encodeURIComponent(list[2].storage_path))
    expect(first.getAttribute('loading')).not.toBe('lazy')
    expect(second.getAttribute('loading')).toBe('lazy')
    expect(third.getAttribute('loading')).toBe('lazy')
  })

  it("alt text is '{title}, photo {n} of {count}' and each tile has an Open photo label", () => {
    const { container } = renderGallery(photos(9))
    const alts = imgs(container).map((i) => i.getAttribute('alt'))
    expect(alts[0]).toBe(`${TITLE}, photo 1 of 9`)
    expect(alts[8]).toBe(`${TITLE}, photo 9 of 9`)
    expect(screen.getByRole('button', { name: 'Open photo 2 of 9' })).toBeTruthy()
  })

  it('alt text and labels are generated per locale (ar)', () => {
    const { container } = renderGallery(photos(3), 'ar')
    const expected = (arMessages.Tours.gallery.alt as string).replace('{title}', TITLE).replace('{n}', '1').replace('{count}', '3')
    expect(imgs(container)[0].getAttribute('alt')).toBe(expected)
    expect(expected).not.toBe(`${TITLE}, photo 1 of 3`)
  })

  it("mobile carousel: scroll-snap list with a '1 of 9' chip, no dots and no autoplay", () => {
    const { container } = renderGallery(photos(9))
    const list = container.querySelector('ul')!
    expect(list.className).toContain('snap-x')
    expect(list.className).toContain('snap-mandatory')
    expect(list.className).toContain('overflow-x-auto')
    const chip = screen.getByTestId('tour-gallery-chip')
    expect(chip.textContent).toBe('1 of 9')
    expect(chip.className).toContain('lg:hidden')
    expect(container.querySelector('[role="tablist"], [data-dot]')).toBeNull()
    expect(container.innerHTML).not.toMatch(/autoplay/i)
  })

  it('the carousel chip follows the scroll position', () => {
    const { container } = renderGallery(photos(9))
    const list = container.querySelector('ul')!
    Object.defineProperty(list, 'clientWidth', { configurable: true, value: 300 })
    list.scrollLeft = 600
    fireEvent.scroll(list)
    expect(screen.getByTestId('tour-gallery-chip').textContent).toBe('3 of 9')
    list.scrollLeft = -900 // RTL scrolls negative
    fireEvent.scroll(list)
    expect(screen.getByTestId('tour-gallery-chip').textContent).toBe('4 of 9')
  })

  it('0 photos: the gallery block is not rendered', () => {
    const { container } = renderGallery([])
    expect(container.innerHTML).toBe('')
  })

  it('a failed image keeps its box: the img goes, the tile and the grid stay', () => {
    const { container } = renderGallery(photos(3))
    const before = tiles().length
    fireEvent.error(imgs(container)[1])
    expect(imgs(container)).toHaveLength(2)
    expect(tiles()).toHaveLength(before)
    expect(tiles()[1].className).toContain('bg-anthracite-mid')
  })

  it('without a Supabase URL no broken image is rendered, the tiles still are', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const { container } = renderGallery(photos(3))
    expect(imgs(container)).toHaveLength(0)
    expect(tiles()).toHaveLength(3)
  })

  it('has no typed euro amount in its source', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync('components/tours/TourGallery.tsx', 'utf-8')
    expect(source).not.toContain('€')
  })
})

// keep act imported for later tasks
void act
void within
