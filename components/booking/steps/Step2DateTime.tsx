'use client'

import { useEffect, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { useBookingStore } from '@/lib/booking-store'

// Hours 00–23 and minutes in 5-minute increments
const HOURS: string[] = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0')
)
const MINUTES: string[] = Array.from({ length: 12 }, (_, i) =>
  (i * 5).toString().padStart(2, '0')
)

const MIN_LEAD_HOURS = 12

// Common DayPicker inline styles for the Prestigo dark theme
const calendarStyles = {
  root: {
    fontFamily: 'var(--font-montserrat)',
    color: 'var(--offwhite)',
    background: 'transparent',
  },
  months: {
    color: 'var(--offwhite)',
  },
  caption_label: {
    color: 'var(--offwhite)',
    fontSize: 13,
    fontWeight: 400,
    fontFamily: 'var(--font-montserrat)',
  },
  weekday: {
    color: 'var(--warmgrey)',
    fontSize: 13,
    fontWeight: 400,
  },
  day: {
    color: 'var(--offwhite)',
    fontSize: 13,
    width: 44,
    height: 44,
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
  nav: {
    color: 'var(--copper)',
  },
  button_previous: {
    color: 'var(--copper)',
    border: '1px solid var(--copper)',
    background: 'transparent',
    cursor: 'pointer',
    width: 32,
    height: 32,
  },
  button_next: {
    color: 'var(--copper)',
    border: '1px solid var(--copper)',
    background: 'transparent',
    cursor: 'pointer',
    width: 32,
    height: 32,
  },
  chevron: {
    fill: 'var(--copper)',
    width: 16,
    height: 16,
  },
}

const modifiersStyles = {
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

interface TimeCellProps {
  value: string
  isSelected: boolean
  onSelect: (value: string) => void
  scrollIntoView?: boolean
  disabled?: boolean
}

function TimeCell({ value, isSelected, onSelect, scrollIntoView, disabled }: TimeCellProps) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (isSelected && scrollIntoView && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [isSelected, scrollIntoView])

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      onClick={() => { if (!disabled) onSelect(value) }}
      style={{
        minHeight: 44,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-montserrat)',
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: '0.05em',
        color: disabled ? 'var(--warmgrey)' : isSelected ? 'var(--offwhite)' : 'var(--warmgrey)',
        opacity: disabled ? 0.35 : 1,
        background: isSelected && !disabled ? 'var(--anthracite-mid)' : 'transparent',
        borderLeft: isSelected && !disabled ? '4px solid var(--copper)' : '4px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease',
        listStyle: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !disabled) {
          const el = e.currentTarget
          el.style.background = 'var(--anthracite-mid)'
          el.style.color = 'var(--offwhite)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !disabled) {
          const el = e.currentTarget
          el.style.background = 'transparent'
          el.style.color = 'var(--warmgrey)'
        }
      }}
    >
      {value}
    </li>
  )
}

