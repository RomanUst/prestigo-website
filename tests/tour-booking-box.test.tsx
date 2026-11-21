/**
 * Phase 93, plan 93-12 (TRIP-03, TRIP-04; D-10, D-20; T-93-33/34) - the tour booking box.
 * Now is pinned to 2027-06-10 10:00 Prague so the 12-hour lead time is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { customTourHref } from '@/lib/tours/custom-tour-link'

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

const morePax = () => screen.getByRole('button', { name: 'More passengers' }) as HTMLButtonElement
const fewerPax = () => screen.getByRole('button', { name: 'Fewer passengers' })
const moreTime = () => screen.getByRole('button', { name: 'More extra time' }) as HTMLButtonElement
const lessTime = () => screen.getByRole('button', { name: 'Less extra time' })

describe('TourBookingBox: passengers and cars (D-10)', () => {
  it('4 passengers: only Business Van shows and is auto-selected; back to 2 keeps it selected among three rows', () => {
    renderBox()
    fireEvent.click(morePax())
    fireEvent.click(morePax())
    let rows = carGroup().getAllByRole('radio')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Business Van')
    expect(rows[0].getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Only cars that fit 4 people are shown.')).toBeTruthy()

    fireEvent.click(fewerPax())
    fireEvent.click(fewerPax())
    rows = carGroup().getAllByRole('radio')
    expect(rows).toHaveLength(3)
    expect(rows[2].getAttribute('aria-checked')).toBe('true')
    expect(rows[0].getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByText(/Only cars that fit/)).toBeNull()
  })

  it('going from 2 (First Class selected) to 4 clears the choice, then the only fitting class is auto-selected', () => {
    renderBox()
    fireEvent.click(carGroup().getByRole('radio', { name: /First Class/ }))
    fireEvent.click(morePax())
    fireEvent.click(morePax())
    expect(carGroup().queryByRole('radio', { name: /First Class/ })).toBeNull()
    expect(screen.getByText('Only cars that fit 4 people are shown.')).toBeTruthy()
  })

  it('at the passenger maximum the plus is disabled and a custom-tour link appears', () => {
    renderBox()
    for (let i = 0; i < 4; i++) fireEvent.click(morePax())
    expect(morePax().disabled).toBe(true)
    const link = screen.getByRole('link', { name: 'Request a custom tour' })
    expect(link.getAttribute('href')).toBe(customTourHref({ tour: 'x-day-trip', pax: 6 }))
    expect(screen.getByText(/More than 6 people\?/)).toBeTruthy()
  })

  it('shows the plus link only at the maximum', () => {
    renderBox()
    expect(screen.queryByRole('link', { name: 'Request a custom tour' })).toBeNull()
  })

  it('hides a class that has no price', () => {
    renderBox({ prices: { ...PRICES, first_class: null } })
    expect(carGroup().getAllByRole('radio')).toHaveLength(2)
    expect(carGroup().queryByRole('radio', { name: /First Class/ })).toBeNull()
  })
})

describe('TourBookingBox: extra time and total (D-20)', () => {
  it('extra time steps 0..12; each car row and the total include the extra hours', () => {
    renderBox()
    expect(screen.getByText('No extra time')).toBeTruthy()
    expect(screen.getByText('8 hours included. Choose a car to see the price of an extra hour.')).toBeTruthy()
    expect(screen.queryByText('Total per car')).toBeNull()

    fireEvent.click(carGroup().getAllByRole('radio')[0])
    expect(screen.getByText('8 hours included. Each extra hour costs €55 with this car.')).toBeTruthy()
    expect(screen.getByText('Total per car').parentElement?.textContent).toContain('€410')

    fireEvent.click(moreTime())
    expect(screen.getByText('+1 hour')).toBeTruthy()
    const rows = carGroup().getAllByRole('radio')
    expect(rows[0].textContent).toContain('€465') // 410 + 55
    expect(rows[1].textContent).toContain('€595') // 520 + 75
    expect(rows[2].textContent).toContain('€730') // 640 + 90
    expect(screen.getByText('Total per car').parentElement?.textContent).toContain('€465')
    expect(screen.getByText('9 hours at the destination in total')).toBeTruthy()

    fireEvent.click(moreTime())
    fireEvent.click(moreTime())
    expect(screen.getByText('+3 hours')).toBeTruthy()
    expect(screen.getByText('Total per car').parentElement?.textContent).toContain('€575') // 410 + 3 * 55

    fireEvent.click(lessTime())
    expect(screen.getByText('+2 hours')).toBeTruthy()
  })

  it('at 12 extra hours the plus is disabled and the helper links to the custom tour', () => {
    renderBox()
    fireEvent.click(carGroup().getAllByRole('radio')[0])
    for (let i = 0; i < 12; i++) fireEvent.click(moreTime())
    expect(screen.getByText('+12 hours')).toBeTruthy()
    expect(moreTime().disabled).toBe(true)
    const link = screen.getByRole('link', { name: 'request a custom tour' })
    expect(link.getAttribute('href')).toBe(customTourHref({ tour: 'x-day-trip', pax: 2 }))
    expect(screen.getByText('Total per car').parentElement?.textContent).toContain('€1070') // 410 + 12 * 55
  })

  it('hides the stepper for a class with no extra-hour price, and resets extra time when it is chosen', () => {
    renderBox({ extraHourPrices: { ...EXTRA, business_van: null } })
    fireEvent.click(carGroup().getAllByRole('radio')[0])
    fireEvent.click(moreTime())
    // the van has no price for extra time: its row disappears while extra time is set
    expect(carGroup().queryByRole('radio', { name: /Business Van/ })).toBeNull()
    fireEvent.click(lessTime())
    fireEvent.click(carGroup().getByRole('radio', { name: /Business Van/ }))
    expect(screen.queryByRole('button', { name: 'More extra time' })).toBeNull()
  })

  it('the pushed URL carries the extra hours', () => {
    renderBox()
    chooseDate()
    fireEvent.click(timeGroup().getByRole('radio', { name: '08:00' }))
    fireEvent.click(carGroup().getByRole('radio', { name: /Business Van/ }))
    fireEvent.click(moreTime())
    fireEvent.click(moreTime())
    fireEvent.click(screen.getByRole('button', { name: 'Book this trip' }))
    expect(pushMock).toHaveBeenCalledWith('/book/tour?tour=x-day-trip&date=2027-06-15&time=08%3A00&pax=2&car=business_van&xh=2')
  })
})

describe('TourBookingBox: inline errors and focus', () => {
  it('Book this trip is never disabled; with nothing chosen it shows three errors, the first is an alert, and it focuses the date field', () => {
    renderBox()
    const cta = screen.getByRole('button', { name: 'Book this trip' }) as HTMLButtonElement
    expect(cta.disabled).toBe(false)
    fireEvent.click(cta)
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.getByText('Choose a date.')).toBeTruthy()
    expect(screen.getByText('Choose a start time.')).toBeTruthy()
    expect(screen.getByText('Choose a car.')).toBeTruthy()
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe('Choose a date.')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Choose a date/ }))
  })

  it('with a date but no time it focuses the start time group; with date and time it focuses the car rows', () => {
    renderBox()
    chooseDate()
    fireEvent.click(screen.getByRole('button', { name: 'Book this trip' }))
    expect(screen.queryByText('Choose a date.')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Choose a start time.')
    expect(document.activeElement).toBe(timeGroup().getAllByRole('radio')[0])

    fireEvent.click(timeGroup().getByRole('radio', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Book this trip' }))
    expect(screen.getByRole('alert').textContent).toBe('Choose a car.')
    expect(document.activeElement).toBe(carGroup().getAllByRole('radio')[0])
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('an error disappears once its field is filled', () => {
    renderBox()
    fireEvent.click(screen.getByRole('button', { name: 'Book this trip' }))
    chooseDate()
    expect(screen.queryByText('Choose a date.')).toBeNull()
    expect(screen.getByText('Choose a start time.')).toBeTruthy()
  })

  it('exposes focusFirstMissing and book through the imperative handle', () => {
    const { ref } = renderBox()
    act(() => ref.current?.focusFirstMissing())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Choose a date/ }))
    act(() => ref.current?.book())
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.getByText('Choose a date.')).toBeTruthy()
  })

  it('reports its state through onStateChange', () => {
    const onStateChange = vi.fn()
    renderBox({ onStateChange })
    expect(onStateChange).toHaveBeenLastCalledWith({ complete: false, totalEur: null, fromEur: 410 })
    chooseDate()
    fireEvent.click(timeGroup().getByRole('radio', { name: '09:00' }))
    fireEvent.click(carGroup().getByRole('radio', { name: /First Class/ }))
    expect(onStateChange).toHaveBeenLastCalledWith({ complete: true, totalEur: 520, fromEur: 410 })
  })

  it('shows the free-cancellation hours and the pay-later line', () => {
    renderBox({ freeCancelHours: 36 })
    expect(screen.getByText('Free cancellation up to 36 hours before pickup')).toBeTruthy()
    expect(screen.getByText('Reserve now, pay after your trip')).toBeTruthy()
  })
})
