'use client'
import { useCallback, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { ErasureSearch, type ErasurePreviewData } from '@/components/admin/ErasureSearch'
import { ErasurePreview } from '@/components/admin/ErasurePreview'
import { ErasureConfirmForm } from '@/components/admin/ErasureConfirmForm'

const QUEUED = 'Erasure queued. It usually finishes within a few minutes.'

export default function ErasurePage() {
  const [preview, setPreview] = useState<ErasurePreviewData | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [queued, setQueued] = useState(false)

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

      <div aria-live="polite" style={{ ...bodyText, color: 'var(--copper-light)', minHeight: '20px', margin: '24px 0 0' }}>
        {queued && QUEUED}
      </div>

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
