'use client'

import { useState } from 'react'

interface Props {
  initialHorizon: string
  initialDays: number
}

const DEFAULT_DAYS = 7

const OPTIONS = [
  { key: 'future', label: 'Future only' },
  { key: 'last_n_days', label: 'Last N days' },
  { key: 'all', label: 'All' },
] as const

type Feedback = { type: 'success' | 'error'; message: string } | null

export default function DispatchDefault({ initialHorizon, initialDays }: Props) {
  const [horizon, setHorizon] = useState<string>(initialHorizon || 'future')
  const [days, setDays] = useState<number>(initialDays || DEFAULT_DAYS)
  const [daysInput, setDaysInput] = useState<string>(String(initialDays || DEFAULT_DAYS))
  const [feedback, setFeedback] = useState<Feedback>(null)

  function showFeedback(fb: Feedback) {
    setFeedback(fb)
    setTimeout(() => setFeedback(null), fb?.type === 'error' ? 4000 : 2000)
  }

  async function persist(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Save failed')
  }

  async function handleSelectHorizon(nextHorizon: string) {
    const prevHorizon = horizon

    // Optimistic update
    setHorizon(nextHorizon)

    try {
      await persist({ dispatch_default_horizon: nextHorizon })
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      // Revert on error
      setHorizon(prevHorizon)
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  async function handleDaysBlur() {
    const parsed = parseInt(daysInput, 10)
    const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 365

    if (!valid) {
      // Clamp back to persisted/default value, never PATCH an invalid body
      setDaysInput(String(days))
      return
    }

    if (parsed === days) {
      setDaysInput(String(parsed))
      return
    }

    const prevDays = days

    // Optimistic update
    setDays(parsed)
    setDaysInput(String(parsed))

    try {
      await persist({ dispatch_horizon_days: parsed })
      showFeedback({ type: 'success', message: 'Saved' })
    } catch {
      // Revert on error
      setDays(prevDays)
      setDaysInput(String(prevDays))
      showFeedback({ type: 'error', message: 'Failed to save — try again' })
    }
  }

  return (
    <div style={{ maxWidth: 560, marginTop: 24 }}>
      <div
        style={{
          background: 'var(--anthracite-mid, #252528)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: 4,
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.4em',
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
            }}
          >
            DISPATCH DEFAULT
          </div>
          {feedback && (
            <span
              style={{
                fontSize: 11,
                color: feedback.type === 'success' ? 'var(--copper-light)' : '#ef4444',
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              {feedback.message}
            </span>
          )}
        </div>

        {OPTIONS.map(option => {
          const active = horizon === option.key
          return (
            <div
              key={option.key}
              role="radio"
              aria-checked={active}
              tabIndex={0}
              onClick={() => handleSelectHorizon(option.key)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectHorizon(option.key)
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 44,
                padding: '12px 8px',
                cursor: 'pointer',
                borderRadius: 4,
                border: active ? '1px solid var(--copper)' : '1px solid transparent',
                background: active ? 'rgba(191,160,106,0.09)' : 'transparent',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `1px solid ${active ? 'var(--copper)' : 'var(--anthracite-light)'}`,
                  flexShrink: 0,
                }}
              >
                {active && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--copper)',
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--offwhite)',
                  fontFamily: 'var(--font-montserrat)',
                  letterSpacing: '0.04em',
                }}
              >
                {option.label}
              </span>
            </div>
          )
        })}

        {horizon === 'last_n_days' && (
          <div style={{ marginTop: 8, paddingLeft: 8, paddingRight: 8 }}>
            <label
              htmlFor="dispatch-horizon-days"
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
                marginBottom: 6,
              }}
            >
              Days
            </label>
            <input
              id="dispatch-horizon-days"
              type="number"
              min={1}
              max={365}
              value={daysInput}
              onChange={e => setDaysInput(e.target.value)}
              onBlur={handleDaysBlur}
              style={{
                width: 96,
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--offwhite)',
                background: 'var(--anthracite, #1a1a1c)',
                border: '1px solid var(--anthracite-light)',
                borderRadius: 4,
                fontFamily: 'var(--font-montserrat)',
              }}
            />
            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
                whiteSpace: 'normal',
              }}
            >
              Shows bookings from the last N days, plus all upcoming trips.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
