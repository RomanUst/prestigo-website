'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CustomToursTable, type CustomTourListRow } from '@/components/admin/custom-tours/CustomToursTable'
import { errorStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'

// Phase 93 (plan 93-33; TRIP-07; UI-SPEC 8.1): the operator's custom-tour inbox. The (dashboard) layout runs the admin gate and
// mounts the sidebar; this page only loads /api/admin/custom-tours (the server checks the admin session again), newest first,
// 50 per page with a keyset cursor, filtered All / Open / Quoted.

type Filter = 'all' | 'open' | 'quoted'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'quoted', label: 'Quoted' },
]

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_LOAD_FAILED = 'Could not load the requests. Try again.'

interface ListAnswer {
  items: CustomTourListRow[]
  nextCursor: string | null
}

const chipBase: React.CSSProperties = {
  minHeight: '36px',
  padding: '0 16px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--admin-text)',
  border: '1px solid var(--admin-border-strong)',
}

const chipSelected: React.CSSProperties = {
  ...chipBase,
  background: 'var(--admin-accent-tint-strong)',
  color: 'var(--admin-accent-text)',
  border: '1px solid var(--admin-accent-border)',
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-lg)',
        backgroundColor: 'var(--admin-surface)',
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        fontWeight: 300,
      }}
    >
      {filtered ? (
        <div style={{ color: 'var(--admin-text)' }}>No requests match this filter.</div>
      ) : (
        <>
          <div style={{ color: 'var(--admin-text)', marginBottom: '8px' }}>No custom-tour requests yet.</div>
          <div style={{ color: 'var(--admin-text-muted)' }}>Requests from the site appear here.</div>
        </>
      )}
    </div>
  )
}

export default function CustomToursPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<CustomTourListRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped by Retry so the first page is read again.
  const [reloadTick, setReloadTick] = useState(0)
  // A late answer for a filter the operator already left must not overwrite the list.
  const generation = useRef(0)

  useEffect(() => {
    const mine = ++generation.current
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/custom-tours?status=${filter}`, { cache: 'no-store' })
        if (mine !== generation.current) return
        if (!res.ok) {
          setItems([])
          setNextCursor(null)
          setLoadError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_LOAD_FAILED)
          return
        }
        const json = (await res.json()) as ListAnswer
        if (mine !== generation.current) return
        setItems(Array.isArray(json.items) ? json.items : [])
        setNextCursor(typeof json.nextCursor === 'string' ? json.nextCursor : null)
      } catch {
        if (mine === generation.current) {
          setItems([])
          setNextCursor(null)
          setLoadError(COPY_LOAD_FAILED)
        }
      } finally {
        if (mine === generation.current) setLoading(false)
      }
    })()
  }, [filter, reloadTick])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    const mine = generation.current
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/custom-tours?status=${filter}&cursor=${encodeURIComponent(nextCursor)}`, { cache: 'no-store' })
      if (mine !== generation.current) return
      if (!res.ok) {
        setLoadError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_LOAD_FAILED)
        return
      }
      const json = (await res.json()) as ListAnswer
      if (mine !== generation.current) return
      setItems((prev) => [...prev, ...(Array.isArray(json.items) ? json.items : [])])
      setNextCursor(typeof json.nextCursor === 'string' ? json.nextCursor : null)
      setLoadError(null)
    } catch {
      if (mine === generation.current) setLoadError(COPY_LOAD_FAILED)
    } finally {
      setLoadingMore(false)
    }
  }, [filter, nextCursor, loadingMore])

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
        Custom tours
      </h1>
      <p
        style={{
          fontSize: '13px',
          fontWeight: 300,
          color: 'var(--admin-text-muted)',
          fontFamily: 'var(--font-montserrat)',
          margin: '0 0 24px 0',
        }}
      >
        Requests from the site for a tour of the client&apos;s own. Answer each with a quote.
      </p>

      <div role="radiogroup" aria-label="Filter" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            style={filter === f.value ? chipSelected : chipBase}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div style={{ marginBottom: '16px' }}>
          <p role="alert" style={errorStyle}>{loadError}</p>
          <button type="button" onClick={() => setReloadTick((n) => n + 1)} style={{ ...outlineButtonStyle, marginTop: '8px' }}>
            Retry
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div data-testid="custom-tours-loading" aria-busy="true" style={{ display: 'grid', gap: '12px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: '56px', borderRadius: 'var(--admin-radius-lg)', background: 'var(--admin-hover)' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        loadError ? null : <EmptyState filtered={filter !== 'all'} />
      ) : (
        <>
          <CustomToursTable requests={items} />
          {nextCursor && (
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ ...outlineButtonStyle, opacity: loadingMore ? 0.7 : 1, cursor: loadingMore ? 'not-allowed' : 'pointer' }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
