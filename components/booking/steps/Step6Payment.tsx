'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { formatCZK } from '@/lib/currency'
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
  totalAmount: number
  bookingRef: string
}

function PaymentForm({ totalAmount, bookingRef }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
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
    }
    // On success: browser redirects automatically via return_url
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />

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
        disabled={isProcessing || !stripe}
        aria-disabled={isProcessing || !stripe}
        style={{
          width: '100%',
          marginTop: 24,
          ...(isProcessing || !stripe ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        }}
      >
        {`PAY ${formatCZK(totalAmount)}`}
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

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bookingRef, setBookingRef] = useState<string>('')

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const totalAmount = selectedPrice ? selectedPrice.base + extrasTotal : 0

  useEffect(() => {
    if (totalAmount <= 0) return

    const fetchPaymentIntent = async () => {
      try {
        const res = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCZK: totalAmount,
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
              amountCzk: String(totalAmount),
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
            },
          }),
        })
        const data = await res.json()
        setClientSecret(data.clientSecret)
        setBookingRef(data.bookingReference)
      } catch {
        // Silent failure — clientSecret stays null, user sees loading state
      }
    }

    fetchPaymentIntent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount])

  const options = useMemo(
    () => (clientSecret ? { clientSecret, appearance } : null),
    [clientSecret]
  )

  return (
    <div className="max-w-[560px] mx-auto">
      <BookingSummaryBlock />

      <div style={{ borderTop: '1px solid var(--anthracite-light)', margin: '32px 0' }} />

      <span className="label">SECURE PAYMENT</span>

      <div style={{ marginTop: 24 }}>
        {options ? (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm totalAmount={totalAmount} bookingRef={bookingRef} />
          </Elements>
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
