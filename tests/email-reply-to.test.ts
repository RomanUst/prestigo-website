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
  sendManagerAlert,
  sendContactInquiry,
  sendEmergencyAlert,
  sendRoundTripClientConfirmation,
  buildRoundTripConfirmationHtml,
  sendRoundTripManagerAlert,
  sendMultidayOperatorAlert,
  sendMultidayClientAck,
  sendStatusConfirmedEmail,
  sendStatusCancelledEmail,
  sendBookingChangedEmail,
  sendPaymentRequestEmail,
  sendDriverAssignmentEmail,
  sendDriverDeclineNotification,
  sendClientReminderEmail,
  sendDriverReminderEmail,
  sendPostTripEmail,
  CUSTOMER_REPLY_TO,
  type BookingEmailData,
  type RoundTripEmailData,
  type MultidayEmailData,
  type BookingChangeEntry,
  type PaymentRequestEmailData,
  type DriverAssignmentEmailData,
  type DriverDeclineNotificationData,
  type ReminderEmailBooking,
} from '@/lib/email'
import { sendCorporateContactEmails, type CorporateContactPayload } from '@/lib/email-corporate'
import { sendBespokeEmails, type BespokePayload } from '@/lib/email-bespoke'

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

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — full D-11 classification: all 11 customer sends use
// CUSTOMER_REPLY_TO, all internal/driver/operator sends are provably unchanged
// ─────────────────────────────────────────────────────────────────────────────

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

const BASE_MULTIDAY: MultidayEmailData = {
  quoteReference: 'MQ-20260411-ABC123',
  days: [{ index: 1, type: 'transfer', from: 'Prague Airport', to: 'Hotel Alcron' }],
  startDate: '2026-04-11',
  firstName: 'Jan',
  lastName: 'Novak',
  email: 'jan@example.com',
  phone: '+420123456789',
}

