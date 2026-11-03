'use client'

import { Clock } from 'lucide-react'
import { formatPragueTime } from '@/lib/driver-trip-format'

export interface NoShowBlockProps {
  /** Server-computed instant after which a request is allowed (ISO); null when the server could not tell. */
  availableAt: string | null
  /** Open request time (ISO) from the server or from the 200 answer of this session. */
  requestedAt: string | null
  /** Current time, owned by the screen so one timer flips the caption to the button. */
  nowMs: number
  onRequest: () => void
}

/**
 * No-show block (D-15, D-16), rendered only while the booking is on site. The driver can only ASK:
 * the button is neutral because it changes no status and charges nothing; the operator decides.
 * The server stays the authority and rejects an early request, this block only mirrors its times.
 */
export default function NoShowBlock({ availableAt, requestedAt, nowMs, onRequest }: NoShowBlockProps) {
  if (requestedAt) {
    return (
      <p
        role="status"
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          color: 'var(--status-info-fg)',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        <Clock size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{`No-show requested at ${formatPragueTime(requestedAt)}. The office is trying to reach the passenger.`}</span>
      </p>
    )
  }

  const availableMs = availableAt ? Date.parse(availableAt) : Number.NaN
  if (availableAt && Number.isFinite(availableMs) && nowMs < availableMs) {
    return (
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          color: 'var(--admin-text-muted)',
          fontSize: 'var(--driver-fs-label)',
          fontWeight: 400,
          lineHeight: 1.4,
        }}
      >
        <Clock size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{`You can request a no-show after ${formatPragueTime(availableAt)}.`}</span>
      </p>
    )
  }

  return (
    <button
      type="button"
      data-driver-focus=""
      onClick={onRequest}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: 48,
        padding: '0 16px',
        background: 'transparent',
        border: '1px solid var(--admin-border-strong)',
        borderRadius: 'var(--admin-radius-md)',
        color: 'var(--admin-text)',
        fontFamily: 'inherit',
        fontSize: 'var(--driver-fs-body)',
        fontWeight: 500,
        lineHeight: 1.5,
        cursor: 'pointer',
      }}
    >
      Request no-show
    </button>
  )
}
