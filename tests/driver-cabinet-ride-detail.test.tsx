import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-07 (DCAB-05, DCAB-09; D-01, D-11, D-12, D-15): one ride of the cabinet.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  getStartGate: vi.fn(),
  getNoShowView: vi.fn(),
  loadStopsSafe: vi.fn(),
  getNoShowThresholds: vi.fn(),
  requireDriver: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({ requireDriver: h.requireDriver }))
vi.mock('next/navigation', () => ({
  redirect: h.redirect,
  permanentRedirect: vi.fn(),
  usePathname: () => '/',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
// RouteMap loads Google Maps; the screen tests do not verify the map.
vi.mock('@/components/booking/RouteMap', () => ({ default: () => null }))
// The loader consults the start gate, the no-show view, the stops and the live no-show thresholds.
vi.mock('@/lib/start-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/start-gate')>()),
  getStartGate: h.getStartGate,
}))
vi.mock('@/lib/no-show', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/no-show')>()),
  getNoShowView: h.getNoShowView,
}))
vi.mock('@/lib/booking-stops', () => ({ loadStopsSafe: h.loadStopsSafe }))
vi.mock('@/lib/no-show-wait', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/no-show-wait')>()),
  getNoShowThresholds: h.getNoShowThresholds,
}))
// The loader is a marker so the props the cabinet page hands it can be read from the returned element.
vi.mock('@/app/(internal)/driver/trip/[token]/TripScreenForToken', () => ({
  default: function TripScreenForToken() {
    return null
  },
}))

import { resolveCabinetRide, RIDE_DETAIL_SELECT } from '@/lib/driver-cabinet/ride-detail'
import RideDetailPage from '@/app/(internal)/driver/(cabinet)/rides/[assignmentId]/page'
import TripScreenForToken from '@/app/(internal)/driver/trip/[token]/TripScreenForToken'
import ClosedRideView from '@/components/driver/ClosedRideView'
import InvalidTripLinkView from '@/app/(internal)/driver/trip/[token]/InvalidTripLinkView'
import { BUSINESS_TEL_URL } from '@/lib/contact-channels'
import TripScreen, { type TripScreenProps } from '@/app/(internal)/driver/trip/[token]/TripScreen'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const OTHER = 'd0000000-0000-4000-8000-000000000002'

const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tok = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, over: Record<string, unknown> = {}) {
  return {
    id: bid(n),
    booking_reference: `PRG-${n}`,
    status: 'assigned',
    pickup_date: '2026-11-27',
    pickup_time: '10:30:00',
    origin_address: 'Václav Havel Airport Prague',
    destination_address: 'Hotel Alcron, Štěpánská 40',
    client_first_name: 'Jan',
    client_last_name: 'Novak',
    client_phone: '+420123456789',
    flight_number: 'OK123',
    special_requests: 'Child seat',
    amount_czk: 9999,
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
    trip_token: tok(n),
    created_at: new Date(Date.UTC(2026, 10, 1, 8, 0, seq)).toISOString(),
    ...over,
  }
}

function dbWith(bookings: unknown[], assignments: unknown[]): FakeDriverCabinetDb {
  return createFakeDriverCabinetDb({
    bookings: bookings as Record<string, unknown>[],
    driver_assignments: assignments as Record<string, unknown>[],
  })
}

