'use client'

import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInput from '@/components/booking/AddressInput'
import Stepper from '@/components/booking/Stepper'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'

export default function Step1TripType() {
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const passengers = useBookingStore((s) => s.passengers)
  const luggage = useBookingStore((s) => s.luggage)
  const setOrigin = useBookingStore((s) => s.setOrigin)
  const setDestination = useBookingStore((s) => s.setDestination)
  const setPassengers = useBookingStore((s) => s.setPassengers)
  const setLuggage = useBookingStore((s) => s.setLuggage)
  const swapOriginDestination = useBookingStore((s) => s.swapOriginDestination)
  const nextStep = useBookingStore((s) => s.nextStep)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [swapHovered, setSwapHovered] = useState(false)

  // Validation
  function validateStep1(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!origin) errs.origin = 'Pickup location is required to continue.'
    if (tripType !== 'hourly' && !destination) errs.destination = 'Destination is required to continue.'
    return errs
  }

  const isValid =
    origin !== null &&
    (tripType === 'hourly' ? hours >= 1 : destination !== null) &&
    passengers >= 1

  const handleNext = () => {
    const validationErrors = validateStep1()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors({})
    nextStep()
  }

  const handleOriginSelect = (place: Parameters<typeof setOrigin>[0]) => {
    if (!place) return
    setOrigin(place)
    setErrors((prev) => {
      const next = { ...prev }
      delete next.origin
      return next
    })
  }

  const handleOriginClear = () => {
    setOrigin(null)
  }

  const handleDestinationSelect = (place: Parameters<typeof setDestination>[0]) => {
    if (!place) return
    setDestination(place)
    setErrors((prev) => {
      const next = { ...prev }
      delete next.destination
      return next
    })
  }

  const handleDestinationClear = () => {
    setDestination(null)
  }

  const showSwapIcon = tripType === 'transfer' || tripType === 'daily'
  const isAirportDropoff = tripType === 'airport_dropoff'
  const isAirportPickup = tripType === 'airport_pickup'

  // Continue button content (shared between desktop and mobile)
  const continueButton = (
    <button
      type="button"
      className="btn-primary"
      onClick={handleNext}
      aria-disabled={!isValid}
      disabled={!isValid}
      style={{
        opacity: isValid ? 1 : 0.4,
        cursor: isValid ? 'pointer' : 'not-allowed',
        pointerEvents: isValid ? 'auto' : 'none',
      }}
    >
      Continue
    </button>
  )

  return (
    <div>
      {/* Trip type tabs */}
      <TripTypeTabs />

      {/* Form fields with 24px gap */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px' }}>
        {/* Origin / Pickup */}
        <AddressInput
          label="PICKUP LOCATION"
          placeholder="Enter pickup address"
          value={isAirportDropoff ? PRG_CONFIG : origin}
          onSelect={handleOriginSelect}
          onClear={handleOriginClear}
          readOnly={isAirportDropoff}
          readOnlyIcon={isAirportDropoff}
          hasError={!!errors.origin}
          errorMessage={errors.origin}
          ariaLabel="Pickup location"
        />

        {/* Swap icon — only for transfer and daily */}
        {showSwapIcon && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-20px', marginBottom: '-20px' }}>
            <button
              type="button"
              onClick={swapOriginDestination}
              aria-label="Swap origin and destination"
              onMouseEnter={() => setSwapHovered(true)}
              onMouseLeave={() => setSwapHovered(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'var(--anthracite)',
                border: '1px solid var(--anthracite-light)',
                cursor: 'pointer',
                color: swapHovered ? 'var(--copper)' : 'var(--warmgrey)',
                transition: 'color 0.2s ease',
                zIndex: 1,
                position: 'relative',
              }}
            >
              <ArrowUpDown size={16} />
            </button>
          </div>
        )}

        {/* Destination or Duration */}
        {tripType === 'hourly' ? (
          <DurationSelector />
        ) : (
          <AddressInput
            label="DESTINATION"
            placeholder="Enter destination"
            value={isAirportPickup ? PRG_CONFIG : destination}
            onSelect={handleDestinationSelect}
            onClear={handleDestinationClear}
            readOnly={isAirportPickup}
            readOnlyIcon={isAirportPickup}
            hasError={!!errors.destination}
            errorMessage={errors.destination}
            ariaLabel="Destination"
          />
        )}

        {/* Passengers + Luggage row */}
        <div
          className="md:flex-row flex-col"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div style={{ flex: 1 }}>
            <Stepper
              label="PASSENGERS"
              value={passengers}
              min={1}
              max={8}
              onChange={setPassengers}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Stepper
              label="LUGGAGE"
              value={luggage}
              min={0}
              max={8}
              onChange={setLuggage}
            />
          </div>
        </div>
      </div>

      {/* Desktop Continue button — inline, right-aligned */}
      <div className="hidden md:flex justify-end" style={{ marginTop: '32px' }}>
        {continueButton}
      </div>

      {/* Mobile sticky Continue button bar */}
      <div
        className="flex md:hidden items-center justify-end sticky bottom-0"
        style={{
          backgroundColor: 'var(--anthracite)',
          borderTop: '1px solid var(--anthracite-light)',
          padding: '0 16px',
          height: 72,
        }}
      >
        {continueButton}
      </div>
    </div>
  )
}
