'use client'

import { useState } from 'react'

interface DriverResponseClientProps {
  token: string
  initialAction?: 'accepted' | 'declined'
}

type SubmitState = 'idle' | 'submitting' | 'done' | 'error'

export default function DriverResponseClient({ token }: DriverResponseClientProps) {
  const [state, setState] = useState<SubmitState>('idle')
  const [confirmedAction, setConfirmedAction] = useState<'accepted' | 'declined' | null>(null)

  async function handleAction(action: 'accepted' | 'declined') {
    setState('submitting')
    try {
      const res = await fetch('/api/driver/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      })
      const json = await res.json()
      if (json.ok) {
        setConfirmedAction(action)
        setState('done')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  const isSubmitting = state === 'submitting'

  if (state === 'done' && confirmedAction) {
    return (
      <div
        style={{
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: 300,
          lineHeight: 1.75,
          letterSpacing: '0.03em',
          color: confirmedAction === 'accepted' ? '#4ade80' : '#4ade80',
          marginTop: '8px',
        }}
      >
        {confirmedAction === 'accepted'
          ? 'Thank you. Booking accepted.'
          : 'Understood. The booking has been declined.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Accept button */}
      <button
        onClick={() => handleAction('accepted')}
        disabled={isSubmitting}
        aria-busy={isSubmitting || undefined}
        style={{
          width: '100%',
          minHeight: '56px',
          background: 'transparent',
          border: '1px solid var(--copper)',
          color: 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
          cursor: isSubmitting ? 'default' : 'pointer',
          opacity: isSubmitting ? 0.5 : 1,
          transition: 'background 0.3s ease, color 0.3s ease',
          borderRadius: 0,
        }}
        onMouseEnter={(e) => {
          if (!isSubmitting) {
            e.currentTarget.style.background = 'var(--copper)'
            e.currentTarget.style.color = 'var(--anthracite)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSubmitting) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--offwhite)'
          }
        }}
      >
        {isSubmitting ? 'Confirming...' : 'Accept'}
      </button>

      {/* Decline button */}
      <button
        onClick={() => handleAction('declined')}
        disabled={isSubmitting}
        aria-busy={isSubmitting || undefined}
        style={{
          width: '100%',
          minHeight: '56px',
          background: 'transparent',
          border: '1px solid #f87171',
          color: '#f87171',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
          cursor: isSubmitting ? 'default' : 'pointer',
          opacity: isSubmitting ? 0.5 : 1,
          transition: 'background 0.3s ease',
          borderRadius: 0,
        }}
        onMouseEnter={(e) => {
          if (!isSubmitting) {
            e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSubmitting) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        Decline
      </button>

      {/* Error message */}
      {state === 'error' && (
        <p
          style={{
            color: '#f87171',
            fontSize: '14px',
            fontWeight: 300,
            lineHeight: 1.75,
            textAlign: 'center',
            marginTop: '4px',
          }}
        >
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  )
}
