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

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } },
  }
})

// Mock lib/supabase — includes the new reconcileBookingByIdToConfirmed spy
// (ANEW-04, Pattern 3) alongside the existing exports the route imports.
vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn().mockResolvedValue([{ id: 'new-booking-uuid' }]),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'PRG-20260330-1234', booking_type: 'confirmed', leg: 'outbound' }),
  buildBookingRows: vi.fn().mockReturnValue({
    outbound: { booking_reference: 'PRG-20260415-ABCDEF', leg: 'outbound', booking_type: 'confirmed' },
    return:   { booking_reference: 'PRG-20260417-DEF456', leg: 'return',   booking_type: 'confirmed' },
  }),
  saveRoundTripBookings: vi.fn().mockResolvedValue({ outbound_id: 'uuid-out', return_id: 'uuid-ret' }),
  reconcileBookingToConfirmed: vi.fn().mockResolvedValue([]),
  reconcileRoundTripToConfirmed: vi.fn().mockResolvedValue([]),
  // Phase 64 ANEW-04: new export. Not yet implemented — this Wave-0 test file
  // asserts the CONTRACT the Task 2 implementation must satisfy.
  reconcileBookingByIdToConfirmed: vi.fn().mockResolvedValue([]),
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
  sendRoundTripClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRoundTripManagerAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ics', () => ({
  buildIcs: vi.fn().mockReturnValue('STUB-ICS'),
}))

vi.mock('@/lib/qstash', () => ({
  scheduleQStashReminder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/analytics-server', () => ({
  sendGa4Purchase: vi.fn().mockResolvedValue(true),
}))

vi.mock('stripe', () => {
  return {
    default: function MockStripe() {
      return {
        webhooks: stripeStub,
      }
    },
  }
})

import { reconcileBookingByIdToConfirmed } from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'
import { POST } from '@/app/api/webhooks/stripe/route'

function makeRequest(body = 'raw-body', sig = 'valid-sig'): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': sig },
    body,
  })
}

// Reconciled row shape — the full `bookings` row returned by `.select('*')`
// (Pattern 3), used to build BookingEmailData without a second SELECT.
const RECONCILED_ROW = {
  id: 'booking-uuid-1',
  booking_reference: 'PRG-20260501-ABCD',
  trip_type: 'transfer',
  origin_address: 'Prague Airport',
  destination_address: 'Hotel Alcron',
  pickup_date: '2026-05-01',
  pickup_time: '10:00',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 1,
  amount_czk: 1500,
  amount_eur: 60,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
  flight_number: null,
  terminal: null,
  special_requests: null,
  pickup_utc: '2026-05-01T08:00:00Z',
  status: 'confirmed',
  payment_intent_id: 'pi_link_123',
}

// A checkout.session.completed event's data.object is a Checkout Session, NOT
// a PaymentIntent — session.metadata is what carries bookingId (Pitfall 1).
// session.payment_intent is a bare id string here (the common webhook shape
// unless `expand: ['payment_intent']` was requested at retrieval time).
const mockCheckoutSession = {
  id: 'cs_test_123',
  payment_status: 'paid',
  payment_intent: 'pi_link_123',
  metadata: {
    bookingId: 'booking-uuid-1',
  },
}

// Phase 64 Plan 02 (T-64-03): the sibling leg of a round-trip pair, reconciled
// with the SAME payment_intent_id as the primary — a fresh capture-time pair
// carries a stale/abandoned payment_intent_id that gets overwritten by
// reconcileBookingByIdToConfirmed's UPDATE (mirrors RECONCILED_ROW's shape).
const RECONCILED_SIBLING_ROW = {
  id: 'booking-uuid-2',
  booking_reference: 'PRG-20260503-EFGH',
  trip_type: 'round_trip',
  origin_address: 'Hotel Alcron',
  destination_address: 'Prague Airport',
  pickup_date: '2026-05-03',
  pickup_time: '10:00',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 1,
  amount_czk: 1500,
  amount_eur: 60,
  client_first_name: 'Jan',
  client_last_name: 'Novak',
  client_email: 'jan@example.com',
  client_phone: '+420600123456',
  flight_number: null,
  terminal: null,
  special_requests: null,
  pickup_utc: '2026-05-03T08:00:00Z',
  status: 'confirmed',
  payment_intent_id: 'pi_link_123',
}

const mockRoundTripCheckoutSession = {
  ...mockCheckoutSession,
  metadata: {
    bookingId: 'booking-uuid-1',
    linkedBookingId: 'booking-uuid-2',
  },
}

beforeEach(() => {
  vi.clearAllMocks()

  stripeStub.constructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: { object: mockCheckoutSession },
  })

  ;(reconcileBookingByIdToConfirmed as ReturnType<typeof vi.fn>).mockResolvedValue([RECONCILED_ROW])
  ;(sendClientConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendManagerAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(scheduleQStashReminder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(sendGa4Purchase as ReturnType<typeof vi.fn>).mockResolvedValue(true)

  // Default: stripe_processed_events read-check finds nothing (not a duplicate);
  // insert() claim succeeds.
  supabaseServiceStub.from.mockImplementation((table: string) => {
    if (table === 'stripe_processed_events') {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const eq = vi.fn().mockReturnValue({ maybeSingle })
      const select = vi.fn().mockReturnValue({ eq })
      return { select, insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    const selectEq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq: selectEq })
    return { select }
  })
})

