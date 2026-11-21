'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import { errorStyle, focusRingHandlers, inputBaseStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'

// Phase 93 (plan 93-09; TRIP-03; D-02, D-12, D-22; UI-SPEC 7.2): the numbers shared by every tour - the extra-hour price per
// car class, the free-cancellation hours and the pickup radius. Same recipe as CancellationPolicySettings: optimistic save
// on blur, "Saved" or an error per field, the server (zod in /api/admin/tour-settings and the 092 CHECKs) stays
// authoritative; the bounds here mirror it and only save a round trip. Values are read from the API: no number is typed
// into the page.

type FieldKey = 'extra_e' | 'extra_s' | 'extra_v' | 'cancel' | 'radius'
type FieldFeedback = { type: 'saved' | 'error'; message: string }

interface SettingsAnswer {
  extra_hour_e_eur: number | null
  extra_hour_s_eur: number | null
  extra_hour_v_eur: number | null
  free_cancel_hours: number
  pickup_radius_km: number
}

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_SAVE_FAILED = 'Could not save. Nothing was changed. Try again.'
const COPY_LOAD_FAILED = 'Could not load tour settings. Try again.'
const PRICE_MAX = 100_000

const FIELDS: Record<
  FieldKey,
  { settingsKey: keyof SettingsAnswer; label: string; kind: 'price' | 'hours' | 'radius'; error: string }
> = {
  extra_e: {
    settingsKey: 'extra_hour_e_eur',
    label: 'Extra hour, Business (E)',
    kind: 'price',
    error: 'Enter a price greater than 0.',
  },
  extra_s: {
    settingsKey: 'extra_hour_s_eur',
    label: 'Extra hour, First Class (S)',
    kind: 'price',
    error: 'Enter a price greater than 0.',
  },
  extra_v: {
    settingsKey: 'extra_hour_v_eur',
    label: 'Extra hour, Business Van (V)',
    kind: 'price',
    error: 'Enter a price greater than 0.',
  },
  cancel: {
    settingsKey: 'free_cancel_hours',
    label: 'Free cancellation, hours before pickup',
    kind: 'hours',
    error: 'Enter a whole number from 0 to 72.',
  },
  radius: {
    settingsKey: 'pickup_radius_km',
    label: 'Pickup radius from Old Town Square, km',
    kind: 'radius',
    error: 'Enter a number from 1 to 50.',
  },
}

const ORDER: FieldKey[] = ['extra_e', 'extra_s', 'extra_v', 'cancel', 'radius']
const PRICE_KEYS: FieldKey[] = ['extra_e', 'extra_s', 'extra_v']

/** The number the text stands for, or null when it is outside the field's bounds (same rules as tourSettingsSchema). */
function parseField(key: FieldKey, raw: string): number | null {
  const text = raw.trim()
  switch (FIELDS[key].kind) {
    case 'price': {
      if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
      const n = Number(text)
      return n > 0 && n <= PRICE_MAX ? n : null
    }
    case 'hours': {
      if (!/^\d+$/.test(text)) return null
      const n = Number(text)
      return n >= 0 && n <= 72 ? n : null
    }
    case 'radius': {
      if (!/^\d+(\.\d+)?$/.test(text)) return null
      const n = Number(text)
      return n >= 1 && n <= 50 && Number.isInteger(n * 2) ? n : null
    }
  }
}

function toState(answer: SettingsAnswer): Record<FieldKey, number | null> {
  return {
    extra_e: answer.extra_hour_e_eur,
    extra_s: answer.extra_hour_s_eur,
    extra_v: answer.extra_hour_v_eur,
    cancel: answer.free_cancel_hours,
    radius: answer.pickup_radius_km,
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

const noteStyle: CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  lineHeight: 1.5,
  color: 'var(--admin-text-muted)',
}

const cardStyle: CSSProperties = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: 24,
  marginBottom: 24,
}

