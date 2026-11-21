import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/react'
import { BookingDetailPanel } from '@/components/admin/BookingDetailPanel'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { DispatchBoard } from '@/components/admin/dispatch/DispatchBoard'
import { TripEditPanel } from '@/components/admin/TripEditPanel'
import { ExtraChargeModal } from '@/components/admin/ExtraChargeModal'
import BookingsWorkspace from '@/components/admin/BookingsWorkspace'
import { tourDisplay, type AdminBooking, type PatchBody } from '@/components/admin/bookingTypes'
import type { BookingMovesApi } from '@/components/admin/useBookingMoves'
import { formatMinor } from '@/lib/payments/money'
import TripScreen, { type TripScreenProps } from '@/app/(internal)/driver/trip/[token]/TripScreen'

// Phase 93 plan 20 (TRIP-04): a day-trip booking reads as a day trip in the admin detail panel, the dispatch board and
// the driver screen; the Tour filter chip exists; the fixed tour price is read-only in the edit panel; the extra-charge
// dialog shows the extra-hour price of the booked car as a hint only (D-04).

// AddressInput is a next-intl consumer; the trip-edit panel mounts it when edit mode opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

// RouteMap loads Google Maps; the driver screen needs only its props contract.
vi.mock('@/components/booking/RouteMap', () => ({
  default: () => <div data-testid="route-map" role="img" aria-label="Route map" />,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-TOUR',
    booking_source: 'online',
    pickup_date: '2027-10-31',
    pickup_time: '08:00',
    pickup_utc: '2027-10-31T06:00:00Z',
    client_first_name: 'Ivan',
    client_last_name: 'Petrov',
    client_email: 'ivan@example.com',
    client_phone: '+420111222333',
    trip_type: 'transfer',
    vehicle_class: 'business',
    amount_czk: 5000,
    driver_price_czk: null,
    origin_address: 'Hotel Prague',
    destination_address: 'Dresden',
    origin_lat: 50.1,
    origin_lng: 14.26,
    destination_lat: 51.05,
    destination_lng: 13.74,
    passengers: 2,
    luggage: 2,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    flight_number: null,
    terminal: null,
    hours: null,
    return_date: null,
    special_requests: null,
    payment_intent_id: null,
    payment_link_url: null,
    payment_link_id: null,
    status: 'confirmed',
    operator_notes: null,
    created_at: '2027-10-01T10:00:00Z',
    leg: null,
    linked_booking_id: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    linked_booking: null,
    flight_iata: null,
    flight_status: null,
    flight_estimated_arrival: null,
    flight_delay_minutes: null,
    flight_departure_airport: null,
    flight_arrival_airport: null,
    flight_terminal: null,
    ...overrides,
  }
}

const tourBooking = (overrides: Partial<AdminBooking> = {}) =>
  makeBooking({ trip_type: 'tour', tour_title: 'Dresden', hours: 6, tour_extra_hours: 1, ...overrides })

function fakeMoves(): BookingMovesApi {
  return {
    isUpdating: vi.fn(() => false),
    conflictFor: vi.fn(() => null),
    requestStatusChange: vi.fn(),
    requestMove: vi.fn(),
    openNoShow: vi.fn(),
    openCancel: vi.fn(),
    refreshBooking: vi.fn(),
    anyDialogOpen: false,
    paymentBumpFor: vi.fn(() => 0),
    dialogs: null,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('tourDisplay', () => {
  it('is null for a transfer', () => {
    expect(tourDisplay(makeBooking())).toBeNull()
  })

  it('names the tour, the hours and the extra hours', () => {
    expect(tourDisplay(tourBooking())).toEqual({ title: 'Day trip: Dresden', hoursText: '6 h at destination · 1 extra' })
  })

  it('leaves the extra part out when there are no extra hours', () => {
    expect(tourDisplay(tourBooking({ tour_extra_hours: 0 }))?.hoursText).toBe('6 h at destination')
    expect(tourDisplay(tourBooking({ tour_extra_hours: null }))?.hoursText).toBe('6 h at destination')
  })
})

describe('BookingDetailPanel: tour booking', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
  })

  it('shows the day trip, the hours at the destination, the extra hours and the return to the pickup', () => {
    render(<BookingDetailPanel booking={tourBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)
    expect(screen.getByText('Day trip: Dresden')).toBeTruthy()
    expect(screen.getByText('6 h at destination · 1 extra')).toBeTruthy()
    expect(screen.getByText('Return to')).toBeTruthy()
    // origin appears as the pickup and again as the return address
    expect(screen.getAllByText('Hotel Prague').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Dresden', { selector: 'div,span,p,dd' })).toBeTruthy()
  })

  it('shows no day-trip rows for a transfer', () => {
    render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)
    expect(screen.queryByText(/Day trip/)).toBeNull()
    expect(screen.queryByText('Return to')).toBeNull()
  })
})

describe('Tour filter chip', () => {
  async function renderWorkspace(initialView: 'list' | 'board') {
    vi.useFakeTimers()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.startsWith('/api/admin/settings')) return jsonResponse({ dispatch_default_horizon: 'future', dispatch_horizon_days: 7 })
        if (url.startsWith('/api/admin/bookings/dispatch')) return jsonResponse({ bookings: [], truncated: false })
        if (url.startsWith('/api/admin/bookings?page=')) return jsonResponse({ bookings: [], total: 0 })
        if (url.endsWith('&limit=1') || url.endsWith('&limit=100')) return jsonResponse({ total: 0, bookings: [] })
        return jsonResponse({})
      }),
    )
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
    render(<BookingsWorkspace initialView={initialView} initialCalendarView="week" />)
    await flush()
    await flush()
    await flush()
    return { calls, flush }
  }

  it('the list lists a Tour chip next to Hourly and Daily that filters trip_type tour', async () => {
    const { calls, flush } = await renderWorkspace('list')
    expect(screen.getByRole('button', { name: 'Hourly' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Daily' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tour' }))
    await flush()
    await flush()
    expect(calls.some(u => u.startsWith('/api/admin/bookings?page=') && u.includes('tripType=tour'))).toBe(true)
  })

  it('the board and calendar filter bar lists a Tour chip that filters trip_type tour', async () => {
    const { calls, flush } = await renderWorkspace('board')
    fireEvent.click(screen.getByRole('button', { name: 'Tour' }))
    await flush()
    await flush()
    expect(screen.getByRole('button', { name: 'Tour' }).getAttribute('aria-pressed')).toBe('true')
    expect(calls.some(u => u.startsWith('/api/admin/bookings/dispatch') && u.includes('tripType=tour'))).toBe(true)
  })
})

