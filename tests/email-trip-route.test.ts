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

import { sendStatusConfirmedEmail, tripRouteRowsHtml, type EmailTripRoute } from '@/lib/email'

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

// SHA-256 of the HTML produced by lib/email.ts BEFORE plan 91-14, for the inputs above (a booking without landing and
// stops). A change here means a booking without stops no longer renders byte-identical mail.
const BASELINE = {
  status: '1e31c6446661ec1c8acf324081d6e762044da2ba0acbef472224d42e9ae3035e',
}

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
