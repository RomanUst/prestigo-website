'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import { errorStyle, focusRingHandlers, inputBaseStyle } from './adminFieldStyles'
import { CANCELLATION_POLICY_VERSION, DEFAULT_POLICY, POLICY_BOUNDS } from '@/lib/cancellation-policy'

// Phase 89 (CANC-01, D-06): the numbers behind the cancellation policy. Same card, optimistic save on
// blur and feedback as NoShowWaitSettings. The server (zod in /api/admin/settings, the 087 CHECKs and
// the long-versus-short cross-check) stays authoritative; the bounds here only save a round trip.

interface Props {
  initialKm?: number | null
  initialShortHours?: number | null
  initialLongHours?: number | null
  initialHourlyHours?: number | null
  initialPercent?: number | null
}

type FieldKey = 'km' | 'short' | 'long' | 'hourly' | 'percent'
type Feedback = { type: 'success' | 'error'; message: string } | null

const FIELDS: Record<
  FieldKey,
  { settingsKey: string; min: number; max: number; fallback: number; error: string }
> = {
  km: {
    settingsKey: 'cancel_free_km_threshold',
    min: POLICY_BOUNDS.km.min,
    max: POLICY_BOUNDS.km.max,
    fallback: DEFAULT_POLICY.kmThreshold,
    error: `Enter a whole number from ${POLICY_BOUNDS.km.min} to ${POLICY_BOUNDS.km.max}.`,
  },
  short: {
    settingsKey: 'cancel_free_hours_short',
    min: POLICY_BOUNDS.hours.min,
    max: POLICY_BOUNDS.hours.max,
    fallback: DEFAULT_POLICY.freeHoursShort,
    error: `Enter a whole number from ${POLICY_BOUNDS.hours.min} to ${POLICY_BOUNDS.hours.max}.`,
  },
  long: {
    settingsKey: 'cancel_free_hours_long',
    min: POLICY_BOUNDS.hours.min,
    max: POLICY_BOUNDS.hours.max,
    fallback: DEFAULT_POLICY.freeHoursLong,
    error: `Enter a whole number from ${POLICY_BOUNDS.hours.min} to ${POLICY_BOUNDS.hours.max}.`,
  },
  hourly: {
    settingsKey: 'cancel_free_hours_hourly',
    min: POLICY_BOUNDS.hours.min,
    max: POLICY_BOUNDS.hours.max,
    fallback: DEFAULT_POLICY.freeHoursHourly,
    error: `Enter a whole number from ${POLICY_BOUNDS.hours.min} to ${POLICY_BOUNDS.hours.max}.`,
  },
  percent: {
    settingsKey: 'cancel_fee_percent',
    min: POLICY_BOUNDS.percent.min,
    max: POLICY_BOUNDS.percent.max,
    fallback: DEFAULT_POLICY.feePercent,
    error: `Enter a whole number from ${POLICY_BOUNDS.percent.min} to ${POLICY_BOUNDS.percent.max}.`,
  },
}

const ORDER: FieldKey[] = ['km', 'short', 'long', 'hourly', 'percent']

const LONG_BELOW_SHORT = 'Longer trips must be at least as long as short trips.'

/** Whole number inside the field's bounds, written as plain digits (no sign, decimals or exponent). */
function parseField(key: FieldKey, raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= FIELDS[key].min && n <= FIELDS[key].max ? n : null
}

function initialValue(key: FieldKey, v: number | null | undefined): number {
  const { min, max, fallback } = FIELDS[key]
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback
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

const helperStyle: CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  lineHeight: 1.5,
  color: 'var(--admin-text-muted)',
}