describe('Dispatch board card: tour booking', () => {
  async function renderBoard(rows: AdminBooking[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/admin/bookings/dispatch')) return jsonResponse({ bookings: rows, truncated: false })
        if (url.startsWith('/api/admin/drivers')) return jsonResponse({ data: [] })
        return jsonResponse({})
      }),
    )
    render(
      <BookingPanelProvider>
        <DispatchBoard search="" tripType="all" />
      </BookingPanelProvider>,
    )
    await waitFor(() => expect(screen.getAllByText(rows[0].booking_reference).length).toBeGreaterThan(0))
  }

  it('shows Day trip and the hours on the card', async () => {
    await renderBoard([tourBooking({ booking_reference: 'PRE-T1' })])
    const line = screen.getByTestId('board-tour-line')
    expect(line.textContent).toContain('Day trip: Dresden')
    expect(line.textContent).toContain('6 h at destination')
  })

  it('a transfer card has no day-trip line', async () => {
    await renderBoard([makeBooking({ booking_reference: 'PRE-X1' })])
    expect(screen.queryByTestId('board-tour-line')).toBeNull()
  })
})

describe('Driver trip screen: tour booking', () => {
  function props(tour: TripScreenProps['trip']['tour']): TripScreenProps {
    return {
      token: 'a0000004-0000-4000-8000-000000000004',
      view: { status: 'assigned', nextStep: 'en_route', lockReason: null, unlocksAt: null },
      trip: {
        bookingReference: 'PRG-100',
        pickupDate: '2027-10-31',
        pickupTime: '08:00',
        originAddress: 'Hotel Prague',
        destinationAddress: 'Dresden',
        origin: { lat: 50.1, lng: 14.26 },
        destination: { lat: 51.05, lng: 13.74 },
        passengerName: 'Alice Smith',
        passengerPhone: '+420123456789',
        vehicleLabel: 'Business Class',
        vehicleInfo: null,
        driverName: 'John Driver',
        flight: null,
        clientNotes: null,
        distanceKm: 150,
        landing: null,
        freeWaitUntil: null,
        stops: [],
        tour,
      },
      initialNote: null,
      noShow: { availableAt: null, requestedAt: null },
    }
  }

  it('shows Day trip, the hours at the destination and the return to the pickup', () => {
    render(<TripScreen {...props(tourDisplay(tourBooking()))} />)
    const line = screen.getByTestId('driver-tour-line')
    expect(within(line).getByText('Day trip: Dresden')).toBeTruthy()
    expect(line.textContent).toContain('6 h at destination · 1 extra')
    expect(line.textContent).toContain('Return to the pickup address')
  })

  it('a transfer shows no day-trip line', () => {
    render(<TripScreen {...props(null)} />)
    expect(screen.queryByTestId('driver-tour-line')).toBeNull()
    expect(screen.queryByText(/Day trip/)).toBeNull()
  })
})

