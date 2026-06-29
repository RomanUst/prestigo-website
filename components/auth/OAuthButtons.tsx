'use client'

import { useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'

interface OAuthButtonsProps {
  returnTo?: string
}

export default function OAuthButtons({ returnTo }: OAuthButtonsProps) {
  // Memoize so the browser client isn't re-instantiated on every render.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  async function handleOAuth(provider: 'google' | 'apple') {
    const url = new URL('/auth/callback', window.location.origin)
    if (returnTo) {
      url.searchParams.set('return-to', returnTo)
    }
    // Flag so the return landing can fire a GA4 login event after the redirect
    sessionStorage.setItem('oauth_login_pending', '1')
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: url.toString(),
      },
    })
  }

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'transparent',
    border: '1px solid var(--anthracite-light)',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 400,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        type="button"
        aria-label="Sign in with Google"
        style={buttonStyle}
        onClick={() => handleOAuth('google')}
        onMouseEnter={e => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--copper)'
          el.style.color = 'var(--offwhite)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--anthracite-light)'
          el.style.color = 'var(--warmgrey)'
        }}
        onMouseDown={e => {
          e.currentTarget.style.transform = 'scale(0.97)'
        }}
        onMouseUp={e => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {/* Google G icon (18px inline SVG) */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087C16.6582 14.1518 17.64 11.8945 17.64 9.2045z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8586-3.0477.8586-2.3441 0-4.3282-1.5832-5.036-3.7105H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9574C.3468 6.1732 0 7.5477 0 9s.3468 2.8268.9574 4.0418L3.964 10.71z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5818-2.5818C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

    </div>
  )
}
