'use client'

import { useActionState } from 'react'
import { signIn } from './actions'

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null)

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
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
          }}
        >
          PRESTIGO
        </h1>
        <p
          style={{
            fontSize: '12px',
            color: 'var(--warmgrey)',
            textAlign: 'center',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          Admin
        </p>

        <form action={formAction}>
          <label
            htmlFor="email"
            style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--warmgrey)',
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
              backgroundColor: 'var(--anthracite)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              color: 'var(--offwhite)',
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
              fontSize: '11px',
              color: 'var(--warmgrey)',
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
              backgroundColor: 'var(--anthracite)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              color: 'var(--offwhite)',
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
                color: '#e74c3c',
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
              backgroundColor: 'var(--copper)',
              color: 'var(--offwhite)',
              border: 'none',
              borderRadius: '4px',
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
