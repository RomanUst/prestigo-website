'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // 'checking' until we confirm a recovery/auth session is present; 'absent'
  // means the page was opened without one (e.g. expired or hand-typed link).
  const [recovery, setRecovery] = useState<'checking' | 'present' | 'absent'>('checking')
  const router = useRouter()

  // Memoize the browser client so it isn't re-instantiated on every render
  // (which would drop in-flight auth listeners and waste connections).
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  // WR-06: only allow updateUser({ password }) when a real recovery/auth
  // session exists. The /auth/callback?type=recovery flow establishes one via
  // verifyOtp before redirecting here; Supabase also emits PASSWORD_RECOVERY on
  // the client when arriving with a recovery hash. If neither is present, send
  // the user back to /login rather than letting the call fail opaquely or act
  // on the wrong session.
  useEffect(() => {
    let active = true

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setRecovery('present')
      }
    })

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      // Defer to onAuthStateChange if it already promoted us to 'present'.
      setRecovery(prev => (prev === 'present' ? prev : data.user ? 'present' : 'absent'))
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (recovery === 'absent') {
      router.replace('/login?error=recovery_session_required')
    }
  }, [recovery, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (recovery !== 'present') return
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message ?? 'Something went wrong. Please try again.')
      return
    }

    setStatus('success')
    setTimeout(() => {
      router.push('/account')
    }, 1500)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: 'var(--anthracite)',
    border: '1px solid var(--anthracite-light)',
    borderRadius: '4px',
    color: 'var(--offwhite)',
    fontSize: '14px',
    fontFamily: 'var(--font-montserrat)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: 'var(--warmgrey)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '48px 32px',
          backgroundColor: 'var(--anthracite-mid)',
          borderRadius: '8px',
          border: '1px solid var(--anthracite-light)',
        }}
        className="animate-fade-in"
      >
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            textAlign: 'center',
            marginBottom: '8px',
            letterSpacing: '0.12em',
            lineHeight: 1.1,
          }}
        >
          PRESTIGO
        </h1>
        <p
          style={{
            fontSize: '11px',
            color: 'var(--warmgrey)',
            textAlign: 'center',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          New password
        </p>

        {status === 'success' ? (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--warmgrey)',
              textAlign: 'center',
              lineHeight: 1.75,
            }}
          >
            Password updated. Redirecting to your account...
          </p>
        ) : recovery === 'checking' ? (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--warmgrey)',
              textAlign: 'center',
              lineHeight: 1.75,
            }}
          >
            Verifying your reset link...
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="new-password" style={labelStyle}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                style={inputStyle}
                aria-describedby={status === 'error' ? 'reset-pw-error' : undefined}
              />
              {status === 'error' && (
                <p
                  id="reset-pw-error"
                  role="alert"
                  style={{ color: '#e74c3c', fontSize: '12px', marginTop: '4px' }}
                >
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={status === 'loading' || recovery !== 'present'}
              aria-busy={status === 'loading'}
              className="btn-primary"
              style={{
                width: '100%',
                opacity: status === 'loading' ? 0.7 : 1,
                cursor: status === 'loading' ? 'wait' : 'pointer',
                pointerEvents: status === 'loading' ? 'none' : 'auto',
              }}
            >
              {status === 'loading' ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
