'use client'

import { useEffect } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { isAirportPlace } from '@/types/booking'
import { useRouter } from 'next/navigation'
import ProgressBar from './ProgressBar'
import StepStub from './steps/StepStub'
import Step1TripType from './steps/Step1TripType'
import Step2DateTime from './steps/Step2DateTime'
import Step3Vehicle from './steps/Step3Vehicle'
import Step4Extras from './steps/Step4Extras'
import Step5Passenger from './steps/Step5Passenger'
import Step6Payment from './steps/Step6Payment'

export default function BookingWizard() {
  const { currentStep, completedSteps, nextStep, prevStep } = useBookingStore()
  const router = useRouter()
  const quoteMode = useBookingStore((s) => s.quoteMode)

  // On mount: reset to step 1 unless arriving via homepage widget deeplink
  useEffect(() => {
    const isDeeplink = sessionStorage.getItem('booking_deeplink') === '1'
    sessionStorage.removeItem('booking_deeplink')
    if (!isDeeplink && useBookingStore.getState().currentStep > 1) {
      useBookingStore.setState({ currentStep: 1, completedSteps: new Set() })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const isAirportRide = isAirportPlace(origin) || isAirportPlace(destination)

  const canProceed = (() => {
    switch (currentStep) {
      case 1:
        return true // Step 1 handles its own validation and Continue button
      case 2:
        return (
          pickupDate !== null &&
          pickupTime !== null &&
          (tripType !== 'daily' || returnDate !== null)
        )
      case 3:
        return vehicleClass !== null && (tripType !== 'round_trip' || (returnDate !== null && returnTime !== null))
      case 4:
        return true // Step 4 extras are all optional — always can proceed
      case 5:
        return (
          !!passengerDetails?.firstName &&
          !!passengerDetails?.lastName &&
          !!passengerDetails?.email &&
          !!passengerDetails?.phone &&
          (!isAirportRide || !!passengerDetails?.flightNumber)
        )
      default:
        return true // Step 6 will add its own validation later
    }
  })()

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <Step1TripType />
      case 2:
        return <Step2DateTime />
      case 3:
        return <Step3Vehicle />
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
    if (currentStep === 5 && quoteMode) {
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
        className={`animate-step-enter ${currentStep === 3 || currentStep === 6 ? '' : 'max-w-xl'} ${currentStep > 1 && currentStep < 6 && currentStep !== 3 ? 'pb-24 md:pb-0' : ''}`}
      >
        {/* Step heading — full treatment for steps 1-6 */}
        {currentStep <= 6 ? (
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
                ? 'Select your journey'
                : currentStep === 2
                ? 'Select your date & time'
                : currentStep === 3
                ? 'Choose your vehicle'
                : currentStep === 4
                ? 'Add extras'
                : currentStep === 5
                ? 'Passenger details'
                : 'Payment'}
            </h2>
          </div>
        ) : (
          <div className="mb-8">
            <p className="label mb-6">STEP {currentStep} OF 6</p>
          </div>
        )}

        {renderStepContent()}
      </div>

      {/* Generic Back/Next button bar — only rendered for steps 2–5 (not step 1 or step 6) */}
      {currentStep > 1 && currentStep < 6 && (
        <>
          {/* Desktop button row — hidden on mobile */}
          <div className="hidden md:flex justify-end gap-4 mt-8">
            {buttons}
          </div>

          {/* Mobile sticky button bar — hidden on desktop, and hidden at Step 3 where PriceSummary takes over */}
          {currentStep !== 3 && (
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
          )}
        </>
      )}
    </div>
  )
}
