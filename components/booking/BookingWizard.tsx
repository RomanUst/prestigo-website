'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBookingStore } from '@/lib/booking-store'
import { isAirportPlace } from '@/types/booking'
import type { TripType, VehicleClass } from '@/types/booking'
import { computeExtrasTotal } from '@/lib/extras'
import { trackMetaEvent } from '@/components/MetaPixel'
import ProgressBar from './ProgressBar'
import EntryBar from './EntryBar'

const VALID_TRIP_TYPES = new Set(['transfer', 'hourly', 'daily', 'round_trip'])
const VALID_CLASSES = new Set(['business', 'first_class', 'business_van'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
import StepStub from './steps/StepStub'
import Step3Vehicle from './steps/Step3Vehicle'
import Step3Auth from './steps/Step3Auth'
import Step4Extras from './steps/Step4Extras'
import Step5Passenger from './steps/Step5Passenger'
import Step6Payment from './steps/Step6Payment'

export default function BookingWizard() {
  const { currentStep, completedSteps, nextStep, prevStep } = useBookingStore()
  const router = useRouter()
  const quoteMode = useBookingStore((s) => s.quoteMode)

  // On mount: reset to step 1 unless arriving via deeplink (homepage widget or calculator)
  useEffect(() => {
    const deeplinkFlag = sessionStorage.getItem('booking_deeplink') === '1'
    const urlParams = new URLSearchParams(window.location.search)

    if (!deeplinkFlag && urlParams.toString() === '') {
      // No deeplink: reset to step 1 if not already there
      if (useBookingStore.getState().currentStep > 1) {
        useBookingStore.setState({ currentStep: 1, completedSteps: new Set() })
      }
      return
    }

    // Pre-fill store from URL params (calculator deeplink)
    const type = urlParams.get('type')
    if (type && VALID_TRIP_TYPES.has(type)) {
      useBookingStore.getState().setTripType(type as TripType)
    }

    const from = urlParams.get('from')
    const fromPlaceId = urlParams.get('fromPlaceId')
    const fromLat = urlParams.get('fromLat')
    const fromLng = urlParams.get('fromLng')
    if (from && fromPlaceId && fromLat && fromLng && !isNaN(Number(fromLat)) && !isNaN(Number(fromLng))) {
      useBookingStore.getState().setOrigin({ address: from, placeId: fromPlaceId, lat: Number(fromLat), lng: Number(fromLng) })
    }

    const to = urlParams.get('to')
    const toPlaceId = urlParams.get('toPlaceId')
    const toLat = urlParams.get('toLat')
    const toLng = urlParams.get('toLng')
    if (to && toPlaceId && toLat && toLng && !isNaN(Number(toLat)) && !isNaN(Number(toLng))) {
      useBookingStore.getState().setDestination({ address: to, placeId: toPlaceId, lat: Number(toLat), lng: Number(toLng) })
    }

    const date = urlParams.get('date')
    if (date && DATE_RE.test(date)) useBookingStore.getState().setPickupDate(date)

    const time = urlParams.get('time')
    if (time && TIME_RE.test(time)) useBookingStore.getState().setPickupTime(time)

    const vclass = urlParams.get('class')
    if (vclass && VALID_CLASSES.has(vclass)) useBookingStore.getState().setVehicleClass(vclass as VehicleClass)

    const pax = urlParams.get('pax')
    if (pax && /^\d+$/.test(pax)) useBookingStore.getState().setPassengers(Number(pax))

    sessionStorage.removeItem('booking_deeplink')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])  

  // Scroll to top of booking section on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [currentStep])

  const tripType = useBookingStore((s) => s.tripType)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const passengerDetails = useBookingStore((s) => s.passengerDetails)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const extras = useBookingStore((s) => s.extras)
  const promoDiscount = useBookingStore((s) => s.promoDiscount)

  // GA4 funnel events — fire once per event per session so we can see drop-off
  // between Step 1 → Vehicle → Checkout → Payment → Purchase. Uses a ref-backed
  // Set because StrictMode double-invocation would otherwise double-count.
  // form_start and checkout_progress(step N) are emitted alongside the existing
  // recommended ecommerce events so GA4 funnel reports show every transition.
  const funnelFiredRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as typeof window & {
      dataLayer?: unknown[]
      gtag?: (...args: unknown[]) => void
    }
    const push = (eventName: string, params: Record<string, unknown>, dedupeKey?: string) => {
      const key = dedupeKey ?? eventName
      if (funnelFiredRef.current.has(key)) return
      funnelFiredRef.current.add(key)
      if (typeof w.gtag === 'function') {
        w.gtag('event', eventName, params)
      } else {
        w.dataLayer = w.dataLayer || []
        w.dataLayer.push({ event: eventName, ...params })
      }
    }

    const VEHICLE_LABELS: Record<string, string> = {
      business: 'Business',
      first_class: 'First Class',
      business_van: 'Business Van',
    }
    const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
    const extrasTotal = computeExtrasTotal(extras)
    const baseTotal = selectedPrice ? selectedPrice.base + extrasTotal : 0
    const totalEur =
      promoDiscount > 0 ? Math.round(baseTotal * (1 - promoDiscount / 100)) : baseTotal
    const currency = selectedPrice?.currency ?? 'EUR'
    const items = vehicleClass
      ? [
          {
            item_id: vehicleClass,
            item_name: VEHICLE_LABELS[vehicleClass] ?? vehicleClass,
            item_category: tripType ?? 'transfer',
            item_variant: tripType ?? 'transfer',
            price: totalEur,
            quantity: 1,
          },
        ]
      : []

    // Per-step progress event — fires once per step. Lets us see exactly where
    // users drop off (between step_1 and step_2 etc).
    const STEP_NAMES: Record<number, string> = {
      1: 'entry_bar',
      2: 'vehicle',
      3: 'auth',
      4: 'extras',
      5: 'passenger',
      6: 'payment',
    }
    push(
      'checkout_progress',
      {
        checkout_step: currentStep,
        step_name: STEP_NAMES[currentStep] ?? `step_${currentStep}`,
        currency,
        value: totalEur,
      },
      `checkout_progress_${currentStep}`,
    )

    if (currentStep === 1) {
      // form_start — fire once when the booking wizard mounts at step 1.
      // GA4 Enhanced Measurement form_start only triggers on <form> elements;
      // our wizard isn't a form, so we emit it manually.
      push('form_start', { form_id: 'booking_wizard', form_name: 'Booking Wizard' })
    } else if (currentStep === 2) {
      push('view_item_list', {
        item_list_name: 'Vehicle Selection',
        currency,
        items: priceBreakdown
          ? (Object.entries(priceBreakdown) as Array<[string, { base: number; currency: string }]>).map(([k, v]) => ({
              item_id: k,
              item_name: VEHICLE_LABELS[k] ?? k,
              item_category: tripType ?? 'transfer',
              item_variant: tripType ?? 'transfer',
              price: v.base,
              quantity: 1,
            }))
          : [],
      })
      // view_item — fires when a specific vehicle becomes selected at step 2.
      // Deduped by item_id so switching vehicles re-fires for the new one.
      if (vehicleClass && selectedPrice) {
        push(
          'view_item',
          { currency, value: totalEur, items },
          `view_item_${vehicleClass}`,
        )
      }
    } else if (currentStep === 6 && vehicleClass) {
      // InitiateCheckout (plan 59-04) — fires in StickyBookingPanel on vehicle select
      push('add_payment_info', { currency, value: totalEur, items, payment_type: 'stripe' })
      trackMetaEvent('AddPaymentInfo', { value: totalEur, currency })
    }
  }, [currentStep, vehicleClass, priceBreakdown, extras, promoDiscount, tripType])

  const isAirportRide = isAirportPlace(origin) || isAirportPlace(destination)

  const canProceed = (() => {
    switch (currentStep) {
      case 1:
        return true // EntryBar handles its own validation and CTA
      case 2:
        // Vehicle step: must have selected a vehicle class; round_trip also needs return time
        return vehicleClass !== null && (tripType !== 'round_trip' || (returnDate !== null && returnTime !== null))
      case 3:
        return false // Auth step self-navigates; generic Continue is hidden
      case 4:
        return true // extras are all optional — always can proceed
      case 5:
        return (
          !!passengerDetails?.firstName &&
          !!passengerDetails?.lastName &&
          !!passengerDetails?.email &&
          !!passengerDetails?.phone
        )
      default:
        return true // step 6 (payment) and beyond
    }
  })()

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <EntryBar />
      case 2:
        return <Step3Vehicle />
      case 3:
        return <Step3Auth />
      case 4:
        return <Step4Extras />
      case 5:
        return <Step5Passenger />
      case 6:
        return <Step6Payment />
      default:
        return <StepStub step={currentStep} />
    }
  }

  const handleNext = async () => {
    if (currentStep === 6 && quoteMode) {
      // Quote mode: skip payment, submit quote, go to confirmation
      try {
        const store = useBookingStore.getState()
        const res = await fetch('/api/submit-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripType: store.tripType,
            origin: store.origin?.address,
            destination: store.destination?.address,
            pickupDate: store.pickupDate,
            pickupTime: store.pickupTime,
            vehicleClass: store.vehicleClass,
            passengers: store.passengers,
            extras: store.extras,
            passengerDetails: store.passengerDetails,
          }),
        })
        const data = await res.json()
        router.push(`/book/confirmation?type=quote&ref=${data.quoteReference}`)
      } catch {
        // On error, still navigate with a fallback reference
        router.push('/book/confirmation?type=quote&ref=QR-error')
      }
      return
    }
    nextStep()
  }

  const buttons = (
    <>
      {currentStep > 1 && (
        <button
          type="button"
          className="btn-ghost"
          onClick={prevStep}
        >
          Back
        </button>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={handleNext}
        disabled={!canProceed}
        style={!canProceed ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      >
        Continue
      </button>
    </>
  )

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-12">
      <ProgressBar
        currentStep={currentStep}
        completedSteps={completedSteps}
        totalSteps={6}
      />

      {/* Step content */}
      <div
        key={currentStep}
        className={`animate-step-enter ${currentStep === 2 || currentStep === 6 ? '' : currentStep === 1 ? 'max-w-2xl' : 'max-w-xl'} ${currentStep > 1 && currentStep < 6 && currentStep !== 2 && currentStep !== 3 ? 'pb-24 md:pb-0' : ''}`}
      >
        {/* Step heading — skipped at step 2 (heading lives inside Step3Vehicle, after the route bar) */}
        {currentStep !== 2 ? (
          <div className="mb-8">
            <p className="label mb-6">STEP {currentStep} OF 6</p>
            <span className="copper-line mb-6 block" />
            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontWeight: 300,
                fontSize: currentStep === 1 ? 28 : 26,
                lineHeight: 1.25,
                color: 'var(--offwhite)',
              }}
            >
              {currentStep === 1
                ? 'Plan your journey'
                : currentStep === 3
                ? 'Sign in to continue'
                : currentStep === 4
                ? 'Add extras'
                : currentStep === 5
                ? 'Passenger details'
                : 'Payment'}
            </h2>
          </div>
        ) : (
          <div className="mb-6">
            <p className="label mb-6">STEP {currentStep} OF 6</p>
            <span className="copper-line mb-0 block" />
          </div>
        )}

        {renderStepContent()}
      </div>

      {/* Generic Back/Next button bar — steps 4–5 only (step 2 uses StickyBookingPanel, step 3 uses Step3Auth's own Back button) */}
      {currentStep > 1 && currentStep < 6 && currentStep !== 2 && currentStep !== 3 && (
        <>
          {/* Desktop button row — hidden on mobile */}
          <div className="hidden md:flex justify-end gap-4 mt-8">
            {buttons}
          </div>

          {/* Mobile sticky button bar */}
          <div
            className="flex md:hidden items-center justify-end gap-4 sticky bottom-0"
            style={{
              backgroundColor: 'var(--anthracite)',
              borderTop: '1px solid var(--anthracite-light)',
              padding: '0 16px',
              paddingBottom: 'env(safe-area-inset-bottom)',
              height: 72,
            }}
          >
            {buttons}
          </div>
        </>
      )}
    </div>
  )
}
