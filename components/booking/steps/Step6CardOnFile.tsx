'use client'

// Card checkout step (Phase 88, plans 88-10 and 88-12; HOLD-01, HOLD-03, D-09, D-11, D-12). Built to 88-UI-SPEC.md Surface 1.
// DRAFT legal copy (Booking.step6.cardOnFile.*), pending the Phase 89 review.
//
// Two variants, decided by the server (init, then cross-checked by the intent route):
//   - setup: elements.submit() -> POST /api/card-checkout/intent -> stripe.confirmSetup (3DS in the browser) ->
//     /book/confirmation. Nothing is charged.
//   - hold_now (pickup inside the hold lead, D-11): Elements in mode 'payment' with manual capture, then
//     stripe.confirmPayment (on-session 3DS). The amount is held now and charged after the trip; the booking is
//     confirmed by the webhook, never by this component.
//  The consent checkbox is a native, unticked input on every mount and
// remount; it is never prefilled, never stored. The label text equals the string the server hashes
// (consentMessageKey + consentVars from lib/payments/consent-text.ts).
//
// Structure: the outer component owns what survives an Elements remount (init result, promo / currency, the
// notice slot, the polite live region); CardForm lives inside <Elements key={mode + currency}> and owns the
// consent tick, so a remount can never carry a tick over.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Lock } from 'lucide-react'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { VEHICLE_CLASS_KEY } from '@/types/booking'
import { writePurchaseSnapshot } from '@/lib/analytics-snapshot'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { consentMessageKey, consentVars } from '@/lib/payments/consent-text'
import { formatMinor } from '@/lib/payments/money'
import BookingSummaryBlock from '../BookingSummaryBlock'
import CardPaymentExplainer from '../CardPaymentExplainer'
import PromoCodeField from './PromoCodeField'
import {
  buildCardCheckoutBody,
  ensureAttemptId,
  fetchCardInit,
  markCardAttempt,
  startNewAttempt,
  type CardCurrency,
  type CardMode,
  type InitEligible,
} from './cardCheckoutApi'

/** Modes this step implements; an init result in any other mode renders the legacy step. */
export const SUPPORTED_MODES: readonly CardMode[] = ['setup', 'hold_now']

// PaymentIntent statuses after confirmPayment that mean the client is done: a manual-capture hold ends in
// requires_capture, a slow bank method in processing. Anything else is not an authorisation.
const HOLD_DONE_STATUSES = new Set(['requires_capture', 'processing', 'succeeded'])

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Server codes with a matching Booking.step6.errors.<code> catalog message; anything else falls back to
// paymentInitFailed, never raw server text.
const KNOWN_STEP6_ERROR_CODES = new Set([
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'TOO_MANY_PASSENGERS',
  'CUSTOM_QUOTE_REQUIRED',
  'LEAD_TIME',
  'ROUND_TRIP_DATES',
  'RETURN_BEFORE_PICKUP',
  'PROMO_INVALID',
  'PRICING_UNAVAILABLE',
  'INTERNAL',
  'NO_CODE',
])

// Stripe error codes for a failed or abandoned 3DS challenge.
const AUTH_FAILURE_CODES = new Set(['setup_intent_authentication_failure', 'payment_intent_authentication_failure'])

// Stripe Elements renders inside a cross-origin iframe and cannot read the page's CSS custom properties, so these
// must be literal hex, kept in sync with the navy + champagne-gold tokens in globals.css (same as Step6Payment).
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

/** One message at a time in the slot under the Elements block. */
export interface SlotMessage {
  kind: 'error' | 'notice'
  text: string
  /** Move focus to the notice (MODE_CHANGED). */
  focus?: boolean
  /** The message is the consent error (422 CONSENT_REQUIRED): red row border, focus on the checkbox. */
  field?: 'consent'
}

interface AnalyticsItem {
  item_id: string
  item_name: string
  item_category: string
  item_variant: string
  price: number
  quantity: number
}

