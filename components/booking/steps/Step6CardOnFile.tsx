'use client'

// Card checkout step (Phase 88, plans 88-10 and 88-12; HOLD-01, HOLD-03, D-09, D-11, D-12). Built to 88-UI-SPEC.md Surface 1.
// Phase 89 (plan 89-11; CASH-01, CANC-02, D-08, D-16): final consent wording (no review banner), a payment choice
// (card or cash to the driver; card is selected on every mount), the cancellation note, and the free-until moment
// the consent names (init policy, cross-checked by the intent route with 409 POLICY_CHANGED). Cash always uses the
// SetupIntent path and shows no hold date.
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
import { CircleCheck, Lock } from 'lucide-react'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { VEHICLE_CLASS_KEY } from '@/types/booking'
import { writePurchaseSnapshot } from '@/lib/analytics-snapshot'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { proposedFeeMinor } from '@/lib/cancellation-policy'
import { consentMessageKey, consentVars } from '@/lib/payments/consent-text'
import { formatMinor } from '@/lib/payments/money'
import BookingSummaryBlock from '../BookingSummaryBlock'
import CardPaymentExplainer from '../CardPaymentExplainer'
import CancellationPolicyNote from '../CancellationPolicyNote'
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
  type InitPolicy,
} from './cardCheckoutApi'

/** How the client pays: card (setup or held now, by the server's mode) or cash to the driver (always a SetupIntent). */
export type PaymentChoice = 'card' | 'cash'

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

type PolicyChange = Pick<InitPolicy, 'version' | 'freeUntilIso' | 'freeUntilPassed' | 'hours' | 'percent'>