describe('resolveCabinetRide', () => {
  it('accepted on a waiting booking is the trip, with that assignment token', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1)])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'trip', tripToken: tok(1) })
  })

  it('queries by id and driver_id only and never writes', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1)])
    await resolveCabinetRide(db.client, DRIVER, aid(1))
    const detail = db.calls.find((c) => c.table === 'driver_assignments' && c.columns === RIDE_DETAIL_SELECT)
    expect(detail?.filters).toEqual(['eq id', 'eq driver_id'])
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('does not select a client name, phone, flight, notes, client fare or payment column', async () => {
    expect(RIDE_DETAIL_SELECT).not.toMatch(
      /client_|flight|special_requests|amount|payment|price_eur|passenger|email/i,
    )
    expect(RIDE_DETAIL_SELECT).toContain('driver_price_czk')
  })

  it('an unknown id, another driver id and a declined assignment are not available', async () => {
    const db = dbWith(
      [booking(1), booking(2)],
      [assignment(1, 1, { driver_id: OTHER }), assignment(2, 2, { status: 'declined' })],
    )
    expect(await resolveCabinetRide(db.client, DRIVER, aid(99))).toEqual({ kind: 'not_available' })
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
    expect(await resolveCabinetRide(db.client, DRIVER, aid(2))).toEqual({ kind: 'not_available' })
  })

  it('a superseded assignment (not the newest of its booking) is not available', async () => {
    const older = assignment(1, 1, { created_at: '2026-11-01T08:00:00.000Z' })
    const newer = assignment(2, 1, { driver_id: OTHER, created_at: '2026-11-02T08:00:00.000Z' })
    const db = dbWith([booking(1)], [older, newer])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('an accepted assignment without a trip token is not available', async () => {
    const db = dbWith([booking(1)], [assignment(1, 1, { trip_token: null })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('a failing read is not available', async () => {
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }),
      }),
    }
    expect(await resolveCabinetRide(failing, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it.each(['en_route', 'on_location', 'on_board'])('a pending assignment on a %s booking is the trip', async (status) => {
    const db = dbWith([booking(1, { status })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'trip', tripToken: tok(1) })
  })

  it.each(['assigned', 'confirmed'])('a pending assignment on a %s booking is an offer', async (status) => {
    const db = dbWith([booking(1, { status })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'offer' })
  })

  it('accepted + completed is closed with the driver fee label and a Back to the Past month', async () => {
    const db = dbWith([booking(1, { status: 'completed' })], [assignment(1, 1)])
    const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
    expect(r).toMatchObject({
      kind: 'closed',
      state: 'completed',
      backHref: '/driver/rides?view=past&month=2026-11',
    })
    if (r.kind !== 'closed') throw new Error('closed expected')
    expect(r.summary.feeLabel).toMatch(/2\s?500/)
    expect(r.summary).toMatchObject({
      bookingReference: 'PRG-1',
      pickupTime: '10:30',
      pickup: 'Václav Havel Airport Prague',
      dropoff: 'Hotel Alcron, Štěpánská 40',
    })
    expect(r.summary.dateLabel).toContain('27 Nov 2026')
    expect(r.summary.vehicleLabel).not.toBe('')
  })

  it('a completed ride without a positive integer fee has no fee label', async () => {
    for (const fee of [null, 0, -5, 12.5]) {
      const db = dbWith([booking(1, { status: 'completed', driver_price_czk: fee })], [assignment(1, 1)])
      const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
      if (r.kind !== 'closed') throw new Error('closed expected')
      expect(r.summary.feeLabel).toBeNull()
    }
  })

  it('accepted + cancelled and accepted + no_show are closed without a fee label', async () => {
    const db = dbWith(
      [booking(1, { status: 'cancelled' }), booking(2, { status: 'no_show' })],
      [assignment(1, 1), assignment(2, 2)],
    )
    const cancelled = await resolveCabinetRide(db.client, DRIVER, aid(1))
    const noShow = await resolveCabinetRide(db.client, DRIVER, aid(2))
    expect(cancelled).toMatchObject({ kind: 'closed', state: 'cancelled' })
    expect(noShow).toMatchObject({ kind: 'closed', state: 'no_show' })
    if (cancelled.kind !== 'closed' || noShow.kind !== 'closed') throw new Error('closed expected')
    expect(cancelled.summary.feeLabel).toBeNull()
    expect(noShow.summary.feeLabel).toBeNull()
  })

  it('pending + cancelled is not available', async () => {
    const db = dbWith([booking(1, { status: 'cancelled' })], [assignment(1, 1, { status: 'pending' })])
    expect(await resolveCabinetRide(db.client, DRIVER, aid(1))).toEqual({ kind: 'not_available' })
  })

  it('the summary never carries passenger, flight, notes, client fare or payment text', async () => {
    const db = dbWith([booking(1, { status: 'completed' })], [assignment(1, 1)])
    const r = await resolveCabinetRide(db.client, DRIVER, aid(1))
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/Jan|Novak|\+420123456789|OK123|Child seat|9999/)
  })

  it('source gate: the resolver has no write call', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/driver-cabinet/ride-detail.ts'), 'utf8')
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
  })
})

describe('/driver/rides/[assignmentId] page', () => {
  let db: FakeDriverCabinetDb

  beforeEach(() => {
    seq = 0
    h.requireDriver.mockReset()
    h.requireDriver.mockResolvedValue({ driverId: DRIVER, sessionId: 's1' })
    h.redirect.mockClear()
    db = dbWith(
      [booking(1), booking(2, { status: 'assigned' })],
      [assignment(1, 1), assignment(2, 2, { status: 'pending' })],
    )
    h.db = db
  })

  async function render(id: string) {
    return (await RideDetailPage({ params: Promise.resolve({ assignmentId: id }) })) as {
      type: unknown
      props: Record<string, unknown>
    }
  }

  it('gates itself with requireDriver before any query, with the ride path as next', async () => {
    await render(aid(1))
    expect(h.requireDriver).toHaveBeenCalledWith(`/driver/rides/${aid(1)}`)
  })

  it('a live ride renders the shared trip loader with that token and no token in the URL', async () => {
    const el = await render(aid(1))
    expect(el.type).toBe(TripScreenForToken)
    expect(el.props.token).toBe(tok(1))
    expect(`/driver/rides/${aid(1)}`).not.toContain(tok(1))
  })

  it('a pending offer that has not started redirects to the Offers tab', async () => {
    await expect(render(aid(2))).rejects.toThrow('REDIRECT:/driver/offers')
    expect(h.redirect).toHaveBeenCalledWith('/driver/offers')
  })

  it('a malformed id makes no query', async () => {
    db.calls.length = 0
    const el = await render('not-a-uuid')
    expect(el.type).not.toBe(TripScreenForToken)
    expect(db.calls).toEqual([])
  })

  it('source gate: the page has no write call and calls requireDriver', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
    expect(src).toMatch(/requireDriver\(/)
  })
})

describe('token page (D-15)', () => {
  it('stays a thin wrapper over the shared loader and writes nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/(internal)/driver/trip/[token]/page.tsx'), 'utf8')
    expect(src).toMatch(/TripScreenForToken/)
    expect(src).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
    const loader = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/trip/[token]/TripScreenForToken.tsx'),
      'utf8',
    )
    expect(loader).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Task 2: Back and the driver fee row
// ---------------------------------------------------------------------------------------------------------------------

function tripProps(extra: Partial<TripScreenProps> = {}): TripScreenProps {
  return {
    token: tok(1),
    view: { status: 'assigned', nextStep: 'en_route', lockReason: null, unlocksAt: null },
    trip: {
      bookingReference: 'PRG-100',
      pickupDate: '2026-11-27',
      pickupTime: '10:00',
      originAddress: 'Prague Airport',
      destinationAddress: 'Wenceslas Square',
      origin: { lat: 50.1, lng: 14.26 },
      destination: { lat: 50.08, lng: 14.42 },
      passengerName: 'Alice Smith',
      passengerPhone: '+420123456789',
      vehicleLabel: 'Business Class',
      vehicleInfo: 'Black Mercedes E-Class',
      driverName: 'John Driver',
      flight: null,
      clientNotes: null,
      distanceKm: 12.4,
      landing: null,
      freeWaitUntil: null,
      stops: [],
    },
    initialNote: null,
    noShow: { availableAt: null, requestedAt: null },
    ...extra,
  }
}

describe('TripScreen header with Back (D-01)', () => {
  it('without backHref the header is as before: wordmark and Help, no Back, no optional-wordmark class', () => {
    const { container } = render(<TripScreen {...tripProps()} />)
    expect(screen.getByRole('button', { name: /^Help$/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rides/ })).not.toBeInTheDocument()
    expect(container.querySelector('.driver-wordmark-optional')).toBeNull()
  })

  it('with backHref the header holds Back (Rides), the centered wordmark and Help, in that tab order', () => {
    const { container } = render(<TripScreen {...tripProps({ backHref: '/driver/rides' })} />)
    const back = screen.getByRole('link', { name: /Rides/ })
    expect(back).toHaveAttribute('href', '/driver/rides')
    expect(back.querySelector('svg')).not.toBeNull()
    const wordmark = container.querySelector('.admin-wordmark.driver-wordmark-optional')
    expect(wordmark).not.toBeNull()
    const help = screen.getByRole('button', { name: /^Help$/ })
    const header = container.querySelector('header') as HTMLElement
    const order = Array.from(header.querySelectorAll('a, .admin-wordmark, button'))
    expect(order[0]).toBe(back)
    expect(order[1]).toBe(wordmark)
    expect(order[2]).toBe(help)
  })
})

describe('TripScreen driver fee row (D-11)', () => {
  async function expand() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show trip details' }))
  }

  it('shows Your fee right after the Booking row when driverFee is set', async () => {
    render(<TripScreen {...tripProps({ backHref: '/driver/rides', driverFee: '2 500 Kč' })} />)
    expect(screen.queryByText('Your fee')).not.toBeInTheDocument()
    await expand()
    const caption = screen.getByText('Your fee')
    expect(screen.getByText('2 500 Kč')).toBeInTheDocument()
    const rows = Array.from(caption.parentElement!.parentElement!.children)
    const booking = screen.getByText('Booking').parentElement as HTMLElement
    expect(rows.indexOf(caption.parentElement as HTMLElement)).toBe(rows.indexOf(booking) + 1)
  })

  it.each([null, undefined, ''])('shows no fee row when driverFee is %s', async (fee) => {
    const { container } = render(<TripScreen {...tripProps({ driverFee: fee as string | null | undefined })} />)
    await expand()
    expect(screen.queryByText('Your fee')).not.toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/fee/i)
  })
})

