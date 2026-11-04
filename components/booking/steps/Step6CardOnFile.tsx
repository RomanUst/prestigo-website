'use client'

// Save-card checkout step (Phase 88, plan 88-10; HOLD-01, D-09, D-12). Built to 88-UI-SPEC.md Surface 1.
// DRAFT legal copy (Booking.step6.cardOnFile.*), pending the Phase 89 review.
//
// Flow: elements.submit() -> POST /api/card-checkout/intent -> stripe.confirmSetup (3DS in the browser) ->
// /book/confirmation. Nothing is charged. The consent checkbox is a native, unticked input on every mount and
// remount; it is never prefilled, never stored. The label text equals the string the server hashes
// (consentMessageKey + consentVars from lib/payments/consent-text.ts).

import { useMemo, useState } from 'react'
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
import BookingSummaryBlock from '../BookingSummaryBlock'
import CardPaymentExplainer from '../CardPaymentExplainer'
import {
  buildCardCheckoutBody,
  ensureAttemptId,
  markCardAttempt,
  type CardCurrency,
  type CardMode,
  type InitEligible,
} from './cardCheckoutApi'

/** Modes this step implements. 'hold_now' is added by plan 88-12; an init result in any other mode renders the legacy step. */
export const SUPPORTED_MODES: readonly CardMode[] = ['setup']

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Stripe error codes mapped to catalog messages; unknown / missing codes fall back to paymentInitFailed.
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
  const [consent, setConsent] = useState(false)
  const [elementReady, setElementReady] = useState(false)
  const [elementError, setElementError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const consentTextId = 'card-consent-text'
  const vars = consentVars({ amountMinor, currency, holdDateIso, locale })

  const cardErrorMessage = (error: { message?: string }) =>
    error.message ? t('paymentUnsuccessful', { message: error.message }) : t('paymentGenericError')

  const navigateToConfirmation = (bookingReference: string) => {
    const localizedConfirmPath = getPathname({ locale, href: `/book/confirmation?ref=${bookingReference}` })
    window.location.href = `${window.location.origin}${localizedConfirmPath}`
  }

  const handleServerError = (data: { code?: string }) => {
    const code = data.code
    if (code === 'INVALID_PHONE') {
      setMessage({ kind: 'error', text: tb('validation.invalidPhone') })
      useBookingStore.getState().goToStep?.(5)
      return
    }
    setMessage({
      kind: 'error',
      text: code && KNOWN_STEP6_ERROR_CODES.has(code) ? t(`errors.${code}`) : t('paymentInitFailed'),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || !consent || !elementReady || submitting) return

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
        }),
      })
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    } catch {
      setMessage({ kind: 'error', text: t('networkError') })
      setSubmitting(false)
      return
    }

    if (!res.ok) {
      handleServerError(data as { code?: string })
      setSubmitting(false)
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
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      clientSecret: String(data.clientSecret ?? ''),
      confirmParams: { return_url: `${window.location.origin}${localizedConfirmPath}` },
      redirect: 'if_required',
    })

    if (error) {
      setMessage({ kind: 'error', text: cardErrorMessage(error) })
      setSubmitting(false)
      return
    }
    if (setupIntent && (setupIntent.status === 'succeeded' || setupIntent.status === 'processing')) {
      navigateToConfirmation(bookingReference)
      return
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
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
          wallets: { applePay: 'auto', googlePay: 'auto' },
        }}
        onReady={() => setElementReady(true)}
        onLoadError={(e) =>
          setElementError((e as { error?: { message?: string } })?.error?.message ?? t('paymentFormLoadError'))
        }
      />

      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
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
        }}
      >
        <input
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const promoDiscount = useBookingStore((s) => s.promoDiscount)

  const [current] = useState<InitEligible>(init)
  const [message, setMessage] = useState<SlotMessage | null>(null)

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

  const elementsOptions = useMemo(
    () => ({
      mode: 'setup' as const,
      currency: current.currency,
      paymentMethodTypes: ['card'],
      appearance,
      locale: STRIPE_ELEMENTS_LOCALE[locale],
    }),
    [current.currency, locale],
  )

  return (
    <div className="max-w-[560px] mx-auto">
      <BookingSummaryBlock selectedCurrency={current.currency} />

      <div style={{ marginTop: 32 }}>
        <CardPaymentExplainer
          mode={current.mode}
          amountMinor={current.amountMinor}
          currency={current.currency}
          holdDateIso={current.holdDateIso}
        />
      </div>

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
            totalEur={discountedTotalEur}
            analyticsItems={analyticsItems}
          />
        </Elements>
      </div>
    </div>
  )
}