describe('TripEditPanel: tour price is fixed', () => {
  const NOTE = 'Tour prices are fixed. Use Override price to change this booking.'

  async function openReview(booking: AdminBooking, patchBooking = vi.fn(async (_body: PatchBody) => ({}))) {
    render(<TripEditPanel booking={booking} patchBooking={patchBooking} onUpdated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    // vehicle review needs a different class selected; the route review is always available
    const reviewButtons = await screen.findAllByRole('button', { name: /Review Price/ })
    fireEvent.click(reviewButtons[reviewButtons.length - 1])
    return patchBooking
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
  })

  it('shows the amount read-only with the note and no price calculation call', async () => {
    await openReview(tourBooking())
    expect(await screen.findByText(NOTE)).toBeTruthy()
    const input = screen.getByDisplayValue('5000') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    const confirm = screen.getByRole('button', { name: 'Confirm & Save' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.includes('calculate-price'))).toBe(false)
  })

  it('ticking Override price makes the amount editable and the PATCH carries override_price', async () => {
    const patch = await openReview(tourBooking())
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Override price' }))
    const input = screen.getByDisplayValue('5000') as HTMLInputElement
    expect(input.readOnly).toBe(false)
    fireEvent.change(input, { target: { value: '5400' } })
    const confirm = screen.getByRole('button', { name: 'Confirm & Save' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][0]).toMatchObject({ id: 'b1', amount_czk: 5400, override_price: true })
  })

  it('a transfer keeps the calculated review and has no tour note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ quoteMode: true })))
    await openReview(makeBooking())
    await waitFor(() => expect(screen.queryByText('Calculating…')).toBeNull())
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})

describe('ExtraChargeModal: extra-hour hint for a tour (D-04)', () => {
  const eur = (n: number) => formatMinor(Math.round(n * 100), 'eur')

  function renderModal(tourVehicleClass: string | null) {
    render(
      <ExtraChargeModal
        isOpen
        bookingId="77777777-7777-4777-8777-777777777777"
        currency="eur"
        inFlight={null}
        tourVehicleClass={tourVehicleClass}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    )
  }

  it('shows the extra-hour price of the booked class and leaves the amount empty', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ extra_hour_e_eur: 40, extra_hour_s_eur: 65, extra_hour_v_eur: 55 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderModal('first_class')
    expect(await screen.findByText(`Extra hour for this car: ${eur(65)}`)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/tour-settings', expect.anything())
    expect((screen.getByLabelText('Amount (EUR)') as HTMLInputElement).value).toBe('')
  })

  it('a failed settings fetch hides the hint and the modal still works', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'x' }, 500)))
    renderModal('business')
    await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1))
    expect(screen.queryByTestId('extra-hour-hint')).toBeNull()
    expect(screen.getByLabelText('Amount (EUR)')).toBeTruthy()
  })

  it('a booking that is not a tour never reads the tour settings', () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    renderModal(null)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('extra-hour-hint')).toBeNull()
  })
})