interface CardFormProps {
  mode: CardMode
  amountMinor: number
  currency: CardCurrency
  holdDateIso: string | null
  message: SlotMessage | null
  setMessage: (m: SlotMessage | null) => void
  /** Server told us a different amount / mode / hold date: update the parent's init (does not clear the tick itself). */
  onServerPatch: (patch: Partial<InitEligible>) => void
  onFallback: () => void
  /** The tick was cleared because what it authorises changed: announce it politely. */
  onConsentInvalidated: () => void
  onConsentTicked: (ticked: boolean) => void
  onBusyChange: (busy: boolean) => void
  totalEur: number
  analyticsItems: AnalyticsItem[]
}

function CardForm({
  mode,
  amountMinor,
  currency,
  holdDateIso,
  message,
  setMessage,
  onServerPatch,
  onFallback,
  onConsentInvalidated,
  onConsentTicked,
  onBusyChange,
  totalEur,
  analyticsItems,
}: CardFormProps) {
  const t = useTranslations('Booking.step6')
  const tc = useTranslations('Booking.step6.cardOnFile')
  const tb = useTranslations('Booking')
  const locale = useLocale() as AppLocale
  const stripe = useStripe()
  const elements = useElements()

  // HOLD-01: starts false on every mount (the form remounts with the Elements key), never read from storage.
  const [consent, setConsentState] = useState(false)
  const consentRef = useRef(false)
  const [elementReady, setElementReady] = useState(false)
  const [elementError, setElementError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const checkboxRef = useRef<HTMLInputElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const setConsent = useCallback(
    (value: boolean) => {
      consentRef.current = value
      setConsentState(value)
      onConsentTicked(value)
    },
    [onConsentTicked],
  )

  // Invalidation rule: any change of what the consent authorises (amount, currency, mode, hold date) clears the
  // tick and announces it. PRICE_CHANGED clears the tick itself first, so this stays silent for it (the notice
  // already speaks).
  const consentKey = `${amountMinor}|${currency}|${mode}|${holdDateIso ?? ''}`
  const previousKey = useRef(consentKey)
  useEffect(() => {
    if (previousKey.current === consentKey) return
    previousKey.current = consentKey
    if (consentRef.current) {
      setConsent(false)
      onConsentInvalidated()
    }
  }, [consentKey, setConsent, onConsentInvalidated])

  // Focus management: the MODE_CHANGED notice (this form just remounted) and the consent error.
  useEffect(() => {
    if (message?.focus) noticeRef.current?.focus()
    if (message?.field === 'consent') checkboxRef.current?.focus()
  }, [message])

  useEffect(() => {
    onBusyChange(submitting)
  }, [submitting, onBusyChange])

  const consentTextId = 'card-consent-text'
  const vars = consentVars({ amountMinor, currency, holdDateIso, locale })

  const cardErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code && AUTH_FAILURE_CODES.has(error.code)) return tc('errorBankVerification')
    return error.message ? t('paymentUnsuccessful', { message: error.message }) : t('paymentGenericError')
  }

  const navigateToConfirmation = (bookingReference: string) => {
    const localizedConfirmPath = getPathname({ locale, href: `/book/confirmation?ref=${bookingReference}` })
    window.location.href = `${window.location.origin}${localizedConfirmPath}`
  }

  /** Returns true when the failure was handled by leaving the step (fallback) and the form must not touch state. */
  const handleServerError = (status: number, data: Record<string, unknown>): boolean => {
    const code = typeof data.code === 'string' ? data.code : status === 429 ? 'RATE_LIMITED' : undefined

    if (status === 409 && code === 'PRICE_CHANGED' && typeof data.amountMinor === 'number') {
      setConsent(false)
      onServerPatch({ amountMinor: data.amountMinor })
      setMessage({ kind: 'notice', text: tc('noticePriceChanged', { amount: formatMinor(data.amountMinor, currency) }) })
      return false
    }

    if (status === 409 && code === 'MODE_CHANGED') {
      const nextMode = data.mode
      if ((nextMode !== 'setup' && nextMode !== 'hold_now') || !SUPPORTED_MODES.includes(nextMode)) {
        onFallback()
        return true
      }
      setConsent(false)
      onServerPatch({
        mode: nextMode,
        holdAtIso: typeof data.holdAtIso === 'string' ? data.holdAtIso : null,
        holdDateIso: typeof data.holdDateIso === 'string' ? data.holdDateIso : null,
      })
      setMessage({ kind: 'notice', text: tc('noticeModeChanged'), focus: true })
      return false
    }

    // 88-REVIEW B-WR-05: the hold date the consent names changed on the server (same mode): show the new date and ask
    // for the tick again, so the stored consent is the text the client accepted.
    if (status === 409 && code === 'HOLD_DATE_CHANGED') {
      setConsent(false)
      onServerPatch({
        holdAtIso: typeof data.holdAtIso === 'string' ? data.holdAtIso : null,
        holdDateIso: typeof data.holdDateIso === 'string' ? data.holdDateIso : null,
      })
      setMessage({ kind: 'notice', text: tc('noticeDetailsChanged'), focus: true })
      return false
    }

    // 88-REVIEW B-WR-02 / B-WR-03: this attempt can no longer become a booking (cancelled meanwhile, or used by the
    // pay-now flow). Never shown as confirmed: a fresh attempt is started and the client simply tries again.
    if (status === 409 && code === 'ATTEMPT_CLOSED') {
      startNewAttempt()
      setConsent(false)
      setMessage({ kind: 'error', text: t('paymentGenericError') })
      return false
    }

    if (code === 'NOT_ELIGIBLE' || code === 'MODE_UNSUPPORTED') {
      onFallback()
      return true
    }

    if (code === 'CONSENT_REQUIRED') {
      setConsent(false)
      setMessage({ kind: 'error', text: tc('errorConsentRequired'), field: 'consent' })
      return false
    }

    if (code === 'INVALID_PHONE') {
      setMessage({ kind: 'error', text: tb('validation.invalidPhone') })
      useBookingStore.getState().goToStep?.(5)
      return false
    }

    setMessage({
      kind: 'error',
      text: code && KNOWN_STEP6_ERROR_CODES.has(code) ? t(`errors.${code}`) : t('paymentInitFailed'),
    })
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || !consentRef.current || !elementReady || submitting) return

    setSubmitting(true)
    setMessage(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setMessage({ kind: 'error', text: cardErrorMessage(submitError) })
      setSubmitting(false)
      return
    }

    const state = useBookingStore.getState()
    const attemptId = ensureAttemptId()
    // One flow per attempt: once the intent route may have captured a card_hold row for this attemptId,
    // a later pay-now fallback must use a new attemptId (see rotateAttemptIfCardUsed).
    markCardAttempt(attemptId)

    let res: Response
    let data: Record<string, unknown>
    try {
      res = await fetch('/api/card-checkout/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildCardCheckoutBody(state, { attemptId, currency, promoCode: state.promoCode, locale }),
          currency,
          mode,
          consent: true,
          displayedAmountMinor: amountMinor,
          // B-WR-05: the hold date the consent text named; the server refuses a different one.
          displayedHoldDateIso: mode === 'setup' ? holdDateIso : null,
        }),
      })
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    } catch {
      setMessage({ kind: 'error', text: t('networkError') })
      setSubmitting(false)
      return
    }

    if (!res.ok) {
      const left = handleServerError(res.status, data)
      if (!left) setSubmitting(false)
      return
    }

    const bookingReference = String(data.bookingReference ?? '')

    // Persist the purchase snapshot BEFORE confirming: a 3DS redirect or the reload below wipes in-memory state.
    writePurchaseSnapshot({ ref: bookingReference, value: totalEur, currency: 'EUR', items: analyticsItems })

    if (data.alreadyConfirmed === true) {
      navigateToConfirmation(bookingReference)
      return
    }

    const localizedConfirmPath = getPathname({ locale, href: `/book/confirmation?ref=${bookingReference}` })
    const confirmArgs = {
      elements,
      clientSecret: String(data.clientSecret ?? ''),
      confirmParams: { return_url: `${window.location.origin}${localizedConfirmPath}` },
      redirect: 'if_required' as const,
    }

    if (mode === 'hold_now') {
      // The server decides the mode and answered with a PaymentIntent secret for the manual-capture hold.
      const { error, paymentIntent } = await stripe.confirmPayment(confirmArgs)
      if (error) {
        setMessage({ kind: 'error', text: cardErrorMessage(error) })
        setSubmitting(false)
        return
      }
      if (paymentIntent && HOLD_DONE_STATUSES.has(paymentIntent.status)) {
        navigateToConfirmation(bookingReference)
        return
      }
    } else {
      const { error, setupIntent } = await stripe.confirmSetup(confirmArgs)
      if (error) {
        setMessage({ kind: 'error', text: cardErrorMessage(error) })
        setSubmitting(false)
        return
      }
      if (setupIntent && (setupIntent.status === 'succeeded' || setupIntent.status === 'processing')) {
        navigateToConfirmation(bookingReference)
        return
      }
    }
    setMessage({ kind: 'error', text: t('paymentGenericError') })
    setSubmitting(false)
  }

  const isDisabled = submitting || !stripe || !elementReady || !consent
  const ctaLabel = submitting
    ? tc('ctaBusy')
    : !elementReady && !elementError
      ? t('loading')
      : mode === 'setup'
        ? tc('ctaSetup')
        : tc('ctaHoldNow', { amount: vars.amount })

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        // Escape must not interrupt a submit in flight (server call, Stripe confirm, open 3DS challenge).
        if (submitting && e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <PaymentElement
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
          wallets: { applePay: 'auto', googlePay: 'auto' },
        }}
        onReady={() => setElementReady(true)}
        onLoadError={() => {
          setElementError(true)
          setMessage({ kind: 'error', text: t('paymentFormLoadError') })
        }}
      />

      {message && (
        <div
          ref={noticeRef}
          role={message.kind === 'error' ? 'alert' : 'status'}
          tabIndex={message.kind === 'notice' ? -1 : undefined}
          style={{
            marginTop: 16,
            fontSize: 14,
            fontWeight: 300,
            lineHeight: 1.5,
            fontFamily: 'var(--font-montserrat)',
            ...(message.kind === 'error'
              ? { color: '#f87171' }
              : {
                  color: 'var(--offwhite)',
                  backgroundColor: 'var(--anthracite-mid)',
                  borderInlineStart: '3px solid var(--copper)',
                  padding: '12px 16px',
                  borderRadius: 4,
                }),
          }}
        >
          {message.text}
        </div>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          minHeight: 44,
          padding: '8px 0',
          marginTop: 24,
          cursor: 'pointer',
          ...(message?.field === 'consent' ? { border: '1px solid #f87171', borderRadius: 4 } : {}),
        }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--copper)' }}
        />
        <span
          id={consentTextId}
          style={{
            fontSize: 14,
            fontWeight: 300,
            lineHeight: 1.5,
            color: 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          {tc(consentMessageKey(mode), vars)}
        </span>
      </label>

      {/* Links sit OUTSIDE the label so the hashed consent string equals the rendered label exactly. */}
      <p
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: 300,
          fontFamily: 'var(--font-montserrat)',
          color: 'var(--warmgrey)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <a
          href={getPathname({ locale, href: '/terms' })}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}
        >
          {tc('termsLink')}
        </a>
        <a
          href={getPathname({ locale, href: '/privacy' })}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}
        >
          {tc('privacyLink')}
        </a>
      </p>

      <button
        type="submit"
        className="btn-primary"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={submitting}
        aria-describedby={consentTextId}
        style={{
          width: '100%',
          minHeight: 44,
          marginTop: 24,
          ...(isDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        }}
      >
        {ctaLabel}
      </button>

      <p
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <Lock size={16} aria-hidden="true" />
        <span>{tc('trustLine')}</span>
      </p>
    </form>
  )
}

