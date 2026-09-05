'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { DayPicker } from 'react-day-picker'
import DayCard, { createDay, type Day } from '@/components/booking/DayCard'

type MultiDayTranslator = (key: string, values?: Record<string, string | number>) => string

function formatDateDisplay(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 12, fontWeight: 400, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.18em', textTransform: 'uppercase' as const },
  weekday: { color: 'var(--warmgrey)', fontSize: 12, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 36, height: 36 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  nav: { color: 'var(--copper)' },
  button_previous: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  button_next: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  chevron: { fill: 'var(--copper)', width: 16, height: 16 },
}

const calendarModifiers = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
}

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

function validateDays(days: Day[], t: MultiDayTranslator): string | null {
  if (days.length === 0) return t('addAtLeastOneDay')
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    if (day.type === 'transfer') {
      if (!day.transfer.from) return t('dayDepartureRequired', { day: i + 1 })
      if (!day.transfer.to) return t('dayDestinationRequired', { day: i + 1 })
      if (day.transfer.stops.some((s) => s.place === null))
        return t('dayEmptyStop', { day: i + 1 })
    } else {
      if (!day.hourly.city) return t('dayBaseCityRequired', { day: i + 1 })
    }
  }
  return null
}

function validatePassenger(p: PassengerState, t: MultiDayTranslator): string | null {
  if (!p.firstName.trim()) return t('firstNameRequired')
  if (!p.lastName.trim()) return t('lastNameRequired')
  if (!p.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return t('validEmailRequired')
  if (!p.phone.trim() || p.phone.trim().length < 5) return t('validPhoneRequired')
  return null
}

function buildPayload(days: Day[], passenger: PassengerState, startDate: string) {
  return {
    days: days.map((d) =>
      d.type === 'transfer'
        ? {
            type: 'transfer' as const,
            date: d.date || undefined,
            time: d.time,
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
            date: d.date || undefined,
            time: d.time,
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
  const t = useTranslations('Booking.multiDayForm')
  const [hourlyRange, setHourlyRange] = useState<HourlyRange>({ min: 2, max: 8 })
  const [days, setDays] = useState<Day[]>(() => [createDay(2)])
  const [passenger, setPassenger] = useState<PassengerState>(INITIAL_PASSENGER)
  const [startDate, setStartDate] = useState<string>('')
  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' })
  const [openDatePicker, setOpenDatePicker] = useState(false)
  const [todayStr, setTodayStr] = useState<string>('')
  const dateFieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (!openDatePicker) return
    function handlePointerDown(e: MouseEvent) {
      if (dateFieldRef.current && !dateFieldRef.current.contains(e.target as Node)) {
        setOpenDatePicker(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenDatePicker(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openDatePicker])

  function handleDateSelect(d: Date | undefined) {
    if (!d) { setStartDate(''); return }
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setStartDate(iso)
    setOpenDatePicker(false)
  }

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
    const daysError = validateDays(days, t)
    if (daysError) {
      setStatus({ kind: 'error', message: daysError })
      return
    }
    const passengerError = validatePassenger(passenger, t)
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
        setStatus({ kind: 'error', message: t('tooManyRequests') })
        return
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: t('submitError'),
        })
        return
      }
      const data = (await res.json()) as { quoteReference: string }
      setStatus({ kind: 'success', quoteReference: data.quoteReference })
    } catch {
      setStatus({
        kind: 'error',
        message: t('networkError'),
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
          {t('thankYou')}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
            marginBottom: '24px',
          }}
        >
          {t('quoteReference')}{' '}
          <strong style={{ color: 'var(--copper-lighter)' }}>{status.quoteReference}</strong>
        </p>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            color: 'var(--warmgrey)',
          }}
        >
          {t('reviewNotice')}
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
      <div ref={dateFieldRef} style={{ position: 'relative' }}>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--warmgrey)',
            marginBottom: '8px',
          }}
        >
          {t('startDateLabel')} <span style={{ color: 'var(--anthracite-light)' }}>{t('optionalSuffix')}</span>
        </p>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={openDatePicker}
          aria-label={t('startDateAria')}
          onClick={() => setOpenDatePicker((v) => !v)}
          style={{
            ...inputStyle,
            minHeight: '48px',
            textAlign: 'left',
            cursor: 'pointer',
            color: startDate ? 'var(--offwhite)' : 'var(--warmgrey)',
          }}
        >
          {startDate ? formatDateDisplay(startDate) : t('selectDate')}
        </button>
        {openDatePicker && (
          <div
            role="dialog"
            aria-label={t('selectStartDateAria')}
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
              selected={startDate ? new Date(startDate + 'T00:00:00') : undefined}
              onSelect={handleDateSelect}
              disabled={todayStr ? { before: new Date(todayStr + 'T00:00:00') } : undefined}
              styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
              modifiersStyles={calendarModifiers}
            />
          </div>
        )}
      </div>

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
        {t('addDay')}
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
          {t('yourDetails')}
        </legend>
        <label style={labelStyle}>
          {t('firstName')}
          <input
            name="firstName"
            value={passenger.firstName}
            onChange={(e) => setPassenger({ ...passenger, firstName: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle}>
          {t('lastName')}
          <input
            name="lastName"
            value={passenger.lastName}
            onChange={(e) => setPassenger({ ...passenger, lastName: e.target.value })}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle}>
          {t('email')}
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
          {t('phone')}
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
          {t('specialRequests')}
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
        {status.kind === 'submitting' ? t('sending') : t('requestQuote')}
      </button>
    </form>
  )
}
