'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { PUSH_HINT_DISMISSED_KEY, isIosSafariOutsideHomeScreen, readPushState } from '@/lib/driver-cabinet/push-client'

// Phase 94 plan 94-13 (DCAB-10; D-09, UI-SPEC Offers "Notification hint"): a one-time invitation at the top of the
// Offers tab. It only decides whether to show itself, after mount and from read-only checks; it never registers a
// worker and never asks for permission (that happens from the switch in You, inside a tap). Nothing renders on the
// server pass, so there is no hydration mismatch. Colours only through var(--status-info-*) / var(--admin-*).

type Mode = 'hidden' | 'default' | 'ios'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(PUSH_HINT_DISMISSED_KEY) !== null
  } catch {
    return false
  }
}

const control = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 500,
  lineHeight: 1.5,
  textDecoration: 'none',
  cursor: 'pointer',
} as const

export default function OffersNotificationHint({ pushEnabled }: { pushEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>('hidden')

  useEffect(() => {
    if (!pushEnabled || wasDismissed()) return
    let cancelled = false
    async function decide() {
      if (isIosSafariOutsideHomeScreen()) {
        if (!cancelled) setMode('ios')
        return
      }
      // Only the very first state: supported, permission still undecided and no subscription yet.
      if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
      if ((await readPushState()) !== 'off') return
      if (!cancelled) setMode('default')
    }
    void decide()
    return () => {
      cancelled = true
    }
  }, [pushEnabled])

  function dismiss() {
    try {
      window.localStorage.setItem(PUSH_HINT_DISMISSED_KEY, '1')
    } catch {
      // Storage blocked: the hint only hides for this visit.
    }
    setMode('hidden')
  }

  if (!pushEnabled || mode === 'hidden') return null

  return (
    <div
      style={{
        margin: '0 24px 16px',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflowWrap: 'anywhere',
        background: 'var(--status-info-bg)',
        color: 'var(--status-info-fg)',
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        <Bell size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          {mode === 'ios'
            ? 'Add Prestigo to your Home Screen to get notifications.'
            : 'Turn on notifications to hear about new rides right away.'}
        </span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          href="/driver/you#notifications"
          data-driver-focus=""
          style={{
            ...control,
            border: '1px solid var(--admin-border-strong)',
            background: 'transparent',
            color: 'var(--admin-text)',
          }}
        >
          {mode === 'ios' ? 'Show me how' : 'Set up notifications'}
        </Link>
        <button
          type="button"
          data-driver-focus=""
          onClick={dismiss}
          style={{
            ...control,
            border: 'none',
            background: 'transparent',
            color: 'var(--status-info-fg)',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
