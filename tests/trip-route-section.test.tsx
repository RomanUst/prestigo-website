import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TripRouteSection } from '@/components/admin/TripRouteSection'
import { BookingDetailPanel } from '@/components/admin/BookingDetailPanel'
import { TripEditPanel } from '@/components/admin/TripEditPanel'
import { PatchError, type AdminBooking, type AdminBookingStop } from '@/components/admin/bookingTypes'
import type { BookingMovesApi } from '@/components/admin/useBookingMoves'
import { formatEUR } from '@/lib/currency'

// AddressInput is a next-intl consumer; the trip-edit panel mounts it when edit mode opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

// Phase 91 plan 12 (STOP-04, STOP-05): the Route section of the shared admin booking panel, and the two notes of the
// trip-edit panel (stops: set the price by hand; landing: the pickup follows the landing).

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-ROUTE',
    booking_source: 'online',
    pickup_date: '2027-06-10',
    pickup_time: '14:30',
    client_first_name: 'Ivan',
    client_last_name: 'Petrov',
    client_email: 'ivan@example.com',
    client_phone: '+420111222333',
    trip_type: 'transfer',
    vehicle_class: 'business',
    amount_czk: 5000,
    driver_price_czk: null,
    origin_address: 'Prague Airport',
    destination_address: 'Old Town Square',
    origin_lat: 50.1,
    origin_lng: 14.26,
    destination_lat: 50.087,
    destination_lng: 14.421,
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
    payment_intent_id: 'pi_test',
    payment_link_url: null,
    payment_link_id: null,
    status: 'confirmed',
    operator_notes: null,
    created_at: '2027-04-10T10:00:00Z',
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
    payment_mode: null,
    payment_state: null,
    ...overrides,
  }
}

const KARLOVY_VARY: AdminBookingStop = {
  position: 1,
  address: 'Karlovy Vary',
  lat: 50.23,
  lng: 12.87,
  waitMinutes: 45,
  freeMinutes: 15,
  blocks: 2,
  feePerBlockEur: 12,
  feeEur: 24,
}

const PILSEN: AdminBookingStop = {
  position: 2,
  address: 'Pilsen',
  lat: 49.74,
  lng: 13.37,
  waitMinutes: 15,
  freeMinutes: 15,
  blocks: 0,
  feePerBlockEur: null,
  feeEur: 0,
}

const AIRPORT_ROW: Partial<AdminBooking> = {
  landing_date: '2027-06-10',
  landing_time: '14:00',
  pickup_offset_min: 30,
}

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

