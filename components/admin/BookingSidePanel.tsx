'use client'
import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Phase 90 plan 05 (D-02): the right-hand sheet that shows one booking while the view stays visible and
// clickable on the left. Layering: above the sidebar (40-60) and its rail tooltip (70), below Modal (100).
// Pitfall 6: position: fixed breaks inside any ancestor that creates a containing block (see RESEARCH Pitfall 6
// for the property list), so none of those may ever be added to this sheet or to the workspace around it.
// Below 768 px the same CSS makes it a full-width sheet (min(560px, 100vw)); there is no JS width check.

interface BookingSidePanelProps {
  reference: string
  onClose: () => void
  children: React.ReactNode
}

export function BookingSidePanel({ reference, onClose, children }: BookingSidePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Opening moves focus to the close button; the provider returns it to the opener on close.
  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  // Escape closes the panel, but never while a modal dialog (cancel, no-show, complete, driver picker) is open:
  // that dialog's own Escape handler closes it and the panel stays (Pitfall 5). The listener runs in the capture
  // phase so it looks at the DOM before any dialog handler has had a chance to remove the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <aside
      data-testid="booking-panel"
      aria-label={`Booking ${reference}`}
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        width: 'min(560px, 100vw)',
        overflowY: 'auto',
        background: 'var(--admin-surface)',
        boxShadow: 'var(--admin-shadow-sheet)',
        borderLeft: '1px solid var(--admin-border)',
        zIndex: 80,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '8px 8px 8px 20px',
          borderBottom: '1px solid var(--admin-border)',
          background: 'var(--admin-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--admin-fs-heading)',
            fontWeight: 'var(--admin-fw-heading)',
            color: 'var(--admin-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Booking {reference}
        </h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close booking panel"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--admin-text-muted)',
            cursor: 'pointer',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: '16px 20px 24px' }}>{children}</div>
    </aside>
  )
}
