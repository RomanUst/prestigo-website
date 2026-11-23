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
import TourBookingArea from '@/components/tours/TourBookingArea'
import { tourBoxStorageKey } from '@/lib/tours/checkout-query'
import PhotoCredits from '@/components/tours/PhotoCredits'
import type { TourT } from '@/components/tours/tour-t'

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

const dialog = () => screen.getByRole('dialog')
const counter = () => within(dialog()).getByText(/^\d+ of \d+$/)
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key: k, ...init })

function openTile(n: number, count: number) {
  const tile = screen.getByRole('button', { name: `Open photo ${n} of ${count}` })
  tile.focus()
  fireEvent.click(tile)
  return tile
}

describe('lightbox (Surface 1.3)', () => {
  it('opens a labelled modal dialog at the clicked photo with an aria-live counter', () => {
    renderGallery(photos(9))
    openTile(2, 9)
    const d = dialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.getAttribute('aria-label')).toBe(`Photos of ${TITLE}`)
    expect(counter().textContent).toBe('2 of 9')
    expect(counter().closest('[aria-live]')!.getAttribute('aria-live')).toBe('polite')
    expect(within(d).getByRole('img').getAttribute('alt')).toBe(`${TITLE}, photo 2 of 9`)
  })

  it('Escape closes and focus returns to the tile that opened it', () => {
    renderGallery(photos(9))
    const tile = openTile(2, 9)
    key('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile)
  })

  it('ArrowRight moves to the next photo in en and to the previous one in ar (dir=rtl)', () => {
    renderGallery(photos(9))
    openTile(2, 9)
    key('ArrowRight')
    expect(counter().textContent).toBe('3 of 9')
    key('ArrowLeft')
    key('ArrowLeft')
    expect(counter().textContent).toBe('1 of 9')
    cleanup()

    const ar = renderGallery(photos(9), 'ar')
    const tile = screen.getByRole('button', { name: (arMessages.Tours.gallery.open as string).replace('{n}', '2').replace('{count}', '9') })
    tile.focus()
    fireEvent.click(tile)
    expect(dialog().getAttribute('dir')).toBe('rtl')
    key('ArrowRight')
    const arCounter = (arMessages.Tours.gallery.counter as string).replace('{n}', '1').replace('{count}', '9')
    expect(dialog().querySelector('[aria-live]')!.textContent).toBe(arCounter)
    ar.unmount()
  })

  it('the Previous and Next buttons are 44px targets and move in the logical direction', () => {
    renderGallery(photos(9))
    openTile(2, 9)
    const next = within(dialog()).getByRole('button', { name: 'Next photo' })
    const prev = within(dialog()).getByRole('button', { name: 'Previous photo' })
    expect(next.className).toContain('h-11')
    expect(next.className).toContain('w-11')
    expect(within(dialog()).getByRole('button', { name: 'Close' }).className).toContain('h-11')
    fireEvent.click(next)
    expect(counter().textContent).toBe('3 of 9')
    fireEvent.click(prev)
    fireEvent.click(prev)
    expect(counter().textContent).toBe('1 of 9')
    expect(next.querySelector('svg')!.getAttribute('class')).toContain('rtl:-scale-x-100')
  })

  it('swipe moves between photos (left swipe = next in ltr)', () => {
    renderGallery(photos(9))
    openTile(2, 9)
    const d = dialog()
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 100 }] })
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 100, clientY: 100 }] })
    expect(counter().textContent).toBe('3 of 9')
    fireEvent.touchStart(d, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 300, clientY: 100 }] })
    expect(counter().textContent).toBe('2 of 9')
    // a short drag does nothing
    fireEvent.touchStart(d, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 120, clientY: 100 }] })
    expect(counter().textContent).toBe('2 of 9')
  })

  it('Tab cycles inside the dialog', () => {
    renderGallery(photos(9))
    openTile(2, 9)
    const close = within(dialog()).getByRole('button', { name: 'Close' })
    const next = within(dialog()).getByRole('button', { name: 'Next photo' })
    expect(document.activeElement).toBe(close)
    next.focus()
    key('Tab')
    expect(document.activeElement).toBe(close)
    close.focus()
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(next)
    // focus that escaped the dialog is pulled back in
    ;(document.activeElement as HTMLElement).blur()
    key('Tab')
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('locks body scroll while open and restores it on close', () => {
    renderGallery(photos(3))
    document.body.style.overflow = 'auto'
    openTile(1, 3)
    expect(document.body.style.overflow).toBe('hidden')
    key('Escape')
    expect(document.body.style.overflow).toBe('auto')
  })

  it("the '+4' tile opens at photo 6 and 'Show all 9 photos' at photo 1", () => {
    renderGallery(photos(9))
    fireEvent.click(screen.getByText('+4'))
    expect(counter().textContent).toBe('6 of 9')
    key('Escape')
    fireEvent.click(screen.getByRole('button', { name: 'Show all 9 photos' }))
    expect(counter().textContent).toBe('1 of 9')
  })

  it('a commons photo shows the credit line with a safe source link; an own photo shows none', () => {
    seq = 0
    const list = [
      photo({ is_cover: true }),
      photo({
        source: 'commons',
        credit_text: 'Jane Doe',
        license: 'CC BY-SA 4.0',
        credit_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      }),
    ]
    renderGallery(list)
    openTile(2, 2)
    const link = within(dialog()).getByRole('link', { name: 'Photo: Jane Doe, CC BY-SA 4.0' })
    expect(link.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File:X.jpg')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    key('ArrowLeft')
    expect(within(dialog()).queryByText(/^Photo: /)).toBeNull()
    expect(within(dialog()).queryByRole('link')).toBeNull()
  })

  it('a credit_url that is not https is shown as text, never as a link (T-93-36)', () => {
    seq = 0
    renderGallery([
      photo({ is_cover: true, source: 'commons', credit_text: 'A', license: 'CC0', credit_url: 'javascript:alert(1)' }),
    ])
    openTile(1, 1)
    expect(within(dialog()).queryByRole('link')).toBeNull()
    expect(within(dialog()).getByText('Photo: A, CC0')).toBeTruthy()
  })
})

const tCredits = ((key: string, values?: Record<string, string | number>) => {
  let text = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], enMessages.Tours) as string
  for (const [k, v] of Object.entries(values ?? {})) text = text.replace(`{${k}}`, String(v))
  return text
}) as unknown as TourT

