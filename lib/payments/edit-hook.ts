// Trip-edit hook of the card-on-file flow (Phase 88, plan 88-16; D-16, D-17, D-18, D-22, Research Pattern 7,
// Pitfall 12).
//
// The admin trip-edit PATCH calls two functions:
//   assertEditablePrecheck(current)   BEFORE the update: a card booking whose money is in flight (checkout,
//                                     placing a hold, capturing) is not editable -> 409 payment_in_progress.
//   reevaluateAfterEdit(...)          AFTER a successful update: keeps payment_amount_minor, the planned hold date
//                                     and the hold PaymentIntent consistent with the saved row.
//
// The edit itself NEVER fails because of Stripe or the payment ledger: every problem here is caught, logged
// (ids and codes only), recorded as an edit_reevaluated ledger row with an error code where possible, and the hook
// answers null (no payment_effect). Partner bookings and bookings of another payment mode are not touched.
//
// Server-only by use. State changes go through applyTransition (single writer, lib/payments/state.ts).

import { createSupabaseServiceClient } from '@/lib/supabase'
import { pickupInstantMs } from '@/lib/prague-date'
import { getPaymentSettings } from '@/lib/payments/config'
import { cancelHoldIntent } from '@/lib/payments/hold'
import { refreshRecoveryLink } from '@/lib/payments/recovery'
import { stripeErrorCode } from '@/lib/payments/stripe'
import { computeHoldAt, holdDateIso, needsReplace } from '@/lib/payments/timing'
import {
  applyTransition,
  appendPaymentEvent,
  type LedgerActor,
  type PaymentPatch,
  type PaymentState,
} from '@/lib/payments/state'

type BookingRow = Record<string, unknown>
type Currency = 'eur' | 'czk'

export type PaymentEffect =
  | { kind: 'amount_raised'; currency: Currency; held_minor: number; diff_minor: number }
  | { kind: 'amount_lowered'; currency: Currency; amount_minor: number }
  | { kind: 'hold_released'; currency: Currency; hold_date_iso: string }

const IN_FLIGHT: readonly string[] = ['checkout_pending', 'placing_hold', 'capturing']

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** A card booking whose money is in flight can not be edited: the worker holding the lease owns the amounts. */
export function assertEditablePrecheck(
  current: Record<string, unknown>,
): null | { status: 409; body: { error: 'payment_in_progress' } } {
  if (current.payment_mode === 'card_hold' && IN_FLIGHT.includes(str(current.payment_state))) {
    return { status: 409, body: { error: 'payment_in_progress' } }
  }
  return null
}

/** The amount the booking should be charged, in minor units of its payment currency, from the saved row (D-16). */
function deriveAmountMinor(row: BookingRow, currency: Currency): number | null {
  const major = num(currency === 'czk' ? row.amount_czk : row.amount_eur)
  if (major === null) return null
  const minor = Math.round(major * 100)
  return Number.isInteger(minor) && minor > 0 ? minor : null
}

async function recordEdit(bookingId: string, actor: LedgerActor, errorCode?: string, currency?: Currency, amountMinor?: number) {
  try {
    await appendPaymentEvent(bookingId, {
      key: `edit_reevaluated:${bookingId}:${Date.now()}:${errorCode ?? 'ok'}`,
      kind: 'edit_reevaluated',
      errorCode: errorCode ? errorCode.slice(0, 60) : undefined,
      currency,
      amountMinor,
      actor,
    })
  } catch {
    console.error('[edit-hook] edit_reevaluated row not written', { bookingId })
  }
}

/**
 * Re-evaluate the card payment of a booking after a successful trip edit. Returns what the operator should be told
 * (payment_effect), or null when nothing needs saying. Never throws.
 */
