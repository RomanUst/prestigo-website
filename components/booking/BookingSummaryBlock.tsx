'use client'

import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG, computeExtrasTotal } from '@/lib/extras'
import { czkToEur, formatCZK, formatEUR } from '@/lib/currency'
import type { Extras } from '@/types/booking'

const vehicleLabels: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

export default function BookingSummaryBlock() {
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
  const totalAmount = selectedPrice ? selectedPrice.base + extrasTotal : 0

  const routeText =
    tripType === 'hourly'
      ? `${hours} hours`
      : origin && destination
      ? `${origin.address} \u2192 ${destination.address}`
      : origin
      ? origin.address
      : '\u2014'

  const selectedExtras = EXTRAS_CONFIG.filter(({ key }) => extras[key as keyof Extras])

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
              {label} +CZK {price}
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

      {/* Total in CZK */}
      <p
        style={{
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 4,
        }}
      >
        {totalAmount > 0 ? formatCZK(totalAmount) : '\u2014'}
      </p>

      {/* EUR equivalent */}
      <p
        style={{
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {totalAmount > 0 ? `(${formatEUR(czkToEur(totalAmount))})` : ''}
      </p>
    </div>
  )
}
