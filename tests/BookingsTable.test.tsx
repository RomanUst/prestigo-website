import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// Mock @tanstack/react-table (passthrough)
vi.mock('@tanstack/react-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-table')>()
  return actual
})

type PartialBooking = {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual' | 'gnet'
  pickup_date: string
  pickup_time: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  trip_type: string
  vehicle_class: string
  amount_czk: number
  origin_address: string
  destination_address: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  passengers: number
  luggage: number
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  flight_number: string | null
  terminal: string | null
  hours: number | null
  return_date: string | null
  special_requests: string | null
  payment_intent_id: string | null
  status: string
  operator_notes: string | null
  created_at: string
  leg: 'outbound' | 'return' | null
  linked_booking_id: string | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  linked_booking: { booking_reference: string } | null
}

function makeBooking(overrides: Partial<PartialBooking> = {}): PartialBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-DEFAULT',
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
    status: 'confirmed',
    operator_notes: null,
    created_at: '2026-04-10T10:00:00Z',
    leg: null,
    linked_booking_id: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    linked_booking: null,
    ...overrides,
  }
}

function stubFetchWithBookings(bookings: PartialBooking[]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/admin/bookings')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ bookings, total: bookings.length, page: 0, limit: 20 }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
}

describe('BookingsTable mobile card layout', () => {
  beforeEach(() => {
    stubFetchWithBookings([])
  })

  it('renders card layout wrapper with md:hidden class when isMobile is true', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)
    const mobileCards = screen.getByTestId('mobile-cards')
    expect(mobileCards).toBeDefined()
    expect(mobileCards.className).toContain('md:hidden')
  })

  it('renders table wrapper with hidden md:block class for desktop', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)
    const desktopTable = screen.getByTestId('desktop-table')
    expect(desktopTable).toBeDefined()
    expect(desktopTable.className).toContain('hidden')
    expect(desktopTable.className).toContain('md:block')
  })
})

describe('BookingsTable LegBadge — RTAD-02', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  it('renders RETURN badge for a return-leg row', async () => {
    stubFetchWithBookings([
      makeBooking({
        id: 'b-return',
        booking_reference: 'PRE-RET',
        leg: 'return',
        linked_booking_id: 'b-outbound',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
        linked_booking: { booking_reference: 'PRE-OUT' },
      }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('RETURN')).toBeDefined()
    })
    expect(screen.queryByText('OUTBOUND')).toBeNull()
  })

  it('renders OUTBOUND badge for an outbound leg of a round trip (linked_booking_id present)', async () => {
    stubFetchWithBookings([
      makeBooking({
        id: 'b-outbound',
        booking_reference: 'PRE-OUT',
        leg: 'outbound',
        linked_booking_id: 'b-return',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
        linked_booking: { booking_reference: 'PRE-RET' },
      }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('OUTBOUND')).toBeDefined()
    })
    expect(screen.queryByText('RETURN')).toBeNull()
  })

  it('renders NO leg badge for a one-way booking (leg=null)', async () => {
    stubFetchWithBookings([
      makeBooking({
        id: 'b-oneway',
        booking_reference: 'PRE-OW',
        leg: null,
        linked_booking_id: null,
      }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('PRE-OW')).toBeDefined()
    })
    expect(screen.queryByText('RETURN')).toBeNull()
    expect(screen.queryByText('OUTBOUND')).toBeNull()
  })
})

