import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { formatMinor } from '@/lib/payments/money'
import { formatPragueFull } from '@/components/admin/PaymentPanel'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'

// AddressInput is a next-intl consumer; the trip-edit panel mounts it when edit mode opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

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
  locale?: string | null
  no_show_requested_at?: string | null
  payment_mode?: string | null
  payment_state?: string | null
  // Phase 89 plan 16
  fee_case_status?: string | null
  cancel_policy?: unknown
  payment_amount_minor?: number | null
  payment_currency?: string | null
}

// Phase 89 plan 16: the cancel dialog asks who cancelled and preselects nothing. The fixture pickups are in the past,
// so "The client" would be late; "Prestigo" is always free. Helper picks a tile by its title.
function chooseWho(name: 'The client' | 'Prestigo') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }))
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

// Phase 90 plan 05: BookingsTable opens bookings in the panel hosted by BookingPanelProvider, so every render wraps it.
// The provider is imported statically; this file never calls vi.resetModules, so the dynamic BookingsTable
// import and the provider share one module instance (one React context).
function renderWithPanel(ui: React.ReactElement) {
  return render(<BookingPanelProvider>{ui}</BookingPanelProvider>)
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
    renderWithPanel(<BookingsTable />)
    const mobileCards = screen.getByTestId('mobile-cards')
    expect(mobileCards).toBeDefined()
    expect(mobileCards.className).toContain('md:hidden')
  })

  it('renders table wrapper with hidden md:block class for desktop', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)
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
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('Return')).toBeDefined()
    })
    expect(screen.queryByText('Outbound')).toBeNull()
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
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('Outbound')).toBeDefined()
    })
    expect(screen.queryByText('Return')).toBeNull()
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
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByText('PRE-OW')).toBeDefined()
    })
    expect(screen.queryByText('Return')).toBeNull()
    expect(screen.queryByText('Outbound')).toBeNull()
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
        trip_type: 'round_trip',
        linked_booking_id: null,
        outbound_amount_czk: 5000,
        return_amount_czk: 4500,
        linked_booking: { booking_reference: 'PRE-OUT' },
      }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

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

    // Dialog body assertions (Phase 89: the leg sentences moved into the new dialog; the refund line follows a choice)
    await screen.findByRole('radiogroup')
    expect(screen.getByText(/The paired outbound booking PRE-OUT will NOT be affected and remains active\./)).toBeDefined()
    chooseWho('Prestigo')
    expect(screen.getByText(/Refund: about 4500 CZK for this leg only/)).toBeDefined()
    expect(screen.getByRole('button', { name: /^Cancel and refund/ })).toBeDefined()
  })
})

describe('BookingsTable booking language — Phase 75-17 D-11', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  it('desktop: expanded row shows uppercase locale code for locale "ru"', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-locale-ru', booking_reference: 'PRE-LOCALE-RU', locale: 'ru' }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-LOCALE-RU')
    const rowEl = refCell.closest('tr')
    expect(rowEl).not.toBeNull()
    if (rowEl) fireEvent.click(rowEl)

    // The expanded detail panel renders as a SIBLING <tr> (colSpan row), not
    // nested inside the clicked row's own <tr> — query at document level.
    const languageLabel = await screen.findByText('Language')
    expect(languageLabel.nextElementSibling?.textContent).toBe('RU')
  })

  it('desktop: expanded row shows an em dash when locale is null', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-locale-null', booking_reference: 'PRE-LOCALE-NULL', locale: null }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-LOCALE-NULL')
    const rowEl = refCell.closest('tr')
    expect(rowEl).not.toBeNull()
    if (rowEl) fireEvent.click(rowEl)

    const languageLabel = await screen.findByText('Language')
    expect(languageLabel.nextElementSibling?.textContent).toBe('—')
  })

  it('mobile: expanded card shows uppercase locale code for locale "zh"', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))

    stubFetchWithBookings([
      makeBooking({ id: 'b-locale-zh-mobile', booking_reference: 'PRE-LOCALE-ZH-M', locale: 'zh' }),
    ])

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('mobile-cards')).toBeDefined()
    })
    const mobileCards = screen.getByTestId('mobile-cards')
    // Both the desktop table and the mobile card list render in the DOM
    // simultaneously in jsdom (viewport switching is CSS-only, md:hidden) —
    // scope every query to the mobile-cards container to avoid ambiguity.
    const refCell = await within(mobileCards).findByText('PRE-LOCALE-ZH-M')
    fireEvent.click(refCell)

    const languageLabel = await within(mobileCards).findByText('Language')
    expect(languageLabel.nextElementSibling?.textContent).toBe('ZH')
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
    renderWithPanel(<BookingsTable />)

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
    renderWithPanel(<BookingsTable />)

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
    renderWithPanel(<BookingsTable />)

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
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('gnet-badge-gnet-test-1')).toBeDefined()
    })
    expect(screen.getByTestId('gnet-badge-gnet-test-1').textContent).toBe('GNet')
  })

  it('desktop: online row does NOT render gnet-badge', async () => {
    stubFetchWithBookings([makeBooking({ id: 'online-1', booking_reference: 'PRE-ONL-1' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

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
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('gnet-badge-mobile-gnet-test-1')).toBeDefined()
    })
  })

  it('cancel modal for GNet row does NOT contain "refund" text', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

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
    renderWithPanel(<BookingsTable />)

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
    expect(screen.getByRole('dialog').textContent).toMatch(/GNet partner/i)
  })

  it('cancel modal confirm button for GNet row reads "Cancel booking" and never offers a refund', async () => {
    stubFetchWithBookings([gnetBooking])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

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
    chooseWho('The client')
    // A partner booking collects nothing: no refund button
    expect(screen.queryByRole('button', { name: /refund/i })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Nothing was collected. Only the status changes.')
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
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

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
    const { unmount } = renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

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
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

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
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

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
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

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
    expect(futureSegment.style.background).not.toContain('var(--admin-accent-tint)')
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
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t load bookings — check your connection and try again\./)).toBeDefined()
    })
    expect(screen.queryByText('No upcoming trips')).toBeNull()
    expect(screen.queryByText('No bookings found.')).toBeNull()
  })

  it('the active-segment style uses the current brand copper tint and border', async () => {
    stubFetchTracking([])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    const futureSegment = await screen.findByRole('button', { name: 'Future' })
    await waitFor(() => {
      expect(futureSegment.style.background).toContain('var(--admin-accent-tint)')
      expect(futureSegment.style.border).toContain('var(--copper)')
    })
  })
})

