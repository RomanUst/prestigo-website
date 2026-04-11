'use client'

import { useEffect, useState } from 'react'
import { useBookingStore } from '@/lib/booking-store'

// Fallback range used while the fetch is in flight OR if the fetch fails.
// Matches the legacy hardcoded DURATION_OPTIONS so behaviour is preserved when
// /api/hourly-config is unreachable (D-02).
const FALLBACK_MIN = 2
const FALLBACK_MAX = 8

function rangeInclusive(min: number, max: number): number[] {
  const out: number[] = []
  for (let h = min; h <= max; h++) out.push(h)
  return out
}

export default function DurationSelector() {
  const hours = useBookingStore((s) => s.hours)
  const setHours = useBookingStore((s) => s.setHours)

  const [range, setRange] = useState<{ min: number; max: number }>({
    min: FALLBACK_MIN,
    max: FALLBACK_MAX,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchConfig() {
      try {
        const res = await fetch('/api/hourly-config')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { min: number; max: number }
        if (cancelled) return
        if (
          typeof data.min !== 'number' ||
          typeof data.max !== 'number' ||
          data.min >= data.max
        ) {
          // Malformed response — keep fallback.
          setLoading(false)
          return
        }
        setRange({ min: data.min, max: data.max })
        setLoading(false)

        // D-04: clamp out-of-range store value to min so price calculation always
        // uses a value within the configured range. Read fresh state via getState()
        // to avoid stale closure on the selector-derived `hours`.
        const current = useBookingStore.getState().hours
        if (current < data.min || current > data.max) {
          setHours(data.min)
        }
      } catch {
        // Network / JSON error — keep fallback range. Do NOT clamp store.hours
        // because the user's stored value is still valid under the fallback.
        if (!cancelled) setLoading(false)
      }
    }

    fetchConfig()
    return () => {
      cancelled = true
    }
  }, [setHours])

  const options = rangeInclusive(range.min, range.max)

  return (
    <div>
      <p className="label" style={{ marginBottom: '8px' }}>
        DURATION
      </p>

      <select
        aria-label="Duration"
        value={hours}
        disabled={loading}
        onChange={(e) => setHours(Number(e.target.value))}
        style={{
          width: '100%',
          minHeight: '44px',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          background: 'var(--anthracite)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '2px',
          color: 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '13px',
          letterSpacing: '0.05em',
          padding: '10px 14px',
          cursor: loading ? 'wait' : 'pointer',
          outline: 'none',
          opacity: loading ? 0.5 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {options.map((h) => (
          <option key={h} value={h}>
            {h}h
          </option>
        ))}
      </select>
    </div>
  )
}
