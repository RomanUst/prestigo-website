'use client'
import { AlertBanner, type BannerSpec } from './paymentParts'
import {
  feeCollection,
  formatPragueFull,
  money,
  percentOf,
  type FeeCaseFacts,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 4.1, D-05, D-13, D-15): the alert banner of a booking with a pending fee case. It stays
// until a person decides (the "Open since" line is the visible age); a decided case shows nothing. Amounts, hours and
// percents are computed from the case row and the payment facts, never typed.

const HOUR_MS = 3_600_000

function evidenceString(evidence: Record<string, unknown>, key: string): string | null {
  const value = evidence[key]
  return typeof value === 'string' && value ? value : null
}

function evidenceNumber(evidence: Record<string, unknown>, key: string): number | null {
  const value = evidence[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The sentence about where the money comes from (hold, no hold, money already paid). */
export function collectionSentence(payment: PaymentSnapshot, feeCase: FeeCaseFacts): string {
  const c = feeCollection(payment, feeCase)
  if (c.kind === 'paid') return `The client paid ${money(c.paidMinor, feeCase.currency)}. Waiving refunds it.`
  if (c.kind === 'hold') {
    const ends = formatPragueFull(c.captureBefore)
    return ends
      ? `The hold ends on ${ends} (Prague time). After that the saved card is charged instead.`
      : 'The saved card is charged if the hold has ended.'
  }
  return 'No hold is on the card. The saved card is charged.'
}

export function feeBannerSpec(payment: PaymentSnapshot, feeCase: FeeCaseFacts): BannerSpec {
  const fee = money(feeCase.proposed_minor, feeCase.currency)
  const openedAt = formatPragueFull(feeCase.opened_at)
  const open = openedAt ? ` Open since ${openedAt}.` : ''

  if (feeCase.kind === 'no_show') {
    const waitMin = evidenceNumber(feeCase.evidence, 'threshold_min')
    const arrived = formatPragueFull(evidenceString(feeCase.evidence, 'on_location_at'))
    const requested = formatPragueFull(evidenceString(feeCase.evidence, 'requested_at'))
    const waited = waitMin !== null ? `The driver waited ${waitMin} minutes at the pick-up point` : 'The driver waited at the pick-up point'
    const times = [arrived ? `arrived ${arrived}` : null, requested ? `no-show requested ${requested}` : null]
      .filter(Boolean)
      .join(', ')
    return {
      family: 'danger',
      title: 'No-show: fee decision needed',
      body: `${waited}${times ? ` (${times})` : ''}. Proposed fee: ${fee}.${open}`,
      extra: collectionSentence(payment, feeCase),
    }
  }

  const freeUntil = formatPragueFull(feeCase.free_until)
  const pickupMs = payment.pickup_at ? new Date(payment.pickup_at).getTime() : NaN
  const openedMs = new Date(feeCase.opened_at).getTime()
  const hours = Number.isNaN(pickupMs) || Number.isNaN(openedMs) ? null : Math.max(0, Math.floor((pickupMs - openedMs) / HOUR_MS))
  const when = hours !== null ? `The client cancelled ${hours} h before pickup` : 'The client cancelled'
  const free = freeUntil ? `, after the free period ended on ${freeUntil}` : ', after the free period'
  const percent = percentOf(feeCase.proposed_minor, feeCase.base_minor)
  return {
    family: 'danger',
    title: 'Late cancellation: fee decision needed',
    body: `${when}${free}. Proposed fee: ${fee} (${percent}% of the fare).${open}`,
    extra: collectionSentence(payment, feeCase),
  }
}

export function FeeDecisionBanner({ payment, feeCase }: { payment: PaymentSnapshot; feeCase: FeeCaseFacts | null | undefined }) {
  if (!feeCase || feeCase.status !== 'pending') return null
  return (
    <div data-testid="fee-decision-banner">
      <AlertBanner spec={feeBannerSpec(payment, feeCase)} />
    </div>
  )
}
