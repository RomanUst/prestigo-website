import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import { BookingDetailPanel } from '@/components/admin/BookingDetailPanel'
import { BookingPanelProvider, useBookingPanel, useBookingEvents, type BookingPanelValue, type BookingEvent } from '@/components/admin/BookingPanelProvider'
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
    requestMove: vi.fn(),
    openNoShow: vi.fn(),
    openCancel: vi.fn(),
    refreshBooking: vi.fn(),
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

  describe('pickup edit (WR-03)', () => {
    it('drops the stale pickup_utc when the date and time are saved, so views use the new wall clock', async () => {
      const onPatched = vi.fn()
      render(
        <BookingDetailPanel
          booking={makeBooking({ pickup_utc: '2026-05-01T08:00:00Z' })}
          moves={fakeMoves()}
          onPatched={onPatched}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Edit Trip Details' }))
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2026-05-02' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save Date & Time' }))
      await waitFor(() => expect(onPatched).toHaveBeenCalled())
      expect(onPatched).toHaveBeenCalledWith('b1', {
        pickup_date: '2026-05-02',
        pickup_time: '10:00',
        pickup_utc: null,
      })
    })

    it('leaves pickup_utc alone for an edit that does not touch the pickup', async () => {
      const onPatched = vi.fn()
      render(<BookingDetailPanel booking={makeBooking({ pickup_utc: '2026-05-01T08:00:00Z' })} moves={fakeMoves()} onPatched={onPatched} />)
      fireEvent.click(screen.getByRole('button', { name: 'Edit Trip Details' }))
      const phone = screen.getByDisplayValue('+420111222333')
      fireEvent.change(phone, { target: { value: '+420999888777' } })
      fireEvent.click(screen.getByRole('button', { name: /Save Phone/i }))
      await waitFor(() => expect(onPatched).toHaveBeenCalled())
      expect(onPatched).toHaveBeenCalledWith('b1', { client_phone: '+420999888777' })
    })
  })

  describe('panel-driven driver assignment (WR-06)', () => {
    const DRIVER_ID = '11111111-1111-1111-1111-111111111111'

    function stubAssignFetch(reportedStatus: string) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
        if (url.endsWith('/assign') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve({
              assignment: { id: 'a1', driver_id: DRIVER_ID, status: 'pending' },
              booking_status: reportedStatus,
            }),
          })
        }
        if (url.endsWith('/assignment')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ assignment: null }) })
        if (url === '/api/admin/drivers') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: DRIVER_ID, name: 'Test Driver', active: true }] }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }))
    }

    async function assignDriver() {
      // the status select shares the role; the driver select is the one that lists the driver
      const select = await waitFor(() => {
        const found = screen.getAllByRole('combobox').find(el => within(el).queryByText('Test Driver'))
        expect(found).toBeDefined()
        return found as HTMLElement
      })
      fireEvent.change(select, { target: { value: DRIVER_ID } })
      fireEvent.click(screen.getByRole('button', { name: /^assign$/i }))
    }

    it('keeps the status the server reported (a pending booking stays pending) and asks the views to refetch', async () => {
      stubAssignFetch('pending')
      const onPatched = vi.fn()
      const moves = fakeMoves()
      render(<BookingDetailPanel booking={makeBooking({ status: 'pending' })} moves={moves} onPatched={onPatched} />)
      await assignDriver()
      await waitFor(() => expect(moves.refreshBooking).toHaveBeenCalledWith('b1'))
      expect(onPatched).not.toHaveBeenCalledWith('b1', expect.objectContaining({ status: expect.anything() }))
    })

    it('follows a reported move to assigned and asks the views to refetch', async () => {
      stubAssignFetch('assigned')
      const onPatched = vi.fn()
      const moves = fakeMoves()
      render(<BookingDetailPanel booking={makeBooking({ status: 'confirmed' })} moves={moves} onPatched={onPatched} />)
      await assignDriver()
      await waitFor(() => expect(onPatched).toHaveBeenCalledWith('b1', { status: 'assigned' }))
      expect(moves.refreshBooking).toHaveBeenCalledWith('b1')
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

// ---------------------------------------------------------------------------------------------------------------
// Phase 90 plan 05: the provider that hosts the side panel, the move dialogs and the selection for every view.
// ---------------------------------------------------------------------------------------------------------------

describe('BookingPanelProvider', () => {
  let api: BookingPanelValue
  let events: BookingEvent[]

  function Probe({ booking }: { booking: AdminBooking }) {
    const panel = useBookingPanel()
    useEffect(() => {
      api = panel
    })
    useBookingEvents(e => { events.push(e) })
    return (
      <>
        <button type="button" onClick={e => panel.openBooking(booking, e.currentTarget)}>open booking</button>
        <span data-testid="paused">{String(panel.pausePolling)}</span>
      </>
    )
  }

  function renderProvider(booking: AdminBooking = makeBooking()) {
    return render(
      <BookingPanelProvider>
        <Probe booking={booking} />
      </BookingPanelProvider>,
    )
  }

  async function openPanel() {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'open booking' })) })
    return screen.getByTestId('booking-panel')
  }

  const paused = () => screen.getByTestId('paused').textContent
  const paymentGets = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter(c => String(c[0]).endsWith('/api/admin/bookings/b1/payment') && !(c[1] as { method?: string } | undefined)?.method).length

  beforeEach(() => {
    stubFetch()
    events = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('useBookingPanel throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bare() { useBookingPanel(); return null }
    expect(() => render(<Bare />)).toThrow('useBookingPanel must be used inside BookingPanelProvider')
    spy.mockRestore()
  })

  it('renders no booking-panel until a booking is opened, then labels the aside and focuses the close button', async () => {
    renderProvider()
    expect(screen.queryByTestId('booking-panel')).toBeNull()

    const panel = await openPanel()
    expect(panel.tagName).toBe('ASIDE')
    expect(panel.getAttribute('aria-label')).toBe('Booking PRE-PANEL')
    expect(within(panel).getByTestId('booking-detail-panel')).toBeDefined()
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Close booking panel' }))
  })

  it('opening another booking switches the panel; opening the open one keeps it in place', async () => {
    renderProvider()
    await openPanel()
    const first = screen.getByTestId('booking-panel')
    await act(async () => { api.openBooking(makeBooking()) })
    expect(screen.getByTestId('booking-panel')).toBe(first)

    await act(async () => { api.openBooking(makeBooking({ id: 'b2', booking_reference: 'PRE-OTHER' })) })
    expect(screen.getByTestId('booking-panel').getAttribute('aria-label')).toBe('Booking PRE-OTHER')
    expect(api.selected?.id).toBe('b2')
  })

  it('the close button closes the panel and returns focus to the opener', async () => {
    renderProvider()
    const opener = screen.getByRole('button', { name: 'open booking' })
    const panel = await openPanel()
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Close booking panel' })) })
    expect(screen.queryByTestId('booking-panel')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('Escape closes the panel and returns focus to the opener', async () => {
    renderProvider()
    const opener = screen.getByRole('button', { name: 'open booking' })
    await openPanel()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByTestId('booking-panel')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('Escape closes an open money dialog and leaves the panel open (dialog guard); a second Escape closes the panel', async () => {
    renderProvider()
    await openPanel()
    await act(async () => { api.moves.openNoShow({ id: 'b1', booking_reference: 'PRE-PANEL' }) })
    expect(screen.getByRole('dialog')).toBeDefined()

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('booking-panel')).toBeDefined()

    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByTestId('booking-panel')).toBeNull()
  })

  it('Escape pressed while a menu is open leaves the panel open (WR-01)', async () => {
    renderProvider()
    await openPanel()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.appendChild(menu)
    try {
      await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
      expect(screen.getByTestId('booking-panel')).toBeDefined()
    } finally {
      menu.remove()
    }
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByTestId('booking-panel')).toBeNull()
  })

  it('Escape pressed inside a text field, select or listbox does not close the panel (WR-01)', async () => {
    renderProvider()
    const panel = await openPanel()
    await act(async () => { fireEvent.keyDown(within(panel).getByPlaceholderText(/e\.g\. 1000/), { key: 'Escape' }) })
    expect(screen.getByTestId('booking-panel')).toBeDefined()
    await act(async () => { fireEvent.keyDown(within(panel).getByPlaceholderText('Add internal notes...'), { key: 'Escape' }) })
    expect(screen.getByTestId('booking-panel')).toBeDefined()
    await act(async () => { fireEvent.keyDown(within(panel).getByText('Change from Confirmed...').closest('select') as HTMLElement, { key: 'Escape' }) })
    expect(screen.getByTestId('booking-panel')).toBeDefined()
  })

  it('mounts each money dialog exactly once for the whole page', async () => {
    renderProvider()
    await openPanel()
    await act(async () => { api.moves.openCancel(makeBooking()) })
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1)
  })

  it('a row change made in the panel is published as a patched event and updates the snapshot', async () => {
    renderProvider()
    const panel = await openPanel()
    fireEvent.change(within(panel).getByPlaceholderText(/e\.g\. 1000/), { target: { value: '1500' } })
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Save' })) })
    expect(events).toContainEqual({ type: 'patched', id: 'b1', patch: { driver_price_czk: 1500 } })
    expect(api.selected?.driver_price_czk).toBe(1500)
  })

  describe('pausePolling', () => {
    it('is false at rest and while a booking is open without input', async () => {
      renderProvider()
      expect(paused()).toBe('false')
      await openPanel()
      expect(paused()).toBe('false')
    })

    it('is true while the notes hold unsaved text and false again after the save', async () => {
      renderProvider()
      const panel = await openPanel()
      const notes = within(panel).getByPlaceholderText('Add internal notes...')
      fireEvent.change(notes, { target: { value: 'Gate B' } })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.blur(notes) })
      expect(patchCalls).toEqual([{ id: 'b1', operator_notes: 'Gate B' }])
      expect(paused()).toBe('false')
    })

    it('is true while the driver price differs from the saved value and false after the save', async () => {
      renderProvider(makeBooking({ driver_price_czk: 900 }))
      const panel = await openPanel()
      const price = within(panel).getByPlaceholderText(/e\.g\. 1000/)
      fireEvent.change(price, { target: { value: '950' } })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Save' })) })
      expect(paused()).toBe('false')
      // typing a different value is unsaved input again; typing the saved value back is not
      fireEvent.change(price, { target: { value: '951' } })
      expect(paused()).toBe('true')
      fireEvent.change(price, { target: { value: '950' } })
      expect(paused()).toBe('false')
    })

    it('is false while the notes hold text whose save failed, so a failed save cannot freeze the views (WR-08)', async () => {
      renderProvider()
      const panel = await openPanel()
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
        Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) }),
      ))
      const notes = within(panel).getByPlaceholderText('Add internal notes...')
      fireEvent.change(notes, { target: { value: 'will not save' } })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.blur(notes) })
      expect(within(panel).getByText('Error saving')).toBeDefined()
      expect(paused()).toBe('false')
    })

    it('is false while the driver price is one the save rejected (WR-08)', async () => {
      renderProvider()
      const panel = await openPanel()
      const price = within(panel).getByPlaceholderText(/e\.g\. 1000/)
      fireEvent.change(price, { target: { value: '1.5' } })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Save' })) })
      expect(within(panel).getByText('Enter a whole number ≥ 0')).toBeDefined()
      expect(paused()).toBe('false')
    })

    it('is true while the trip-edit form is open and false after it closes', async () => {
      renderProvider()
      const panel = await openPanel()
      fireEvent.click(within(panel).getByRole('button', { name: 'Edit Trip Details' }))
      expect(paused()).toBe('true')
      fireEvent.click(within(panel).getByRole('button', { name: 'Close Edit Mode' }))
      expect(paused()).toBe('false')
    })

    it('is true while a move dialog is open', async () => {
      renderProvider()
      await openPanel()
      await act(async () => { api.moves.openNoShow({ id: 'b1', booking_reference: 'PRE-PANEL' }) })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
      expect(paused()).toBe('false')
    })

    it('closing the panel with unsaved input clears the pause', async () => {
      renderProvider()
      const panel = await openPanel()
      fireEvent.change(within(panel).getByPlaceholderText('Add internal notes...'), { target: { value: 'half typed' } })
      expect(paused()).toBe('true')
      await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Close booking panel' })) })
      expect(paused()).toBe('false')
    })
  })

  describe('syncRows', () => {
    it('syncRows with a changed status updates the shown status and makes PaymentPanel refetch once', async () => {
      renderProvider()
      const panel = await openPanel()
      await within(panel).findByTestId('payment-panel')
      const before = paymentGets()
      expect(within(panel).getByText('Change from Confirmed...')).toBeDefined()

      await act(async () => { api.syncRows([makeBooking({ status: 'on_location' })]) })
      await waitFor(() => expect(paymentGets()).toBe(before + 1))
      expect(within(screen.getByTestId('booking-panel')).getByText('Change from On Location...')).toBeDefined()
    })

    it('syncRows with the same status and payment_state does not refetch the payment', async () => {
      renderProvider()
      const panel = await openPanel()
      await within(panel).findByTestId('payment-panel')
      const before = paymentGets()
      await act(async () => { api.syncRows([makeBooking({ operator_notes: 'changed elsewhere' })]) })
      expect(paymentGets()).toBe(before)
    })

    it('syncRows keeps text the operator is typing', async () => {
      renderProvider()
      const panel = await openPanel()
      const notes = within(panel).getByPlaceholderText('Add internal notes...') as HTMLTextAreaElement
      fireEvent.change(notes, { target: { value: 'typing now' } })
      await act(async () => { api.syncRows([makeBooking({ status: 'on_location', operator_notes: 'from the server' })]) })
      expect((within(screen.getByTestId('booking-panel')).getByPlaceholderText('Add internal notes...') as HTMLTextAreaElement).value).toBe('typing now')
      expect(paused()).toBe('true')
    })

    it('syncRows without the selected id leaves the panel open on its snapshot', async () => {
      renderProvider()
      await openPanel()
      await act(async () => { api.syncRows([makeBooking({ id: 'other', booking_reference: 'PRE-ELSE', status: 'completed' })]) })
      expect(screen.getByTestId('booking-panel').getAttribute('aria-label')).toBe('Booking PRE-PANEL')
      expect(api.selected?.status).toBe('confirmed')
    })

    it('syncRows with nothing selected is a no-op', async () => {
      renderProvider()
      await act(async () => { api.syncRows([makeBooking()]) })
      expect(screen.queryByTestId('booking-panel')).toBeNull()
    })
  })

  describe('with the bookings list', () => {
    it('a list refetch refreshes the open panel, and a row that left the list stays open as a snapshot', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
      let rows: AdminBooking[] = [makeBooking({ status: 'confirmed' })]
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/admin/bookings?')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ bookings: rows, total: rows.length, page: 0, limit: 20 }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }))
      const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
      render(<BookingPanelProvider><BookingsTable /></BookingPanelProvider>)

      fireEvent.click((await screen.findByText('PRE-PANEL')).closest('tr') as HTMLElement)
      const panel = await screen.findByTestId('booking-panel')
      expect(within(panel).getByText('Change from Confirmed...')).toBeDefined()

      // another view or the server moved the booking; the next list load carries the new status
      rows = [makeBooking({ status: 'on_location' })]
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hourly' })) })
      await waitFor(() => expect(within(screen.getByTestId('booking-panel')).getByText('Change from On Location...')).toBeDefined())

      // a later filter leaves the booking out of the list: the panel stays on its last snapshot
      rows = []
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Daily' })) })
      await waitFor(() => expect(screen.getByText('No upcoming trips')).toBeDefined())
      expect(within(screen.getByTestId('booking-panel')).getByText('Change from On Location...')).toBeDefined()
    })
  })
})
