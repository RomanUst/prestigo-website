import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MovePickupDialog } from '@/components/admin/MovePickupDialog'
import { TripRouteSection } from '@/components/admin/TripRouteSection'
import type { AdminBooking } from '@/components/admin/bookingTypes'

// Phase 91 plan 15 (STOP-05, D-08, D-11): the operator's confirm dialog for moving an airport pickup. It states the new
// landing and the resulting pickup before anything is sent; only its primary button sends the POST.

type Reply = { ok: boolean; status?: number; body?: unknown }

function stubFetch(reply: Reply | Promise<Reply> | 'reject' = { ok: true, status: 200, body: {} }) {
  const fetchMock = vi.fn().mockImplementation(() => {
    if (reply === 'reject') return Promise.reject(new Error('network'))
    return Promise.resolve(reply).then(r => ({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: () => Promise.resolve(r.body ?? {}),
    }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const OK_BODY = {
  ok: true,
  landing_date: '2027-06-10',
  landing_time: '15:10',
  pickup_date: '2027-06-10',
  pickup_time: '15:40',
}

function makeBooking(over: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'b-1',
    booking_reference: 'PRG-1',
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
    payment_intent_id: null,
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
    landing_date: '2027-06-10',
    landing_time: '14:00',
    pickup_offset_min: 30,
    ...over,
  }
}

function setup(booking: AdminBooking = makeBooking(), isOpen = true) {
  const onClose = vi.fn()
  const onMoved = vi.fn()
  const view = render(<MovePickupDialog isOpen={isOpen} booking={booking} onClose={onClose} onMoved={onMoved} />)
  return { onClose, onMoved, ...view }
}

function enterLanding(time: string, date?: string) {
  fireEvent.change(screen.getByLabelText('Landing time'), { target: { value: time } })
  if (date) fireEvent.change(screen.getByLabelText('Landing date'), { target: { value: date } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MovePickupDialog (tracer): landing 14:00 + 30 moved to 15:10', () => {
  it('is prefilled with the stored landing and shows the current landing and pickup', () => {
    setup()
    expect((screen.getByLabelText('Landing time') as HTMLInputElement).value).toBe('14:00')
    expect((screen.getByLabelText('Landing date') as HTMLInputElement).value).toBe('2027-06-10')
    expect(screen.getByText('Now: landing 14:00, pickup 14:30 (+30 min)')).toBeDefined()
  })

  it('states "Move pickup to 15:40" for a landing of 15:10 before anything is sent', () => {
    const fetchMock = stubFetch()
    setup()
    enterLanding('15:10')
    expect(screen.getByText('Move pickup to 15:40')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('has a "Notify client" checkbox that is off by default', () => {
    setup()
    expect((screen.getByLabelText('Notify client') as HTMLInputElement).checked).toBe(false)
  })

  it('POSTs once from the primary button with the landing, the pickup it showed and notify_client, then calls onMoved', async () => {
    const fetchMock = stubFetch({ ok: true, body: OK_BODY })
    const { onMoved, onClose } = setup()
    enterLanding('15:10')
    fireEvent.click(screen.getByLabelText('Notify client'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/bookings/b-1/landing')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      landing_date: '2027-06-10',
      landing_time: '15:10',
      expected_pickup_date: '2027-06-10',
      expected_pickup_time: '15:40',
      notify_client: true,
    })
    expect(onMoved).toHaveBeenCalledWith({
      landing_date: '2027-06-10',
      landing_time: '15:10',
      pickup_date: '2027-06-10',
      pickup_time: '15:40',
      pickup_utc: null,
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a second click while the request is pending sends no second request, and the dialog cannot be dismissed', async () => {
    let release: (r: Reply) => void = () => {}
    const pending = new Promise<Reply>(resolve => {
      release = resolve
    })
    const fetchMock = stubFetch(pending)
    const { onClose, onMoved } = setup()
    enterLanding('15:10')
    const primary = screen.getByRole('button', { name: 'Confirm move' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Escape and the secondary button are inert while pending.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Keep pickup' }))
    expect(onClose).not.toHaveBeenCalled()

    release({ ok: true, body: OK_BODY })
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1))
  })
})

describe('MovePickupDialog: what it states and refuses', () => {
  it('shows the date when the pickup rolls past midnight', () => {
    setup(makeBooking({ landing_time: '23:00', pickup_time: '23:30' }))
    enterLanding('23:50')
    expect(screen.getByText('Move pickup to 00:20 on 2027-06-11')).toBeDefined()
  })

  it('disables the primary button while the landing is the stored one', () => {
    setup()
    expect((screen.getByRole('button', { name: 'Confirm move' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('The landing is already 14:00.')).toBeDefined()
  })

  it('disables the primary button for an empty landing time and sends nothing', () => {
    const fetchMock = stubFetch()
    setup()
    enterLanding('')
    const primary = screen.getByRole('button', { name: 'Confirm move' }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    fireEvent.click(primary)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefills from the flight estimated arrival in Prague time when it differs from the stored landing', () => {
    // 2027-06-10T13:10:00Z is 15:10 in Prague (CEST, UTC+2).
    setup(makeBooking({ flight_estimated_arrival: '2027-06-10T13:10:00Z' }))
    expect((screen.getByLabelText('Landing time') as HTMLInputElement).value).toBe('15:10')
    expect((screen.getByLabelText('Landing date') as HTMLInputElement).value).toBe('2027-06-10')
    expect(screen.getByText('Move pickup to 15:40')).toBeDefined()
    expect(screen.getByText("Prefilled from the flight's estimated arrival.")).toBeDefined()
  })

  it('keeps the stored landing when the estimated arrival equals it', () => {
    setup(makeBooking({ flight_estimated_arrival: '2027-06-10T12:00:00Z' }))
    expect((screen.getByLabelText('Landing time') as HTMLInputElement).value).toBe('14:00')
    expect(screen.queryByText("Prefilled from the flight's estimated arrival.")).toBeNull()
  })

  it('renders nothing when closed', () => {
    const { container } = setup(makeBooking(), false)
    expect(container.innerHTML).toBe('')
  })

  it('the secondary button closes without sending anything', () => {
    const fetchMock = stubFetch()
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep pickup' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('MovePickupDialog: server answers', () => {
  it('409 pickup_changed names the pickup the server computed and keeps the dialog open', async () => {
    stubFetch({ ok: false, status: 409, body: { error: 'pickup_changed', pickup_date: '2027-06-10', pickup_time: '15:45' } })
    const { onMoved } = setup()
    enterLanding('15:10')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('15:45')
    expect(onMoved).not.toHaveBeenCalled()
  })

  it.each([
    ['stale', /changed while you were editing/],
    ['payment_in_progress', /payment is in progress/],
    ['final_status', /can no longer be moved/],
    ['no_landing', /no landing/],
    ['invalid_landing', /not a valid landing/],
  ])('maps %s to a readable line', async (code, pattern) => {
    stubFetch({ ok: false, status: code === 'stale' || code === 'payment_in_progress' ? 409 : 422, body: { error: code } })
    const { onMoved } = setup()
    enterLanding('15:10')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(pattern)
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('a network failure shows a generic line and re-enables the button', async () => {
    stubFetch('reject')
    setup()
    enterLanding('15:10')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))
    await screen.findByRole('alert')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm move' }) as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('TripRouteSection: the Move pickup button', () => {
  it('shows "Move pickup…" for a booking with a landing that is not final', () => {
    render(<TripRouteSection booking={makeBooking()} onBookingPatched={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Move pickup…' })).toBeDefined()
  })

  it.each(['completed', 'cancelled', 'no_show'])('does not show it for a %s booking', (status) => {
    render(<TripRouteSection booking={makeBooking({ status })} onBookingPatched={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Move pickup…' })).toBeNull()
  })

  it('does not show it for a booking with stops but no landing', () => {
    render(
      <TripRouteSection
        booking={makeBooking({
          landing_date: null,
          landing_time: null,
          pickup_offset_min: null,
          stops: [{ position: 1, address: 'Pilsen', lat: 1, lng: 1, waitMinutes: 15, freeMinutes: 15, blocks: 0, feePerBlockEur: null, feeEur: 0 }],
        })}
        onBookingPatched={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Move pickup…' })).toBeNull()
  })

  it('opens the dialog on click and hands the patch to the panel after a confirmed move', async () => {
    stubFetch({ ok: true, body: OK_BODY })
    const onBookingPatched = vi.fn()
    render(<TripRouteSection booking={makeBooking()} onBookingPatched={onBookingPatched} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move pickup…' }))
    expect(screen.getByRole('dialog')).toBeDefined()

    enterLanding('15:10')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }))

    await waitFor(() => expect(onBookingPatched).toHaveBeenCalledTimes(1))
    expect(onBookingPatched).toHaveBeenCalledWith({
      landing_date: '2027-06-10',
      landing_time: '15:10',
      pickup_date: '2027-06-10',
      pickup_time: '15:40',
      pickup_utc: null,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
