// The money facts of a pay-now booking (Phase 89 review, money CR-01 to CR-03).
//
// A pay-now row does not know what was paid: it stores neither payment_currency nor payment_amount_minor, the client may
// have paid in CZK, a promo or a trip edit moves amount_eur away from the charge, and one PaymentIntent pays for BOTH rows
// of a round trip (the outbound row's amount_eur is the combined total, the return row's is NULL). So every decision about
// pay-now money reads the PaymentIntent: its currency, what it received and what was refunded from it.
//
// A row pays for a leg when it shares its PaymentIntent with a sibling row. linked_booking_id is NOT used: no insert path in
// this repo writes it (buildRoundTripBookings, create_round_trip_bookings), so the sibling is found through the shared
// payment_intent_id, as app/api/admin/bookings/[id]/payment-link/route.ts does. A leg's share is its part of what was
// actually paid, the same split as the checkout preview (app/api/card-checkout/init/route.ts): the two shares always add
// up to the payment, also with a promo, so the two legs can never promise more than Stripe holds.
//
// Read only: nothing here writes a row or moves money. Server-only by use.

import type Stripe from 'stripe'
import { getPaymentsStripe } from '@/lib/payments/stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

export type PaymentLeg = 'outbound' | 'return'
export type PayNowCurrency = 'eur' | 'czk'

/** One refund of a PaymentIntent that took (or will take) money back. Failed and canceled refunds are left out. */
export interface PaymentRefund {
  id: string
  amountMinor: number
  /** metadata.leg: outbound | return, null for a refund nobody tagged (the Stripe Dashboard). */
  leg: PaymentLeg | null
  /** metadata.fee_case: the case that decided this refund. */
  feeCase: string | null
}

/** Which part of the payment a row stands for. leg null: the row is the only one and owns the whole payment. */
export interface PayNowSplit {
  leg: PaymentLeg | null
  outboundCzk: number | null
  returnCzk: number | null
}

export interface PayNowFacts {
  paymentIntentId: string
  currency: PayNowCurrency
  /** What the PaymentIntent received, in minor units of `currency`. 0 while it is not paid (an abandoned checkout). */
  paidMinor: number
  leg: PaymentLeg | null
  /** This row's part of paidMinor: all of it for a one-row payment, the leg's share of a two-row payment. */
  shareMinor: number
  /** Refunded against this row: refunds of its leg and untagged ones (never promise money a hand refund already returned). */
  refundedMinor: number
  /** Money still held for this row: what a refund can return and the most a fee can keep. Never above what Stripe can refund. */
  collectedMinor: number
  refunds: PaymentRefund[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** The leg column of a row, when it names one. */
export function rowLeg(booking: BookingRow): PaymentLeg | null {
  return booking.leg === 'outbound' || booking.leg === 'return' ? booking.leg : null
}

/**
 * A leg's share of what was paid, in the payment's minor units. The outbound share is rounded and the return share is the
 * rest, so the two always add up to `paidMinor`. Null when the leg amounts can not split it.
 */
export function legShareMinor(
  paidMinor: number,
  outboundCzk: number | null,
  returnCzk: number | null,
  leg: PaymentLeg,
): number | null {
  if (outboundCzk === null || returnCzk === null || outboundCzk < 0 || returnCzk < 0) return null
  const total = outboundCzk + returnCzk
  if (total <= 0) return null
  const outbound = Math.round((paidMinor * outboundCzk) / total)
  return leg === 'outbound' ? outbound : paidMinor - outbound
}

/**
 * Which part of its PaymentIntent a row stands for, from the row and the shared payment_intent_id. Throws on a database
 * problem: a guess here could refund the whole payment for one leg. 'leg_amount_missing': the row shares its payment with a
 * sibling, but the leg amounts are not there to split it.
 */
export async function resolvePayNowSplit(booking: BookingRow): Promise<PayNowSplit | 'leg_amount_missing'> {
  const paymentIntentId = str(booking.payment_intent_id)
  const leg = rowLeg(booking)
  const outboundCzk = num(booking.outbound_amount_czk)
  const returnCzk = num(booking.return_amount_czk)
  const whole: PayNowSplit = { leg: null, outboundCzk: null, returnCzk: null }
  if (!paymentIntentId || !leg) return whole

  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select('id')
    .eq('payment_intent_id', paymentIntentId)
    .neq('id', str(booking.id))
  if (error) throw new Error('sibling lookup failed')
  const hasSibling = Array.isArray(data) && data.length > 0

  const splittable = legShareMinor(100, outboundCzk, returnCzk, leg) !== null
  if (hasSibling) return splittable ? { leg, outboundCzk, returnCzk } : 'leg_amount_missing'
  // A round trip whose other row is gone still only owns its leg; a one-way row always writes leg 'outbound'.
  return booking.trip_type === 'round_trip' && splittable ? { leg, outboundCzk, returnCzk } : whole
}

/** The refunds of a PaymentIntent that count (a failed or canceled refund gave nothing back). Newest first. */
export async function listPaymentRefunds(paymentIntentId: string): Promise<PaymentRefund[]> {
  const list = await getPaymentsStripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 })
  return (list.data as Stripe.Refund[])
    .filter((r) => r.status !== 'failed' && r.status !== 'canceled')
    .map((r) => ({
      id: r.id,
      amountMinor: r.amount,
      leg: r.metadata?.leg === 'outbound' || r.metadata?.leg === 'return' ? r.metadata.leg : null,
      feeCase: typeof r.metadata?.fee_case === 'string' && r.metadata.fee_case ? r.metadata.fee_case : null,
    }))
}

/**
 * Read the facts of a pay-now row from Stripe. Throws when Stripe can not be read or the payment can not be split: the
 * caller decides what that means (a cancel stands and alerts, a fee decision asks the operator to try again).
 */
export async function loadPayNowFacts(booking: BookingRow, known?: PayNowSplit): Promise<PayNowFacts> {
  const paymentIntentId = str(booking.payment_intent_id)
  if (!paymentIntentId) throw new Error('no_payment_intent')
  const split = known ?? (await resolvePayNowSplit(booking))
  if (split === 'leg_amount_missing') throw new Error('leg_amount_missing')

  const pi = (await getPaymentsStripe().paymentIntents.retrieve(paymentIntentId)) as Stripe.PaymentIntent
  const currency = pi.currency === 'czk' ? 'czk' : pi.currency === 'eur' ? 'eur' : null
  if (!currency) throw new Error('unsupported_currency')

  const paidMinor = pi.status === 'succeeded' ? pi.amount_received : 0
  const refunds = paidMinor > 0 ? await listPaymentRefunds(paymentIntentId) : []
  const shareMinor = split.leg ? (legShareMinor(paidMinor, split.outboundCzk, split.returnCzk, split.leg) ?? 0) : paidMinor
  const refundedAll = refunds.reduce((sum, r) => sum + r.amountMinor, 0)
  const refundedMinor = split.leg
    ? refunds.filter((r) => r.leg === split.leg || r.leg === null).reduce((sum, r) => sum + r.amountMinor, 0)
    : refundedAll

  return {
    paymentIntentId,
    currency,
    paidMinor,
    leg: split.leg,
    shareMinor,
    refundedMinor,
    collectedMinor: Math.max(0, Math.min(shareMinor - refundedMinor, paidMinor - refundedAll)),
    refunds,
  }
}
