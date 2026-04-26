'use client'

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react'
import { trackMetaEvent } from '@/components/MetaPixel'
import type { QuotePayload } from '@/lib/email-quote'

type State = 'IDLE' | 'EXPANDED' | 'LOADING' | 'SUCCESS' | 'ERROR'

interface EmailQuoteCaptureProps {
  quote: QuotePayload
}

export function EmailQuoteCapture({ quote }: EmailQuoteCaptureProps) {
  const [state, setState] = useState<State>('IDLE')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('') // bots will fill this
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state === 'EXPANDED') inputRef.current?.focus()
  }, [state])

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && state === 'EXPANDED') {
      setState('IDLE')
      triggerRef.current?.focus()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setState('LOADING')

    const eventId = crypto.randomUUID()
    try {
      const res = await fetch('/api/quote-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          quote,
          eventId,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          website: honeypot,
        }),
      })
      if (!res.ok) { setState('ERROR'); return }

      // Pixel + GA4 fire AFTER API success — same eventId as server CAPI call
      trackMetaEvent('Lead', { value: quote.price, currency: 'EUR' }, eventId)
      const w = window as unknown as { gtag?: (...args: unknown[]) => void }
      if (typeof w.gtag === 'function') {
        w.gtag('event', 'quote_emailed', {
          class: quote.vehicleClass,
          service_type: quote.serviceType,
          price: quote.price,
        })
      }
      setState('SUCCESS')
    } catch {
      setState('ERROR')
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────

  if (state === 'SUCCESS') {
    return (
      <div
        role="status"
        style={{
          background: 'rgba(184,115,51,0.08)',
          border: '1px solid var(--copper)',
          padding: 16,
          marginTop: 8,
        }}
      >
        <div style={{ color: 'var(--offwhite)', fontSize: 14, fontWeight: 400 }}>
          <span style={{ color: 'var(--copper)' }}>✓</span> Quote sent to your inbox
        </div>
        <div
          style={{
            color: 'var(--warmgrey)',
            fontSize: 12,
            fontWeight: 300,
            lineHeight: 1.6,
            marginTop: 4,
          }}
        >
          Check your email for fare details and a direct booking link.
        </div>
      </div>
    )
  }

  if (state === 'IDLE') {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setState('EXPANDED')}
        aria-expanded={false}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: 8,
          color: 'var(--copper-light)',
          fontSize: 11,
          fontFamily: 'inherit',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        EMAIL THIS QUOTE →
      </button>
    )
  }

  // EXPANDED / LOADING / ERROR share the form layout
  return (
    <div onKeyDown={handleKey} style={{ marginTop: 8 }}>
      <label htmlFor="quote-email" className="sr-only">
        Your email address
      </label>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          id="quote-email"
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={state === 'ERROR' ? 'quote-email-error' : undefined}
          style={{
            flex: 1,
            fontSize: 16,
            padding: '12px 14px',
            background: 'var(--anthracite)',
            color: 'var(--offwhite)',
            border: '1px solid var(--anthracite-light)',
            fontFamily: 'inherit',
          }}
        />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={state === 'LOADING'}
          aria-busy={state === 'LOADING'}
          aria-label={state === 'LOADING' ? 'Sending quote...' : 'Send quote'}
          style={{ minHeight: 44 }}
        >
          {state === 'LOADING' ? '⋯' : 'SEND QUOTE'}
        </button>
      </form>
      <div
        style={{
          fontSize: 12,
          color: 'var(--warmgrey)',
          fontWeight: 300,
          marginTop: 8,
        }}
      >
        We&apos;ll email your fare summary with a booking link.
      </div>
      {state === 'ERROR' && (
        <div
          id="quote-email-error"
          style={{
            fontSize: 12,
            color: 'var(--copper-light)',
            fontWeight: 300,
            marginTop: 8,
          }}
        >
          ⚠ Could not send — please try again.
        </div>
      )}
    </div>
  )
}