export async function reevaluateAfterEdit(input: {
  bookingId: string
  before: Record<string, unknown>
  priceChanged: boolean
  pickupChanged: boolean
  actor: LedgerActor
}): Promise<PaymentEffect | null> {
  const { bookingId, before, priceChanged, pickupChanged, actor } = input
  if (before.payment_mode !== 'card_hold') return null
  if (!priceChanged && !pickupChanged) return null

  try {
    // Fresh row: pickup_utc is a generated column (D-22) and the amounts are the saved ones.
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()
    if (error || !data) {
      console.error('[edit-hook] booking re-select failed', { bookingId })
      return null
    }
    const row = data as BookingRow
    const state = str(row.payment_state) as PaymentState
    const currency: Currency = row.payment_currency === 'czk' ? 'czk' : 'eur'

    // Money already collected: the amount can no longer follow the edit; the operator sees it in the ledger.
    if (state === 'captured' || state === 'balance_due') {
      if (priceChanged) await recordEdit(bookingId, actor, 'already_collected', currency)
      return null
    }
    if (IN_FLIGHT.includes(state)) {
      // Raced with a worker after the precheck; the worker's amounts win, the edit is only logged.
      await recordEdit(bookingId, actor, 'payment_in_progress', currency)
      return null
    }
    if (state !== 'card_saved' && state !== 'authorized' && state !== 'failed' && state !== 'expired') return null

    const patch: PaymentPatch = {}
    let newAmount: number | null = null

    if (priceChanged) {
      newAmount = deriveAmountMinor(row, currency)
      if (newAmount === null) {
        await recordEdit(bookingId, actor, 'amount_invalid', currency)
        return null
      }
      patch.payment_amount_minor = newAmount
    }

    let newHoldAtMs: number | null = null
    let newRawHoldAtMs: number | null = null
    let pickupMs: number | null = null
    if (pickupChanged) {
      pickupMs = pickupInstantMs({
        pickup_utc: typeof row.pickup_utc === 'string' ? row.pickup_utc : null,
        pickup_date: str(row.pickup_date),
        pickup_time: str(row.pickup_time),
      })
      if (pickupMs === null) {
        await recordEdit(bookingId, actor, 'pickup_unknown', currency)
        return null
      }
      const { leadHours } = await getPaymentSettings()
      const hold = computeHoldAt(pickupMs, leadHours)
      newHoldAtMs = hold.holdAtMs
      newRawHoldAtMs = hold.rawHoldAtMs
      patch.hold_at = new Date(hold.holdAtMs).toISOString()
    }

    // ── authorized: keep the hold, or replace it when the new pickup needs a different one (D-18) ──
    if (state === 'authorized') {
      const heldMinor = num(row.hold_amount_minor) ?? num(row.payment_amount_minor) ?? 0

      if (pickupChanged && pickupMs !== null && newRawHoldAtMs !== null && newHoldAtMs !== null) {
        const captureBeforeMs = typeof row.capture_before === 'string' ? Date.parse(row.capture_before) : NaN
        const replace = needsReplace({
          captureBeforeMs: Number.isFinite(captureBeforeMs) ? captureBeforeMs : null,
          newPickupMs: pickupMs,
          newRawHoldAtMs,
          nowMs: Date.now(),
        })
        if (replace) {
          try {
            await cancelHoldIntent(row)
          } catch (err) {
            // The old hold is still in place and the state is unchanged; the operator can release / re-place it.
            const code = stripeErrorCode(err)
            console.error('[edit-hook] hold cancellation failed', { bookingId, code })
            await recordEdit(bookingId, actor, code, currency)
            return null
          }
          const attempts = num(row.hold_attempts) ?? 0
          const piId = str(row.hold_payment_intent_id)
          const moved = await applyTransition({
            bookingId,
            from: ['authorized'],
            to: 'card_saved',
            patch: {
              ...patch,
              hold_payment_intent_id: null,
              hold_amount_minor: null,
              hold_placed_at: null,
              capture_before: null,
              hold_attempts: attempts + 1,
              payment_lease_until: null,
            },
            event: {
              key: `hold_released:${piId || bookingId}:edit:${attempts}`,
              kind: 'hold_released',
              stripeObjectId: piId || undefined,
              actor,
            },
          })
          if (!moved.applied && moved.duplicate !== true) {
            console.error('[edit-hook] hold released at Stripe but the booking left authorized meanwhile', { bookingId })
            await recordEdit(bookingId, actor, 'state_moved', currency)
            return null
          }
          await recordEdit(bookingId, actor, undefined, currency, newAmount ?? undefined)
          return { kind: 'hold_released', currency, hold_date_iso: holdDateIso(newHoldAtMs) }
        }
      }

      // Hold stays: only the amount (and the planned hold time) follow the edit.
      if (Object.keys(patch).length > 0) {
        const moved = await applyTransition({
          bookingId,
          from: ['authorized'],
          to: 'authorized',
          patch,
          event: {
            key: `edit_reevaluated:${bookingId}:${Date.now()}`,
            kind: 'edit_reevaluated',
            amountMinor: newAmount ?? undefined,
            currency,
            actor,
          },
        })
        if (!moved.applied && moved.duplicate !== true) {
          console.error('[edit-hook] authorized booking moved before the edit was applied', { bookingId })
          return null
        }
      }
      if (newAmount !== null && newAmount > heldMinor) {
        return { kind: 'amount_raised', currency, held_minor: heldMinor, diff_minor: newAmount - heldMinor }
      }
      if (newAmount !== null && newAmount < heldMinor) {
        return { kind: 'amount_lowered', currency, amount_minor: newAmount }
      }
      return null
    }

    // ── card_saved / failed / expired: no hold to protect, the next tick places it with the new values ──
    if (Object.keys(patch).length === 0) return null
    const moved = await applyTransition({
      bookingId,
      from: [state],
      to: state,
      patch,
      event: {
        key: `edit_reevaluated:${bookingId}:${Date.now()}`,
        kind: 'edit_reevaluated',
        amountMinor: newAmount ?? undefined,
        currency,
        actor,
      },
    })
    if (!moved.applied && moved.duplicate !== true) {
      console.error('[edit-hook] booking moved before the edit was applied', { bookingId })
      return null
    }

    // Pitfall 12: a recovery link for the old amount must not stay payable.
    if (priceChanged && newAmount !== null && (state === 'failed' || state === 'expired') && str(row.recovery_link_id)) {
      try {
        await refreshRecoveryLink({ ...row, ...(moved.booking ?? {}) }, newAmount, `e${Date.now()}`)
      } catch {
        console.error('[edit-hook] recovery link refresh failed', { bookingId })
      }
    }
    return null
  } catch {
    console.error('[edit-hook] re-evaluation failed', { bookingId })
    return null
  }
}
