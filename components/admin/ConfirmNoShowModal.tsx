'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { STATUS_CONFLICT_STYLE, statusConflictMessage } from './statusConflict'

// Phase 87 plan 12 (D-16 a, T-87-40): the single destructive confirmation in front of the
// terminal no_show status. Both the banner's "Confirm no-show" and the generic status
// select/buttons open this modal; only its primary button talks to the server.

interface ConfirmNoShowModalProps {
  isOpen: boolean
  bookingId: string
  bookingReference: string
  onClose: () => void
  onConfirmed: (status: 'no_show') => void
}

const GENERIC_ERROR = 'Could not confirm the no-show. Reload and try again.'
// Phase 89 WR-04: the server gate's refusals (lib/no-show.ts assertNoShowConfirmable).
const REFUSAL_COPY: Record<string, string> = {
  not_on_location: 'The driver has not marked arrival at the pickup yet.',
  no_request: 'The driver has not asked for a no-show on this booking.',
  wait_not_elapsed: 'The free waiting time has not passed yet.',
}

const BUTTON_BASE = {
  minHeight: '44px',
  padding: '0 24px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
} as const

export function ConfirmNoShowModal({
  isOpen,
  bookingId,
  bookingReference,
  onClose,
  onConfirmed,
}: ConfirmNoShowModalProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must not send a second request.
  const inFlight = useRef(false)

  // A reopened modal starts clean.
  useEffect(() => {
    if (!isOpen) {
      setPending(false)
      setError(null)
      inFlight.current = false
    }
  }, [isOpen])

  async function confirm() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // expected_status makes a stale click a 409 instead of overwriting a newer status
        body: JSON.stringify({ action: 'confirm', expected_status: 'on_location' }),
      })
      if (res.ok) {
        onConfirmed('no_show')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.error === 'status_conflict') {
        setError(statusConflictMessage(typeof data.currentStatus === 'string' ? data.currentStatus : undefined))
      } else {
        setError(REFUSAL_COPY[String(data?.error)] ?? GENERIC_ERROR)
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    // While the request is pending the modal cannot be dismissed (UI-SPEC E8).
    <Modal isOpen={isOpen} onClose={pending ? () => {} : onClose} title="Confirm no-show">
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
        {`Mark booking ${bookingReference} as a no-show? The driver's trip link stops working and the status cannot be changed back.`}
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
          Keep booking open
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          style={{
            ...BUTTON_BASE,
            background: 'var(--admin-danger-solid)',
            border: '1px solid var(--admin-danger-solid)',
            color: 'var(--admin-on-danger)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.8 : 1,
          }}
        >
          {pending ? 'Confirming…' : 'Confirm no-show'}
        </button>
      </div>
    </Modal>
  )
}
