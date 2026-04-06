import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock rate limiter — always allow in tests
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, limit: 100 }),
  getClientIp: () => '127.0.0.1',
}))

// Mock lib/supabase
vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn().mockResolvedValue(undefined),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'QR-20260330-AB12CD', booking_type: 'quote', payment_intent_id: null }),
}))

// Mock lib/email
vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
}))

import { saveBooking, withRetry, buildBookingRow } from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert, sendEmergencyAlert } from '@/lib/email'
import { POST } from '@/app/api/submit-quote/route'

const mockQuoteBody = {
  tripType: 'transfer',
  origin: 'Prague Airport',
  destination: 'Hotel Alcron',
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  vehicleClass: 'business',
  passengers: 2,
  luggage: 0,
  extras: { childSeat: false, meetAndGreet: true, extraLuggage: false },
  passengerDetails: {
    firstName: 'Jan',
    lastName: 'Novak',
    email: 'jan@example.com',
    phone: '+420123456789',
  },
}

function makeRequest(body: unknown = mockQuoteBody): Request {
  return new Request('http://localhost/api/submit-quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(withRetry as ReturnType<typeof vi.fn>).mockImplementation((fn: () => Promise<unknown>) => fn())
  ;(buildBookingRow as ReturnType<typeof vi.fn>).mockReturnValue({ booking_reference: 'QR-20260330-AB12CD', booking_type: 'quote', payment_intent_id: null })
  ;(saveBooking as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendManagerAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendEmergencyAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('/api/submit-quote', () => {
  describe('Quote basics', () => {
    it('returns quoteReference matching QR-YYYYMMDD-NNNN pattern', async () => {
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.quoteReference).toMatch(/^QR-\d{8}-[A-F0-9]{6}$/)
    })

    it('returns 500 on malformed request body', async () => {
      const req = new Request('http://localhost/api/submit-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{{{',
      })
      const res = await POST(req)
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBeDefined()
    })
  })

  describe('BACK-01: Quote saved to Supabase', () => {
    it('calls buildBookingRow with null paymentIntentId and booking_type quote', async () => {
      await POST(makeRequest())
      expect(buildBookingRow).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        'quote'
      )
    })

    it('calls saveBooking via withRetry', async () => {
      await POST(makeRequest())
      expect(withRetry).toHaveBeenCalledWith(expect.any(Function), 3, 1000)
      expect(saveBooking).toHaveBeenCalled()
    })
  })

  describe('BACK-03: Manager alert sent for quote', () => {
    it('calls sendManagerAlert with quote data', async () => {
      await POST(makeRequest())
      expect(sendManagerAlert).toHaveBeenCalledOnce()
      const arg = (sendManagerAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.tripType).toBe('transfer')
      expect(arg.firstName).toBe('Jan')
    })

    it('does NOT call sendClientConfirmation', async () => {
      await POST(makeRequest())
      expect(sendClientConfirmation).not.toHaveBeenCalled()
    })
  })

  describe('BACK-04: Retry and emergency fallback for quote', () => {
    it('calls sendEmergencyAlert when Supabase save fails', async () => {
      ;(withRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Supabase down'))
      await POST(makeRequest())
      expect(sendEmergencyAlert).toHaveBeenCalledWith(
        expect.stringMatching(/^QR-\d{8}-[A-F0-9]{6}$/),
        expect.objectContaining({ booking_type: 'quote' })
      )
    })

    it('still returns quoteReference on Supabase failure', async () => {
      ;(withRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Supabase down'))
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.quoteReference).toMatch(/^QR-\d{8}-[A-F0-9]{6}$/)
    })
  })
})
