import { describe, it, expect } from 'vitest'
import { createFakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'
import {
  RIDE_SELECT,
  loadDriverRides,
  upcomingGroups,
  pastRideRows,
  pastMonthView,
  monthFeeTotal,
  isValidMonth,
  monthLabel,
  type RideRowView,
} from '@/lib/driver-cabinet/rides'

// Phase 94 plan 94-06 (DCAB-05, DCAB-06; D-03, D-04, D-11): one driver's rides split into Upcoming and Past, grouped
// by Prague day, with the month fee total of completed rides.

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER = 'd0000000-0000-4000-8000-000000000002'
const TODAY = '2026-11-25'

const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, over: Record<string, unknown> = {}) {
  return {
    id: bid(n),
    status: 'assigned',
    pickup_date: '2026-11-27',
    pickup_time: '10:30',
    pickup_utc: null,
    origin_address: 'Václav Havel Airport Prague, Aviatická, Praha 6',
    destination_address: 'Hotel Alcron, Štěpánská 40',
    client_first_name: 'Jan',
    client_last_name: 'Novak',
    client_phone: '+420123456789',
    client_email: 'jan@example.com',
    amount_czk: 9999,
    payment_status: 'paid',
    vehicle_class: 'business_van',
    driver_price_czk: 2500,
    ...over,
  }
}

let seq = 0
function assignment(n: number, bookingN: number, over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: aid(n),
    booking_id: bid(bookingN),
    driver_id: DRIVER,
    status: 'accepted',
    created_at: new Date(Date.UTC(2026, 10, 1, 8, 0, seq)).toISOString(),
    ...over,
  }
}

function dbWith(bookings: unknown[], assignments: unknown[], drivers?: unknown[]) {
  return createFakeDriverCabinetDb({
    drivers: (drivers ?? [
      { id: DRIVER, name: 'Ana', vehicle_plate: ' 1ab 2345 ' },
      { id: OTHER, name: 'Boris', vehicle_plate: '9ZZ 9999' },
    ]) as never,
    bookings: bookings as never,
    driver_assignments: assignments as never,
  })
}

describe('loadDriverRides (D-04: one driver, no client money)', () => {
  it('filters by driver_id, reads only this driver plate and never selects client fare / payment / contact columns', async () => {
    const db = dbWith(
      [booking(1), booking(2, { origin_address: 'Other driver pickup' })],
      [assignment(1, 1), assignment(2, 2, { driver_id: OTHER })],
    )
    const source = await loadDriverRides(db.client as never, DRIVER)

    expect(source.rows).toHaveLength(1)
    expect(source.plate).toBe('1AB 2345')
    const selects = db.calls.filter((c) => c.op === 'select')
    for (const call of selects) expect(call.columns ?? '').not.toMatch(/amount_|payment_|client_last_name|client_phone|client_email|deposit/)
    expect(RIDE_SELECT).not.toMatch(/amount_|payment_|client_last_name|client_phone|client_email|deposit/)
    const assignmentQuery = selects.find((c) => c.table === 'driver_assignments' && c.columns === RIDE_SELECT)
    expect(assignmentQuery?.filters).toContain('eq driver_id')
    const driverQuery = selects.find((c) => c.table === 'drivers')
    expect(driverQuery?.filters).toEqual(['eq id'])
    // The fake DB returns whole embedded rows; the column gate above is what keeps them out of a real select.
    expect(JSON.stringify(upcomingGroups(source, TODAY))).not.toMatch(/Other driver pickup|Novak|jan@example|9999/)
  })

  it('a failing query yields empty rides and no plate', async () => {
    const source = await loadDriverRides(
      {
        from: () => ({
          select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: 'X' } }) }) }) }) }),
        }),
      } as never,
      DRIVER,
    )
    expect(source.rows).toEqual([])
    expect(source.plate).toBeNull()
  })
})

