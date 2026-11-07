// The money facts of a pay-now booking (Phase 89 review, money CR-01 to CR-03).
//
// A pay-now row does not know what was paid: it stores neither payment_currency nor payment_amount_minor, the client may
// have paid in CZK, a promo or a trip edit moves amount_eur away from the charge, and one PaymentIntent pays for BOTH rows
// of a round trip (the outbound row's amount_eur is the combined total, the return row's is NULL). So every decision about
// pay-now money reads the PaymentIntent: its currency, what it received and what was refunded from it.
//
// A round_trip row pays for a leg when it shares its PaymentIntent with a sibling round_trip row. linked_booking_id is NOT used: no insert path in
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
  /**
   * Refunded against this row: refunds tagged with its leg, and untagged ones whose amount names this leg alone (money review 2,
   * WR-03: an untagged refund is attributed once, never to both legs). A one-row payment: every refund.
   */
  refundedMinor: number
  /**
   * Untagged refunds of a two-row payment that name no single leg (a goodwill amount, two equal legs). They lower only what
   * Stripe still holds for the trip as a whole, so whichever leg is decided last gets less than its share.
   */
  unattributedMinor: number
  /**
   * How much of this leg's share it can not be given because of unattributed refunds (0 when none). Above 0 the operator is
   * told: only a person can say which leg the Dashboard refund was for.
   */
  shortMinor: number
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
  // Only a round trip has legs. Every other row owns its payment whole: a one-way row always writes leg 'outbound', and rows
  // that share one Stripe payment for another reason (a group payment link, metadata.groupBookingIds) are never two legs.
  if (!paymentIntentId || !leg || booking.trip_type !== 'round_trip') return whole

  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select('id')
    .eq('payment_intent_id', paymentIntentId)
    .eq('trip_type', 'round_trip')
    .neq('id', str(booking.id))
  if (error) throw new Error('sibling lookup failed')
  const hasSibling = Array.isArray(data) && data.length > 0

  const splittable = legShareMinor(100, outboundCzk, returnCzk, leg) !== null
  if (hasSibling) return splittable ? { leg, outboundCzk, returnCzk } : 'leg_amount_missing'
  // A round trip whose other row is gone still only owns its leg.
  return splittable ? { leg, outboundCzk, returnCzk } : whole
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
  const refundedAll = refunds.reduce((sum, r) => sum + r.amountMinor, 0)
  if (!split.leg) {
    return {
      paymentIntentId,
      currency,
      paidMinor,
      leg: null,
      shareMinor: paidMinor,
      refundedMinor: refundedAll,
      unattributedMinor: 0,
      shortMinor: 0,
      collectedMinor: Math.max(0, paidMinor - refundedAll),
      refunds,
    }
  }

  const shareOf = (leg: PaymentLeg) => legShareMinor(paidMinor, split.outboundCzk, split.returnCzk, leg) ?? 0
  const shareMinor = shareOf(split.leg)
  let refundedMinor = 0
  let unattributedMinor = 0
  for (const r of refunds) {
    const leg = r.leg ?? attributeUntagged(r.amountMinor, shareOf('outbound'), shareOf('return'))
    if (leg === split.leg) refundedMinor += r.amountMinor
    else if (leg === null) unattributedMinor += r.amountMinor
  }
  // The cap is what Stripe still holds for the whole trip: an unattributed refund lowers it once, for both legs together.
  const own = Math.max(0, shareMinor - refundedMinor)
  const collectedMinor = Math.max(0, Math.min(own, paidMinor - refundedAll))

  return {
    paymentIntentId,
    currency,
    paidMinor,
    leg: split.leg,
    shareMinor,
    refundedMinor,
    unattributedMinor,
    shortMinor: unattributedMinor > 0 ? own - collectedMinor : 0,
    collectedMinor,
    refunds,
  }
}

/**
 * Money review 2, WR-03: the leg an untagged refund (the Stripe Dashboard) was made for, when its amount names one leg alone:
 * it matches that leg's share (within 1%, the CZK/EUR rounding of a hand-typed amount) and not the other's. Anything else is
 * null, never a guess.
 */
export function attributeUntagged(amountMinor: number, outboundShare: number, returnShare: number): PaymentLeg | null {
  const matches = (share: number) => share > 0 && Math.abs(amountMinor - share) <= Math.max(1, Math.round(share * 0.01))
  const outbound = matches(outboundShare)
  const ret = matches(returnShare)
  if (outbound && !ret) return 'outbound'
  if (ret && !outbound) return 'return'
  return null
}
