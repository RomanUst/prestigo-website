'use client'
import { useRef, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import { TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN } from '@/lib/tours/types'

// Phase 93 (plan 93-09; TRIP-05; UI-SPEC 7.1): create a draft tour. The operator types only the middle of the address,
// between the fixed texts "/services/" and "-day-trip", plus the English title. The server stays authoritative (slug
// pattern, uniqueness); the check here only saves a round trip.

const PREFIX = '/services/'
const SUFFIX = '-day-trip'

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_TAKEN = 'This address is already used by another tour.'
const COPY_BAD_ADDRESS = 'Use lowercase letters, numbers and single hyphens.'
const COPY_ENTER_TITLE = 'Enter the English title.'
const COPY_CREATE_FAILED = 'Could not create the tour. Nothing was saved. Try again.'

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (id: string) => void
}

export function NewTourModal({ isOpen, onClose, onCreated }: Props) {
  const [address, setAddress] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)

  const slug = `${address.trim()}${SUFFIX}`

  function close() {
    if (busy.current) return
    setAddress('')
    setTitle('')
    setError(null)
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!address.trim() || slug.length > TOUR_SLUG_MAX_LENGTH || !TOUR_SLUG_PATTERN.test(slug)) {
      setError(COPY_BAD_ADDRESS)
      return
    }
    if (!title.trim()) {
      setError(COPY_ENTER_TITLE)
      return
    }
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: title.trim() }),
      })
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null
      if (res.ok && body && typeof body.id === 'string') {
        onCreated(body.id)
        return
      }
      if (res.status === 401 || res.status === 403) setError(COPY_SESSION)
      else if (res.status === 409) setError(COPY_TAKEN)
      else if (res.status === 400) setError(COPY_BAD_ADDRESS)
      else setError(COPY_CREATE_FAILED)
    } catch {
      setError(COPY_CREATE_FAILED)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const fixedText: React.CSSProperties = {
    fontFamily: 'var(--font-montserrat)',
    fontSize: 'var(--admin-fs-body)',
    color: 'var(--admin-text-muted)',
    whiteSpace: 'nowrap',
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="New tour">
      <form onSubmit={submit} noValidate aria-label="New tour">
        <label htmlFor="nt-address" style={labelStyle}>Address</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={fixedText}>{PREFIX}</span>
          <input
            id="nt-address"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={TOUR_SLUG_MAX_LENGTH}
            value={address}
            disabled={submitting}
            onChange={(e) => setAddress(e.target.value)}
            {...focusRingHandlers}
            style={{ ...inputBaseStyle, fontWeight: 400, flex: 1, minWidth: 0 }}
          />
          <span style={fixedText}>{SUFFIX}</span>
        </div>
        <p
          style={{
            margin: '8px 0 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 'var(--admin-fs-label)',
            color: 'var(--admin-text-muted)',
          }}
        >
          {address.trim() ? `${PREFIX}${slug}` : `${PREFIX}…${SUFFIX}`}
        </p>

        <label htmlFor="nt-title" style={labelStyle}>English title</label>
        <input
          id="nt-title"
          type="text"
          autoComplete="off"
          maxLength={120}
          value={title}
          disabled={submitting}
          onChange={(e) => setTitle(e.target.value)}
          {...focusRingHandlers}
          style={{ ...inputBaseStyle, fontWeight: 400 }}
        />

        {error && <p role="alert" style={{ ...errorStyle, marginTop: '16px' }}>{error}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '24px' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              ...outlineButtonStyle,
              background: 'var(--admin-accent)',
              color: 'var(--admin-on-accent)',
              border: 'none',
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Working…' : 'Create draft'}
          </button>
          <button type="button" onClick={close} disabled={submitting} style={outlineButtonStyle}>
            Close without creating
          </button>
        </div>
      </form>
    </Modal>
  )
}