describe('photo credits disclosure', () => {
  it('lists credited photos only, numbered by display order, with nofollow links', () => {
    seq = 0
    const list = [
      photo({ is_cover: true }),
      photo({ source: 'commons', credit_text: 'Jane Doe', license: 'CC BY 4.0', credit_url: 'https://example.org/a' }),
      photo(),
      photo({ source: 'other', credit_text: 'Foto Club', license: 'CC0', credit_url: null }),
    ]
    render(<PhotoCredits photos={list} t={tCredits} />)
    const details = document.querySelector('details')!
    expect(details.querySelector('summary')!.textContent).toBe('Photo credits')
    const items = within(details).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['Photo 2: Jane Doe, CC BY 4.0', 'Photo 4: Foto Club, CC0'])
    const link = within(items[0]).getByRole('link')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(within(items[1]).queryByRole('link')).toBeNull()
  })

  it('numbers follow the gallery order (cover first)', () => {
    seq = 0
    const list = [
      photo({ source: 'commons', credit_text: 'Late', license: 'CC0', credit_url: 'https://example.org/b', position: 1 }),
      photo({ is_cover: true, position: 5 }),
    ]
    render(<PhotoCredits photos={list} t={tCredits} />)
    expect(screen.getByRole('listitem').textContent).toBe('Photo 2: Late, CC0')
  })

  it('renders nothing when every photo is the visitor-agnostic own kind', () => {
    const { container } = render(<PhotoCredits photos={photos(4)} t={tCredits} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('lightbox and credits sources', () => {
  it('carry aria-modal and nofollow', async () => {
    const fs = await import('node:fs')
    expect(fs.readFileSync('components/tours/TourLightbox.tsx', 'utf-8')).toContain('aria-modal')
    expect(fs.readFileSync('components/tours/TourLightbox.tsx', 'utf-8')).toContain('nofollow')
    expect(fs.readFileSync('components/tours/PhotoCredits.tsx', 'utf-8')).toContain('nofollow')
  })
})

void act

describe('booking area: restore from sessionStorage (T-93-35)', () => {
  const NOW = Date.parse('2027-06-10T08:00:00Z') // 10:00 Prague (CEST)
  const SLUG = 'x-day-trip'

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  function renderArea() {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages as unknown as AbstractIntlMessages}>
        <TourBookingArea
          slug={SLUG}
          title="X day trip"
          hoursIncluded={8}
          prices={{ business: 410, first_class: 520, business_van: 640 }}
          extraHourPrices={{ business: 55, first_class: 75, business_van: 90 }}
          startMin="08:00"
          startMax="11:00"
          freeCancelHours={48}
        />
      </NextIntlClientProvider>
    )
  }

  const store = (value: unknown) =>
    sessionStorage.setItem(tourBoxStorageKey(SLUG), typeof value === 'string' ? value : JSON.stringify(value))
  const section = () => document.getElementById('book')!.querySelector('section')!

  it('mounts with a valid stored date, time, passengers, car and extra hours', async () => {
    store({ date: '2027-06-15', time: '09:30', pax: 3, car: 'business_van', xh: 2 })
    renderArea()
    await act(async () => {})
    const box = within(section())
    expect(box.getByRole('button', { name: /June 15, 2027|15 June 2027|2027/ })).toBeTruthy()
    expect(within(box.getByRole('group', { name: 'Pickup hour' })).getByRole('button', { name: '09' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(box.getByRole('group', { name: 'Pickup minute' })).getByRole('button', { name: '30' }).getAttribute('aria-pressed')).toBe('true')
    expect(box.getAllByRole('radiogroup', { name: 'CAR' })).toHaveLength(1)
    const carRadio = box.getByRole('radio', { checked: true, name: /V-Class|Van|Business/i })
    expect(carRadio.textContent).toContain('820') // 640 + 2 x 90, from the props
    expect(section().textContent).toContain('+2 hours')
    expect(section().querySelector('output')!.textContent).toBe('3')
  })

  it('a stale date (past) is dropped and the rest of the box still starts', async () => {
    store({ date: '2027-06-01', time: '09:30', pax: 2, car: 'business', xh: 0 })
    renderArea()
    await act(async () => {})
    expect(within(section()).getByRole('button', { name: /Choose a date/ })).toBeTruthy()
  })

  it.each([
    ['xh 40', { date: '2027-06-15', time: '09:30', pax: 2, car: 'business', xh: 40 }],
    ['unknown car', { date: '2027-06-15', time: '09:30', pax: 2, car: 'limousine', xh: 0 }],
    ['pax 99', { date: '2027-06-15', time: '09:30', pax: 99, car: 'business', xh: 0 }],
    ['bad time', { date: '2027-06-15', time: '09:10', pax: 2, car: 'business', xh: 0 }],
    ['not json', '{oops'],
    ['an array', ['2027-06-15']],
  ])('a tampered value (%s) is ignored and the box starts empty', async (_name, value) => {
    store(value)
    renderArea()
    await act(async () => {})
    const box = within(section())
    expect(box.getByRole('button', { name: /Choose a date/ })).toBeTruthy()
    expect(section().querySelector('output')!.textContent).toBe('2')
    for (const r of box.getAllByRole('radio')) expect(r.getAttribute('aria-checked')).toBe('false')
  })

  it('works when sessionStorage throws (blocked storage)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderArea()
    await act(async () => {})
    expect(within(section()).getByRole('button', { name: /Choose a date/ })).toBeTruthy()
    spy.mockRestore()
  })

  it('without stored state nothing is restored', async () => {
    renderArea()
    await act(async () => {})
    expect(within(section()).getByRole('button', { name: /Choose a date/ })).toBeTruthy()
  })

  it('the sticky bar follows the box and Book this trip from the bar goes through the same navigation', async () => {
    store({ date: '2027-06-15', time: '09:30', pax: 2, car: 'business', xh: 0 })
    renderArea()
    await act(async () => {})
    const bar = screen.getByTestId('tour-sticky-bar')
    expect(document.getElementById('book')!.contains(bar)).toBe(true)
  })
})

describe('booking area source', () => {
  it('reads sessionStorage through tourBoxStorageKey, inside try/catch, and validates with parseTourCheckoutQuery', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('components/tours/TourBookingArea.tsx', 'utf-8')
    expect(src).toContain('tourBoxStorageKey')
    expect(src).toContain('parseTourCheckoutQuery')
    expect(src).toMatch(/try\s*{[\s\S]*sessionStorage[\s\S]*}\s*catch/)
  })
})
