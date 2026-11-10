'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { STATUS_CONFLICT_STYLE, statusConflictMessage } from './statusConflict'
import { formatMinor } from '@/lib/payments/money'
import type { CompleteEffect } from './bookingMoves'

// Phase 90 plan 04 (D-12, T-90-10): the confirmation in front of completing a card_hold or
// cash_guarantee booking. It states the money effect first; only its primary button sends the
// PATCH. The server's status service emits "booking completed" and settleBooking captures the
// hold, so no new money path exists here.

interface CompleteTripDialogProps {
  booking: { id: string; booking_reference: string; status: string } | null
  effect: CompleteEffect | null
  onClose: () => void
  onCompleted: (id: string) => void
  onConflict?: (id: string, currentStatus?: string) => void
}

const GENERIC_ERROR = 'Could not complete the trip. Reload and try again.'

const BUTTON_BASE = {
  minHeight: '44px',
  padding: '0 24px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
} as const

function effectSentence(effect: CompleteEffect): string {
  if (effect.kind === 'cash') {
    return 'No card is charged. The driver collects cash; confirm it in the payment panel.'
  }
  if (effect.amountMinor !== null && effect.currency !== null) {
    return `Completing captures ${formatMinor(effect.amountMinor, effect.currency)} from the client's card.`
  }
  return "Completing captures the held amount from the client's card."
}

export function CompleteTripDialog({ booking, effect, onClose, onCompleted, onConflict }: CompleteTripDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must not send a second request.
  const inFlight = useRef(false)

  const isOpen = booking !== null && effect !== null

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setPending(false)
      setError(null)
      inFlight.current = false
    }
  }, [isOpen])

  if (!booking || !effect) return null
  const target = booking

  async function complete() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // expected_status makes a stale click a 409 instead of overwriting a newer status
        body: JSON.stringify({ id: target.id, status: 'completed', expected_status: target.status }),
      })
      if (res.ok) {
        onCompleted(target.id)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.error === 'status_conflict') {
        const currentStatus = typeof data.currentStatus === 'string' ? data.currentStatus : undefined
        setError(statusConflictMessage(currentStatus))
        onConflict?.(target.id, currentStatus)
      } else {
        setError(GENERIC_ERROR)
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    // While the request is pending the dialog cannot be dismissed.
    <Modal isOpen onClose={pending ? () => {} : onClose} title={`Complete trip ${target.booking_reference}?`}>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-montserrat)',
          fontSize: 'var(--admin-fs-body)',
          color: 'var(--admin-text)',
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
        }}
      >
        {effectSentence(effect)}
      </p>
      {error && (
        <div role="alert" style={STATUS_CONFLICT_STYLE}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          style={{
            ...BUTTON_BASE,
            background: 'transparent',
            border: '1px solid var(--admin-border-strong)',
            color: 'var(--admin-text)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          Keep open
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={pending}
          style={{
            ...BUTTON_BASE,
            background: 'var(--admin-accent)',
            border: '1px solid var(--admin-accent)',
            color: 'var(--admin-on-accent)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.8 : 1,
          }}
        >
          {pending ? 'Completing…' : 'Complete trip'}
        </button>
      </div>
    </Modal>
  )
}
