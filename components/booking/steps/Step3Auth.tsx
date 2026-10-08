'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@supabase/ssr'
import { useBookingStore } from '@/lib/booking-store'
import OAuthButtons from '@/components/auth/OAuthButtons'
import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { authErrorKey } from '@/lib/auth-error-code'

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

type TopTab = 'signin' | 'register'
type SignInMethod = 'otp' | 'password'

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

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

const fieldWrap: React.CSSProperties = { marginBottom: '16px' }

// Top-level tab (Sign In / Create Account)
const topTabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  background: 'none',
  border: 'none',
  fontSize: '11px',
  color: active ? 'var(--offwhite)' : 'var(--warmgrey)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: '4px 0 6px',
  borderBottom: active ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
  fontFamily: 'var(--font-montserrat)',
  transition: 'color 0.15s ease, border-color 0.15s ease',
})

// Secondary tab (Code / Password)
const subTabStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  fontSize: '10px',
  color: active ? 'var(--offwhite)' : 'var(--warmgrey)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: '3px 0',
  borderBottom: active ? '1px solid var(--copper)' : '1px solid transparent',
  fontFamily: 'var(--font-montserrat)',
  transition: 'color 0.15s ease',
  marginRight: 16,
})

// Ghost button — same visual weight as OAuthButtons
const ghostButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'transparent',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--warmgrey)',
  minHeight: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontFamily: 'var(--font-montserrat)',
  cursor: 'pointer',
  transition: 'border-color 0.15s ease, color 0.15s ease',
}

// ---------------------------------------------------------------------------
// Step3Auth
// ---------------------------------------------------------------------------

