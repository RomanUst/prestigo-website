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

import { buildChangeEmailHtml, sendBookingChangedEmail, type BookingChangeEntry } from '@/lib/email'

// Shape matches the (unexported) StatusEmailBooking interface — duck-typed,
// same pattern as the existing status-email tests in tests/email.test.ts.
const BASE_BOOKING = {
  id: 'b1',
  booking_reference: 'PRG-20260410-AB12CD',
  origin_address: 'Prague Airport Terminal 1',
  destination_address: 'Hotel Four Seasons Prague',
  pickup_date: '2026-04-10',
  pickup_time: '10:00',
  vehicle_class: 'business',
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  amount_czk: 2500,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
})

describe('lib/email — buildChangeEmailHtml (AEDIT-05, D-07/D-09)', () => {
  it('Test 1: renders exactly one diff row for a single-field change, containing old and new values', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    expect(html).toContain('10:00')
    expect(html).toContain('11:00')
    expect(html).toContain('Pickup time')
    // Exactly one diff row → exactly one arrow separator in the diff table
    const arrowMatches = html.match(/&rarr;/g) ?? []
    expect(arrowMatches.length).toBe(1)
  })

  it('Test 2: does NOT render an unchanged trip field (vehicle label / full journey snapshot) — D-07', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    // vehicle_class = 'business' is on the booking but NOT in `changes` — must not leak in
    expect(html).not.toContain('Business')
    expect(html).not.toContain('YOUR JOURNEY')
    expect(html).not.toContain(BASE_BOOKING.origin_address)
  })

  it('Test 3: escapes a malicious newValue (HTML tag + CRLF header-injection attempt)', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'flight_number', label: 'Flight number', oldValue: 'OK123', newValue: '<b>x</b>\r\nBcc: a@b.com' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('Bcc: a@b.com') // plain text after escaping is fine — just not an active tag
  })

  it('Test 3b: escapes label and oldValue too, not just newValue', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'client_email', label: '<script>alert(1)</script>', oldValue: '<i>old</i>', newValue: 'new@example.com' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<i>old</i>')
  })

  it('Test 4: renders a price change as an old -> new amount row in the same email (D-07)', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'amount_czk', label: 'Total price', oldValue: '2 500 Kč', newValue: '3 000 Kč' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    expect(html).toContain('Total price')
    expect(html).toContain('2 500 Kč')
    expect(html).toContain('3 000 Kč')
  })

  it('Test 5: multiple changes in one PATCH each render their own row', () => {
    const changes: BookingChangeEntry[] = [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
      { field: 'amount_czk', label: 'Total price', oldValue: '2 500 Kč', newValue: '3 000 Kč' },
    ]
    const html = buildChangeEmailHtml(BASE_BOOKING, changes)
    const arrowMatches = html.match(/&rarr;/g) ?? []
    expect(arrowMatches.length).toBe(2)
  })

  it('Test 6: HTML body starts with DOCTYPE (not an envelope)', () => {
    const html = buildChangeEmailHtml(BASE_BOOKING, [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
    ])
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/)
  })

  it('Test 7: contains the booking reference', () => {
    const html = buildChangeEmailHtml(BASE_BOOKING, [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
    ])
    expect(html).toContain('PRG-20260410-AB12CD')
  })
})

describe('lib/email — sendBookingChangedEmail (AEDIT-05, D-09)', () => {
  it('Test 8: sends via Resend with subject containing the booking reference and "was updated"', async () => {
    await sendBookingChangedEmail(BASE_BOOKING, [
      { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
    ])
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArgs = sendStub.mock.calls[0][0]
    expect(callArgs.to).toEqual(['jan@example.com'])
    expect(callArgs.subject).toContain('PRG-20260410-AB12CD')
    expect(callArgs.subject).toContain('was updated')
  })

  it('Test 9: resolves without throwing when Resend responds with an error payload (mirrors sendStatusConfirmedEmail try/catch)', async () => {
    sendStub.mockResolvedValue({ error: { message: 'send failed' }, data: null })
    await expect(
      sendBookingChangedEmail(BASE_BOOKING, [
        { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
      ])
    ).resolves.toBeUndefined()
  })

  it('Test 10: resolves without throwing when the Resend call itself throws', async () => {
    sendStub.mockRejectedValue(new Error('network error'))
    await expect(
      sendBookingChangedEmail(BASE_BOOKING, [
        { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
      ])
    ).resolves.toBeUndefined()
  })
})