describe('BookingsTable cancel modal round-trip variant — RTAD-04', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  it('shows per-leg refund amount and paired-booking warning for round-trip return leg', async () => {
    stubFetchWithBookings([
      makeBooking({
        id: 'b-return',
        booking_reference: 'PRE-RET',
        leg: 'return',
        linked_booking_id: 'b-outbound',
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
        linked_booking: { booking_reference: 'PRE-OUT' },
      }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    // Wait for row, expand it, trigger cancel flow
    await waitFor(() => {
      expect(screen.getByText('PRE-RET')).toBeDefined()
    })

    // Click the row to expand (desktop)
    const refCell = screen.getByText('PRE-RET')
    const rowEl = refCell.closest('tr')
    if (rowEl) fireEvent.click(rowEl)

    // Find and click the cancel button inside the expanded row.
    // The existing cancel button text is "Cancel Booking" (lowercase "Cancel Booking" per project convention).
    // Use a text-matching strategy that tolerates different labels:
    const cancelButtons = await screen.findAllByRole('button', { name: /cancel/i })
    // First cancel button inside the expanded row is the one that opens the modal
    const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
    expect(rowCancelBtn).toBeDefined()
    if (rowCancelBtn) fireEvent.click(rowCancelBtn)

    // Modal body assertions
    await waitFor(() => {
      expect(screen.getByText(/Refund: 4500 CZK for this leg only\./)).toBeDefined()
    })
    expect(screen.getByText(/The paired outbound booking PRE-OUT will NOT be affected and remains active\./)).toBeDefined()
    expect(screen.getByText(/PARTIAL STRIPE REFUND WILL BE ISSUED FOR THIS LEG/)).toBeDefined()
    // Confirm button stays as-is
    expect(screen.getByRole('button', { name: /Confirm Cancel \+ Refund/i })).toBeDefined()
  })
})

describe('BookingsTable unpaid status — Phase 62 ABND-03', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  it('desktop: renders the Unpaid badge label for a status="unpaid" row', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-unpaid', booking_reference: 'PRE-UNPAID', status: 'unpaid' }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    // Scope to the row itself — the filter bar also has an "Unpaid" chip
    // (D-08), so a bare screen-level query would be ambiguous / could
    // false-positive on the chip before the row has even loaded.
    const refCell = await screen.findByText('PRE-UNPAID')
    const rowEl = refCell.closest('tr')
    expect(rowEl).not.toBeNull()
    await waitFor(() => {
      expect(within(rowEl as HTMLElement).getByText('Unpaid')).toBeDefined()
    })
  })

  it('mobile: renders the Unpaid badge label for a status="unpaid" card', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))

    stubFetchWithBookings([
      makeBooking({ id: 'b-unpaid-mobile', booking_reference: 'PRE-UNPAID-M', status: 'unpaid' }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('mobile-cards')).toBeDefined()
    })
    expect(within(screen.getByTestId('mobile-cards')).getByText('Unpaid')).toBeDefined()
  })

  it('clicking the Unpaid chip fetches with status=unpaid; clicking it again returns to all', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/bookings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ bookings: [], total: 0, page: 0, limit: 20 }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    const unpaidChip = await screen.findByRole('button', { name: 'Unpaid' })
    fireEvent.click(unpaidChip)

    await waitFor(() => {
      const calledWithStatus = fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('status=unpaid'),
      )
      expect(calledWithStatus).toBe(true)
    })

    // Toggle back to 'all' — no status param sent
    fireEvent.click(unpaidChip)
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect(typeof lastCall[0]).toBe('string')
      expect((lastCall[0] as string).includes('status=')).toBe(false)
    })
  })
})

