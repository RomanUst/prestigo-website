'use client'
import { useRef, useState } from 'react'
import { errorStyle } from '@/components/admin/adminFieldStyles'
import type { PhoneMergeRow } from '@/lib/identity-admin-store'

interface SplitContactFormProps {
  merge: PhoneMergeRow
  /** The split was accepted by the API (200). */
  onSplit: () => void
  /** "Keep contact merged": close without any request. */
  onKeep: () => void
}

const SPLIT_ERROR = 'Could not split this contact. Try again; if it keeps failing, check the Outbox.'

export function SplitContactForm({ merge, onSplit, onKeep }: SplitContactFormProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setPending(true)
    setFailed(false)
    let ok = false
    try {
      const res = await fetch('/api/admin/identities/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: merge.mergedEmail }),
      })
      ok = res.ok
    } catch {
      ok = false
    }
    submittingRef.current = false
    setPending(false)
    if (ok) onSplit()
    else setFailed(true)
  }

  const contact = merge.contactEmail ?? 'the original contact'
  const phone = merge.phone ?? 'The number'

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ ...bodyText, color: 'var(--offwhite)', margin: '0 0 16px' }}>
        {`${merge.mergedEmail} will become a separate contact from ${contact}. The number ${phone} will be marked as shared and never used to match contacts again. EspoCRM and Chatwoot update within a few minutes. Past Chatwoot conversations stay with the original contact.`}
      </p>
      {failed && (
        <div role="alert" style={{ ...errorStyle, margin: '0 0 16px' }}>
          {SPLIT_ERROR}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onKeep} style={secondaryButton}>
          Keep contact merged
        </button>
        <button
          type="submit"
          disabled={pending}
          style={{ ...primaryButton, opacity: pending ? 0.7 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
        >
          {pending ? 'Splitting...' : 'Split contact'}
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
