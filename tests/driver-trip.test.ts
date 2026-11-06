import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TERMINAL_STATUSES, isTripLinkValid, tripLinkViewState } from '@/lib/trip-token'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted
// before imports) — mirrors tests/admin-assignment.test.ts conventions.
const { stubSupabaseFrom, getStartGateMock, getNoShowViewMock } = vi.hoisted(() => ({
  stubSupabaseFrom: vi.fn(),
  getStartGateMock: vi.fn(),
  getNoShowViewMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })),
}))

// RouteMap is a 'use client' Google-Maps component — stub it to a no-op for
// page render tests; the map itself is not what this test suite verifies.
vi.mock('@/components/booking/RouteMap', () => ({
  default: () => null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}))

// buildTripView consults the Maps-backed start gate; the page test decides the answer.
vi.mock('@/lib/start-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/start-gate')>()),
  getStartGate: getStartGateMock,
}))

// The page asks lib/no-show for the unlock time; the page test decides the answer.
vi.mock('@/lib/no-show', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/no-show')>()),
  getNoShowView: getNoShowViewMock,
}))

import TripSheetPage, { metadata } from '@/app/(internal)/driver/trip/[token]/page'
import DriverTripLayout from '@/app/(internal)/driver/trip/layout'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'

function makeAssignmentRow(overrides: {
  assignmentDriverId?: string
  bookingDriverId?: string | null
  bookingStatus?: string
  assignmentStatus?: string | null
} = {}) {
  return {
    id: 'assign-1',
    driver_id: overrides.assignmentDriverId ?? driverId,
    status: overrides.assignmentStatus === undefined ? 'accepted' : overrides.assignmentStatus,
    trip_progress: null,
    trip_note: null,
    bookings: {
      id: 'booking-1',
      booking_reference: 'PRG-100',
      booking_source: null,
      pickup_utc: null,
      pickup_date: '2026-09-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport',
      destination_address: 'Wenceslas Square',
      origin_lat: 50.1,
      origin_lng: 14.26,
      destination_lat: 50.08,
      destination_lng: 14.42,
      client_first_name: 'Alice',
      client_last_name: 'Smith',
      client_phone: '+420123456789',
      flight_number: null,
      flight_iata: null,
      special_requests: null,
      vehicle_class: 'business',
      distance_km: 12.4,
      completed_at: null,
      no_show_requested_at: null,
      status: overrides.bookingStatus ?? 'assigned',
      driver_id: overrides.bookingDriverId === undefined ? driverId : overrides.bookingDriverId,
    },
    drivers: { name: 'John Driver', phone: '+420999888777', vehicle_info: 'Black Mercedes E-Class' },
  }
}

function mockSupabaseSingle(data: unknown, error: unknown = null) {
  const singleFn = vi.fn().mockResolvedValue({ data, error })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  stubSupabaseFrom.mockReturnValue({ select: selectFn })
  return { selectFn, eqFn, singleFn }
}

describe('isTripLinkValid', () => {
  it('returns true when driver matches and status is non-terminal', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-1',
        bookingStatus: 'assigned',
      })
    ).toBe(true)
  })

  it('returns false when bookingStatus is completed', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-1',
        bookingStatus: 'completed',
      })
    ).toBe(false)
  })

  it('returns false when bookingStatus is cancelled', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-1',
        bookingStatus: 'cancelled',
      })
    ).toBe(false)
  })

  it('returns false when assignmentDriverId !== bookingDriverId (reassignment)', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-2',
        bookingStatus: 'assigned',
      })
    ).toBe(false)
  })

  it('returns false when bookingDriverId is null (pending-booking edge)', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: null,
        bookingStatus: 'confirmed',
      })
    ).toBe(false)
  })

  it('returns false when bookingStatus is no_show (D-09)', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-1',
        bookingStatus: 'no_show',
      })
    ).toBe(false)
  })

  it('returns false when the assignment was declined (Pitfall 6)', () => {
    expect(
      isTripLinkValid({
        assignmentDriverId: 'driver-1',
        bookingDriverId: 'driver-1',
        bookingStatus: 'assigned',
        assignmentStatus: 'declined',
      })
    ).toBe(false)
  })

  it('stays valid for a pending or accepted assignment', () => {
    for (const assignmentStatus of ['pending', 'accepted', null, undefined]) {
      expect(
        isTripLinkValid({
          assignmentDriverId: 'driver-1',
          bookingDriverId: 'driver-1',
          bookingStatus: 'on_board',
          assignmentStatus,
        })
      ).toBe(true)
    }
  })

  it('TERMINAL_STATUSES contains exactly completed, cancelled and no_show', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true)
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true)
    expect(TERMINAL_STATUSES.has('no_show')).toBe(true)
    expect(TERMINAL_STATUSES.size).toBe(3)
  })
})