describe('BookingsTable deep link (Phase 80 D-18)', () => {
  const REF = 'PRG-20260928-D8E6DC'

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  function stubFetchTracking() {
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
    return fetchMock
  }

  function firstBookingsParams(fetchMock: ReturnType<typeof stubFetchTracking>): URLSearchParams {
    const call = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/api/admin/bookings'),
    )
    expect(call).toBeDefined()
    return new URLSearchParams((call![0] as string).split('?')[1])
  }

  async function waitForBookingsFetch(fetchMock: ReturnType<typeof stubFetchTracking>) {
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/api/admin/bookings')),
      ).toBe(true)
    })
  }

  it('?search=<ref> seeds the first fetch with search + horizon=all and fills the search box, with no settings PATCH', async () => {
    window.history.replaceState({}, '', `/admin/bookings?search=${REF}`)
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('search')).toBe(REF)
    expect(params.get('horizon')).toBe('all')

    const input = screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement
    expect(input.value).toBe(REF)

    expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/api/admin/settings'))).toBe(false)
  })

  it('?search=<email> seeds the first fetch with the email + horizon=all and fills the search box (Phase 85 D-11)', async () => {
    window.history.replaceState({}, '', `/admin/bookings?search=${encodeURIComponent('jane.doe+vip@example.com')}`)
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('search')).toBe('jane.doe+vip@example.com')
    expect(params.get('horizon')).toBe('all')
    expect((screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement).value).toBe(
      'jane.doe+vip@example.com',
    )
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('?search=<email> is trimmed before it is applied', async () => {
    window.history.replaceState({}, '', '/admin/bookings?search=%20jane%40example.com%20')
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('search')).toBe('jane@example.com')
    expect(params.get('horizon')).toBe('all')
  })

  it.each([
    ['empty value', '?search='],
    ['whitespace only', '?search=%20%20'],
    ['41 characters', `?search=${'A'.repeat(41)}`],
    ['script-like characters', '?search=PRG%3Cscript%3E'],
    ['underscore and space inside', '?search=PRG_2026%200928'],
    ['email with angle brackets', '?search=%3Cscript%3E%40x.com'],
    ['email domain without a dot', '?search=a%40b'],
    ['email with two @', '?search=jane%40%40example.com'],
    ['email with a quote in the local part', '?search=x%22%40example.com'],
    ['email with a single quote in the domain', '?search=jane%40exa%27mple.com'],
    ['email with a backtick', '?search=ja%60ne%40example.com'],
    ['email with inner whitespace', '?search=ja%20ne%40example.com'],
    ['email with an empty local part', '?search=%40example.com'],
    ['email with a 65-character local part', `?search=${'a'.repeat(65)}%40example.com`],
    ['email longer than 254 characters (255)', `?search=a%40${'b'.repeat(249)}.com`],
  ])('ignores an invalid search param (%s): first fetch keeps horizon=future and sends no search', async (_label, query) => {
    window.history.replaceState({}, '', `/admin/bookings${query}`)
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('horizon')).toBe('future')
    expect(params.has('search')).toBe(false)
    expect((screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement).value).toBe('')
  })

  it('no query string: first fetch has horizon=future and no search (unchanged behaviour)', async () => {
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('horizon')).toBe('future')
    expect(params.has('search')).toBe(false)
  })

  it('applies the deep link once: strips ?search= from the URL (keeping other params) and a remount starts from the defaults', async () => {
    window.history.replaceState({}, '', `/admin/bookings?search=${REF}&tab=all#top`)
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    const first = renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    expect(firstBookingsParams(fetchMock).get('search')).toBe(REF)
    await waitFor(() => expect(window.location.search).toBe('?tab=all'))
    expect(window.location.pathname).toBe('/admin/bookings')
    expect(window.location.hash).toBe('#top')

    first.unmount()
    fetchMock.mockClear()
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)
    await waitForBookingsFetch(fetchMock)
    const params = firstBookingsParams(fetchMock)
    expect(params.get('horizon')).toBe('future')
    expect(params.has('search')).toBe(false)
    expect((screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement).value).toBe('')
  })

  it('clearing the search box after a deep link refetches without search and keeps horizon=all', async () => {
    window.history.replaceState({}, '', `/admin/bookings?search=${REF}`)
    const fetchMock = stubFetchTracking()
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable defaultHorizon="future" horizonDays={7} />)

    await waitForBookingsFetch(fetchMock)
    const input = screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })

    await waitFor(() => {
      const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
      const p = new URLSearchParams(last.split('?')[1])
      expect(p.has('search')).toBe(false)
      expect(p.get('horizon')).toBe('all')
    })
  })
})

