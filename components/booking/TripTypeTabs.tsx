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

interface TripTypeTabsProps {
  hideMultiDay?: boolean
}

export default function TripTypeTabs({ hideMultiDay = false }: TripTypeTabsProps) {
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)
  const router = useRouter()

  const tabs = hideMultiDay ? TRIP_TYPES.filter((t) => t.kind === 'store') : TRIP_TYPES

  return (
    <div
      role="tablist"
      aria-label="Trip type"
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        paddingBottom: '4px',
      }}
      className="[&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
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
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              padding: '10px 18px',
              minHeight: '44px',
              borderRadius: '999px',
              border: isActive ? '1px solid var(--offwhite)' : '1px solid var(--anthracite-light)',
              background: isActive ? 'var(--offwhite)' : 'transparent',
              color: isActive ? 'var(--anthracite)' : 'var(--warmgrey)',
              cursor: 'pointer',
              transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
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
