// Open a fee case that failed to open (Phase 89 money review WR-02).
//
// A case is opened right after the status change, in the same request. When that step fails the status stands, the operator
// is alerted and the booking would otherwise have nothing to charge or waive. openMissingFeeCase rebuilds the case from what
// is stored: nothing comes from the request. It never moves money and never decides a fee, it only puts the decision back in
// front of a person (D-05, D-13, D-15).
//
//   no_show     a case is always due: the status is the operator's own confirmation;
//   cancelled   only when the terms the booking was made under say the cancel was late at the logged cancel time, and it
//               was not cancelled by Prestigo, which is always free (D-20). This action can not turn a free cancel into a fee.

import { evaluateCancellation, policyFromSnapshot, proposedFeeMinor, tripFactsFromRow } from '@/lib/cancellation-policy'
import { allowedPaymentActions } from '@/lib/payments/actions'
import { feeBaseNow, isFeeEligible, loadFeeCase, openFeeCase } from '@/lib/payments/fee'
import { paymentEventRecorded, type LedgerActor } from '@/lib/payments/state'
import { getNoShowThresholds, isAirportPickup } from '@/lib/no-show-wait'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

export type OpenMissingCaseResult = 'opened' | 'exists' | 'not_allowed' | 'busy'

/** When the booking was cancelled, from the status log. Null when the log has no such row. */
async function cancelledAtMs(bookingId: string): Promise<number | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_status_log')
    .select('created_at')
    .eq('booking_id', bookingId)
    .eq('to_status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error('status log read failed')
  const at = Array.isArray(data) && data[0] ? Date.parse(String((data[0] as { created_at?: unknown }).created_at)) : NaN
  return Number.isFinite(at) ? at : null
}

/** True when the operator recorded the cancel as Prestigo's own. */
async function cancelledByPrestigo(bookingId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('error_code')
    .eq('booking_id', bookingId)
    .eq('event_key', `admin:cancel:${bookingId}`)
    .limit(1)
  if (error) throw new Error('ledger read failed')
  return Array.isArray(data) && (data[0] as { error_code?: unknown } | undefined)?.error_code === 'cancel_prestigo'
}

/**
 * A closed pay-now row whose fee case failed to open: the case_missing alert of its cancel or no-show is the marker. Any other
 * closed pay-now row was refunded or holds nothing, and offering a fee there would only be noise (money review 2, IN-01).
 */
export async function payNowCaseMissing(booking: BookingRow): Promise<boolean> {
  const bookingId = typeof booking.id === 'string' ? booking.id : ''
  if (!bookingId || booking.payment_mode !== 'pay_now' || booking.fee_case_status || !isFeeEligible(booking)) return false
  const key =
    booking.status === 'cancelled'
      ? `alert:fee_decision_needed:${bookingId}:case_missing`
      : booking.status === 'no_show'
        ? `alert:fee_no_show_needed:${bookingId}:case_missing`
        : null
  return key !== null && (await paymentEventRecorded(bookingId, key).catch(() => false))
}

/** Whether open_case may run on this row: the action matrix, or a pay-now row's case_missing alert (money review 2, IN-02). */
export async function openCaseOffered(booking: BookingRow): Promise<boolean> {
  if (allowedPaymentActions(booking).includes('open_fee_case')) return true
  return payNowCaseMissing(booking)
}

export async function openMissingFeeCase(booking: BookingRow, actor: LedgerActor): Promise<OpenMissingCaseResult> {
  const bookingId = typeof booking.id === 'string' ? booking.id : ''
  const status = booking.status
  if (!bookingId || (status !== 'cancelled' && status !== 'no_show') || !isFeeEligible(booking)) return 'not_allowed'
  if (await loadFeeCase(bookingId)) return 'exists'

  let base: Awaited<ReturnType<typeof feeBaseNow>>
  try {
    base = await feeBaseNow(booking)
  } catch {
    console.error('[fee] payment could not be read, case not opened', { bookingId })
    return 'busy'
  }
  if (!base) return 'not_allowed'

  if (status === 'no_show') {
    const thresholds = await getNoShowThresholds(createSupabaseServiceClient())
    const airport = isAirportPickup(booking as unknown as Parameters<typeof isAirportPickup>[0])
    await openFeeCase({
      booking,
      kind: 'no_show',
      baseMinor: base.baseMinor,
      currency: base.currency,
      proposedMinor: base.baseMinor,
      evidence: { threshold_min: airport ? thresholds.airportMin : thresholds.cityMin, airport, opened_by_hand: true },
      actor,
    })
    return 'opened'
  }

  const atMs = await cancelledAtMs(bookingId)
  if (atMs === null || (await cancelledByPrestigo(bookingId))) return 'not_allowed'
  const policy = policyFromSnapshot(booking.cancel_policy)
  const facts = tripFactsFromRow(booking as unknown as Parameters<typeof tripFactsFromRow>[0])
  if (!facts) return 'not_allowed'
  const evaluated = evaluateCancellation(policy, facts, atMs)
  if (evaluated.kind === 'free') return 'not_allowed'

  await openFeeCase({
    booking,
    kind: 'late_cancel',
    baseMinor: base.baseMinor,
    currency: base.currency,
    proposedMinor: proposedFeeMinor(base.baseMinor, policy.feePercent),
    freeUntilIso: new Date(evaluated.freeUntilMs).toISOString(),
    evidence: {
      policyVersion: policy.version,
      cancelledMinBeforePickup: Math.round((facts.pickupMs - atMs) / 60_000),
      opened_by_hand: true,
    },
    actor,
  })
  return 'opened'
}