export default function Step2DateTime() {
  const tripType = useBookingStore((s) => s.tripType)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const setPickupDate = useBookingStore((s) => s.setPickupDate)
  const setPickupTime = useBookingStore((s) => s.setPickupTime)
  const setReturnDate = useBookingStore((s) => s.setReturnDate)

  // Minimum booking: current time + MIN_LEAD_HOURS
  const now = new Date()
  const minBookingDT = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000)
  const minBookingDate = new Date(minBookingDT.getFullYear(), minBookingDT.getMonth(), minBookingDT.getDate())
  const minBookingDateStr =
    `${minBookingDT.getFullYear()}-` +
    `${String(minBookingDT.getMonth() + 1).padStart(2, '0')}-` +
    `${String(minBookingDT.getDate()).padStart(2, '0')}`

  // Effective earliest hour/minute on the minimum date
  // Ceiling to next 5-min slot; handle overflow (e.g. :58 → :60 → next hour)
  const minMinuteCeiled = Math.ceil(minBookingDT.getMinutes() / 5) * 5
  const effectiveMinHour = minMinuteCeiled >= 60 ? minBookingDT.getHours() + 1 : minBookingDT.getHours()
  const effectiveMinMinute = minMinuteCeiled >= 60 ? 0 : minMinuteCeiled

  const pickupDateObj = pickupDate ? new Date(pickupDate + 'T00:00:00') : undefined

  // Minimum return date: the pickup date itself (or min booking date if no pickup)
  const returnDateMin = pickupDate ? new Date(pickupDate + 'T00:00:00') : minBookingDate
  const returnDateObj = returnDate ? new Date(returnDate + 'T00:00:00') : undefined

  // Derive selected hour and minute from pickupTime (stored as "HH:MM")
  const [selectedHour, selectedMinute] = pickupTime
    ? pickupTime.split(':')
    : [null, null]

  // Whether the selected pickup date is the earliest allowed date (needs per-hour/minute blocking)
  const isMinDay = pickupDate === minBookingDateStr

  function isHourDisabled(h: string): boolean {
    if (!isMinDay) return false
    return parseInt(h, 10) < effectiveMinHour
  }

  function isMinuteDisabled(m: string): boolean {
    if (!isMinDay || !selectedHour) return false
    const hr = parseInt(selectedHour, 10)
    if (hr > effectiveMinHour) return false
    if (hr < effectiveMinHour) return true
    return parseInt(m, 10) < effectiveMinMinute
  }

  // Snap a raw minute value to the nearest 5-minute increment (floor)
  function snapMinute(raw: string | null): string {
    if (!raw) return '00'
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return '00'
    const snapped = Math.floor(n / 5) * 5
    return snapped.toString().padStart(2, '0')
  }

  function handleHourSelect(hour: string) {
    // Read fresh state from the store to avoid stale closures when the user
    // clicks hour and minute in quick succession before React re-renders.
    const current = useBookingStore.getState().pickupTime
    const currentMinute = current ? current.split(':')[1] : null
    const minute = snapMinute(currentMinute)
    setPickupTime(`${hour}:${minute}`)
  }

  function handleMinuteSelect(minute: string) {
    const current = useBookingStore.getState().pickupTime
    const hour = current ? current.split(':')[0] : '00'
    setPickupTime(`${hour}:${minute}`)
  }

  function handlePickupDateSelect(date: Date | undefined) {
    if (date) {
      const iso =
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}-` +
        `${String(date.getDate()).padStart(2, '0')}`
      setPickupDate(iso)
      // Clear returnDate if it is now before the new pickupDate
      if (returnDate && returnDate <= iso) {
        setReturnDate(null)
      }
    } else {
      setPickupDate(null)
    }
  }

  function handleReturnDateSelect(date: Date | undefined) {
    if (date) {
      const iso =
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}-` +
        `${String(date.getDate()).padStart(2, '0')}`
      setReturnDate(iso)
    } else {
      setReturnDate(null)
    }
  }

  return (
    <div>
      {/* Layout: desktop flex-row, mobile flex-col */}
      <div
        className="flex flex-col md:flex-row"
        style={{ gap: 32 }}
      >
        {/* Left: Calendar section (~60% on desktop) */}
        <div className="md:w-[60%] w-full">
          {/* Pickup date label */}
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            PICKUP DATE
          </span>

          {/* Pickup date picker */}
          <DayPicker
            mode="single"
            selected={pickupDateObj}
            onSelect={handlePickupDateSelect}
            disabled={{ before: minBookingDate }}
            styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
            modifiersStyles={modifiersStyles}
          />

          {/* Lead-time notice — same-day and short-notice bookings are blocked
              by MIN_LEAD_HOURS. Without an explanation, users who arrive from
              an "airport transfer today" ad just see a greyed-out calendar
              and bounce. This tells them why and gives them a working
              alternative (WhatsApp). */}
          <p
            style={{
              marginTop: 12,
              fontSize: 11,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              lineHeight: 1.6,
            }}
          >
            Online bookings require at least {MIN_LEAD_HOURS} hours advance notice.
            For urgent or same-day transfers, message us on{' '}
            <a
              href="https://wa.me/420725986855?text=Hello%20PRESTIGO%2C%20I%20need%20an%20urgent%20transfer."
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#25D366', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              WhatsApp
            </a>
            .
          </p>

          {/* Return date — Daily Hire only */}
          {tripType === 'daily' && (
            <div style={{ marginTop: 32 }}>
              <span className="label" style={{ display: 'block', marginBottom: 12 }}>
                RETURN DATE
              </span>
              <DayPicker
                mode="single"
                selected={returnDateObj}
                onSelect={handleReturnDateSelect}
                disabled={{ before: returnDateMin }}
                styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                modifiersStyles={modifiersStyles}
              />
            </div>
          )}
        </div>

        {/* Right: Time section (~40% on desktop) — hour + minute columns */}
        <div className="md:w-[40%] w-full">
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            PICKUP TIME
          </span>

          {pickupDate ? (
            <div style={{ display: 'flex', gap: 12 }}>
              {/* Hour column */}
              <div style={{ flex: 1 }}>
                <span
                  className="label"
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    fontSize: 11,
                    color: 'var(--warmgrey)',
                  }}
                >
                  HOUR
                </span>
                <ul
                  role="listbox"
                  aria-label="Pickup hour"
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    margin: 0,
                    padding: 0,
                    border: '1px solid var(--anthracite-light)',
                  }}
                >
                  {HOURS.map((h) => (
                    <TimeCell
                      key={h}
                      value={h}
                      isSelected={selectedHour === h}
                      onSelect={handleHourSelect}
                      scrollIntoView
                      disabled={isHourDisabled(h)}
                    />
                  ))}
                </ul>
              </div>

              {/* Minute column */}
              <div style={{ flex: 1 }}>
                <span
                  className="label"
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    fontSize: 11,
                    color: 'var(--warmgrey)',
                  }}
                >
                  MIN
                </span>
                <ul
                  role="listbox"
                  aria-label="Pickup minute"
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    margin: 0,
                    padding: 0,
                    border: '1px solid var(--anthracite-light)',
                  }}
                >
                  {MINUTES.map((m) => (
                    <TimeCell
                      key={m}
                      value={m}
                      isSelected={selectedMinute === m}
                      onSelect={handleMinuteSelect}
                      scrollIntoView
                      disabled={isMinuteDisabled(m)}
                    />
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--warmgrey)',
                lineHeight: 1.8,
                letterSpacing: '0.03em',
              }}
            >
              Select a pickup date to continue
            </p>
          )}
        </div>
      </div>

    </div>
  )
}
