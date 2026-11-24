// @vitest-environment node
/**
 * Phase 93, plan 93-19 — TRIP-04 (D-11, D-12): the client confirmation, the client reminder and the operator alert of a
 * tour booking read as a day trip (title, time at the destination, pickup and return), in the existing English shell.
 * T-93-53: every tour string is escaped. T-93-54: the cancellation box reads the stored `tour-` snapshot.
 * Transfer and hourly emails stay byte-identical (the tour branch is purely additive).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
  },
  mockResendSend: vi.fn(),
}))
process.env.RESEND_API_KEY = 're_test'
process.env.MANAGER_EMAIL = 'owner@example.com'
process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend }
  },
}))

import {
  sendClientConfirmation,
  sendClientReminderEmail,
  sendManagerAlert,
  buildGoogleCalendarUrl,
  type BookingEmailData,
  type ReminderEmailBooking,
} from '@/lib/email'
import { bookingEmailDataFromRow } from '@/lib/payments/emails/send'
import { buildPolicyBlockHtml } from '@/lib/payments/emails/policy-block'
import { buildTourPolicySnapshot } from '@/lib/tours/policy'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'

const tourRow = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  status: 'confirmed',
  booking_reference: 'PRG-20261201-ABC123',
  booking_source: 'web',
  client_first_name: 'Anna',
  client_last_name: 'Petrova',
  client_email: 'anna@example.com',
  client_phone: '+420123456789',
  locale: 'en',
  trip_type: 'tour',
  leg: 'outbound',
  origin_address: 'Hotel Alcron, Prague',
  origin_lat: null,
  origin_lng: null,
  destination_address: 'Dresden',
  distance_km: null,
  pickup_date: '2026-12-01',
  pickup_time: '09:30',
  pickup_utc: '2026-12-01T08:30:00.000Z',
  vehicle_class: 'business',
  passengers: 3,
  luggage: 0,
  amount_czk: 13500,
  amount_eur: 540,
  hours: 6,
  tour_id: '99999999-9999-4999-8999-999999999999',
  tour_title: 'Dresden',
  tour_extra_hours: 1,
  payment_mode: 'card_hold',
  payment_currency: 'eur',
  payment_amount_minor: 54000,
  cancel_policy_version: buildTourPolicySnapshot(24).version,
  cancel_policy: buildTourPolicySnapshot(24).snapshot,
  ...over,
})

const transferData = (over: Partial<BookingEmailData> = {}): BookingEmailData => ({
  bookingReference: 'PRG-1',
  tripType: 'transfer',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  pickupDate: '2026-12-01',
  pickupTime: '14:00',
  vehicleClass: 'business',
  passengers: 2,
  luggage: 1,
  amountCzk: 2500,
  extraChildSeat: false,
  extraMeetGreet: false,
  extraLuggage: false,
  firstName: 'Anna',
  lastName: 'Petrova',
  email: 'anna@example.com',
  phone: '+420123456789',
  ...over,
})

async function sentHtml(run: () => Promise<void>): Promise<string> {
  mockResendSend.mockClear()
  await run()
  return mockResendSend.mock.calls[0][0].html as string
}

async function sentText(run: () => Promise<void>): Promise<string> {
  mockResendSend.mockClear()
  await run()
  return mockResendSend.mock.calls[0][0].text as string
}

let db: FakePaymentsDb

beforeEach(() => {
  vi.clearAllMocks()
  db = createFakePaymentsDb({ bookings: [tourRow()] })
  world.db = db
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('bookingEmailDataFromRow of a tour row', () => {
  it('passes tripType tour, the title, the extra hours and the total hours', () => {
    const data = bookingEmailDataFromRow(tourRow())
    expect(data.tripType).toBe('tour')
    expect(data.tourTitle).toBe('Dresden')
    expect(data.tourExtraHours).toBe(1)
    expect(data.hours).toBe(6)
    expect(data.originAddress).toBe('Hotel Alcron, Prague')
  })

  it('a transfer row has no tour fields', () => {
    const data = bookingEmailDataFromRow(tourRow({ trip_type: 'transfer', tour_title: null, tour_extra_hours: null, hours: null }))
    expect(data.tourTitle).toBeUndefined()
    expect(data.tourExtraHours).toBeUndefined()
    expect(data.hours).toBeUndefined()
  })
})

describe('client confirmation of a tour', () => {
  it('shows Day trip, Time at the destination (included + extra) and Pickup and return, not Route or Duration', async () => {
    const html = await sentHtml(() => sendClientConfirmation(bookingEmailDataFromRow(tourRow())))
    expect(html).toContain('>Day trip</td>')
    expect(html).toContain('>Dresden</td>')
    expect(html).toContain('>Time at the destination</td>')
    expect(html).toContain('5 hours included, +1 hour extra')
    expect(html).toContain('>Pickup and return</td>')
    expect(html).toContain('Hotel Alcron, Prague')
    expect(html).not.toContain('>Route</td>')
    expect(html).not.toContain('>Duration</td>')
  })

  it('without extra hours the time at the destination has no extra part', async () => {
    const html = await sentHtml(() =>
      sendClientConfirmation(bookingEmailDataFromRow(tourRow({ hours: 5, tour_extra_hours: 0 }))),
    )
    expect(html).toContain('5 hours included')
    expect(html).not.toMatch(/\+\d+ hours? extra/)
  })

  it('escapes the tour title and the pickup address (T-93-53)', async () => {
    const html = await sentHtml(() =>
      sendClientConfirmation(
        bookingEmailDataFromRow(tourRow({ tour_title: '<b>Dresden</b>', origin_address: '<img src=x onerror=1>' })),
      ),
    )
    expect(html).not.toContain('<b>Dresden</b>')
    expect(html).toContain('&lt;b&gt;Dresden&lt;/b&gt;')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=1&gt;')
  })

  it('a transfer and an hourly confirmation are unchanged: no tour rows, Route and Duration as before', async () => {
    const transfer = await sentHtml(() => sendClientConfirmation(transferData()))
    expect(transfer).toContain('>Route</td>')
    expect(transfer).not.toContain('Day trip')
    expect(transfer).not.toContain('Time at the destination')
    const hourly = await sentHtml(() => sendClientConfirmation(transferData({ tripType: 'hourly', hours: 4 })))
    expect(hourly).toContain('>Duration</td>')
    expect(hourly).not.toContain('Time at the destination')
    // A tour row without a title falls back to the plain journey rather than printing an empty day trip.
    const untitled = await sentHtml(() => sendClientConfirmation(transferData({ tripType: 'tour', tourTitle: null })))
    expect(untitled).toContain('>Route</td>')
  })

  it('the cancellation box reads the stored tour snapshot: 24 h and 48 h snapshots give different free-until moments (T-93-54)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'))
    const block24 = await buildPolicyBlockHtml(db.state.bookings[0])
    expect(block24).toContain('Free cancellation until')
    expect(block24).toContain('30 Nov')

    const row48 = tourRow({
      cancel_policy_version: buildTourPolicySnapshot(48).version,
      cancel_policy: buildTourPolicySnapshot(48).snapshot,
    })
    db = createFakePaymentsDb({ bookings: [row48] })
    world.db = db
    const block48 = await buildPolicyBlockHtml(db.state.bookings[0])
    expect(block48).toContain('29 Nov')
    expect(block48).not.toContain('30 Nov')

    // The block goes into the tour confirmation below the journey rows.
    const html = await sentHtml(() =>
      sendClientConfirmation({ ...bookingEmailDataFromRow(row48), policyBlockHtml: block48 }),
    )
    expect(html).toContain(block48)
    expect(html.indexOf('Pickup and return')).toBeLessThan(html.indexOf(block48))
  })
})

describe('client reminder of a tour (24 h and 2 h)', () => {
  const reminder = (over: Partial<ReminderEmailBooking> = {}): ReminderEmailBooking => ({
    booking_reference: 'PRG-20261201-ABC123',
    pickup_date: '2026-12-01',
    pickup_time: '09:30',
    origin_address: 'Hotel Alcron, Prague',
    destination_address: 'Dresden',
    vehicle_class: 'business',
    client_email: 'anna@example.com',
    trip_type: 'tour',
    tour_title: 'Dresden',
    tour_extra_hours: 1,
    hours: 6,
    ...over,
  })

  it.each(['24h', '2h'] as const)('%s reminder has the day trip rows and says day trip', async (horizon) => {
    mockResendSend.mockClear()
    await sendClientReminderEmail(reminder(), horizon)
    const sent = mockResendSend.mock.calls[0][0] as { html: string; subject: string }
    expect(sent.subject).toContain('day trip')
    expect(sent.html).toContain('>Day trip</td>')
    expect(sent.html).toContain('5 hours included, +1 hour extra')
    expect(sent.html).toContain('>Pickup and return</td>')
    expect(sent.html).not.toContain('>Route</td>')
  })

  it('escapes the title', async () => {
    mockResendSend.mockClear()
    await sendClientReminderEmail(reminder({ tour_title: '<script>x</script>' }), '24h')
    const html = (mockResendSend.mock.calls[0][0] as { html: string }).html
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('migration 096: a tour sold through a quote shows its description escaped, line breaks as <br>', async () => {
    mockResendSend.mockClear()
    await sendClientReminderEmail(reminder({ tour_description: 'Kutná Hora\n<b>Lunch</b> not included' }), '24h')
    const html = (mockResendSend.mock.calls[0][0] as { html: string }).html
    expect(html).toContain('>About the trip</td>')
    expect(html).toContain('Kutná Hora<br>&lt;b&gt;Lunch&lt;/b&gt; not included')
    expect(html).not.toContain('<b>Lunch</b>')
    mockResendSend.mockClear()
    await sendClientReminderEmail(reminder({ tour_description: '   ' }), '24h')
    expect((mockResendSend.mock.calls[0][0] as { html: string }).html).not.toContain('About the trip')
  })

  it('a transfer reminder keeps its Route row and subject', async () => {
    mockResendSend.mockClear()
    await sendClientReminderEmail(
      { ...reminder(), trip_type: 'transfer', tour_title: null, tour_extra_hours: null, hours: null },
      '24h',
    )
    const sent = mockResendSend.mock.calls[0][0] as { html: string; subject: string }
    expect(sent.subject).toBe('Your transfer tomorrow — Prestigo')
    expect(sent.html).toContain('>Route</td>')
    expect(sent.html).not.toContain('Day trip')
  })
})

describe('operator alert of a tour', () => {
  it('lists the day trip, the time at the destination and the pickup and return address', async () => {
    const text = await sentText(() => sendManagerAlert(bookingEmailDataFromRow(tourRow())))
    expect(text).toContain('Day trip: Dresden')
    expect(text).toContain('Time at the destination: 5 hours included, +1 hour extra')
    expect(text).toContain('Pickup and return: Hotel Alcron, Prague')
    expect(text).not.toContain('Route:')
  })

  it('a transfer alert keeps its Route line', async () => {
    const text = await sentText(() => sendManagerAlert(transferData()))
    expect(text).toContain('Route: Prague Airport → Hotel Alcron')
    expect(text).not.toContain('Day trip')
  })
})

describe('the Add to calendar link of the email', () => {
  it('a tour is titled with the tour and lasts its hours at the destination, a transfer stays one hour', () => {
    const tourUrl = new URL(buildGoogleCalendarUrl(bookingEmailDataFromRow(tourRow())))
    expect(tourUrl.searchParams.get('text')).toBe('Dresden — Prestigo')
    expect(tourUrl.searchParams.get('dates')).toBe('20261201T093000/20261201T153000')
    expect(tourUrl.searchParams.get('details')).toContain('Pickup and return: Hotel Alcron, Prague')
    const transferUrl = new URL(buildGoogleCalendarUrl(transferData()))
    expect(transferUrl.searchParams.get('dates')).toBe('20261201T140000/20261201T150000')
  })
})
