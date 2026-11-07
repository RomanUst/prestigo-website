'use client'

import { BadgeShell } from './StatusBadge'

// Phase 89 plan 16 (UI-SPEC 4.1 and 5.1): the two list badges of the phase. Both are built on BadgeShell, so
// colour comes only from the --status-* tokens and every badge carries its own text next to the dot (colour is never
// the only signal). No age is shown here: the badge never changes with time, the panel and the reminder email say how
// long a decision has been open.

/** A pending fee decision, red (danger family). Stacked under the booking status badge in the table row and the mobile card. */
export function FeeCaseBadge() {
  return <BadgeShell family="danger" label="Fee decision" />
}

/** A cash booking, neutral family. Shown beside the payment badge wherever a card booking shows its own. */
export function CashChip() {
  return <BadgeShell family="neutral" label="Cash" />
}

/**
 * Whether a row shows the red badge: only a pending case, never a decided one, never a partner (GNet) booking. The
 * list payload carries fee_case_status (a trigger mirror on bookings), so no extra request is needed.
 */
export function hasPendingFeeCase(booking: { fee_case_status?: string | null; booking_source?: string | null }): boolean {
  return booking.fee_case_status === 'pending' && booking.booking_source !== 'gnet'
}
