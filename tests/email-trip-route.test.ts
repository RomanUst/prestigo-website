import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

/**
 * Phase 91-14 (STOP-04, STOP-05): the stops, their waiting and the airport landing / pickup times in every message
 * about a booking. Only Resend and the stops loader are mocked; the real lib/email.ts renders.
 */

const { sendStub, loadStopsSafeMock } = vi.hoisted(() => ({
  sendStub: vi.fn(),
  loadStopsSafeMock: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendStub } }
  },
}))

vi.mock('@/lib/booking-stops', () => ({ loadStopsSafe: loadStopsSafeMock }))

import {
  buildDriverAcceptedEmailHtml,
  sendClientConfirmation,
  sendDriverAcceptedEmail,
  sendDriverAssignmentEmail,
  sendManagerAlert,
  sendStatusConfirmedEmail,
  tripRouteRowsHtml,
  type BookingEmailData,
  type DriverAcceptedEmailData,
  type DriverAssignmentEmailData,
  type EmailTripRoute,
} from '@/lib/email'
import { bookingEmailDataFromRow } from '@/lib/payments/emails/send'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const ROUTE: EmailTripRoute = {
  landing: { date: '2027-06-10', time: '14:00', offsetMin: 30 },
  stops: [{ position: 1, address: 'Karlovy Vary', waitMinutes: 45, feeEur: 24 }],
}

const stop = (over: Record<string, unknown> = {}) => ({
  position: 1,
  address: 'Karlovy Vary',
  lat: 50.23,
  lng: 12.87,
  waitMinutes: 45,
  freeMinutes: 15,
  blocks: 2,
  feePerBlockEur: 12,
  feeEur: 24,
  ...over,
})

const STATUS_BOOKING = {
  id: 'b1',
  booking_reference: 'PRG-1',
  origin_address: 'Prague Airport',
  destination_address: 'Hotel <b>Alcron</b>',
  pickup_date: '2027-06-10',
  pickup_time: '14:30',
  vehicle_class: 'business',
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'j@example.com',
  amount_czk: 3500,
  special_requests: 'Seat',
}

const EMAIL_DATA: BookingEmailData = {
  bookingReference: 'PRG-1',
  tripType: 'transfer',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  pickupDate: '2027-06-10',
  pickupTime: '14:30',
  vehicleClass: 'business',
  passengers: 2,
  luggage: 1,
  amountCzk: 3500,
  extraChildSeat: false,
  extraMeetGreet: true,
  extraLuggage: false,
  firstName: 'Jan',
  lastName: 'Novak',
  email: 'j@example.com',
  phone: '+420123',
  flightNumber: 'OK123',
}

const LANDING_FIELDS = { landingDate: '2027-06-10', landingTime: '14:00', pickupOffsetMin: 30 }

const ACCEPTED_DATA: DriverAcceptedEmailData = {
  driverName: 'P',
  driverEmail: 'p@example.com',
  bookingReference: 'PRG-1',
  pickupDate: '2027-06-10',
  pickupTime: '14:30',
  originAddress: 'A',
  destinationAddress: 'B',
  passengerFirstName: 'J',
  passengerLastName: 'N',
  passengerPhone: '+420',
  vehicleClass: 'business',
  passengers: 2,
  luggage: 1,
  flightNumber: 'OK1',
  specialRequests: null,
  driverPriceCzk: 2000,
  tripUrl: 'https://x/y',
}

const ASSIGN_DATA: DriverAssignmentEmailData = {
  driverName: 'P',
  driverEmail: 'p@example.com',
  bookingReference: 'PRG-1',
  pickupDate: '2027-06-10',
  pickupTime: '14:30',
  originAddress: 'A',
  destinationAddress: 'B',
  passengerFirstName: 'J',
  passengerLastName: 'N',
  passengerPhone: '+420',
  driverPriceCzk: 2000,
  specialRequests: null,
  acceptUrl: 'https://x/a',
  declineUrl: 'https://x/d',
  tripUrl: 'https://x/t',
}

