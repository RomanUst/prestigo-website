'use client'

import { useId } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import { LANDING_OFFSETS } from '@/lib/airport-pickup'

// Phase 91 (STOP-05, D-07): shown under the landing date / time when the pickup is an airport. The customer picks
// how long after landing the driver should be at the arrivals hall, and sees the resulting pickup. The pickup
// itself is derived by the store (pickupFromLanding), never typed here.

/** '2027-06-11' as a readable date in the page language. The ISO date is a calendar day, so it is formatted in UTC. */
function formatDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
  } catch {
    return iso
  }
}

export default function LandingPickupFields() {
  const t = useTranslations('Booking.landing')
  const locale = useLocale()
  const selectId = useId()
  const landingDate = useBookingStore((s) => s.landingDate)
  const pickupOffsetMin = useBookingStore((s) => s.pickupOffsetMin)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const setPickupOffset = useBookingStore((s) => s.setPickupOffset)

  const showPickup = !!(landingDate && pickupDate && pickupTime)
  // The date is spelled out only when the pickup falls on another day than the landing (after midnight).
  const rollsOver = showPickup && pickupDate !== landingDate

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label
        htmlFor={selectId}
        style={{
          display: 'block',
          fontFamily: 'var(--font-montserrat)',
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '0.28em',
          color: 'var(--warmgrey)',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        {t('offsetLabel')}
      </label>
      <select
        id={selectId}
        value={pickupOffsetMin}
        onChange={(e) => setPickupOffset(Number(e.target.value))}
        style={{
          width: '100%',
          height: 46,
          minWidth: 0,
          padding: '10px 12px',
          fontFamily: 'var(--font-montserrat)',
          fontSize: 14,
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          color: 'var(--offwhite)',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          boxSizing: 'border-box',
        }}
      >
        {LANDING_OFFSETS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes === 0 ? t('offsetAtLanding') : t('offsetMinutes', { minutes })}
          </option>
        ))}
      </select>

      {showPickup && (
        <p
          role="status"
          style={{
            marginTop: 10,
            fontFamily: 'var(--font-montserrat)',
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--offwhite)',
            lineHeight: 1.5,
          }}
        >
          {rollsOver
            ? t('pickupAtDate', { date: formatDay(pickupDate!, locale), time: pickupTime! })
            : t('pickupAt', { time: pickupTime! })}
        </p>
      )}
    </div>
  )
}
