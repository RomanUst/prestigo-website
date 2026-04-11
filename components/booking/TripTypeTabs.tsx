'use client'

import { useRouter } from 'next/navigation'
import { useBookingStore } from '@/lib/booking-store'
import type { TripType } from '@/types/booking'

type TripTabEntry =
  | { kind: 'store'; value: TripType; label: string }
  | { kind: 'navigate'; href: string; label: string }

const TRIP_TYPES: TripTabEntry[] = [
  { kind: 'store', value: 'transfer', label: 'TRANSFER' },
  { kind: 'store', value: 'hourly', label: 'HOURLY' },
  { kind: 'navigate', href: '/book/multi-day', label: 'MULTI-DAY' },
]

export default function TripTypeTabs() {
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)
  const router = useRouter()

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
        const isActive =
          tab.kind === 'store' &&
          (tripType === tab.value || (tab.value === 'transfer' && tripType === 'round_trip'))

        const handleClick = () => {
          if (tab.kind === 'navigate') {
            router.push(tab.href)
          } else {
            setTripType(tab.value)
          }
        }

        return (
          <button
            key={tab.kind === 'store' ? tab.value : tab.href}
            role="tab"
            aria-selected={isActive}
            onClick={handleClick}
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 400,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              padding: '16px 20px',
              minHeight: '48px',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--copper-light)' : '2px solid transparent',
              background: 'transparent',
              color: isActive ? 'var(--copper-light)' : 'var(--warmgrey)',
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
