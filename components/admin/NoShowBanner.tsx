'use client'
import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { formatPragueTime } from '@/lib/driver-trip-format'

// Phase 87 plan 12 (D-16 a): the banner at the top of an expanded booking that has an open
// no-show request. "Confirm no-show" only asks the table to open the confirmation modal;
// "Client found" clears the request in one click (reversible: the driver may ask again).

interface NoShowBannerProps {
  bookingId: string
  requestedAt: string
  onConfirmRequest: () => void
  onCleared: () => void
}

const FALLBACK_DRIVER = 'The driver'
const CLEAR_ERROR = 'Could not clear the request. Reload and try again.'

const BUTTON_BASE = {
  minHeight: '44px',
  padding: '0 24px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
} as const

/** A request is open while the driver waits at the pickup point (status on_location) and it is set. */
export function hasOpenNoShowRequest(booking: { status: string; no_show_requested_at?: string | null }): boolean {
  return booking.status === 'on_location' && Boolean(booking.no_show_requested_at)
}

/** List indicator next to the status badge: warn family, same leading dot as StatusBadge, no icon. */
export function NoShowChip() {
  return (
    <span
      data-testid="no-show-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        backgroundColor: 'var(--status-warn-bg)',
        color: 'var(--status-warn-fg)',
        border: '1px solid var(--status-warn-border)',
        borderRadius: 'var(--admin-radius-sm)',
        fontFamily: 'var(--font-montserrat)',
        fontSize: 'var(--admin-fs-label)',
        fontWeight: 'var(--admin-fw-strong)',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-warn-fg)', flexShrink: 0 }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>No-show requested</span>
    </span>
  )
}

export function NoShowBanner({ bookingId, requestedAt, onConfirmRequest, onCleared }: NoShowBannerProps) {
  const [driverName, setDriverName] = useState<string>(FALLBACK_DRIVER)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  // Driver name for the text. The banner works without it ("The driver" fallback).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${bookingId}/no-show`)
        if (!res.ok) return
        const data = await res.json()
        const name = typeof data?.driverName === 'string' ? data.driverName.trim() : ''
        if (!cancelled && name) setDriverName(name)
      } catch {
        // keep the fallback
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  async function clientFound() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (res.ok) {
        onCleared()
        return
      }
      setError(CLEAR_ERROR)
    } catch {
      setError(CLEAR_ERROR)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <div
      data-testid="no-show-banner"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
        padding: '16px',
        marginBottom: '16px',
        borderRadius: 'var(--admin-radius-md)',
        background: 'var(--status-warn-bg)',
        color: 'var(--status-warn-fg)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <TriangleAlert size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--admin-fs-body)',
            fontWeight: 'var(--admin-fw-strong)',
            marginBottom: '4px',
          }}
        >
          No-show requested
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--admin-fs-body)',
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          {`${driverName} asked for a no-show at ${formatPragueTime(requestedAt)} after waiting for the passenger. Try to reach the client, then confirm or dismiss.`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row" style={{ marginTop: '12px' }}>
          <button
            type="button"
            className="w-full sm:w-auto"
            onClick={onConfirmRequest}
            disabled={pending}
            style={{
              ...BUTTON_BASE,
              background: 'var(--admin-danger-solid)',
              border: '1px solid var(--admin-danger-solid)',
              color: 'var(--admin-on-danger)',
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            Confirm no-show
          </button>
          <button
            type="button"
            className="w-full sm:w-auto"
            onClick={clientFound}
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
            {pending ? 'Saving…' : 'Client found'}
          </button>
        </div>
        {error && (
          <div
            role="alert"
            style={{
              marginTop: '8px',
              fontSize: 'var(--admin-fs-label)',
              color: 'var(--status-danger-fg)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
