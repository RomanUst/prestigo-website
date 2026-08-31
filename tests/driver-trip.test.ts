import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TERMINAL_STATUSES, isTripLinkValid } from '@/lib/trip-token'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted
// before imports) — mirrors tests/admin-assignment.test.ts conventions.
const { stubSupabaseFrom } = vi.hoisted(() => ({
  stubSupabaseFrom: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })),
}))

// RouteMap is a 'use client' Google-Maps component — stub it to a no-op for
// page render tests; the map itself is not what this test suite verifies.
vi.mock('@/components/booking/RouteMap', () => ({
  default: () => null,
}))

import TripSheetPage, { metadata } from '@/app/driver/trip/[token]/page'

const validToken = 'a0000004-0000-4000-8000-000000000004'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const otherDriverId = 'a0000009-0000-4000-8000-000000000009'

function makeAssignmentRow(overrides: {
  assignmentDriverId?: string
  bookingDriverId?: string | null
  bookingStatus?: string
} = {}) {
  return {
    id: 'assign-1',
    driver_id: overrides.assignmentDriverId ?? driverId,
    bookings: {
      id: 'booking-1',
      booking_reference: 'PRG-100',
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

  it('TERMINAL_STATUSES contains exactly completed and cancelled', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true)
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true)
    expect(TERMINAL_STATUSES.size).toBe(2)
  })
})

describe('TripSheetPage (app/driver/trip/[token]/page.tsx)', () => {
  it('metadata.robots has index and follow both false (D-08 noindex)', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
  })

  it('valid token renders booking reference, passenger, from/to, date/time', async () => {
    mockSupabaseSingle(makeAssignmentRow())

    const element = await TripSheetPage({ params: Promise.resolve({ token: validToken }) })
    render(element)

    expect(screen.getByText('PRG-100')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Prague Airport')).toBeInTheDocument()
    expect(screen.getByText('Wenceslas Square')).toBeInTheDocument()
    expect(screen.getByText('2026-09-01')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.queryByText('This trip link is no longer active.')).not.toBeInTheDocument()
  })

  it('unknown token renders the neutral placeholder with no passenger/reference data', async () => {
    mockSupabaseSingle(null, { message: 'Not found' })

    const element = await TripSheetPage({ params: Promise.resolve({ token: validToken }) })
    render(element)

    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(screen.queryByText('PRG-100')).not.toBeInTheDocument()
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument()
  })

  it('terminal booking status (completed) renders the same neutral placeholder, no data', async () => {
    mockSupabaseSingle(makeAssignmentRow({ bookingStatus: 'completed' }))

    const element = await TripSheetPage({ params: Promise.resolve({ token: validToken }) })
    render(element)

    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(screen.queryByText('PRG-100')).not.toBeInTheDocument()
  })

  it('reassigned booking (assignment.driver_id !== booking.driver_id) renders the same neutral placeholder, no data', async () => {
    mockSupabaseSingle(makeAssignmentRow({ assignmentDriverId: driverId, bookingDriverId: otherDriverId }))

    const element = await TripSheetPage({ params: Promise.resolve({ token: validToken }) })
    render(element)

    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(screen.queryByText('PRG-100')).not.toBeInTheDocument()
  })

  it('malformed (non-UUID) token renders the neutral placeholder without querying Supabase', async () => {
    stubSupabaseFrom.mockClear()

    const element = await TripSheetPage({ params: Promise.resolve({ token: 'not-a-uuid' }) })
    render(element)

    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(stubSupabaseFrom).not.toHaveBeenCalled()
  })

  it('orphaned assignment (joined booking missing) renders the same neutral placeholder, no data', async () => {
    const row = makeAssignmentRow()
    mockSupabaseSingle({ ...row, bookings: null })

    const element = await TripSheetPage({ params: Promise.resolve({ token: validToken }) })
    render(element)

    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
  })
})
