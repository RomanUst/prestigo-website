import { describe, it, expect } from 'vitest'
import { TERMINAL_STATUSES, isTripLinkValid } from '@/lib/trip-token'

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
