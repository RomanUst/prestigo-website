'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'
import type { FlightStatus } from '@/types/booking'

// Mirrors IATA_RE from lib/flight-status.ts (server-only module — cannot be imported client-side)
const IATA_RE = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\d{1,4}$/i

// Record<FlightStatus, ...> ensures a compile error if FlightStatus gains/loses members
// without a corresponding update here. 'delayed' is intentionally absent — it is not
// a valid FlightStatus produced by the API (see STATUS_MAP in lib/flight-status.ts).
const STATUS_DISPLAY: Record<FlightStatus, { label: string; color: string }> = {
  scheduled: { label: 'SCHEDULED', color: 'var(--copper)' },
  active:    { label: 'ACTIVE',    color: 'var(--copper)' },
  landed:    { label: 'LANDED',    color: '#27AE60' },
  cancelled: { label: 'CANCELLED', color: '#C0392B' },
  diverted:  { label: 'DIVERTED',  color: '#C0392B' },
  unknown:   { label: 'UNKNOWN',   color: 'var(--warmgrey)' },
}

function formatArrivalTime(iso: string | null): string {
  if (!iso) return '\u2014'
  return iso.slice(11, 16) // "2026-04-15T14:35:00.000" -> "14:35"
}

const passengerSchema = (isAirport: boolean) =>
  z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().min(7, 'Enter a valid phone number'),
    flightNumber: isAirport
      ? z.string()
          .min(1, 'Flight number is required for airport rides')
          .regex(IATA_RE, 'Invalid IATA format \u2014 e.g. BA256 or OK123')
      : z.string().optional(),
    terminal: z.string().optional(),
    specialRequests: z.string().max(500, 'Maximum 500 characters').optional(),
  })

