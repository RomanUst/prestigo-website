'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInputLegacy from '@/components/booking/AddressInput'
import AddressInputNew from '@/components/booking/AddressInputNew'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
import type { PlaceResult } from '@/types/booking'

// Hour / minute lists for the custom time picker (5-minute increments)
const WIDGET_HOURS: string[] = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0')
)
const WIDGET_MINUTES: string[] = Array.from({ length: 12 }, (_, i) =>
  (i * 5).toString().padStart(2, '0')
)

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

export default function BookingWidget() {
  const router = useRouter()
  const tripType = useBookingStore((s) => s.tripType)
  const uid = useId().replace(/:/g, '')
  const dateId = `booking-date-${uid}`
  const timeId = `booking-time-${uid}`

  const [origin, setOrigin] = useState<PlaceResult | null>(null)
  const [destination, setDestination] = useState<PlaceResult | null>(null)
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [todayStr, setTodayStr] = useState<string>('')
  const [openPicker, setOpenPicker] = useState<'date' | 'time' | null>(null)
  const dateFieldRef = useRef<HTMLDivElement>(null)
  const timeFieldRef = useRef<HTMLDivElement>(null)

  // Prevent hydration mismatch — set today's date on client only
  useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0])
  }, [])

  // Close popover on outside click + ESC key
  useEffect(() => {
    if (!openPicker) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      const ref = openPicker === 'date' ? dateFieldRef : timeFieldRef
      if (ref.current && !ref.current.contains(target)) {
        setOpenPicker(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPicker(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openPicker])

  const [selectedHour, selectedMinute] = time ? time.split(':') : [null, null]

  function snapMinute(raw: string | null): string {
    if (!raw) return '00'
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return '00'
    return (Math.floor(n / 5) * 5).toString().padStart(2, '0')
  }

  function handleHourSelect(hour: string) {
    // Functional update to avoid stale closures when user taps hour + minute
    // in quick succession before React re-renders.
    setTime((prev) => {
      const prevMinute = prev ? prev.split(':')[1] : null
      return `${hour}:${snapMinute(prevMinute)}`
    })
    setErrors((prev) => {
      const n = { ...prev }
      delete n.time
      return n
    })
  }

  function handleMinuteSelect(minute: string) {
    setTime((prev) => {
      const prevHour = prev ? prev.split(':')[0] : '00'
      return `${prevHour}:${minute}`
    })
    setErrors((prev) => {
      const n = { ...prev }
      delete n.time
      return n
    })
    setOpenPicker(null)
  }

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
    setErrors((prev) => {
      const n = { ...prev }
      delete n.date
      return n
    })
    setOpenPicker(null)
  }

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

    // Mark this as a widget deeplink so BookingWizard doesn't reset to step 1
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
            setErrors((prev) => {
              const next = { ...prev }
              delete next.origin
              return next
            })
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
              setErrors((prev) => {
                const next = { ...prev }
                delete next.destination
                return next
              })
            }}
            onClear={() => setDestination(null)}
            hasError={!!errors.destination}
            ariaLabel="Drop-off address"
            required
          />
        )}

        {/* Date / Time row — custom triggers + popovers */}
        <div
          className="flex flex-col md:flex-row"
          style={{ gap: '24px' }}
        >
          {/* Date field */}
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
              aria-expanded={openPicker === 'date'}
              aria-label="Pickup date"
              aria-invalid={!!errors.date}
              onClick={() => setOpenPicker(openPicker === 'date' ? null : 'date')}
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
            {openPicker === 'date' && (
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

          {/* Time field */}
          <div ref={timeFieldRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <label
              htmlFor={timeId}
              className="label"
              style={{ display: 'block', marginBottom: '8px' }}
            >
              TIME <span aria-hidden="true" style={{ color: 'var(--copper-light)' }}>*</span>
            </label>
            <button
              id={timeId}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openPicker === 'time'}
              aria-label="Pickup time"
              aria-invalid={!!errors.time}
              onClick={() => setOpenPicker(openPicker === 'time' ? null : 'time')}
              style={{
                ...inputStyle,
                minHeight: '48px',
                textAlign: 'left',
                cursor: 'pointer',
                color: time ? 'var(--offwhite)' : 'var(--warmgrey)',
                border: errors.time ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              }}
            >
              {time || 'Select time'}
            </button>
            {openPicker === 'time' && (
              <div
                role="dialog"
                aria-label="Select pickup time"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  padding: '16px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <span
                    className="label"
                    style={{ display: 'block', marginBottom: 8, fontSize: 11, color: 'var(--warmgrey)' }}
                  >
                    HOUR
                  </span>
                  <ul
                    role="listbox"
                    aria-label="Pickup hour"
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      margin: 0,
                      padding: 0,
                      border: '1px solid var(--anthracite-light)',
                      listStyle: 'none',
                    }}
                  >
                    {WIDGET_HOURS.map((h) => {
                      const isSel = selectedHour === h
                      return (
                        <li
                          key={h}
                          role="option"
                          aria-selected={isSel}
                          onClick={() => handleHourSelect(h)}
                          style={{
                            minHeight: 36,
                            padding: '0 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: 13,
                            color: isSel ? 'var(--offwhite)' : 'var(--warmgrey)',
                            background: isSel ? 'var(--anthracite-mid)' : 'transparent',
                            borderLeft: isSel ? '3px solid var(--copper)' : '3px solid transparent',
                            cursor: 'pointer',
                          }}
                        >
                          {h}
                        </li>
                      )
                    })}
                  </ul>
                </div>
                <div style={{ flex: 1 }}>
                  <span
                    className="label"
                    style={{ display: 'block', marginBottom: 8, fontSize: 11, color: 'var(--warmgrey)' }}
                  >
                    MIN
                  </span>
                  <ul
                    role="listbox"
                    aria-label="Pickup minute"
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      margin: 0,
                      padding: 0,
                      border: '1px solid var(--anthracite-light)',
                      listStyle: 'none',
                    }}
                  >
                    {WIDGET_MINUTES.map((m) => {
                      const isSel = selectedMinute === m
                      return (
                        <li
                          key={m}
                          role="option"
                          aria-selected={isSel}
                          onClick={() => handleMinuteSelect(m)}
                          style={{
                            minHeight: 36,
                            padding: '0 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: 13,
                            color: isSel ? 'var(--offwhite)' : 'var(--warmgrey)',
                            background: isSel ? 'var(--anthracite-mid)' : 'transparent',
                            borderLeft: isSel ? '3px solid var(--copper)' : '3px solid transparent',
                            cursor: 'pointer',
                          }}
                        >
                          {m}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation error — live region so screen readers announce */}
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
          style={{ width: '100%', marginTop: '24px' }}
        >
          BOOK NOW
        </button>
      </div>
    </div>
  )
}