describe('upcomingGroups (DCAB-06)', () => {
  it('keeps accepted rides of live bookings and pending rides already started; drops offers, declined, superseded and terminal', async () => {
    const db = dbWith(
      [
        booking(1, { pickup_date: '2026-11-25', pickup_time: '14:00', status: 'assigned' }),
        booking(2, { pickup_date: '2026-11-25', pickup_time: '09:30', status: 'confirmed' }),
        booking(3, { pickup_date: '2026-11-26', pickup_time: '08:00', status: 'en_route' }),
        booking(4, { pickup_date: '2026-11-27', pickup_time: '12:00', status: 'on_board' }),
        booking(5, { pickup_date: '2026-11-27', status: 'assigned' }), // pending, not started -> an offer
        booking(6, { pickup_date: '2026-11-27', status: 'assigned' }), // declined
        booking(7, { pickup_date: '2026-11-27', status: 'assigned' }), // superseded by another driver
        booking(8, { pickup_date: '2026-11-25', status: 'completed' }),
        booking(9, { pickup_date: '2026-11-25', status: 'cancelled' }),
        booking(10, { pickup_date: '2026-11-25', pickup_time: '18:00', status: 'on_location' }),
      ],
      [
        assignment(1, 1),
        assignment(2, 2),
        assignment(3, 3),
        assignment(4, 4, { status: 'pending' }),
        assignment(5, 5, { status: 'pending' }),
        assignment(6, 6, { status: 'declined' }),
        assignment(7, 7),
        assignment(70, 7, { driver_id: OTHER }), // newer, other driver
        assignment(8, 8),
        assignment(9, 9),
        assignment(10, 10),
      ],
    )
    const source = await loadDriverRides(db.client as never, DRIVER)
    const groups = upcomingGroups(source, TODAY)

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Tomorrow', 'Fri 27 Nov'])
    expect(groups.map((g) => g.dateIso)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27'])
    // Same day, time order
    expect(groups[0].rows.map((r) => r.time)).toEqual(['09:30', '14:00', '18:00'])
    expect(groups[0].rows.map((r) => r.badge)).toEqual([null, null, 'on_location'])
    expect(groups[1].rows.map((r) => r.badge)).toEqual(['en_route'])
    expect(groups[2].rows).toHaveLength(1)
    expect(groups[2].rows[0].badge).toBe('on_board')
    expect(groups[2].rows[0].assignmentId).toBe(aid(4))
  })

  it('builds the row: first name only, plate, drop-off fallback, class label, accessible name', async () => {
    const db = dbWith(
      [
        booking(1, { pickup_date: '2026-11-25', pickup_time: '14:00:00', destination_address: '  ' }),
        booking(2, { pickup_date: '2026-11-25', pickup_time: '15:00', client_first_name: 'Eva' }),
      ],
      [assignment(1, 1), assignment(2, 2)],
      [{ id: DRIVER, name: 'Ana', vehicle_plate: null }],
    )
    const source = await loadDriverRides(db.client as never, DRIVER)
    const [first, second] = upcomingGroups(source, TODAY)[0].rows

    expect(first.time).toBe('14:00')
    expect(first.pickup).toBe('Václav Havel Airport Prague, Aviatická, Praha 6')
    expect(first.dropoff).toBe('As directed')
    expect(first.firstName).toBe('Jan')
    expect(first.plate).toBeNull()
    expect(first.vehicleLabel).toBe('Business Van')
    expect(first.accessibleName).toBe(
      '14:00, Václav Havel Airport Prague, Aviatická, Praha 6 to As directed, passenger Jan, plate pending, Business Van',
    )
    expect(second.firstName).toBe('Eva')
    expect(first.feeCzk).toBe(2500)
    expect(JSON.stringify(upcomingGroups(source, TODAY))).not.toMatch(/Novak|jan@example|\+420|9999/)
  })

  it('shows the plate in the accessible name when the driver has one', async () => {
    const db = dbWith([booking(1, { pickup_date: '2026-11-25' })], [assignment(1, 1)])
    const source = await loadDriverRides(db.client as never, DRIVER)
    const row = upcomingGroups(source, TODAY)[0].rows[0]
    expect(row.plate).toBe('1AB 2345')
    expect(row.accessibleName).toContain('plate 1AB 2345')
  })

  it('labels dates by Prague calendar day across both DST changes, year only when it differs', async () => {
    const db = dbWith(
      [
        booking(1, { pickup_date: '2026-10-25', pickup_time: '02:30' }),
        booking(2, { pickup_date: '2027-03-28', pickup_time: '02:30' }),
      ],
      [assignment(1, 1), assignment(2, 2)],
    )
    const source = await loadDriverRides(db.client as never, DRIVER)
    const groups = upcomingGroups(source, '2026-10-20')
    expect(groups.map((g) => g.label)).toEqual(['Sun 25 Oct', 'Sun 28 Mar 2027'])
    expect(groups.map((g) => g.dateIso)).toEqual(['2026-10-25', '2027-03-28'])
  })

  it('an empty source gives no groups', async () => {
    const db = dbWith([], [])
    const source = await loadDriverRides(db.client as never, DRIVER)
    expect(upcomingGroups(source, TODAY)).toEqual([])
  })
})

describe('past rides and month view (DCAB-06, D-11)', () => {
  const nov = (n: number, over: Record<string, unknown>) => booking(n, { pickup_date: '2026-11-10', ...over })

  async function pastSource() {
    const db = dbWith(
      [
        nov(1, { status: 'completed', driver_price_czk: 2500, pickup_date: '2026-11-03' }),
        nov(2, { status: 'completed', driver_price_czk: 1800, pickup_date: '2026-11-10' }),
        nov(3, { status: 'cancelled', driver_price_czk: 900, pickup_date: '2026-11-11' }),
        nov(4, { status: 'no_show', driver_price_czk: 700, pickup_date: '2026-11-12' }),
        nov(5, { status: 'completed', driver_price_czk: null, pickup_date: '2026-11-13' }),
        booking(6, { status: 'completed', driver_price_czk: 1000, pickup_date: '2026-10-30' }), // Oct
        booking(7, { status: 'cancelled', driver_price_czk: 500, pickup_date: '2026-10-31' }), // Oct
        booking(8, { status: 'completed', driver_price_czk: 2000, pickup_date: '2026-12-01', pickup_time: '00:30' }),
        booking(9, { status: 'cancelled', pickup_date: '2026-11-14' }), // pending offer cancelled: not past
        booking(10, { status: 'completed', pickup_date: '2026-11-15', driver_price_czk: null }), // pending on completed: past
        booking(11, { status: 'assigned', pickup_date: '2026-11-28' }), // live: not past
      ],
      [
        assignment(1, 1),
        assignment(2, 2),
        assignment(3, 3),
        assignment(4, 4),
        assignment(5, 5),
        assignment(6, 6),
        assignment(7, 7),
        assignment(8, 8),
        assignment(9, 9, { status: 'pending' }),
        assignment(10, 10, { status: 'pending' }),
        assignment(11, 11),
      ],
    )
    return loadDriverRides(db.client as never, DRIVER)
  }

  it('pastRideRows lists accepted terminal rides and pending rides of completed / no_show, newest first', async () => {
    const source = await pastSource()
    const rows = pastRideRows(source)
    expect(rows.map((r) => r.assignmentId)).toEqual([
      aid(8), // 2026-12-01
      aid(10), // 11-15
      aid(5), // 11-13
      aid(4), // 11-12
      aid(3), // 11-11
      aid(2), // 11-10
      aid(1), // 11-03
      aid(7), // 10-31
      aid(6), // 10-30
    ])
    expect(rows.find((r) => r.assignmentId === aid(3))?.badge).toBe('cancelled')
    expect(rows.find((r) => r.assignmentId === aid(4))?.badge).toBe('no_show')
    expect(rows.find((r) => r.assignmentId === aid(1))?.badge).toBe('completed')
  })

  it('November: groups newest first, total of completed rides only (2500 + 1800), earlier and no later month', async () => {
    const source = await pastSource()
    const view = pastMonthView(source, '2026-11', '2026-11-25')
    expect(view.month).toBe('2026-11')
    expect(view.monthLabel).toBe('November 2026')
    expect(view.groups.map((g) => g.dateIso)).toEqual([
      '2026-11-15',
      '2026-11-13',
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
      '2026-11-03',
    ])
    expect(view.feeTotal).toBe(4300)
    expect(view.hasEarlier).toBe(true)
    expect(view.hasLater).toBe(false)
  })

  it('a ride at 00:30 on the 1st belongs to the new month; later month exists from October', async () => {
    const source = await pastSource()
    const dec = pastMonthView(source, '2026-12', '2026-12-05')
    expect(dec.groups).toHaveLength(1)
    expect(dec.groups[0].rows[0].assignmentId).toBe(aid(8))
    expect(dec.feeTotal).toBe(2000)
    expect(dec.hasLater).toBe(false)

    const oct = pastMonthView(source, '2026-10', '2026-11-25')
    expect(oct.feeTotal).toBe(1000)
    expect(oct.hasEarlier).toBe(false)
    expect(oct.hasLater).toBe(true)
  })

  it('an empty month has no groups and a null total', async () => {
    const source = await pastSource()
    const view = pastMonthView(source, '2026-09', '2026-11-25')
    expect(view.groups).toEqual([])
    expect(view.feeTotal).toBeNull()
    expect(view.hasEarlier).toBe(false)
    expect(view.hasLater).toBe(true)
  })

  it('a month with only cancelled rides gives a null total', async () => {
    const db = dbWith(
      [booking(1, { status: 'cancelled', pickup_date: '2026-10-05', driver_price_czk: 900 })],
      [assignment(1, 1)],
    )
    const source = await loadDriverRides(db.client as never, DRIVER)
    expect(pastMonthView(source, '2026-10', TODAY).feeTotal).toBeNull()
  })
})

describe('monthFeeTotal (D-11, Pitfall 11)', () => {
  const row = (badge: RideRowView['badge'], feeCzk: number | null): RideRowView => ({
    assignmentId: 'x',
    pickupDate: '2026-11-10',
    time: '10:00',
    pickup: 'A',
    dropoff: 'B',
    firstName: 'Jan',
    plate: null,
    vehicleLabel: 'Business',
    badge,
    accessibleName: '',
    bookingStatus: badge ?? 'assigned',
    feeCzk,
  })

  it('sums completed rides only: 2500 + 1800 + cancelled 900 + no_show 700 + completed null = 4300', () => {
    expect(
      monthFeeTotal([
        row('completed', 2500),
        row('completed', 1800),
        row('cancelled', 900),
        row('no_show', 700),
        row('completed', null),
      ]),
    ).toBe(4300)
  })

  it('is null (never 0) when no completed ride carries a fee', () => {
    expect(monthFeeTotal([])).toBeNull()
    expect(monthFeeTotal([row('completed', null), row('completed', null)])).toBeNull()
    expect(monthFeeTotal([row('cancelled', 900), row('no_show', 700)])).toBeNull()
  })
})

describe('month helpers', () => {
  it('isValidMonth', () => {
    expect(isValidMonth('2026-11')).toBe(true)
    expect(isValidMonth('2026-01')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-00')).toBe(false)
    expect(isValidMonth('26-11')).toBe(false)
    expect(isValidMonth('2026-1')).toBe(false)
    expect(isValidMonth('2026-11-01')).toBe(false)
    expect(isValidMonth(undefined)).toBe(false)
    expect(isValidMonth(202611)).toBe(false)
  })

  it('monthLabel', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(monthLabel('2027-01')).toBe('January 2027')
  })
})
