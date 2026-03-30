'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBookingStore } from '@/lib/booking-store'
import { PRG_CONFIG } from '@/types/booking'

const passengerSchema = (isAirport: boolean) =>
  z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().min(7, 'Enter a valid phone number'),
    flightNumber: isAirport
      ? z.string().min(1, 'Flight number is required for airport rides')
      : z.string().optional(),
    terminal: z.string().optional(),
    specialRequests: z.string().max(500, 'Maximum 500 characters').optional(),
  })

export default function Step5Passenger() {
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const passengerDetails = useBookingStore((s) => s.passengerDetails)
  const setPassengerDetails = useBookingStore((s) => s.setPassengerDetails)

  const isAirportRide =
    origin?.placeId === PRG_CONFIG.placeId ||
    destination?.placeId === PRG_CONFIG.placeId

  const {
    register,
    watch,
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

  return (
    <div>
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
              <p id="flightNumber-error" style={{ color: '#C0392B', fontSize: 14, fontWeight: 300, marginTop: 8 }}>
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
