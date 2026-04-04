'use client'

import { useEffect, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { useBookingStore } from '@/lib/booking-store'

// 288 time slots at 5-minute increments covering 00:00–23:55
const TIME_SLOTS: string[] = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i / 12).toString().padStart(2, '0')
  const m = ((i % 12) * 5).toString().padStart(2, '0')
  return `${h}:${m}`
})

function isReturnBeforeOrEqualPickup(
  returnDate: string | null,
  returnTime: string | null,
  pickupDate: string | null,
  pickupTime: string | null
): boolean {
  if (!returnDate || !returnTime || !pickupDate || !pickupTime) return false
  // ISO string comparison works for 'YYYY-MM-DDTHH:MM'
  return `${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}`
}

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
  button_previous: {
    color: 'var(--warmgrey)',
    border: '1px solid var(--anthracite-light)',
    background: 'transparent',
    cursor: 'pointer',
  },
  button_next: {
    color: 'var(--warmgrey)',
    border: '1px solid var(--anthracite-light)',
    background: 'transparent',
    cursor: 'pointer',
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

interface TimeSlotItemProps {
  slot: string
  isSelected: boolean
  onSelect: (slot: string) => void
}

function TimeSlotItem({ slot, isSelected, onSelect }: TimeSlotItemProps) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [isSelected])

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(slot)}
      style={{
        minHeight: 44,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        fontFamily: 'var(--font-montserrat)',
        fontSize: 13,
        fontWeight: 400,
        color: isSelected ? 'var(--offwhite)' : 'var(--warmgrey)',
        background: isSelected ? 'var(--anthracite-mid)' : 'transparent',
        borderLeft: isSelected ? '4px solid var(--copper)' : '4px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease',
        listStyle: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          const el = e.currentTarget
          el.style.background = 'var(--anthracite-mid)'
          el.style.color = 'var(--offwhite)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          const el = e.currentTarget
          el.style.background = 'transparent'
          el.style.color = 'var(--warmgrey)'
        }
      }}
    >
      {slot}
    </li>
  )
}

export default function Step2DateTime() {
  const tripType = useBookingStore((s) => s.tripType)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const setPickupDate = useBookingStore((s) => s.setPickupDate)
  const setPickupTime = useBookingStore((s) => s.setPickupTime)
  const setReturnDate = useBookingStore((s) => s.setReturnDate)
  const setReturnTime = useBookingStore((s) => s.setReturnTime)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const pickupDateObj = pickupDate ? new Date(pickupDate + 'T00:00:00') : undefined

  // Minimum return date: the day after pickup (or today if no pickup selected)
  const returnDateMin = pickupDate ? new Date(pickupDate + 'T00:00:00') : today
  const returnDateObj = returnDate ? new Date(returnDate + 'T00:00:00') : undefined

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
      // Clear returnTime if the combined return datetime now violates ordering
      if (returnDate && returnTime && `${returnDate}T${returnTime}` <= `${iso}T${pickupTime ?? '00:00'}`) {
        setReturnTime(null)
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
            disabled={{ before: today }}
            styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
            modifiersStyles={modifiersStyles}
          />

          {/* Return date — Daily Hire and Round Trip */}
          {(tripType === 'daily' || tripType === 'round_trip') && (
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

        {/* Right: Time slot list (~40% on desktop) */}
        <div className="md:w-[40%] w-full">
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            PICKUP TIME
          </span>

          {pickupDate ? (
            <ul
              role="listbox"
              aria-label="Pickup time"
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                margin: 0,
                padding: 0,
                border: '1px solid var(--anthracite-light)',
              }}
            >
              {TIME_SLOTS.map((slot) => (
                <TimeSlotItem
                  key={slot}
                  slot={slot}
                  isSelected={pickupTime === slot}
                  onSelect={setPickupTime}
                />
              ))}
            </ul>
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

      {/* Return time — Round Trip only, shown after returnDate is selected */}
      {tripType === 'round_trip' && returnDate && (
        <div style={{ marginTop: 32 }}>
          <span className="label" style={{ display: 'block', marginBottom: 12 }}>
            RETURN TIME
          </span>
          <ul
            role="listbox"
            aria-label="Return time"
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              margin: 0,
              padding: 0,
              border: '1px solid var(--anthracite-light)',
            }}
          >
            {TIME_SLOTS.map((slot) => (
              <TimeSlotItem
                key={slot}
                slot={slot}
                isSelected={returnTime === slot}
                onSelect={setReturnTime}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Inline ordering error — shown when return datetime is not strictly after pickup */}
      {tripType === 'round_trip' &&
        isReturnBeforeOrEqualPickup(returnDate, returnTime, pickupDate, pickupTime) && (
          <p
            role="alert"
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--copper)',
              marginTop: 12,
              letterSpacing: '0.03em',
            }}
          >
            Return must be after pickup
          </p>
        )}
    </div>
  )
}
