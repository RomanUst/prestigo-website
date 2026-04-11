'use client'

import { useEffect, useState, type FormEvent } from 'react'
import DayCard, { createDay, type Day } from '@/components/booking/DayCard'

interface HourlyRange {
  min: number
  max: number
}

interface PassengerState {
  firstName: string
  lastName: string
  email: string
  phone: string
  specialRequests: string
}

const INITIAL_PASSENGER: PassengerState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialRequests: '',
}

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; quoteReference: string }

function validateDays(days: Day[]): string | null {
  if (days.length === 0) return 'Add at least one day.'
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    if (day.type === 'transfer') {
      if (!day.transfer.from) return `Day ${i + 1}: enter a departure address.`
      if (!day.transfer.to) return `Day ${i + 1}: enter a destination address.`
      if (day.transfer.stops.some((s) => s.place === null))
        return `Day ${i + 1}: complete or remove the empty stop.`
    } else {
      if (!day.hourly.city) return `Day ${i + 1}: enter a base city.`
    }
  }
  return null
}

function validatePassenger(p: PassengerState): string | null {
  if (!p.firstName.trim()) return 'First name is required.'
  if (!p.lastName.trim()) return 'Last name is required.'
  if (!p.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return 'Valid email is required.'
  if (!p.phone.trim() || p.phone.trim().length < 5) return 'Valid phone number is required.'
  return null
}

function buildPayload(days: Day[], passenger: PassengerState, startDate: string) {
  return {
    days: days.map((d) =>
      d.type === 'transfer'
        ? {
            type: 'transfer' as const,
            from: d.transfer.from!.address,
            to: d.transfer.to!.address,
            stops: d.transfer.stops.map((s) => ({
              address: s.place!.address,
              lat: s.place!.lat,
              lng: s.place!.lng,
            })),
          }
        : {
            type: 'hourly' as const,
            city: d.hourly.city!.address,
            hours: d.hourly.hours,
          }
    ),
    startDate: startDate || undefined,
    passengerDetails: {
      firstName: passenger.firstName.trim(),
      lastName: passenger.lastName.trim(),
      email: passenger.email.trim(),
      phone: passenger.phone.trim(),
      specialRequests: passenger.specialRequests.trim() || undefined,
    },
  }
}

export default function MultiDayForm() {
  const [hourlyRange, setHourlyRange] = useState<HourlyRange>({ min: 2, max: 8 })
  const [days, setDays] = useState<Day[]>(() => [createDay(2)])
  const [passenger, setPassenger] = useState<PassengerState>(INITIAL_PASSENGER)
  const [startDate, setStartDate] = useState<string>('')
  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' })

  useEffect(() => {
    let active = true
    fetch('/api/hourly-config')
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        if (typeof data?.min === 'number' && typeof data?.max === 'number') {
          setHourlyRange({ min: data.min, max: data.max })
          // Re-clamp any day.hourly.hours outside the new range
          setDays((prev) =>
            prev.map((d) =>
              d.hourly.hours < data.min || d.hourly.hours > data.max
                ? { ...d, hourly: { ...d.hourly, hours: data.min } }
                : d
            )
          )
        }
      })
      .catch(() => {
        /* keep fallback { min: 2, max: 8 } */
      })
    return () => {
      active = false
    }
  }, [])

  const handleAddDay = () => {
    setDays((prev) => [...prev, createDay(hourlyRange.min)])
  }
  const handleRemoveDay = (id: string) => {
    setDays((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)))
  }
  const handleChangeDay = (next: Day) => {
    setDays((prev) => prev.map((d) => (d.id === next.id ? next : d)))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const daysError = validateDays(days)
    if (daysError) {
      setStatus({ kind: 'error', message: daysError })
      return
    }
    const passengerError = validatePassenger(passenger)
    if (passengerError) {
      setStatus({ kind: 'error', message: passengerError })
      return
    }

    setStatus({ kind: 'submitting' })
    try {
      const res = await fetch('/api/submit-multiday-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(days, passenger, startDate)),
      })
      if (res.status === 429) {
        setStatus({ kind: 'error', message: 'Too many requests. Please wait a minute and try again.' })
        return
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: 'We could not submit your request. Please check your entries and try again.',
        })
        return
      }
      const data = (await res.json()) as { quoteReference: string }
      setStatus({ kind: 'success', quoteReference: data.quoteReference })
    } catch {
      setStatus({
        kind: 'error',
        message: 'Network error. Please check your connection and try again.',
      })
    }
  }

  if (status.kind === 'success') {
    return (
      <div
        data-testid="multiday-confirmation"
        style={{
          padding: '48px 24px',
          border: '1px solid var(--copper-light)',
          background: 'var(--anthracite-dark)',
          textAlign: 'center',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            marginBottom: '16px',
            color: 'var(--offwhite)',
          }}
        >
          Thank you — your request is in our hands.
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
            marginBottom: '24px',
          }}
        >
          Quote reference:{' '}
          <strong style={{ color: 'var(--copper-lighter)' }}>{status.quoteReference}</strong>
        </p>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
          }}
        >
          We&rsquo;ll review your itinerary and respond within 24 hours.
        </p>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--anthracite)',
    color: 'var(--offwhite)',
    border: '1px solid var(--anthracite-light)',
    padding: '12px 16px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '14px',
    width: '100%',
  }
  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--warmgrey)',
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <label style={labelStyle}>
        Start date (optional)
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={inputStyle}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {days.map((day, index) => (
          <DayCard
            key={day.id}
            day={day}
            index={index}
            hourlyRange={hourlyRange}
            canRemove={days.length > 1}
            onChange={handleChangeDay}
            onRemove={handleRemoveDay}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddDay}
        style={{
          padding: '14px 20px',
          background: 'transparent',
          border: '1px dashed var(--anthracite-light)',
          color: 'var(--copper-light)',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '12px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        + Add day
      </button>

      <fieldset
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          border: '1px solid var(--anthracite-light)',
          padding: '20px',
        }}
      >
        <legend
          style={{
            padding: '0 12px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '10px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
          }}
        >
          Your details
        </legend>
        <label style={labelStyle}>
          First name
          <input
            name="firstName"
            value={passenger.firstName}
            onChange={(e) => setPassenger({ ...passenger, firstName: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle}>
          Last name
          <input
            name="lastName"
            value={passenger.lastName}
            onChange={(e) => setPassenger({ ...passenger, lastName: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle}>
          Email
          <input
            name="email"
            type="email"
            value={passenger.email}
            onChange={(e) => setPassenger({ ...passenger, email: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle}>
          Phone
          <input
            name="phone"
            type="tel"
            value={passenger.phone}
            onChange={(e) => setPassenger({ ...passenger, phone: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Special requests
          <textarea
            name="specialRequests"
            value={passenger.specialRequests}
            onChange={(e) => setPassenger({ ...passenger, specialRequests: e.target.value })}
            rows={3}
            maxLength={1000}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
      </fieldset>

      {status.kind === 'error' && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            color: '#E87474',
          }}
        >
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={status.kind === 'submitting'}
        style={{
          padding: '16px 24px',
          background: 'var(--copper)',
          color: 'var(--offwhite)',
          border: 'none',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '12px',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          cursor: status.kind === 'submitting' ? 'wait' : 'pointer',
          opacity: status.kind === 'submitting' ? 0.6 : 1,
        }}
      >
        {status.kind === 'submitting' ? 'Sending\u2026' : 'Request quote'}
      </button>
    </form>
  )
}
