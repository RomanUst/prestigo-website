'use client'
import { useEffect, useState } from 'react'
import { QuotesTable, type QuoteRow } from '@/components/admin/quotes/QuotesTable'
import { QUOTE_STATUS_BADGE } from '@/components/admin/quotes/QuoteStatusBadge'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'

// Phase 92-14 (QUOTE-01, QUOTE-06): the operator's quote list. The (dashboard) layout runs the admin gate and mounts the
// sidebar; this page only loads /api/admin/quotes (the server checks the admin session again) and renders QuotesTable.

const SEARCH_DEBOUNCE_MS = 300
const PAGE_LIMIT = 50

interface QuoteListAnswer {
  quotes: QuoteRow[]
  total: number
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')

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
  }, [status, search])

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
          <QuotesTable quotes={quotes} />
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
