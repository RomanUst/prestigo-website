'use client'

import { Suspense, useActionState, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import OAuthButtons from '@/components/auth/OAuthButtons'
import Nav from '@/components/Nav'
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  sendPasswordReset,
} from './actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'magic' | 'password' | 'register' | 'reset'

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

const fieldWrapStyle: React.CSSProperties = {
  marginBottom: '16px',
}

const errorStyle: React.CSSProperties = {
  color: '#e74c3c',
  fontSize: '12px',
  marginTop: '4px',
}

// ---------------------------------------------------------------------------
// Login Page
// ---------------------------------------------------------------------------

function LoginPageInner() {
  const t = useTranslations('Auth.login')
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return-to')
  const locale = useLocale()

  const [mode, setMode] = useState<Mode>('magic')
  const [accountType, setAccountType] = useState<'personal' | 'corporate'>('personal')
  const [emailForSuccess, setEmailForSuccess] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  // Magic-link action state
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink.bind(null, locale), null)
  // Password sign-in action state
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword.bind(null, locale), null)
  // Register action state
  const [regState, regAction, regPending] = useActionState(signUpWithPassword.bind(null, locale), null)
  // Password reset action state
  const [resetState, resetAction, resetPending] = useActionState(sendPasswordReset.bind(null, locale), null)

  // ---------------------------------------------------------------------------
  // Shared card layout
  // ---------------------------------------------------------------------------

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    padding: '48px 32px',
    backgroundColor: 'var(--anthracite-mid)',
    borderRadius: '8px',
    border: '1px solid var(--anthracite-light)',
  }

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--anthracite)',
    fontFamily: 'var(--font-montserrat)',
    padding: '24px 16px',
  }

  // ---------------------------------------------------------------------------
  // Divider
  // ---------------------------------------------------------------------------

  const divider = (
    <div
      style={{
        position: 'relative',
        margin: '24px 0',
        borderTop: '1px solid var(--anthracite-light)',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          position: 'relative',
          top: '-9px',
          display: 'inline-block',
          backgroundColor: 'var(--anthracite-mid)',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--warmgrey)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {t('divider')}
      </span>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Brand header
  // ---------------------------------------------------------------------------

  const brandHeader = (label: string) => (
    <>
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
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {label}
      </p>
    </>
  )

  // ---------------------------------------------------------------------------
  // Tab toggle
  // ---------------------------------------------------------------------------

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    fontSize: '11px',
    color: active ? 'var(--offwhite)' : 'var(--warmgrey)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '4px 0',
    borderBottom: active ? '1px solid var(--copper)' : '1px solid transparent',
    fontFamily: 'var(--font-montserrat)',
    transition: 'color 0.15s ease',
  })

  const tabs = (
    <div
      style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '24px',
      }}
    >
      <button
        type="button"
        style={tabStyle(mode === 'magic')}
        onClick={() => setMode('magic')}
      >
        {t('tabSendLink')}
      </button>
      <button
        type="button"
        style={tabStyle(mode === 'password')}
        onClick={() => setMode('password')}
      >
        {t('tabUsePassword')}
      </button>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Submit button helper
  // ---------------------------------------------------------------------------

  const submitBtn = (label: string, pending: boolean) => (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-primary"
      style={{
        width: '100%',
        opacity: pending ? 0.7 : 1,
        cursor: pending ? 'wait' : 'pointer',
        pointerEvents: pending ? 'none' : 'auto',
      }}
    >
      {label}
    </button>
  )

  // ---------------------------------------------------------------------------
  // Mode: magic-link
  // ---------------------------------------------------------------------------

  if (mode === 'magic' && magicState?.success) {
    return (
      <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
        <div style={cardStyle}>
          {brandHeader(t('subtitle'))}
          <h2
            style={{
              fontSize: '18px',
              color: 'var(--offwhite)',
              fontFamily: 'var(--font-cormorant)',
              marginBottom: '12px',
              textAlign: 'center',
            }}
          >
            {t('checkEmailHeading')}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--warmgrey)',
              textAlign: 'center',
              lineHeight: 1.75,
            }}
          >
            {t('checkEmailBody', { email: emailForSuccess })}
          </p>
        </div>
      </main>
    )
  }

  if (mode === 'magic') {
    return (
      <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
        <div style={cardStyle}>
          {brandHeader(t('subtitle'))}
          {tabs}
          <form
            action={(fd: FormData) => {
              setEmailForSuccess(fd.get('email') as string)
              return magicAction(fd)
            }}
          >
            <div style={fieldWrapStyle}>
              <label htmlFor="magic-email" style={labelStyle}>
                {t('emailLabel')}
              </label>
              <input
                id="magic-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                ref={emailRef}
                style={inputStyle}
                aria-describedby={magicState?.error ? 'magic-error' : undefined}
              />
              {magicState?.error && (
                <p id="magic-error" style={errorStyle} role="alert">
                  {magicState.error}
                </p>
              )}
            </div>

            {submitBtn(t('sendLinkButton'), magicPending)}
          </form>

          <p
            style={{
              marginTop: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--warmgrey)',
            }}
          >
            {t('noAccountPrompt')}{' '}
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--copper-light)',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'var(--font-montserrat)',
                padding: 0,
              }}
              onClick={() => setMode('register')}
            >
              {t('createAccountLink')}
            </button>
          </p>

          {divider}
          <OAuthButtons returnTo={returnTo ?? undefined} />
        </div>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Mode: password sign-in
  // ---------------------------------------------------------------------------

  if (mode === 'password') {
    return (
      <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
        <div style={cardStyle}>
          {brandHeader(t('subtitle'))}
          {tabs}
          <form action={pwAction} className="animate-step-enter">
            {returnTo && (
              <input type="hidden" name="return-to" value={returnTo} />
            )}

            <div style={fieldWrapStyle}>
              <label htmlFor="pw-email" style={labelStyle}>
                {t('emailLabel')}
              </label>
              <input
                id="pw-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                style={inputStyle}
                aria-describedby={pwState?.error ? 'pw-error' : undefined}
              />
            </div>

            <div style={fieldWrapStyle}>
              <label htmlFor="pw-password" style={labelStyle}>
                {t('passwordLabel')}
              </label>
              <input
                id="pw-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                style={inputStyle}
              />
              {pwState?.error && (
                <p id="pw-error" style={errorStyle} role="alert">
                  {pwState.error}
                </p>
              )}
            </div>

            <p
              style={{
                textAlign: 'right',
                marginBottom: '20px',
                marginTop: '-8px',
              }}
            >
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--warmgrey)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'var(--font-montserrat)',
                  padding: 0,
                }}
                onClick={() => setMode('reset')}
              >
                {t('forgotPasswordLink')}
              </button>
            </p>

            {submitBtn(t('signInButton'), pwPending)}
          </form>

          <p
            style={{
              marginTop: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--warmgrey)',
            }}
          >
            {t('noAccountPrompt')}{' '}
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--copper-light)',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'var(--font-montserrat)',
                padding: 0,
              }}
              onClick={() => setMode('register')}
            >
              {t('createAccountLink')}
            </button>
          </p>

          {divider}
          <OAuthButtons returnTo={returnTo ?? undefined} />
        </div>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Mode: register
  // ---------------------------------------------------------------------------

  if (mode === 'register') {
    if (regState?.success) {
      return (
        <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
          <div style={cardStyle}>
            {brandHeader(t('subtitle'))}
            <h2
              style={{
                fontSize: '18px',
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-cormorant)',
                marginBottom: '12px',
                textAlign: 'center',
              }}
            >
              {t('checkEmailHeading')}
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--warmgrey)',
                textAlign: 'center',
                lineHeight: 1.75,
              }}
            >
              {t('checkEmailBody', { email: emailForSuccess })}
            </p>
          </div>
        </main>
      )
    }

    return (
      <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
        <div style={cardStyle}>
          {brandHeader(t('subtitle'))}
          <form
            action={(fd: FormData) => {
              setEmailForSuccess(fd.get('email') as string)
              return regAction(fd)
            }}
            className="animate-step-enter"
          >
            <div style={fieldWrapStyle}>
              <label htmlFor="reg-email" style={labelStyle}>
                {t('emailLabel')}
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                style={inputStyle}
                aria-describedby={regState?.error ? 'reg-error' : undefined}
              />
            </div>

            <div style={fieldWrapStyle}>
              <label htmlFor="reg-password" style={labelStyle}>
                {t('passwordLabel')}
              </label>
              <input
                id="reg-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                style={inputStyle}
              />
              {regState?.error && (
                <p id="reg-error" style={errorStyle} role="alert">
                  {regState.error}
                </p>
              )}
            </div>

            {/* Account type toggle */}
            <div style={{ ...fieldWrapStyle }}>
              <span style={labelStyle}>{t('accountTypeLabel')}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['personal', 'corporate'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccountType(type)}
                    style={{
                      flex: 1,
                      padding: '10px 20px',
                      border: `1px solid ${accountType === type ? 'var(--copper)' : 'var(--anthracite-light)'}`,
                      borderRadius: '4px',
                      background: 'transparent',
                      color: accountType === type ? 'var(--offwhite)' : 'var(--warmgrey)',
                      fontSize: '11px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase' as const,
                      fontFamily: 'var(--font-montserrat)',
                      cursor: 'pointer',
                      minHeight: '44px',
                      transition: 'border-color 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {type === 'personal' ? t('personalOption') : t('corporateOption')}
                  </button>
                ))}
              </div>
              <input type="hidden" name="account_type" value={accountType} />
            </div>

            {/* Company name (conditional) */}
            {accountType === 'corporate' && (
              <div
                style={{
                  ...fieldWrapStyle,
                  animation: 'stepFadeUp 0.3s ease forwards',
                  opacity: 1,
                }}
              >
                <label htmlFor="reg-company" style={labelStyle}>
                  {t('companyNameLabel')}
                </label>
                <input
                  id="reg-company"
                  name="company_name"
                  type="text"
                  autoComplete="organization"
                  style={inputStyle}
                />
              </div>
            )}

            {submitBtn(t('createAccountButton'), regPending)}
          </form>

          <p
            style={{
              marginTop: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--warmgrey)',
            }}
          >
            {t('alreadyHaveAccountPrompt')}{' '}
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--copper-light)',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'var(--font-montserrat)',
                padding: 0,
              }}
              onClick={() => setMode('magic')}
            >
              {t('signInButton')}
            </button>
          </p>

          {divider}
          <OAuthButtons returnTo={returnTo ?? undefined} />
        </div>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Mode: password reset
  // ---------------------------------------------------------------------------

  if (resetState?.success) {
    return (
      <main role="main" style={pageStyle} className="animate-fade-in">
        <Nav />
        <div style={cardStyle}>
          {brandHeader(t('subtitle'))}
          <p
            style={{
              fontSize: '14px',
              color: 'var(--warmgrey)',
              textAlign: 'center',
              lineHeight: 1.75,
            }}
          >
            {t('resetSentMessage')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main role="main" style={pageStyle} className="animate-fade-in">
      <Nav />
      <div style={cardStyle}>
        {brandHeader(t('subtitle'))}
        <form action={resetAction} className="animate-step-enter">
          <div style={fieldWrapStyle}>
            <label htmlFor="reset-email" style={labelStyle}>
              {t('emailLabel')}
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          {submitBtn(t('sendResetLinkButton'), resetPending)}
        </form>

        <p
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--warmgrey)',
          }}
        >
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--warmgrey)',
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'var(--font-montserrat)',
              padding: 0,
            }}
            onClick={() => setMode('magic')}
          >
            {t('backToSignIn')}
          </button>
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}