describe('TripScreenForToken options', () => {
  const selects: string[] = []

  function stubRow() {
    return {
      id: aid(1),
      driver_id: DRIVER,
      status: 'accepted',
      trip_note: null,
      bookings: {
        id: bid(1),
        booking_reference: 'PRG-1',
        booking_source: null,
        pickup_utc: null,
        pickup_date: '2026-11-27',
        pickup_time: '10:30',
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
        status: 'assigned',
        driver_id: DRIVER,
        driver_price_czk: 2500,
      },
      drivers: { name: 'John Driver', vehicle_info: 'Black Mercedes E-Class' },
    }
  }

  async function loader() {
    return (await vi.importActual<typeof import('@/app/(internal)/driver/trip/[token]/TripScreenForToken')>(
      '@/app/(internal)/driver/trip/[token]/TripScreenForToken',
    )).default
  }

  beforeEach(() => {
    selects.length = 0
    h.getStartGate.mockResolvedValue({ unlocksAtMs: null, open: true })
    h.getNoShowView.mockResolvedValue({ noShowAvailableAt: null, noShowRequestedAt: null })
    h.loadStopsSafe.mockResolvedValue([])
    h.getNoShowThresholds.mockResolvedValue({ airportMin: 60, cityMin: 15 })
    h.db = {
      client: {
        from: () => ({
          select: (cols: string) => {
            selects.push(cols)
            return { eq: () => ({ single: async () => ({ data: stubRow(), error: null }) }) }
          },
        }),
      },
    }
  })

  it('without showDriverFee the select has no price column and no driverFee / backHref reaches the screen', async () => {
    const Loader = await loader()
    const el = (await Loader({ token: tok(1) })) as { type: unknown; props: Record<string, unknown> }
    expect(selects).toHaveLength(1)
    expect(selects[0]).not.toMatch(/amount_eur|price/i)
    expect(el.type).toBe(TripScreen)
    expect(el.props.driverFee).toBeUndefined()
    expect(el.props.backHref).toBeUndefined()
  })

  it('with showDriverFee only driver_price_czk is added to the bookings columns and a label is passed', async () => {
    const Loader = await loader()
    const plain = (await Loader({ token: tok(1) })) as unknown
    expect(plain).toBeTruthy()
    const el = (await Loader({ token: tok(1), backHref: '/driver/rides', showDriverFee: true })) as {
      type: unknown
      props: Record<string, unknown>
    }
    expect(selects).toHaveLength(2)
    expect(selects[1].replace(', driver_price_czk', '')).toBe(selects[0])
    expect(selects[1].match(/\w*price\w*/gi)).toEqual(['driver_price_czk'])
    expect(selects[1]).not.toMatch(/amount_eur/)
    expect(el.props.backHref).toBe('/driver/rides')
    expect(typeof el.props.driverFee).toBe('string')
    expect(String(el.props.driverFee)).toMatch(/2\s?500/)
  })

  it('showDriverFee on a booking without a fee passes null', async () => {
    const row = stubRow()
    row.bookings.driver_price_czk = 0
    h.db = {
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
        }),
      },
    }
    const Loader = await loader()
    const el = (await Loader({ token: tok(1), showDriverFee: true })) as { props: Record<string, unknown> }
    expect(el.props.driverFee).toBeNull()
  })

  it('an ended link in the cabinet gets the Back to rides target; on the token page the view has no props', async () => {
    const row = stubRow()
    row.bookings.status = 'on_board'
    row.bookings.driver_id = OTHER
    h.db = {
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
        }),
      },
    }
    const Loader = await loader()
    const cabinet = (await Loader({ token: tok(1), backHref: '/driver/rides', showDriverFee: true })) as {
      type: unknown
      props: Record<string, unknown>
    }
    expect(cabinet.type).toBe(InvalidTripLinkView)
    expect(cabinet.props).toEqual({ cabinetBackHref: '/driver/rides' })
    const plain = (await Loader({ token: tok(1) })) as { type: unknown; props: Record<string, unknown> }
    expect(plain.type).toBe(InvalidTripLinkView)
    expect(plain.props).toEqual({})
  })

  it('the cabinet page passes backHref /driver/rides and showDriverFee', async () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx'),
      'utf8',
    )
    expect(src).toMatch(/<TripScreenForToken[^>]*backHref="\/driver\/rides"[^>]*showDriverFee/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Task 3: closed rides and the uniform not-available view
// ---------------------------------------------------------------------------------------------------------------------

const SUMMARY = {
  bookingReference: 'PRG-777',
  dateLabel: 'Fri 27 Nov 2026',
  pickupTime: '10:30',
  pickup: 'Prague Airport',
  dropoff: 'Hotel Alcron',
  vehicleLabel: 'Business Van',
  feeLabel: '2 500 Kč' as string | null,
}
const BACK = '/driver/rides?view=past&month=2026-11'

describe('ClosedRideView', () => {
  it('completed: Back to the Past month, ok circle, heading, body and the full summary with the fee', () => {
    const { container } = render(<ClosedRideView state="completed" backHref={BACK} summary={SUMMARY} />)
    expect(screen.getByRole('link', { name: /Rides/ })).toHaveAttribute('href', BACK)
    expect(container.querySelector('.admin-wordmark.driver-wordmark-optional')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Trip completed' })).toBeInTheDocument()
    expect(screen.getByText('Thank you. This trip is closed.')).toBeInTheDocument()
    for (const caption of ['Booking', 'Date', 'Pickup time', 'Pickup', 'Drop-off', 'Vehicle class', 'Your fee']) {
      expect(screen.getByText(caption)).toBeInTheDocument()
    }
    for (const value of ['PRG-777', 'Fri 27 Nov 2026', '10:30', 'Prague Airport', 'Hotel Alcron', 'Business Van', '2 500 Kč']) {
      expect(screen.getByText(value)).toBeInTheDocument()
    }
    expect(container.innerHTML).toContain('--status-ok-bg')
  })

  it('completed without a fee label has no fee row', () => {
    render(<ClosedRideView state="completed" backHref={BACK} summary={{ ...SUMMARY, feeLabel: null }} />)
    expect(screen.queryByText('Your fee')).not.toBeInTheDocument()
  })

  it.each([
    ['cancelled', 'Ride cancelled'],
    ['no_show', 'Marked as no-show'],
  ] as const)('%s: info circle, heading "%s", body "This ride is closed." and no fee row', (state, heading) => {
    const { container } = render(<ClosedRideView state={state} backHref={BACK} summary={SUMMARY} />)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByText('This ride is closed.')).toBeInTheDocument()
    expect(container.innerHTML).toContain('--status-info-bg')
    expect(screen.queryByText('Your fee')).not.toBeInTheDocument()
    expect(screen.queryByText('2 500 Kč')).not.toBeInTheDocument()
  })

  it('shows no passenger, phone, flight, notes, client price or payment text', () => {
    const { container } = render(<ClosedRideView state="completed" backHref={BACK} summary={SUMMARY} />)
    expect(container.textContent ?? '').not.toMatch(/passenger|phone|flight|notes|payment|€|EUR/i)
  })

  it('source gate: no passenger / phone / flight field in the component', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/driver/ClosedRideView.tsx'), 'utf8')
    expect(src).not.toMatch(/client_phone|passengerPhone|flight/)
  })
})