// SHA-256 of the HTML produced by lib/email.ts BEFORE plan 91-14, for the inputs above (a booking without landing and
// stops). A change here means a booking without stops no longer renders byte-identical mail.
const BASELINE = {
  status: '1e31c6446661ec1c8acf324081d6e762044da2ba0acbef472224d42e9ae3035e',
  client: '4a61a6ed990d273242bf080a9ebb10ad70f29aff3848047455921479041e333d',
  accepted: '7a8fbaa57deb21a971049b32ac7cfc58902920d77ff529e58d88d2976aee0b3c',
  assign: 'a00483696647087ec89456aa19b0da40c411446b28ba458f872937b110cef73f',
}

// The manager alert text of EMAIL_DATA before plan 91-14.
const MANAGER_BASELINE = `New booking received. Details below.

Booking Reference: PRG-1
Client: Jan Novak
Email: j@example.com
Phone: +420123
Route: Prague Airport → Hotel Alcron
Vehicle: Business
Pickup: 2027-06-10 at 14:30
Passengers: 2
Luggage: 1
Flight Number: OK123
Extras: Meet & Greet
Special Requests: None
Total: €140 (${(3500).toLocaleString('cs-CZ')} Kč)`

function sentHtml(callIndex = 0): string {
  return sendStub.mock.calls[callIndex][0].html as string
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  process.env.MANAGER_EMAIL ||= 'manager@prestigo.cz'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
  loadStopsSafeMock.mockResolvedValue([])
})

