'use client'
import { useState } from 'react'
import { Send } from 'lucide-react'

// Sends the "Booking confirmed" email again with the booking's current details — e.g. after the pickup date was
// moved at the client's request (a trip edit itself never emails the client unless "notify" was ticked).
// Only for a confirmed booking; the server refuses anything else (422) and a repeat within 10 minutes (429).
interface ResendConfirmationSectionProps {
  bookingId: string
  status: string
  clientEmail: string
  onSent?: () => void
}

type SendState = 'idle' | 'confirm' | 'sending' | 'sent' | 'error'

const ERROR_TEXT: Record<string, string> = {
  recently_sent: 'Already sent in the last 10 minutes.',
  not_confirmed: 'Only a confirmed booking can be re-sent.',
  send_failed: 'The email service refused the send — try again.',
}

const buttonStyle: React.CSSProperties = {
  height: '32px',
  padding: '0 16px',
  background: 'transparent',
  border: '1px solid var(--copper)',
  color: 'var(--copper)',
  borderRadius: '2px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  marginTop: '6px',
  display: 'block',
}

export function ResendConfirmationSection({ bookingId, status, clientEmail, onSent }: ResendConfirmationSectionProps) {
  const [state, setState] = useState<SendState>('idle')
  const [errorText, setErrorText] = useState('')

  if (status !== 'confirmed') return null

  async function send() {
    setState('sending')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/resend-confirmation`, { method: 'POST' })
      if (res.ok) {
        setState('sent')
        onSent?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      setErrorText(ERROR_TEXT[data?.error as string] ?? 'Send failed — try again.')
      setState('error')
    } catch {
      setErrorText('Send failed — try again.')
      setState('error')
    }
  }

  return (
    <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
      {state === 'confirm' ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)' }}>
            Email the confirmation to {clientEmail}?
          </span>
          <button type="button" onClick={send} style={buttonStyle}>Send</button>
          <button
            type="button"
            onClick={() => setState('idle')}
            style={{ ...buttonStyle, borderColor: 'var(--anthracite-light)', color: 'var(--warmgrey)' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={state === 'sending'}
          onClick={() => setState('confirm')}
          style={{ ...buttonStyle, opacity: state === 'sending' ? 0.5 : 1, cursor: state === 'sending' ? 'not-allowed' : 'pointer' }}
        >
          <Send size={12} />
          {state === 'sending' ? 'Sending...' : 'Resend confirmation'}
        </button>
      )}
      {state === 'sent' && (
        <span style={{ ...hintStyle, color: 'var(--status-ok-fg)' }}>Confirmation sent with the current trip details.</span>
      )}
      {state === 'error' && <span style={{ ...hintStyle, color: 'var(--status-danger-fg)' }}>{errorText}</span>}
      {(state === 'idle' || state === 'confirm') && (
        <span style={{ ...hintStyle, color: 'var(--warmgrey)' }}>
          Sends the &quot;Booking confirmed&quot; email again with the current date, time and route.
        </span>
      )}
    </div>
  )
}
