// @vitest-environment node
/**
 * Phase 92 plan 04 (D-18, QUOTE-03, T-92-15): the Stripe vocabulary of quotes.
 *
 * - quote objects carry a card_ kind, so the legacy webhook chain (which builds a BOOKING from a
 *   payment_intent.succeeded) never sees them;
 * - their metadata holds ids only, never cofBookingId / bookingId / groupBookingIds;
 * - idempotency keys are deterministic and carry no amount, except the refund key;
 * - the quote consent version is in EXTRAS_CONSENT_VERSIONS (research A12).
 */
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/payments/state', () => ({ appendPaymentEvent: vi.fn() }))
vi.mock('@/lib/stripe-webhook/card-confirm', () => ({
  handleHoldNowAuthorized: vi.fn(),
  handleSetupFailed: vi.fn(),
  handleSetupSucceeded: vi.fn(),
}))
vi.mock('@/lib/stripe-webhook/charge-events', () => ({
  handleCardChargeFailed: vi.fn(),
  handleCardChargeSucceeded: vi.fn(),
}))
vi.mock('@/lib/stripe-webhook/hold-events', () => ({
  handleHoldAuthorized: vi.fn(),
  handleHoldCanceled: vi.fn(),
  handleHoldFailed: vi.fn(),
}))
vi.mock('@/lib/stripe-webhook/recovery-events', () => ({
  cardBookingIdForPaymentIntent: vi.fn(),
  handleDispute: vi.fn(),
  handleRecoveryPaid: vi.fn(),
}))

import { quoteMetadata, stripeKeys } from '@/lib/payments/stripe'
import { QUOTE_CONSENT_VERSION, consentCoversExtras } from '@/lib/payments/consent-text'
import { classifyPaymentEvent } from '@/lib/stripe-webhook/dispatch'

const FORBIDDEN_KEYS = ['cofBookingId', 'bookingId', 'groupBookingIds']

describe('quoteMetadata', () => {
  it('deposit: exactly kind + the ids, all strings, none of the booking keys', () => {
    const meta = quoteMetadata('card_quote_deposit', {
      quoteId: 'q1',
      versionId: 'v1',
      quoteReference: 'Q-2026-0001',
      acceptanceId: 'a1',
    })
    expect(meta).toEqual({
      kind: 'card_quote_deposit',
      quoteId: 'q1',
      versionId: 'v1',
      quoteReference: 'Q-2026-0001',
      acceptanceId: 'a1',
    })
    for (const v of Object.values(meta)) expect(typeof v).toBe('string')
    for (const k of FORBIDDEN_KEYS) expect(meta).not.toHaveProperty(k)
  })

  it('remainder: the attempt is carried as a string, a missing acceptanceId adds no key', () => {
    const meta = quoteMetadata('card_quote_remainder', {
      quoteId: 'q1',
      versionId: 'v1',
      quoteReference: 'Q-2026-0001',
      attempt: 2,
    })
    expect(meta).toEqual({
      kind: 'card_quote_remainder',
      quoteId: 'q1',
      versionId: 'v1',
      quoteReference: 'Q-2026-0001',
      attempt: '2',
    })
    for (const k of FORBIDDEN_KEYS) expect(meta).not.toHaveProperty(k)
  })

  it('null acceptanceId / attempt add no key', () => {
    const meta = quoteMetadata('card_quote_deposit', {
      quoteId: 'q1',
      versionId: 'v1',
      quoteReference: 'Q-1',
      acceptanceId: null,
      attempt: null,
    })
    expect(Object.keys(meta).sort()).toEqual(['kind', 'quoteId', 'quoteReference', 'versionId'])
  })
})

describe('quote idempotency keys', () => {
  it('produce the documented strings', () => {
    expect(stripeKeys.quoteCustomer('q1')).toBe('cus:quote:q1')
    expect(stripeKeys.quoteDeposit('v1', 'a1')).toBe('qdep:v1:a1')
    expect(stripeKeys.quoteDepositVoid('pi_1')).toBe('qdep_void:pi_1')
    expect(stripeKeys.quoteRemainder('q1', 3)).toBe('qrem:q1:3')
    expect(stripeKeys.quoteRemainderVoid('pi_2')).toBe('qrem_void:pi_2')
    expect(stripeKeys.quoteRefund('q1', 'deposit:5000')).toBe('refund:quote:q1:deposit:5000')
    expect(stripeKeys.quoteRefund('q1', 'orphan:pi_3')).toBe('refund:quote:q1:orphan:pi_3')
  })

  it('only the refund key takes a purpose (and so an amount); the others are id + counter only', () => {
    expect(stripeKeys.quoteCustomer.length).toBe(1)
    expect(stripeKeys.quoteDeposit.length).toBe(2)
    expect(stripeKeys.quoteDepositVoid.length).toBe(1)
    expect(stripeKeys.quoteRemainder.length).toBe(2)
    expect(stripeKeys.quoteRemainderVoid.length).toBe(1)
    expect(stripeKeys.quoteRefund.length).toBe(2)
  })
})

function eventOf(type: string, kind: string): Stripe.Event {
  return {
    id: 'evt_1',
    type,
    data: { object: { id: 'pi_1', metadata: { kind, quoteId: 'q1', versionId: 'v1' } } },
  } as unknown as Stripe.Event
}

describe('classifyPaymentEvent of quote objects (T-92-15)', () => {
  it.each(['card_quote_deposit', 'card_quote_remainder'])(
    '%s: every payment event is a card event, never null (null would send it to the legacy booking chain)',
    (kind) => {
      for (const type of [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'payment_intent.amount_capturable_updated',
      ]) {
        const c = classifyPaymentEvent(eventOf(type, kind))
        expect(c, `${kind} ${type}`).not.toBeNull()
      }
    },
  )

  it.each([
    ['card_quote_deposit', 'quote_deposit_paid'],
    ['card_quote_remainder', 'unrouted'],
  ])(
    '%s: payment_intent.succeeded is routed to %s (the deposit by 92-31; the remainder stays unrouted until plan 92-23 adds its route)',
    (kind, route) => {
      expect(classifyPaymentEvent(eventOf('payment_intent.succeeded', kind))?.route).toBe(route)
    },
  )
})

describe('QUOTE_CONSENT_VERSION', () => {
  it('is quote-2026-11-1 and covers extras; unknown versions still do not', () => {
    expect(QUOTE_CONSENT_VERSION).toBe('quote-2026-11-1')
    expect(consentCoversExtras('quote-2026-11-1')).toBe(true)
    expect(consentCoversExtras('quote-2026-11-2')).toBe(false)
  })
})
