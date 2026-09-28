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
  sendClientConfirmation,
  CUSTOMER_REPLY_TO,
  type BookingEmailData,
} from '@/lib/email'

const BASE_BOOKING: BookingEmailData = {
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

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  process.env.MANAGER_EMAIL ||= 'manager@prestigo.cz'
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
})

describe('lib/email — D-11 customer replies route to bookings@ (Phase 77-02, tracer)', () => {
  it('Test 1: CUSTOMER_REPLY_TO is exported and equals bookings@rideprestigo.com', () => {
    expect(CUSTOMER_REPLY_TO).toBe('bookings@rideprestigo.com')
  })

  it('Test 2: sendClientConfirmation calls Resend once with replyTo bookings@rideprestigo.com and an unchanged from address', async () => {
    await sendClientConfirmation(BASE_BOOKING)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const callArg = sendStub.mock.calls[0][0]
    expect(callArg.replyTo).toBe('bookings@rideprestigo.com')
    expect(callArg.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
  })
})
