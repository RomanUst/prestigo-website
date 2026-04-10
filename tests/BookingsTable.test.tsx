import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock @tanstack/react-table (passthrough)
vi.mock('@tanstack/react-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-table')>()
  return actual
})

type PartialBooking = {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual'
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
