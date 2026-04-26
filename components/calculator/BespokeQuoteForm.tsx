'use client'

import { useState, FormEvent } from 'react'

type State = 'idle' | 'sending' | 'success' | 'error'

const inputClass =
  'w-full bg-anthracite-mid border border-anthracite-light px-4 py-3.5 font-body font-light text-[12px] text-offwhite placeholder-warmgrey/60 tracking-wide focus:outline-none focus:border-copper/60 transition-colors'
const labelClass =
  'block font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey mb-2'

export default function BespokeQuoteForm() {
  const [state, setState] = useState<State>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Form fields
  const [occasion, setOccasion] = useState<'wedding' | 'corporate' | 'airport_vip' | 'other'>('wedding')
  const [guests, setGuests] = useState(2)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot

  function resetForm() {
    setOccasion('wedding')
    setGuests(2)
    setDate('')
    setTime('')
    setSpecialRequests('')
    setName('')
    setEmail('')
    setWebsite('')
    setState('idle')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMessage('')

    try {
      const res = await fetch('/api/bespoke-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occasion,
          guests: Number(guests),
          date: date || null,
          time: time || null,
          specialRequests: specialRequests || null,
          name,
          email,
          website,
        }),
      })

      if (res.ok) {
        setState('success')
        return
      }

      if (res.status === 400) {
        setErrorMessage('Please check your input and try again')
        setState('error')
        return
      }

      if (res.status === 429) {
        setErrorMessage('Too many requests, please try again in a minute')
        setState('error')
        return
      }

      // 5xx or other
      setErrorMessage('Something went wrong — please try again later')
      setState('error')
    } catch {
      setErrorMessage('Something went wrong — please try again later')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div
        style={{
          background: 'rgba(184,115,51,0.08)',
          border: '1px solid var(--copper)',
          padding: 24,
          maxWidth: 600,
        }}
      >
        <p style={{ color: 'var(--offwhite)', fontFamily: 'var(--font-montserrat)', fontSize: 14, margin: '0 0 8px 0' }}>
          Your request has been received — we will respond within 24 hours.
        </p>
        <button
          type="button"
          onClick={resetForm}
          className="font-body font-light text-[10px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors"
          style={{ color: 'var(--copper)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Submit another request →
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ maxWidth: 600, position: 'relative' }}
      className="flex flex-col gap-6"
      noValidate
    >
      {/* Honeypot — off-screen, not display:none (Google flags display:none) */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
        aria-hidden="true"
      />

      {/* Occasion radio group */}
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className={labelClass} style={{ marginBottom: 12 }}>
          Occasion <span style={{ color: 'var(--copper)' }}>*</span>
        </legend>
        <div className="flex flex-wrap gap-4">
          {([
            { value: 'wedding', label: 'Wedding' },
            { value: 'corporate', label: 'Corporate' },
            { value: 'airport_vip', label: 'Airport VIP' },
            { value: 'other', label: 'Other' },
          ] as const).map(({ value, label }) => (
            <label
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontFamily: 'var(--font-montserrat)',
                fontSize: 12,
                color: 'var(--offwhite)',
                letterSpacing: '0.05em',
              }}
            >
              <input
                type="radio"
                name="occasion"
                value={value}
                checked={occasion === value}
                onChange={() => setOccasion(value)}
                style={{ accentColor: 'var(--copper)', cursor: 'pointer' }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Guests */}
      <div>
        <label htmlFor="bespoke-guests" className={labelClass}>
          Number of guests
        </label>
        <input
          id="bespoke-guests"
          type="number"
          min={1}
          max={10}
          required
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className={inputClass}
          style={{ maxWidth: 120 }}
        />
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bespoke-date" className={labelClass}>
            Date
          </label>
          <input
            id="bespoke-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="bespoke-time" className={labelClass}>
            Time
          </label>
          <input
            id="bespoke-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Special requests */}
      <div>
        <label htmlFor="bespoke-special-requests" className={labelClass}>
          Special requests
        </label>
        <textarea
          id="bespoke-special-requests"
          rows={4}
          maxLength={1500}
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          placeholder="Tell us about your requirements — vehicle preferences, on-board amenities, special arrangements…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Name + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bespoke-name" className={labelClass}>
            Name <span style={{ color: 'var(--copper)' }}>*</span>
          </label>
          <input
            id="bespoke-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="bespoke-email" className={labelClass}>
            Email <span style={{ color: 'var(--copper)' }}>*</span>
          </label>
          <input
            id="bespoke-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className={inputClass}
          />
        </div>
      </div>

      {/* Error message */}
      {state === 'error' && errorMessage && (
        <p
          role="alert"
          style={{
            color: 'var(--copper-light)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 12,
            margin: 0,
          }}
        >
          {errorMessage}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed self-start"
      >
        {state === 'sending' ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}
