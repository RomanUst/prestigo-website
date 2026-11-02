'use client'

import { useActionState, useEffect, useState } from 'react'
import { signIn } from './actions'

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null)
  // Where the operator was heading before the middleware sent them here. Read
  // after mount (no useSearchParams, so the page needs no Suspense boundary and
  // stays prerenderable). Untrusted: signIn validates it with safeAdminNext.
  const [next, setNext] = useState('')
  useEffect(() => {
    setNext(new URLSearchParams(window.location.search).get('next') ?? '')
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--admin-bg)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '48px 32px',
          backgroundColor: 'var(--admin-surface)',
          borderRadius: 'var(--admin-radius-lg)',
          border: '1px solid var(--admin-border)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--admin-font-brand)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--admin-text)',
            textAlign: 'center',
            marginBottom: '8px',
            letterSpacing: '0.12em',
          }}
        >
          PRESTIGO
        </h1>
        <p
          style={{
            fontSize: 'var(--admin-fs-label)',
            color: 'var(--admin-text-muted)',
            textAlign: 'center',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          Admin
        </p>

        <form action={formAction}>
          <input type="hidden" name="next" value={next} />
          <label
            htmlFor="email"
            style={{
              display: 'block',
              fontSize: 'var(--admin-fs-label)',
              color: 'var(--admin-text-muted)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{
              width: '100%',
              padding: '12px 14px',
              backgroundColor: 'var(--admin-input-bg)',
              border: '1px solid var(--admin-border-strong)',
              borderRadius: 'var(--admin-radius-md)',
              color: 'var(--admin-text)',
              fontSize: '14px',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: '16px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          <label
            htmlFor="password"
            style={{
              display: 'block',
              fontSize: 'var(--admin-fs-label)',
              color: 'var(--admin-text-muted)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '12px 14px',
              backgroundColor: 'var(--admin-input-bg)',
              border: '1px solid var(--admin-border-strong)',
              borderRadius: 'var(--admin-radius-md)',
              color: 'var(--admin-text)',
              fontSize: '14px',
              fontFamily: 'var(--font-montserrat)',
              marginBottom: '24px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {state?.error && (
            <p
              style={{
                color: 'var(--status-danger-fg)',
                fontSize: '13px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'var(--admin-accent)',
              color: 'var(--admin-on-accent)',
              border: 'none',
              borderRadius: 'var(--admin-radius-md)',
              fontSize: '12px',
              fontFamily: 'var(--font-montserrat)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: pending ? 'wait' : 'pointer',
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
