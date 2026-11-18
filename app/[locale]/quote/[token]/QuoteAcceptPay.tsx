'use client'

// The client's acceptance and deposit on the quote page (Phase 92, plan 92-17; QUOTE-03, QUOTE-05; D-08; T-92-54,
// T-92-55, T-92-56).
//
// - One explicit step: the server-rendered consent and terms text (the very text the server stores and hashes), one
//   checkbox and a pay button over a Stripe PaymentElement (card only, the card is saved for the deposit PaymentIntent).
// - The island translates nothing. The page passes every string (Quote.accept.*), the consent text (renderQuoteTerms)
//   and the button label (built on the server with the formatted deposit). No amount is typed here.
// - Order on a press: elements.submit() -> POST /api/quote/accept with cross-checks only (token, displayed version
//   number, displayed deposit, consent true; never an amount or a text) -> stripe.confirmPayment with the secret the
//   server returned. The return URL is /<locale>/quote/done and carries NO token (it goes to Stripe and the bank).
// - The tick is read from a ref at submit time (a stale closure can never send an unticked consent) and is cleared
//   when the server says the quote changed.
// - The bookings are created by the Stripe webhook / reconcile on the server, never by this browser: after a confirmed
//   payment the island only polls POST /api/quote/state every 2 s (60 s at most) and refreshes the page on 'paid'.
// - Nothing about the token or the payment is stored in the browser (no storage, no analytics snapshot).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getPathname, useRouter } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import type { PaymentCurrency } from '@/lib/payments/money'

export interface QuoteAcceptPayCopy {
  heading: string
  /** The pay button label with the deposit already formatted ("Pay deposit {amount}"). */
  button: string
  consentRequired: string
  processing: string
  confirming: string
  declined: string
  error: string
  changed: string
  unavailable: string
}

