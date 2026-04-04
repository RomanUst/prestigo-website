'use client'

import { useBookingStore } from '@/lib/booking-store'
import type { TripType } from '@/types/booking'

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'transfer', label: 'TRANSFER' },
  { value: 'hourly', label: 'HOURLY' },
  { value: 'daily', label: 'DAILY' },
  { value: 'round_trip', label: 'ROUND TRIP' },
]

export default function TripTypeTabs() {
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)
  const quoteMode = useBookingStore((s) => s.quoteMode)

  return (
    <div>
      <div
        role="tablist"
        aria-label="Trip type"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'var(--anthracite)',
          borderBottom: '1px solid var(--anthracite-light)',
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        {TRIP_TYPES.map((tab) => {
          const isActive = tripType === tab.value
          const isRoundTripDisabled = tab.value === 'round_trip' && quoteMode

          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              aria-disabled={isRoundTripDisabled ? 'true' : undefined}
              onClick={() => {
                if (isRoundTripDisabled) return
                setTripType(tab.value)
              }}
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '9px',
                fontWeight: 400,
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                padding: '12px 16px',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--copper)' : '2px solid transparent',
                background: 'transparent',
                color: isActive ? 'var(--copper)' : 'var(--warmgrey)',
                cursor: isRoundTripDisabled ? 'not-allowed' : 'pointer',
                opacity: isRoundTripDisabled ? 0.4 : 1,
                transition: 'color 0.2s ease, border-color 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isRoundTripDisabled) {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--offwhite)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isRoundTripDisabled) {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--warmgrey)'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Inline message when quoteMode and round_trip is active */}
      {quoteMode && tripType === 'round_trip' && (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: 12,
            fontWeight: 400,
            color: 'var(--warmgrey)',
            padding: '8px 16px',
            backgroundColor: 'var(--anthracite)',
            borderBottom: '1px solid var(--anthracite-light)',
          }}
        >
          Round trip is unavailable outside our coverage zone. Please request a quote.
        </p>
      )}
    </div>
  )
}