describe('TripRouteSection (tracer): landing, pickup, stops and the waiting total', () => {
  it('shows landing 14:00, pickup 14:30 (+30 min), stop 1 with 45 min and 2 paid blocks, and the waiting total', () => {
    render(<TripRouteSection booking={makeBooking({ ...AIRPORT_ROW, stops: [KARLOVY_VARY] })} />)

    expect(screen.getByText('Landing 14:00')).toBeDefined()
    expect(screen.getByText('Pickup 14:30 (+30 min)')).toBeDefined()
    expect(screen.getByText('1. Karlovy Vary')).toBeDefined()
    expect(screen.getByText('45 min')).toBeDefined()
    expect(screen.getByText('2 × 15 min paid')).toBeDefined()
    expect(screen.getByText('Waiting at stops')).toBeDefined()
    expect(within(screen.getByTestId('trip-route-waiting-total')).getByText(formatEUR(24))).toBeDefined()
  })

  it('lists the stops in the order given, and a stop within the free time shows no paid blocks', () => {
    render(<TripRouteSection booking={makeBooking({ stops: [KARLOVY_VARY, PILSEN] })} />)

    const items = within(screen.getByTestId('trip-route-stops')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('1. Karlovy Vary')
    expect(items[1].textContent).toContain('2. Pilsen')
    expect(within(items[1]).getByText('15 min')).toBeDefined()
    expect(within(items[1]).getByText('Free waiting')).toBeDefined()
    expect(within(items[1]).queryByText(/paid/)).toBeNull()
  })

  it('the waiting total is the sum of the stored stop fees, not a recomputation', () => {
    const second: AdminBookingStop = { ...PILSEN, waitMinutes: 60, blocks: 3, feePerBlockEur: 12, feeEur: 36 }
    render(<TripRouteSection booking={makeBooking({ stops: [KARLOVY_VARY, second] })} />)
    expect(within(screen.getByTestId('trip-route-waiting-total')).getByText(formatEUR(60))).toBeDefined()
  })

  it('a stop whose address was erased shows "Address removed"', () => {
    render(<TripRouteSection booking={makeBooking({ stops: [{ ...KARLOVY_VARY, address: null }] })} />)
    expect(screen.getByText('Address removed')).toBeDefined()
    expect(screen.queryByText(/Karlovy Vary/)).toBeNull()
  })

  it('an airport pickup without stops shows landing and pickup but no stop list and no waiting total', () => {
    render(<TripRouteSection booking={makeBooking({ ...AIRPORT_ROW, stops: [] })} />)
    expect(screen.getByText('Landing 14:00')).toBeDefined()
    expect(screen.getByText('Pickup 14:30 (+30 min)')).toBeDefined()
    expect(screen.queryByTestId('trip-route-stops')).toBeNull()
    expect(screen.queryByText('Waiting at stops')).toBeNull()
  })

  it('shows the landing date when it differs from the pickup date (pickup after midnight)', () => {
    render(
      <TripRouteSection
        booking={makeBooking({ landing_date: '2027-06-10', landing_time: '23:50', pickup_offset_min: 30, pickup_date: '2027-06-11', pickup_time: '00:20' })}
      />,
    )
    expect(screen.getByText('Landing 23:50')).toBeDefined()
    expect(screen.getByText('2027-06-10')).toBeDefined()
    expect(screen.getByText('Pickup 00:20 (+30 min)')).toBeDefined()
  })

  it('offset 0 reads "at landing"', () => {
    render(<TripRouteSection booking={makeBooking({ landing_date: '2027-06-10', landing_time: '14:00', pickup_offset_min: 0, pickup_time: '14:00' })} />)
    expect(screen.getByText('Pickup 14:00 (at landing)')).toBeDefined()
  })

  it('stops without a landing show the stops and no landing line', () => {
    render(<TripRouteSection booking={makeBooking({ stops: [KARLOVY_VARY] })} />)
    expect(screen.queryByTestId('trip-route-landing')).toBeNull()
    expect(screen.getByText('1. Karlovy Vary')).toBeDefined()
  })

  it('renders nothing for a booking without stops and without a landing', () => {
    const { container } = render(<TripRouteSection booking={makeBooking()} />)
    expect(container.innerHTML).toBe('')
    const empty = render(<TripRouteSection booking={makeBooking({ stops: [], landing_date: null, landing_time: null, pickup_offset_min: null })} />)
    expect(empty.container.innerHTML).toBe('')
  })

  it('renders its children (the slot for the move-pickup button) at the end of the section', () => {
    render(
      <TripRouteSection booking={makeBooking({ ...AIRPORT_ROW })}>
        <button type="button">Move pickup</button>
      </TripRouteSection>,
    )
    const section = screen.getByTestId('trip-route-section')
    expect(section.lastElementChild?.textContent).toBe('Move pickup')
  })
})

describe('BookingDetailPanel mounts the Route section right after the flight block', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the Route section for a booking with a landing and stops, after the flight block and before the detail grid', () => {
    render(
      <BookingDetailPanel
        booking={makeBooking({ ...AIRPORT_ROW, stops: [KARLOVY_VARY], flight_iata: 'OK123', flight_status: 'scheduled' })}
        moves={fakeMoves()}
        onPatched={vi.fn()}
      />,
    )
    const panel = screen.getByTestId('booking-detail-panel')
    const route = screen.getByTestId('trip-route-section')
    expect(panel.contains(route)).toBe(true)
    expect(screen.getByText('Landing 14:00')).toBeDefined()
    // After the flight block (document order) and before the Origin field.
    const flight = screen.getByText('Flight status')
    expect(flight.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const origin = screen.getByText('Origin')
    expect(route.compareDocumentPosition(origin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders nothing new for a booking without stops and without a landing', () => {
    render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)
    expect(screen.queryByTestId('trip-route-section')).toBeNull()
    expect(screen.queryByText('Waiting at stops')).toBeNull()
  })
})