export default function Step6CardOnFile({ init, onFallback }: { init: InitEligible; onFallback: () => void }) {
  const t = useTranslations('Booking.step6')
  const tc = useTranslations('Booking.step6.cardOnFile')
  const tb = useTranslations('Booking')
  const locale = useLocale() as AppLocale

  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const extras = useBookingStore((s) => s.extras)
  const tripType = useBookingStore((s) => s.tripType)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const promoCode = useBookingStore((s) => s.promoCode)
  const promoDiscount = useBookingStore((s) => s.promoDiscount)

  const [current, setCurrent] = useState<InitEligible>(init)
  const [selectedCurrency, setSelectedCurrency] = useState<CardCurrency>(init.currency)
  const [reiniting, setReiniting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<SlotMessage | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const consentTickedRef = useRef(false)
  const reinitSeq = useRef(0)

  // Same total the legacy step reports to GA4 (EUR); the server amount (current.amountMinor) is what is authorised.
  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const selectedReturnLegPrice = vehicleClass && roundTripPriceBreakdown ? roundTripPriceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const outboundWithExtras = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const returnLegTotal = selectedReturnLegPrice ? selectedReturnLegPrice.total : 0
  const totalEur = tripType === 'round_trip' ? outboundWithExtras + returnLegTotal : outboundWithExtras
  const discountedTotalEur = promoDiscount > 0 ? Math.round(totalEur * (1 - promoDiscount / 100)) : totalEur

  const analyticsItems = useMemo<AnalyticsItem[]>(
    () => [
      {
        item_id: vehicleClass ?? 'transfer',
        item_name:
          (vehicleClass && tb(`vehicleClasses.${VEHICLE_CLASS_KEY[vehicleClass]}.label`)) || t('chauffeurTransfer'),
        item_category: tripType ?? 'transfer',
        item_variant: tripType ?? 'transfer',
        price: discountedTotalEur,
        quantity: 1,
      },
    ],
    [vehicleClass, tripType, discountedTotalEur, tb, t],
  )

  // Elements options must match the server-side intent exactly (Research Pitfall 3): a SetupIntent for 'setup',
  // a manual-capture PaymentIntent for 'hold_now' (amount, capture and future-usage included). The Elements key
  // below remounts on a mode or currency change; an amount change is a supported in-place update.
  const elementsOptions = useMemo(
    () =>
      current.mode === 'hold_now'
        ? {
            mode: 'payment' as const,
            amount: current.amountMinor,
            currency: current.currency,
            captureMethod: 'manual' as const,
            setupFutureUsage: 'off_session' as const,
            paymentMethodTypes: ['card'],
            appearance,
            locale: STRIPE_ELEMENTS_LOCALE[locale],
          }
        : {
            mode: 'setup' as const,
            currency: current.currency,
            paymentMethodTypes: ['card'],
            appearance,
            locale: STRIPE_ELEMENTS_LOCALE[locale],
          },
    [current.mode, current.amountMinor, current.currency, locale],
  )

  const announce = useCallback(() => setLiveMessage(tc('noticeDetailsChanged')), [tc])
  const handleConsentTicked = useCallback((ticked: boolean) => {
    consentTickedRef.current = ticked
  }, [])
  const handleServerPatch = useCallback((patch: Partial<InitEligible>) => {
    setCurrent((prev) => ({ ...prev, ...patch }))
  }, [])

  /**
   * Re-call init after a currency or promo change. The Elements form unmounts while the new server amount is
   * fetched (so the tick cannot survive), and a result the step cannot render falls back to the legacy step.
   */
  const reinit = async (over: { currency?: CardCurrency; promoCode?: string | null }) => {
    const seq = ++reinitSeq.current
    if (consentTickedRef.current) {
      consentTickedRef.current = false
      setLiveMessage('')
      announce()
    }
    setReiniting(true)
    setMessage(null)

    const state = useBookingStore.getState()
    const currency = over.currency ?? selectedCurrency
    const promo = 'promoCode' in over ? (over.promoCode ?? null) : state.promoCode
    const result = await fetchCardInit({
      ...buildCardCheckoutBody(state, { attemptId: ensureAttemptId(), currency, promoCode: promo, locale }),
      currency,
    })
    if (seq !== reinitSeq.current) return
    if (!result || !result.eligible || !SUPPORTED_MODES.includes(result.mode)) {
      onFallback()
      return
    }
    setCurrent(result)
    setSelectedCurrency(result.currency)
    setReiniting(false)
  }

  const handleCurrency = (cur: CardCurrency) => {
    if (cur === selectedCurrency || busy || reiniting) return
    setSelectedCurrency(cur)
    void reinit({ currency: cur })
  }

  const handlePromoApplied = (code: string, pct: number) => {
    const state = useBookingStore.getState()
    state.setPromoCode(code)
    state.setPromoDiscount(pct)
    void reinit({ promoCode: code })
  }

  const handlePromoRemoved = () => {
    const state = useBookingStore.getState()
    state.setPromoCode(null)
    state.setPromoDiscount(0)
    void reinit({ promoCode: null })
  }

  return (
    <div className="max-w-[560px] mx-auto">
      <BookingSummaryBlock selectedCurrency={selectedCurrency} />

      <PromoCodeField
        promoCode={promoCode}
        discountPct={promoDiscount}
        disabled={busy || reiniting}
        onApplied={handlePromoApplied}
        onRemoved={handlePromoRemoved}
      />

      <div style={{ borderTop: '1px solid var(--anthracite-light)', margin: '32px 0' }} />

      <div style={{ marginBottom: 32 }}>
        <span className="label" style={{ display: 'block', marginBottom: 12 }}>
          {t('payInLabel')}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['eur', 'czk'] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => handleCurrency(cur)}
              disabled={busy || reiniting}
              aria-pressed={selectedCurrency === cur}
              style={{
                padding: '8px 20px',
                minHeight: 44,
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-montserrat)',
                background: 'transparent',
                border: selectedCurrency === cur ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                color: selectedCurrency === cur ? 'var(--offwhite)' : 'var(--warmgrey)',
                borderRadius: 4,
                cursor: busy || reiniting ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.2s ease, color 0.2s ease',
              }}
            >
              {cur === 'eur' ? t('eurLabel') : t('czkLabel')}
            </button>
          ))}
        </div>
      </div>

      {reiniting ? (
        <p
          style={{
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          {t('loadingPayment')}
        </p>
      ) : (
        <>
          <CardPaymentExplainer
            mode={current.mode}
            amountMinor={current.amountMinor}
            currency={current.currency}
            holdDateIso={current.holdDateIso}
          />

          <span className="label">{tc('cardDetailsLabel')}</span>

          <div style={{ marginTop: 24 }}>
            <Elements key={`${current.mode}-${current.currency}`} stripe={stripePromise} options={elementsOptions}>
              <CardForm
                mode={current.mode}
                amountMinor={current.amountMinor}
                currency={current.currency}
                holdDateIso={current.holdDateIso}
                message={message}
                setMessage={setMessage}
                onServerPatch={handleServerPatch}
                onFallback={onFallback}
                onConsentInvalidated={announce}
                onConsentTicked={handleConsentTicked}
                onBusyChange={setBusy}
                totalEur={discountedTotalEur}
                analyticsItems={analyticsItems}
              />
            </Elements>
          </div>
        </>
      )}

      {/* Polite live region: consent invalidation announcements. Visually hidden, always mounted. */}
      <div
        aria-live="polite"
        role="status"
        data-testid="card-live-region"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveMessage}
      </div>
    </div>
  )
}