export default function Step3Auth() {
  const t = useTranslations('Auth.inWizard')
  const tLogin = useTranslations('Auth.login')
  const tErr = useTranslations('Errors')
  const tAuthErr = useTranslations('Errors.auth')
  const locale = useLocale() as AppLocale
  const { nextStep, prevStep, setGuestMode } = useBookingStore()

  const [loginOpen, setLoginOpen] = useState(false)
  const [topTab, setTopTab] = useState<TopTab>('signin')
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('otp')

  // OTP flow state
  const [otpEmail, setOtpEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')

  // Password sign-in state
  const [pwError, setPwError] = useState('')

  // Register state
  const [regDone, setRegDone] = useState(false)
  const [regError, setRegError] = useState('')

  // Generic loading
  const [sending, setSending] = useState(false)

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  // On mount: set deeplink flag so auth redirects (OAuth) don't reset the wizard.
  // If already signed in, auto-advance to extras.
  useEffect(() => {
    sessionStorage.setItem('booking_deeplink', '1')
    // SEC-04: getUser() re-validates the JWT with Supabase auth server;
    // getSession() only reads localStorage and trusts a stale/revoked token.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        sessionStorage.removeItem('booking_deeplink')
        // OAuth return: flag was set in OAuthButtons before the redirect
        if (sessionStorage.getItem('oauth_login_pending') === '1') {
          sessionStorage.removeItem('oauth_login_pending')
          window.gtag?.('event', 'login', { method: 'oauth' })
        }
        setGuestMode(false)
        nextStep()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Login modal: close on Escape, lock page scroll while open.
  useEffect(() => {
    if (!loginOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLoginOpen(false) }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [loginOpen])

  // ---------------------------------------------------------------------------
  // OTP handlers
  // ---------------------------------------------------------------------------

  async function handleSendOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)
    setOtpError('')
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    setOtpEmail(email)

    // D-07: keep the locale on the magic-link return — build the return-to
    // through the i18n getPathname bridge (never hand-rolled `/book`) so a
    // /ru wizard sign-in returns to /ru/book, not the English root. Uses the
    // same URL + searchParams.set pattern as OAuthButtons.tsx for consistency.
    const redirectUrl = new URL('/auth/callback', window.location.origin)
    redirectUrl.searchParams.set('return-to', getPathname({ locale, href: '/book' }))
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectUrl.toString(),
      },
    })

    setSending(false)
    if (error) {
      setOtpError(tErr('genericRetry'))
    } else {
      setOtpSent(true)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)
    setOtpError('')

    const { error } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpCode,
      type: 'email',
    })

    setSending(false)
    if (error) {
      setOtpError(t('invalidCode'))
    } else {
      sessionStorage.removeItem('booking_deeplink')
      window.gtag?.('event', 'login', { method: 'email_otp' })
      setGuestMode(false)
      nextStep()
    }
  }

  // ---------------------------------------------------------------------------
  // Password sign-in handler
  // ---------------------------------------------------------------------------

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)
    setPwError('')
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    const password = fd.get('password') as string

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSending(false)

    if (error) {
      setPwError(tErr('invalidCredentials'))
    } else {
      sessionStorage.removeItem('booking_deeplink')
      window.gtag?.('event', 'login', { method: 'password' })
      setGuestMode(false)
      nextStep()
    }
  }

  // ---------------------------------------------------------------------------
  // Register handler
  // ---------------------------------------------------------------------------

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)
    setRegError('')
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    const password = fd.get('password') as string

    const { data, error } = await supabase.auth.signUp({ email, password })
    setSending(false)

    if (error) {
      console.error('Step3Auth register error:', error.message)
      setRegError(tAuthErr(authErrorKey(error.code)))
      return
    }

    // If email confirmation is disabled and session is returned, advance immediately
    if (data.session) {
      sessionStorage.removeItem('booking_deeplink')
      window.gtag?.('event', 'sign_up', { method: 'email' })
      setGuestMode(false)
      nextStep()
    } else {
      setRegDone(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Submit button
  // ---------------------------------------------------------------------------

  const submitBtn = (label: string) => (
    <button
      type="submit"
      disabled={sending}
      className="btn-primary"
      style={{ width: '100%', opacity: sending ? 0.7 : 1, cursor: sending ? 'wait' : 'pointer' }}
    >
      {sending ? '…' : label}
    </button>
  )

  // ---------------------------------------------------------------------------
  // Top tabs
  // ---------------------------------------------------------------------------

  const topTabs = (
    <div style={{ display: 'flex', marginBottom: 24 }}>
      <button type="button" style={topTabStyle(topTab === 'signin')} onClick={() => setTopTab('signin')}>
        {tLogin('signInButton')}
      </button>
      <button type="button" style={topTabStyle(topTab === 'register')} onClick={() => setTopTab('register')}>
        {tLogin('createAccountButton')}
      </button>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Register — success state
  // ---------------------------------------------------------------------------

  function renderAuthPanel() {
  if (topTab === 'register' && regDone) {
    return (
      <div>
        {topTabs}
        <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: '14px', color: 'var(--warmgrey)', lineHeight: 1.75 }}>
          {t('registerSuccess')}
        </p>
        <button type="button" style={{ ...ghostButtonStyle, marginTop: 20 }}
          onClick={() => { setTopTab('signin'); setRegDone(false) }}>
          {tLogin('signInButton')}
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // OTP — code entry state
  // ---------------------------------------------------------------------------

  if (topTab === 'signin' && signInMethod === 'otp' && otpSent) {
    return (
      <div>
        {topTabs}
        <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--warmgrey)', lineHeight: 1.6, marginBottom: 20 }}>
          {t.rich('codeSentTo', {
            email: otpEmail,
            strong: (chunks) => <strong style={{ color: 'var(--offwhite)' }}>{chunks}</strong>,
          })}
        </p>
        <form onSubmit={handleVerifyOtp}>
          <div style={fieldWrap}>
            <label htmlFor="otp-code" style={labelStyle}>{t('enterCodeLabel')}</label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              autoComplete="one-time-code"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ ...inputStyle, letterSpacing: '0.3em', fontSize: '20px', textAlign: 'center' }}
              placeholder={t('codePlaceholder')}
            />
            {otpError && (
              <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{otpError}</p>
            )}
          </div>
          {submitBtn(t('verifyCode'))}
        </form>
        <button
          type="button"
          style={{ ...ghostButtonStyle, marginTop: 10 }}
          onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError('') }}
        >
          {t('useDifferentEmail')}
        </button>
      </div>
    )
  }

  // Main form
  return (
    <div>
      {topTabs}

      {/* Sign in */}
      {topTab === 'signin' && (
        <>
          <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
            <button type="button" style={subTabStyle(signInMethod === 'otp')} onClick={() => setSignInMethod('otp')}>
              {t('sendCode')}
            </button>
            <button type="button" style={subTabStyle(signInMethod === 'password')} onClick={() => setSignInMethod('password')}>
              {tLogin('tabUsePassword')}
            </button>
          </div>

          {signInMethod === 'otp' && (
            <form onSubmit={handleSendOtp}>
              <div style={fieldWrap}>
                <label htmlFor="otp-email" style={labelStyle}>{tLogin('emailLabel')}</label>
                <input
                  id="otp-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  style={inputStyle}
                />
                {otpError && (
                  <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{otpError}</p>
                )}
              </div>
              {submitBtn(t('sendCode'))}
            </form>
          )}

          {signInMethod === 'password' && (
            <form onSubmit={handlePassword}>
              <div style={fieldWrap}>
                <label htmlFor="pw-email" style={labelStyle}>{tLogin('emailLabel')}</label>
                <input id="pw-email" name="email" type="email" required autoComplete="email" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label htmlFor="pw-password" style={labelStyle}>{tLogin('passwordLabel')}</label>
                <input id="pw-password" name="password" type="password" required autoComplete="current-password" style={inputStyle} />
                {pwError && (
                  <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{pwError}</p>
                )}
              </div>
              {submitBtn(tLogin('signInButton'))}
            </form>
          )}
        </>
      )}

      {/* Create account */}
      {topTab === 'register' && (
        <form onSubmit={handleRegister}>
          <div style={fieldWrap}>
            <label htmlFor="reg-email" style={labelStyle}>{tLogin('emailLabel')}</label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label htmlFor="reg-password" style={labelStyle}>{tLogin('passwordLabel')}</label>
            <input id="reg-password" name="password" type="password" required autoComplete="new-password" style={inputStyle} />
            {regError && (
              <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{regError}</p>
            )}
          </div>
          {submitBtn(tLogin('createAccountButton'))}
        </form>
      )}

    </div>
  )
  }

  // ---------------------------------------------------------------------------
  // Step view: guest is the primary path, sign-in opens a modal
  // ---------------------------------------------------------------------------

  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = 'var(--copper)'; e.currentTarget.style.color = 'var(--offwhite)' }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = 'var(--anthracite-light)'; e.currentTarget.style.color = 'var(--warmgrey)' }

  return (
    <div style={{ maxWidth: 400 }}>
      {/* 1. Continue as guest — primary */}
      <button
        type="button"
        className="btn-primary"
        style={{ width: '100%' }}
        onClick={() => {
          setGuestMode(true)
          sessionStorage.removeItem('booking_deeplink')
          nextStep()
        }}
      >
        {t('continueAsGuest')}
      </button>

      {/* 2. Continue with Google */}
      <div style={{ marginTop: 10 }}>
        <OAuthButtons returnTo="/book" />
      </div>

      {/* 3. Sign in with email — opens the login modal */}
      <button
        type="button"
        style={{ ...ghostButtonStyle, marginTop: 10 }}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
        onClick={() => setLoginOpen(true)}
        aria-haspopup="dialog"
      >
        {tLogin('signInButton')}
      </button>

      {/* Back */}
      <button
        type="button"
        style={{ ...ghostButtonStyle, marginTop: 10, border: '1px solid transparent' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--offwhite)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--warmgrey)' }}
        onClick={prevStep}
      >
        {t('backToVehicle')}
      </button>

      {/* Portal: the wizard's step-enter animation uses transform, which would
          trap position:fixed inside the step box. */}
      {loginOpen && createPortal(
        <div
          onClick={() => setLoginOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tLogin('signInButton')}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 420,
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              backgroundColor: 'var(--anthracite)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: 6,
              padding: '44px 24px 24px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => setLoginOpen(false)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 36,
                height: 36,
                background: 'none',
                border: 'none',
                color: 'var(--warmgrey)',
                fontSize: 24,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            {renderAuthPanel()}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