export default function Step5Passenger() {
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const passengerDetails = useBookingStore((s) => s.passengerDetails)
  const setPassengerDetails = useBookingStore((s) => s.setPassengerDetails)
  const setFlightCheckResult = useBookingStore((s) => s.setFlightCheckResult)
  const flightCheckResult = useBookingStore((s) => s.flightCheckResult)
  const pickupDate = useBookingStore((s) => s.pickupDate)

  const isAirportRide =
    origin?.placeId === PRG_CONFIG.placeId ||
    destination?.placeId === PRG_CONFIG.placeId

  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(passengerSchema(isAirportRide)),
    mode: 'onBlur',
    defaultValues: {
      firstName: passengerDetails?.firstName ?? '',
      lastName: passengerDetails?.lastName ?? '',
      email: passengerDetails?.email ?? '',
      phone: passengerDetails?.phone ?? '',
      flightNumber: passengerDetails?.flightNumber ?? '',
      terminal: passengerDetails?.terminal ?? '',
      specialRequests: passengerDetails?.specialRequests ?? '',
    },
  })

  const { firstName, lastName, email, phone, flightNumber, terminal, specialRequests } = watch()

  const [flightCheckState, setFlightCheckState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    () => useBookingStore.getState().flightCheckResult ? 'success' : 'idle'
  )
  const [flightCheckError, setFlightCheckError] = useState<string | null>(null)

  const watchedFlightNumber = watch('flightNumber')

  // Track whether this is the initial mount — skip the reset effect on first render
  // so that a pre-existing flightCheckResult (from Zustand) is not cleared on mount.
  const isMounted = useRef(false)

  // Reset status block when flight number is edited after a check
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    if (flightCheckState === 'success' || flightCheckState === 'error') {
      setFlightCheckState('idle')
      setFlightCheckResult(null)
      setFlightCheckError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFlightNumber])

  useEffect(() => {
    setPassengerDetails({
      firstName: firstName ?? '',
      lastName: lastName ?? '',
      email: email ?? '',
      phone: phone ?? '',
      flightNumber: flightNumber ?? '',
      terminal: terminal ?? '',
      specialRequests: specialRequests ?? '',
    })
  }, [firstName, lastName, email, phone, flightNumber, terminal, specialRequests, setPassengerDetails])

  async function handleCheckFlight() {
    const fn = (watchedFlightNumber ?? '').trim().toUpperCase()
    const date = pickupDate ?? new Date().toISOString().slice(0, 10)
    setFlightCheckState('loading')
    setFlightCheckError(null)
    try {
      const res = await fetch(`/api/check-flight?flight=${encodeURIComponent(fn)}&date=${encodeURIComponent(date)}`)
      const data = await res.json()
      if (!data.ok) {
        setFlightCheckState('error')
        setFlightCheckError(data.error ?? 'unavailable')
        return
      }
      setFlightCheckResult(data)
      if (data.flight_terminal) {
        setValue('terminal', data.flight_terminal, { shouldDirty: true })
      }
      setFlightCheckState('success')
    } catch {
      setFlightCheckState('error')
      setFlightCheckError('unavailable')
    }
  }

  const isCheckDisabled =
    flightCheckState === 'loading' ||
    !watchedFlightNumber ||
    watchedFlightNumber.length < 2 ||
    !IATA_RE.test(watchedFlightNumber)

  const statusEntry = flightCheckResult
    ? (STATUS_DISPLAY[flightCheckResult.flight_status.toLowerCase() as FlightStatus] ?? STATUS_DISPLAY.unknown)
    : null

  return (
    <div>
      <style>{`@keyframes prestigo-spin { to { transform: rotate(360deg) } }`}</style>

      {/* Row 1: First Name + Last Name */}
      <div className="flex flex-col md:flex-row" style={{ gap: 24 }}>
        <div style={{ flex: 1 }}>
          <p className="label" style={{ marginBottom: 8 }}>FIRST NAME</p>
          <input
            type="text"
            {...register('firstName')}
            aria-required="true"
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            style={{
              width: '100%',
              background: 'var(--anthracite-mid)',
              border: `1px solid ${errors.firstName ? '#C0392B' : 'var(--anthracite-light)'}`,
              padding: '12px 16px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--offwhite)',
              outline: 'none',
              borderRadius: 4,
            }}
          />
          {errors.firstName && (
            <p id="firstName-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
              {errors.firstName.message}
            </p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p className="label" style={{ marginBottom: 8 }}>LAST NAME</p>
          <input
            type="text"
            {...register('lastName')}
            aria-required="true"
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            style={{
              width: '100%',
              background: 'var(--anthracite-mid)',
              border: `1px solid ${errors.lastName ? '#C0392B' : 'var(--anthracite-light)'}`,
              padding: '12px 16px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--offwhite)',
              outline: 'none',
              borderRadius: 4,
            }}
          />
          {errors.lastName && (
            <p id="lastName-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Email */}
      <div style={{ marginTop: 24 }}>
        <p className="label" style={{ marginBottom: 8 }}>EMAIL</p>
        <input
          type="email"
          {...register('email')}
          aria-required="true"
          aria-describedby={errors.email ? 'email-error' : undefined}
          onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          style={{
            width: '100%',
            background: 'var(--anthracite-mid)',
            border: `1px solid ${errors.email ? '#C0392B' : 'var(--anthracite-light)'}`,
            padding: '12px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--offwhite)',
            outline: 'none',
            borderRadius: 4,
          }}
        />
        {errors.email && (
          <p id="email-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Row 3: Phone */}
      <div style={{ marginTop: 24 }}>
        <p className="label" style={{ marginBottom: 8 }}>PHONE</p>
        <input
          type="tel"
          {...register('phone')}
          aria-required="true"
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          style={{
            width: '100%',
            background: 'var(--anthracite-mid)',
            border: `1px solid ${errors.phone ? '#C0392B' : 'var(--anthracite-light)'}`,
            padding: '12px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--offwhite)',
            outline: 'none',
            borderRadius: 4,
          }}
        />
        {errors.phone && (
          <p id="phone-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
            {errors.phone.message}
          </p>
        )}
      </div>

      {/* Row 4: Flight Number + Terminal — airport rides only */}
      {isAirportRide && (
        <div className="flex flex-col md:flex-row" style={{ gap: 24, marginTop: 24 }}>
          <div style={{ flex: 1 }}>
            <p className="label" style={{ marginBottom: 8 }}>FLIGHT NUMBER</p>
            <input
              type="text"
              {...register('flightNumber')}
              aria-required={isAirportRide}
              aria-describedby={errors.flightNumber ? 'flightNumber-error' : undefined}
              onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              placeholder="e.g. BA256"
              style={{
                width: '100%',
                background: 'var(--anthracite-mid)',
                border: `1px solid ${errors.flightNumber ? '#C0392B' : 'var(--anthracite-light)'}`,
                padding: '12px 16px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--offwhite)',
                outline: 'none',
                borderRadius: 4,
              }}
            />
            {errors.flightNumber && (
              <p id="flightNumber-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 400, marginTop: 8 }}>
                {errors.flightNumber.message}
              </p>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <p className="label" style={{ marginBottom: 8 }}>TERMINAL (OPTIONAL)</p>
            <input
              type="text"
              {...register('terminal')}
              aria-describedby={errors.terminal ? 'terminal-error' : undefined}
              onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              style={{
                width: '100%',
                background: 'var(--anthracite-mid)',
                border: `1px solid ${errors.terminal ? '#C0392B' : 'var(--anthracite-light)'}`,
                padding: '12px 16px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--offwhite)',
                outline: 'none',
                borderRadius: 4,
              }}
            />
            {errors.terminal && (
              <p id="terminal-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
                {errors.terminal.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Check Flight button — airport rides only, visible when IATA valid */}
      {isAirportRide && (
        <>
          <button
            type="button"
            onClick={handleCheckFlight}
            disabled={isCheckDisabled}
            aria-label={
              flightCheckState === 'success'
                ? 'Re-check flight status'
                : flightCheckState === 'loading'
                ? 'Checking flight status'
                : 'Check flight status'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--copper)',
              color: 'var(--anthracite)',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              textTransform: 'uppercase' as const,
              padding: '0 24px',
              border: 'none',
              borderRadius: 4,
              cursor: isCheckDisabled ? 'not-allowed' : 'pointer',
              height: 44,
              marginTop: 12,
              opacity: isCheckDisabled ? 0.5 : 1,
              transition: 'opacity 200ms ease-in',
            }}
          >
            {flightCheckState === 'loading' && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid var(--anthracite)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'prestigo-spin 0.8s linear infinite',
                  marginRight: 8,
                }}
              />
            )}
            {flightCheckState === 'success'
              ? 'RE-CHECK FLIGHT'
              : flightCheckState === 'loading'
              ? 'CHECKING\u2026'
              : 'CHECK FLIGHT'}
          </button>

          {/* Status block */}
          <div
            role="status"
            aria-live="polite"
            style={{ marginTop: 8, transition: 'opacity 300ms ease-in' }}
          >
            {flightCheckState === 'success' && flightCheckResult && statusEntry && (
              <>
                {/* Line 1: checkmark + IATA + status label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--copper-light)' }}>&#10003;</span>
                  <span style={{ color: 'var(--offwhite)', fontSize: 14, fontWeight: 400 }}>
                    {flightCheckResult.flight_iata}
                  </span>
                  <span style={{ color: 'var(--warmgrey)' }}> &mdash; </span>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', color: statusEntry.color }}>
                    {statusEntry.label}
                  </span>
                </div>

                {/* Line 2: arrival time + delay */}
                <div style={{ color: 'var(--warmgrey)', fontSize: 14, fontWeight: 400, marginTop: 4 }}>
                  Arrival: {formatArrivalTime(flightCheckResult.flight_estimated_arrival)}
                  {' \u00b7 '}
                  {flightCheckResult.flight_delay_minutes != null && flightCheckResult.flight_delay_minutes > 0 ? (
                    <span style={{ color: '#E67E22' }}>
                      +{flightCheckResult.flight_delay_minutes} min delay
                    </span>
                  ) : (
                    'No delay'
                  )}
                </div>

                {/* Line 3 (conditional): airport mismatch warning */}
                {flightCheckResult.flight_arrival_airport !== 'PRG' &&
                  flightCheckResult.flight_departure_airport !== 'PRG' && (
                    <div style={{ color: '#E67E22', fontSize: 14, fontWeight: 400, marginTop: 4 }}>
                      &#9888; Airport mismatch: flight arrives at {flightCheckResult.flight_arrival_airport}, not PRG
                    </div>
                  )}
              </>
            )}

            {flightCheckState === 'error' && (
              <div
                role="alert"
                aria-live="assertive"
                style={{ color: 'var(--warmgrey)', fontSize: 14, fontWeight: 400, marginTop: 8 }}
              >
                &#9888; Flight not found or check unavailable &mdash; you can proceed anyway
              </div>
            )}
          </div>
        </>
      )}

      {/* Row 5: Special Requests */}
      <div style={{ marginTop: 24 }}>
        <p className="label" style={{ marginBottom: 8 }}>SPECIAL REQUESTS</p>
        <textarea
          {...register('specialRequests')}
          placeholder="Any special requirements for your journey"
          maxLength={500}
          rows={4}
          onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          style={{
            width: '100%',
            background: 'var(--anthracite-mid)',
            border: `1px solid ${errors.specialRequests ? '#C0392B' : 'var(--anthracite-light)'}`,
            padding: '12px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--offwhite)',
            outline: 'none',
            borderRadius: 4,
            resize: 'vertical',
          }}
        />
        <p style={{ fontSize: 10, fontWeight: 400, color: 'var(--warmgrey)', textAlign: 'right', marginTop: 4, letterSpacing: '0.4em' }}>
          {(specialRequests ?? '').length}/500
        </p>
        {errors.specialRequests && (
          <p style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
            {errors.specialRequests.message}
          </p>
        )}
      </div>
    </div>
  )
}
