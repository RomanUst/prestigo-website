'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'

// Phase 94 plan 94-02 (D-05, DCAB-01, UI-SPEC "Screen Contract: Sign-in"): email -> 6-digit code -> cabinet.
// English only (D-14), colours only var(--admin-*) / var(--status-*). The answer to "send code" is identical for
// every email, so the response body is never read: only its status picks the screen.

interface LoginFormProps {
  next: string
  offersContext: boolean
  ended: boolean
}

type Step = 'email' | 'code'

const RESEND_SECONDS = 30
const RATE_LIMIT_TEXT = 'Too many attempts. Wait a few minutes and try again.'
const SEND_NETWORK_TEXT = 'Could not send the code. Check your connection and try again.'
const VERIFY_NETWORK_TEXT = 'Could not sign in. Check your connection and try again.'

const bodyText: CSSProperties = {
  margin: 0,
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--admin-text-muted)',
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--admin-font-heading)',
  fontSize: 'var(--driver-fs-display)',
  fontWeight: 500,
  lineHeight: 1.1,
  color: 'var(--admin-text)',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 500,
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
}

const fieldBase: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  background: 'var(--admin-input-bg)',
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
}

const primaryButton: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: 'var(--admin-accent)',
  border: '1px solid var(--admin-accent)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-on-accent)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 500,
  cursor: 'pointer',
}

const outlineButton: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: 'transparent',
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  cursor: 'pointer',
}

const textButton: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--admin-accent-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 500,
  cursor: 'pointer',
}

