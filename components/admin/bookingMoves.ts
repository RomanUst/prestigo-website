import { isPartnerBooking } from '@/lib/booking-status'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import type { PaymentCurrency } from '@/lib/payments/money'

// Phase 90 plan 04 (DISP-02): the one pure planner that decides what a status move means.
// Every surface (board drag, card menu, detail panel select) asks planMove first, so a drop or
// a menu choice can never capture, refund, charge a fee or mark a no-show without the operator
// seeing a dialog that states the money effect. Pure: no React, no fetch.
//
// Gate: UI_TRANSITIONS only (confirmed -> completed and assigned -> completed stay hidden even
// though the server-side transition map allows them).

export type MoveSurface = 'board' | 'panel'

export interface MoveBooking {
  status: string
  booking_source?: string | null
  payment_mode?: string | null
  payment_state?: string | null
  payment_intent_id?: string | null
  payment_amount_minor?: number | null
  payment_currency?: string | null
}

export type CompleteEffect =
  | { kind: 'capture'; amountMinor: number | null; currency: PaymentCurrency | null }
  | { kind: 'cash' }

export type MovePlan =
  | { kind: 'rejected' }
  | { kind: 'direct' }
  | { kind: 'assign_picker' }
  | { kind: 'cancel_dialog' }
  | { kind: 'no_show_dialog' }
  | { kind: 'confirm_complete'; effect: CompleteEffect }

// A row whose payment is a card hold or a cash booking carries a payment badge (cash also a chip).
export function showsPaymentBadge(b: { payment_mode?: string | null }): boolean {
  return b.payment_mode === 'card_hold' || b.payment_mode === 'cash_guarantee'
}

// Phase 89 plan 16: money that a bare status change would leave behind. The server answers
// 422 use_cancel_route for these.
export function hasCancelMoney(b: { payment_mode?: string | null; payment_intent_id?: string | null }): boolean {
  return showsPaymentBadge(b) || (typeof b.payment_intent_id === 'string' && b.payment_intent_id !== '')
}

function toCurrency(v: string | null | undefined): PaymentCurrency | null {
  return v === 'eur' || v === 'czk' ? v : null
}

// What completing this booking does with money. GNet partner bookings skip every money path.
export function completeEffect(b: MoveBooking): CompleteEffect | null {
  if (isPartnerBooking(b)) return null
  if (b.payment_mode === 'card_hold') {
    return {
      kind: 'capture',
      amountMinor: typeof b.payment_amount_minor === 'number' ? b.payment_amount_minor : null,
      currency: toCurrency(b.payment_currency),
    }
  }
  if (b.payment_mode === 'cash_guarantee') return { kind: 'cash' }
  return null
}

export function planMove(b: MoveBooking, to: string, surface: MoveSurface): MovePlan {
  if (to === b.status) return { kind: 'rejected' }
  if (!(UI_TRANSITIONS[b.status] ?? []).includes(to)) return { kind: 'rejected' }

  // D-11: assignment goes through the assign route (writes driver_id, sends the offer).
  if (to === 'assigned') return { kind: 'assign_picker' }
  // D-12: a no-show is always the confirmation modal.
  if (to === 'no_show') return { kind: 'no_show_dialog' }
  if (to === 'cancelled') {
    if (surface === 'board' || hasCancelMoney(b)) return { kind: 'cancel_dialog' }
    return { kind: 'direct' }
  }
  if (to === 'completed') {
    const effect = completeEffect(b)
    return effect ? { kind: 'confirm_complete', effect } : { kind: 'direct' }
  }
  return { kind: 'direct' }
}
