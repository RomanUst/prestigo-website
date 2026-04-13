'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CheckCircle2 } from 'lucide-react'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { isAirportPlace } from '@/types/booking'
import { eurToCzk, formatCZK, formatEUR } from '@/lib/currency'
import { writePurchaseSnapshot } from '@/lib/analytics-snapshot'
import BookingSummaryBlock from '../BookingSummaryBlock'

const VEHICLE_LABELS_FOR_ANALYTICS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const appearance = {
  theme: 'night' as const,
  variables: {
    colorBackground: '#2A2A2D',
    colorText: '#F5F2EE',
    colorTextPlaceholder: '#9A958F',
    colorPrimary: '#B87333',
    colorDanger: '#f87171',
    fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
    fontSizeBase: '14px',
    fontWeightNormal: '300',
    borderRadius: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #3A3A3F', backgroundColor: '#2A2A2D' },
    '.Input:focus': { border: '1px solid #B87333', outline: '2px solid #B87333', outlineOffset: '4px' },
    '.Label': {
      fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
      fontSize: '10px',
      fontWeight: '400',
      letterSpacing: '0.4em',
      textTransform: 'uppercase',
      color: '#B87333',
    },
  },
}

interface PaymentFormProps {
  totalEur: number
  selectedCurrency: 'eur' | 'czk'
  bookingRef: string
  returnBookingRef: string   // empty string for one-way, PRG-... for round-trip (D-11)
  // Snapshot data for the GA4 purchase event on the confirmation page.
  // Passed down so PaymentForm can persist it to sessionStorage immediately
  // before the Stripe redirect (which wipes in-memory Zustand state).
  analyticsItems: Array<{
    item_id: string
    item_name: string
    item_category: string
    item_variant: string
    price: number
    quantity: number
  }>
}