describe('tripRouteRowsHtml', () => {
  it('client variant: landing, pickup, stop with its wait and the waiting line', () => {
    const html = tripRouteRowsHtml(ROUTE, 'client')
    expect(html).toContain('Landing')
    expect(html).toContain('14:00')
    expect(html).toContain('Pickup')
    expect(html).toContain('14:30')
    expect(html).toContain('Stop 1')
    expect(html).toContain('Karlovy Vary')
    expect(html).toContain('wait 45 min')
    expect(html).toContain('Waiting at stops')
    expect(html).toContain('€24')
  })

  it('driver variant: the same rows without any waiting amount', () => {
    const html = tripRouteRowsHtml(ROUTE, 'driver')
    expect(html).toContain('Landing')
    expect(html).toContain('Pickup')
    expect(html).toContain('Stop 1')
    expect(html).toContain('wait 45 min')
    expect(html).not.toContain('Waiting at stops')
    expect(html).not.toContain('€')
  })

  it('escapes an address that carries markup', () => {
    const html = tripRouteRowsHtml(
      { landing: null, stops: [{ position: 1, address: '<script>alert(1)</script> & "x"', waitMinutes: 0, feeEur: 0 }] },
      'client',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
  })

  it('returns an empty string with no landing and no stops', () => {
    expect(tripRouteRowsHtml({ landing: null, stops: [] }, 'client')).toBe('')
    expect(tripRouteRowsHtml({ landing: null, stops: [] }, 'driver')).toBe('')
  })

  it('omits the waiting line when nothing is charged and shows no wait text for a zero wait', () => {
    const html = tripRouteRowsHtml(
      { landing: null, stops: [{ position: 2, address: 'Kutna Hora', waitMinutes: 0, feeEur: 0 }] },
      'client',
    )
    expect(html).toContain('Stop 2')
    expect(html).toContain('Kutna Hora')
    expect(html).not.toContain('wait 0 min')
    expect(html).not.toContain('Waiting at stops')
  })

  it('shows the pickup after midnight with its own date', () => {
    const html = tripRouteRowsHtml(
      { landing: { date: '2027-06-10', time: '23:50', offsetMin: 30 }, stops: [] },
      'client',
    )
    expect(html).toContain('00:20')
    expect(html).toContain('11 June 2027')
  })
})

describe('sendStatusConfirmedEmail (card-flow confirmed email)', () => {
  it('tracer: landing 14:00 + 30 and one stop waiting 45 min show in the email', async () => {
    loadStopsSafeMock.mockResolvedValue([stop()])
    await sendStatusConfirmedEmail({
      ...STATUS_BOOKING,
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
    })
    expect(loadStopsSafeMock).toHaveBeenCalledWith('b1')
    const html = sentHtml()
    expect(html).toContain('Landing')
    expect(html).toContain('14:00')
    expect(html).toContain('Pickup')
    expect(html).toContain('14:30')
    expect(html).toContain('Stop 1')
    expect(html).toContain('Karlovy Vary')
    expect(html).toContain('wait 45 min')
    expect(html).toContain('Waiting at stops')
  })

  it('without landing and stops the HTML is byte-identical to the one sent before this plan', async () => {
    await sendStatusConfirmedEmail(STATUS_BOOKING)
    expect(sha(sentHtml())).toBe(BASELINE.status)
  })

  it('a stops read that fails still sends the email, without stop rows', async () => {
    loadStopsSafeMock.mockRejectedValue(new Error('boom'))
    await sendStatusConfirmedEmail(STATUS_BOOKING)
    expect(sendStub).toHaveBeenCalledTimes(1)
    expect(sha(sentHtml())).toBe(BASELINE.status)
  })
})

describe('sendClientConfirmation (pay-now confirmation)', () => {
  it('pay-now confirmation lists landing, pickup, the stop with its wait and the waiting line', async () => {
    loadStopsSafeMock.mockResolvedValue([stop()])
    await sendClientConfirmation({ ...EMAIL_DATA, bookingId: 'b1', ...LANDING_FIELDS })
    expect(loadStopsSafeMock).toHaveBeenCalledWith('b1')
    const html = sentHtml()
    expect(html).toContain('Landing')
    expect(html).toContain('14:00')
    expect(html).toContain('Pickup')
    expect(html).toContain('Stop 1')
    expect(html).toContain('Karlovy Vary')
    expect(html).toContain('wait 45 min')
    expect(html).toContain('Waiting at stops')
    expect(html).toContain('€24')
  })

  it('pay-now confirmation escapes a stop address with markup', async () => {
    loadStopsSafeMock.mockResolvedValue([stop({ address: '<img src=x onerror=alert(1)>' })])
    await sendClientConfirmation({ ...EMAIL_DATA, bookingId: 'b1' })
    expect(sentHtml()).not.toContain('<img src=x')
    expect(sentHtml()).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('without bookingId nothing is read and the HTML is byte-identical to the one sent before this plan', async () => {
    await sendClientConfirmation(EMAIL_DATA)
    expect(loadStopsSafeMock).not.toHaveBeenCalled()
    expect(sha(sentHtml())).toBe(BASELINE.client)
  })

  it('with a bookingId but no stops and no landing the HTML is byte-identical too', async () => {
    await sendClientConfirmation({ ...EMAIL_DATA, bookingId: 'b1' })
    expect(sha(sentHtml())).toBe(BASELINE.client)
  })

  it('a stops read that fails still sends the confirmation, without stop rows', async () => {
    loadStopsSafeMock.mockRejectedValue(new Error('boom'))
    await sendClientConfirmation({ ...EMAIL_DATA, bookingId: 'b1' })
    expect(sendStub).toHaveBeenCalledTimes(1)
    expect(sha(sentHtml())).toBe(BASELINE.client)
  })
})

describe('sendManagerAlert', () => {
  const text = () => sendStub.mock.calls[0][0].text as string

  it('carries the landing, the pickup, the stops and the waiting amount', async () => {
    loadStopsSafeMock.mockResolvedValue([stop(), stop({ position: 2, address: 'Plzen', waitMinutes: 0, feeEur: 0 })])
    await sendManagerAlert({ ...EMAIL_DATA, bookingId: 'b1', ...LANDING_FIELDS })
    expect(text()).toContain('Landing: 10 June 2027 at 14:00')
    expect(text()).toContain('Landing pickup: 14:30')
    expect(text()).toContain('Stop 1: Karlovy Vary (wait 45 min)')
    expect(text()).toContain('Stop 2: Plzen')
    expect(text()).toContain('Waiting at stops: €24')
  })

  it('without a route the text is identical to the one sent before this plan', async () => {
    await sendManagerAlert({ ...EMAIL_DATA, bookingId: 'b1' })
    expect(text()).toBe(MANAGER_BASELINE)
  })

  it('a stops read that fails still sends the alert', async () => {
    loadStopsSafeMock.mockRejectedValue(new Error('boom'))
    await sendManagerAlert({ ...EMAIL_DATA, bookingId: 'b1' })
    expect(text()).toBe(MANAGER_BASELINE)
  })
})

describe('bookingEmailDataFromRow (card-on-file manager alert)', () => {
  it('maps the id and the three landing columns', () => {
    const data = bookingEmailDataFromRow({
      id: 'b1',
      booking_reference: 'PRG-1',
      landing_date: '2027-06-10',
      landing_time: '14:00',
      pickup_offset_min: 30,
    })
    expect(data.bookingId).toBe('b1')
    expect(data.landingDate).toBe('2027-06-10')
    expect(data.landingTime).toBe('14:00')
    expect(data.pickupOffsetMin).toBe(30)
  })

  it('leaves the landing keys undefined for a booking without a landing', () => {
    const data = bookingEmailDataFromRow({ id: 'b1', booking_reference: 'PRG-1', landing_date: null, landing_time: null, pickup_offset_min: null })
    expect(data.landingDate).toBeUndefined()
    expect(data.landingTime).toBeUndefined()
    expect(data.pickupOffsetMin).toBeUndefined()
  })
})

describe('driver emails', () => {
  it('assignment: landing, pickup and the stop with its wait appear in TRIP DETAILS, no waiting amount', async () => {
    loadStopsSafeMock.mockResolvedValue([stop()])
    await sendDriverAssignmentEmail({ ...ASSIGN_DATA, bookingId: 'b1', ...LANDING_FIELDS })
    const html = sentHtml()
    expect(html).toContain('>Landing</td>')
    expect(html).toContain('14:00')
    expect(html).toContain('>Pickup</td>')
    expect(html).toContain('>Stop 1</td>')
    expect(html).toContain('Karlovy Vary (wait 45 min)')
    expect(html).not.toContain('Waiting at stops')
    expect(html).not.toContain('€24')
  })

  it('accepted: the same rows, no waiting amount', async () => {
    loadStopsSafeMock.mockResolvedValue([stop()])
    await sendDriverAcceptedEmail({ ...ACCEPTED_DATA, bookingId: 'b1', ...LANDING_FIELDS })
    const html = sentHtml()
    expect(html).toContain('>Landing</td>')
    expect(html).toContain('>Stop 1</td>')
    expect(html).toContain('Karlovy Vary (wait 45 min)')
    expect(html).not.toContain('Waiting at stops')
    expect(html).not.toContain('€24')
  })

  it('stop addresses are escaped in both driver emails', async () => {
    loadStopsSafeMock.mockResolvedValue([stop({ address: '<b onmouseover=x>Hotel</b>' })])
    await sendDriverAssignmentEmail({ ...ASSIGN_DATA, bookingId: 'b1' })
    await sendDriverAcceptedEmail({ ...ACCEPTED_DATA, bookingId: 'b1' })
    for (const i of [0, 1]) {
      expect(sentHtml(i)).not.toContain('<b onmouseover=x>')
      expect(sentHtml(i)).toContain('&lt;b onmouseover=x&gt;Hotel&lt;/b&gt;')
    }
  })

  it('without a route both driver emails are byte-identical to the ones sent before this plan', async () => {
    await sendDriverAssignmentEmail({ ...ASSIGN_DATA, bookingId: 'b1' })
    expect(sha(sentHtml(0))).toBe(BASELINE.assign)
    expect(sha(buildDriverAcceptedEmailHtml(ACCEPTED_DATA))).toBe(BASELINE.accepted)
    await sendDriverAcceptedEmail({ ...ACCEPTED_DATA, bookingId: 'b1' })
    expect(sha(sentHtml(1))).toBe(BASELINE.accepted)
  })

  it('a stops read that fails still sends both driver emails', async () => {
    loadStopsSafeMock.mockRejectedValue(new Error('boom'))
    await sendDriverAssignmentEmail({ ...ASSIGN_DATA, bookingId: 'b1' })
    await sendDriverAcceptedEmail({ ...ACCEPTED_DATA, bookingId: 'b1' })
    expect(sendStub).toHaveBeenCalledTimes(2)
  })
})
