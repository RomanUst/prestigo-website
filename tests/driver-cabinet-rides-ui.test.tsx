import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'

// Phase 94 plan 94-06 (DCAB-05, DCAB-06; D-02, D-03): bottom tab bar, Offers badge and the Upcoming list.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  session: null as null | { driverId: string; sessionId: string },
  pathname: '/driver/rides',
  requireDriver: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({
  requireDriver: h.requireDriver,
  getDriverSession: async () => h.session,
}))
vi.mock('next/navigation', () => ({
  redirect: h.redirect,
  usePathname: () => h.pathname,
}))

import RidesPage from '@/app/(internal)/driver/(cabinet)/(tabs)/rides/page'
import TabsLayout from '@/app/(internal)/driver/(cabinet)/(tabs)/layout'
import DriverIndexPage from '@/app/(internal)/driver/page'
import CabinetTabBar from '@/components/driver/CabinetTabBar'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER = 'd0000000-0000-4000-8000-000000000002'
const TODAY = getPragueTodayISO()
const TOMORROW = shiftIsoDate(TODAY, 1)

const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, over: Record<string, unknown> = {}) {
  return {
    id: bid(n),
    status: 'assigned',
    pickup_date: TODAY,
    pickup_time: '10:30',
    pickup_utc: null,
    origin_address: `Pickup ${n}`,
    destination_address: `Dropoff ${n}`,
    client_first_name: 'Jan',
    client_last_name: 'Novak',
    amount_czk: 9999,
    vehicle_class: 'business_van',
    driver_price_czk: 2500,
    ...over,
  }
}

let seq = 0
function assignment(n: number, bookingN: number, over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: aid(n),
    booking_id: bid(bookingN),
    driver_id: DRIVER,
    status: 'accepted',
    created_at: new Date(Date.UTC(2026, 10, 1, 8, 0, seq)).toISOString(),
    ...over,
  }
}

function seed(bookings: unknown[], assignments: unknown[], plate: string | null = '1AB 2345'): FakeDriverCabinetDb {
  const db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER, name: 'Ana', vehicle_plate: plate },
      { id: OTHER, name: 'Boris', vehicle_plate: '9ZZ 9999' },
    ] as never,
    bookings: bookings as never,
    driver_assignments: assignments as never,
  })
  h.db = db
  return db
}

beforeEach(() => {
  h.session = { driverId: DRIVER, sessionId: 's1' }
  h.pathname = '/driver/rides'
  h.requireDriver.mockReset()
  h.requireDriver.mockImplementation(async () => ({ driverId: DRIVER, sessionId: 's1' }))
  h.redirect.mockClear()
})

describe('/driver/rides (Upcoming)', () => {
  it('gates itself with requireDriver before any read', async () => {
    const db = seed([], [])
    h.requireDriver.mockImplementationOnce(async () => {
      throw new Error('REDIRECT:/driver/login?next=%2Fdriver%2Frides')
    })
    await expect(RidesPage()).rejects.toThrow('REDIRECT:/driver/login')
    expect(h.requireDriver).toHaveBeenCalledWith('/driver/rides')
    expect(db.calls).toHaveLength(0)
  })

  it('groups rides by day with a header per day and one link row per ride', async () => {
    seed(
      [
        booking(1, { pickup_time: '09:00' }),
        booking(2, { pickup_time: '15:45' }),
        booking(3, { pickup_date: TOMORROW, pickup_time: '07:15' }),
      ],
      [assignment(1, 1), assignment(2, 2), assignment(3, 3)],
    )
    render(await RidesPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Rides' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Tomorrow' })).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      `/driver/rides/${aid(1)}`,
      `/driver/rides/${aid(2)}`,
      `/driver/rides/${aid(3)}`,
    ])
    const first = links[0]
    expect(first).toHaveTextContent('09:00')
    expect(first).toHaveTextContent('Pickup 1')
    expect(first).toHaveTextContent('Dropoff 1')
    expect(first).toHaveTextContent('Jan')
    expect(first).toHaveTextContent('1AB 2345')
    expect(first).toHaveTextContent('Business Van')
    expect(first.getAttribute('aria-label')).toBe(
      '09:00, Pickup 1 to Dropoff 1, passenger Jan, plate 1AB 2345, Business Van',
    )
  })

  it('shows no fee and no euro sign anywhere in the list, and nothing of the client beyond the first name', async () => {
    seed([booking(1)], [assignment(1, 1)])
    const { container } = render(await RidesPage())
    expect(container.textContent).not.toMatch(/€|Kč|CZK|EUR|Novak|9999|2 ?500/)
  })

  it('shows Pending when the driver has no plate and As directed without a drop-off', async () => {
    seed([booking(1, { destination_address: null })], [assignment(1, 1)], null)
    render(await RidesPage())
    const row = screen.getByRole('link')
    expect(row).toHaveTextContent('Pending')
    expect(row).toHaveTextContent('As directed')
  })

  it('shows a badge for started rides and none for an assigned ride', async () => {
    seed(
      [
        booking(1, { status: 'en_route', pickup_time: '08:00' }),
        booking(2, { status: 'on_location', pickup_time: '09:00' }),
        booking(3, { status: 'on_board', pickup_time: '10:00' }),
        booking(4, { status: 'assigned', pickup_time: '11:00' }),
      ],
      [assignment(1, 1), assignment(2, 2), assignment(3, 3), assignment(4, 4)],
    )
    render(await RidesPage())
    const links = screen.getAllByRole('link')
    expect(within(links[0]).getByText('En route')).toBeInTheDocument()
    expect(within(links[1]).getByText('On site')).toBeInTheDocument()
    expect(within(links[2]).getByText('On board')).toBeInTheDocument()
    expect(within(links[3]).queryByText(/En route|On site|On board/)).not.toBeInTheDocument()
  })

  it("never lists another driver's rides", async () => {
    seed(
      [booking(1), booking(2, { origin_address: 'Secret pickup' })],
      [assignment(1, 1), assignment(2, 2, { driver_id: OTHER })],
    )
    const { container } = render(await RidesPage())
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(container.textContent).not.toContain('Secret pickup')
  })

  it('shows the empty state without a review link when there are no live offers', async () => {
    seed([], [])
    render(await RidesPage())
    expect(screen.getByText('No upcoming rides')).toBeInTheDocument()
    expect(screen.getByText('Rides you accept will appear here.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Review/ })).not.toBeInTheDocument()
  })

  it('offers a review link to /driver/offers in the empty state: 1 offer and 2 offers', async () => {
    seed([booking(1, { pickup_date: TOMORROW })], [assignment(1, 1, { status: 'pending' })])
    const one = render(await RidesPage())
    const link1 = screen.getByRole('link', { name: 'Review 1 offer' })
    expect(link1.getAttribute('href')).toBe('/driver/offers')
    one.unmount()

    seed(
      [booking(1, { pickup_date: TOMORROW }), booking(2, { pickup_date: TOMORROW })],
      [assignment(1, 1, { status: 'pending' }), assignment(2, 2, { status: 'pending' })],
    )
    render(await RidesPage())
    expect(screen.getByRole('link', { name: 'Review 2 offers' }).getAttribute('href')).toBe('/driver/offers')
  })
})