describe('checkout.session.completed webhook (ANEW-04, T-64-02/03)', () => {
  it('(a) fresh unpaid->confirmed reconcile fires client/manager/GA4 side-effects exactly once and schedules the QStash reminder', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ received: true })

    // Reconcile is keyed on session.metadata.bookingId + the PaymentIntent id
    // read from session.payment_intent — never from a PaymentIntent object's
    // own metadata (Pitfall 1: that field is not even present on this mock).
    expect(reconcileBookingByIdToConfirmed).toHaveBeenCalledWith('booking-uuid-1', 'pi_link_123')

    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    const emailArg = (sendClientConfirmation as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emailArg.bookingReference).toBe('PRG-20260501-ABCD')
    expect(emailArg.email).toBe('jan@example.com')

    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
    expect(scheduleQStashReminder).toHaveBeenCalledWith('booking-uuid-1', expect.any(Number))
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
  })

  it('(b) duplicate event delivery short-circuits on the stripe_processed_events read-check — reconcile never called, no double email', async () => {
    supabaseServiceStub.from.mockImplementation((table: string) => {
      if (table === 'stripe_processed_events') {
        const maybeSingle = vi.fn().mockResolvedValue({ data: { event_id: 'evt_dup' }, error: null })
        const eq = vi.fn().mockReturnValue({ maybeSingle })
        const select = vi.fn().mockReturnValue({ eq })
        return { select, insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { select: vi.fn() }
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ received: true, duplicate: true })

    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
  })

  it('(c) session.payment_status !== "paid" no-ops — defense in depth for delayed payment methods', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { ...mockCheckoutSession, payment_status: 'unpaid' } },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
  })

  it('(d) already-confirmed row (reconcile returns []) fires zero side-effects', async () => {
    ;(reconcileBookingByIdToConfirmed as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()
  })

  it('(e) missing bookingId in session.metadata no-ops without throwing', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { ...mockCheckoutSession, metadata: {} } },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
  })

  // ── Phase 64 Plan 02 (T-64-03): round-trip linkedBookingId reconciliation ──

  it('(f) linkedBookingId present reconciles BOTH primary and sibling rows with the same payment_intent_id, fires side-effects exactly once', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: mockRoundTripCheckoutSession },
    })
    ;(reconcileBookingByIdToConfirmed as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([RECONCILED_ROW])
      .mockResolvedValueOnce([RECONCILED_SIBLING_ROW])

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(reconcileBookingByIdToConfirmed).toHaveBeenCalledTimes(2)
    expect(reconcileBookingByIdToConfirmed).toHaveBeenNthCalledWith(1, 'booking-uuid-1', 'pi_link_123')
    expect(reconcileBookingByIdToConfirmed).toHaveBeenNthCalledWith(2, 'booking-uuid-2', 'pi_link_123')

    // ONE combined confirmation for the pair — never two client emails.
    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)

    // QStash reminder fires PER reconciled leg with a pickup_utc — both legs here.
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(2)
    expect(scheduleQStashReminder).toHaveBeenCalledWith('booking-uuid-1', expect.any(Number))
    expect(scheduleQStashReminder).toHaveBeenCalledWith('booking-uuid-2', expect.any(Number))
  })

  it('(g) linkedBookingId pair already confirmed (both reconcile calls return []) fires zero side-effects', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: mockRoundTripCheckoutSession },
    })
    ;(reconcileBookingByIdToConfirmed as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(reconcileBookingByIdToConfirmed).toHaveBeenCalledTimes(2)
    expect(sendClientConfirmation).not.toHaveBeenCalled()
    expect(sendManagerAlert).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()
  })

  it('(h) only the sibling newly reconciles (primary already confirmed) — side-effects still fire once, sourced from the reconciled row', async () => {
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: mockRoundTripCheckoutSession },
    })
    ;(reconcileBookingByIdToConfirmed as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // primary already confirmed (Stripe retry)
      .mockResolvedValueOnce([RECONCILED_SIBLING_ROW])

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    const emailArg = (sendClientConfirmation as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emailArg.bookingReference).toBe('PRG-20260503-EFGH')
    expect(sendManagerAlert).toHaveBeenCalledTimes(1)
  })

  it('(i) duplicate delivery of a round-trip event short-circuits before any reconcile call', async () => {
    supabaseServiceStub.from.mockImplementation((table: string) => {
      if (table === 'stripe_processed_events') {
        const maybeSingle = vi.fn().mockResolvedValue({ data: { event_id: 'evt_dup_rt' }, error: null })
        const eq = vi.fn().mockReturnValue({ maybeSingle })
        const select = vi.fn().mockReturnValue({ eq })
        return { select, insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { select: vi.fn() }
    })
    stripeStub.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: mockRoundTripCheckoutSession },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ received: true, duplicate: true })

    expect(reconcileBookingByIdToConfirmed).not.toHaveBeenCalled()
    expect(sendClientConfirmation).not.toHaveBeenCalled()
  })
})
