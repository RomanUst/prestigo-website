'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NewTourModal } from '@/components/admin/tours/NewTourModal'
import { ToursTable, type TourListRow } from '@/components/admin/tours/ToursTable'
import { errorStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'

// Phase 93 (plan 93-09; TRIP-05): the operator's tours overview. The (dashboard) layout runs the admin gate and mounts the
// sidebar; this page only loads /api/admin/tours (the server checks the admin session again) and renders the table.

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_LOAD_FAILED = 'Could not load tours. Try again.'

const accentButtonStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
  border: 'none',
}

function SkeletonRows() {
  return (
    <div data-testid="tours-loading" aria-busy="true" style={{ display: 'grid', gap: '12px' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ height: '72px', borderRadius: 'var(--admin-radius-lg)', background: 'var(--admin-hover)' }} />
      ))}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-lg)',
        backgroundColor: 'var(--admin-surface)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: 'var(--admin-fs-body)',
          color: 'var(--admin-text)',
          marginBottom: '8px',
        }}
      >
        No tours yet.
      </div>
      <div
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: 'var(--admin-fs-body)',
          color: 'var(--admin-text-muted)',
          marginBottom: '16px',
        }}
      >
        Create the first tour. It stays a draft until you publish it.
      </div>
      <button type="button" onClick={onNew} style={accentButtonStyle}>
        New tour
      </button>
    </div>
  )
}

export default function ToursPage() {
  const router = useRouter()
  const [tours, setTours] = useState<TourListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  // Bumped by Retry so the list is read again.
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/admin/tours', { cache: 'no-store' })
        if (cancelled) return
        if (!res.ok) {
          setLoadError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_LOAD_FAILED)
          return
        }
        const json = (await res.json()) as { tours?: TourListRow[] }
        if (cancelled) return
        setTours(Array.isArray(json.tours) ? json.tours : [])
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError(COPY_LOAD_FAILED)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const retry = useCallback(() => {
    setLoadError(null)
    setReloadTick((n) => n + 1)
  }, [])

  const openNew = useCallback(() => setModalOpen(true), [])
  const closeNew = useCallback(() => setModalOpen(false), [])

  const sessionEnded = loadError === COPY_SESSION

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--admin-fs-display)',
            fontWeight: 'var(--admin-fw-heading)',
            lineHeight: 1.2,
            color: 'var(--admin-text)',
          }}
        >
          Tours
        </h1>
        <button type="button" onClick={openNew} style={accentButtonStyle}>
          New tour
        </button>
      </div>

      {loadError && (
        <div style={{ marginBottom: '16px' }}>
          <p role="alert" style={errorStyle}>{loadError}</p>
          {!sessionEnded && (
            <button type="button" onClick={retry} style={{ ...outlineButtonStyle, marginTop: '8px' }}>
              Retry
            </button>
          )}
        </div>
      )}

      {loading && tours.length === 0 && !loadError ? (
        <SkeletonRows />
      ) : loadError && tours.length === 0 ? null : tours.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : (
        <ToursTable tours={tours} />
      )}

      <NewTourModal isOpen={modalOpen} onClose={closeNew} onCreated={(id) => router.push(`/admin/tours/${id}`)} />
    </div>
  )
}
