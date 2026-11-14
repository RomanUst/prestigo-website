'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuotesTable, type QuoteRow } from '@/components/admin/quotes/QuotesTable'
import { QUOTE_STATUS_BADGE } from '@/components/admin/quotes/QuoteStatusBadge'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'

// Phase 92-14 (QUOTE-01, QUOTE-06): the operator's quote list. The (dashboard) layout runs the admin gate and mounts the
// sidebar; this page only loads /api/admin/quotes (the server checks the admin session again) and renders QuotesTable.

const SEARCH_DEBOUNCE_MS = 300
const PAGE_LIMIT = 50

interface QuoteListAnswer {
  quotes: QuoteRow[]
  total: number
}

// Same values as QUOTE_LEAD_CHANNELS / QUOTE_CURRENCIES on the server (lib/quotes); the server stays the authority.
const LEAD_CHANNELS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' },
]
const CURRENCIES: { value: string; label: string }[] = [
  { value: 'eur', label: 'EUR' },
  { value: 'czk', label: 'CZK' },
]
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_CREATE_FAILED = 'Could not create the quote. Nothing was saved. Try again.'

/** The plain sentence of a refused create: the server's field names for a 400, a generic line otherwise. */
function createErrorText(status: number, body: { details?: { fieldErrors?: Record<string, unknown> } } | null): string {
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 400) {
    const fields = Object.keys(body?.details?.fieldErrors ?? {})
    return fields.length > 0
      ? `Check these fields and try again: ${fields.join(', ')}.`
      : 'Check the client details and try again.'
  }
  return COPY_CREATE_FAILED
}

const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }

/** QUOTE-01: the start of the builder flow. The server resolves the language default (D-09). */
function NewQuoteForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState('')
  const [currency, setCurrency] = useState('eur')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)

  function problem(): string | null {
    if (!firstName.trim()) return "Enter the client's first name."
    if (!lastName.trim()) return "Enter the client's last name."
    if (!EMAIL_SHAPE.test(email.trim())) return "Enter the client's email address."
    if (!channel) return 'Choose how the client reached you.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const invalid = problem()
    if (invalid) {
      setError(invalid)
      return
    }
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const phoneTrimmed = phone.trim()
      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
          },
          lead_channel: channel,
          currency,
        }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body && typeof body.id === 'string') {
        onCreated(body.id)
        return
      }
      setError(createErrorText(res.status, body))
    } catch {
      setError(COPY_CREATE_FAILED)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const fieldStyle: React.CSSProperties = { ...inputBaseStyle, fontWeight: 400 }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="New quote"
      style={{
        backgroundColor: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '32px',
      }}
    >
      <div style={{ ...labelStyle, marginBottom: '16px' }}>New quote</div>
      <div style={formGrid}>
        <div>
          <label htmlFor="nq-first" style={labelStyle}>First name</label>
          <input id="nq-first" type="text" autoComplete="off" maxLength={100} value={firstName} disabled={submitting}
            onChange={(e) => setFirstName(e.target.value)} {...focusRingHandlers} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="nq-last" style={labelStyle}>Last name</label>
          <input id="nq-last" type="text" autoComplete="off" maxLength={100} value={lastName} disabled={submitting}
            onChange={(e) => setLastName(e.target.value)} {...focusRingHandlers} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="nq-email" style={labelStyle}>Email</label>
          <input id="nq-email" type="email" autoComplete="off" maxLength={200} value={email} disabled={submitting}
            onChange={(e) => setEmail(e.target.value)} {...focusRingHandlers} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="nq-phone" style={labelStyle}>Phone</label>
          <input id="nq-phone" type="tel" autoComplete="off" maxLength={50} value={phone} disabled={submitting}
            onChange={(e) => setPhone(e.target.value)} {...focusRingHandlers} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="nq-channel" style={labelStyle}>Lead channel</label>
          <select id="nq-channel" value={channel} disabled={submitting} onChange={(e) => setChannel(e.target.value)} style={fieldStyle}>
            <option value="" disabled>Select channel…</option>
            {LEAD_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nq-currency" style={labelStyle}>Currency</label>
          <select id="nq-currency" value={currency} disabled={submitting} onChange={(e) => setCurrency(e.target.value)} style={fieldStyle}>
            {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" style={{ ...errorStyle, marginTop: '16px' }}>{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        style={{
          ...outlineButtonStyle,
          marginTop: '16px',
          background: 'var(--admin-accent)',
          color: 'var(--admin-on-accent)',
          border: 'none',
          opacity: submitting ? 0.7 : 1,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Working…' : 'Create quote'}
      </button>
    </form>
  )
}

export default function QuotesPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  // Bumped when an answer shows the rows on screen are stale, so the list is read again.
  const [reloadTick, setReloadTick] = useState(0)

  // The search box refetches after a short pause, so each keystroke does not send a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchText])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) })
    if (status) params.set('status', status)
    if (search) params.set('search', search)
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/quotes?${params.toString()}`, { cache: 'no-store' })
        if (cancelled) return
        if (!res.ok) {
          setLoadError(res.status === 401 || res.status === 403 ? 'Your session has ended. Sign in again.' : 'Could not load the quotes. Try again.')
          return
        }
        const json = (await res.json()) as QuoteListAnswer
        if (cancelled) return
        setQuotes(Array.isArray(json.quotes) ? json.quotes : [])
        setTotal(typeof json.total === 'number' ? json.total : 0)
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError('Could not load the quotes. Try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, search, reloadTick])

  const reload = useCallback(() => setReloadTick((n) => n + 1), [])
  const markVoided = useCallback((id: string) => {
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, effective_status: 'voided' } : q)))
  }, [])

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '26px',
          fontWeight: 300,
          lineHeight: 1.2,
          color: 'var(--admin-text)',
          letterSpacing: 0,
          marginBottom: '8px',
        }}
      >
        Quotes
      </h1>
      <p
        style={{
          fontSize: '13px',
          fontWeight: 300,
          color: 'var(--admin-text-muted)',
          fontFamily: 'var(--font-montserrat)',
          margin: '0 0 32px 0',
        }}
      >
        Offers you send to clients. A client link works until the quote is paid, expires or you cancel it.
      </p>

      <NewQuoteForm onCreated={(id) => router.push(`/admin/quotes/${id}`)} />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'flex-end',
          marginBottom: '16px',
        }}
      >
        <div style={{ minWidth: '180px' }}>
          <label htmlFor="quotes-status" style={labelStyle}>Status</label>
          <select
            id="quotes-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
          >
            <option value="">All</option>
            {Object.entries(QUOTE_STATUS_BADGE).map(([value, badge]) => (
              <option key={value} value={value}>{badge.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 240px', maxWidth: '360px' }}>
          <label htmlFor="quotes-search" style={labelStyle}>Search</label>
          <input
            id="quotes-search"
            type="search"
            autoComplete="off"
            placeholder="Reference or client email"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            {...focusRingHandlers}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
          />
        </div>
      </div>

      {loadError && (
        <p role="alert" style={{ ...errorStyle, marginBottom: '16px' }}>{loadError}</p>
      )}

      {loading && quotes.length === 0 && !loadError ? (
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: 'var(--admin-text)',
            opacity: 0.4,
          }}
        >
          ...
        </div>
      ) : loadError && quotes.length === 0 ? null : (
        <>
          <QuotesTable quotes={quotes} onVoided={markVoided} onRefetch={reload} />
          {total > quotes.length && (
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: '13px', fontWeight: 300, color: 'var(--admin-text-muted)', marginTop: '8px' }}>
              {`Showing the newest ${quotes.length} of ${total}. Narrow the list with the status or search.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
