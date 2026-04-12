'use client'

import { useState } from 'react'

interface Props {
  initialFlags: Record<string, boolean> | null
}

const TOGGLE_ROWS = [
  { key: 'confirmed', label: 'Booking confirmed' },
  { key: 'cancelled', label: 'Booking cancelled' },
  { key: 'driver_assigned', label: 'Driver assigned' },
  { key: 'reminder_24h', label: '24h reminder' },
  { key: 'reminder_2h', label: '2h reminder' },
  { key: 'review_request', label: 'Review request' },
] as const

const DEFAULT_FLAGS: Record<string, boolean> = {
  confirmed: true,
  cancelled: true,
  driver_assigned: true,
  reminder_24h: true,
  reminder_2h: true,
  review_request: true,
}

export default function NotificationToggles({ initialFlags }: Props) {
  const [flags, setFlags] = useState<Record<string, boolean>>(
    () => initialFlags ?? DEFAULT_FLAGS
  )
  const [feedback, setFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({})

  async function handleToggle(key: string) {
    const prev = flags[key]
    const next = !prev

    // Optimistic update
    setFlags(f => ({ ...f, [key]: next }))

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_flags: { ...flags, [key]: next } }),
      })

      if (!res.ok) throw new Error('Save failed')

      setFeedback(f => ({ ...f, [key]: { type: 'success', message: 'Saved' } }))
      setTimeout(() => setFeedback(f => { const copy = { ...f }; delete copy[key]; return copy }), 2000)
    } catch {
      // Revert on error
      setFlags(f => ({ ...f, [key]: prev }))
      setFeedback(f => ({ ...f, [key]: { type: 'error', message: 'Failed to save — try again' } }))
      setTimeout(() => setFeedback(f => { const copy = { ...f }; delete copy[key]; return copy }), 4000)
    }
  }

  return (
    <>
      <style>{`
        .notif-toggle-input:focus-visible + label .notif-toggle-track {
          outline: 2px solid var(--copper);
          outline-offset: 2px;
        }
      `}</style>
      <div style={{ maxWidth: 560 }}>
        <div style={{
          background: 'var(--anthracite-mid, #252528)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: 4,
          padding: 24,
        }}>
          <div style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.4em',
            color: 'var(--warmgrey)',
            marginBottom: 16,
            fontFamily: 'var(--font-montserrat)',
          }}>
            NOTIFICATION TYPES
          </div>

          {TOGGLE_ROWS.map((row, idx) => {
            const checked = flags[row.key] ?? true
            const fb = feedback[row.key]
            const isLast = idx === TOGGLE_ROWS.length - 1

            return (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 44,
                  padding: '12px 0',
                  borderBottom: isLast ? 'none' : '1px solid var(--anthracite-light)',
                }}
              >
                {/* Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--offwhite)',
                      fontFamily: 'var(--font-montserrat)',
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                    }}
                    onClick={() => handleToggle(row.key)}
                  >
                    {row.label}
                  </span>
                  {fb && (
                    <span style={{
                      fontSize: 11,
                      color: fb.type === 'success' ? 'var(--copper-light)' : '#ef4444',
                      letterSpacing: '0.08em',
                      fontFamily: 'var(--font-montserrat)',
                    }}>
                      {fb.message}
                    </span>
                  )}
                </div>

                {/* Toggle switch */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={row.key}
                    checked={checked}
                    onChange={() => handleToggle(row.key)}
                    className="notif-toggle-input"
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                  <label htmlFor={row.key} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {/* Track */}
                    <span
                      className="notif-toggle-track"
                      style={{
                        display: 'inline-block',
                        position: 'relative',
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: checked ? 'var(--copper)' : 'var(--anthracite-light)',
                        transition: 'background 150ms ease',
                      }}
                    >
                      {/* Thumb */}
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: checked ? 22 : 2,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: checked ? 'var(--offwhite)' : 'var(--warmgrey)',
                        transition: 'left 150ms ease',
                      }} />
                    </span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
