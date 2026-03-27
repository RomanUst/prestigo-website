'use client'

import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG, computeExtrasTotal } from '@/lib/extras'
import type { Extras } from '@/types/booking'

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

export default function PriceSummary({ mobileOnly = false, desktopOnly = false }: { mobileOnly?: boolean; desktopOnly?: boolean }) {
  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const nextStep = useBookingStore((s) => s.nextStep)
  const extras = useBookingStore((s) => s.extras)
  const currentStep = useBookingStore((s) => s.currentStep)

  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const extrasTotal = computeExtrasTotal(extras)

  const vehicleLabels: Record<string, string> = {
    business: 'Business',
    first_class: 'First Class',
    business_van: 'Business Van',
  }

  const routeText =
    tripType === 'hourly'
      ? `${hours} hours`
      : origin && destination
      ? `${truncate(origin.address, 28)} \u2192 ${truncate(destination.address, 28)}`
      : origin
      ? truncate(origin.address, 28)
      : '\u2014'

  const priceDisplay = () => {
    if (!vehicleClass) return '\u2014'
    if (quoteMode) return 'Request a quote'
    if (!selectedPrice) return '\u2014'
    const displayTotal = selectedPrice.base + extrasTotal
    return `\u20AC${displayTotal}`
  }

  const isQuoteOrNoPrice = !vehicleClass || quoteMode || !selectedPrice

  // Desktop sticky panel
  const desktopPanel = (
    <div
      className="hidden md:block"
      style={{
        position: 'sticky',
        top: 24,
        background: 'var(--anthracite-mid)',
        border: '1px solid var(--anthracite-light)',
        borderRadius: 4,
        padding: 24,
      }}
    >
      {/* YOUR JOURNEY label */}
      <span className="label" style={{ display: 'block', marginBottom: 12 }}>
        Your Journey
      </span>

      {/* Route text */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: 'var(--warmgrey)',
          lineHeight: 1.8,
          marginBottom: 16,
        }}
      >
        {routeText}
      </p>

      {/* Divider */}
      <div
        style={{
          borderTop: '1px solid var(--anthracite-light)',
          margin: '0 0 16px 0',
        }}
      />

      {/* Vehicle class name */}
      <span
        className="label"
        style={{
          display: 'block',
          marginBottom: 8,
          color: vehicleClass ? 'var(--offwhite)' : 'var(--warmgrey)',
        }}
      >
        {vehicleClass ? vehicleLabels[vehicleClass] : '\u2014'}
      </span>

      {/* Extras breakdown */}
      {extrasTotal > 0 && (
        <div style={{ marginBottom: 12 }}>
          {EXTRAS_CONFIG.map(({ key, label, price }) =>
            extras[key as keyof Extras] ? (
              <p key={key} style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.8 }}>
                {label} +&euro;{price}
              </p>
            ) : null
          )}
        </div>
      )}

      {/* Price with cross-fade */}
      <span
        key={`${vehicleClass ?? 'none'}-${extrasTotal}`}
        style={{
          display: 'block',
          animation: 'fadeIn 0.15s ease forwards',
          fontSize: isQuoteOrNoPrice ? 13 : 20,
          fontWeight: isQuoteOrNoPrice ? 400 : 400,
          color: isQuoteOrNoPrice ? 'var(--warmgrey)' : 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {priceDisplay()}
      </span>
    </div>
  )

  // Mobile fixed bottom bar
  const mobileBar = (
    <div
      className="flex md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        background: 'var(--anthracite-mid)',
        borderTop: '1px solid var(--anthracite-light)',
        padding: '0 16px',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 50,
      }}
    >
      <span
        key={`${vehicleClass ?? 'none'}-${extrasTotal}`}
        style={{
          animation: 'fadeIn 0.15s ease forwards',
          fontSize: isQuoteOrNoPrice ? 13 : 20,
          fontWeight: isQuoteOrNoPrice ? 400 : 400,
          color: isQuoteOrNoPrice ? 'var(--warmgrey)' : 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {priceDisplay()}
      </span>

      {currentStep === 3 && (
        <button
          type="button"
          className="btn-primary"
          onClick={nextStep}
          disabled={!vehicleClass}
          style={!vehicleClass ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          Continue
        </button>
      )}
    </div>
  )

  return (
    <>
      {!mobileOnly && desktopPanel}
      {!desktopOnly && mobileBar}
    </>
  )
}
