import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures this runs before vi.mock factories AND before imports
const { paymentLinksCreateStub } = vi.hoisted(() => {
  const create = vi.fn()
  return { paymentLinksCreateStub: { create } }
})

// Mock Stripe — use a constructor function because the module does `new Stripe(...)`,
// mirroring the pattern in tests/webhooks-stripe.test.ts / tests/admin-bookings.test.ts.
vi.mock('stripe', () => {
  const MockStripeDefault = function MockStripe() {
    return { paymentLinks: paymentLinksCreateStub }
  } as unknown as { (...args: unknown[]): unknown; createFetchHttpClient: () => unknown }
  MockStripeDefault.createFetchHttpClient = vi.fn(() => ({}))
  return { default: MockStripeDefault }
})

import { createBookingPaymentLink } from '@/lib/stripe-payment-links'

beforeEach(() => {
  vi.clearAllMocks()
  // Lazy-init guard in lib/stripe-payment-links.ts requires this to be set —
  // the value is never read since the 'stripe' module itself is fully mocked.
  process.env.STRIPE_SECRET_KEY ||= 'sk_test_stub'
  paymentLinksCreateStub.create.mockResolvedValue({
    url: 'https://buy.stripe.com/test_x',
    id: 'plink_123',
  })
})

describe('lib/stripe-payment-links — createBookingPaymentLink (ANEW-02, T-64-01)', () => {
  it('Test 1: returns { url, id } from the Stripe Payment Link create response', async () => {
    const result = await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: null,
    })
    expect(result).toEqual({ url: 'https://buy.stripe.com/test_x', id: 'plink_123' })
  })

  it('Test 2: unit_amount is Math.round(amountEur * 100) — integer cents, currency eur', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60.499,
      leg: null,
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.line_items[0].price_data.currency).toBe('eur')
    expect(args.line_items[0].price_data.unit_amount).toBe(6050) // Math.round(6049.9)
  })

  it('Test 3: metadata carries bookingId and leg on both the link and payment_intent_data', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: 'outbound',
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.metadata).toEqual(expect.objectContaining({ bookingId: 'booking-uuid-1', leg: 'outbound' }))
    expect(args.payment_intent_data.metadata).toEqual(
      expect.objectContaining({ bookingId: 'booking-uuid-1', leg: 'outbound' })
    )
  })

  it('Test 4: leg null is normalized to empty string in metadata', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: null,
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.metadata.leg).toBe('')
  })

  it('Test 5: linkedBookingId, when supplied, is included in both metadata objects', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: 'outbound',
      linkedBookingId: 'booking-uuid-2',
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.metadata.linkedBookingId).toBe('booking-uuid-2')
    expect(args.payment_intent_data.metadata.linkedBookingId).toBe('booking-uuid-2')
  })

  it('Test 6: linkedBookingId, when absent, is not present in metadata at all', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: null,
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.metadata).not.toHaveProperty('linkedBookingId')
  })

  it('Test 7: card-only payment methods and single-use completed_sessions restriction (defense in depth, RESEARCH A3)', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: null,
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.payment_method_types).toEqual(['card'])
    expect(args.restrictions.completed_sessions.limit).toBe(1)
  })

  it('Test 8: product_data.name includes the booking reference', async () => {
    await createBookingPaymentLink({
      bookingId: 'booking-uuid-1',
      bookingReference: 'PRG-20260501-ABCD',
      amountEur: 60,
      leg: null,
    })
    const args = paymentLinksCreateStub.create.mock.calls[0][0]
    expect(args.line_items[0].price_data.product_data.name).toContain('PRG-20260501-ABCD')
  })
})
