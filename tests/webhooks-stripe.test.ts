import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures this runs before vi.mock factories AND before imports
const { stripeStub } = vi.hoisted(() => {
  const constructEvent = vi.fn()
  return { stripeStub: { constructEvent } }
})

const { supabaseServiceStub } = vi.hoisted(() => {
  const supabaseServiceStub = { from: vi.fn() }
  return { supabaseServiceStub }
})

// Mock lib/supabase
vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn().mockResolvedValue(undefined),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'PRG-20260330-1234', booking_type: 'confirmed' }),
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Mock lib/email
vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
}))

// Mock Stripe — use a constructor function because route does `new Stripe(...)`
vi.mock('stripe', () => {
  return {
    default: function MockStripe() {
      return {
        webhooks: stripeStub,
      }
    },
  }
})

import { saveBooking, withRetry, buildBookingRow } from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert, sendEmergencyAlert } from '@/lib/email'
import { POST } from '@/app/api/webhooks/stripe/route'

const mockPaymentIntent = {
  id: 'pi_test_123',
  amount: 250000, // 2500 CZK in hellers
  currency: 'czk',
  metadata: {
    bookingReference: 'PRG-20260330-1234',
    tripType: 'transfer',
    originAddress: 'Prague Airport',
    destinationAddress: 'Hotel Alcron',
    pickupDate: '2026-04-15',
    pickupTime: '14:00',
    vehicleClass: 'business',
    passengers: '2',
    luggage: '2',
    amountCzk: '2500',
    extraChildSeat: 'false',
    extraMeetGreet: 'true',
    extraLuggage: 'false',
    firstName: 'Jan',
    lastName: 'Novak',
    email: 'jan@example.com',
    phone: '+420123456789',
  },
}

function makeRequest(body = 'raw-body', sig = 'valid-sig'): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': sig },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: valid payment_intent.succeeded event
  stripeStub.constructEvent.mockReturnValue({
    type: 'payment_intent.succeeded',
    data: { object: mockPaymentIntent },
  })
  ;(withRetry as ReturnType<typeof vi.fn>).mockImplementation((fn: () => Promise<unknown>) => fn())
  ;(buildBookingRow as ReturnType<typeof vi.fn>).mockReturnValue({ booking_reference: 'PRG-20260330-1234', booking_type: 'confirmed' })
  ;(saveBooking as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendClientConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendManagerAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendEmergencyAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('/api/webhooks/stripe', () => {
  describe('Webhook basics', () => {
    it('returns 400 on missing stripe-signature header', async () => {
      const req = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: 'raw-body',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/missing stripe-signature/i)
    })

    it('returns 400 on invalid signature', async () => {
      stripeStub.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature')
      })
      const res = await POST(makeRequest())
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Webhook Error')
    })

    it('returns { received: true } on valid event', async () => {
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual({ received: true })
    })
  })

  describe('BACK-01: Booking saved to Supabase', () => {
    it('calls buildBookingRow with metadata and paymentIntentId', async () => {
      await POST(makeRequest())
      expect(buildBookingRow).toHaveBeenCalledWith(
        mockPaymentIntent.metadata,
        'pi_test_123',
        'confirmed'
      )
    })

    it('calls saveBooking via withRetry with 3 attempts', async () => {
      await POST(makeRequest())
      expect(withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        1000
      )
      expect(saveBooking).toHaveBeenCalled()
    })
  })

  describe('BACK-02: Client confirmation email sent', () => {
    it('calls sendClientConfirmation with correct BookingEmailData', async () => {
      await POST(makeRequest())
      expect(sendClientConfirmation).toHaveBeenCalledOnce()
      const arg = (sendClientConfirmation as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.bookingReference).toBe('PRG-20260330-1234')
      expect(arg.tripType).toBe('transfer')
      expect(arg.passengers).toBe(2)
    })

    it('sendClientConfirmation receives correct email address from metadata', async () => {
      await POST(makeRequest())
      const arg = (sendClientConfirmation as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.email).toBe('jan@example.com')
    })
  })

  describe('BACK-03: Manager alert email sent', () => {
    it('calls sendManagerAlert with booking data', async () => {
      await POST(makeRequest())
      expect(sendManagerAlert).toHaveBeenCalledOnce()
      const arg = (sendManagerAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.bookingReference).toBe('PRG-20260330-1234')
    })
  })

  describe('BACK-04: Retry logic and emergency fallback', () => {
    it('calls withRetry with maxAttempts=3 and baseDelayMs=1000', async () => {
      await POST(makeRequest())
      expect(withRetry).toHaveBeenCalledWith(expect.any(Function), 3, 1000)
    })

    it('calls sendEmergencyAlert when withRetry throws', async () => {
      ;(withRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Supabase down'))
      await POST(makeRequest())
      expect(sendEmergencyAlert).toHaveBeenCalledWith(
        'PRG-20260330-1234',
        expect.objectContaining({ booking_reference: 'PRG-20260330-1234' })
      )
    })

    it('returns 200 even when saveBooking fails', async () => {
      ;(withRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Supabase down'))
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual({ received: true })
    })

    it('returns 200 even when sendClientConfirmation would fail', async () => {
      // sendClientConfirmation is non-fatal (catches internally in email.ts)
      ;(sendClientConfirmation as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Resend down'))
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
    })
  })
})

describe('charge.refunded webhook', () => {
  it('charge.refunded event updates booking status to cancelled via payment_intent lookup', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_test_123', refunded: true } },
    })

    const updateEqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })
    supabaseServiceStub.from.mockReturnValue({ update: updateFn })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ received: true })
    expect(supabaseServiceStub.from).toHaveBeenCalledWith('bookings')
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(updateEqFn).toHaveBeenCalledWith('payment_intent_id', 'pi_test_123')
  })
})
