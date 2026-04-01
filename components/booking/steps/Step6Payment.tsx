'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk, formatCZK, formatEUR } from '@/lib/currency'
import BookingSummaryBlock from '../BookingSummaryBlock'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const appearance = {
  theme: 'night' as const,
  variables: {
    colorBackground: '#2A2A2D',
    colorText: '#F5F2EE',
    colorTextPlaceholder: '#9A958F',
    colorPrimary: '#B87333',
    colorDanger: '#C0392B',
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
}

function PaymentForm({ totalEur, selectedCurrency, bookingRef }: PaymentFormProps) {
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

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation?ref=${bookingRef}`,
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
      window.location.href = `${window.location.origin}/book/confirmation?ref=${bookingRef}`
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
  const distanceKm = useBookingStore((s) => s.distanceKm)
  const passengerDetails = useBookingStore((s) => s.passengerDetails)

  const [selectedCurrency, setSelectedCurrency] = useState<'eur' | 'czk'>('eur')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bookingRef, setBookingRef] = useState<string>('')
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const totalEur = selectedPrice ? selectedPrice.base + extrasTotal : 0

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
              distanceKm: distanceKm != null ? String(distanceKm) : '',
              extraChildSeat: String(extras.childSeat),
              extraMeetGreet: String(extras.meetAndGreet),
              extraLuggage: String(extras.extraLuggage),
              firstName: passengerDetails?.firstName ?? '',
              lastName: passengerDetails?.lastName ?? '',
              email: passengerDetails?.email ?? '',
              phone: passengerDetails?.phone ?? '',
              flightNumber: passengerDetails?.flightNumber ?? '',
              terminal: passengerDetails?.terminal ?? '',
              specialRequests: (passengerDetails?.specialRequests ?? '').slice(0, 490),
              currency: selectedCurrency,
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
      } catch (err) {
        console.error('create-payment-intent fetch error:', err)
        setPaymentError('Network error — please refresh and try again')
      }
    }

    fetchPaymentIntent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalEur, selectedCurrency])

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
            <PaymentForm totalEur={totalEur} selectedCurrency={selectedCurrency} bookingRef={bookingRef} />
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
