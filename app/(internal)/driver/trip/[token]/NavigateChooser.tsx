'use client'

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import { googleMapsDirectionsUrl, wazeNavigationUrl } from '@/lib/driver-nav-url'
import type { NavigationTarget } from '@/lib/driver-nav-url'

export interface NavigateChooserProps {
  title: 'Navigate to pickup' | 'Navigate to drop-off'
  address: string
  target: NavigationTarget
  onClose: () => void
}

const optionStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 500,
  lineHeight: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
  border: '1px solid var(--admin-border-strong)',
  background: 'transparent',
  color: 'var(--admin-text)',
  textDecoration: 'none',
}

const FOCUSABLE = 'button:not([disabled]), a[href]'

/**
 * Google Maps / Waze chooser for a trip stop (D-18 as amended 2026-11-03, 87-UAT gap 2). Bottom sheet
 * built like ConfirmStepDialog. Both options are plain anchors (no script-opened windows) so in-app
 * browsers handle them natively; rel=noopener noreferrer keeps the trip token out of any Referer, and
 * only the destination is ever put into the URL (T-87-37, T-87-51).
 */
export default function NavigateChooser({ title, address, target, onClose }: NavigateChooserProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    return () => {
      opener?.focus?.()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="driver-dialog-scrim"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--admin-scrim)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="driver-dialog-sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 480,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          boxShadow: 'var(--admin-shadow-sheet)',
          padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
          color: 'var(--admin-text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--driver-fs-heading)',
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
            overflowWrap: 'anywhere',
          }}
        >
          {address}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            ref={firstRef}
            href={googleMapsDirectionsUrl(target)}
            target="_blank"
            rel="noopener noreferrer"
            data-driver-focus=""
            onClick={onClose}
            style={optionStyle}
          >
            Google Maps
            <ExternalLink size={20} aria-hidden="true" />
          </a>
          <a
            href={wazeNavigationUrl(target)}
            target="_blank"
            rel="noopener noreferrer"
            data-driver-focus=""
            onClick={onClose}
            style={optionStyle}
          >
            Waze
            <ExternalLink size={20} aria-hidden="true" />
          </a>
          <button type="button" data-driver-focus="" onClick={onClose} style={{ ...optionStyle, fontWeight: 400 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
