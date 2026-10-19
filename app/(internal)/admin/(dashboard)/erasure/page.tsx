'use client'
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from '@/components/admin/Modal'
import { ErasureSearch, type ErasurePreviewData } from '@/components/admin/ErasureSearch'
import { ErasurePreview } from '@/components/admin/ErasurePreview'
import { ErasureConfirmForm } from '@/components/admin/ErasureConfirmForm'
import { ErasureAuditTable, isErasureActive } from '@/components/admin/ErasureAuditTable'
import type { ErasureLogRow } from '@/lib/erasure-store'

const QUEUED = 'Erasure queued. It usually finishes within a few minutes.'
const LOG_ERROR = 'Could not load the erasure log. Refresh to retry.'
const POLL_MS = 10_000

export default function ErasurePage() {
  const [preview, setPreview] = useState<ErasurePreviewData | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [queued, setQueued] = useState(false)
  const [rows, setRows] = useState<ErasureLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // silent = background refresh (polling, after a confirm): no "Loading..." flash in the table.
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setLoadError(false)
    }
    try {
      const res = await fetch('/api/admin/erasure')
      const json = res.ok ? ((await res.json()) as { rows?: unknown }) : null
      if (json && Array.isArray(json.rows)) {
        setRows(json.rows as ErasureLogRow[])
        setLoadError(false)
      } else {
        setRows([])
        setLoadError(true)
      }
    } catch {
      setRows([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Poll only while a request is Queued or In progress; stop as soon as none is (and on a load error).
  useEffect(() => {
    if (loading || loadError || !rows.some(isErasureActive)) return
    const id = window.setTimeout(() => void load(true), POLL_MS)
    return () => window.clearTimeout(id)
  }, [rows, loading, loadError, load])

  const handlePreview = useCallback((next: ErasurePreviewData | null) => {
    setPreview(next)
    if (next === null) setQueued(false)
  }, [])
  const closeConfirm = useCallback(() => setConfirmOpen(false), [])

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          letterSpacing: '0.08em',
          margin: '0 0 24px',
        }}
      >
        Erasure
      </h1>

      <div
        style={{
          background: 'var(--anthracite)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          padding: '24px',
          margin: '0 0 32px',
          ...bodyText,
          color: 'var(--warmgrey)',
        }}
      >
        Use this page only after you have verified the requester&apos;s identity outside the site, for example by replying
        from their registered email. Erasure removes the person from the site, Chatwoot and EspoCRM and cannot be undone.
      </div>

      <ErasureSearch onPreview={handlePreview} />

      {preview && (
        <ErasurePreview preview={preview} onErase={() => setConfirmOpen(true)} onDiscard={() => setPreview(null)} />
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '48px 0 8px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '20px',
            fontWeight: 400,
            lineHeight: 1.25,
            color: 'var(--offwhite)',
            margin: 0,
          }}
        >
          Erasure log
        </h2>
        <button type="button" onClick={() => void load()} style={secondaryButton}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh erasure log
        </button>
      </div>

      <div aria-live="polite" style={{ ...bodyText, color: 'var(--copper-light)', minHeight: '20px', margin: '0 0 8px' }}>
        {queued && QUEUED}
      </div>

      {loadError ? (
        <div style={{ ...bodyText, color: 'var(--warmgrey)', padding: '32px', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>{LOG_ERROR}</p>
        </div>
      ) : (
        <ErasureAuditTable rows={rows} loading={loading} />
      )}

      <Modal isOpen={confirmOpen && preview !== null} onClose={closeConfirm} title="Erase this person permanently">
        {preview && (
          <ErasureConfirmForm
            key={preview.requestId}
            requestId={preview.requestId}
            email={preview.primaryEmail}
            upcoming={preview.counts.upcoming}
            onKeep={closeConfirm}
            onQueued={() => {
              // The plain email leaves the screen as soon as the erasure is accepted.
              setConfirmOpen(false)
              setPreview(null)
              setQueued(true)
              void load(true)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}
