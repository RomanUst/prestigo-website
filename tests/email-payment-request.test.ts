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

import { buildPaymentRequestHtml, sendPaymentRequestEmail, type PaymentRequestEmailData } from '@/lib/email'

const BASE_DATA: PaymentRequestEmailData = {
  bookingReference: 'PRG-20260501-ABCD',
  clientEmail: 'jan@example.com',
  clientFirstName: 'Jan',
  clientLastName: 'Novak',
  originAddress: 'Prague Airport Terminal 1',
  destinationAddress: 'Hotel Four Seasons Prague',
  pickupDate: '2026-05-01',
  pickupTime: '10:00',
  vehicleClass: 'business',
  amountEur: 60,
  paymentLinkUrl: 'https://buy.stripe.com/test_x',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
})

describe('lib/email — buildPaymentRequestHtml (ANEW-03, D-06, T-64-05/06)', () => {
  it('Test 1: renders an <h1> heading, the booking reference, trip route, date/time, vehicle class, and EUR amount due', () => {
    const html = buildPaymentRequestHtml(BASE_DATA)
    expect(html).toMatch(/<h1[^>]*>/)
    expect(html).toContain('PRG-20260501-ABCD')
    expect(html).toContain('Prague Airport Terminal 1')
    expect(html).toContain('Hotel Four Seasons Prague')
    expect(html).toContain('10:00')
    expect(html).toContain('Business')
    expect(html).toContain('&euro;60'.replace('&euro;', '€'))
  })

  it('Test 2: renders a single "PAY NOW" CTA linking to paymentLinkUrl', () => {
    const html = buildPaymentRequestHtml(BASE_DATA)
    expect(html).toContain('PAY NOW')
    expect(html).toContain('href="https://buy.stripe.com/test_x"')
    // Exactly one CTA anchor — unlike the driver-assignment accept/decline pair
    const ctaMatches = html.match(/PAY NOW/g) ?? []
    expect(ctaMatches.length).toBe(1)
  })

  it('Test 3: an absent flight_number omits its row entirely (conditional-row convention)', () => {
    const html = buildPaymentRequestHtml({ ...BASE_DATA, flightNumber: undefined })
    expect(html).not.toContain('Flight')
  })

  it('Test 4: a present flightNumber renders its row', () => {
    const html = buildPaymentRequestHtml({ ...BASE_DATA, flightNumber: 'OK123' })
    expect(html).toContain('Flight')
    expect(html).toContain('OK123')
  })

  it('Test 5: never includes admin-only internals (operator_notes, override rationale, driver_price)', () => {
    const html = buildPaymentRequestHtml(BASE_DATA)
    expect(html.toLowerCase()).not.toContain('operator')
    expect(html.toLowerCase()).not.toContain('override')
    expect(html.toLowerCase()).not.toContain('driver_price')
    expect(html.toLowerCase()).not.toContain('margin')
  })

  it('Test 6: escapes a malicious client name / booking reference', () => {
    const html = buildPaymentRequestHtml({
      ...BASE_DATA,
      clientFirstName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('Test 7: HTML body starts with DOCTYPE (not an envelope)', () => {
    const html = buildPaymentRequestHtml(BASE_DATA)
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/)
  })

  it('Test 8: destinationAddress null renders a single-address route (no arrow), no truncation of long text', () => {
    const html = buildPaymentRequestHtml({
      ...BASE_DATA,
      destinationAddress: null,
      originAddress: 'A very long pickup address that should not be truncated in the trip summary table row',
    })
    expect(html).toContain('A very long pickup address that should not be truncated in the trip summary table row')
    expect(html).not.toContain('&rarr;')
  })
})

describe('lib/email — sendPaymentRequestEmail (ANEW-03, D-09)', () => {
  it('Test 9: sends via Resend once, to the client email, subject containing the booking reference', async () => {
    await sendPaymentRequestEmail(BASE_DATA)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArgs = sendStub.mock.calls[0][0]
    expect(callArgs.to).toEqual(['jan@example.com'])
    expect(callArgs.subject).toContain('PRG-20260501-ABCD')
    expect(callArgs.html).toContain('https://buy.stripe.com/test_x')
    expect(callArgs.html).toContain('€60')
  })

  it('Test 10: resolves without throwing when Resend responds with an error payload', async () => {
    sendStub.mockResolvedValue({ error: { message: 'send failed' }, data: null })
    await expect(sendPaymentRequestEmail(BASE_DATA)).resolves.toBeUndefined()
  })

  it('Test 11: resolves without throwing when the Resend call itself throws', async () => {
    sendStub.mockRejectedValue(new Error('network error'))
    await expect(sendPaymentRequestEmail(BASE_DATA)).resolves.toBeUndefined()
  })
})