describe('CabinetTabBar (D-02, UI-SPEC E3)', () => {
  it('renders nav "Cabinet" with Rides, Offers, You and marks the active link', () => {
    h.pathname = '/driver/rides'
    render(<CabinetTabBar offersCount={0} />)
    const nav = screen.getByRole('navigation', { name: 'Cabinet' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Rides', 'Offers', 'You'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/driver/rides', '/driver/offers', '/driver/you'])
    expect(screen.getByRole('link', { name: 'Rides' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Offers' })).not.toHaveAttribute('aria-current')
  })

  it('marks Offers active on /driver/offers', () => {
    h.pathname = '/driver/offers'
    render(<CabinetTabBar offersCount={0} />)
    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Rides' })).not.toHaveAttribute('aria-current')
  })

  it('shows no badge at 0 live offers', () => {
    render(<CabinetTabBar offersCount={0} />)
    expect(screen.getByRole('link', { name: 'Offers' })).toBeInTheDocument()
    expect(document.querySelector('[data-offers-badge]')).toBeNull()
  })

  it('shows the count for 3, with the accessible name "Offers, 3 new" and an aria-hidden badge', () => {
    render(<CabinetTabBar offersCount={3} />)
    const link = screen.getByRole('link', { name: 'Offers, 3 new' })
    const badge = link.querySelector('[data-offers-badge]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('3')
    expect(badge?.getAttribute('aria-hidden')).toBe('true')
  })

  it('caps the badge at 9+', () => {
    render(<CabinetTabBar offersCount={12} />)
    const link = screen.getByRole('link', { name: 'Offers, 12 new' })
    expect(link.querySelector('[data-offers-badge]')?.textContent).toBe('9+')
    render(<CabinetTabBar offersCount={9} />)
    expect(document.querySelectorAll('[data-offers-badge]')[1]?.textContent).toBe('9')
  })
})

describe('(tabs) layout and /driver redirect', () => {
  it('renders the children and the tab bar with the live offers count of the session driver', async () => {
    seed(
      [booking(1, { pickup_date: TOMORROW }), booking(2, { pickup_date: TOMORROW })],
      [assignment(1, 1, { status: 'pending' }), assignment(2, 2, { status: 'pending', driver_id: OTHER })],
    )
    render(await TabsLayout({ children: <p>page body</p> }))
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Offers, 1 new' })).toBeInTheDocument()
  })

  it('renders no badge when there is no session', async () => {
    seed([], [])
    h.session = null
    render(await TabsLayout({ children: <p>x</p> }))
    expect(screen.getByRole('link', { name: 'Offers' })).toBeInTheDocument()
  })

  it('redirects /driver to /driver/rides', () => {
    expect(() => DriverIndexPage()).toThrow('REDIRECT:/driver/rides')
  })
})
