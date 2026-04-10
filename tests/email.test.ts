import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendStub } = vi.hoisted(() => {
  const sendStub = vi.fn()
  return { sendStub }
})

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendStub } }
  },
}))

import {
  buildRoundTripConfirmationHtml,
  sendRoundTripClientConfirmation,
  sendRoundTripManagerAlert,
  sendClientConfirmation,
  type RoundTripEmailData,
  type BookingEmailData,
} from '@/lib/email'

const BASE_RT: RoundTripEmailData = {
  outboundBookingReference: 'PRG-20260415-ABCDEF',
  returnBookingReference: 'PRG-20260417-DEF456',
  tripType: 'round_trip',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  outboundPickupDate: '2026-04-15',
  outboundPickupTime: '14:00',
  returnPickupDate: '2026-04-17',
  returnPickupTime: '18:30',
  vehicleClass: 'business',
  passengers: 2,
  luggage: 2,
  distanceKm: 18.5,
  outboundAmountCzk: 3500,
  returnAmountCzk: 3150,
  combinedAmountCzk: 6585,
  returnDiscountPct: 10,
  extraChildSeat: false,
  extraMeetGreet: false,
  extraLuggage: false,
  firstName: 'Jan',
  lastName: 'Novak',
  email: 'jan@example.com',
  phone: '+420123456789',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  process.env.MANAGER_EMAIL ||= 'manager@prestigo.cz'
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
})

describe('lib/email — round-trip HTML template', () => {
  it('Test 1 — RoundTripEmailData type is exported (module loads without error)', () => {
    // If the import above succeeded, the type is exported. Just assert the function exists.
    expect(typeof buildRoundTripConfirmationHtml).toBe('function')
  })

  it('Test 2 — HTML contains both booking references', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('PRG-20260415-ABCDEF')
    expect(html).toContain('PRG-20260417-DEF456')
  })

  it('Test 3 — HTML contains both pickup times', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('14:00')
    expect(html).toContain('18:30')
  })

  it('Test 4 — HTML shows route both directions (outbound and swapped return)', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('Prague Airport → Hotel Alcron')
    expect(html).toContain('Hotel Alcron → Prague Airport')
  })

  it('Test 5 — HTML shows per-leg prices separately', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    // formatCZK uses cs-CZ locale — NBSP between digits
    expect(html).toMatch(/3[\s\u00a0]?500/)
    expect(html).toMatch(/3[\s\u00a0]?150/)
  })

  it('Test 6 — HTML has TOTAL PAID label with combined amount', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('TOTAL PAID')
    expect(html).toMatch(/6[\s\u00a0]?585/)
  })

  it('Test 7 — HTML has return-discount badge', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toMatch(/[−-]10%/)
  })

  it('Test 8 — HTML body starts with DOCTYPE or html tag (not an envelope)', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>|^<html/)
  })

  it('Test 9 — HTML has TWO Google Calendar ghost buttons (ADD OUTBOUND + ADD RETURN) with two calendar.google.com URLs', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('ADD OUTBOUND')
    expect(html).toContain('ADD RETURN')
    const matches = html.match(/calendar\.google\.com/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('Test 10 — HTML promo line shown only when applied', () => {
    const htmlWithPromo = buildRoundTripConfirmationHtml({
      ...BASE_RT,
      promoCode: 'SUMMER25',
      promoDiscountPct: 25,
    })
    expect(htmlWithPromo).toContain('SUMMER25')
    expect(htmlWithPromo).toMatch(/25%/)

    const htmlWithoutPromo = buildRoundTripConfirmationHtml(BASE_RT)
    expect(htmlWithoutPromo).not.toContain('SUMMER25')
    expect(htmlWithoutPromo).not.toMatch(/Promo [A-Z]+ applied/)
  })

  it('Test 11 — HTML extras shown once with outbound label when extras present', () => {
    const html = buildRoundTripConfirmationHtml({ ...BASE_RT, extraMeetGreet: true })
    // Meet & Greet should appear — either raw or HTML-escaped
    const meetGreetCount = (html.match(/Meet(?:\s*&amp;\s*|\s*&\s*)Greet/g) || []).length
    expect(meetGreetCount).toBe(1)
    expect(html).toContain('EXTRAS (OUTBOUND)')
  })

  it('Test 12 — HTML extras block omitted when no extras selected', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT) // all extras false
    expect(html).not.toContain('EXTRAS (OUTBOUND)')
  })

  it('Test 13 — HTML escapes XSS in firstName (script tag)', () => {
    const html = buildRoundTripConfirmationHtml({
      ...BASE_RT,
      firstName: '<script>alert(1)</script>',
    })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('Test 14 — HTML escapes quotes and ampersands in originAddress', () => {
    const html = buildRoundTripConfirmationHtml({
      ...BASE_RT,
      originAddress: 'Ev"il & "Quote',
    })
    expect(html).toContain('Ev&quot;il &amp; &quot;Quote')
    expect(html).not.toContain('Ev"il & "Quote')
  })
})