describe('Phase 51 — GNet UI', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  const gnetBooking: PartialBooking = {
    id: 'gnet-test-1',
    booking_reference: 'PRE-GNET-1',
    booking_source: 'gnet',
    pickup_date: '2026-06-01',
    pickup_time: '09:00',
    client_first_name: 'Gnet',
    client_last_name: 'Testuser',
    client_email: 'gnet@example.com',
    client_phone: '+420999888777',
    trip_type: 'transfer',
    vehicle_class: 'business',
    amount_czk: 3000,
    origin_address: 'Prague Airport T2',
    destination_address: 'Wenceslas Square',
    origin_lat: 50.1,
    origin_lng: 14.26,
    destination_lat: 50.08,
    destination_lng: 14.43,
    passengers: 1,
    luggage: 1,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    flight_number: null,
    terminal: null,
    hours: null,
    return_date: null,
    special_requests: null,
    payment_intent_id: null,
    status: 'pending',
    operator_notes: null,
    created_at: '2026-05-01T08:00:00Z',
    leg: null,
    linked_booking_id: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    linked_booking: null,
  }

  it('desktop: GNet row renders gnet-badge with text GNET', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('gnet-badge-gnet-test-1')).toBeDefined()
    })
    expect(screen.getByTestId('gnet-badge-gnet-test-1').textContent).toBe('GNET')
  })

  it('desktop: online row does NOT render gnet-badge', async () => {
    stubFetchWithBookings([makeBooking({ id: 'online-1', booking_reference: 'PRE-ONL-1' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('PRE-ONL-1')).toBeDefined()
    })
    expect(screen.queryByTestId('gnet-badge-online-1')).toBeNull()
  })

  it('mobile: GNet card renders gnet-badge-mobile', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))

    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('gnet-badge-mobile-gnet-test-1')).toBeDefined()
    })
  })

  it('cancel modal for GNet row does NOT contain "refund" text', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    // Wait for row to appear, then expand it
    await waitFor(() => {
      expect(screen.getByText('PRE-GNET-1')).toBeDefined()
    })
    const refCell = screen.getByText('PRE-GNET-1')
    const rowEl = refCell.closest('tr')
    if (rowEl) fireEvent.click(rowEl)

    // Click the Cancel Booking button inside the expanded row
    const cancelButtons = await screen.findAllByRole('button', { name: /cancel booking/i })
    const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
    expect(rowCancelBtn).toBeDefined()
    if (rowCancelBtn) fireEvent.click(rowCancelBtn)

    // Assert modal body has no refund text
    await waitFor(() => {
      // The modal is visible when "Keep Booking" button appears
      expect(screen.getByRole('button', { name: /keep booking/i })).toBeDefined()
    })
    // Find the modal heading (h2) to locate the modal container
    const heading = screen.getByRole('heading', { name: /cancel booking/i })
    const modalContainer = heading.closest('div[style]')
    expect(modalContainer?.textContent?.toLowerCase()).not.toContain('refund')
  })

  it('cancel modal for GNet row contains "GNet partner" copy', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('PRE-GNET-1')).toBeDefined()
    })
    const refCell = screen.getByText('PRE-GNET-1')
    const rowEl = refCell.closest('tr')
    if (rowEl) fireEvent.click(rowEl)

    const cancelButtons = await screen.findAllByRole('button', { name: /cancel booking/i })
    const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
    if (rowCancelBtn) fireEvent.click(rowCancelBtn)

    // Modal must be open (Keep Booking present) and contain "GNet partner" text
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /keep booking/i })).toBeDefined()
    })
    const modalHeading = screen.getByRole('heading', { name: /cancel booking/i })
    const modalContainer = modalHeading.closest('div[style]')
    expect(modalContainer?.textContent).toMatch(/GNet partner/i)
  })

  it('cancel modal confirm button for GNet row reads "Cancel Booking" not "Confirm Cancel + Refund"', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('PRE-GNET-1')).toBeDefined()
    })
    const refCell = screen.getByText('PRE-GNET-1')
    const rowEl = refCell.closest('tr')
    if (rowEl) fireEvent.click(rowEl)

    const cancelButtons = await screen.findAllByRole('button', { name: /cancel booking/i })
    const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
    if (rowCancelBtn) fireEvent.click(rowCancelBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /keep booking/i })).toBeDefined()
    })
    // Confirm button should NOT say "Confirm Cancel + Refund"
    expect(screen.queryByRole('button', { name: /Confirm Cancel \+ Refund/i })).toBeNull()
    // And "Cancel Booking" button should exist (the confirm button for GNet)
    const allCancelButtons = screen.getAllByRole('button', { name: /cancel booking/i })
    // At least one should be the confirm button in the modal (not the row-level one which is now hidden behind modal)
    expect(allCancelButtons.length).toBeGreaterThan(0)
  })
})

