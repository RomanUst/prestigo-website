'use client'

// The client pays the remainder of a paid payment-link quote on the quote page (Phase 92, plan 92-27; QUOTE-04; D-16;
// T-92-84, T-92-85).
//
// - Mirrors QuoteAcceptPay without the consent box: the card terms were accepted with the deposit. One Stripe
//   PaymentElement (card only; the card is not saved again, as the server-side intent of createRemainderIntent).
// - The island translates nothing and computes no amount. The page passes every string (Quote.remainderPay.*, plus
//   Quote.accept.processing / declined / error / changed) and the due the SERVER computed from the quote's trips.
// - Order on a press: elements.submit() -> POST REMAINDER_ENDPOINT { token, displayedAmountMinor } (the displayed due
//   is a cross-check only: the server owns the amount and answers 409 amount_changed on a difference) ->
//   stripe.confirmPayment with the secret the server returned. The return URL is /<locale>/quote/done: NO token.
// - The quote is marked by the Stripe webhook / reconcile on the server, never by this browser. A paid quote stays
//   state 'paid' when its remainder is paid, so after a confirmed payment the island refreshes the page every 2 s
//   (60 s at most; a POST /api/quote/state first, so a link that died stops the loop) until the server-rendered due is
//   0 and the page shows the paid sentence in place of this island.
// - One request at a time. Nothing about the token or the payment is stored in the browser.

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getPathname, useRouter } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import type { PaymentCurrency } from '@/lib/payments/money'

export interface QuoteRemainderPayCopy {
  heading: string
  /** "Remainder to pay: {amount}", formatted on the server. */
  due: string
  /** "Pay {amount}", formatted on the server. */
  button: string
  processing: string
  confirming: string
  declined: string
  error: string
  changed: string
}

export interface QuoteRemainderPayProps {
  token: string
  locale: AppLocale
  /** What is still due, computed on the server (the displayed amount, a cross-check for the server). */
  dueMinor: number
  currency: PaymentCurrency
  copy: QuoteRemainderPayCopy
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const REMAINDER_ENDPOINT = '/api/quote/remainder'
const STATE_ENDPOINT = '/api/quote/state'
const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 30 // 60 seconds

// PaymentIntent statuses after confirmPayment that mean the client is done paying. 'processing' is a slow bank method.
const PAID_STATUSES = new Set(['succeeded', 'processing', 'requires_capture'])

const ERROR_COLOR = '#f87171'

// Stripe Elements renders inside a cross-origin iframe and cannot read the page's CSS custom properties, so these must
// be literal hex, kept in sync with the navy + champagne-gold tokens in globals.css (same as QuoteAcceptPay).
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

const textStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
} as const

type Phase = 'idle' | 'submitting' | 'confirming'
type Message = 'declined' | 'error' | 'changed'

function RemainderForm({ token, locale, dueMinor, currency, copy }: QuoteRemainderPayProps) {
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
  const [ready, setReady] = useState(false)
  const busyRef = useRef(false)

  // After a confirmed payment: refresh the page until it renders the remainder as paid (it then unmounts this island).
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
        if (stopped) return
        // A link that died meanwhile: one refresh shows the invalid view, nothing more to wait for.
        if (res.status === 404) stopped = true
      } catch {
        // A failed check changes nothing: the page is refreshed and the next one runs on schedule.
      }
      routerRef.current.refresh()
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

    // 2. Ask the server for the remainder PaymentIntent. The displayed due is a cross-check: the server owns the amount.
    let res: Response
    let data: Record<string, unknown>
    try {
      res = await fetch(REMAINDER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, displayedAmountMinor: dueMinor }),
      })
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    } catch {
      fail('error')
      return
    }

    if (!res.ok) {
      const code = typeof data.error === 'string' ? data.error : ''
      if (res.status === 409 && code === 'amount_changed') {
        // The due moved (a trip was cancelled): show the new amount the server renders.
        fail('changed')
        routerRef.current.refresh()
      } else if (res.status === 409 && code === 'already_paying') {
        // A payment of this remainder is already in progress: nothing to confirm here, only to wait for.
        setPhase('confirming')
      } else if (res.status === 422 && code === 'nothing_due') {
        // Already paid: the refreshed page shows the paid sentence.
        routerRef.current.refresh()
        setPhase('confirming')
      } else {
        fail('error')
      }
      return
    }

    // The amount the client sees is the one the server holds: never confirm a different one.
    if (data.amountMinor !== dueMinor || data.currency !== currency || typeof data.clientSecret !== 'string') {
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
      <p role="status" data-testid="quote-remainder-confirming" style={textStyle}>
        {copy.confirming}
      </p>
    )
  }

  const submitting = phase === 'submitting'
  const disabled = submitting || !stripe || !ready

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

export function QuoteRemainderPay(props: QuoteRemainderPayProps) {
  const { dueMinor, currency, locale, copy } = props

  // Elements options mirror the server-side remainder PaymentIntent (card only, the card is not saved again). The amount
  // is the displayed due; the secret the server returns is bound to the server's amount, and a different answer is refused.
  const options = useMemo(
    () => ({
      mode: 'payment' as const,
      amount: dueMinor,
      currency,
      paymentMethodTypes: ['card'],
      appearance,
      locale: STRIPE_ELEMENTS_LOCALE[locale],
    }),
    [dueMinor, currency, locale],
  )

  return (
    <section
      data-testid="quote-remainder"
      aria-labelledby="quote-remainder-heading"
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
        id="quote-remainder-heading"
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.3,
          color: 'var(--offwhite)',
          margin: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {copy.heading}
      </h2>
      <p data-testid="quote-remainder-due" style={{ ...textStyle, margin: '12px 0 16px' }}>
        {copy.due}
      </p>
      <Elements stripe={stripePromise} options={options}>
        <RemainderForm {...props} />
      </Elements>
    </section>
  )
}

export default QuoteRemainderPay