function disabledStyle(disabled: boolean): CSSProperties {
  return disabled ? { opacity: 0.5, cursor: 'default' } : {}
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LoginForm({ next, offersContext, ended }: LoginFormProps) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<null | 'send' | 'resend' | 'verify'>(null)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [focusCode, setFocusCode] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  // Repeat taps are ignored while a request is open (state alone lags one render behind).
  const inFlight = useRef(false)

  // Desktop only: on a phone the keyboard would cover the screen on load.
  useEffect(() => {
    const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
    if (fine) emailRef.current?.focus()
  }, [])

  // One interval per countdown run (it restarts only when the countdown goes from idle to running).
  const cooling = cooldown > 0
  useEffect(() => {
    if (!cooling) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooling])

  // After a failed sign-in the field is re-enabled by this render, then focused.
  useEffect(() => {
    if (focusCode > 0) codeRef.current?.focus()
  }, [focusCode])

  const requestCode = useCallback(
    async (kind: 'send' | 'resend') => {
      if (inFlight.current) return
      const value = email.trim()
      if (!/^[^\s@]+@[^\s@]+$/.test(value)) {
        setError('Enter a valid email address.')
        return
      }
      inFlight.current = true
      setBusy(kind)
      setError(null)
      setResent(false)
      try {
        const res = await fetch('/api/driver/cabinet/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value }),
        })
        if (res.status === 200) {
          setCode('')
          setCooldown(RESEND_SECONDS)
          if (kind === 'send') setStep('code')
          else setResent(true)
        } else if (res.status === 400) {
          setError('Enter a valid email address.')
        } else if (res.status === 429) {
          setError(RATE_LIMIT_TEXT)
        } else {
          setError(SEND_NETWORK_TEXT)
        }
      } catch {
        setError(SEND_NETWORK_TEXT)
      } finally {
        inFlight.current = false
        setBusy(null)
      }
    },
    [email],
  )

  const verify = useCallback(
    async (digits: string) => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy('verify')
      setError(null)
      setResent(false)
      let failed = true
      try {
        const res = await fetch('/api/driver/cabinet/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), code: digits }),
        })
        if (res.status === 200) {
          failed = false
          // Full page load so the new cookie is read by the server.
          window.location.assign(next)
          return
        }
        if (res.status === 429) {
          setError(RATE_LIMIT_TEXT)
        } else if (res.status === 400) {
          let reason = ''
          try {
            reason = ((await res.json()) as { error?: string }).error ?? ''
          } catch {
            reason = ''
          }
          setError(
            reason === 'code_expired'
              ? 'This code has expired or was used too many times. Send a new code.'
              : 'That code is not correct. Check it and try again.',
          )
        } else {
          setError(VERIFY_NETWORK_TEXT)
        }
      } catch {
        setError(VERIFY_NETWORK_TEXT)
      } finally {
        inFlight.current = false
        if (failed) {
          setBusy(null)
          setCode('')
          setFocusCode((n) => n + 1)
        }
      }
    },
    [email, next],
  )

  function onEmailSubmit(e: FormEvent) {
    e.preventDefault()
    void requestCode('send')
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void verify(digits)
  }

  function onCodeSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length === 6) void verify(code)
  }

  function useDifferentEmail() {
    setStep('email')
    setCode('')
    setError(null)
    setResent(false)
    setCooldown(0)
  }

  const sending = busy === 'send'
  const verifying = busy === 'verify'
  const resending = busy === 'resend'
  const emailHasAt = email.includes('@')

  const errorLine = error ? (
    <p role="alert" style={{ ...bodyText, color: 'var(--status-danger-fg)' }}>
      {error}
    </p>
  ) : null

  const spinner = <LoaderCircle size={20} aria-hidden="true" className="driver-spin" />

  const footer = (
    <div style={{ marginTop: 8, textAlign: 'center' }}>
      <p style={{ ...labelStyle, fontWeight: 400, margin: 0 }}>
        No code? Check your spam folder, or ask the office to set up your access.
      </p>
      <a
        href={BUSINESS_TEL_URL}
        data-driver-focus=""
        aria-label={`Call the office, ${BUSINESS_PHONE_DISPLAY}`}
        style={{
          minHeight: 48,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 500,
          color: 'var(--admin-accent-text)',
        }}
      >
        Call the office
      </a>
    </div>
  )

  const container: CSSProperties = {
    boxSizing: 'border-box',
    flex: 1,
    padding: '48px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }

  if (step === 'email') {
    return (
      <div style={container}>
        {ended ? (
          <p role="status" style={bodyText}>
            Your session ended. Sign in again.
          </p>
        ) : null}
        <h1 style={headingStyle}>Sign in</h1>
        <p style={bodyText}>
          {offersContext
            ? 'Sign in to see your new ride offer. We will send a 6-digit code to your email.'
            : 'Enter the email the office has on file for you. We will send you a 6-digit code.'}
        </p>
        <form onSubmit={onEmailSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="driver-email" style={labelStyle}>
              Email
            </label>
            <input
              ref={emailRef}
              id="driver-email"
              data-driver-focus=""
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              value={email}
              disabled={sending}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...fieldBase, height: 48, padding: '0 16px', ...disabledStyle(sending) }}
            />
          </div>
          <button
            type="submit"
            data-driver-focus=""
            disabled={!emailHasAt || sending}
            aria-busy={sending || undefined}
            style={{ ...primaryButton, ...disabledStyle(!emailHasAt || sending) }}
          >
            {sending ? (
              <>
                {spinner}
                Sending…
              </>
            ) : (
              'Send code'
            )}
          </button>
          {errorLine}
        </form>
        {footer}
      </div>
    )
  }

  const resendLabel =
    resending ? 'Sending…' : cooldown > 0 ? `Send a new code in ${formatCountdown(cooldown)}` : 'Send a new code'
  const resendDisabled = cooldown > 0 || busy !== null

  return (
    <div style={container}>
      <h1 style={headingStyle}>Enter your code</h1>
      <p style={bodyText}>
        {'If '}
        <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{email.trim()}</span>
        {' is set up for the cabinet, we sent a 6-digit code. It works for 10 minutes.'}
      </p>
      <form onSubmit={onCodeSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="driver-code" style={labelStyle}>
            6-digit code
          </label>
          <input
            ref={codeRef}
            id="driver-code"
            data-driver-focus=""
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            disabled={verifying}
            onChange={(e) => onCodeChange(e.target.value)}
            style={{
              ...fieldBase,
              height: 56,
              padding: '0 16px',
              textAlign: 'center',
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--driver-fs-display)',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.25em',
              ...disabledStyle(verifying),
            }}
          />
        </div>
        <button
          type="submit"
          data-driver-focus=""
          disabled={code.length !== 6 || verifying}
          aria-busy={verifying || undefined}
          style={{ ...primaryButton, ...disabledStyle(code.length !== 6 || verifying) }}
        >
          {verifying ? (
            <>
              {spinner}
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
        {errorLine}
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          data-driver-focus=""
          disabled={resendDisabled}
          aria-busy={resending || undefined}
          onClick={() => void requestCode('resend')}
          style={{ ...outlineButton, ...disabledStyle(resendDisabled) }}
        >
          {resending ? spinner : null}
          {resendLabel}
        </button>
        {resent ? (
          <p role="status" style={{ ...labelStyle, fontWeight: 400, margin: 0, textAlign: 'center' }}>
            A new code is on its way.
          </p>
        ) : null}
        <button type="button" data-driver-focus="" onClick={useDifferentEmail} style={textButton}>
          Use a different email
        </button>
      </div>
      {footer}
    </div>
  )
}
