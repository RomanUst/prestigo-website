'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LoaderCircle, MessageCircle, Phone } from 'lucide-react'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { openDriverHelpPage, saveDriverHelpConfig } from '@/lib/driver-help-contract'

// Phase 94 plan 94-12 (DCAB-10; D-13, UI-SPEC You item 3): the Help section of the You tab. "Chat with the office"
// follows the 87 Amendment B flow: ask the session-gated route for the driver identity, hand it to the tokenless help
// page through sessionStorage and leave with a FULL page load (never the Next router). "Call the office" is a tel:
// link, so it works even when chat is down.

const HELP_CHAT_TIMEOUT_MS = 10_000
const ERROR_COPY = 'Chat is not available right now. Call the office instead.'
const SIGN_IN_URL = `/driver/login?next=${encodeURIComponent('/driver/you')}&ended=1`

type ChatState = 'idle' | 'opening' | 'error'

const row: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  background: 'transparent',
  color: 'var(--admin-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 500,
  lineHeight: 1.5,
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
}

export default function YouHelpSection() {
  const [chat, setChat] = useState<ChatState>('idle')
  const busyRef = useRef(false)

  const openChat = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setChat('opening')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HELP_CHAT_TIMEOUT_MS)
    try {
      const res = await fetch('/api/driver/cabinet/help', { method: 'POST', signal: controller.signal })
      if (res.status === 401) {
        window.location.assign(SIGN_IN_URL)
        return
      }
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      if (res.status === 200 && saveDriverHelpConfig(body)) {
        // Stay "opening" while the browser leaves the page.
        openDriverHelpPage({ from: 'cabinet' })
        return
      }
      busyRef.current = false
      setChat('error')
    } catch {
      busyRef.current = false
      setChat('error')
    } finally {
      clearTimeout(timer)
    }
  }, [])

  // "Back" from the help page can restore this page from the back/forward cache with the row still "Opening chat…".
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      busyRef.current = false
      setChat('idle')
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const opening = chat === 'opening'

  return (
    <section
      aria-labelledby="you-help-heading"
      style={{
        margin: '0 24px 16px',
        padding: 16,
        background: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <h2
        id="you-help-heading"
        style={{
          margin: '0 0 16px',
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-heading)',
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        Help
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          data-driver-focus=""
          onClick={() => void openChat()}
          disabled={opening}
          aria-busy={opening}
          style={{ ...row, ...(opening ? { cursor: 'default', opacity: 0.7 } : null) }}
        >
          {opening ? (
            <LoaderCircle size={20} className="driver-spin" aria-hidden="true" />
          ) : (
            <MessageCircle size={20} aria-hidden="true" />
          )}
          <span>{opening ? 'Opening chat…' : chat === 'error' ? 'Try chat again' : 'Chat with the office'}</span>
        </button>

        {chat === 'error' ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 'var(--driver-fs-body)',
              lineHeight: 1.5,
              color: 'var(--status-danger-fg)',
            }}
          >
            {ERROR_COPY}
          </p>
        ) : null}

        <a href={BUSINESS_TEL_URL} data-driver-focus="" style={row}>
          <Phone size={20} aria-hidden="true" />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Call the office</span>
            <span
              style={{
                fontSize: 'var(--driver-fs-label)',
                fontWeight: 400,
                lineHeight: 1.4,
                color: 'var(--admin-text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {BUSINESS_PHONE_DISPLAY}
            </span>
          </span>
        </a>
      </div>
    </section>
  )
}
