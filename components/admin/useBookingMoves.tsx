'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { CancelBookingDialog, type CancelDoneInfo } from './CancelBookingDialog'
import { CompleteTripDialog } from './CompleteTripDialog'
import { ConfirmNoShowModal } from './ConfirmNoShowModal'
import { statusConflictMessage } from './statusConflict'
import { planMove, type CompleteEffect, type MoveSurface } from './bookingMoves'
import {
  PatchError,
  STATUS_LABELS,
  hasCancelMoney,
  patchBooking,
  type AdminBooking,
} from './bookingTypes'

// Phase 90 plan 01: every status move of a booking and the two money dialogs it can open, in one hook.
// The list, the detail panel (and later the board and the calendar) read this API; each view's table
// mounts `dialogs` exactly once. Row changes are reported through opts.onPatched(id, patch).

export interface BookingMovesApi {
  isUpdating(id: string): boolean
  /** The inline conflict line for a booking whose status change lost the compare-and-set race. */
  conflictFor(id: string): string | null
  /** The one entry point for a status change: routes no_show and cancelled-with-money to their dialogs. */
  requestStatusChange(booking: AdminBooking, to: string): void
  /**
   * Phase 90 (DISP-02): asks planMove what the move means and executes it: a direct PATCH with a toast, the
   * complete-trip confirmation, the cancel dialog, the no-show modal. Nothing is applied before the server accepted.
   */
  requestMove(booking: AdminBooking, to: string, surface: MoveSurface): void
  openNoShow(booking: Pick<AdminBooking, 'id' | 'booking_reference'>): void
  openCancel(booking: AdminBooking): void
  /** True while the no-show modal, the cancel dialog or the complete-trip dialog is open. */
  anyDialogOpen: boolean
  /** Counter that makes an open PaymentPanel refetch after a cancel outcome. */
  paymentBumpFor(id: string): number
  /** The ConfirmNoShowModal, CancelBookingDialog and CompleteTripDialog mounts, plus the move toast. */
  dialogs: React.ReactNode
}

interface UseBookingMovesOptions {
  onPatched: (id: string, patch: Partial<AdminBooking>) => void
  /** Called after a 409 status_conflict: the view the move was made from is stale. */
  onStale?: (id: string) => void
}

const MOVE_TOAST_MS = 4000

