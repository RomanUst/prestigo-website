/**
 * Phase 93, plan 93-12 (TRIP-03, TRIP-04; D-10, D-20; T-93-33/34) - the tour booking box.
 * Now is pinned to 2027-06-10 10:00 Prague so the 12-hour lead time is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import enMessages from '@/messages/en.json'

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

import TourBookingBox, { type TourBookingBoxHandle } from '@/components/tours/TourBookingBox'

const NOW = Date.parse('2027-06-10T08:00:00Z') // 10:00 Prague (CEST)

const PRICES = { business: 410, first_class: 520, business_van: 640 }
const EXTRA = { business: 55, first_class: 75, business_van: 90 }

type Props = Partial<React.ComponentProps<typeof TourBookingBox>>

function renderBox(props: Props = {}) {
  const ref = { current: null as TourBookingBoxHandle | null }
  const utils = render(
    <NextIntlClientProvider locale="en" messages={enMessages as unknown as AbstractIntlMessages}>
      <TourBookingBox
        ref={ref}
        slug="x-day-trip"
        title="X day trip"
        hoursIncluded={8}
        prices={PRICES}
        extraHourPrices={EXTRA}
        startMin="08:00"
        startMax="11:00"
        freeCancelHours={48}
        {...props}
      />
    </NextIntlClientProvider>
  )
  return { ...utils, ref }
}

function chooseDate() {
  fireEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
  fireEvent.click(screen.getByRole('button', { name: /June 15th, 2027/ }))
}

const carGroup = () => within(screen.getByRole('radiogroup', { name: 'CAR' }))
const timeGroup = () => within(screen.getByRole('radiogroup', { name: /START TIME/ }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  pushMock.mockClear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TourBookingBox: tracer (date, time, car lead to /book/tour)', () => {
  it('shows From + the lowest fitting price + per car before a car is chosen, never per person', () => {
    const { container } = renderBox()
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('From')
    expect(heading.textContent).toContain('€410')
    expect(heading.textContent).toContain('per car')
    expect(container.textContent?.toLowerCase()).not.toContain('per person')
  })

  it('disables every chip until a date is chosen, then enables them and focuses the first enabled chip', () => {
    renderBox()
    expect(screen.getByText('Choose a date first.')).toBeTruthy()
    for (const chip of timeGroup().getAllByRole('radio')) expect(chip.getAttribute('aria-disabled')).toBe('true')
    chooseDate()
    const chips = timeGroup().getAllByRole('radio')
    expect(chips).toHaveLength(7)
    for (const chip of chips) expect(chip.getAttribute('aria-disabled')).toBe('false')
    expect(document.activeElement).toBe(chips[0])
    expect(screen.queryByText('Choose a date first.')).toBeNull()
  })

  it('disables days before today and days with no start 12 hours ahead', () => {
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
    // today (10 Jun): latest start 11:00 is 1 h ahead; 9 Jun is past; 11 Jun 08:00-11:00 is 22+ h ahead
    expect((screen.getByRole('button', { name: /June 9th, 2027/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /June 10th, 2027/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /June 11th, 2027/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Escape closes the date panel and returns focus to the date field', () => {
    renderBox()
    const field = screen.getByRole('button', { name: /Choose a date/ })
    fireEvent.click(field)
    expect(field.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Escape' })
    expect(field.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(field)
  })

  it('with 2 passengers shows three car rows priced from the props', () => {
    renderBox()
    const rows = carGroup().getAllByRole('radio')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Business')
    expect(rows[0].textContent).toContain('€410')
    expect(rows[1].textContent).toContain('First Class')
    expect(rows[1].textContent).toContain('€520')
    expect(rows[2].textContent).toContain('Business Van')
    expect(rows[2].textContent).toContain('€640')
    for (const r of rows) expect(r.getAttribute('aria-checked')).toBe('false')
  })

  it("choosing First Class and pressing 'Book this trip' pushes the checkout URL and stores the box values", () => {
    renderBox()
    chooseDate()
    fireEvent.click(timeGroup().getByRole('radio', { name: '09:30' }))
    fireEvent.click(carGroup().getByRole('radio', { name: /First Class/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Book this trip' }))
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/book/tour?tour=x-day-trip&date=2027-06-15&time=09%3A30&pax=2&car=first_class&xh=0')
    expect(JSON.parse(sessionStorage.getItem('tour-box:x-day-trip') ?? 'null')).toEqual({
      date: '2027-06-15',
      time: '09:30',
      pax: 2,
      car: 'first_class',
      xh: 0,
    })
  })

  it('moves the selected time with the arrow keys (roving radiogroup)', () => {
    renderBox()
    chooseDate()
    const chips = timeGroup().getAllByRole('radio')
    fireEvent.keyDown(chips[0], { key: 'ArrowRight' })
    expect(chips[1].getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(chips[1])
    expect(chips[1].getAttribute('tabindex')).toBe('0')
    expect(chips[0].getAttribute('tabindex')).toBe('-1')
  })
})
