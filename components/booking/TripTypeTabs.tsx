'use client'

import { useBookingStore } from '@/lib/booking-store'
import type { TripType } from '@/types/booking'

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'transfer', label: 'TRANSFER' },
  { value: 'hourly', label: 'HOURLY' },
  { value: 'daily', label: 'DAILY' },
]

export default function TripTypeTabs() {
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)

  return (
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
        const isActive = tripType === tab.value || (tab.value === 'transfer' && tripType === 'round_trip')

        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => setTripType(tab.value)}
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
              cursor: 'pointer',
              transition: 'color 0.2s ease, border-color 0.2s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--offwhite)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--warmgrey)'
              }
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
