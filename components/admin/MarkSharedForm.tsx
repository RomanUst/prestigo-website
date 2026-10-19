'use client'
import { useEffect, useRef, useState } from 'react'
import { inputBaseStyle, labelStyle, errorStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'

interface MarkSharedFormProps {
  /** The number was marked (200). */
  onMarked: () => void
  /** "Don't mark number": close without any request. */
  onKeep: () => void
}

const PHONE_HELPER = 'Include the country code. Shared numbers are never used to merge contacts.'
// The API answers 422 invalid_phone with the full message (including a format example); this is
// only the fallback for a missing message and for an empty field.
const PHONE_FALLBACK = 'Enter the number with country code.'
const ALREADY_SHARED = 'That number is already marked as shared.'
const GENERIC_ERROR = 'Could not mark this number. Try again.'

const fieldStyle: React.CSSProperties = { ...inputBaseStyle, fontWeight: 400 }

export function MarkSharedForm({ onMarked, onKeep }: MarkSharedFormProps) {
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    phoneRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setPhoneError(null)
    if (!phone.trim()) {
      setPhoneError(PHONE_FALLBACK)
      return
    }

    submittingRef.current = true
    setPending(true)
    let success = false
    let message: string | null = null
    try {
      const trimmedNote = note.trim()
      const res = await fetch('/api/admin/identities/shared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmedNote ? { phone: phone.trim(), note: trimmedNote } : { phone: phone.trim() }),
      })
      if (res.ok) {
        success = true
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown }
        if (res.status === 422 && json.error === 'already_shared') message = ALREADY_SHARED
        else if (res.status === 422 && json.error === 'invalid_phone') {
          message = typeof json.message === 'string' && json.message ? json.message : PHONE_FALLBACK
        } else message = GENERIC_ERROR
      }
    } catch {
      message = GENERIC_ERROR
    }
    submittingRef.current = false
    setPending(false)
    if (success) onMarked()
    else setPhoneError(message)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label htmlFor="mark-shared-phone" style={labelStyle}>
            Phone number
          </label>
          <input
            id="mark-shared-phone"
            ref={phoneRef}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={50}
            aria-describedby="mark-shared-phone-help"
            aria-invalid={phoneError !== null}
            style={fieldStyle}
            {...focusRingHandlers}
          />
          <div id="mark-shared-phone-help" style={helperStyle}>
            {PHONE_HELPER}
          </div>
          {phoneError && (
            <div role="alert" style={errorStyle}>
              {phoneError}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="mark-shared-note" style={labelStyle}>
            Note (optional)
          </label>
          <input
            id="mark-shared-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="e.g. TravelExpress desk"
            style={fieldStyle}
            {...focusRingHandlers}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <button type="button" onClick={onKeep} style={secondaryButton}>
            Don&apos;t mark number
          </button>
          <button
            type="submit"
            disabled={pending}
            style={{ ...primaryButton, opacity: pending ? 0.7 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
          >
            {pending ? 'Marking...' : 'Mark number as shared'}
          </button>
        </div>
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

const primaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'var(--copper)',
  color: 'var(--anthracite)',
  border: 'none',
  borderRadius: '4px',
  ...bodyText,
}
