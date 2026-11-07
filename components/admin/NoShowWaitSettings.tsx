'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import { errorStyle, focusRingHandlers, inputBaseStyle } from './adminFieldStyles'

// Phase 87 plan 12 (D-15): the free waiting time before a driver can ask for a no-show, one value
// for city pickups and one for airport pickups. Same optimistic-save pattern as DispatchDefault.
// The server (zod in /api/admin/settings and the 084 CHECK) stays authoritative; the 1..240 check
// here only saves a round trip (T-87-42).

interface Props {
  initialCityMin?: number | null
  initialAirportMin?: number | null
}

const DEFAULT_CITY_MIN = 30
const DEFAULT_AIRPORT_MIN = 60
const MIN_WAIT = 1
const MAX_WAIT = 240
const RANGE_ERROR = 'Enter a whole number from 1 to 240.'
const AIRPORT_BELOW_CITY = 'Airport wait must be at least the city wait.'

type FieldKey = 'city' | 'airport'
type Feedback = { type: 'success' | 'error'; message: string } | null

const SETTINGS_KEY: Record<FieldKey, string> = {
  city: 'noshow_wait_city_min',
  airport: 'noshow_wait_airport_min',
}

/** Whole number 1..240, written as plain digits (no sign, decimals or exponent). */
function parseWait(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= MIN_WAIT && n <= MAX_WAIT ? n : null
}

function initialValue(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_WAIT && v <= MAX_WAIT ? v : fallback
}

class SaveError extends Error {
  constructor(readonly code: string | null) {
    super('Save failed')
  }
}

const labelTextStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  fontWeight: 'var(--admin-fw-strong)',
  color: 'var(--admin-text-muted)',
  marginBottom: '4px',
}

export default function NoShowWaitSettings({ initialCityMin, initialAirportMin }: Props) {
  const [saved, setSaved] = useState<Record<FieldKey, number>>({
    city: initialValue(initialCityMin, DEFAULT_CITY_MIN),
    airport: initialValue(initialAirportMin, DEFAULT_AIRPORT_MIN),
  })
  const [inputs, setInputs] = useState<Record<FieldKey, string>>({
    city: String(initialValue(initialCityMin, DEFAULT_CITY_MIN)),
    airport: String(initialValue(initialAirportMin, DEFAULT_AIRPORT_MIN)),
  })
  const [invalid, setInvalid] = useState<Record<FieldKey, boolean>>({ city: false, airport: false })
  const [crossError, setCrossError] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  function showFeedback(fb: NonNullable<Feedback>) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(fb)
    feedbackTimer.current = setTimeout(() => setFeedback(null), fb.type === 'error' ? 4000 : 2000)
  }

  async function persist(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // WR-06: the server refuses an airport wait below the city wait with a 422 and a code
      let code: string | null = null
      if (res.status === 422) {
        try {
          const json = (await res.json()) as { error?: unknown }
          code = typeof json.error === 'string' ? json.error : null
        } catch {
          code = null
        }
      }
      throw new SaveError(code)
    }
  }

  function handleChange(key: FieldKey, value: string) {
    setInputs(prev => ({ ...prev, [key]: value }))
    if (invalid[key]) setInvalid(prev => ({ ...prev, [key]: false }))
    if (crossError) setCrossError(false)
  }

  async function handleBlur(key: FieldKey, raw: string) {
    const parsed = parseWait(raw)
    if (parsed === null) {
      // Not saved; the text stays so the operator can correct it
      setInvalid(prev => ({ ...prev, [key]: true }))
      return
    }
    setInvalid(prev => ({ ...prev, [key]: false }))
    setInputs(prev => ({ ...prev, [key]: String(parsed) }))
    if (parsed === saved[key]) return

    const previous = saved[key]
    // Optimistic update
    setSaved(prev => ({ ...prev, [key]: parsed }))
    try {
      await persist({ [SETTINGS_KEY[key]]: parsed })
      setCrossError(false)
      showFeedback({ type: 'success', message: 'Saved' })
    } catch (err) {
      if (err instanceof SaveError && err.code === 'airport_below_city') {
        // Refused by the server: the typed text stays next to the explanation, nothing was stored
        setSaved(prev => ({ ...prev, [key]: previous }))
        setCrossError(true)
        return
      }
      // Revert on error
      setSaved(prev => ({ ...prev, [key]: previous }))
      setInputs(prev => ({ ...prev, [key]: String(previous) }))
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  function renderField(key: FieldKey, id: string, label: string) {
    const hasError = invalid[key]
    const hasCross = key === 'airport' && crossError && !hasError
    return (
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <label htmlFor={id} style={labelTextStyle}>
          {label}
        </label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_WAIT}
          max={MAX_WAIT}
          step={1}
          value={inputs[key]}
          aria-invalid={hasError || hasCross}
          aria-describedby={hasError || hasCross ? `${id}-error` : undefined}
          onChange={e => handleChange(key, e.target.value)}
          onFocus={focusRingHandlers.onFocus}
          onBlur={(e: FocusEvent<HTMLInputElement>) => {
            focusRingHandlers.onBlur(e)
            void handleBlur(key, e.currentTarget.value)
          }}
          style={{ ...inputBaseStyle, fontWeight: 400, letterSpacing: 'normal', maxWidth: '160px' }}
        />
        {hasError && (
          <div id={`${id}-error`} role="alert" style={errorStyle}>
            {RANGE_ERROR}
          </div>
        )}
        {hasCross && (
          <div id={`${id}-error`} role="alert" style={errorStyle}>
            {AIRPORT_BELOW_CITY}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, marginTop: 24 }}>
      <div
        style={{
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-md)',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--admin-fs-heading)',
              fontWeight: 'var(--admin-fw-heading)',
              color: 'var(--admin-text)',
            }}
          >
            No-show waiting time
          </h2>
          {feedback && (
            <span
              role="status"
              style={{
                fontSize: 'var(--admin-fs-label)',
                color: feedback.type === 'success' ? 'var(--status-ok-fg)' : 'var(--status-danger-fg)',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {feedback.message}
            </span>
          )}
        </div>
        <p
          style={{
            margin: '0 0 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 'var(--admin-fs-label)',
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
          }}
        >
          Free waiting time before a driver can request a no-show. Counted from the later of the pickup time and the driver&apos;s arrival.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {renderField('city', 'noshow-wait-city', 'City pickup (minutes)')}
          {renderField('airport', 'noshow-wait-airport', 'Airport pickup (minutes)')}
        </div>
      </div>
    </div>
  )
}
