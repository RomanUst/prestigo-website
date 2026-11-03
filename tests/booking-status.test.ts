// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  BOOKING_STATUSES,
  isBookingStatus,
  TERMINAL_BOOKING_STATUSES,
  REVENUE_STATUSES,
  CALENDAR_ACTIVE_STATUSES,
  BOOKING_STATUS_LABELS,
  DRIVER_STEPS,
  DRIVER_STEP_TARGET,
  DRIVER_STEP_LABEL,
  DRIVER_STEP_TRIP_PROGRESS,
  nextStepFor,
  isPartnerBooking,
  assertMoneyEligible,
  PartnerBookingMoneyError,
} from '@/lib/booking-status'
import { VALID_TRANSITIONS, UI_TRANSITIONS } from '@/lib/booking-transitions'
import { latestStatusCheckValues, latestFunctionBody } from './helpers/latest-migration'

describe('booking status vocabulary (D-02)', () => {
  it('lists the ten statuses in the order of the latest bookings_status_check', () => {
    expect([...BOOKING_STATUSES]).toEqual([
      'unpaid',
      'pending',
      'confirmed',
      'completed',
      'cancelled',
      'assigned',
      'en_route',
      'on_location',
      'on_board',
      'no_show',
    ])
    expect([...BOOKING_STATUSES]).toEqual(latestStatusCheckValues())
  })

  it('isBookingStatus accepts only known values', () => {
    expect(isBookingStatus('on_board')).toBe(true)
    expect(isBookingStatus('no_show')).toBe(true)
    expect(isBookingStatus('arrived')).toBe(false)
    expect(isBookingStatus(null)).toBe(false)
    expect(isBookingStatus(7)).toBe(false)
  })

  it('has a label for every status', () => {
    for (const s of BOOKING_STATUSES) expect(BOOKING_STATUS_LABELS[s]).toBeTruthy()
    expect(BOOKING_STATUS_LABELS.on_board).toBe('On Board')
    expect(BOOKING_STATUS_LABELS.no_show).toBe('No-Show')
  })

  it('terminal set is completed, cancelled, no_show', () => {
    expect([...TERMINAL_BOOKING_STATUSES].sort()).toEqual(['cancelled', 'completed', 'no_show'])
  })

  it('revenue set includes on_board and excludes no_show (D-11)', () => {
    expect(REVENUE_STATUSES.has('on_board')).toBe(true)
    expect(REVENUE_STATUSES.has('no_show')).toBe(false)
    expect(REVENUE_STATUSES.has('completed')).toBe(true)
    expect(REVENUE_STATUSES.has('cancelled')).toBe(false)
  })

  it('calendar-active set keeps on_board and no_show', () => {
    expect(CALENDAR_ACTIVE_STATUSES.has('on_board')).toBe(true)
    expect(CALENDAR_ACTIVE_STATUSES.has('no_show')).toBe(true)
    expect(CALENDAR_ACTIVE_STATUSES.has('cancelled')).toBe(false)
    expect(CALENDAR_ACTIVE_STATUSES.has('unpaid')).toBe(false)
  })
})

describe('driver step map (D-08, D-12)', () => {
  it('on_site maps to the existing on_location status; there is no arrived status', () => {
    expect(DRIVER_STEP_TARGET.on_site).toBe('on_location')
    expect((BOOKING_STATUSES as readonly string[]).includes('arrived')).toBe(false)
  })

  it('every step has a target, a label and a trip_progress mirror', () => {
    for (const step of DRIVER_STEPS) {
      expect(isBookingStatus(DRIVER_STEP_TARGET[step])).toBe(true)
      expect(DRIVER_STEP_LABEL[step]).toBeTruthy()
      expect(DRIVER_STEP_TRIP_PROGRESS[step]).toBeTruthy()
    }
    expect(DRIVER_STEP_TRIP_PROGRESS.on_site).toBe('arrived')
    expect(DRIVER_STEP_LABEL.completed).toBe('Complete trip')
  })

  it.each([
    ['assigned', 'en_route'],
    ['en_route', 'on_site'],
    ['on_location', 'on_board'],
    ['on_board', 'completed'],
  ])('nextStepFor(%s) is %s', (status, step) => {
    expect(nextStepFor(status)).toBe(step)
  })

  it.each(['confirmed', 'pending', 'unpaid', 'completed', 'cancelled', 'no_show', 'x'])(
    'nextStepFor(%s) is null',
    (status) => {
      expect(nextStepFor(status)).toBeNull()
    },
  )
})

describe('VALID_TRANSITIONS parity (D-09)', () => {
  it('keys equal BOOKING_STATUSES', () => {
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual([...BOOKING_STATUSES].sort())
    expect(Object.keys(UI_TRANSITIONS).sort()).toEqual([...BOOKING_STATUSES].sort())
  })

  it('terminal statuses are exactly the keys with an empty transition list', () => {
    const empty = Object.keys(VALID_TRANSITIONS)
      .filter((k) => VALID_TRANSITIONS[k].length === 0)
      .sort()
    expect(empty).toEqual([...TERMINAL_BOOKING_STATUSES].sort())
    expect(VALID_TRANSITIONS.no_show).toEqual([])
  })

  it('on_location and on_board allow the new steps and keep the admin shortcuts', () => {
    expect([...VALID_TRANSITIONS.on_location].sort()).toEqual(
      ['cancelled', 'completed', 'no_show', 'on_board'].sort(),
    )
    expect([...VALID_TRANSITIONS.on_board].sort()).toEqual(['cancelled', 'completed'])
  })

  it('every target of every transition is a known status', () => {
    for (const targets of Object.values(VALID_TRANSITIONS)) {
      for (const t of targets) expect(isBookingStatus(t)).toBe(true)
    }
  })
})

describe('partner bookings (D-05)', () => {
  it('only booking_source gnet is a partner booking', () => {
    expect(isPartnerBooking({ booking_source: 'gnet' })).toBe(true)
    expect(isPartnerBooking({ booking_source: 'online' })).toBe(false)
    expect(isPartnerBooking({ booking_source: 'manual' })).toBe(false)
    expect(isPartnerBooking({ booking_source: null })).toBe(false)
    expect(isPartnerBooking({})).toBe(false)
  })

  it('assertMoneyEligible throws PartnerBookingMoneyError only for gnet', () => {
    expect(() => assertMoneyEligible({ booking_source: 'gnet' })).toThrow(PartnerBookingMoneyError)
    expect(() => assertMoneyEligible({ booking_source: 'online' })).not.toThrow()
    expect(() => assertMoneyEligible({ booking_source: null })).not.toThrow()
  })
})

describe('latest-migration helper', () => {
  it('latestFunctionBody throws for an unknown function', () => {
    expect(() => latestFunctionBody('no_such_function_xyz')).toThrow()
  })

  it('latestFunctionBody returns a definition for booking_lead_status', () => {
    expect(latestFunctionBody('booking_lead_status')).toContain("'cancelled'")
  })
})
