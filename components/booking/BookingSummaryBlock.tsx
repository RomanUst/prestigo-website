'use client'

import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG, computeExtrasTotal } from '@/lib/extras'
import { eurToCzk, formatCZK, formatEUR } from '@/lib/currency'
import type { Extras } from '@/types/booking'

const vehicleLabels: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

interface Props {
  selectedCurrency?: 'eur' | 'czk'
}

export default function BookingSummaryBlock({ selectedCurrency = 'eur' }: Props) {
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const passengers = useBookingStore((s) => s.passengers)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const extras = useBookingStore((s) => s.extras)

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)
  const totalEur = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const totalCzk = eurToCzk(totalEur)

  const routeText =
    tripType === 'hourly'
      ? `${hours} hours`
      : origin && destination
      ? `${origin.address} \u2192 ${destination.address}`
      : origin
      ? origin.address
      : '\u2014'

  const selectedExtras = EXTRAS_CONFIG.filter(({ key }) => extras[key as keyof Extras])

  const primaryAmount = selectedCurrency === 'czk'
    ? (totalCzk > 0 ? formatCZK(totalCzk) : '\u2014')
    : (totalEur > 0 ? formatEUR(totalEur) : '\u2014')

  const secondaryAmount = selectedCurrency === 'czk'
    ? (totalEur > 0 ? formatEUR(totalEur) : '')
    : (totalCzk > 0 ? formatCZK(totalCzk) : '')

  return (
    <div
      style={{
        background: 'var(--anthracite-mid)',
        borderRadius: 4,
        padding: 24,
      }}
    >
      {/* YOUR JOURNEY label */}
      <span className="label" style={{ display: 'block', marginBottom: 12 }}>
        YOUR JOURNEY
      </span>

      {/* Route */}
      <p
        style={{
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {routeText}
      </p>

      {/* Date + time */}
      <p
        style={{
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {pickupDate && pickupTime ? `${pickupDate} at ${pickupTime}` : '\u2014'}
      </p>

      {/* Vehicle class + passenger count */}
      <p
        style={{
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: selectedExtras.length > 0 ? 8 : 0,
          lineHeight: 1.5,
        }}
      >
        {vehicleClass ? `${vehicleLabels[vehicleClass]} \u00B7 ${passengers} passenger${passengers !== 1 ? 's' : ''}` : '\u2014'}
      </p>

      {/* Extras list */}
      {selectedExtras.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {selectedExtras.map(({ key, label, price }) => (
            <p
              key={key}
              style={{
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
                lineHeight: 1.5,
              }}
            >
              {label} +{formatEUR(price)}
            </p>
          ))}
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          borderTop: '1px solid var(--anthracite-light)',
          margin: '16px 0',
        }}
      />

      {/* Primary total */}
      <p
        style={{
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 4,
        }}
      >
        {primaryAmount}
      </p>

      {/* Secondary total */}
      {secondaryAmount && (
        <p
          style={{
            fontSize: 14,
            fontWeight: 300,
            color: 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          {secondaryAmount}
        </p>
      )}
    </div>
  )
}
