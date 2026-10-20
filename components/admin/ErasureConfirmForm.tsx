'use client'
import { useEffect, useRef, useState } from 'react'
import { inputBaseStyle, labelStyle, errorStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'

interface ErasureConfirmFormProps {
  requestId: string
  /** The primary email of the previewed person: the value the admin must type back. */
  email: string
  /** Upcoming trips in the preview; a second checkbox is required when above zero. */
  upcoming: number
  /** The erasure was accepted by the server (200). */
  onQueued: () => void
  /** "Keep this person": close without any request. */
  onKeep: () => void
}

const CONFIRM_ERROR = 'Could not start the erasure. Nothing was deleted. Try again.'
const IN_PROGRESS = 'An erasure for this person is already in progress.'
const UNCONFIGURED = 'Erasure is not set up on this server yet. Ask your developer to configure it.'

const DESTRUCTIVE = '#f87171'

export function ErasureConfirmForm({ requestId, email, upcoming, onQueued, onKeep }: ErasureConfirmFormProps) {
  const [identityOk, setIdentityOk] = useState(false)
  const [upcomingOk, setUpcomingOk] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const firstCheckboxRef = useRef<HTMLInputElement>(null)

  // Deferred on purpose: Modal records document.activeElement (the "Erase this person..." trigger,
  // for focus return) in its own effect, which runs AFTER this child's effects. Focusing here
  // synchronously would make the checkbox the remembered "trigger".
  useEffect(() => {
    const id = window.setTimeout(() => firstCheckboxRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const needsUpcoming = upcoming > 0
  const emailMatches = typed.trim().toLowerCase() === email.trim().toLowerCase()
  const ready = identityOk && (!needsUpcoming || upcomingOk) && emailMatches

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // The button is disabled until ready; the guard also covers Enter in the text field.
    if (!ready || submittingRef.current) return
    submittingRef.current = true
    setPending(true)
    setError(null)
    let success = false
    let message: string | null = null
    try {
      const res = await fetch('/api/admin/erasure/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          confirmEmail: typed.trim(),
          identityVerified: true,
          ...(needsUpcoming ? { upcomingAcknowledged: true } : {}),
        }),
      })
      if (res.ok) {
        success = true
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: unknown }
        if (res.status === 422 && json.error === 'already_in_progress') message = IN_PROGRESS
        else if (res.status === 503 && json.error === 'erasure_unconfigured') message = UNCONFIGURED
        else message = CONFIRM_ERROR
      }
    } catch {
      message = CONFIRM_ERROR
    }
    submittingRef.current = false
    setPending(false)
    if (success) onQueued()
    else setError(message)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p style={{ ...bodyText, color: 'var(--offwhite)', margin: '0 0 16px', overflowWrap: 'anywhere' }}>
        {`This wipes ${email} from the site, Chatwoot and EspoCRM. Deleted conversations and contacts cannot be restored.`}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '0 0 16px' }}>
        <label style={checkboxLabel}>
          <input
            ref={firstCheckboxRef}
            type="checkbox"
            checked={identityOk}
            onChange={(e) => setIdentityOk(e.target.checked)}
            style={checkboxStyle}
          />
          I verified the requester&apos;s identity outside the site.
        </label>
        {needsUpcoming && (
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={upcomingOk}
              onChange={(e) => setUpcomingOk(e.target.checked)}
              style={checkboxStyle}
            />
            I understand upcoming trips will be anonymised.
          </label>
        )}
      </div>

      <div>
        <label htmlFor="erasure-confirm-email" style={labelStyle}>
          Type the email to confirm
        </label>
        <input
          id="erasure-confirm-email"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={254}
          aria-describedby="erasure-confirm-email-help"
          style={{ ...inputBaseStyle, fontWeight: 400 }}
          {...focusRingHandlers}
        />
        <div id="erasure-confirm-email-help" style={helperStyle}>
          {`Type ${email} exactly.`}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ ...errorStyle, margin: '16px 0 0' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '24px' }}>
        <button type="button" onClick={onKeep} style={secondaryButton}>
          Keep this person
        </button>
        <button
          type="submit"
          disabled={!ready || pending}
          style={{
            ...destructiveButton,
            opacity: !ready || pending ? 0.5 : 1,
            cursor: !ready || pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Erasing...' : 'Erase permanently'}
        </button>
      </div>
    </form>
  )
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const helperStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--warmgrey)',
  marginTop: '4px',
  overflowWrap: 'anywhere',
}

const checkboxLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '44px',
  cursor: 'pointer',
  color: 'var(--offwhite)',
  ...bodyText,
}

const checkboxStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  flexShrink: 0,
  accentColor: DESTRUCTIVE,
  cursor: 'pointer',
}

const secondaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}

const destructiveButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: DESTRUCTIVE,
  color: 'var(--anthracite)',
  border: 'none',
  borderRadius: '4px',
  ...bodyText,
}