export default function CancellationPolicySettings({
  initialKm,
  initialShortHours,
  initialLongHours,
  initialHourlyHours,
  initialPercent,
}: Props) {
  const start: Record<FieldKey, number> = {
    km: initialValue('km', initialKm),
    short: initialValue('short', initialShortHours),
    long: initialValue('long', initialLongHours),
    hourly: initialValue('hourly', initialHourlyHours),
    percent: initialValue('percent', initialPercent),
  }
  const [saved, setSaved] = useState<Record<FieldKey, number>>(start)
  const [inputs, setInputs] = useState<Record<FieldKey, string>>({
    km: String(start.km),
    short: String(start.short),
    long: String(start.long),
    hourly: String(start.hourly),
    percent: String(start.percent),
  })
  const [invalid, setInvalid] = useState<Record<FieldKey, boolean>>({
    km: false,
    short: false,
    long: false,
    hourly: false,
    percent: false,
  })
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
    if (crossError && (key === 'short' || key === 'long')) setCrossError(false)
  }

  async function handleBlur(key: FieldKey, raw: string) {
    const parsed = parseField(key, raw)
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
      await persist({ [FIELDS[key].settingsKey]: parsed })
      setCrossError(false)
      showFeedback({ type: 'success', message: 'Saved' })
    } catch (err) {
      setSaved(prev => ({ ...prev, [key]: previous }))
      if (err instanceof SaveError && err.code === 'long_below_short') {
        // Refused by the server: the typed text stays next to the explanation
        setCrossError(true)
        return
      }
      // Revert on error
      setInputs(prev => ({ ...prev, [key]: String(previous) }))
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  function renderField(key: FieldKey, label: string, helper?: string) {
    const id = `cancel-policy-${key}`
    const hasError = invalid[key]
    const hasCross = key === 'long' && crossError && !hasError
    const describedBy = [helper ? `${id}-help` : null, hasError || hasCross ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ')
    return (
      <div key={key} style={{ marginTop: 24 }}>
        <label htmlFor={id} style={labelTextStyle}>
          {label}
        </label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={FIELDS[key].min}
          max={FIELDS[key].max}
          step={1}
          value={inputs[key]}
          aria-invalid={hasError || hasCross}
          aria-describedby={describedBy || undefined}
          onChange={e => handleChange(key, e.target.value)}
          onFocus={focusRingHandlers.onFocus}
          onBlur={(e: FocusEvent<HTMLInputElement>) => {
            focusRingHandlers.onBlur(e)
            void handleBlur(key, e.currentTarget.value)
          }}
          style={{ ...inputBaseStyle, fontWeight: 400, letterSpacing: 'normal', maxWidth: '160px' }}
        />
        {helper && (
          <p id={`${id}-help`} style={helperStyle}>
            {helper}
          </p>
        )}
        {hasError && (
          <div id={`${id}-error`} role="alert" style={errorStyle}>
            {FIELDS[key].error}
          </div>
        )}
        {hasCross && (
          <div id={`${id}-error`} role="alert" style={errorStyle}>
            {LONG_BELOW_SHORT}
          </div>
        )}
      </div>
    )
  }

  // The preview follows the numbers as typed, valid or not
  const typed = (key: FieldKey) => inputs[key].trim() || '…'
  const preview =
    `Free until ${typed('short')} h before pickup for trips up to ${typed('km')} km, ` +
    `${typed('long')} h for longer trips and ${typed('hourly')} h for hourly bookings. ` +
    `After that, ${typed('percent')}% of the fare applies.`

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
            Cancellation policy
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
        <p style={{ ...helperStyle, margin: '0 0 8px' }}>
          These numbers are shown to clients at checkout, in emails and on the manage page. A booking keeps the terms
          it was made under, so changes apply to new bookings only.
        </p>

        {renderField('km', 'Short-trip limit (km)', 'Trips up to this distance use the short-trip hours.')}
        {renderField(
          'short',
          'Free cancellation, short trips (hours before pickup)',
          'Free until this many hours before pickup.',
        )}
        {renderField('long', 'Free cancellation, longer trips (hours)')}
        {renderField(
          'hourly',
          'Free cancellation, hourly bookings (hours)',
          'Hourly bookings have no distance, so they use their own number.',
        )}
        {renderField(
          'percent',
          'Fee for late cancellation (percent)',
          'The fee the dialog proposes. You can charge less, never more than the booking amount.',
        )}

        <div
          aria-live="polite"
          style={{
            marginTop: 24,
            padding: 16,
            background: 'var(--admin-hover)',
            borderRadius: 'var(--admin-radius-md)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-montserrat)',
              fontSize: 'var(--admin-fs-body)',
              lineHeight: 1.5,
              color: 'var(--admin-text)',
            }}
          >
            {preview}
          </p>
          <p style={{ ...helperStyle, marginTop: 8 }}>
            {`Policy version: ${CANCELLATION_POLICY_VERSION}. The version changes when the wording changes, not when you change a number.`}
          </p>
        </div>
      </div>
    </div>
  )
}
