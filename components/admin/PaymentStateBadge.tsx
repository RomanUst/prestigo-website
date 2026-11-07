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
  // Phase 89: the driver was paid in cash.
  cash_settled: { label: 'Paid in cash', family: 'ok' },
}

// Phase 89-17 (UI-SPEC 5.1): a cash booking reads its own vocabulary. `card_saved` splits on whether the trip is done:
// "Cash on trip" is neutral, "Cash unconfirmed" is information (info family), never an alarm and never red (D-21).
// Every other cash state falls back to the card labels above where the wording is the same.
const CASH_STATE_BADGE: Partial<Record<PaymentState, { label: string; family: BadgeFamily }>> = {
  checkout_pending: { label: 'Awaiting card', family: 'amber' },
  cash_settled: { label: 'Paid in cash', family: 'ok' },
  captured: { label: 'Card charged', family: 'ok' },
  failed: { label: 'Payment failed', family: 'danger' },
  released: { label: 'Released', family: 'neutral' },
}

export const CASH_MODE = 'cash_guarantee'

function cashBadge(state: string, completed: boolean): { label: string; family: BadgeFamily } | null {
  if (state === 'card_saved') {
    return completed ? { label: 'Cash unconfirmed', family: 'info' } : { label: 'Cash on trip', family: 'neutral' }
  }
  return Object.prototype.hasOwnProperty.call(CASH_STATE_BADGE, state) ? (CASH_STATE_BADGE[state as PaymentState] ?? null) : null
}

export function PaymentStateBadge({ state, mode, completed = false }: { state: string; mode?: string | null; completed?: boolean }) {
  const cash = mode === CASH_MODE ? cashBadge(state, completed) : null
  const known = Object.prototype.hasOwnProperty.call(PAYMENT_STATE_BADGE, state)
    ? PAYMENT_STATE_BADGE[state as PaymentState]
    : null
  const shown = cash ?? known
  // Defensive fallback: an unknown state shows its raw value in the neutral family, never throws.
  return <BadgeShell family={shown?.family ?? 'neutral'} label={shown?.label ?? state} />
}

/** UI-SPEC 5.1: a neutral "Cash" chip beside the state badge of every cash booking. */
export function CashChip() {
  return <BadgeShell family="neutral" label="Cash" />
}

// D-20: separate badge, any payment mode (booking cancelled but the refund did not go through).
export function RefundFailedBadge() {
  return <BadgeShell family="danger" label="Refund failed" />
}
