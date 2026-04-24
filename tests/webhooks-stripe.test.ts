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
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } },
  }
})

vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn().mockResolvedValue([{ id: 'new-booking-uuid' }]),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'PRG-20260330-1234', booking_type: 'confirmed', leg: 'outbound' }),
  buildBookingRows: vi.fn().mockReturnValue({
    outbound: { booking_reference: 'PRG-20260415-ABCDEF', leg: 'outbound', booking_type: 'confirmed' },
    return:   { booking_reference: 'PRG-20260417-DEF456', leg: 'return',   booking_type: 'confirmed' },
  }),
  saveRoundTripBookings: vi.fn().mockResolvedValue({ outbound_id: 'uuid-out', return_id: 'uuid-ret' }),
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Mock lib/email
vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
  sendRoundTripClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRoundTripManagerAlert: vi.fn().mockResolvedValue(undefined),
}))

// Mock lib/ics
vi.mock('@/lib/ics', () => ({
  buildIcs: vi.fn().mockReturnValue('STUB-ICS'),
}))

// Mock lib/qstash — fire-and-forget, never throws in tests
vi.mock('@/lib/qstash', () => ({
  scheduleQStashReminder: vi.fn().mockResolvedValue(undefined),
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

import { saveBooking, withRetry, buildBookingRow, buildBookingRows, saveRoundTripBookings } from '@/lib/supabase'
import {
  sendClientConfirmation, sendManagerAlert, sendEmergencyAlert,
  sendRoundTripClientConfirmation, sendRoundTripManagerAlert,
} from '@/lib/email'
import { buildIcs } from '@/lib/ics'
import { POST } from '@/app/api/webhooks/stripe/route'

const mockPaymentIntentRoundTrip = {
  id: 'pi_test_rt',
  amount: 658500, // 6585 CZK in hellers — combined post-promo
  currency: 'czk',
  metadata: {
    bookingReference: 'PRG-20260415-ABCDEF',
    returnBookingReference: 'PRG-20260417-DEF456',
    tripType: 'round_trip',
    originAddress: 'Prague Airport',
    originLat: '50.1008',
    originLng: '14.2632',
    destinationAddress: 'Hotel Alcron',
    destinationLat: '50.0801',
    destinationLng: '14.4293',
    pickupDate: '2026-04-15',
    pickupTime: '14:00',
    returnDate: '2026-04-17',
    returnTime: '18:30',
    vehicleClass: 'business',
    passengers: '2',
    luggage: '2',
    distanceKm: '18.5',
    amountCzk: '6585',
    amountEur: '263',
    outboundAmountCzk: '3500',
    returnAmountCzk: '3150',
    returnDiscountPct: '10',
    extraChildSeat: 'false',
    extraMeetGreet: 'true',
    extraLuggage: 'false',
    firstName: 'Jan',
    lastName: 'Novak',
    email: 'jan@example.com',
    phone: '+420123456789',
    flightNumber: 'OK123',
    terminal: '1',
    specialRequests: 'No onions',
    promoCode: '',
    discountPct: '0',
  },
}

// D-18 amount-matching fallback requires outbound_amount_czk AND return_amount_czk on the row.
// Plan 27-02 buildBookingRows writes both columns on BOTH rows — the refund handler can read
// them from either row. Tests mirror this by carrying both columns on both rows.
const ROUND_TRIP_ROWS = [
  { id: 'uuid-out', leg: 'outbound', amount_czk: 3500, outbound_amount_czk: 3500, return_amount_czk: 3150, status: 'confirmed' },
  { id: 'uuid-ret', leg: 'return',   amount_czk: 3150, outbound_amount_czk: 3500, return_amount_czk: 3150, status: 'confirmed' },
]
const ONE_WAY_ROWS = [
  { id: 'uuid-single', leg: 'outbound', amount_czk: 2500, outbound_amount_czk: null, return_amount_czk: null, status: 'confirmed' },
]

// Helper: set up supabaseServiceStub.from() chain for refund tests.
// The webhook calls: supabase.from('bookings').select(...).eq('payment_intent_id', pi)
//         then:      supabase.from('bookings').update({status: 'cancelled'}).eq('id'|'payment_intent_id', ...)
function mockFromChain(rows: Array<Record<string, unknown>>) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const inFn = vi.fn().mockResolvedValue({ data: [], error: null })
  // .select().eq() for refund lookup must resolve with rows
  const selectEqResolved = vi.fn().mockResolvedValue({ data: rows, error: null })
  const select = vi.fn().mockReturnValue({ eq: selectEqResolved, in: inFn })
  supabaseServiceStub.from.mockImplementation((table: string) => {
    if (table === 'stripe_processed_events') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    return { select, update }
  })
  return { update, updateEq, select, selectEq: selectEqResolved }
}

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
  ;(saveBooking as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'new-booking-uuid' }])
  ;(sendClientConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendManagerAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendEmergencyAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(buildBookingRows as ReturnType<typeof vi.fn>).mockReturnValue({
    outbound: { booking_reference: 'PRG-20260415-ABCDEF', leg: 'outbound', booking_type: 'confirmed' },
    return:   { booking_reference: 'PRG-20260417-DEF456', leg: 'return',   booking_type: 'confirmed' },
  })
  ;(saveRoundTripBookings as ReturnType<typeof vi.fn>).mockResolvedValue({ outbound_id: 'uuid-out', return_id: 'uuid-ret' })
  ;(sendRoundTripClientConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendRoundTripManagerAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(buildIcs as ReturnType<typeof vi.fn>).mockReturnValue('STUB-ICS')

  // Default: supabase.from('stripe_processed_events').insert(...) succeeds (no duplicate)
  supabaseServiceStub.from.mockImplementation((table: string) => {
    if (table === 'stripe_processed_events') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    // Default fallback for 'bookings' or any other table — no-op chains
    // Supports: .select().eq().single(), .select().eq(), .select().in(), .update().eq()
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const selectEq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq: selectEq, in: inFn })
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })
    return { select, update }
  })
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
      expect(json.error).toContain('Webhook signature verification failed')
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

  describe('BACK-05: Idempotency', () => {
    it('skips emails and returns 200 when saveBooking signals duplicate (returns [])', async () => {
      // Simulate: DB upsert with ignoreDuplicates=true found an existing row — returns empty array
      ;(saveBooking as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual({ received: true })

      // saveBooking was still called (DB handles dedup), but emails must be skipped
      expect(saveBooking).toHaveBeenCalled()
      expect(sendClientConfirmation).not.toHaveBeenCalled()
      expect(sendManagerAlert).not.toHaveBeenCalled()
    })
  })
})