describe('BookingsTable on_board / no_show + status conflict — Phase 87 plan 05', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetchWithPatch(
    bookings: PartialBooking[],
    patchResponse: { ok: boolean; status: number; body: unknown },
  ) {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({
          ok: patchResponse.ok,
          status: patchResponse.status,
          json: () => Promise.resolve(patchResponse.body),
        })
      }
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

  it('desktop: an on_board row renders the On Board badge label', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-ob', booking_reference: 'PRE-ONBOARD', status: 'on_board' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-ONBOARD')
    const rowEl = refCell.closest('tr') as HTMLElement
    await waitFor(() => {
      expect(within(rowEl).getByText('On Board')).toBeDefined()
    })
  })

  it('desktop: a no_show row renders No-Show and, expanded, the final badge and the final notice', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-ns', booking_reference: 'PRE-NOSHOW', status: 'no_show' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-NOSHOW')
    const rowEl = refCell.closest('tr') as HTMLElement
    await waitFor(() => {
      expect(within(rowEl).getByText('No-Show')).toBeDefined()
    })

    fireEvent.click(rowEl)
    expect(await screen.findByText('No-Show (final)')).toBeDefined()
    expect(screen.getByText(/No-Show bookings are final and cannot be edited\./)).toBeDefined()
    expect(screen.queryByText(/^Change from /)).toBeNull()
  })

  it('mobile: on_board and no_show cards render their labels', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    stubFetchWithBookings([
      makeBooking({ id: 'b-ob-m', booking_reference: 'PRE-OB-M', status: 'on_board' }),
      makeBooking({ id: 'b-ns-m', booking_reference: 'PRE-NS-M', status: 'no_show' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('mobile-cards')).toBeDefined()
    })
    const cards = within(screen.getByTestId('mobile-cards'))
    await waitFor(() => {
      expect(cards.getByText('On Board')).toBeDefined()
      expect(cards.getByText('No-Show')).toBeDefined()
    })
  })

  it('desktop: the select for an on_location booking offers On Board and No-Show', async () => {
    stubFetchWithBookings([
      makeBooking({ id: 'b-ol', booking_reference: 'PRE-ONLOC', status: 'on_location' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-ONLOC')
    fireEvent.click(refCell.closest('tr') as HTMLElement)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    const labels = Array.from(select.options).map(o => o.textContent)
    expect(labels).toContain('On Board')
    expect(labels).toContain('No-Show')
  })

  it('desktop: a status change PATCHes expected_status = the row status', async () => {
    const fetchMock = stubFetchWithPatch(
      [makeBooking({ id: 'b-ol2', booking_reference: 'PRE-ONLOC2', status: 'on_location' })],
      { ok: true, status: 200, body: { booking: {} } },
    )
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-ONLOC2')
    fireEvent.click(refCell.closest('tr') as HTMLElement)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'on_board' } })

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        id: 'b-ol2',
        status: 'on_board',
        expected_status: 'on_location',
      })
    })
  })

  it('desktop: a 409 status_conflict shows the inline conflict copy, re-enables the control, does not alert or change the row', async () => {
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
    stubFetchWithPatch(
      [makeBooking({ id: 'b-cf', booking_reference: 'PRE-CONFLICT', status: 'assigned', payment_intent_id: null })],
      { ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'en_route' } },
    )
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-CONFLICT')
    const rowEl = refCell.closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cancelled' } })

    const msg = await screen.findByRole('alert')
    expect(msg.textContent).toBe('This booking was just changed to En Route by the driver. Reload to see the latest state.')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(alertSpy).not.toHaveBeenCalled()
    await waitFor(() => {
      expect((screen.getByText(/^Change from /).closest('select') as HTMLSelectElement).disabled).toBe(false)
    })
    // The row status was not optimistically changed
    expect(within(rowEl).getByText('Assigned')).toBeDefined()
  })

  it('cancel modal: a 409 status_conflict shows the conflict copy with no refund note, not the raw code (Phase 88: CAS first, nothing was refunded)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/admin/bookings/cancel') && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: 'status_conflict', currentStatus: 'on_board' }),
        })
      }
      if (typeof url === 'string' && url.includes('/api/admin/bookings')) {
        const bookings = [makeBooking({ id: 'b-cx', booking_reference: 'PRE-CANCEL-RACE', status: 'confirmed' })]
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ bookings, total: 1, page: 0, limit: 20 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-CANCEL-RACE')
    fireEvent.click(refCell.closest('tr') as HTMLElement)
    const openBtn = (await screen.findAllByRole('button', { name: /cancel booking/i })).find(b => !b.textContent?.includes('Keep'))
    fireEvent.click(openBtn as HTMLElement)
    await screen.findByRole('button', { name: /keep booking/i })
    chooseWho('Prestigo')
    fireEvent.click(screen.getByRole('button', { name: /^Cancel and refund/ }))

    expect(
      await screen.findByText(
        'This booking was just changed to On Board by the driver. Reload to see the latest state.',
      ),
    ).toBeDefined()
    expect(screen.queryByText(/refund was already issued/i)).toBeNull()
    expect(screen.queryByText('status_conflict')).toBeNull()
  })

  it('mobile: a 409 status_conflict shows the conflict copy under the status buttons', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
    stubFetchWithPatch(
      [makeBooking({ id: 'b-cf-m', booking_reference: 'PRE-CF-M', status: 'assigned' })],
      { ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'on_location' } },
    )
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await waitFor(() => {
      expect(screen.getByTestId('mobile-cards')).toBeDefined()
    })
    const cards = within(screen.getByTestId('mobile-cards'))
    const btn = await cards.findByRole('button', { name: 'En Route' })
    fireEvent.click(btn)

    const msg = await cards.findByRole('alert')
    expect(msg.textContent).toBe('This booking was just changed to On Location by the driver. Reload to see the latest state.')
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('desktop: any other PATCH failure keeps the alert behaviour', async () => {
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
    stubFetchWithPatch(
      [makeBooking({ id: 'b-er', booking_reference: 'PRE-ERR', status: 'assigned', payment_intent_id: null })],
      { ok: false, status: 500, body: { error: 'Boom' } },
    )
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const refCell = await screen.findByText('PRE-ERR')
    fireEvent.click(refCell.closest('tr') as HTMLElement)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cancelled' } })

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Boom'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('BookingsTable no-show request: chip, banner, confirm modal — Phase 87 plan 12 (D-16 a)', () => {
  // 13:41 UTC on 3 Nov 2026 is 14:41 in Prague
  const REQUESTED_AT = '2026-11-03T13:41:00.000Z'

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  type NoShowPost = { ok: boolean; status: number; body: unknown }

  function stubNoShowFetch(bookings: PartialBooking[], post: NoShowPost = { ok: true, status: 200, body: { ok: true, status: 'no_show' } }) {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/no-show')) {
        if (init?.method === 'POST') {
          return Promise.resolve({ ok: post.ok, status: post.status, json: () => Promise.resolve(post.body) })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'on_location', noShowRequestedAt: REQUESTED_AT, driverName: 'Jan Novak' }),
        })
      }
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ booking: {} }) })
      }
      if (u.includes('/api/admin/bookings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ bookings, total: bookings.length, page: 0, limit: 20 }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  type FetchMock = ReturnType<typeof vi.fn>
  const noShowPosts = (m: FetchMock) =>
    m.mock.calls.filter(([url, init]) => (init as RequestInit | undefined)?.method === 'POST' && String(url).includes('/no-show'))
  const patches = (m: FetchMock) => m.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')

  const requested = (over: Partial<PartialBooking> = {}) =>
    makeBooking({ id: 'b-ns1', booking_reference: 'PRE-NSREQ', status: 'on_location', no_show_requested_at: REQUESTED_AT, ...over })

  it('desktop: an on_location row with an open request shows the chip next to the status badge', async () => {
    stubNoShowFetch([requested()])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement
    await waitFor(() => {
      expect(within(rowEl).getByText('On Location')).toBeDefined()
      expect(within(rowEl).getByTestId('no-show-chip').textContent).toBe('No-show requested')
    })
  })

  it('desktop: no chip when the field is null or absent, or when the status is not on_location', async () => {
    stubNoShowFetch([
      makeBooking({ id: 'b-n1', booking_reference: 'PRE-NULL', status: 'on_location', no_show_requested_at: null }),
      makeBooking({ id: 'b-n2', booking_reference: 'PRE-ENROUTE', status: 'en_route', no_show_requested_at: REQUESTED_AT }),
      makeBooking({ id: 'b-n3', booking_reference: 'PRE-ABSENT', status: 'on_location' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await screen.findByText('PRE-NULL')
    await screen.findByText('PRE-ENROUTE')
    await screen.findByText('PRE-ABSENT')
    expect(screen.queryByTestId('no-show-chip')).toBeNull()
  })

  it('desktop: every booking with an open request gets its own chip', async () => {
    stubNoShowFetch([
      requested({ id: 'b-a', booking_reference: 'PRE-A' }),
      requested({ id: 'b-b', booking_reference: 'PRE-B' }),
      makeBooking({ id: 'b-c', booking_reference: 'PRE-C', status: 'on_location' }),
    ])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await screen.findByText('PRE-C')
    await waitFor(() => expect(screen.getAllByTestId('no-show-chip')).toHaveLength(2))
  })

  it('mobile: the card shows the chip next to the badge and the banner inside the expanded card', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    stubNoShowFetch([requested({ id: 'b-m', booking_reference: 'PRE-NS-M' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await waitFor(() => expect(screen.getByTestId('mobile-cards')).toBeDefined())
    const cards = within(screen.getByTestId('mobile-cards'))
    expect((await cards.findByTestId('no-show-chip')).textContent).toBe('No-show requested')
    expect(cards.queryByTestId('no-show-banner')).toBeNull()

    fireEvent.click(await cards.findByText('PRE-NS-M'))
    expect(await cards.findByTestId('no-show-banner')).toBeDefined()
    expect(await cards.findByText(/^Jan Novak asked for a no-show at 14:41/)).toBeDefined()
  })

  it('desktop: the expanded row shows the banner with the driver name and the Prague time', async () => {
    stubNoShowFetch([requested()])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    fireEvent.click((await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement)
    expect(await screen.findByTestId('no-show-banner')).toBeDefined()
    expect(
      await screen.findByText(
        'Jan Novak asked for a no-show at 14:41 after waiting for the passenger. Try to reach the client, then confirm or dismiss.',
      ),
    ).toBeDefined()
  })

  it('desktop: the banner button opens the modal; its primary POSTs confirm once and the row becomes No-Show (final)', async () => {
    const fetchMock = stubNoShowFetch([requested()])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm no-show' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        "Mark booking PRE-NSREQ as a no-show? The driver's trip link stops working and the status cannot be changed back.",
      ),
    ).toBeDefined()
    expect(noShowPosts(fetchMock)).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm no-show' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(noShowPosts(fetchMock)).toHaveLength(1)
    expect(JSON.parse((noShowPosts(fetchMock)[0][1] as RequestInit).body as string)).toEqual({
      action: 'confirm',
      expected_status: 'on_location',
    })
    await waitFor(() => {
      expect(within(rowEl).getByText('No-Show')).toBeDefined()
    })
    expect(screen.getByText('No-Show (final)')).toBeDefined()
    expect(screen.queryByTestId('no-show-banner')).toBeNull()
    expect(screen.queryByTestId('no-show-chip')).toBeNull()
    // the status service owns the write: the generic PATCH is never used
    expect(patches(fetchMock)).toHaveLength(0)
  })

  it("desktop: 'Keep booking open' closes the modal and changes nothing", async () => {
    const fetchMock = stubNoShowFetch([requested()])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm no-show' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep booking open' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(noShowPosts(fetchMock)).toHaveLength(0)
    expect(within(rowEl).getByText('On Location')).toBeDefined()
    expect(screen.getByTestId('no-show-banner')).toBeDefined()
  })

  it('desktop: a 409 in the modal shows the conflict copy and leaves the row unchanged', async () => {
    stubNoShowFetch([requested()], { ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'on_board' } })
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm no-show' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm no-show' }))

    const msg = await within(dialog).findByRole('alert')
    expect(msg.textContent).toBe('This booking was just changed to On Board by the driver. Reload to see the latest state.')
    expect(within(rowEl).getByText('On Location')).toBeDefined()
  })

  it("desktop: 'Client found' POSTs dismiss, then the chip and the banner disappear and the status stays", async () => {
    const fetchMock = stubNoShowFetch([requested()], { ok: true, status: 200, body: { ok: true, noShowRequestedAt: null } })
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-NSREQ')).closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    fireEvent.click(await screen.findByRole('button', { name: 'Client found' }))

    await waitFor(() => expect(screen.queryByTestId('no-show-banner')).toBeNull())
    expect(screen.queryByTestId('no-show-chip')).toBeNull()
    expect(noShowPosts(fetchMock)).toHaveLength(1)
    expect(JSON.parse((noShowPosts(fetchMock)[0][1] as RequestInit).body as string)).toEqual({ action: 'dismiss' })
    expect(within(rowEl).getByText('On Location')).toBeDefined()
  })

  it("desktop: choosing 'No-Show' in the status select opens the modal and does not PATCH", async () => {
    const fetchMock = stubNoShowFetch([makeBooking({ id: 'b-sel', booking_reference: 'PRE-SEL', status: 'on_location' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    fireEvent.click((await screen.findByText('PRE-SEL')).closest('tr') as HTMLElement)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'no_show' } })

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Mark booking PRE-SEL as a no-show\?/)).toBeDefined()
    expect(patches(fetchMock)).toHaveLength(0)
    expect(noShowPosts(fetchMock)).toHaveLength(0)
  })

  it('desktop: confirming from the select path moves the row to No-Show too', async () => {
    const fetchMock = stubNoShowFetch([makeBooking({ id: 'b-sel2', booking_reference: 'PRE-SEL2', status: 'on_location' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    const rowEl = (await screen.findByText('PRE-SEL2')).closest('tr') as HTMLElement
    fireEvent.click(rowEl)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'no_show' } })
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm no-show' }))

    await waitFor(() => expect(within(rowEl).getByText('No-Show')).toBeDefined())
    expect(noShowPosts(fetchMock)).toHaveLength(1)
    expect(patches(fetchMock)).toHaveLength(0)
  })

  it('desktop: other select choices still apply immediately', async () => {
    const fetchMock = stubNoShowFetch([makeBooking({ id: 'b-sel3', booking_reference: 'PRE-SEL3', status: 'on_location' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    fireEvent.click((await screen.findByText('PRE-SEL3')).closest('tr') as HTMLElement)
    const select = (await screen.findByText(/^Change from /)).closest('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'on_board' } })

    await waitFor(() => expect(patches(fetchMock)).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("mobile: the 'No-Show' status button opens the modal and does not PATCH", async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    const fetchMock = stubNoShowFetch([makeBooking({ id: 'b-selm', booking_reference: 'PRE-SELM', status: 'on_location' })])
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    renderWithPanel(<BookingsTable />)

    await waitFor(() => expect(screen.getByTestId('mobile-cards')).toBeDefined())
    const cards = within(screen.getByTestId('mobile-cards'))
    fireEvent.click(await cards.findByRole('button', { name: 'No-Show' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Mark booking PRE-SELM as a no-show\?/)).toBeDefined()
    expect(patches(fetchMock)).toHaveLength(0)
  })
})

describe('BookingsTable card payments: list badge, cancel variant, refund failed, payment effect — Phase 88 plan 07', () => {
  const PAYMENT_BODY = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    payment: {
      mode: 'card_hold', state: 'authorized', currency: 'eur', amount_minor: 12000, hold_amount_minor: 12000,
      captured_amount_minor: 0, hold_at: null, capture_before: '2026-12-12T13:05:00Z', card_saved: true,
      last_payment_error: null, payment_retry_at: null, payment_retry_count: 0, recovery_link_url: null,
      pickup_at: '2026-12-20T09:00:00Z', status: 'confirmed', completed: false,
      booking_reference: 'PRE-CARD', client_email: 'ivan@example.com', ...over,
    },
    allowed_actions: [], refund_failed: false, events: [], events_total: 0, ...extra,
  })

  type Reply = { ok: boolean; status: number; body: unknown }

  function stubCardFetch(
    bookings: PartialBooking[],
    opts: { payment?: unknown; cancel?: Reply; patch?: Reply } = {},
  ) {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/payment') && init?.method !== 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.payment ?? PAYMENT_BODY()) })
      }
      if (u.includes('/api/admin/bookings/cancel') && init?.method === 'POST') {
        const r = opts.cancel ?? { ok: true, status: 200, body: { ok: true } }
        return Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) })
      }
      if (init?.method === 'PATCH') {
        const r = opts.patch ?? { ok: true, status: 200, body: { booking: {} } }
        return Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) })
      }
      if (u.includes('/api/admin/bookings')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bookings, total: bookings.length, page: 0, limit: 20 }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const cardBooking = (over: Partial<PartialBooking> = {}) =>
    makeBooking({
      id: 'b-card', booking_reference: 'PRE-CARD', payment_intent_id: null,
      payment_mode: 'card_hold', payment_state: 'authorized', ...over,
    })

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function renderTable() {
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    return renderWithPanel(<BookingsTable />)
  }

  async function expandDesktop(ref: string) {
    const table = within(screen.getByTestId('desktop-table'))
    const refCell = await table.findByText(ref)
    fireEvent.click(refCell.closest('tr') as HTMLElement)
  }

  async function openCancelDialog() {
    const openBtn = (await screen.findAllByRole('button', { name: /cancel booking/i })).find(b => !b.textContent?.includes('Keep'))
    fireEvent.click(openBtn as HTMLElement)
    await screen.findByRole('button', { name: /keep booking/i })
  }

  // ── list badge ──────────────────────────────────────────────────────────

  it('desktop: a card_hold row shows its payment badge under the status badge; a pay_now row shows none', async () => {
    stubCardFetch([
      cardBooking({ id: 'b-failed', booking_reference: 'PRE-FAILED', payment_state: 'failed' }),
      makeBooking({ id: 'b-paynow', booking_reference: 'PRE-PAYNOW', payment_mode: 'pay_now', payment_state: 'none' }),
    ])
    await renderTable()
    const table = within(screen.getByTestId('desktop-table'))
    const failedRow = (await table.findByText('PRE-FAILED')).closest('tr') as HTMLElement
    const payNowRow = (await table.findByText('PRE-PAYNOW')).closest('tr') as HTMLElement
    expect(within(failedRow).getByText('Payment failed')).toBeDefined()
    expect(within(payNowRow).queryByText('No payment')).toBeNull()
    expect(within(payNowRow).queryByText('Payment failed')).toBeNull()
  })

  it('mobile: a card_hold card shows its payment badge', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    stubCardFetch([cardBooking({ id: 'b-m', booking_reference: 'PRE-CARD-M', payment_state: 'authorized' })])
    await renderTable()
    const cards = within(screen.getByTestId('mobile-cards'))
    await cards.findByText('PRE-CARD-M')
    expect(cards.getByText('Hold active')).toBeDefined()
  })

  // ── expanded detail mounts the panel ────────────────────────────────────

  it('desktop: expanding a card_hold row mounts the PaymentPanel', async () => {
    const fetchMock = stubCardFetch([cardBooking()])
    await renderTable()
    await expandDesktop('PRE-CARD')
    expect(await screen.findByTestId('payment-panel')).toBeDefined()
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/admin/bookings/b-card/payment')).toBe(true)
  })

  it('desktop: expanding a pay_now row renders no panel', async () => {
    stubCardFetch([makeBooking({ id: 'b-pn', booking_reference: 'PRE-PN', payment_mode: 'pay_now' })], {
      payment: PAYMENT_BODY({ mode: 'pay_now', state: 'none' }),
    })
    await renderTable()
    await expandDesktop('PRE-PN')
    await screen.findByText('Edit Trip Details')
    expect(screen.queryByTestId('payment-panel')).toBeNull()
  })

  it('desktop: a pay_now booking whose payment GET reports refund_failed shows only the Refund failed banner with reference and amount', async () => {
    stubCardFetch([makeBooking({ id: 'b-rf', booking_reference: 'PRE-RF', payment_mode: 'pay_now', status: 'cancelled' })], {
      payment: PAYMENT_BODY(
        { mode: 'pay_now', state: 'none', booking_reference: 'PRE-RF', amount_minor: 4500, currency: 'eur', card_saved: false },
        { refund_failed: true, allowed_actions: ['capture'] },
      ),
    })
    await renderTable()
    await expandDesktop('PRE-RF')
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('Refund failed')
    expect(banner.textContent).toContain('Booking PRE-RF was cancelled, but the refund of')
    expect(banner.textContent).toContain(formatMinor(4500, 'eur'))
    // the Refund failed badge shows for any payment mode (badge + banner title)
    expect(screen.getAllByText('Refund failed').length).toBe(2)
    // nothing else of the panel: no facts, no history, no actions
    expect(screen.queryByTestId('payment-panel')).toBeNull()
    expect(screen.queryByText('Payment history')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Capture' })).toBeNull()
  })

  // ── cancel dialog ───────────────────────────────────────────────────────

  it('cancel dialog for a card_hold booking releases the hold and charges nothing (variant D)', async () => {
    stubCardFetch([cardBooking()])
    await renderTable()
    await expandDesktop('PRE-CARD')
    await openCancelDialog()
    chooseWho('Prestigo')
    expect(screen.getByRole('status').textContent).toContain('Free. The hold is released and nothing is charged.')
    expect(screen.getByRole('button', { name: 'Cancel and release hold' })).toBeDefined()
    expect(screen.queryByText(/full refund/i)).toBeNull()
  })

  it('cancel dialog for a card booking already paid by card (captured) announces a full refund (88-REVIEW T4)', async () => {
    stubCardFetch([cardBooking({ payment_state: 'captured', payment_amount_minor: 12000, payment_currency: 'eur' })])
    await renderTable()
    await expandDesktop('PRE-CARD')
    await openCancelDialog()
    chooseWho('Prestigo')
    expect(screen.getByRole('status').textContent).toContain(`Free. ${formatMinor(12000, 'eur')} is refunded.`)
    expect(screen.getByRole('button', { name: `Cancel and refund ${formatMinor(12000, 'eur')}` })).toBeDefined()
    expect(screen.queryByText(/hold is released/i)).toBeNull()
  })

  it('choosing Cancelled in the status select of a card booking opens the payment-aware cancel dialog, no PATCH (88-REVIEW T5)', async () => {
    const fetchMock = stubCardFetch([cardBooking({ status: 'confirmed' })])
    await renderTable()
    await expandDesktop('PRE-CARD')
    const select = Array.from(document.querySelectorAll('select')).find((el) =>
      Array.from(el.options).some((o) => o.value === 'cancelled'),
    ) as HTMLSelectElement
    expect(select).toBeDefined()
    fireEvent.change(select, { target: { value: 'cancelled' } })
    expect(await screen.findByRole('radiogroup')).toBeDefined()
    // D-20: nothing is preselected and the primary waits for a choice
    for (const r of screen.getAllByRole('radio')) expect(r.getAttribute('aria-checked')).toBe('false')
    expect((screen.getByRole('button', { name: 'Cancel booking' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false)
  })

  it('cancel dialog for a paid pay_now booking keeps the refund variant', async () => {
    stubCardFetch([makeBooking({ id: 'b-pn2', booking_reference: 'PRE-PN2', payment_mode: 'pay_now' })])
    await renderTable()
    await expandDesktop('PRE-PN2')
    await openCancelDialog()
    chooseWho('Prestigo')
    expect(screen.getByRole('button', { name: /^Cancel and refund/ })).toBeDefined()
    expect(screen.queryByText(/hold is released/i)).toBeNull()
  })

  it('cancel answered 502 refund_failed with cancelled:true closes the dialog and turns the row cancelled', async () => {
    stubCardFetch([makeBooking({ id: 'b-502', booking_reference: 'PRE-502', payment_mode: 'pay_now' })], {
      cancel: { ok: false, status: 502, body: { error: 'refund_failed', cancelled: true, amount_minor: 12000, currency: 'eur' } },
    })
    await renderTable()
    await expandDesktop('PRE-502')
    await openCancelDialog()
    chooseWho('Prestigo')
    fireEvent.click(screen.getByRole('button', { name: /^Cancel and refund/ }))

    // the Refund failed banner comes from the panel (refetched), not from the dialog
    await waitFor(() => expect(screen.queryByRole('button', { name: /keep booking/i })).toBeNull())
    const row = screen.getByTestId('desktop-table').querySelector('tbody tr') as HTMLElement
    expect(within(row).getAllByText('Cancelled').length).toBeGreaterThan(0)
  })

  it('88-REVIEW C-WR-04: a cancel that released the hold updates the row badge and makes the open panel refetch', async () => {
    const fetchMock = stubCardFetch([cardBooking({ id: 'b-rel', booking_reference: 'PRE-REL' })], {
      cancel: { ok: true, status: 200, body: { ok: true, released: true } },
    })
    await renderTable()
    await expandDesktop('PRE-REL')
    const panelGets = () => fetchMock.mock.calls.filter(([u, init]) => String(u).endsWith('/payment') && (init as RequestInit | undefined)?.method !== 'POST').length
    await waitFor(() => expect(panelGets()).toBeGreaterThan(0))
    const before = panelGets()
    await openCancelDialog()
    chooseWho('Prestigo')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and release hold' }))
    await waitFor(() => expect(panelGets()).toBeGreaterThan(before))
    const row = screen.getByTestId('desktop-table').querySelector('tbody tr') as HTMLElement
    await waitFor(() => expect(within(row).getAllByText('Released').length).toBeGreaterThan(0))
  })

  it('cancel 502 refund_failed without an amount also closes the dialog and the row reads cancelled', async () => {
    stubCardFetch([cardBooking({ id: 'b-502b', booking_reference: 'PRE-502B' })], {
      cancel: { ok: false, status: 502, body: { error: 'refund_failed', cancelled: true } },
    })
    await renderTable()
    await expandDesktop('PRE-502B')
    await openCancelDialog()
    chooseWho('Prestigo')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and release hold' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /keep booking/i })).toBeNull())
    const row = screen.getByTestId('desktop-table').querySelector('tbody tr') as HTMLElement
    expect(within(row).getAllByText('Cancelled').length).toBeGreaterThan(0)
  })

  it('cancel 502 without cancelled:true is not treated as a cancelled booking: generic line, dialog stays open', async () => {
    stubCardFetch([cardBooking({ id: 'b-502c', booking_reference: 'PRE-502C' })], {
      cancel: { ok: false, status: 502, body: { error: 'cancel_failed' } },
    })
    await renderTable()
    await expandDesktop('PRE-502C')
    await openCancelDialog()
    chooseWho('Prestigo')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and release hold' }))
    expect(await screen.findByText('Could not cancel the booking. Nothing was changed. Try again.')).toBeDefined()
    expect(screen.queryByText('cancel_failed')).toBeNull()
    const row = screen.getByTestId('desktop-table').querySelector('tbody tr') as HTMLElement
    expect(within(row).queryByText('Cancelled')).toBeNull()
  })

  // ── trip edit payment feedback ──────────────────────────────────────────

  async function saveDateTime() {
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Trip Details' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save Date & Time' }))
  }

  it('trip edit amount_raised shows the captured-plus-extra message', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { booking: {}, payment_effect: { kind: 'amount_raised', currency: 'eur', held_minor: 12000, diff_minor: 3000 } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(
      await screen.findByText(`Price updated. The held ${formatMinor(12000, 'eur')} is captured after the trip and the extra ${formatMinor(3000, 'eur')} is charged to the saved card.`),
    ).toBeDefined()
  })

  it('trip edit amount_lowered shows the lower-capture message', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { booking: {}, payment_effect: { kind: 'amount_lowered', currency: 'czk', amount_minor: 800000 } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(
      // formatCZK uses a no-break space; Testing Library collapses whitespace in the DOM text
      await screen.findByText(`Price updated. Only ${formatMinor(800000, 'czk')} will be captured after the trip. The rest of the hold is released.`.replace(/\s+/g, ' ')),
    ).toBeDefined()
  })

  it('trip edit hold_released shows the moved-pickup message with the new hold instant in Prague time', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { booking: {}, payment_effect: { kind: 'hold_released', currency: 'eur', hold_date_iso: '2099-11-12', hold_at_iso: '2099-11-12T13:05:00Z' } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(
      await screen.findByText(`Pickup moved. The current hold was released. A new hold is placed on ${formatPragueFull('2099-11-12T13:05:00Z')}.`),
    ).toBeDefined()
  })

  it('88-REVIEW C-WR-06: a date-only hold_date_iso is shown without a made-up time', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { booking: {}, payment_effect: { kind: 'hold_released', currency: 'eur', hold_date_iso: '2026-11-12' } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(await screen.findByText('Pickup moved. The current hold was released. A new hold is placed on Thu 12 Nov.')).toBeDefined()
  })

  it('88-REVIEW C-WR-06: a hold whose time has passed is placed on the next run', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { booking: {}, payment_effect: { kind: 'hold_released', currency: 'eur', hold_date_iso: '2020-01-01', hold_at_iso: '2020-01-01T10:00:00Z' } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(await screen.findByText('Pickup moved. The current hold was released. A new hold is placed on the next scheduled run (within 15 minutes).')).toBeDefined()
  })

  it('88-REVIEW A-WR-11: trip edit amount_kept tells the operator the agreed card price stays', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: true, status: 200, body: { ok: true, payment_effect: { kind: 'amount_kept', currency: 'eur', amount_minor: 12000, standard_czk: 3600 } } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(
      await screen.findByText(
        `Card booking: the client's agreed price of ${formatMinor(12000, 'eur')} stays (promo included). The standard rate would be 3600 CZK. To charge a different price, enter it as the amount in the price review.`,
      ),
    ).toBeDefined()
  })

  it('trip edit without payment_effect shows no payment message', async () => {
    stubCardFetch([cardBooking()])
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    await screen.findByText('Saved')
    expect(screen.queryByText(/^Price updated\./)).toBeNull()
    expect(screen.queryByText(/^Pickup moved\./)).toBeNull()
  })

  it('trip edit 409 payment_in_progress shows the friendly copy, not the raw code', async () => {
    stubCardFetch([cardBooking()], {
      patch: { ok: false, status: 409, body: { error: 'payment_in_progress' } },
    })
    await renderTable()
    await expandDesktop('PRE-CARD')
    await saveDateTime()
    expect(
      await screen.findByText('Payment is being processed for this booking. Wait a moment and try again.'),
    ).toBeDefined()
    expect(screen.queryByText('payment_in_progress')).toBeNull()
  })

  it('a trip edit refetches the open payment panel', async () => {
    const fetchMock = stubCardFetch([cardBooking()])
    await renderTable()
    await expandDesktop('PRE-CARD')
    await screen.findByTestId('payment-panel')
    const before = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/payment')).length
    await saveDateTime()
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/payment')).length).toBeGreaterThan(before)
    })
  })
})

