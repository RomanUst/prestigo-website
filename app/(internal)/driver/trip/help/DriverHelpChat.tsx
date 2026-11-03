'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LoaderCircle, MessageCircle } from 'lucide-react'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { loadDriverHelpConfig } from '@/lib/driver-help-contract'

// 87-UI-SPEC Amendment B: English hard-coded copy (D-20).
const WIDGET_TEXTS = {
  welcomeTitle: 'Prestigo office',
  welcomeDescription: 'Write to us about this trip.',
  replyTimeHint: 'We usually reply in a few minutes.',
}

const ERROR_COPY = 'Chat is not available right now. Call the office instead.'

type HelpState = 'checking' | 'missing' | 'opening' | 'open' | 'error'

const buttonBase: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  lineHeight: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
  textDecoration: 'none',
}

const primaryButton: CSSProperties = {
  ...buttonBase,
  fontWeight: 500,
  border: '1px solid var(--admin-accent)',
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
}

const secondaryButton: CSSProperties = {
  ...buttonBase,
  fontWeight: 400,
  border: '1px solid var(--admin-border-strong)',
  background: 'transparent',
  color: 'var(--admin-text)',
}

const bodyText: CSSProperties = {
  margin: 0,
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
}

/**
 * Driver Help chat page (87-UAT gap 3). Reached only by a full page load from the trip screen, so no
 * Chatwoot SDK instance ever lives in a document whose address carries the trip token. The identity is
 * read from sessionStorage (handed over by the trip page); the widget loader is imported only here,
 * inside the effect that runs after the driver's tap (Phase 77 D-02). Nothing about the page address,
 * the referrer or the visit is sent to Chatwoot.
 */
export default function DriverHelpChat() {
  const [state, setState] = useState<HelpState>('checking')
  const [canGoBack, setCanGoBack] = useState(false)
  const attemptRef = useRef(0)

  const open = useCallback(async () => {
    const config = loadDriverHelpConfig()
    if (!config) {
      setState('missing')
      return
    }
    const attempt = ++attemptRef.current
    setState('opening')
    try {
      const { openDriverHelpChat } = await import('@/components/chat/load-chat-widget')
      await openDriverHelpChat({ config, texts: WIDGET_TEXTS })
      if (attempt === attemptRef.current) setState('open')
    } catch {
      if (attempt === attemptRef.current) setState('error')
    }
  }, [])

  useEffect(() => {
    setCanGoBack(window.history.length > 1)
    void open()
  }, [open])

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <header style={{ height: 32, display: 'flex', alignItems: 'center' }}>
        <span className="admin-wordmark">PRESTIGO</span>
      </header>

      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-heading)',
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        Chat with the office
      </h1>

      {state === 'missing' ? (
        <p style={{ ...bodyText, color: 'var(--admin-text-muted)' }}>
          Open Help from your trip link to chat with the office.
        </p>
      ) : (
        <p style={{ ...bodyText, color: 'var(--admin-text-muted)' }}>
          Your messages go straight to the Prestigo office. Keep this page open to see the reply.
        </p>
      )}

      {state === 'opening' ? (
        <p role="status" style={{ ...bodyText, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LoaderCircle size={20} className="driver-spin" aria-hidden="true" />
          Opening chat…
        </p>
      ) : null}

      {state === 'error' ? (
        <p role="alert" style={{ ...bodyText, color: 'var(--status-danger-fg)' }}>
          {ERROR_COPY}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state === 'open' ? (
          <button type="button" data-driver-focus="" onClick={() => void open()} style={primaryButton}>
            <MessageCircle size={20} aria-hidden="true" />
            Open chat
          </button>
        ) : null}
        {state === 'error' ? (
          <button type="button" data-driver-focus="" onClick={() => void open()} style={primaryButton}>
            Try again
          </button>
        ) : null}

        <a
          href={BUSINESS_TEL_URL}
          data-driver-focus=""
          style={{ ...secondaryButton, flexDirection: 'column', gap: 0, fontWeight: 500 }}
        >
          <span>Call the office</span>
          <span
            style={{
              fontSize: 'var(--driver-fs-label)',
              fontWeight: 400,
              lineHeight: 1.4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {BUSINESS_PHONE_DISPLAY}
          </span>
        </a>

        {canGoBack ? (
          <button
            type="button"
            data-driver-focus=""
            onClick={() => window.history.back()}
            style={secondaryButton}
          >
            Back to trip
          </button>
        ) : null}
      </div>
    </main>
  )
}
