import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createFakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import type { OfferView } from '@/lib/driver-cabinet/offers'

// Phase 94 plan 94-11 (DCAB-07, DCAB-08; D-08, D-11, D-12): the Offers tab, its cards and the accept / decline answers.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  requireDriver: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({
  requireDriver: h.requireDriver,
  getDriverSession: async () => ({ driverId: DRIVER, sessionId: 's1' }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  usePathname: () => '/driver/offers',
  useRouter: () => ({ refresh: h.refresh }),
}))

import OffersPage from '@/app/(internal)/driver/(cabinet)/(tabs)/offers/page'
import OfferCard from '@/components/driver/OfferCard'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
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
    client_first_name: 'Anna',
    client_last_name: 'Zelenka',
    client_phone: '+420777111222',
    flight_number: 'OK1234',
    notes: 'SECRET-NOTE',
    amount_czk: 9999,
    booking_reference: 'PRG-REF-777',
    vehicle_class: 'business_sedan',
    driver_price_czk: 1800,
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
    status: 'pending',
    created_at: new Date(Date.UTC(2026, 10, 1, 8, 0, seq)).toISOString(),
    ...over,
  }
}

function seed(bookings: unknown[], assignments: unknown[]) {
  h.db = createFakeDriverCabinetDb({
    drivers: [{ id: DRIVER, name: 'Ana', vehicle_plate: '1AB 2345' }] as never,
    bookings: bookings as never,
    driver_assignments: assignments as never,
  })
}

const offer = (n: number, over: Partial<OfferView> = {}): OfferView => ({
  assignmentId: aid(n),
  pickupDate: TODAY,
  dayLabel: 'Today',
  time: '14:30',
  pickup: `Pickup ${n}`,
  dropoff: `Dropoff ${n}`,
  firstName: 'Anna',
  vehicleLabel: 'Business',
  feeLabel: '1 800 CZK',
  ...over,
})

beforeEach(() => {
  h.requireDriver.mockReset()
  h.requireDriver.mockImplementation(async () => ({ driverId: DRIVER, sessionId: 's1' }))
  h.refresh.mockReset()
})

describe('/driver/offers page', () => {
  it('gates itself with requireDriver before any read', async () => {
    seed([], [])
    h.requireDriver.mockImplementationOnce(async () => {
      throw new Error('REDIRECT:/driver/login?next=%2Fdriver%2Foffers')
    })
    await expect(OffersPage()).rejects.toThrow('REDIRECT:/driver/login')
    expect(h.requireDriver).toHaveBeenCalledWith('/driver/offers')
    expect((h.db as unknown as { calls: unknown[] }).calls).toHaveLength(0)
  })

  it('lists live offers earliest pickup first under the title and the subline', async () => {
    seed(
      [
        booking(1, { pickup_date: TOMORROW, pickup_time: '08:00' }),
        booking(2, { pickup_time: '16:00' }),
        booking(3, { pickup_time: '09:15' }),
      ],
      [assignment(1, 1), assignment(2, 2), assignment(3, 3)],
    )
    render(await OffersPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Offers' })).toBeInTheDocument()
    expect(screen.getByText('Rides the office has offered to you. Only you can see them.')).toBeInTheDocument()
    const times = screen.getAllByText(/^\d\d:\d\d$/).map((n) => n.textContent)
    expect(times).toEqual(['09:15', '16:00', '08:00'])
  })

  it('does not show offers of another driver, answered offers or offers on cancelled rides', async () => {
    seed(
      [booking(1), booking(2), booking(3, { status: 'cancelled' })],
      [
        assignment(1, 1, { driver_id: 'd0000000-0000-4000-8000-000000000009' }),
        assignment(2, 2, { status: 'accepted' }),
        assignment(3, 3),
      ],
    )
    render(await OffersPage())
    expect(screen.getByText('No offers right now')).toBeInTheDocument()
  })

  it('shows the empty state without a button', async () => {
    seed([], [])
    render(await OffersPage())
    expect(screen.getByText('No offers right now')).toBeInTheDocument()
    expect(screen.getByText('When the office sends you a ride, it shows up here and we email you.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never renders the last name, phone, flight, notes, reference, client price or a euro sign', async () => {
    seed([booking(1)], [assignment(1, 1)])
    const { container } = render(await OffersPage())
    const text = container.textContent ?? ''
    for (const secret of ['Zelenka', '+420777111222', 'OK1234', 'SECRET-NOTE', 'PRG-REF-777', '9999', '€']) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('Anna')
  })
})

describe('OfferCard', () => {
  it('shows day, time, fee, timeline and the passenger line', () => {
    render(<OfferCard offer={offer(1)} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('14:30')).toBeInTheDocument()
    expect(screen.getByText('Your fee')).toBeInTheDocument()
    expect(screen.getByText('1 800 CZK')).toBeInTheDocument()
    expect(screen.getByText('Pickup')).toBeInTheDocument()
    expect(screen.getByText('Drop-off')).toBeInTheDocument()
    expect(screen.getByText('Pickup 1')).toBeInTheDocument()
    expect(screen.getByText('Dropoff 1')).toBeInTheDocument()
    expect(screen.getByText('Passenger').parentElement).toHaveTextContent('Passenger Anna · Business')
  })

  it('has no fee column when the fee is null, no dash and no zero', () => {
    const { container } = render(<OfferCard offer={offer(1, { feeLabel: null })} />)
    expect(screen.queryByText('Your fee')).toBeNull()
    expect(container.textContent).not.toContain('—')
    expect(container.textContent).not.toMatch(/\b0\b/)
  })

  it('passes "As directed" through and renders the actions slot', () => {
    render(<OfferCard offer={offer(1, { dropoff: 'As directed' })} actions={<button>Slot</button>} />)
    expect(screen.getByText('As directed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slot' })).toBeInTheDocument()
  })

  it('marks the address text for the 2-line clamp', () => {
    render(<OfferCard offer={offer(1, { pickup: 'A very long address '.repeat(10) })} />)
    expect(document.querySelectorAll('.driver-address-clamp').length).toBe(2)
  })
})