export function useBookingMoves(opts: UseBookingMovesOptions): BookingMovesApi {
  const { onPatched, onStale } = opts

  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  // D-01: per-booking inline message after an admin status change lost the race (409 status_conflict)
  const [statusConflict, setStatusConflict] = useState<Record<string, string>>({})
  // Phase 87 D-16(a): the booking whose Confirm no-show modal is open (banner button or the
  // generic status select / buttons; no_show is terminal, so it is never applied directly).
  const [noShowTarget, setNoShowTarget] = useState<{ id: string; reference: string } | null>(null)
  // Phase 89 plan 16: the booking whose cancel dialog is open (CancelBookingDialog owns its own choice and request state).
  const [pendingCancel, setPendingCancel] = useState<AdminBooking | null>(null)
  // Phase 88-07: per-booking counter that makes an open PaymentPanel refetch after a cancel outcome.
  const [paymentBumps, setPaymentBumps] = useState<Record<string, number>>({})
  // Phase 90 plan 06 (D-12): the booking whose complete-trip confirmation is open, with the money effect it states.
  const [completeTarget, setCompleteTarget] = useState<{ booking: AdminBooking; effect: CompleteEffect } | null>(null)
  // D-12: the short "{reference} moved to {Label}" line after a move the server accepted. It mounts only while shown.
  const [toast, setToast] = useState<{ text: string; seq: number } | null>(null)

  // The toast hides itself after about 4 s; a newer toast restarts the timer.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), MOVE_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const showMoveToast = useCallback((reference: string, status: string) => {
    setToast(prev => ({ text: `${reference} moved to ${STATUS_LABELS[status] ?? status}`, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const clearConflict = useCallback((bookingId: string) => {
    setStatusConflict(prev => {
      if (!(bookingId in prev)) return prev
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
  }, [])

  const bumpPayment = useCallback((bookingId: string) => {
    setPaymentBumps(prev => ({ ...prev, [bookingId]: (prev[bookingId] ?? 0) + 1 }))
  }, [])

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string, fromStatus: string, reference: string) => {
    setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
    clearConflict(bookingId)
    try {
      // D-01: expected_status = the status this row shows, so a stale view cannot overwrite the driver
      await patchBooking({ id: bookingId, status: newStatus, expected_status: fromStatus })
      // The server accepted: mutate only the status field, don't re-fetch (never applied before this point)
      onPatched(bookingId, { status: newStatus })
      showMoveToast(reference, newStatus)
    } catch (err) {
      if (err instanceof PatchError && err.status === 409 && err.message === 'status_conflict') {
        // Lost the race: show the locked inline copy, keep the row as it is, no automatic reload
        setStatusConflict(prev => ({ ...prev, [bookingId]: statusConflictMessage(err.currentStatus) }))
        onStale?.(bookingId)
      } else {
        // Show alert on failure — simple for v1.3 single-operator admin
        alert(err instanceof Error ? err.message : 'Status update failed')
      }
    } finally {
      setStatusUpdating(prev => ({ ...prev, [bookingId]: false }))
    }
  }, [clearConflict, onPatched, onStale, showMoveToast])

  // T-87-40: every path to the terminal no_show goes through the confirmation modal.
  const requestStatusChange = useCallback((booking: AdminBooking, newStatus: string) => {
    if (newStatus === 'no_show') {
      setNoShowTarget({ id: booking.id, reference: booking.booking_reference })
      return
    }
    // 88-REVIEW T5: a card booking is cancelled through the payment-aware cancel dialog (release / refund), never
    // by a bare status change (the server answers 422 use_cancel_route to that).
    // Phase 89 plan 16: the same holds for cash bookings and any booking with money paid online.
    if (newStatus === 'cancelled' && hasCancelMoney(booking)) {
      setPendingCancel(booking)
      return
    }
    handleStatusChange(booking.id, newStatus, booking.status, booking.booking_reference)
  }, [handleStatusChange])

  // Phase 90: every surface (board drop, board menu, panel select, mobile card buttons) asks the planner first.
  const requestMove = useCallback((booking: AdminBooking, to: string, surface: MoveSurface) => {
    const plan = planMove(booking, to, surface)
    switch (plan.kind) {
      case 'rejected':
        return
      case 'direct':
        void handleStatusChange(booking.id, to, booking.status, booking.booking_reference)
        return
      case 'confirm_complete':
        // The capture (or cash) effect is stated first; only the dialog's primary button sends the PATCH.
        setCompleteTarget({ booking, effect: plan.effect })
        return
      case 'cancel_dialog':
        setPendingCancel(booking)
        return
      case 'no_show_dialog':
        setNoShowTarget({ id: booking.id, reference: booking.booking_reference })
        return
      case 'assign_picker':
        // Wired with the driver picker dialog (plan 90-06 task 2).
        return
    }
  }, [handleStatusChange])

  // The complete dialog's PATCH was accepted: the row follows, the dialog closes, the toast confirms.
  const handleCompleted = useCallback((booking: AdminBooking) => {
    onPatched(booking.id, { status: 'completed' })
    clearConflict(booking.id)
    showMoveToast(booking.booking_reference, 'completed')
    setCompleteTarget(null)
  }, [clearConflict, onPatched, showMoveToast])

  // The complete dialog lost the compare-and-set race: it shows its own line; the inline line and a refetch follow.
  const handleCompleteConflict = useCallback((bookingId: string, currentStatus: string | undefined) => {
    setStatusConflict(prev => ({ ...prev, [bookingId]: statusConflictMessage(currentStatus) }))
    onStale?.(bookingId)
  }, [onStale])

  const openNoShow = useCallback((booking: Pick<AdminBooking, 'id' | 'booking_reference'>) => {
    setNoShowTarget({ id: booking.id, reference: booking.booking_reference })
  }, [])

  const openCancel = useCallback((booking: AdminBooking) => {
    setPendingCancel(booking)
  }, [])

  // The server moved the booking to no_show (final): mirror it locally and drop the request flag.
  const handleNoShowConfirmed = useCallback((bookingId: string) => {
    onPatched(bookingId, { status: 'no_show', no_show_requested_at: null })
    clearConflict(bookingId)
    setNoShowTarget(null)
  }, [clearConflict, onPatched])

  // The cancel dialog reports its outcome; the row follows at once and an open panel refetches (C-WR-04).
  const handleCancelled = useCallback((booking: { id: string }, done: CancelDoneInfo) => {
    onPatched(booking.id, {
      status: 'cancelled',
      // a released hold shows as released at once; a late cancel keeps the money and a fee decision is pending
      ...(done.released ? { payment_state: 'released' } : {}),
      ...(done.late ? { fee_case_status: 'pending' } : {}),
    })
    bumpPayment(booking.id)
    setPendingCancel(null)
  }, [bumpPayment, onPatched])

  // Phase 88 D-20: the cancel applied (the row is cancelled now) but the refund or release did not. The dialog closes;
  // the panel refetches and shows the Refund failed banner with the amount to refund by hand.
  const handleCancelRefundFailed = useCallback((booking: { id: string }) => {
    onPatched(booking.id, { status: 'cancelled' })
    bumpPayment(booking.id)
    setPendingCancel(null)
  }, [bumpPayment, onPatched])

  // The cancel applied but the late-cancel case could not be opened: the row is cancelled, the dialog stays up with its line.
  const handleCancelledWithoutCase = useCallback((booking: { id: string }) => {
    onPatched(booking.id, { status: 'cancelled' })
    bumpPayment(booking.id)
  }, [bumpPayment, onPatched])

  const dialogs = (
    <>
      {/* Confirm no-show (Phase 87 D-16 a): the only way to reach the terminal no_show status */}
      <ConfirmNoShowModal
        isOpen={noShowTarget !== null}
        bookingId={noShowTarget?.id ?? ''}
        bookingReference={noShowTarget?.reference ?? ''}
        onClose={() => setNoShowTarget(null)}
        onConfirmed={() => { if (noShowTarget) handleNoShowConfirmed(noShowTarget.id) }}
      />

      {/* Cancel dialog (Phase 89 plan 16, D-20): who cancelled is required, the money effect is shown first */}
      <CancelBookingDialog
        booking={pendingCancel}
        onClose={() => setPendingCancel(null)}
        onCancelled={handleCancelled}
        onRefundFailed={handleCancelRefundFailed}
        onCancelledWithoutCase={handleCancelledWithoutCase}
      />

      {/* Complete-trip confirmation (Phase 90 D-12): states the capture / cash effect before the PATCH */}
      <CompleteTripDialog
        booking={completeTarget?.booking ?? null}
        effect={completeTarget?.effect ?? null}
        onClose={() => setCompleteTarget(null)}
        onCompleted={() => { if (completeTarget) handleCompleted(completeTarget.booking) }}
        onConflict={(id, currentStatus) => handleCompleteConflict(id, currentStatus)}
      />

      {/* Move toast (D-12): mounted only while a message shows, so a permanent empty live region cannot make
          the cancel dialog's role=status outcome line ambiguous. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="move-toast"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            zIndex: 110,
            maxWidth: 'min(480px, calc(100vw - 32px))',
            padding: '10px 16px',
            borderRadius: 'var(--admin-radius-md)',
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-border-strong)',
            boxShadow: 'var(--admin-shadow-sheet)',
            color: 'var(--admin-text)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 'var(--admin-fs-body)',
            overflowWrap: 'anywhere',
          }}
        >
          {toast.text}
        </div>
      )}
    </>
  )

  return {
    isUpdating: (id) => !!statusUpdating[id],
    conflictFor: (id) => statusConflict[id] ?? null,
    requestStatusChange,
    requestMove,
    openNoShow,
    openCancel,
    anyDialogOpen: noShowTarget !== null || pendingCancel !== null || completeTarget !== null,
    paymentBumpFor: (id) => paymentBumps[id] ?? 0,
    dialogs,
  }
}
