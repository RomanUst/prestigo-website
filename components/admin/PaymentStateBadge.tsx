'use client'

import { BadgeShell, type BadgeFamily } from './StatusBadge'
import type { PaymentState } from '@/lib/payments/state'

// Phase 88-07 (UI-SPEC Surface 2): payment state -> label + status family. Family tokens exist
// in both themes in admin-theme.css; no colour is defined here. Every state carries its own text
// label, so colour is never the only signal.
export const PAYMENT_STATE_BADGE: Record<PaymentState, { label: string; family: BadgeFamily }> = {
  none: { label: 'No payment', family: 'neutral' },
  checkout_pending: { label: 'Awaiting card', family: 'amber' },
  card_saved: { label: 'Card saved', family: 'info' },
  placing_hold: { label: 'Placing hold', family: 'violet' },
  authorized: { label: 'Hold active', family: 'teal' },
  capturing: { label: 'Capturing', family: 'violet' },
  captured: { label: 'Captured', family: 'ok' },
  balance_due: { label: 'Balance due', family: 'danger' },
  failed: { label: 'Payment failed', family: 'danger' },
  expired: { label: 'Hold expired', family: 'warn' },
  released: { label: 'Released', family: 'neutral' },
}

export function PaymentStateBadge({ state }: { state: string }) {
  const known = Object.prototype.hasOwnProperty.call(PAYMENT_STATE_BADGE, state)
    ? PAYMENT_STATE_BADGE[state as PaymentState]
    : null
  // Defensive fallback: an unknown state shows its raw value in the neutral family, never throws.
  return <BadgeShell family={known?.family ?? 'neutral'} label={known?.label ?? state} />
}

// D-20: separate badge, any payment mode (booking cancelled but the refund did not go through).
export function RefundFailedBadge() {
  return <BadgeShell family="danger" label="Refund failed" />
}