describe('TripEditPanel notes (Phase 91, Pitfall 10 and D-07, D-18)', () => {
  const STOPS_NOTE =
    'This booking has stops: the recalculated price leaves out the detour and the waiting. Set the price by hand.'
  const LANDING_HINT =
    'Timed from landing 14:00: pickup can be 14:00, 14:15, 14:30, 14:45, 15:00 or 15:30. For a new landing time use Move pickup.'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function openEdit(booking: AdminBooking, patchBooking = vi.fn().mockResolvedValue({ ok: true }), onUpdated = vi.fn()) {
    render(<TripEditPanel booking={booking} patchBooking={patchBooking} onUpdated={onUpdated} />)
    fireEvent.click(screen.getByText('Edit Trip Details'))
    return { patchBooking, onUpdated }
  }

  it('shows the landing hint under the pickup fields for a booking with a landing', () => {
    openEdit(makeBooking({ ...AIRPORT_ROW }))
    expect(screen.getByTestId('landing-pickup-hint').textContent).toBe(LANDING_HINT)
  })

  it('shows no landing hint and no stops note for a plain booking', async () => {
    openEdit(makeBooking())
    expect(screen.queryByTestId('landing-pickup-hint')).toBeNull()
    fireEvent.change(screen.getByDisplayValue('Business'), { target: { value: 'first_class' } })
    stubCalculatePrice()
    fireEvent.click(screen.getAllByText('Review Price →')[0])
    await screen.findByText('Review Price Change')
    expect(screen.queryByTestId('stops-price-note')).toBeNull()
  })

  it('maps a 422 landing_pickup_mismatch of the date and time save to the landing hint', async () => {
    const patchBooking = vi.fn().mockRejectedValue(new PatchError('landing_pickup_mismatch', { status: 422 }))
    openEdit(makeBooking({ ...AIRPORT_ROW }), patchBooking)

    fireEvent.click(screen.getByText('Save Date & Time'))

    await waitFor(() => expect(patchBooking).toHaveBeenCalledTimes(1))
    // The hint is shown under the fields and again as the save error of the group.
    await waitFor(() => expect(screen.getAllByText(LANDING_HINT).length).toBeGreaterThanOrEqual(2))
  })

  it('a date and time save that matches landing + an offset reports pickup_offset_min to the row', async () => {
    const { patchBooking, onUpdated } = openEdit(makeBooking({ ...AIRPORT_ROW }))
    const timeInput = screen.getByDisplayValue('14:30')
    fireEvent.change(timeInput, { target: { value: '15:00' } })

    fireEvent.click(screen.getByText('Save Date & Time'))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
    expect(patchBooking).toHaveBeenCalledWith({ id: 'b1', pickup_date: '2027-06-10', pickup_time: '15:00' })
    expect(onUpdated).toHaveBeenCalledWith('b1', { pickup_date: '2027-06-10', pickup_time: '15:00', pickup_offset_min: 60 })
  })

  function stubCalculatePrice() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ distanceKm: 20, prices: { business: { total: 60 }, first_class: { total: 90 }, business_van: { total: 80 } } }),
      }),
    )
  }

  it('shows the stops note in the price review of a booking with stops', async () => {
    stubCalculatePrice()
    openEdit(makeBooking({ stops: [KARLOVY_VARY] }))
    fireEvent.change(screen.getByDisplayValue('Business'), { target: { value: 'first_class' } })
    fireEvent.click(screen.getAllByText('Review Price →')[0])

    await screen.findByText('Review Price Change')
    expect(screen.getByTestId('stops-price-note').textContent).toBe(STOPS_NOTE)
    // The review starts from the booking's own amount, not from a recompute that leaves out the stops.
    await waitFor(() => expect((screen.getByDisplayValue('5000') as HTMLInputElement).value).toBe('5000'))
  })

  it('maps a 422 stops_edit_unsupported of the price save to the same note', async () => {
    stubCalculatePrice()
    const patchBooking = vi.fn().mockRejectedValue(new PatchError('stops_edit_unsupported', { status: 422 }))
    openEdit(makeBooking({ stops: [KARLOVY_VARY] }), patchBooking)
    fireEvent.change(screen.getByDisplayValue('Business'), { target: { value: 'first_class' } })
    fireEvent.click(screen.getAllByText('Review Price →')[0])
    await screen.findByText('Confirm & Save')

    fireEvent.click(screen.getByText('Confirm & Save'))

    await waitFor(() => expect(patchBooking).toHaveBeenCalledTimes(1))
    // The static note plus the error line: two copies of the same sentence.
    await waitFor(() => expect(screen.getAllByText(STOPS_NOTE).length).toBe(2))
    expect(patchBooking.mock.calls[0][0].override_price).toBeUndefined()
  })
})