describe('tripLinkViewState (D-17)', () => {
  const base = { assignmentDriverId: 'driver-1', bookingDriverId: 'driver-1' as string | null }

  it('is completed for a matching assignment on a completed booking', () => {
    expect(tripLinkViewState({ ...base, bookingStatus: 'completed' })).toBe('completed')
    expect(tripLinkViewState({ ...base, bookingStatus: 'completed', assignmentStatus: 'accepted' })).toBe('completed')
  })

  it('is ended for cancelled and no_show', () => {
    expect(tripLinkViewState({ ...base, bookingStatus: 'cancelled' })).toBe('ended')
    expect(tripLinkViewState({ ...base, bookingStatus: 'no_show' })).toBe('ended')
  })

  it('is ended after reassignment, decline or when the booking has no driver', () => {
    expect(tripLinkViewState({ ...base, bookingDriverId: 'driver-2', bookingStatus: 'assigned' })).toBe('ended')
    expect(tripLinkViewState({ ...base, bookingDriverId: 'driver-2', bookingStatus: 'completed' })).toBe('ended')
    expect(tripLinkViewState({ ...base, bookingStatus: 'assigned', assignmentStatus: 'declined' })).toBe('ended')
    expect(tripLinkViewState({ ...base, bookingStatus: 'completed', assignmentStatus: 'declined' })).toBe('ended')
    expect(tripLinkViewState({ ...base, bookingDriverId: null, bookingStatus: 'confirmed' })).toBe('ended')
  })

  it('is active for a matching assignment on a live booking', () => {
    expect(tripLinkViewState({ ...base, bookingStatus: 'assigned' })).toBe('active')
    expect(tripLinkViewState({ ...base, bookingStatus: 'on_location' })).toBe('active')
    expect(tripLinkViewState({ ...base, bookingStatus: 'on_board' })).toBe('active')
  })
})

async function renderPage(token = validToken) {
  const element = await TripSheetPage({ params: Promise.resolve({ token }) })
  return render(createElement(DriverTripLayout, null, element))
}

