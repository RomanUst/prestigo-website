'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useBookingStore } from '@/lib/booking-store'
import OAuthButtons from '@/components/auth/OAuthButtons'

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
  const { nextStep, prevStep } = useBookingStore()

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        sessionStorage.removeItem('booking_deeplink')
        nextStep()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    setSending(false)
    if (error) {
      setOtpError('Something went wrong. Please try again.')
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
      setOtpError('Invalid or expired code. Please try again.')
    } else {
      sessionStorage.removeItem('booking_deeplink')
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
      setPwError('Invalid email or password.')
    } else {
      sessionStorage.removeItem('booking_deeplink')
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
      setRegError('Could not create account. ' + error.message)
      return
    }

    // If email confirmation is disabled and session is returned, advance immediately
    if (data.session) {
      sessionStorage.removeItem('booking_deeplink')
      nextStep()
    } else {
      setRegDone(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Divider
  // ---------------------------------------------------------------------------

  const divider = (
    <div
      style={{
        position: 'relative',
        margin: '20px 0',
        borderTop: '1px solid var(--anthracite-light)',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          position: 'relative',
          top: '-9px',
          display: 'inline-block',
          backgroundColor: 'var(--anthracite)',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--warmgrey)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        or
      </span>
    </div>
  )

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
        Sign in
      </button>
      <button type="button" style={topTabStyle(topTab === 'register')} onClick={() => setTopTab('register')}>
        Create account
      </button>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Register — success state
  // ---------------------------------------------------------------------------

  if (topTab === 'register' && regDone) {
    return (
      <div style={{ maxWidth: 400 }}>
        {topTabs}
        <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: '14px', color: 'var(--warmgrey)', lineHeight: 1.75 }}>
          Account created. Check your email to confirm, then sign in.
        </p>
        <button type="button" style={{ ...ghostButtonStyle, marginTop: 20 }}
          onClick={() => { setTopTab('signin'); setRegDone(false) }}>
          Sign in
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // OTP — code entry state
  // ---------------------------------------------------------------------------

  if (topTab === 'signin' && signInMethod === 'otp' && otpSent) {
    return (
      <div style={{ maxWidth: 400 }}>
        {topTabs}
        <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--warmgrey)', lineHeight: 1.6, marginBottom: 20 }}>
          We sent a 6-digit code to <strong style={{ color: 'var(--offwhite)' }}>{otpEmail}</strong>.
        </p>
        <form onSubmit={handleVerifyOtp}>
          <div style={fieldWrap}>
            <label htmlFor="otp-code" style={labelStyle}>Enter code</label>
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
              placeholder="000000"
            />
            {otpError && (
              <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{otpError}</p>
            )}
          </div>
          {submitBtn('Verify code')}
        </form>
        <button
          type="button"
          style={{ ...ghostButtonStyle, marginTop: 10 }}
          onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError('') }}
        >
          Use a different email
        </button>
        <button
          type="button"
          style={{ ...ghostButtonStyle, marginTop: 8 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--copper)'; e.currentTarget.style.color = 'var(--offwhite)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--anthracite-light)'; e.currentTarget.style.color = 'var(--warmgrey)' }}
          onClick={prevStep}
        >
          ← Back to vehicle selection
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main form
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 400 }}>
      {topTabs}

      {/* Sign in */}
      {topTab === 'signin' && (
        <>
          <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
            <button type="button" style={subTabStyle(signInMethod === 'otp')} onClick={() => setSignInMethod('otp')}>
              Send code
            </button>
            <button type="button" style={subTabStyle(signInMethod === 'password')} onClick={() => setSignInMethod('password')}>
              Use password
            </button>
          </div>

          {signInMethod === 'otp' && (
            <form onSubmit={handleSendOtp}>
              <div style={fieldWrap}>
                <label htmlFor="otp-email" style={labelStyle}>Email</label>
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
              {submitBtn('Send code')}
            </form>
          )}

          {signInMethod === 'password' && (
            <form onSubmit={handlePassword}>
              <div style={fieldWrap}>
                <label htmlFor="pw-email" style={labelStyle}>Email</label>
                <input id="pw-email" name="email" type="email" required autoComplete="email" style={inputStyle} />
              </div>
              <div style={fieldWrap}>
                <label htmlFor="pw-password" style={labelStyle}>Password</label>
                <input id="pw-password" name="password" type="password" required autoComplete="current-password" style={inputStyle} />
                {pwError && (
                  <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{pwError}</p>
                )}
              </div>
              {submitBtn('Sign in')}
            </form>
          )}
        </>
      )}

      {/* Create account */}
      {topTab === 'register' && (
        <form onSubmit={handleRegister}>
          <div style={fieldWrap}>
            <label htmlFor="reg-email" style={labelStyle}>Email</label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label htmlFor="reg-password" style={labelStyle}>Password</label>
            <input id="reg-password" name="password" type="password" required autoComplete="new-password" style={inputStyle} />
            {regError && (
              <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 4 }} role="alert">{regError}</p>
            )}
          </div>
          {submitBtn('Create account')}
        </form>
      )}

      {divider}
      <OAuthButtons returnTo="/book" />

      {/* Back — same visual style as OAuth buttons */}
      <button
        type="button"
        style={{ ...ghostButtonStyle, marginTop: 8 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--copper)'; e.currentTarget.style.color = 'var(--offwhite)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--anthracite-light)'; e.currentTarget.style.color = 'var(--warmgrey)' }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        onClick={prevStep}
      >
        ← Back to vehicle selection
      </button>
    </div>
  )
}