export interface QuoteAcceptPayProps {
  token: string
  locale: AppLocale
  /** The version number the page displayed (cross-check for the server). */
  versionNo: number
  /** The deposit the page displayed, in minor units (cross-check for the server; the server owns the amount). */
  depositMinor: number
  currency: PaymentCurrency
  /** The consent and terms text exactly as the server rendered, stored and hashed it. */
  consentText: string
  copy: QuoteAcceptPayCopy
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const ACCEPT_ENDPOINT = '/api/quote/accept'
const STATE_ENDPOINT = '/api/quote/state'
const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 30 // 60 seconds

// PaymentIntent statuses after confirmPayment that mean the client is done paying. 'processing' is a slow bank method.
const PAID_STATUSES = new Set(['succeeded', 'processing', 'requires_capture'])

const ERROR_COLOR = '#f87171'

// Stripe Elements renders inside a cross-origin iframe and cannot read the page's CSS custom properties, so these must
// be literal hex, kept in sync with the navy + champagne-gold tokens in globals.css (same as Step6CardOnFile).
const appearance = {
  theme: 'night' as const,
  variables: {
    colorBackground: '#17293B',
    colorText: '#F3EEE3',
    colorTextPlaceholder: '#A9AEB0',
    colorPrimary: '#BFA06A',
    colorDanger: '#f87171',
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    fontSizeBase: '14px',
    fontWeightNormal: '300',
    borderRadius: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #2B4056', backgroundColor: '#17293B' },
    '.Input:focus': { border: '1px solid #BFA06A', outline: '2px solid #BFA06A', outlineOffset: '4px' },
    '.Label': {
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      fontSize: '10px',
      fontWeight: '400',
      letterSpacing: '0.4em',
      textTransform: 'uppercase',
      color: '#D4BB86',
    },
  },
}

type Phase = 'idle' | 'submitting' | 'confirming'
type Message = 'consentRequired' | 'declined' | 'error' | 'changed' | 'unavailable'

function AcceptForm(props: QuoteAcceptPayProps) {
  const { token, locale, versionNo, depositMinor, currency, consentText, copy } = props
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  // The latest router for the polling loop, which must not restart when the router object changes identity.
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])

  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<Message | null>(null)
  const [consent, setConsentState] = useState(false)
  const consentRef = useRef(false)
  const busyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const checkboxRef = useRef<HTMLInputElement>(null)

  const setConsent = useCallback((value: boolean) => {
    consentRef.current = value
    setConsentState(value)
  }, [])

  // After a confirmed payment: poll the state (read only) until the server reports 'paid', then refresh the page.
  useEffect(() => {
    if (phase !== 'confirming') return
    let stopped = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      if (stopped) return
      attempts += 1
      try {
        const res = await fetch(STATE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { state?: unknown }
          if (data.state === 'paid') {
            stopped = true
            routerRef.current.refresh()
            return
          }
        }
      } catch {
        // A failed poll changes nothing: the next one runs on schedule.
      }
      if (stopped || attempts >= POLL_MAX_ATTEMPTS) return
      timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [phase, token])

  const fail = (next: Message) => {
    setMessage(next)
    busyRef.current = false
    setPhase('idle')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busyRef.current) return
    if (!stripe || !elements || !ready) return
    if (!consentRef.current) {
      setMessage('consentRequired')
      checkboxRef.current?.focus()
      return
    }

    busyRef.current = true
    setMessage(null)
    setPhase('submitting')

    // 1. Validate the card fields in the browser (Stripe shows the inline errors itself).
    const { error: submitError } = await elements.submit()
    if (submitError) {
      busyRef.current = false
      setPhase('idle')
      return
    }

    // 2. Ask the server for the deposit PaymentIntent. Cross-check values only: the server owns the amount.
    let res: Response
    let data: Record<string, unknown>
    try {
      res = await fetch(ACCEPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          displayedVersionNo: versionNo,
          displayedDepositMinor: depositMinor,
          consent: true,
        }),
      })
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    } catch {
      fail('error')
      return
    }

    if (!res.ok) {
      const code = typeof data.error === 'string' ? data.error : typeof data.code === 'string' ? data.code : ''
      if (res.status === 409 && code === 'quote_changed') {
        setConsent(false)
        fail('changed')
      } else if (res.status === 409 && code === 'already_paid') {
        routerRef.current.refresh()
        busyRef.current = false
        setPhase('confirming')
      } else if (res.status === 409 && code === 'already_paying') {
        // A payment for this quote is already in progress: nothing to confirm here, only to wait for.
        setPhase('confirming')
      } else if (res.status === 404) {
        fail('unavailable')
      } else if (res.status === 422 && code === 'CONSENT_REQUIRED') {
        setConsent(false)
        fail('consentRequired')
      } else {
        fail('error')
      }
      return
    }

    // The amount the client sees is the one the server holds: never confirm a different one.
    if (data.amountMinor !== depositMinor || data.currency !== currency || typeof data.clientSecret !== 'string') {
      setConsent(false)
      fail('changed')
      return
    }

    // 3. Confirm. The return URL has no token: it goes to Stripe, the bank and the browser history.
    const returnUrl = `${window.location.origin}${getPathname({ locale, href: '/quote/done' })}`
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret: data.clientSecret,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })
    if (error) {
      fail(error.type === 'card_error' ? 'declined' : 'error')
      return
    }
    if (paymentIntent && PAID_STATUSES.has(paymentIntent.status)) {
      setPhase('confirming')
      return
    }
    fail('error')
  }

  if (phase === 'confirming') {
    return (
      <p role="status" data-testid="quote-accept-confirming" style={textStyle}>
        {copy.confirming}
      </p>
    )
  }

  const submitting = phase === 'submitting'
  const disabled = submitting || !stripe || !ready || !consent
  const consentId = 'quote-accept-consent'

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PaymentElement
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
          wallets: { applePay: 'auto', googlePay: 'auto' },
        }}
        onReady={() => setReady(true)}
        onLoadError={() => setMessage('error')}
      />

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          minHeight: 44,
          padding: '8px 0',
          marginTop: 24,
          cursor: 'pointer',
          ...(message === 'consentRequired' ? { border: `1px solid ${ERROR_COLOR}`, borderRadius: 4 } : {}),
        }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-describedby={consentId}
          style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--copper)' }}
        />
        <span
          id={consentId}
          data-testid="quote-accept-consent"
          style={{ ...textStyle, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
        >
          {consentText}
        </span>
      </label>

      {message ? (
        <p role="alert" style={{ ...textStyle, marginTop: 16, color: ERROR_COLOR }}>
          {copy[message]}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary"
        disabled={disabled}
        aria-disabled={disabled}
        aria-busy={submitting}
        style={{ width: '100%', minHeight: 44, marginTop: 24 }}
      >
        {submitting ? copy.processing : copy.button}
      </button>
    </form>
  )
}

const textStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
} as const

export function QuoteAcceptPay(props: QuoteAcceptPayProps) {
  const { depositMinor, currency, locale, copy } = props

  // Elements options mirror the server-side PaymentIntent (card only, saves the card for later). The amount is the
  // displayed deposit; the secret the server returns is bound to the server's amount, and a different answer is refused.
  const options = useMemo(
    () => ({
      mode: 'payment' as const,
      amount: depositMinor,
      currency,
      setupFutureUsage: 'off_session' as const,
      paymentMethodTypes: ['card'],
      appearance,
      locale: STRIPE_ELEMENTS_LOCALE[locale],
    }),
    [depositMinor, currency, locale],
  )

  return (
    <section
      data-testid="quote-accept"
      aria-labelledby="quote-accept-heading"
      style={{
        boxSizing: 'border-box',
        backgroundColor: 'var(--anthracite-mid)',
        padding: 24,
        border: '1px solid var(--anthracite-light)',
        borderInlineStart: '3px solid var(--copper)',
        borderRadius: 4,
        marginTop: 24,
      }}
    >
      <h2
        id="quote-accept-heading"
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.3,
          color: 'var(--offwhite)',
          margin: '0 0 16px',
          overflowWrap: 'anywhere',
        }}
      >
        {copy.heading}
      </h2>
      <Elements stripe={stripePromise} options={options}>
        <AcceptForm {...props} />
      </Elements>
    </section>
  )
}

export default QuoteAcceptPay
