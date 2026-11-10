import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { BookingDetailPanel } from '@/components/admin/BookingDetailPanel'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import type { AdminBooking } from '@/components/admin/bookingTypes'
import type { BookingMovesApi } from '@/components/admin/useBookingMoves'

// AddressInput is a next-intl consumer; the trip-edit panel mounts it when edit mode opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-PANEL',
    booking_source: 'online',
    pickup_date: '2026-05-01',
    pickup_time: '10:00',
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
    created_at: '2026-04-10T10:00:00Z',
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
    payment_mode: 'card_hold',
    payment_state: 'hold_placed',
    ...overrides,
  }
}

function fakeMoves(overrides: Partial<BookingMovesApi> = {}): BookingMovesApi {
  return {
    isUpdating: vi.fn(() => false),
    conflictFor: vi.fn(() => null),
    requestStatusChange: vi.fn(),
    openNoShow: vi.fn(),
    openCancel: vi.fn(),
    anyDialogOpen: false,
    paymentBumpFor: vi.fn(() => 0),
    dialogs: null,
    ...overrides,
  }
}

interface PatchCall {
  id: string
  operator_notes?: string
  driver_price_czk?: number | null
}

let patchCalls: PatchCall[]

function stubFetch() {
  patchCalls = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    if (url === '/api/admin/bookings' && init?.method === 'PATCH') {
      patchCalls.push(JSON.parse(init.body ?? '{}') as PatchCall)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    // sections fetch their own data (payment, assignment, audit log): an empty answer is enough here
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
}

describe('BookingDetailPanel', () => {
  beforeEach(() => {
    stubFetch()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the detail fields, notes, driver price, driver assignment, payment panel and history for a card_hold booking', async () => {
    render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)

    expect(screen.getByText('Origin')).toBeDefined()
    expect(screen.getByText('Destination')).toBeDefined()
    expect(screen.getByText('Language')).toBeDefined()
    expect(screen.getByText('Operator Notes')).toBeDefined()
    expect(screen.getByText('Driver Price (CZK)')).toBeDefined()
    expect(screen.getByText('Prague Airport')).toBeDefined()
    expect(await screen.findByTestId('payment-panel')).toBeDefined()
    // DriverAssignmentSection and BookingChangeHistory fetch on mount
    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.includes('/assignment'))).toBe(true)
    expect(urls.some(u => u.includes('/audit-log'))).toBe(true)
  })

  it('seeds notes and driver price from the booking', () => {
    render(
      <BookingDetailPanel
        booking={makeBooking({ operator_notes: 'Gate B', driver_price_czk: 900 })}
        moves={fakeMoves()}
        onPatched={vi.fn()}
      />,
    )
    expect((screen.getByPlaceholderText('Add internal notes...') as HTMLTextAreaElement).value).toBe('Gate B')
    expect((screen.getByPlaceholderText(/e\.g\. 1000/) as HTMLInputElement).value).toBe('900')
  })

  describe('operator notes', () => {
    it('sends one PATCH after 800 ms of idle and reports it through onPatched', async () => {
      vi.useFakeTimers()
      const onPatched = vi.fn()
      render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={onPatched} />)

      const notes = screen.getByPlaceholderText('Add internal notes...')
      fireEvent.change(notes, { target: { value: 'Wait at arrivals' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(799) })
      expect(patchCalls).toHaveLength(0)

      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(patchCalls).toEqual([{ id: 'b1', operator_notes: 'Wait at arrivals' }])
      expect(onPatched).toHaveBeenCalledWith('b1', { operator_notes: 'Wait at arrivals' })
    })

    it('restarts the debounce on every keystroke', async () => {
      vi.useFakeTimers()
      render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)

      const notes = screen.getByPlaceholderText('Add internal notes...')
      fireEvent.change(notes, { target: { value: 'a' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      fireEvent.change(notes, { target: { value: 'ab' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      expect(patchCalls).toHaveLength(0)
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      expect(patchCalls).toEqual([{ id: 'b1', operator_notes: 'ab' }])
    })

    it('sends at once on blur', async () => {
      render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)

      const notes = screen.getByPlaceholderText('Add internal notes...')
      fireEvent.change(notes, { target: { value: 'Call on arrival' } })
      await act(async () => { fireEvent.blur(notes) })
      expect(patchCalls).toEqual([{ id: 'b1', operator_notes: 'Call on arrival' }])
    })

    it('sends a pending note exactly once when the panel unmounts', async () => {
      vi.useFakeTimers()
      const onPatched = vi.fn()
      const { unmount } = render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={onPatched} />)

      fireEvent.change(screen.getByPlaceholderText('Add internal notes...'), { target: { value: 'Typed just before closing' } })
      expect(patchCalls).toHaveLength(0)

      await act(async () => { unmount() })
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(patchCalls).toEqual([{ id: 'b1', operator_notes: 'Typed just before closing' }])
      expect(onPatched).toHaveBeenCalledWith('b1', { operator_notes: 'Typed just before closing' })
    })

    it('sends nothing on unmount when no note is pending', async () => {
      const { unmount } = render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={vi.fn()} />)
      await act(async () => { unmount() })
      expect(patchCalls).toHaveLength(0)
    })
  })

  describe('driver price', () => {
    function priceInput(): HTMLInputElement {
      return screen.getByPlaceholderText(/e\.g\. 1000/) as HTMLInputElement
    }

    it('saves null for an empty value', async () => {
      const onPatched = vi.fn()
      render(<BookingDetailPanel booking={makeBooking({ driver_price_czk: 700 })} moves={fakeMoves()} onPatched={onPatched} />)

      fireEvent.change(priceInput(), { target: { value: '' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
      expect(patchCalls).toEqual([{ id: 'b1', driver_price_czk: null }])
      expect(onPatched).toHaveBeenCalledWith('b1', { driver_price_czk: null })
    })

    it('shows the error state and sends nothing for a decimal value', async () => {
      const onPatched = vi.fn()
      render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={onPatched} />)

      fireEvent.change(priceInput(), { target: { value: '12.5' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
      expect(screen.getByText('Enter a whole number ≥ 0')).toBeDefined()
      expect(patchCalls).toHaveLength(0)
      expect(onPatched).not.toHaveBeenCalled()
    })

    it('saves a whole number and reports it through onPatched', async () => {
      const onPatched = vi.fn()
      render(<BookingDetailPanel booking={makeBooking()} moves={fakeMoves()} onPatched={onPatched} />)

      fireEvent.change(priceInput(), { target: { value: '1500' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
      expect(patchCalls).toEqual([{ id: 'b1', driver_price_czk: 1500 }])
      expect(onPatched).toHaveBeenCalledWith('b1', { driver_price_czk: 1500 })
    })
  })

  describe('status control', () => {
    it('offers exactly UI_TRANSITIONS[status] and routes the choice through moves.requestStatusChange', () => {
      const moves = fakeMoves()
      const booking = makeBooking({ status: 'confirmed' })
      render(<BookingDetailPanel booking={booking} moves={moves} onPatched={vi.fn()} />)

      const select = screen.getByText(/^Change from/).closest('select') as HTMLSelectElement
      const values = within(select).getAllByRole('option').map(o => (o as HTMLOptionElement).value).filter(v => v !== '')
      expect(values).toEqual(UI_TRANSITIONS.confirmed)

      fireEvent.change(select, { target: { value: 'assigned' } })
      expect(moves.requestStatusChange).toHaveBeenCalledWith(booking, 'assigned')
    })

    it('shows the final badge instead of a select for a terminal status', () => {
      render(<BookingDetailPanel booking={makeBooking({ status: 'completed' })} moves={fakeMoves()} onPatched={vi.fn()} />)
      expect(screen.queryByRole('combobox')).toBeNull()
      expect(screen.getByText(/\(final\)/)).toBeDefined()
    })

    it('shows the conflict line from the moves API', () => {
      const moves = fakeMoves({ conflictFor: vi.fn(() => 'This booking was just changed to Assigned by the driver. Reload to see the latest state.') })
      render(<BookingDetailPanel booking={makeBooking()} moves={moves} onPatched={vi.fn()} />)
      expect(screen.getByRole('alert').textContent).toContain('This booking was just changed')
    })
  })

  describe('money and no-show moves', () => {
    it('the Cancel Booking button calls moves.openCancel', () => {
      const moves = fakeMoves()
      const booking = makeBooking({ status: 'confirmed' })
      render(<BookingDetailPanel booking={booking} moves={moves} onPatched={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel Booking' }))
      expect(moves.openCancel).toHaveBeenCalledWith(booking)
    })

    it('hides the Cancel Booking button for a booking that cannot be cancelled here', () => {
      render(<BookingDetailPanel booking={makeBooking({ status: 'completed' })} moves={fakeMoves()} onPatched={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Cancel Booking' })).toBeNull()
    })

    it('the no-show banner confirm button calls moves.openNoShow', async () => {
      const moves = fakeMoves()
      const booking = makeBooking({ status: 'on_location', no_show_requested_at: '2026-05-01T12:41:00Z' })
      render(<BookingDetailPanel booking={booking} moves={moves} onPatched={vi.fn()} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Confirm no-show' }))
      expect(moves.openNoShow).toHaveBeenCalledWith(booking)
    })
  })
})
