'use client'

import { useBookingStore } from '@/lib/booking-store'
import { EXTRAS_CONFIG, computeExtrasTotal } from '@/lib/extras'
import { eurToCzk, formatCZK } from '@/lib/currency'
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
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const nextStep = useBookingStore((s) => s.nextStep)
  const extras = useBookingStore((s) => s.extras)
  const currentStep = useBookingStore((s) => s.currentStep)

  // Hide PriceSummary entirely at Step 6 (payment page has its own summary)
  if (currentStep === 6) return null

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

  const totalEur = selectedPrice ? selectedPrice.base + extrasTotal : 0

  const isRoundTripMode = tripType === 'round_trip'
  const selectedReturnLegPrice = vehicleClass && roundTripPriceBreakdown ? roundTripPriceBreakdown[vehicleClass] : null
  const outboundWithExtras = totalEur
  const combinedTotal = isRoundTripMode && selectedPrice && selectedReturnLegPrice
    ? outboundWithExtras + selectedReturnLegPrice.total
    : null

  const priceDisplay = () => {
    if (!vehicleClass) return 'Select a vehicle'
    if (quoteMode) return 'Request a quote'
    if (!selectedPrice) return 'Select a vehicle'
    if (isRoundTripMode && combinedTotal !== null) return `\u20AC${combinedTotal}`
    return `\u20AC${totalEur}`
  }

  const czkDisplay = () => {
    if (!vehicleClass || quoteMode || !selectedPrice) return null
    if (isRoundTripMode && combinedTotal !== null) return formatCZK(eurToCzk(combinedTotal))
    return formatCZK(eurToCzk(totalEur))
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

      {/* Round-trip three-line breakdown or single price */}
      {isRoundTripMode && combinedTotal !== null && !quoteMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Outbound line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>Outbound</span>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 14, color: 'var(--offwhite)' }}>&euro;{outboundWithExtras}</span>
          </div>
          {/* Return leg line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>
              Return leg <span style={{ color: 'var(--copper)', letterSpacing: '0.1em', marginLeft: 4 }}>&minus;{returnDiscountPercent}%</span>
            </span>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 14, color: 'var(--offwhite)' }}>&euro;{selectedReturnLegPrice!.total}</span>
          </div>
          {/* Combined total line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--anthracite-light)' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--copper)' }}>Combined</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 20, color: 'var(--offwhite)' }}>&euro;{combinedTotal}</span>
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 300, color: 'var(--warmgrey)', marginTop: 2 }}>{formatCZK(eurToCzk(combinedTotal))}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Price with cross-fade */}
          <span
            key={`${vehicleClass ?? 'none'}-${extrasTotal}`}
            style={{
              display: 'block',
              animation: 'fadeIn 0.15s ease forwards',
              fontSize: isQuoteOrNoPrice ? 13 : 20,
              fontWeight: 400,
              color: isQuoteOrNoPrice ? 'var(--warmgrey)' : 'var(--offwhite)',
              fontFamily: 'var(--font-montserrat)',
            }}
          >
            {priceDisplay()}
          </span>
          {czkDisplay() && (
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
                marginTop: 2,
              }}
            >
              {czkDisplay()}
            </span>
          )}
        </>
      )}
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
        minHeight: 68,
        background: 'var(--anthracite-mid)',
        borderTop: '1px solid var(--copper)',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.5)',
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom)) 16px',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 60,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          key={`${vehicleClass ?? 'none'}-${extrasTotal}`}
          style={{
            animation: 'fadeIn 0.15s ease forwards',
            fontSize: isQuoteOrNoPrice ? 13 : 20,
            fontWeight: 400,
            color: isQuoteOrNoPrice ? 'var(--warmgrey)' : 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          {priceDisplay()}
        </span>
        {czkDisplay() && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
            }}
          >
            {czkDisplay()}
          </span>
        )}
      </div>

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
