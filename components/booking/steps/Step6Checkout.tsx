'use client'

// Step 6 gate (Phase 88, plan 88-10; D-09). Calls POST /api/card-checkout/init once on mount and renders:
//   - the "Loading payment..." line while the call is in flight,
//   - Step6CardOnFile for an eligible client in a mode it implements,
//   - the unchanged legacy Step6Payment for everyone else (ineligible, init failure, unsupported mode).
// The UI only renders what init returns; the intent route re-checks eligibility, consent and amount (T-88-28).

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import BookingSummaryBlock from '../BookingSummaryBlock'
import Step6Payment from './Step6Payment'
import Step6CardOnFile, { SUPPORTED_MODES } from './Step6CardOnFile'
import {
  buildCardCheckoutBody,
  ensureAttemptId,
  fetchCardInit,
  rotateAttemptIfCardUsed,
  type InitEligible,
} from './cardCheckoutApi'

export { buildCardCheckoutBody, fetchCardInit }

type Phase = { kind: 'loading' } | { kind: 'card'; init: InitEligible } | { kind: 'legacy' }

export default function Step6Checkout() {
  const t = useTranslations('Booking.step6')
  const locale = useLocale()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const state = useBookingStore.getState()
    const attemptId = ensureAttemptId()

    fetchCardInit({
      ...buildCardCheckoutBody(state, { attemptId, currency: 'eur', promoCode: state.promoCode, locale }),
      currency: 'eur',
    }).then((result) => {
      if (cancelled) return
      if (result && result.eligible && SUPPORTED_MODES.includes(result.mode)) {
        setPhase({ kind: 'card', init: result })
        return
      }
      rotateAttemptIfCardUsed()
      setPhase({ kind: 'legacy' })
    })

    return () => {
      cancelled = true
    }
    // Once on mount: later currency / promo changes re-init inside Step6CardOnFile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFallback = useCallback(() => {
    rotateAttemptIfCardUsed()
    setPhase({ kind: 'legacy' })
  }, [])

  if (phase.kind === 'legacy') return <Step6Payment />
  if (phase.kind === 'card') return <Step6CardOnFile init={phase.init} onFallback={handleFallback} />

  return (
    <div className="max-w-[560px] mx-auto">
      <BookingSummaryBlock selectedCurrency="eur" />
      <p
        style={{
          marginTop: 24,
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {t('loadingPayment')}
      </p>
    </div>
  )
}
