'use client'

import { useRef, useState } from 'react'
import { LoaderCircle, LogOut } from 'lucide-react'
import { DRIVER_HELP_STORAGE_KEY } from '@/lib/driver-help-contract'

// Phase 94 plan 94-12 (DCAB-02; D-05, UI-SPEC You item 5): ends the cabinet session on this phone. No confirmation
// dialog: signing in again is one email code. The stored chat identity goes too (shared phone, D-07); the server
// route clears the session row and the cw_* chat cookies.

export default function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function signOut() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fetch('/api/driver/cabinet/sign-out', { method: 'POST' })
    } catch {
      // The sign-in page is the next stop either way: a dead session is re-checked server-side on every request.
    }
    try {
      window.sessionStorage.removeItem(DRIVER_HELP_STORAGE_KEY)
    } catch {
      // Storage blocked: nothing stored to remove.
    }
    window.location.assign('/driver/login')
  }

  return (
    <section style={{ margin: '0 24px 16px' }}>
      <button
        type="button"
        data-driver-focus=""
        onClick={() => void signOut()}
        disabled={busy}
        aria-busy={busy}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 48,
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          border: '1px solid var(--admin-border-strong)',
          borderRadius: 'var(--admin-radius-md)',
          background: 'transparent',
          color: 'var(--admin-text)',
          fontFamily: 'inherit',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 500,
          lineHeight: 1.5,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <LoaderCircle size={20} className="driver-spin" aria-hidden="true" />
        ) : (
          <LogOut size={20} aria-hidden="true" />
        )}
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--driver-fs-label)',
          fontWeight: 400,
          lineHeight: 1.4,
          color: 'var(--admin-text-muted)',
        }}
      >
        You will need a new email code to sign in again.
      </p>
    </section>
  )
}