describe('BookingsTable Phase 89 plan 16: Fee decision badge, Cash chip, cancel dialog wiring', () => {
  type Reply = { ok: boolean; status: number; body: unknown }

  function stubFetch(bookings: PartialBooking[], opts: { cancel?: Reply } = {}) {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/payment') && init?.method !== 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ payment: null, allowed_actions: [], refund_failed: false, events: [], events_total: 0 }) })
      }
      if (u.includes('/api/admin/bookings/cancel') && init?.method === 'POST') {
        const r = opts.cancel ?? { ok: true, status: 200, body: { ok: true } }
        return Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) })
      }
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ booking: {} }) })
      }
      if (u.includes('/api/admin/bookings')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ bookings, total: bookings.length, page: 0, limit: 20 }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const patches = (m: ReturnType<typeof vi.fn>) => m.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function renderTable() {
    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    return renderWithPanel(<BookingsTable />)
  }

  const cardRow = (over: Partial<PartialBooking> = {}) =>
    makeBooking({ id: 'b-fee', booking_reference: 'PRE-FEE', payment_intent_id: null, payment_mode: 'card_hold', payment_state: 'authorized', status: 'cancelled', ...over })

  it('desktop: a pending case shows Fee decision under the status badge; charged, waived and null show nothing', async () => {
    stubFetch([
      cardRow({ id: 'b1', booking_reference: 'PRE-P', fee_case_status: 'pending' }),
      cardRow({ id: 'b2', booking_reference: 'PRE-C', fee_case_status: 'charged' }),
      cardRow({ id: 'b3', booking_reference: 'PRE-W', fee_case_status: 'waived' }),
      cardRow({ id: 'b4', booking_reference: 'PRE-N', fee_case_status: null }),
    ])
    await renderTable()
    const table = within(screen.getByTestId('desktop-table'))
    const rowOf = async (ref: string) => (await table.findByText(ref)).closest('tr') as HTMLElement
    expect(within(await rowOf('PRE-P')).getByText('Fee decision')).toBeDefined()
    for (const ref of ['PRE-C', 'PRE-W', 'PRE-N']) {
      expect(within(await rowOf(ref)).queryByText('Fee decision')).toBeNull()
    }
  })

  it('the badge sits between the status badge and the payment badge', async () => {
    stubFetch([cardRow({ fee_case_status: 'pending' })])
    await renderTable()
    const row = (await within(screen.getByTestId('desktop-table')).findByText('PRE-FEE')).closest('tr') as HTMLElement
    const fee = within(row).getByText('Fee decision')
    const status = within(row).getByText('Cancelled')
    const payment = within(row).getByText('Hold active')
    expect(status.compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fee.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mobile: the card shows the badge for a pending case only', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))
    stubFetch([cardRow({ fee_case_status: 'pending' }), cardRow({ id: 'b-ok', booking_reference: 'PRE-OK', fee_case_status: 'charged' })])
    await renderTable()
    const cards = within(screen.getByTestId('mobile-cards'))
    await cards.findByText('PRE-FEE')
    expect(cards.getAllByText('Fee decision')).toHaveLength(1)
  })

  it('a partner booking never shows the badge', async () => {
    stubFetch([cardRow({ booking_source: 'gnet', fee_case_status: 'pending' })])
    await renderTable()
    await within(screen.getByTestId('desktop-table')).findByText('PRE-FEE')
    expect(screen.queryByText('Fee decision')).toBeNull()
  })

  it('a cash row shows the Cash chip and its payment badge; a card row has no chip', async () => {
    stubFetch([
      makeBooking({ id: 'b-cash', booking_reference: 'PRE-CASH', payment_intent_id: null, payment_mode: 'cash_guarantee', payment_state: 'card_saved' }),
      makeBooking({ id: 'b-card', booking_reference: 'PRE-CRD', payment_intent_id: null, payment_mode: 'card_hold', payment_state: 'authorized' }),
    ])
    await renderTable()
    const table = within(screen.getByTestId('desktop-table'))
    const cash = (await table.findByText('PRE-CASH')).closest('tr') as HTMLElement
    const card = (await table.findByText('PRE-CRD')).closest('tr') as HTMLElement
    expect(within(cash).getByText('Cash')).toBeDefined()
    expect(within(cash).getByText('Card saved')).toBeDefined()
    expect(within(card).queryByText('Cash')).toBeNull()
    expect(within(card).getByText('Hold active')).toBeDefined()
  })

  const cancelledOption = () => Array.from(document.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === 'cancelled'),
  ) as HTMLSelectElement

  it('choosing Cancelled in the status select opens the dialog for a cash_guarantee booking, no PATCH', async () => {
    const fetchMock = stubFetch([makeBooking({ id: 'b-c', booking_reference: 'PRE-C1', payment_intent_id: null, payment_mode: 'cash_guarantee', payment_state: 'card_saved', status: 'confirmed' })])
    await renderTable()
    fireEvent.click((await within(screen.getByTestId('desktop-table')).findByText('PRE-C1')).closest('tr') as HTMLElement)
    fireEvent.change(cancelledOption(), { target: { value: 'cancelled' } })
    expect(await screen.findByRole('radiogroup')).toBeDefined()
    expect(patches(fetchMock)).toHaveLength(0)
  })

  it('choosing Cancelled in the status select opens the dialog for a pay-now paid booking, no PATCH', async () => {
    const fetchMock = stubFetch([makeBooking({ id: 'b-p', booking_reference: 'PRE-P1', payment_intent_id: 'pi_paid', status: 'confirmed' })])
    await renderTable()
    fireEvent.click((await within(screen.getByTestId('desktop-table')).findByText('PRE-P1')).closest('tr') as HTMLElement)
    fireEvent.change(cancelledOption(), { target: { value: 'cancelled' } })
    expect(await screen.findByRole('radiogroup')).toBeDefined()
    expect(patches(fetchMock)).toHaveLength(0)
  })

  it('a row with no money keeps the PATCH path from the status select', async () => {
    const fetchMock = stubFetch([makeBooking({ id: 'b-n', booking_reference: 'PRE-NM', payment_intent_id: null, booking_source: 'manual', status: 'confirmed' })])
    await renderTable()
    fireEvent.click((await within(screen.getByTestId('desktop-table')).findByText('PRE-NM')).closest('tr') as HTMLElement)
    fireEvent.change(cancelledOption(), { target: { value: 'cancelled' } })
    await waitFor(() => expect(patches(fetchMock)).toHaveLength(1))
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('a late cancel (answer late: true) leaves the row cancelled with the red badge at once', async () => {
    stubFetch([cardRow({ status: 'confirmed' })], {
      cancel: { ok: true, status: 200, body: { ok: true, late: true } },
    })
    await renderTable()
    fireEvent.click((await within(screen.getByTestId('desktop-table')).findByText('PRE-FEE')).closest('tr') as HTMLElement)
    fireEvent.click((await screen.findAllByRole('button', { name: /cancel booking/i })).find(b => !b.textContent?.includes('Keep')) as HTMLElement)
    fireEvent.click(await screen.findByRole('radio', { name: /The client/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and decide the fee' }))
    const row = screen.getByTestId('desktop-table').querySelector('tbody tr') as HTMLElement
    await waitFor(() => expect(within(row).getByText('Fee decision')).toBeDefined())
    expect(within(row).getAllByText('Cancelled').length).toBeGreaterThan(0)
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})