function PaymentForm({
  totalEur,
  selectedCurrency,
  bookingRef,
  returnBookingRef,
  analyticsItems,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [elementReady, setElementReady] = useState(false)
  const [elementError, setElementError] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const payLabel = selectedCurrency === 'czk'
    ? `PAY ${formatCZK(eurToCzk(totalEur))}`
    : `PAY ${formatEUR(totalEur)}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage(null)

    // Persist the purchase snapshot BEFORE calling confirmPayment. Stripe may
    // redirect to a 3DS page (cross-origin) and back, and the non-3DS branch
    // below does a full `window.location.href` reload — both wipe in-memory
    // Zustand state, and priceBreakdown is intentionally not persisted.
    // sessionStorage survives both routes within the same tab.
    writePurchaseSnapshot({
      ref: bookingRef,
      value: totalEur,
      currency: 'EUR',
      items: analyticsItems,
    })

    // D-11: URL param name is `returnRef` (NOT `ref2`). Both validated via isValidRef
    // on the confirmation page.
    const confirmPath = returnBookingRef
      ? `/book/confirmation?ref=${bookingRef}&returnRef=${returnBookingRef}`
      : `/book/confirmation?ref=${bookingRef}`

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${confirmPath}`,
      },
      redirect: 'if_required',
    })

    if (error) {
      setErrorMessage(
        error.message
          ? `Payment unsuccessful. ${error.message}. Please check your details and try again.`
          : 'Something went wrong. Your booking details are saved — please try again.'
      )
      setIsProcessing(false)
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      window.location.href = `${window.location.origin}${confirmPath}`
    }
  }

  const isDisabled = isProcessing || !stripe || !elementReady

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{ layout: 'tabs', paymentMethodOrder: ['apple_pay', 'google_pay', 'card'], wallets: { applePay: 'auto', googlePay: 'auto' } }}
        onReady={() => setElementReady(true)}
        onLoadError={(e) => setElementError((e as { error?: { message?: string } })?.error?.message ?? 'Payment form failed to load. Please refresh and try again.')}
      />

      {elementError && (
        <p
          style={{
            color: '#C0392B',
            fontSize: 14,
            fontWeight: 300,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {elementError}
        </p>
      )}

      {errorMessage && (
        <p
          style={{
            color: '#C0392B',
            fontSize: 14,
            fontWeight: 300,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        style={{
          width: '100%',
          marginTop: 24,
          ...(isDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        }}
      >
        {!elementReady && !elementError ? 'Loading...' : payLabel}
      </button>
    </form>
  )
}

export default function Step6Payment() {
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const extras = useBookingStore((s) => s.extras)
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const passengers = useBookingStore((s) => s.passengers)
  const luggage = useBookingStore((s) => s.luggage)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const distanceKm = useBookingStore((s) => s.distanceKm)
  const passengerDetails = useBookingStore((s) => s.passengerDetails)

  const promoCode = useBookingStore((s) => s.promoCode)
  const promoDiscount = useBookingStore((s) => s.promoDiscount)
  const setPromoCode = useBookingStore((s) => s.setPromoCode)
  const setPromoDiscount = useBookingStore((s) => s.setPromoDiscount)

  const [selectedCurrency, setSelectedCurrency] = useState<'eur' | 'czk'>('eur')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bookingRef, setBookingRef] = useState<string>('')
  const [returnBookingRef, setReturnBookingRef] = useState<string>('')
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const selectedReturnLegPrice =
    vehicleClass && roundTripPriceBreakdown ? roundTripPriceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const isRoundTripMode = tripType === 'round_trip'

  const outboundWithExtras = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const returnLegTotal = selectedReturnLegPrice ? selectedReturnLegPrice.total : 0
  const totalEur = isRoundTripMode ? outboundWithExtras + returnLegTotal : outboundWithExtras

  const discountedTotalEur = promoDiscount > 0
    ? Math.round(totalEur * (1 - promoDiscount / 100))
    : totalEur

  // Build the GA4 items array for the purchase snapshot. Recomputes on every
  // render — cheap, and guarantees PaymentForm receives the current vehicle
  // class and price when the user clicks Pay.
  const analyticsItems = useMemo(
    () => [
      {
        item_id: vehicleClass ?? 'transfer',
        item_name:
          (vehicleClass && VEHICLE_LABELS_FOR_ANALYTICS[vehicleClass]) ||
          'Chauffeur Transfer',
        item_category: tripType ?? 'transfer',
        item_variant: tripType ?? 'transfer',
        price: discountedTotalEur,
        quantity: 1,
      },
    ],
    [vehicleClass, tripType, discountedTotalEur]
  )

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoLoading(true)
    setPromoError(null)
    try {
      const res = await fetch(`/api/validate-promo?code=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (data.valid) {
        setPromoCode(code)
        setPromoDiscount(data.discountPct)
        setPromoError(null)
      } else {
        setPromoError(data.error || 'Invalid code.')
        setPromoCode(null)
        setPromoDiscount(0)
      }
    } catch {
      setPromoError('Something went wrong. Please try again.')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    setPromoCode(null)
    setPromoDiscount(0)
    setPromoInput('')
    setPromoError(null)
  }

  useEffect(() => {
    if (totalEur <= 0) return

    setClientSecret(null)

    const fetchPaymentIntent = async () => {
      try {
        const res = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingData: {
              tripType,
              vehicleClass: vehicleClass ?? '',
              originAddress: origin?.address ?? '',
              originLat: origin?.lat != null ? String(origin.lat) : '',
              originLng: origin?.lng != null ? String(origin.lng) : '',
              destinationAddress: destination?.address ?? '',
              destinationLat: destination?.lat != null ? String(destination.lat) : '',
              destinationLng: destination?.lng != null ? String(destination.lng) : '',
              hours: String(hours),
              passengers: String(passengers),
              luggage: String(luggage),
              pickupDate: pickupDate ?? '',
              pickupTime: pickupTime ?? '',
              returnDate: returnDate ?? '',
              returnTime: returnTime ?? '',
              distanceKm: distanceKm != null ? String(distanceKm) : '',
              extraChildSeat: String(extras.childSeat),
              extraMeetGreet: String(extras.meetAndGreet),
              extraLuggage: String(extras.extraLuggage),
              isAirport: String(isAirportPlace(origin) || isAirportPlace(destination)),
              firstName: passengerDetails?.firstName ?? '',
              lastName: passengerDetails?.lastName ?? '',
              email: passengerDetails?.email ?? '',
              phone: passengerDetails?.phone ?? '',
              flightNumber: passengerDetails?.flightNumber ?? '',
              terminal: passengerDetails?.terminal ?? '',
              specialRequests: (passengerDetails?.specialRequests ?? '').slice(0, 490),
              currency: selectedCurrency,
              promoCode: promoCode || '',
            },
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          console.error('create-payment-intent error:', data.error)
          setPaymentError(data.error || 'Failed to initialise payment')
          return
        }
        setClientSecret(data.clientSecret)
        setBookingRef(data.bookingReference)
        setReturnBookingRef(data.returnBookingReference || '')
      } catch (err) {
        console.error('create-payment-intent fetch error:', err)
        setPaymentError('Network error — please refresh and try again')
      }
    }

    fetchPaymentIntent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalEur, selectedCurrency, promoCode, tripType, returnTime, roundTripPriceBreakdown])

  const options = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance,
            paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
            wallets: { applePay: 'auto' as const, googlePay: 'auto' as const },
            fields: { billingDetails: { address: 'never' as const } },
          }
        : null,
    [clientSecret]
  )

  return (
    <div className="max-w-[560px] mx-auto">
      <BookingSummaryBlock selectedCurrency={selectedCurrency} />

      {/* Promo Code Section */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <span style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 400,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: '#9A958F',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 8,
        }}>
          PROMO CODE
        </span>

        {promoCode ? (
          /* Applied state */
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#4ade80" />
            <span style={{
              fontSize: '13px',
              fontWeight: 300,
              color: '#F5F2EE',
              fontFamily: 'var(--font-montserrat)',
              letterSpacing: '0.08em',
            }}>{promoCode}</span>
            <button
              type="button"
              onClick={handleRemovePromo}
              style={{
                background: 'none',
                border: 'none',
                color: '#9A958F',
                fontSize: '11px',
                fontFamily: 'var(--font-montserrat)',
                cursor: 'pointer',
                textDecoration: 'underline',
                letterSpacing: '0.08em',
              }}
            >Remove</button>
          </div>
        ) : (
          /* Input state */
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Enter code"
              style={{
                flex: 1,
                backgroundColor: '#2A2A2D',
                border: promoError ? '1px solid #f87171' : '1px solid #3A3A3F',
                color: '#F5F2EE',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                fontWeight: 300,
                letterSpacing: '0.08em',
                padding: '8px 12px',
                minHeight: 44,
                borderRadius: 4,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleApplyPromo}
              disabled={promoLoading || !promoInput.trim()}
              style={{
                backgroundColor: '#B87333',
                color: '#F5F2EE',
                border: 'none',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                fontWeight: 400,
                letterSpacing: '0.08em',
                padding: '0 16px',
                minHeight: 44,
                borderRadius: 4,
                cursor: promoLoading || !promoInput.trim() ? 'not-allowed' : 'pointer',
                opacity: promoLoading || !promoInput.trim() ? 0.4 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {promoLoading ? '...' : 'Apply Code'}
            </button>
          </div>
        )}

        {promoError && (
          <p style={{
            color: '#f87171',
            fontSize: '13px',
            fontWeight: 300,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
          }}>{promoError}</p>
        )}

        {promoDiscount > 0 && (
          <p style={{
            color: '#4ade80',
            fontSize: '13px',
            fontWeight: 400,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
          }}>
            {`PROMO: \u2212${promoDiscount}%`}
          </p>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--anthracite-light)', margin: '32px 0' }} />

      {/* Currency selector */}
      <div style={{ marginBottom: 32 }}>
        <span className="label" style={{ display: 'block', marginBottom: 12 }}>
          PAY IN
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['eur', 'czk'] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => setSelectedCurrency(cur)}
              style={{
                padding: '8px 20px',
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-montserrat)',
                background: 'transparent',
                border: selectedCurrency === cur
                  ? '1px solid var(--copper)'
                  : '1px solid var(--anthracite-light)',
                color: selectedCurrency === cur ? 'var(--offwhite)' : 'var(--warmgrey)',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'border-color 0.2s ease, color 0.2s ease',
              }}
            >
              {cur === 'eur' ? 'EUR — €' : 'CZK — Kč'}
            </button>
          ))}
        </div>
      </div>

      <span className="label">SECURE PAYMENT</span>

      <div style={{ marginTop: 24 }}>
        {options ? (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm
              totalEur={discountedTotalEur}
              selectedCurrency={selectedCurrency}
              bookingRef={bookingRef}
              returnBookingRef={returnBookingRef}
              analyticsItems={analyticsItems}
            />
          </Elements>
        ) : paymentError ? (
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: '#C0392B',
              fontFamily: 'var(--font-montserrat)',
            }}
          >
            {paymentError}
          </p>
        ) : (
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
            }}
          >
            Loading payment...
          </p>
        )}
      </div>
    </div>
  )
}
