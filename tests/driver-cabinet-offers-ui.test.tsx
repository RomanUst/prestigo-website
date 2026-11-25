import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
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
import OffersList from '@/components/driver/OffersList'

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
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(3)
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

function jsonResponse(status: number, body: unknown = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

describe('OffersList answers', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const assign = vi.fn()

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    assign.mockReset()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('accept: dialog copy, focus on "Not yet", nothing sent before the confirm, then one POST', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, assignmentId: aid(1) }))
    render(<OffersList offers={[offer(1)]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    const dialog = screen.getByRole('dialog', { name: 'Accept this ride?' })
    expect(within(dialog).getByText("Today at 14:30. The passenger's name and phone appear once you accept.")).toBeInTheDocument()
    expect(within(dialog).getByText('Your fee: 1 800 CZK.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Not yet' })).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, accept ride' }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/driver/cabinet/offers/${aid(1)}/respond`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ action: 'accepted' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(screen.getByRole('status')).toHaveFocus()
    expect(screen.getByText('Ride accepted. You can find it under Rides.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open ride' })
    expect(link.getAttribute('href')).toBe(`/driver/rides/${aid(1)}`)
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Ride accepted.')
    expect(h.refresh).toHaveBeenCalled()
  })

  it('accept without a fee has no fee line', () => {
    render(<OffersList offers={[offer(1, { feeLabel: null })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(screen.queryByText(/Your fee:/)).toBeNull()
  })

  it('"Not yet" and Escape close the dialog with no request', () => {
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('while saving both buttons are disabled, the primary says Saving and Escape does nothing', async () => {
    let resolve: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept ride' }))
    })
    const dialog = screen.getByRole('dialog')
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    for (const b of buttons) expect(b).toBeDisabled()
    expect(dialog).toHaveTextContent('Saving…')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      resolve(new Response('{}', { status: 200 }))
    })
  })

  it('decline: dialog copy, focus on "Keep offer", info banner and live text', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, assignmentId: aid(1) }))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    const dialog = screen.getByRole('dialog', { name: 'Decline this ride?' })
    expect(
      within(dialog).getByText(
        'The office will be told and will offer this ride to another driver. You cannot undo this.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Keep offer' })).toHaveFocus()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, decline' }))
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'declined' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Ride declined. The office has been told.')).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Ride declined.')
    expect(screen.queryByRole('link', { name: 'Open ride' })).toBeNull()
  })

  it('409 closes the dialog with the "no longer available" banner and refreshes', async () => {
    fetchMock.mockReturnValue(jsonResponse(409, { error: 'not_available' }))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept ride' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('This offer is no longer available. The office has changed this ride.')).toBeInTheDocument()
    expect(h.refresh).toHaveBeenCalled()
  })

  it('429 shows the amber banner', async () => {
    fetchMock.mockReturnValue(jsonResponse(429, {}))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, decline' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Too many taps. Wait a moment and try again.')
    // the card stays: the answer was not saved
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  })

  it('a network error keeps the dialog open with an alert and "Try again"', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept ride' }))
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not save your answer. Check your connection and try again.',
    )
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeEnabled()
    // the offer is still on the page
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('a 500 keeps the dialog open with the same alert', async () => {
    fetchMock.mockReturnValue(jsonResponse(500, {}))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, decline' }))
    })
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Could not save your answer.')
  })

  it('a 401 sends the driver to the sign-in page with ended=1', async () => {
    fetchMock.mockReturnValue(jsonResponse(401, {}))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept ride' }))
    })
    expect(assign).toHaveBeenCalledWith('/driver/login?next=%2Fdriver%2Foffers&ended=1')
  })

  it('ok and info banners clear after 8 seconds', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, assignmentId: aid(1) }))
    render(<OffersList offers={[offer(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, decline' }))
    })
    expect(screen.getByText('Ride declined. The office has been told.')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(8100)
    })
    expect(screen.queryByText('Ride declined. The office has been told.')).toBeNull()
  })

  it('answering one of two offers leaves the other card in place', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, assignmentId: aid(1) }))
    render(<OffersList offers={[offer(1), offer(2, { time: '16:00' })]} />)
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept ride' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1)
    expect(screen.getByText('Pickup 2')).toBeInTheDocument()
    expect(screen.queryByText('Pickup 1')).toBeNull()
  })
})