describe('TripSheetPage (app/(internal)/driver/trip/[token]/page.tsx)', () => {
  beforeEach(() => {
    stubSupabaseFrom.mockReset()
    getStartGateMock.mockReset()
    getStartGateMock.mockResolvedValue({ unlocksAtMs: null, open: true })
    getNoShowViewMock.mockReset()
    getNoShowViewMock.mockResolvedValue({ noShowAvailableAt: null, noShowRequestedAt: null })
  })

  it('metadata.robots has index and follow both false (D-08 noindex, T-87-34)', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
  })

  it('active assigned booking renders exactly one control labelled "On my way" inside the light driver shell (D-12, D-19)', async () => {
    mockSupabaseSingle(makeAssignmentRow())
    const { container } = await renderPage()

    expect(container.querySelector('div.admin-shell.driver-shell[data-admin-theme="light"]')).not.toBeNull()
    expect(screen.getAllByText('On my way')).toHaveLength(1)
    for (const other of ['I have arrived', 'Passenger on board', 'Complete trip']) {
      expect(screen.queryByText(other)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('This trip link is no longer active.')).not.toBeInTheDocument()
  })

  it('before the unlock instant the control is locked with "Too early to start" and the unlock time (D-14)', async () => {
    mockSupabaseSingle(makeAssignmentRow())
    getStartGateMock.mockResolvedValue({ unlocksAtMs: Date.parse('2099-01-02T05:15:00Z'), open: false })
    await renderPage()

    expect(screen.getByText('Too early to start')).toBeInTheDocument()
    expect(screen.getByText(/^Unlocks on /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Too early to start/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('confirmed booking shows "Waiting for the office"', async () => {
    mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'confirmed' }))
    await renderPage()
    expect(screen.getByText('Waiting for the office')).toBeInTheDocument()
    expect(screen.queryByText('On my way')).not.toBeInTheDocument()
  })

  it('passes the no-show times from getNoShowView to the screen while on site (D-15)', async () => {
    mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'on_location' }))
    getNoShowViewMock.mockResolvedValue({
      noShowAvailableAt: '2099-01-02T13:35:00Z',
      noShowRequestedAt: null,
    })
    await renderPage()

    expect(getNoShowViewMock).toHaveBeenCalledTimes(1)
    expect(getNoShowViewMock.mock.calls[0][0]).toMatchObject({
      booking: { id: 'booking-1', status: 'on_location' },
    })
    expect(screen.getByText('You can request a no-show after 14:35.')).toBeInTheDocument()
    expect(screen.getByText('Passenger on board')).toBeInTheDocument()
  })

  it('shows the requested line when the booking already has an open request', async () => {
    mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'on_location' }))
    getNoShowViewMock.mockResolvedValue({
      noShowAvailableAt: '2026-01-02T13:35:00Z',
      noShowRequestedAt: '2026-01-02T13:41:00Z',
    })
    await renderPage()
    expect(screen.getByText('No-show requested at 14:41. The office is trying to reach the passenger.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request no-show' })).not.toBeInTheDocument()
  })

  it('renders no price, amount or currency text (D-06)', async () => {
    mockSupabaseSingle(makeAssignmentRow())
    const { container } = await renderPage()
    expect(container.textContent ?? '').not.toMatch(/€|EUR|CZK|\bprice\b|amount/i)
  })

  it('performs no write: the page only selects from driver_assignments', async () => {
    const { selectFn } = mockSupabaseSingle(makeAssignmentRow())
    await renderPage()
    expect(stubSupabaseFrom).toHaveBeenCalledTimes(1)
    expect(stubSupabaseFrom).toHaveBeenCalledWith('driver_assignments')
    expect(selectFn).toHaveBeenCalledTimes(1)
    // The mocked builder offers select() only: update/insert/rpc would have thrown. Source gate too.
    const src = fs.readFileSync(path.resolve(__dirname, '../app/(internal)/driver/trip/[token]/page.tsx'), 'utf8')
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
  })

  it('does not select the amount of the booking', async () => {
    const { selectFn } = mockSupabaseSingle(makeAssignmentRow())
    await renderPage()
    expect(String(selectFn.mock.calls[0][0])).not.toMatch(/amount|price/i)
  })

  it('completed booking renders the "Trip completed" re-opened view with no trip data (D-17)', async () => {
    mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'completed' }))
    const { container } = await renderPage()

    expect(screen.getByText('Trip completed')).toBeInTheDocument()
    expect(screen.getByText('Thank you. This trip is closed.')).toBeInTheDocument()
    const text = container.textContent ?? ''
    for (const secret of ['PRG-100', 'Alice', 'Smith', '+420123456789', 'Prague Airport', 'Wenceslas Square', '2026-09-01']) {
      expect(text).not.toContain(secret)
    }
    expect(screen.queryByText('This trip link is no longer active.')).not.toBeInTheDocument()
  })

  it('malformed (non-UUID) token renders the ended view without querying Supabase', async () => {
    await renderPage('not-a-uuid')
    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  it('cancelled, no_show, reassigned, declined, unknown and malformed tokens render byte-identical ended HTML (D-09, T-87-33)', async () => {
    const arrangements: Array<{ arrange: () => void; token: string }> = [
      { arrange: () => mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'cancelled' })), token: validToken },
      { arrange: () => mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'no_show' })), token: validToken },
      {
        arrange: () =>
          mockSupabaseSingle(makeAssignmentRow({ assignmentDriverId: driverId, bookingDriverId: otherDriverId })),
        token: validToken,
      },
      { arrange: () => mockSupabaseSingle(makeAssignmentRow({ assignmentStatus: 'declined' })), token: validToken },
      { arrange: () => mockSupabaseSingle(null, { message: 'Not found' }), token: validToken },
      { arrange: () => stubSupabaseFrom.mockReset(), token: 'not-a-uuid' },
    ]

    const htmls: string[] = []
    for (const { arrange, token } of arrangements) {
      arrange()
      const { container, unmount } = await renderPage(token)
      htmls.push(container.innerHTML)
      unmount()
    }

    expect(htmls).toHaveLength(6)
    expect(htmls[0]).toContain('This trip link is no longer active.')
    for (const html of htmls) {
      expect(html).toBe(htmls[0])
      expect(html).not.toContain('PRG-100')
      expect(html).not.toContain('Alice')
    }
  })

  it('orphaned assignment (joined booking missing) renders the same ended view', async () => {
    mockSupabaseSingle({ ...makeAssignmentRow(), bookings: null })
    await renderPage()
    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
  })
})