describe('BookingsTable Future/Past/All segmented control — Phase 65 Plan 04 (DISP-03/D-04/D-07)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  function stubFetchTracking(bookings: PartialBooking[] = []) {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/bookings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ bookings, total: bookings.length, page: 0, limit: 20 }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('clicking the Past segment updates the horizon fetch param and issues NO PATCH to /api/admin/settings', async () => {
    const fetchMock = stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('horizon=future'))).toBe(true)
    })

    const pastSegment = screen.getByRole('button', { name: 'Past' })
    fireEvent.click(pastSegment)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect(typeof lastCall[0]).toBe('string')
      expect((lastCall[0] as string)).toContain('horizon=past')
    })

    // Never PATCHes (or otherwise calls) /api/admin/settings
    expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/api/admin/settings'))).toBe(false)
  })

  it('remounting with the same defaultHorizon prop resets the active segment to the persisted default, not the last-used override (D-04)', async () => {
    const fetchMock = stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    const { unmount } = render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('horizon=future'))).toBe(true)
    })

    // Switch to Past in-session
    fireEvent.click(screen.getByRole('button', { name: 'Past' }))
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect((lastCall[0] as string)).toContain('horizon=past')
    })

    // Unmount (simulating a fresh page load / remount) and mount again with
    // the SAME persisted defaultHorizon prop.
    unmount()
    fetchMock.mockClear()
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect((lastCall[0] as string)).toContain('horizon=future')
    })
    // The remounted instance must NOT resume the prior session's 'past' override.
    expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('horizon=past'))).toBe(false)
  })

  it('Future segment + zero rows renders "No upcoming trips" distinct from Past/All\'s "No bookings found."', async () => {
    stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(screen.getByText('No upcoming trips')).toBeDefined()
    })
    expect(screen.getByText(/Every confirmed booking has passed\. Switch to Past or All to see historical trips\./)).toBeDefined()
    expect(screen.queryByText('No bookings found.')).toBeNull()

    // Switch to Past — the generic empty copy should replace the Future one.
    fireEvent.click(screen.getByRole('button', { name: 'Past' }))
    await waitFor(() => {
      expect(screen.getByText('No bookings found.')).toBeDefined()
    })
    expect(screen.queryByText('No upcoming trips')).toBeNull()
  })

  it('D-07: explicit startDate/endDate omits the horizon param and grays the active segment to the inactive style', async () => {
    const fetchMock = stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('horizon=future'))).toBe(true)
    })

    // Open the Date Range picker and set an explicit startDate. Query by
    // type="date" (there's no accessible label) — the "From" input renders
    // first, "To" second.
    fireEvent.click(screen.getByRole('button', { name: 'Date Range' }))
    const dateInputs = await waitFor(() => {
      const inputs = document.querySelectorAll('input[type="date"]')
      expect(inputs.length).toBe(2)
      return inputs
    })
    fireEvent.change(dateInputs[0], { target: { value: '2026-05-01' } })

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      const url = lastCall[0] as string
      expect(url).toContain('startDate=2026-05-01')
      expect(url).not.toContain('horizon=')
    })

    // The Future segment (which would normally be active) is grayed to the
    // inactive-chip style — no copper border, no active-tint background.
    const futureSegment = screen.getByRole('button', { name: 'Future' })
    expect(futureSegment.style.border).not.toContain('var(--copper)')
    expect(futureSegment.style.background).not.toContain('rgba(191, 160, 106, 0.09)')
  })

  it('a mocked failed fetch renders the distinct refetch-error copy (not the empty-state copy)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/bookings')) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t load bookings — check your connection and try again\./)).toBeDefined()
    })
    expect(screen.queryByText('No upcoming trips')).toBeNull()
    expect(screen.queryByText('No bookings found.')).toBeNull()
  })

  it('the active-segment style uses the current brand copper tint and border', async () => {
    stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    const futureSegment = await screen.findByRole('button', { name: 'Future' })
    await waitFor(() => {
      expect(futureSegment.style.background).toContain('rgba(191, 160, 106, 0.09)')
      expect(futureSegment.style.border).toContain('var(--copper)')
    })
  })
})