describe('InvalidTripLinkView in the cabinet', () => {
  it('with cabinetBackHref: the not-available message, the office line and a Back to rides link', () => {
    render(<InvalidTripLinkView cabinetBackHref="/driver/rides" />)
    expect(screen.getByText('This ride is not available.')).toBeInTheDocument()
    expect(screen.getByText('If you think this is a mistake, call the office.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to rides' })).toHaveAttribute('href', '/driver/rides')
    expect(screen.queryByText('This trip link is no longer active.')).not.toBeInTheDocument()
  })

  it('without the prop it renders exactly as before', () => {
    render(<InvalidTripLinkView />)
    expect(screen.getByText('This trip link is no longer active.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to rides' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call the office' })).toHaveAttribute('href', BUSINESS_TEL_URL)
  })
})

describe('cabinet page: closed and uniform views', () => {
  beforeEach(() => {
    seq = 0
    h.requireDriver.mockReset()
    h.requireDriver.mockResolvedValue({ driverId: DRIVER, sessionId: 's1' })
  })

  async function renderId(id: string) {
    const el = await RideDetailPage({ params: Promise.resolve({ assignmentId: id }) })
    return render(el as React.ReactElement)
  }

  it('an unknown id, another driver id and a superseded id render identical markup', async () => {
    const older = assignment(3, 3, { created_at: '2026-11-01T08:00:00.000Z' })
    const newer = assignment(4, 3, { driver_id: OTHER, created_at: '2026-11-02T08:00:00.000Z' })
    h.db = dbWith(
      [booking(1), booking(3)],
      [assignment(1, 1, { driver_id: OTHER }), older, newer],
    )
    const unknown = (await renderId(aid(99))).container.innerHTML
    const foreign = (await renderId(aid(1))).container.innerHTML
    const superseded = (await renderId(aid(3))).container.innerHTML
    const malformed = (await renderId('nope')).container.innerHTML
    expect(unknown).toContain('This ride is not available.')
    expect(foreign).toBe(unknown)
    expect(superseded).toBe(unknown)
    expect(malformed).toBe(unknown)
    expect(unknown).toContain('href="/driver/rides"')
  })

  it('a closed ride renders ClosedRideView with its Back to the Past month', async () => {
    h.db = dbWith([booking(1, { status: 'completed' })], [assignment(1, 1)])
    const { container } = await renderId(aid(1))
    expect(screen.getByRole('heading', { name: 'Trip completed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rides/ })).toHaveAttribute('href', '/driver/rides?view=past&month=2026-11')
    expect(container.textContent ?? '').not.toMatch(/Jan|Novak|OK123|Child seat|9999/)
  })

  it('source gate: the page renders ClosedRideView', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx'),
      'utf8',
    )
    expect(src).toMatch(/ClosedRideView/)
  })
})
