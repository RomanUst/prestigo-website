'use client'
import { useRef, useState } from 'react'
import { inputBaseStyle, labelStyle, errorStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'

/** What POST /api/admin/erasure/preview returns on success (82-13). */
export interface ErasurePreviewData {
  requestId: string
  primaryEmail: string
  counts: {
    bookings: number
    upcoming: number
    inquiries: number
    quoteLeads: number
    hasAccount: boolean
  }
}

interface ErasureSearchProps {
  /** Called with the new preview, or with null when a new search starts (an old preview is cleared). */
  onPreview: (preview: ErasurePreviewData | null) => void
}

const VALIDATION = 'Enter an email address or a phone number with country code.'
const NOT_FOUND = 'No customer found for that email or phone. Check the spelling; the person may already be erased.'
const IN_PROGRESS = 'An erasure for this person is already in progress.'
const UNCONFIGURED = 'Erasure is not set up on this server yet. Ask your developer to configure it.'
const GENERIC = 'Could not search for this person. Try again.'

const sharedMessage = (n: number) =>
  `This number is shared by ${n} contacts, so it cannot identify one person. Search by email instead.`

function isPreview(value: unknown): value is ErasurePreviewData {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const c = v.counts as Record<string, unknown> | undefined
  return (
    typeof v.requestId === 'string' &&
    typeof v.primaryEmail === 'string' &&
    typeof c === 'object' &&
    c !== null &&
    typeof c.bookings === 'number' &&
    typeof c.upcoming === 'number' &&
    typeof c.inquiries === 'number' &&
    typeof c.quoteLeads === 'number' &&
    typeof c.hasAccount === 'boolean'
  )
}

export function ErasureSearch({ onPreview }: ErasureSearchProps) {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    onPreview(null)
    setMessage(null)
    const trimmed = query.trim()
    if (!trimmed) {
      setMessage(VALIDATION)
      return
    }

    submittingRef.current = true
    setPending(true)
    let preview: ErasurePreviewData | null = null
    let error: string | null = null
    try {
      const res = await fetch('/api/admin/erasure/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && isPreview(json)) {
        preview = json
      } else if (res.status === 422 && (json.error === 'invalid_query' || json.error === 'invalid')) {
        error = VALIDATION
      } else if (res.status === 422 && json.error === 'not_found') {
        error = NOT_FOUND
      } else if (res.status === 422 && json.error === 'shared_phone') {
        error = sharedMessage(typeof json.identities === 'number' ? json.identities : 2)
      } else if (res.status === 422 && json.error === 'already_in_progress') {
        error = IN_PROGRESS
      } else if (res.status === 503 && json.error === 'erasure_unconfigured') {
        error = UNCONFIGURED
      } else {
        error = GENERIC
      }
    } catch {
      error = GENERIC
    }
    submittingRef.current = false
    setPending(false)
    if (preview) onPreview(preview)
    else setMessage(error)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="erasure-query" style={labelStyle}>
        Email or phone
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <input
            id="erasure-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name@example.com or +420 777 123 456"
            maxLength={200}
            autoComplete="off"
            aria-invalid={message !== null}
            aria-describedby={message ? 'erasure-query-message' : undefined}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
            {...focusRingHandlers}
          />
          {message && (
            <div id="erasure-query-message" role="alert" style={errorStyle}>
              {message}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          style={{ ...primaryButton, opacity: pending ? 0.7 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
        >
          {pending ? 'Searching...' : 'Preview erasure'}
        </button>
      </div>
    </form>
  )
}

const primaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'var(--copper)',
  color: 'var(--anthracite)',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}
