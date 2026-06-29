'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInputLegacy from '@/components/booking/AddressInput'
import AddressInputNew from '@/components/booking/AddressInputNew'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
import type { PlaceResult, TripType } from '@/types/booking'

// 96 AM/PM time slots at 15-minute granularity — same as EntryBar
const TIME_SLOTS_AMPM: Array<{ display: string; value24h: string }> =
  Array.from({ length: 96 }, (_, i) => {
    const totalMinutes = i * 15
    const h24 = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const isPM = h24 >= 12
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
    const display = `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
    const value24h = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    return { display, value24h }
  })

const MIN_LEAD_HOURS = 12

function isSlotDisabled(slot24h: string, pickupDateStr: string): boolean {
  if (!pickupDateStr) return false
  const slotDT = new Date(`${pickupDateStr}T${slot24h}:00`)
  const minDT = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000)
  return slotDT < minDT
}

// Format an ISO date (YYYY-MM-DD) as "April 14, 2026" for display in the trigger
function formatDateDisplay(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// DayPicker styles for the widget (same dark-theme palette as Step 2)
const widgetCalendarStyles = {
  root: {
    fontFamily: 'var(--font-montserrat)',
    color: 'var(--offwhite)',
    background: 'transparent',
  },
  caption_label: {
    color: 'var(--offwhite)',
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'var(--font-montserrat)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
  },
  weekday: {
    color: 'var(--warmgrey)',
    fontSize: 12,
    fontWeight: 400,
  },
  day: {
    color: 'var(--offwhite)',
    fontSize: 13,
    width: 36,
    height: 36,
  },
  day_button: {
    color: 'var(--offwhite)',
    fontSize: 13,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
  },
}

const widgetModifiersStyles = {
  selected: {
    background: 'var(--copper)',
    color: 'var(--anthracite)',
    borderRadius: 0,
  },
  disabled: {
    color: 'var(--warmgrey)',
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  today: {
    outline: '1px solid var(--anthracite-light)',
    outlineOffset: '-2px',
  },
}

// Feature flag: swap between deprecated AutocompleteService (AddressInput.tsx)
// and the New Places API implementation (AddressInputNew.tsx).
// Set NEXT_PUBLIC_USE_NEW_PLACES_API=1 in .env.local (or Vercel env) to enable.
// Once QA on Vercel preview passes, AddressInput.tsx will be deleted and
// AddressInputNew.tsx renamed — this flag will be removed.
const AddressInput =
  process.env.NEXT_PUBLIC_USE_NEW_PLACES_API === '1' ? AddressInputNew : AddressInputLegacy

export default function BookingWidget({ defaultTripType }: { defaultTripType?: TripType } = {}) {
  const router = useRouter()
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)
  const uid = useId().replace(/:/g, '')

  useEffect(() => {
    if (defaultTripType && useBookingStore.getState().tripType !== defaultTripType) {
      setTripType(defaultTripType)
    }
  }, [defaultTripType, setTripType])
  const dateId = `booking-date-${uid}`
  const timeId = `booking-time-${uid}`

  const [origin, setOrigin] = useState<PlaceResult | null>(null)
  const [destination, setDestination] = useState<PlaceResult | null>(null)
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [todayStr, setTodayStr] = useState<string>('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const dateFieldRef = useRef<HTMLDivElement>(null)

  // Prevent hydration mismatch — set today's date on client only
  useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0])
  }, [])

  // Close date popover on outside click + ESC key
  useEffect(() => {
    if (!datePickerOpen) return
    function handlePointerDown(e: MouseEvent) {
      if (dateFieldRef.current && !dateFieldRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDatePickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [datePickerOpen])

  function handleDateSelect(d: Date | undefined) {
    if (!d) {
      setDate('')
      return
    }
    const iso =
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, '0')}-` +
      `${String(d.getDate()).padStart(2, '0')}`
    setDate(iso)
    setErrors((prev) => { const n = { ...prev }; delete n.date; return n })
    setDatePickerOpen(false)
  }

  const handleBookNow = () => {
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

    const store = useBookingStore.getState()
    store.setTripType(tripType)
    store.setOrigin(origin)
    if (tripType !== 'hourly') {
      store.setDestination(destination)
    }
    store.setPickupDate(date)
    store.setPickupTime(time)

    // Deep-link to Step 2 (vehicle selection)
    useBookingStore.setState({
      currentStep: 2,
      completedSteps: new Set([1]),
    })

    sessionStorage.setItem('booking_deeplink', '1')
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
            setErrors((prev) => { const next = { ...prev }; delete next.origin; return next })
          }}
          onClear={() => setOrigin(null)}
          hasError={!!errors.origin}
          ariaLabel="Pick-up address"
          required
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
              setErrors((prev) => { const next = { ...prev }; delete next.destination; return next })
            }}
            onClear={() => setDestination(null)}
            hasError={!!errors.destination}
            ariaLabel="Drop-off address"
            required
          />
        )}

        {/* Date / Time row */}
        <div className="flex flex-col md:flex-row" style={{ gap: '24px' }}>
          {/* Date field — custom trigger + DayPicker popover */}
          <div ref={dateFieldRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <label
              htmlFor={dateId}
              className="label"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              DATE <span aria-hidden="true" style={{ color: 'var(--copper-light)' }}>*</span>
            </label>
            <button
              id={dateId}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={datePickerOpen}
              aria-label="Pickup date"
              onClick={() => setDatePickerOpen((v) => !v)}
              style={{
                ...inputStyle,
                minHeight: '48px',
                textAlign: 'left',
                cursor: 'pointer',
                color: date ? 'var(--offwhite)' : 'var(--warmgrey)',
                border: errors.date ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              }}
            >
              {date ? formatDateDisplay(date) : 'Select date'}
            </button>
            {datePickerOpen && (
              <div
                role="dialog"
                aria-label="Select pickup date"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  zIndex: 50,
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  padding: '16px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                }}
              >
                <DayPicker
                  mode="single"
                  selected={date ? new Date(date + 'T00:00:00') : undefined}
                  onSelect={handleDateSelect}
                  disabled={todayStr ? { before: new Date(todayStr + 'T00:00:00') } : undefined}
                  styles={widgetCalendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                  modifiersStyles={widgetModifiersStyles}
                />
              </div>
            )}
          </div>

          {/* Time field — AM/PM select, same as EntryBar */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <label
              htmlFor={timeId}
              className="label"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              TIME <span aria-hidden="true" style={{ color: 'var(--copper-light)' }}>*</span>
            </label>
            <select
              id={timeId}
              aria-label="Pickup time"
              value={time}
              onChange={(e) => {
                const val = e.target.value
                setTime(val || '')
                if (val) setErrors((prev) => { const n = { ...prev }; delete n.time; return n })
              }}
              style={{
                ...inputStyle,
                minHeight: '48px',
                cursor: 'pointer',
                color: time ? 'var(--offwhite)' : 'var(--warmgrey)',
                border: errors.time ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              }}
            >
              <option value="">Choose a slot</option>
              {TIME_SLOTS_AMPM.map((slot) => {
                const disabled = isSlotDisabled(slot.value24h, date)
                return (
                  <option key={slot.value24h} value={slot.value24h} disabled={disabled}>
                    {slot.display}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {/* Validation error */}
        <p
          role="alert"
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: '#C0392B',
            marginTop: hasError ? '-8px' : 0,
            minHeight: hasError ? 'auto' : 0,
            overflow: 'hidden',
          }}
        >
          {hasError ? 'Please fill in all required fields before continuing.' : ''}
        </p>

        {/* CTA */}
        <button
          type="button"
          className="btn-primary"
          onClick={handleBookNow}
          style={{
            width: '100%',
            marginTop: '24px',
            background: 'var(--copper)',
            color: 'var(--anthracite)',
            borderColor: 'var(--copper)',
            borderRadius: '10px',
          }}
        >
          VIEW VEHICLES
        </button>
      </div>
    </div>
  )
}