export default function TourSettingsCard() {
  const [saved, setSaved] = useState<Record<FieldKey, number | null> | null>(null)
  const [inputs, setInputs] = useState<Record<FieldKey, string>>({
    extra_e: '',
    extra_s: '',
    extra_v: '',
    cancel: '',
    radius: '',
  })
  const [invalid, setInvalid] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [feedback, setFeedback] = useState<Partial<Record<FieldKey, FieldFeedback>>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const timers = useRef<Partial<Record<FieldKey, ReturnType<typeof setTimeout>>>>({})

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of Object.values(pending)) if (t) clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/tour-settings', { cache: 'no-store' })
        if (cancelled) return
        if (!res.ok) {
          setLoadError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_LOAD_FAILED)
          return
        }
        const answer = (await res.json()) as SettingsAnswer
        if (cancelled) return
        const state = toState(answer)
        setSaved(state)
        setInputs({
          extra_e: state.extra_e === null ? '' : String(state.extra_e),
          extra_s: state.extra_s === null ? '' : String(state.extra_s),
          extra_v: state.extra_v === null ? '' : String(state.extra_v),
          cancel: String(state.cancel),
          radius: String(state.radius),
        })
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError(COPY_LOAD_FAILED)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const retry = useCallback(() => {
    setLoadError(null)
    setReloadTick((n) => n + 1)
  }, [])

  function showFeedback(key: FieldKey, fb: FieldFeedback) {
    const existing = timers.current[key]
    if (existing) clearTimeout(existing)
    setFeedback((prev) => ({ ...prev, [key]: fb }))
    timers.current[key] = setTimeout(
      () => setFeedback((prev) => ({ ...prev, [key]: undefined })),
      fb.type === 'error' ? 4000 : 2000,
    )
  }

  async function handleBlur(key: FieldKey, raw: string) {
    if (!saved) return
    const parsed = parseField(key, raw)
    if (parsed === null) {
      // Not saved; the text stays so the operator can correct it
      setInvalid((prev) => ({ ...prev, [key]: true }))
      return
    }
    setInvalid((prev) => ({ ...prev, [key]: false }))
    setInputs((prev) => ({ ...prev, [key]: String(parsed) }))
    if (parsed === saved[key]) return

    const previous = saved[key]
    // Optimistic update
    setSaved((prev) => (prev ? { ...prev, [key]: parsed } : prev))
    const revert = (message: string) => {
      setSaved((prev) => (prev ? { ...prev, [key]: previous } : prev))
      setInputs((prev) => ({ ...prev, [key]: previous === null ? '' : String(previous) }))
      showFeedback(key, { type: 'error', message })
    }
    try {
      const res = await fetch('/api/admin/tour-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [FIELDS[key].settingsKey]: parsed }),
      })
      if (!res.ok) {
        revert(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_SAVE_FAILED)
        return
      }
      showFeedback(key, { type: 'saved', message: 'Saved' })
    } catch {
      revert(COPY_SAVE_FAILED)
    }
  }

  function renderField(key: FieldKey) {
    const id = `tour-settings-${key}`
    const field = FIELDS[key]
    const isPrice = PRICE_KEYS.includes(key)
    const fb = feedback[key]
    const hasError = invalid[key] === true
    return (
      <div key={key}>
        <label htmlFor={id} style={labelTextStyle}>
          {field.label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={id}
            type="number"
            inputMode={field.kind === 'hours' ? 'numeric' : 'decimal'}
            min={field.kind === 'price' ? 0 : field.kind === 'hours' ? 0 : 1}
            max={field.kind === 'hours' ? 72 : field.kind === 'radius' ? 50 : PRICE_MAX}
            step={field.kind === 'radius' ? 0.5 : 1}
            value={inputs[key]}
            disabled={saved === null}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : fb ? `${id}-feedback` : undefined}
            onChange={(e) => {
              setInputs((prev) => ({ ...prev, [key]: e.target.value }))
              if (hasError) setInvalid((prev) => ({ ...prev, [key]: false }))
            }}
            onFocus={focusRingHandlers.onFocus}
            onBlur={(e: FocusEvent<HTMLInputElement>) => {
              focusRingHandlers.onBlur(e)
              void handleBlur(key, e.currentTarget.value)
            }}
            style={{ ...inputBaseStyle, fontWeight: 400, letterSpacing: 'normal' }}
          />
          {isPrice && (
            <span
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 'var(--admin-fs-body)',
                color: 'var(--admin-text-muted)',
              }}
            >
              EUR
            </span>
          )}
        </div>
        {hasError && (
          <div id={`${id}-error`} role="alert" style={errorStyle}>
            {field.error}
          </div>
        )}
        {!hasError && fb && (
          <div
            id={`${id}-feedback`}
            role={fb.type === 'error' ? 'alert' : 'status'}
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 'var(--admin-fs-label)',
              marginTop: 4,
              color: fb.type === 'saved' ? 'var(--status-ok-fg)' : 'var(--status-danger-fg)',
            }}
          >
            {fb.message}
          </div>
        )}
      </div>
    )
  }

  return (
    <section aria-label="Tour settings" style={cardStyle}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--admin-fs-heading)',
          fontWeight: 'var(--admin-fw-heading)',
          color: 'var(--admin-text)',
        }}
      >
        Tour settings
      </h2>
      <p style={{ ...noteStyle, margin: '4px 0 16px' }}>
        These apply to all tours. Bookings already made keep the terms they were booked with.
      </p>
      {loadError ? (
        <div>
          <p role="alert" style={errorStyle}>{loadError}</p>
          {loadError !== COPY_SESSION && (
            <button type="button" onClick={retry} style={{ ...outlineButtonStyle, marginTop: 8 }}>
              Retry
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {ORDER.map(renderField)}
        </div>
      )}
    </section>
  )
}