/** The policy block of a 409 POLICY_CHANGED answer; null when it is not usable. */
function parsePolicyChange(raw: unknown): PolicyChange | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (
    typeof p.version !== 'string' ||
    typeof p.freeUntilIso !== 'string' ||
    !Number.isFinite(Date.parse(p.freeUntilIso)) ||
    typeof p.freeUntilPassed !== 'boolean' ||
    typeof p.hours !== 'number' ||
    !Number.isFinite(p.hours) ||
    typeof p.percent !== 'number' ||
    !Number.isFinite(p.percent)
  ) {
    return null
  }
  return {
    version: p.version,
    freeUntilIso: p.freeUntilIso,
    freeUntilPassed: p.freeUntilPassed,
    hours: p.hours,
    percent: p.percent,
  }
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
  /** The Stripe path: cash is always 'setup'. */
  mode: CardMode
  payment: PaymentChoice
  policy: InitPolicy
  amountMinor: number
  currency: CardCurrency
  holdDateIso: string | null
  message: SlotMessage | null
  setMessage: (m: SlotMessage | null) => void
  /** Server told us a different amount / mode / hold date: update the parent's init (does not clear the tick itself). */
  onServerPatch: (patch: Partial<InitEligible>) => void
  /** 409 POLICY_CHANGED: the server's current free-until moment, percent and hours. */
  onPolicyChanged: (next: PolicyChange) => void
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
  payment,
  policy,
  amountMinor,
  currency,
  holdDateIso,
  message,
  setMessage,
  onServerPatch,
  onPolicyChanged,
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

  // Invalidation rule: any change of what the consent authorises (amount, currency, mode, hold date, the choice or the
  // free-until moment) clears the tick and announces it. PRICE_CHANGED clears the tick itself first, so this stays
  // silent for it (the notice already speaks).
  const consentKey = `${amountMinor}|${currency}|${mode}|${holdDateIso ?? ''}|${payment}|${policy.freeUntilIso}|${policy.freeUntilPassed}`
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
  const cash = payment === 'cash'
  // The label is the string the server hashes: same key function, same variables (consent-text.ts). The free-until
  // moment is the init policy's, the very value sent back as displayedFreeUntilIso.
  const vars = consentVars({
    amountMinor,
    currency,
    holdDateIso: cash ? null : holdDateIso,
    locale,
    freeUntilMs: Date.parse(policy.freeUntilIso),
  })
  const consentKeyName = consentMessageKey(cash ? 'cash_setup' : mode, policy.freeUntilPassed)

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

    // Phase 89 (T-89-38): the free-until moment (or whether it already passed) differs from what the consent named.
    // Show the new deadline in the note, clear the tick and ask for it again; nothing was stored.
    if (status === 409 && code === 'POLICY_CHANGED') {
      const next = parsePolicyChange(data.policy)
      setConsent(false)
      if (next) {
        onPolicyChanged(next)
        setMessage({ kind: 'notice', text: tc('noticePolicyChanged'), focus: true })
      } else {
        setMessage({ kind: 'error', text: t('paymentGenericError') })
      }
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
          payment,
          consent: true,
          displayedAmountMinor: amountMinor,
          // B-WR-05: the hold date the consent text named; the server refuses a different one. Cash names none.
          displayedHoldDateIso: !cash && mode === 'setup' ? holdDateIso : null,
          // Phase 89: the free-until moment the consent named (and whether it read as passed); a different one is 409.
          displayedFreeUntilIso: policy.freeUntilIso,
          displayedFreeUntilPassed: policy.freeUntilPassed,
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
        ? tc('ctaSetup') // cash reads the same: Save card and book
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
          {tc(consentKeyName, vars)}
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

/**
 * Payment choice (UI-SPEC 2.1; D-08): two tiles in a radiogroup. Roving tabindex, arrow keys move and select, Space
 * selects. Selection is never colour alone (dot before the title and a check at the trailing edge).
 */
function PaymentChoiceTiles({
  value,
  cardMode,
  disabled,
  onChange,
}: {
  value: PaymentChoice
  cardMode: CardMode
  disabled: boolean
  onChange: (next: PaymentChoice) => void
}) {
  const tc = useTranslations('Booking.step6.cardOnFile')
  const refs = useRef<Record<PaymentChoice, HTMLButtonElement | null>>({ card: null, cash: null })
  const options: Array<{ id: PaymentChoice; title: string; description: string }> = [
    {
      id: 'card',
      title: tc('choiceCardTitle'),
      description: cardMode === 'setup' ? tc('choiceCardDescSetup') : tc('choiceCardDescHoldNow'),
    },
    { id: 'cash', title: tc('choiceCashTitle'), description: tc('choiceCashDesc') },
  ]

  const move = (to: PaymentChoice) => {
    if (disabled) return
    onChange(to)
    refs.current[to]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, current: PaymentChoice) => {
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    const other: PaymentChoice = current === 'card' ? 'cash' : 'card'
    if (e.key === 'ArrowDown' || e.key === forward || e.key === 'ArrowUp' || e.key === back) {
      e.preventDefault()
      move(other)
    } else if (e.key === ' ') {
      e.preventDefault()
      if (!disabled) onChange(current)
    }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <span id="payment-choice-label" className="label" style={{ display: 'block', marginBottom: 12 }}>
        {tc('paymentChoiceLabel')}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="payment-choice-label"
        className="grid grid-cols-1 min-[560px]:grid-cols-2"
        style={{ gap: 16 }}
      >
        {options.map((o) => {
          const selected = value === o.id
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[o.id] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKeyDown(e, o.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
                minHeight: 64,
                padding: 16,
                textAlign: 'start',
                backgroundColor: selected ? 'rgba(191,160,106,0.09)' : 'var(--anthracite-mid)',
                border: selected ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                borderRadius: 4,
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
              }}
            >
              <span style={{ display: 'block', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 400 }}>
                  {selected && (
                    <span
                      aria-hidden="true"
                      style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: 'var(--copper)' }}
                    />
                  )}
                  <span style={{ overflowWrap: 'anywhere' }}>{o.title}</span>
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 11,
                    fontWeight: 300,
                    lineHeight: 1.5,
                    color: 'var(--offwhite)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {o.description}
                </span>
              </span>
              {selected && <CircleCheck size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--copper)' }} />}
            </button>
          )
        })}
      </div>
    </div>
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
  // E9: card is the primary flow and is selected on every mount; cash is a deliberate choice, never stored.
  const [payment, setPayment] = useState<PaymentChoice>('card')
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

  // Cash always uses the SetupIntent path (D-09), even inside the hold lead window, and names no hold date.
  const cash = payment === 'cash' && current.cashAvailable
  const effectiveMode: CardMode = cash ? 'setup' : current.mode
  const effectiveHoldDateIso = cash ? null : current.holdDateIso

  // Elements options must match the server-side intent exactly (Research Pitfall 3): a SetupIntent for 'setup',
  // a manual-capture PaymentIntent for 'hold_now' (amount, capture and future-usage included). The Elements key
  // below remounts on a mode, currency or payment-choice change; an amount change is a supported in-place update.
  const elementsOptions = useMemo(
    () =>
      effectiveMode === 'hold_now'
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
    [effectiveMode, current.amountMinor, current.currency, locale],
  )

  const announce = useCallback(() => setLiveMessage(tc('noticeDetailsChanged')), [tc])
  const handleConsentTicked = useCallback((ticked: boolean) => {
    consentTickedRef.current = ticked
  }, [])
  const handleServerPatch = useCallback((patch: Partial<InitEligible>) => {
    setCurrent((prev) => {
      const next = { ...prev, ...patch }
      // The fee shown in the note follows the fare (one-way and hourly only: the card flow never takes a round trip).
      if (patch.amountMinor !== undefined && patch.amountMinor !== prev.amountMinor) {
        next.policy = { ...next.policy, feeMinor: proposedFeeMinor(patch.amountMinor, next.policy.percent) }
      }
      return next
    })
  }, [])
  const handlePolicyChanged = useCallback(
    (changed: Pick<InitPolicy, 'version' | 'freeUntilIso' | 'freeUntilPassed' | 'hours' | 'percent'>) => {
      setCurrent((prev) => ({
        ...prev,
        policy: { ...prev.policy, ...changed, feeMinor: proposedFeeMinor(prev.amountMinor, changed.percent) },
      }))
    },
    [],
  )

  /** Switching clears the tick and says so (the form remounts with the new key), and starts a new attempt (Pitfall 5). */
  const handlePaymentChange = (next: PaymentChoice) => {
    if (next === payment || busy || reiniting) return
    if (consentTickedRef.current) {
      consentTickedRef.current = false
      setLiveMessage('')
      announce()
    }
    setMessage(null)
    startNewAttempt()
    setPayment(next)
  }

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
    if (!result.cashAvailable) setPayment('card')
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
    // pb-28 on phones: the chat launcher (fixed, bottom-24) must not sit on the consent text and its links (88 deferred).
    <div className="max-w-[560px] mx-auto pb-28 md:pb-0">
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
          {current.cashAvailable && (
            <PaymentChoiceTiles
              value={cash ? 'cash' : 'card'}
              cardMode={current.mode}
              disabled={busy || reiniting}
              onChange={handlePaymentChange}
            />
          )}

          <CardPaymentExplainer
            mode={effectiveMode}
            payment={cash ? 'cash' : 'card'}
            amountMinor={current.amountMinor}
            currency={current.currency}
            holdDateIso={effectiveHoldDateIso}
          />

          <CancellationPolicyNote
            policy={current.policy}
            feeMinor={current.policy.feeMinor}
            currency={current.currency}
          />

          <span className="label">{tc('cardDetailsLabel')}</span>

          <div style={{ marginTop: 24 }}>
            <Elements
              key={`${cash ? 'cash' : 'card'}-${effectiveMode}-${current.currency}`}
              stripe={stripePromise}
              options={elementsOptions}
            >
              <CardForm
                mode={effectiveMode}
                payment={cash ? 'cash' : 'card'}
                policy={current.policy}
                amountMinor={current.amountMinor}
                currency={current.currency}
                holdDateIso={effectiveHoldDateIso}
                message={message}
                setMessage={setMessage}
                onServerPatch={handleServerPatch}
                onPolicyChanged={handlePolicyChanged}
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
