'use client'

import { useState, useEffect, useRef } from 'react'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInput from '@/components/booking/AddressInput'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
import { isAirportPlace } from '@/types/booking'

// ─── 96 AM/PM time slots at 15-minute granularity (D-07) ─────────────────────
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

// Returns true if a given 24h slot (HH:MM) falls within the 12-hour lead window
function isSlotDisabled(slot24h: string, pickupDateStr: string | null): boolean {
  if (!pickupDateStr) return false
  const slotDT = new Date(`${pickupDateStr}T${slot24h}:00`)
  const minDT = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000)
  return slotDT < minDT
}

export default function EntryBar() {
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)

  const setOrigin = useBookingStore((s) => s.setOrigin)
  const setDestination = useBookingStore((s) => s.setDestination)
  const setPickupDate = useBookingStore((s) => s.setPickupDate)
  const setPickupTime = useBookingStore((s) => s.setPickupTime)
  const setReturnDate = useBookingStore((s) => s.setReturnDate)
  const setReturnTime = useBookingStore((s) => s.setReturnTime)
  const setTripType = useBookingStore((s) => s.setTripType)
  const setPassengerDetails = useBookingStore((s) => s.setPassengerDetails)
  const nextStep = useBookingStore((s) => s.nextStep)

  const [errors, setErrors] = useState<Record<string, string>>({})
  // Initialise from the store so returning to Step 1 after choosing a round trip
  // keeps the checkbox (and return fields) open instead of silently reverting.
  const [showReturn, setShowReturn] = useState(
    () => useBookingStore.getState().tripType === 'round_trip'
  )
  const [flightNumber, setFlightNumber] = useState('')

  // ─── Analytics: fire form_start once on mount (TRACK-01) ──────────────────
  const funnelFiredRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = 'form_start'
    if (funnelFiredRef.current.has(key)) return
    funnelFiredRef.current.add(key)
    const w = window as typeof window & {
      dataLayer?: unknown[]
      gtag?: (...args: unknown[]) => void
    }
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'form_start', { form_id: 'booking_wizard', form_name: 'Booking Wizard' })
    } else {
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push(['event', 'form_start', { form_id: 'booking_wizard', form_name: 'Booking Wizard' }])
      w.dataLayer.push({ event: 'form_start', form_id: 'booking_wizard', form_name: 'Booking Wizard' })
    }
  }, [])

  // ─── Conditional flight number display (BOOK-03 / D-06) ──────────────────
  const showFlightNumber = isAirportPlace(origin)

  // ─── Validation ───────────────────────────────────────────────────────────
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!origin) errs.origin = 'Pickup location is required to continue.'
    if (tripType !== 'hourly' && !destination) errs.destination = 'Destination is required to continue.'
    if (!pickupDate) errs.date = 'Date is required to continue.'
    if (!pickupTime) errs.time = 'Time is required to continue.'
    // Round trip: a return leg must be fully specified and after the outbound.
    if (showReturn && tripType !== 'hourly') {
      if (!returnDate) errs.returnDate = 'Return date is required for a round trip.'
      if (!returnTime) errs.returnTime = 'Return time is required for a round trip.'
      if (
        returnDate &&
        returnTime &&
        pickupDate &&
        pickupTime &&
        `${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}`
      ) {
        errs.returnTime = 'Return must be after pickup.'
      }
    }
    return errs
  }

  // ─── Submit handler ───────────────────────────────────────────────────────
  const handleSubmit = () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors({})

    // Persist flight number to passengerDetails (Option B from RESEARCH) (D-06)
    if (showFlightNumber && flightNumber.trim()) {
      const s = useBookingStore.getState()
      setPassengerDetails({
        ...(s.passengerDetails ?? { firstName: '', lastName: '', email: '', phone: '' }),
        flightNumber: flightNumber.trim(),
      })
    }

    // Analytics: checkout_progress (TRACK-01)
    const s = useBookingStore.getState()
    const w = typeof window !== 'undefined'
      ? window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
      : null
    if (w) {
      const params = {
        checkout_step: s.currentStep,
        step_name: 'entry_bar',
        currency: 'EUR',
        value: 0,
      }
      if (typeof w.gtag === 'function') {
        w.gtag('event', 'checkout_progress', params)
      } else {
        w.dataLayer = w.dataLayer || []
        w.dataLayer.push(['event', 'checkout_progress', params])
        w.dataLayer.push({ event: 'checkout_progress', ...params })
      }
    }

    nextStep()
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleOriginSelect = (place: Parameters<typeof setOrigin>[0]) => {
    if (!place) return
    setOrigin(place)
    setErrors((prev) => { const n = { ...prev }; delete n.origin; return n })
  }
  const handleOriginClear = () => setOrigin(null)

  const handleDestinationSelect = (place: Parameters<typeof setDestination>[0]) => {
    if (!place) return
    setDestination(place)
    setErrors((prev) => { const n = { ...prev }; delete n.destination; return n })
  }
  const handleDestinationClear = () => setDestination(null)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="theme-light">
      {/* Trip type tabs — Transfer / Hourly only (D-02), hideMultiDay=true */}
      <TripTypeTabs hideMultiDay />

      {/* Validation summary */}
      {Object.keys(errors).length > 0 && (
        <p
          role="alert"
          aria-live="polite"
          style={{
            marginTop: 12,
            fontSize: 12,
            color: '#C0392B',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          Please fill in all required fields before continuing.
        </p>
      )}

      {/* Field grid: address fields full-width, date/time in 2 columns below */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* FROM — Pickup Location (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              color: 'var(--warmgrey)',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            PICKUP LOCATION
          </label>
          <AddressInput
            label=""
            placeholder="Enter pickup address"
            value={origin}
            onSelect={handleOriginSelect}
            onClear={handleOriginClear}
            hasError={!!errors.origin}
            errorMessage={errors.origin}
            ariaLabel="Pickup location"
          />
        </div>

        {/* TO — Destination or Duration (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              color: 'var(--warmgrey)',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            DESTINATION
          </label>
          {tripType === 'hourly' ? (
            <DurationSelector />
          ) : (
            <AddressInput
              label=""
              placeholder="Enter destination"
              value={destination}
              onSelect={handleDestinationSelect}
              onClear={handleDestinationClear}
              hasError={!!errors.destination}
              errorMessage={errors.destination}
              ariaLabel="Destination"
            />
          )}
        </div>

        {/* DATE */}
        <div>
          <label
            htmlFor="entry-bar-date"
            style={{
              display: 'block',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              color: 'var(--warmgrey)',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            DATE
          </label>
          <input
            id="entry-bar-date"
            type="date"
            value={pickupDate ?? ''}
            onChange={(e) => {
              setPickupDate(e.target.value || null)
              setErrors((prev) => { const n = { ...prev }; delete n.date; return n })
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              background: 'var(--anthracite-mid)',
              border: errors.date ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              color: 'var(--offwhite)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* TIME — 15-min AM/PM <select> (D-07 / D-08) */}
        <div>
          <label
            htmlFor="entry-bar-time"
            style={{
              display: 'block',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              color: 'var(--warmgrey)',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            TIME
          </label>
          <select
            id="entry-bar-time"
            aria-label="Time"
            value={pickupTime ?? ''}
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                setPickupTime(val)  // store gets 24h value (D-08)
                setErrors((prev) => { const n = { ...prev }; delete n.time; return n })
              } else {
                setPickupTime(null)
              }
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              background: 'var(--anthracite-mid)',
              border: errors.time ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
              color: pickupTime ? 'var(--offwhite)' : 'var(--warmgrey)',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Choose a slot</option>
            {TIME_SLOTS_AMPM.map((slot) => {
              const disabled = isSlotDisabled(slot.value24h, pickupDate)
              return (
                <option
                  key={slot.value24h}
                  value={slot.value24h}
                  disabled={disabled}
                >
                  {slot.display}
                </option>
              )
            })}
          </select>
        </div>

        {/* FLIGHT NUMBER — shown only for airport origins (BOOK-03 / D-06) */}
        {showFlightNumber && (
          <div>
            <label
              htmlFor="entry-bar-flight"
              style={{
                display: 'block',
                fontFamily: 'var(--font-montserrat)',
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: '0.28em',
                color: 'var(--warmgrey)',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              FLIGHT NUMBER (optional)
            </label>
            <input
              id="entry-bar-flight"
              type="text"
              placeholder="e.g. BA 256"
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
              aria-label="Flight number"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: 14,
                background: 'var(--anthracite-mid)',
                border: '1px solid var(--anthracite-light)',
                color: 'var(--offwhite)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      {/* "Add return journey" checkbox — transfer only, hidden in hourly (D-03) */}
      {tripType !== 'hourly' && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="entry-bar-return"
            type="checkbox"
            checked={showReturn}
            onChange={(e) => {
              const on = e.target.checked
              setShowReturn(on)
              // Flip the actual trip type so the return leg is priced, charged,
              // and dispatched. Without this the checkbox only revealed the
              // date/time inputs while the booking stayed a one-way transfer.
              setTripType(on ? 'round_trip' : 'transfer')
              if (!on) {
                // setTripType('transfer') clears returnTime; clear the date too.
                setReturnDate(null)
                setReturnTime(null)
              }
            }}
            style={{ accentColor: 'var(--copper)', cursor: 'pointer' }}
          />
          <label
            htmlFor="entry-bar-return"
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              color: 'var(--offwhite)',
              cursor: 'pointer',
            }}
          >
            Add return journey
          </label>
        </div>
      )}

      {/* Return date/time expander — 300ms ease transition (D-03).
          Use CSS max-height trick but only mount DOM elements when shown to
          avoid duplicate label text confusing accessibility queries. */}
      <div
        style={{
          maxHeight: showReturn && tripType !== 'hourly' ? '400px' : 0,
          overflow: 'hidden',
          transition: 'max-height 300ms ease',
        }}
        aria-hidden={!(showReturn && tripType !== 'hourly')}
      >
        {showReturn && tripType !== 'hourly' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginTop: 16,
            }}
          >
            {/* RETURN DATE */}
            <div>
              <label
                htmlFor="entry-bar-return-date"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: 11,
                  fontWeight: 400,
                  letterSpacing: '0.28em',
                  color: 'var(--warmgrey)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                RETURN DATE
              </label>
              <input
                id="entry-bar-return-date"
                type="date"
                value={returnDate ?? ''}
                min={pickupDate ?? undefined}
                onChange={(e) => {
                  setReturnDate(e.target.value || null)
                  setErrors((prev) => { const n = { ...prev }; delete n.returnDate; return n })
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: 14,
                  background: 'var(--anthracite-mid)',
                  border: errors.returnDate ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
                  color: 'var(--offwhite)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* RETURN TIME */}
            <div>
              <label
                htmlFor="entry-bar-return-time"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: 11,
                  fontWeight: 400,
                  letterSpacing: '0.28em',
                  color: 'var(--warmgrey)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                RETURN TIME
              </label>
              <select
                id="entry-bar-return-time"
                aria-label="Return time"
                value={returnTime ?? ''}
                onChange={(e) => {
                  setReturnTime(e.target.value || null)
                  setErrors((prev) => { const n = { ...prev }; delete n.returnTime; return n })
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: 14,
                  background: 'var(--anthracite-mid)',
                  border: errors.returnTime ? '1px solid #C0392B' : '1px solid var(--anthracite-light)',
                  color: returnTime ? 'var(--offwhite)' : 'var(--warmgrey)',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select return time</option>
                {TIME_SLOTS_AMPM.map((slot) => (
                  <option key={slot.value24h} value={slot.value24h}>
                    {slot.display}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {(errors.returnDate || errors.returnTime) && (
          <p
            role="alert"
            style={{
              marginTop: 8,
              fontFamily: 'var(--font-montserrat)',
              fontSize: 13,
              color: '#C0392B',
            }}
          >
            {errors.returnTime || errors.returnDate}
          </p>
        )}
      </div>

      {/* CTA — "Посмотреть варианты" (D-04) */}
      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          style={{
            width: '100%',
            minHeight: 44,
            fontFamily: 'var(--font-montserrat)',
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
          }}
        >
          View vehicles
        </button>
      </div>
    </div>
  )
}
