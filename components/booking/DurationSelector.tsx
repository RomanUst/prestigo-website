'use client'

import { useBookingStore } from '@/lib/booking-store'

const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8, 12]

export default function DurationSelector() {
  const hours = useBookingStore((s) => s.hours)
  const setHours = useBookingStore((s) => s.setHours)

  return (
    <div>
      <p className="label" style={{ marginBottom: '8px' }}>
        DURATION
      </p>

      <div
        style={{
          display: 'flex',
          border: '1px solid var(--anthracite-light)',
          width: '100%',
        }}
      >
        {DURATION_OPTIONS.map((h, index) => {
          const isActive = hours === h
          const isLast = index === DURATION_OPTIONS.length - 1

          return (
            <button
              key={h}
              type="button"
              aria-pressed={isActive}
              aria-label={`${h} hours`}
              onClick={() => setHours(h)}
              style={{
                flex: 1,
                minHeight: '44px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '9px',
                fontWeight: 400,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                border: 'none',
                borderRight: isLast ? 'none' : '1px solid var(--anthracite-light)',
                borderBottom: isActive ? '2px solid var(--copper)' : 'none',
                background: isActive ? 'var(--anthracite)' : 'var(--anthracite-mid)',
                color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
                cursor: 'pointer',
                transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
              }}
            >
              {h}h
            </button>
          )
        })}
      </div>
    </div>
  )
}