// StatusEmailBooking is not exported — matched structurally, same convention
// as tests/booking-changed-email.test.ts.
const BASE_STATUS_BOOKING = {
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

const BASE_CHANGES: BookingChangeEntry[] = [
  { field: 'pickup_time', label: 'Pickup time', oldValue: '10:00', newValue: '11:00' },
]

const BASE_PAYMENT_REQUEST: PaymentRequestEmailData = {
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

const BASE_DRIVER_ASSIGNMENT: DriverAssignmentEmailData = {
  driverName: 'Petr',
  driverEmail: 'petr@example.com',
  bookingReference: 'PRG-20260415-ABCDEF',
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  passengerFirstName: 'Jan',
  passengerLastName: 'Novak',
  passengerPhone: '+420123456789',
  driverPriceCzk: 2000,
  acceptUrl: 'https://rideprestigo.com/driver/response?token=a',
  declineUrl: 'https://rideprestigo.com/driver/response?token=d',
  tripUrl: 'https://rideprestigo.com/driver/trip/t',
}

const BASE_DRIVER_DECLINE: DriverDeclineNotificationData = {
  bookingReference: 'PRG-20260415-ABCDEF',
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  driverName: 'Petr',
}

const BASE_REMINDER_BOOKING: ReminderEmailBooking = {
  booking_reference: 'PRG-20260415-ABCDEF',
  pickup_date: '2026-04-15',
  pickup_time: '14:00',
  origin_address: 'Prague Airport',
  destination_address: 'Hotel Alcron',
  vehicle_class: 'business',
  client_email: 'jan@example.com',
  driver_email: 'petr@example.com',
}

const BASE_CORPORATE: CorporateContactPayload = {
  company: 'Acme Corp',
  name: 'Jan Novak',
  email: 'jan@example.com',
  trips: '10',
  notes: 'Weekly airport runs',
  source: 'corporate',
}

const BASE_BESPOKE: BespokePayload = {
  occasion: 'wedding',
  guests: 4,
  date: '2026-06-01',
  time: '10:00',
  specialRequests: null,
  name: 'Jan Novak',
  email: 'jan@example.com',
}

describe('lib/email — D-11 full classification (Phase 77-02, Task 2)', () => {
  describe('customer sends — replyTo is CUSTOMER_REPLY_TO (bookings@rideprestigo.com)', () => {
    it('sendClientConfirmation', async () => {
      await sendClientConfirmation(BASE_BOOKING)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendRoundTripClientConfirmation', async () => {
      await sendRoundTripClientConfirmation(BASE_RT, 'BEGIN:VCALENDAR\nEND:VCALENDAR')
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendMultidayClientAck', async () => {
      await sendMultidayClientAck(BASE_MULTIDAY)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendStatusConfirmedEmail', async () => {
      await sendStatusConfirmedEmail(BASE_STATUS_BOOKING)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendStatusCancelledEmail', async () => {
      await sendStatusCancelledEmail(BASE_STATUS_BOOKING)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendBookingChangedEmail', async () => {
      await sendBookingChangedEmail(BASE_STATUS_BOOKING, BASE_CHANGES)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendPaymentRequestEmail', async () => {
      await sendPaymentRequestEmail(BASE_PAYMENT_REQUEST)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendClientReminderEmail', async () => {
      await sendClientReminderEmail(BASE_REMINDER_BOOKING, '24h')
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendPostTripEmail', async () => {
      await sendPostTripEmail(BASE_STATUS_BOOKING)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendCorporateContactEmails — client ack (first send call)', async () => {
      await sendCorporateContactEmails(BASE_CORPORATE)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })

    it('sendBespokeEmails — client ack (first send call)', async () => {
      await sendBespokeEmails(BASE_BESPOKE)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(CUSTOMER_REPLY_TO)
    })
  })

  describe('internal/manager sends — replyTo unchanged (roman@rideprestigo.com)', () => {
    it('sendManagerAlert', async () => {
      await sendManagerAlert(BASE_BOOKING)
      expect(sendStub.mock.calls[0][0].replyTo).toBe('roman@rideprestigo.com')
    })

    it('sendRoundTripManagerAlert', async () => {
      await sendRoundTripManagerAlert(BASE_RT)
      expect(sendStub.mock.calls[0][0].replyTo).toBe('roman@rideprestigo.com')
    })
  })

  describe('internal sends — replyTo unchanged (visitor address, D-11 exception)', () => {
    it('sendContactInquiry keeps the visitor own address', async () => {
      await sendContactInquiry({ name: 'Jan Novak', email: 'visitor@example.com', message: 'Hello' })
      expect(sendStub.mock.calls[0][0].replyTo).toBe('visitor@example.com')
    })

    it('sendMultidayOperatorAlert keeps the visitor own address', async () => {
      await sendMultidayOperatorAlert(BASE_MULTIDAY)
      expect(sendStub.mock.calls[0][0].replyTo).toBe(BASE_MULTIDAY.email)
    })
  })

  it('sendEmergencyAlert keeps replyTo equal to process.env.MANAGER_EMAIL', async () => {
    await sendEmergencyAlert('PRG-20260415-ABCDEF', { booking_reference: 'PRG-20260415-ABCDEF' })
    expect(sendStub.mock.calls[0][0].replyTo).toBe(process.env.MANAGER_EMAIL)
  })

  describe('driver + operator sends — replyTo undefined (D-11 out of scope)', () => {
    it('sendDriverAssignmentEmail', async () => {
      await sendDriverAssignmentEmail(BASE_DRIVER_ASSIGNMENT)
      expect(sendStub.mock.calls[0][0].replyTo).toBeUndefined()
    })

    it('sendDriverReminderEmail', async () => {
      await sendDriverReminderEmail(BASE_REMINDER_BOOKING, '24h')
      expect(sendStub.mock.calls[0][0].replyTo).toBeUndefined()
    })

    it('sendDriverDeclineNotification', async () => {
      await sendDriverDeclineNotification(BASE_DRIVER_DECLINE)
      expect(sendStub.mock.calls[0][0].replyTo).toBeUndefined()
    })

    it('sendCorporateContactEmails — operator copy (second send call)', async () => {
      await sendCorporateContactEmails(BASE_CORPORATE)
      expect(sendStub.mock.calls[1][0].replyTo).toBeUndefined()
    })

    it('sendBespokeEmails — operator copy (second send call)', async () => {
      await sendBespokeEmails(BASE_BESPOKE)
      expect(sendStub.mock.calls[1][0].replyTo).toBeUndefined()
    })
  })

  it('IN-06: the round-trip customer email advertises bookings@, not the sales mailbox, in its body', () => {
    const html = buildRoundTripConfirmationHtml(BASE_RT)
    expect(html).toContain('contact bookings@rideprestigo.com')
    expect(html).not.toContain('roman@rideprestigo.com')
  })

  it('no customer payload ever carries replyTo roman@rideprestigo.com', async () => {
    await sendClientConfirmation(BASE_BOOKING)
    await sendRoundTripClientConfirmation(BASE_RT, 'BEGIN:VCALENDAR\nEND:VCALENDAR')
    await sendMultidayClientAck(BASE_MULTIDAY)
    await sendStatusConfirmedEmail(BASE_STATUS_BOOKING)
    await sendStatusCancelledEmail(BASE_STATUS_BOOKING)
    await sendBookingChangedEmail(BASE_STATUS_BOOKING, BASE_CHANGES)
    await sendPaymentRequestEmail(BASE_PAYMENT_REQUEST)
    await sendClientReminderEmail(BASE_REMINDER_BOOKING, '24h')
    await sendPostTripEmail(BASE_STATUS_BOOKING)
    await sendCorporateContactEmails(BASE_CORPORATE)
    await sendBespokeEmails(BASE_BESPOKE)
    for (const call of sendStub.mock.calls) {
      expect(call[0].replyTo).not.toBe('roman@rideprestigo.com')
    }
  })
})
