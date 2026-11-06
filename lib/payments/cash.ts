// Cash settlement of a cash_guarantee booking (Phase 89, plan 89-12; CASH-04, D-11, D-21, D-22).
//
// A cash booking keeps a saved card as the guarantee and the client pays the driver. Two people can say the cash was
// received, the driver (plan 89-14, actor { system, driver_trip }) and the operator (admin), and the operator can reverse
// a confirmation that was wrong. Both go through applyTransition ONLY (the one writer of payment_state):
//
//   settleCash     card_saved | failed -> cash_settled   ledger kind cash_settled, key cash_settled:<id>:<n>
//   reopenCash     cash_settled        -> card_saved     ledger kind cash_reopened, key cash_reopened:<id>:<n>
//
// The ledger keeps both rows (D-22): the keys carry a counter, so settle, reopen and a second settle each get their own
// row. n of a settle = how many reopenings came before it, n of a reopen = how many settlements it reverses. A replay
// (a double click, a driver tap after the operator's) hits the same key or the compare-and-set and changes nothing.
//
// Free text never goes into the append-only ledger: the operator's note of a reopen, and of a card charge on a cash
// booking, lives in booking_payment_notes (deny-all table, migration 087), written here (D-21, D-22).
//
// Partner bookings never reach any of this (assertMoneyEligible first, Pitfall 15). Settling needs a trip that is on or
// done: the status is checked inside the compare-and-set, under the row lock (migration 086), so a cancel that lands in
// between cannot slip through.

import { assertMoneyEligible, BOOKING_STATUSES, CALENDAR_ACTIVE_STATUSES, PartnerBookingMoneyError } from '@/lib/booking-status'
import { RECOVERY_LINK_CLEARED, retireRecoveryLink } from '@/lib/payments/recovery-link'
import { applyTransition, type LedgerActor } from '@/lib/payments/state'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

const NOTE_MAX = 500

/**
 * Statuses of a trip that is on or done: confirmed, assigned, en_route, on_location, on_board, completed. Cash can be
 * settled and the saved card charged only here; a cancelled or no-show booking has its own (fee) path. Derived from the
 * shared vocabulary, never retyped (tests/booking-status-parity.test.ts).
 */
export const CASH_TRIP_STATUSES: readonly string[] = BOOKING_STATUSES.filter(
  (s) => CALENDAR_ACTIVE_STATUSES.has(s) && s !== 'no_show',
)

export type SettleCashResult = 'settled' | 'replay' | 'not_allowed'
export type ReopenCashResult = 'reopened' | 'replay' | 'not_allowed'
export type PaymentNoteKind = 'cash_card_charge' | 'cash_reopen'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function isPartner(booking: BookingRow): boolean {
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
    return false
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return true
    throw err
  }
}

/** Number of ledger rows of a kind for a booking (read-only). */
async function countEvents(bookingId: string, kind: 'cash_settled' | 'cash_reopened'): Promise<number> {
  const { count, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('kind', kind)
  if (error || typeof count !== 'number') throw new Error('cash ledger read failed')
  return count
}

/**
 * Store an operator note about a cash decision (booking_payment_notes). Returns the note id. Throws on a database
 * problem: the caller answers 500 and nothing else has happened yet.
 */
export async function addPaymentNote(
  bookingId: string,
  kind: PaymentNoteKind,
  note: string,
  actor: LedgerActor,
): Promise<string> {
  const text = note.trim().slice(0, NOTE_MAX)
  if (!text) throw new Error('payment note is empty')
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_notes')
    .insert({ booking_id: bookingId, kind, note: text, created_by: (actor.id ?? actor.type).slice(0, 64) })
    .select('id')
    .single()
  const id = (data as { id?: unknown } | null)?.id
  if (error || typeof id !== 'string') throw new Error('payment note write failed')
  return id
}

/** Best effort: drop a note whose action did not happen, so the history never describes something that did not occur. */
export async function removePaymentNote(noteId: string): Promise<void> {
  const { error } = await createSupabaseServiceClient().from('booking_payment_notes').delete().eq('id', noteId)
  if (error) console.error('[cash] payment note not removed', { noteId })
}

/**
 * The cash was received: card_saved | failed -> cash_settled. `failed` is included because the card may fail during the
 * trip and the client then pays the driver (D-21). A booking that is already cash_settled answers 'replay'. The failure
 * noise of a declined card (error, retry time) is cleared with the recovery link: the booking is paid.
 */
export async function settleCash(booking: BookingRow, actor: LedgerActor): Promise<SettleCashResult> {
  const bookingId = str(booking.id)
  if (!bookingId || isPartner(booking) || booking.payment_mode !== 'cash_guarantee') return 'not_allowed'

  const state = str(booking.payment_state)
  if (state === 'cash_settled') return 'replay'
  if (state !== 'card_saved' && state !== 'failed') return 'not_allowed'

  const reopened = await countEvents(bookingId, 'cash_reopened')
  const moved = await applyTransition({
    bookingId,
    from: ['card_saved', 'failed'],
    to: 'cash_settled',
    patch: {
      ...RECOVERY_LINK_CLEARED,
      payment_retry_at: null,
      payment_failed_at: null,
      last_payment_error: null,
      payment_lease_until: null,
    },
    event: { key: `cash_settled:${bookingId}:${reopened}`, kind: 'cash_settled', actor },
    requireStatus: CASH_TRIP_STATUSES,
  })

  if (moved.applied) {
    await retireRecoveryLink(booking)
    return 'settled'
  }
  if (moved.statusBlocked) return 'not_allowed'
  return moved.duplicate === true || moved.currentState === 'cash_settled' ? 'replay' : 'not_allowed'
}

/**
 * The operator reverses a cash confirmation (D-22): cash_settled -> card_saved, with a note (1..500). The note is stored
 * first and removed again when the transition is not applied, so the history never holds a reversal that did not happen.
 */
export async function reopenCash(booking: BookingRow, actor: LedgerActor, note: string): Promise<ReopenCashResult> {
  const bookingId = str(booking.id)
  if (!bookingId || isPartner(booking) || booking.payment_mode !== 'cash_guarantee') return 'not_allowed'
  if (str(booking.payment_state) !== 'cash_settled') return 'not_allowed'
  if (note.trim().length === 0) return 'not_allowed'

  const settlements = await countEvents(bookingId, 'cash_settled')
  const noteId = await addPaymentNote(bookingId, 'cash_reopen', note, actor)
  let moved: Awaited<ReturnType<typeof applyTransition>>
  try {
    moved = await applyTransition({
      bookingId,
      from: ['cash_settled'],
      to: 'card_saved',
      event: { key: `cash_reopened:${bookingId}:${settlements}`, kind: 'cash_reopened', actor },
    })
  } catch (err) {
    await removePaymentNote(noteId)
    throw err
  }
  if (moved.applied) return 'reopened'

  await removePaymentNote(noteId)
  return moved.duplicate === true ? 'replay' : 'not_allowed'
}
