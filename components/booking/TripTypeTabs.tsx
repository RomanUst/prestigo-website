'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import type { TripType } from '@/types/booking'

type TripTabEntry =
  | { kind: 'store'; value: TripType }
  | { kind: 'navigate'; href: string }

// Structural array keeps only non-translatable routing data. Tab labels come
// from the catalog (Booking.tripTypeTabs.items), index-paired with this array
// (Nav NAV_LINKS/items split — Pattern B).
const TRIP_TYPES: TripTabEntry[] = [
  { kind: 'store', value: 'transfer' },
  { kind: 'store', value: 'hourly' },
  { kind: 'navigate', href: '/book/multi-day' },
]

interface TripTypeTabsProps {
  hideMultiDay?: boolean
}

export default function TripTypeTabs({ hideMultiDay = false }: TripTypeTabsProps) {
  const t = useTranslations('Booking.tripTypeTabs')
  const labels = t.raw('items') as string[]
  const tripType = useBookingStore((s) => s.tripType)
  const setTripType = useBookingStore((s) => s.setTripType)
  const router = useRouter()

  return (
    <div
      role="tablist"
      aria-label={t('ariaLabel')}
      style={{
        display: 'flex',
        // Wrap instead of a hidden-scrollbar horizontal scroller: ru/es/fr
        // labels don't fit one row on phones and the cut-off last tab gave
        // no hint that the row could be scrolled.
        flexWrap: 'wrap',
        gap: '8px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        paddingBottom: '4px',
      }}
    >
      {TRIP_TYPES.map((tab, i) => {
        if (hideMultiDay && tab.kind !== 'store') return null

        const label = labels[i]
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
            {label}
          </button>
        )
      })}
    </div>
  )
}
