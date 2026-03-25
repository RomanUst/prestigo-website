'use client'

import { useBookingStore } from '@/lib/booking-store'
import ProgressBar from './ProgressBar'
import StepStub from './steps/StepStub'

export default function BookingWizard() {
  const { currentStep, completedSteps, nextStep, prevStep } = useBookingStore()

  const renderStepContent = () => {
    // Step 1 placeholder — Plan 04 will replace with Step1TripType
    // Steps 2-6 render StepStub
    return <StepStub step={currentStep} />
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
        onClick={nextStep}
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
        className="animate-step-enter max-w-xl"
      >
        {/* Step heading */}
        {currentStep === 1 ? (
          <div className="mb-8">
            <p className="label mb-6">STEP 1 OF 6</p>
            <span className="copper-line mb-6 block" />
            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontWeight: 300,
                fontSize: 28,
                lineHeight: 1.25,
                color: 'var(--offwhite)',
              }}
            >
              Select your journey
            </h2>
          </div>
        ) : (
          <div className="mb-8">
            <p className="label mb-6">STEP {currentStep} OF 6</p>
          </div>
        )}

        {renderStepContent()}
      </div>

      {/* Desktop button row — hidden on mobile */}
      <div className="hidden md:flex justify-end gap-4 mt-8">
        {buttons}
      </div>

      {/* Mobile sticky button bar — hidden on desktop */}
      <div
        className="flex md:hidden items-center justify-end gap-4 sticky bottom-0"
        style={{
          backgroundColor: 'var(--anthracite)',
          borderTop: '1px solid var(--anthracite-light)',
          padding: '0 16px',
          height: 72,
        }}
      >
        {buttons}
      </div>
    </div>
  )
}
