'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInput from '@/components/booking/AddressInput'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
import type { PlaceResult } from '@/types/booking'

export default function BookingWidget() {
  const router = useRouter()
  const tripType = useBookingStore((s) => s.tripType)

  const [origin, setOrigin] = useState<PlaceResult | null>(null)
  const [destination, setDestination] = useState<PlaceResult | null>(null)
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [todayStr, setTodayStr] = useState<string>('')

  // Prevent hydration mismatch — set today's date on client only
  useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0])
  }, [])

  const handleBookNow = () => {
    // Validate required fields
    const newErrors: Record<string, string> = {}
    if (!origin) newErrors.origin = 'required'
    if (tripType !== 'hourly' && !destination) newErrors.destination = 'required'
    if (!date) newErrors.date = 'required'
    if (!time) newErrors.time = 'required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    // Write to Zustand store
    const store = useBookingStore.getState()
    store.setTripType(tripType)
    store.setOrigin(origin)
    if (tripType !== 'hourly') {
      store.setDestination(destination)
    }
    store.setPickupDate(date)
    store.setPickupTime(time)

    // Deep-link to Step 3
    useBookingStore.setState({
      currentStep: 3,
      completedSteps: new Set([1, 2]),
    })

    router.push('/book')
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--anthracite-mid)',
    border: '1px solid var(--anthracite-light)',
    padding: '12px 16px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '14px',
    fontWeight: 300,
    color: 'var(--offwhite)',
    outline: 'none',
    colorScheme: 'dark',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    display: 'block',
    WebkitAppearance: 'none',
    appearance: 'none',
  }

  const hasError = Object.keys(errors).length > 0

  return (
    <div>
      {/* Trip type selector */}
      <TripTypeTabs />

      {/* Form fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px' }}>
        {/* Origin */}
        <AddressInput
          label="PICKUP LOCATION"
          placeholder="Pick-up address"
          value={origin}
          onSelect={(place) => {
            setOrigin(place)
            setErrors((prev) => {
              const next = { ...prev }
              delete next.origin
              return next
            })
          }}
          onClear={() => setOrigin(null)}
          hasError={!!errors.origin}
          ariaLabel="Pick-up address"
        />

        {/* Destination or Duration */}
        {tripType === 'hourly' ? (
          <DurationSelector />
        ) : (
          <AddressInput
            label="DESTINATION"
            placeholder="Drop-off address"
            value={destination}
            onSelect={(place) => {
              setDestination(place)
              setErrors((prev) => {
                const next = { ...prev }
                delete next.destination
                return next
              })
            }}
            onClear={() => setDestination(null)}
            hasError={!!errors.destination}
            ariaLabel="Drop-off address"
          />
        )}

        {/* Date / Time row */}
        <div
          className="flex flex-col md:flex-row"
          style={{ gap: '24px', overflow: 'hidden' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <label
              className="label"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              DATE
            </label>
            <input
              type="date"
              value={date}
              min={todayStr}
              onChange={(e) => {
                setDate(e.target.value)
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.date
                  return next
                })
              }}
              style={{
                ...inputStyle,
                border: errors.date ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label
              className="label"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              TIME
            </label>
            <input
              type="time"
              value={time}
              step={900}
              onChange={(e) => {
                setTime(e.target.value)
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.time
                  return next
                })
              }}
              style={{
                ...inputStyle,
                border: errors.time ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              }}
            />
          </div>
        </div>

        {/* Validation error */}
        {hasError && (
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 400,
              color: '#C0392B',
              marginTop: '-8px',
            }}
          >
            Please fill in all required fields before continuing.
          </p>
        )}

        {/* CTA */}
        <button
          type="button"
          className="btn-primary"
          onClick={handleBookNow}
          style={{ width: '100%', marginTop: '24px' }}
        >
          BOOK NOW
        </button>
      </div>
    </div>
  )
}
