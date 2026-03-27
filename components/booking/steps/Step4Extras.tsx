'use client'

import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG } from '@/lib/extras'
import type { Extras } from '@/types/booking'

export default function Step4Extras() {
  const extras = useBookingStore((s) => s.extras)
  const toggleExtra = useBookingStore((s) => s.toggleExtra)

  const noneSelected = !extras.childSeat && !extras.meetAndGreet && !extras.extraLuggage

  return (
    <div className="max-w-xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {EXTRAS_CONFIG.map(({ key, label, description, price }) => {
          const isSelected = extras[key as keyof Extras]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleExtra(key as keyof Extras)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: 24,
                background: 'var(--anthracite-mid)',
                border: '1px solid var(--anthracite-light)',
                borderRadius: 4,
                outline: isSelected ? '2px solid var(--copper)' : 'none',
                outlineOffset: isSelected ? -2 : undefined,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'outline-color 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--offwhite)',
                    fontFamily: 'var(--font-montserrat)',
                    lineHeight: 1.8,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--warmgrey)',
                    fontFamily: 'var(--font-montserrat)',
                    lineHeight: 1.8,
                  }}
                >
                  +&euro;{price}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 400,
                  color: 'var(--warmgrey)',
                  fontFamily: 'var(--font-montserrat)',
                }}
              >
                {description}
              </span>
            </button>
          )
        })}
      </div>

      {noneSelected && (
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          No extras selected. Continue to passenger details.
        </p>
      )}
    </div>
  )
}