describe('lib/email — sendRoundTripClientConfirmation', () => {
  it('Test 15 — calls Resend exactly once with a .ics attachment', async () => {
    await sendRoundTripClientConfirmation(BASE_RT, 'ICS-BODY-STRING')
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.attachments).toHaveLength(1)
    expect(callArg.attachments[0].filename).toMatch(/^prestigo-round-trip-PRG-20260415-ABCDEF\.ics$/)
    expect(callArg.attachments[0].content).toBe('ICS-BODY-STRING')
  })

  it('Test 16 — subject line matches D-06 template exactly', async () => {
    await sendRoundTripClientConfirmation(BASE_RT, 'ICS')
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.subject).toBe(
      'Your PRESTIGO round-trip booking is confirmed — PRG-20260415-ABCDEF'
    )
  })

  it('Test 17 — to contains data.email', async () => {
    await sendRoundTripClientConfirmation(BASE_RT, 'ICS')
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.to).toEqual(['jan@example.com'])
  })

  it('Test 18 — from address matches existing PRESTIGO envelope', async () => {
    await sendRoundTripClientConfirmation(BASE_RT, 'ICS')
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
  })

  it('Test 19 — does not throw on Resend API error (resolves successfully)', async () => {
    sendStub.mockResolvedValueOnce({ error: { message: 'API key invalid' }, data: null })
    await expect(sendRoundTripClientConfirmation(BASE_RT, 'ICS')).resolves.toBeUndefined()
  })

  it('Test 20 — does not throw on Resend network rejection', async () => {
    sendStub.mockRejectedValueOnce(new Error('Network down'))
    await expect(sendRoundTripClientConfirmation(BASE_RT, 'ICS')).resolves.toBeUndefined()
  })
})

describe('lib/email — sendRoundTripManagerAlert', () => {
  it('Test 21 — sends ONE text email with both legs, both dates, and combined total', async () => {
    await sendRoundTripManagerAlert(BASE_RT)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.text).toContain('PRG-20260415-ABCDEF')
    expect(callArg.text).toContain('PRG-20260417-DEF456')
    expect(callArg.text).toContain('2026-04-15')
    expect(callArg.text).toContain('2026-04-17')
    expect(callArg.text).toMatch(/OUTBOUND/)
    expect(callArg.text).toMatch(/RETURN/)
    expect(callArg.text).toMatch(/6[\s\u00a0]?585/)
  })

  it('Test 22 — manager alert subject contains round-trip and outbound reference', async () => {
    await sendRoundTripManagerAlert(BASE_RT)
    const callArg = sendStub.mock.calls[0][0]
    expect(/round-trip/i.test(callArg.subject)).toBe(true)
    expect(callArg.subject).toContain('PRG-20260415-ABCDEF')
  })

  it('Test 23 — manager alert sent to MANAGER_EMAIL', async () => {
    await sendRoundTripManagerAlert(BASE_RT)
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.to).toEqual(['manager@prestigo.cz'])
  })
})

describe('lib/email — one-way regression guard (D-09)', () => {
  it('Test 24 — sendClientConfirmation for one-way booking has no attachments and no round-trip markup', async () => {
    const oneWay: BookingEmailData = {
      bookingReference: 'PRG-20260415-ABCDEF',
      tripType: 'transfer',
      originAddress: 'Prague Airport',
      destinationAddress: 'Hotel Alcron',
      pickupDate: '2026-04-15',
      pickupTime: '14:00',
      vehicleClass: 'business',
      passengers: 2,
      luggage: 2,
      amountCzk: 2500,
      extraChildSeat: false,
      extraMeetGreet: false,
      extraLuggage: false,
      firstName: 'Jan',
      lastName: 'Novak',
      email: 'jan@example.com',
      phone: '+420123456789',
    }
    await sendClientConfirmation(oneWay)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.html).toContain('PRG-20260415-ABCDEF')
    expect(callArg.html).not.toContain('YOUR RETURN JOURNEY')
    expect(callArg.html).not.toContain('YOUR OUTBOUND JOURNEY')
    expect(callArg.html).not.toContain('ADD OUTBOUND')
    expect(callArg.attachments).toBeUndefined()
  })
})