describe('charge.refunded webhook', () => {
  it('charge.refunded event updates booking status to cancelled via payment_intent lookup', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_test_123', refunded: true, amount: 250000, amount_refunded: 250000, refunds: { data: [{ id: 're_1', amount: 250000, metadata: {} }] } } },
    })

    const chain = mockFromChain(ONE_WAY_ROWS)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ received: true })
    expect(supabaseServiceStub.from).toHaveBeenCalledWith('bookings')
    expect(chain.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(chain.updateEq).toHaveBeenCalledWith('id', 'uuid-single')
  })
})

describe('Round-trip (Phase 27)', () => {
  beforeEach(() => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: mockPaymentIntentRoundTrip },
    })
  })

  it("RT-01: branches on tripType=round_trip — calls saveRoundTripBookings, not saveBooking", async () => {
    await POST(makeRequest())
    expect(saveRoundTripBookings).toHaveBeenCalledTimes(1)
    expect(saveBooking).not.toHaveBeenCalled()
    expect(buildBookingRows).toHaveBeenCalledTimes(1)
  })

  it("RT-02: saveRoundTripBookings receives outbound + return rows from buildBookingRows", async () => {
    await POST(makeRequest())
    const [outArg, retArg] = (saveRoundTripBookings as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(outArg).toEqual(expect.objectContaining({ booking_reference: 'PRG-20260415-ABCDEF', leg: 'outbound' }))
    expect(retArg).toEqual(expect.objectContaining({ booking_reference: 'PRG-20260417-DEF456', leg: 'return' }))
  })

  it("RT-03: on fresh insert, sendRoundTripClientConfirmation + sendRoundTripManagerAlert fire exactly once", async () => {
    await POST(makeRequest())
    expect(sendRoundTripClientConfirmation).toHaveBeenCalledTimes(1)
    expect(sendRoundTripManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
  })

  it("RT-04: idempotent retry (saveRoundTripBookings returns null) → no emails", async () => {
    ;(saveRoundTripBookings as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(sendRoundTripClientConfirmation).not.toHaveBeenCalled()
    expect(sendRoundTripManagerAlert).not.toHaveBeenCalled()
  })

  it("RT-05: non-idempotency RPC error → sendEmergencyAlert fires, no client email", async () => {
    ;(saveRoundTripBookings as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('create_round_trip_bookings RPC failed: relation does not exist')
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(sendEmergencyAlert).toHaveBeenCalledTimes(1)
    expect((sendEmergencyAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('PRG-20260415-ABCDEF')
    expect(sendRoundTripClientConfirmation).not.toHaveBeenCalled()
  })

  it("RT-06: ICS built with 2 IcsEvents and passed as 2nd arg to sendRoundTripClientConfirmation", async () => {
    await POST(makeRequest())
    expect(buildIcs).toHaveBeenCalledTimes(1)
    const icsArg = (buildIcs as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(Array.isArray(icsArg)).toBe(true)
    expect(icsArg).toHaveLength(2)
    // Assert Plan 27-01 IcsEvent shape: date + time fields (not start/startTime)
    expect(icsArg[0]).toEqual(expect.objectContaining({
      date: expect.any(String), time: expect.any(String),
      uid: expect.stringContaining('PRG-20260415-ABCDEF'),
      summary: expect.any(String), description: expect.any(String), location: expect.any(String),
    }))
    expect(icsArg[1].uid).toContain('PRG-20260417-DEF456')
    // The ICS body is passed as the second arg to sendRoundTripClientConfirmation
    const [, icsBody] = (sendRoundTripClientConfirmation as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(icsBody).toBe('STUB-ICS')
  })

  it("RT-07: charge.refunded FULL on round-trip PI cancels BOTH rows via bulk update", async () => {
    const chain = mockFromChain(ROUND_TRIP_ROWS)
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          amount: 658500,
          amount_refunded: 658500, // FULL
          refunded: true,
          payment_intent: 'pi_test_rt',
          refunds: { data: [{ id: 're_1', amount: 658500, metadata: {} }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    // One update call with {status: 'cancelled'}, .eq('payment_intent_id', 'pi_test_rt')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(chain.updateEq).toHaveBeenCalledWith('payment_intent_id', 'pi_test_rt')
  })

  it("RT-08: partial refund with metadata.leg=return → only return row cancelled", async () => {
    const chain = mockFromChain(ROUND_TRIP_ROWS)
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          amount: 658500,
          amount_refunded: 315000,
          refunded: true,
          payment_intent: 'pi_test_rt',
          refunds: { data: [{ id: 're_1', amount: 315000, metadata: { leg: 'return' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    // Update scoped to the return row id
    expect(chain.updateEq).toHaveBeenCalledWith('id', 'uuid-ret')
    // Outbound row NOT touched
    expect(chain.updateEq).not.toHaveBeenCalledWith('id', 'uuid-out')
  })

  it("RT-09: partial refund without metadata → amount-matching identifies outbound leg", async () => {
    // outbound_amount_czk=3500, return_amount_czk=3150; pre-promo combined 6650
    // charged 6585 CZK (post-promo); ratio 6585/6650 = 0.99023
    // effective outbound = round(3500 * 0.99023) = 3466
    // Refund 3466 CZK (346600 hellers) → exact match on outbound, ±0 within ±2 CZK tolerance
    const chain = mockFromChain(ROUND_TRIP_ROWS)
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          amount: 658500,
          amount_refunded: 346600,
          refunded: true,
          payment_intent: 'pi_test_rt',
          refunds: { data: [{ id: 're_1', amount: 346600, metadata: {} }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(chain.updateEq).toHaveBeenCalledWith('id', 'uuid-out')
    expect(chain.updateEq).not.toHaveBeenCalledWith('id', 'uuid-ret')
  })

  it("RT-10: one-way charge.refunded (single row) cancels the single row — regression guard", async () => {
    const chain = mockFromChain(ONE_WAY_ROWS)
    stripeStub.constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          amount: 250000,
          amount_refunded: 250000,
          refunded: true,
          payment_intent: 'pi_test_oneway',
          refunds: { data: [{ id: 're_1', amount: 250000, metadata: {} }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(chain.updateEq).toHaveBeenCalledWith('id', 'uuid-single')
  })
})
