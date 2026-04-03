'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'
import ProgressBar from '@/components/booking/ProgressBar'
import Step1TripType from '@/components/booking/steps/Step1TripType'
import Step2DateTime from '@/components/booking/steps/Step2DateTime'
import Step3Vehicle from '@/components/booking/steps/Step3Vehicle'
import Step4Extras from '@/components/booking/steps/Step4Extras'
import Step5Passenger from '@/components/booking/steps/Step5Passenger'
import AdminStep6Create from './AdminStep6Create'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const STEP_TITLES = [
  'Select your journey',
  'Select date & time',
  'Choose your vehicle',
  'Add extras',
  'Passenger details',
  'Review & create',
]

export function AdminBookingWizard({ open, onClose, onCreated }: Props) {
  const currentStep = useBookingStore(s => s.currentStep)
  const completedSteps = useBookingStore(s => s.completedSteps)
  const nextStep = useBookingStore(s => s.nextStep)
  const prevStep = useBookingStore(s => s.prevStep)
  const resetBooking = useBookingStore(s => s.resetBooking)

  const tripType = useBookingStore(s => s.tripType)
  const pickupDate = useBookingStore(s => s.pickupDate)
  const pickupTime = useBookingStore(s => s.pickupTime)
  const returnDate = useBookingStore(s => s.returnDate)
  const vehicleClass = useBookingStore(s => s.vehicleClass)
  const origin = useBookingStore(s => s.origin)
  const destination = useBookingStore(s => s.destination)
  const passengerDetails = useBookingStore(s => s.passengerDetails)

  // Reset store (and sessionStorage) each time the modal opens fresh
  useEffect(() => {
    if (open) {
      resetBooking()
    }
  }, [open, resetBooking])

  if (!open) return null

  const isAirportRide =
    origin?.placeId === PRG_CONFIG.placeId ||
    destination?.placeId === PRG_CONFIG.placeId

  const canProceed = (() => {
    switch (currentStep) {
      case 1:
        return true // Step1 manages its own Continue button
      case 2:
        return (
          pickupDate !== null &&
          pickupTime !== null &&
          (tripType !== 'daily' || returnDate !== null)
        )
      case 3:
        return vehicleClass !== null
      case 4:
        return true
      case 5:
        return (
          !!passengerDetails?.firstName &&
          !!passengerDetails?.lastName &&
          !!passengerDetails?.email &&
          !!passengerDetails?.phone &&
          (!isAirportRide || !!passengerDetails?.flightNumber)
        )
      default:
        return true
    }
  })()

  const handleClose = () => {
    resetBooking()
    onClose()
  }

  const handleCreated = () => {
    resetBooking()
    onCreated()
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1TripType />
      case 2: return <Step2DateTime />
      case 3: return <Step3Vehicle />
      case 4: return <Step4Extras />
      case 5: return <Step5Passenger />
      case 6: return <AdminStep6Create onClose={handleClose} onCreated={handleCreated} />
      default: return null
    }
  }

  // Step 1 has its own Continue button; Step 6 has its own Create button
  const showNavButtons = currentStep > 1 && currentStep < 6

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          background: 'rgba(0,0,0,0.7)',
        }}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New Booking"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          width: '100%',
          maxWidth: 820,
          background: 'var(--anthracite)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Copper accent */}
        <div style={{ height: 2, background: 'linear-gradient(90deg, var(--copper), transparent)', flexShrink: 0 }} />

        {/* Sticky header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 32px',
            borderBottom: '1px solid var(--anthracite-light)',
            position: 'sticky',
            top: 0,
            background: 'var(--anthracite)',
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '9px',
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: 'var(--copper)',
                margin: 0,
              }}
            >
              NEW BOOKING — STEP {currentStep} OF 6
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: '24px',
                fontWeight: 300,
                color: 'var(--offwhite)',
                margin: '4px 0 0',
                lineHeight: 1.2,
              }}
            >
              {STEP_TITLES[currentStep - 1]}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--warmgrey)',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '0 32px', flexShrink: 0 }}>
          <ProgressBar
            currentStep={currentStep}
            completedSteps={completedSteps}
            totalSteps={6}
          />
        </div>

        {/* Step content */}
        <div
          key={currentStep}
          className="animate-step-enter"
          style={{ flex: 1, padding: '0 32px 32px' }}
        >
          {renderStep()}
        </div>

        {/* Back / Continue navigation (steps 2-5 only) */}
        {showNavButtons && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '16px 32px',
              borderTop: '1px solid var(--anthracite-light)',
              position: 'sticky',
              bottom: 0,
              background: 'var(--anthracite)',
              flexShrink: 0,
            }}
          >
            <button type="button" className="btn-ghost" onClick={prevStep}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={nextStep}
              disabled={!canProceed}
              style={!canProceed ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              Continue
            </button>
          </div>
        )}

        {/* Back button on Step 6 */}
        {currentStep === 6 && (
          <div
            style={{
              padding: '12px 32px',
              borderTop: '1px solid var(--anthracite-light)',
              flexShrink: 0,
            }}
          >
            <button type="button" className="btn-ghost" onClick={prevStep}>
              Back
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default AdminBookingWizard
