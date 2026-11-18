'use client'

// Card checkout step of the transfer wizard (Phase 88, plans 88-10 and 88-12; HOLD-01, HOLD-03, D-09, D-11, D-12).
// Built to 88-UI-SPEC.md Surface 1. Phase 89 (plan 89-11; CASH-01, CANC-02, D-08, D-16): payment choice, cancellation
// note, free-until moment.
//
// Phase 93 (plan 93-03; D-11): the payment UI itself (choice tiles, explainer, cancellation note, consent, Stripe
// Payment Element, submit) moved to components/booking/CardPaymentStage.tsx so the tour checkout renders the same
// engine. This wrapper keeps what only the wizard has: the booking summary, the promo code, the currency switch, the
// re-init after a currency or promo change, and the wizard store (the trip part of the intent body, the way back to
// the details step on an invalid phone, the GA4 total).

import { useMemo, useState, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { VEHICLE_CLASS_KEY } from '@/types/booking'
import type { AppLocale } from '@/i18n/locales'
import BookingSummaryBlock from '../BookingSummaryBlock'
import {
  CardPaymentStage,
  SUPPORTED_MODES,
  type AnalyticsItem,
  type PaymentChoice,
  type SlotMessage,
} from '../CardPaymentStage'
import PromoCodeField from './PromoCodeField'
import {
  buildCardCheckoutBody,
  ensureAttemptId,
  fetchCardInit,
  type CardCurrency,
  type InitEligible,
} from './cardCheckoutApi'

// Importers of this module keep working: the shared names live in CardPaymentStage now.
export { SUPPORTED_MODES }
export type { PaymentChoice, SlotMessage }

export default function Step6CardOnFile({ init, onFallback }: { init: InitEligible; onFallback: () => void }) {
  const t = useTranslations('Booking.step6')
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

  // The trip part of the intent body comes from the wizard store, read fresh at submit time (never a stale closure).
  const buildIntentBody = (attemptId: string) => {
    const state = useBookingStore.getState()
    return buildCardCheckoutBody(state, { attemptId, currency: current.currency, promoCode: state.promoCode, locale })
  }

  /**
   * Re-call init after a currency or promo change. The stage shows the loading line while the new server amount is
   * fetched (so the tick cannot survive), and a result the step cannot render falls back to the legacy step.
   */
  const reinit = async (over: { currency?: CardCurrency; promoCode?: string | null }) => {
    const seq = ++reinitSeq.current
    setReiniting(true)

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

      <CardPaymentStage
        init={current}
        payment={payment}
        onPaymentChange={setPayment}
        buildIntentBody={buildIntentBody}
        onInvalidPhone={() => useBookingStore.getState().goToStep?.(5)}
        onFallback={onFallback}
        onBusyChange={setBusy}
        totalEur={discountedTotalEur}
        analyticsItems={analyticsItems}
        reiniting={reiniting}
      />
    </div>
  )
}
