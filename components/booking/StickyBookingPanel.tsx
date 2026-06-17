'use client'

import { useBookingStore } from '@/lib/booking-store'
import { trackMetaEvent } from '@/components/MetaPixel'
import { computeExtrasTotal } from '@/lib/extras'
import RouteMap from '@/components/booking/RouteMap'

// ---------------------------------------------------------------------------
// Vehicle class labels for CTA copy
// ---------------------------------------------------------------------------
const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

// ---------------------------------------------------------------------------
// GA4 push helper — mirrors BookingWizard.tsx pattern
// ---------------------------------------------------------------------------
function pushGA4Event(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  if (typeof w.gtag === 'function') {
    w.gtag('event', eventName, params)
  } else {
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(['event', eventName, params])
    w.dataLayer.push({ event: eventName, ...params })
  }
}

// ---------------------------------------------------------------------------
// StickyBookingPanel — desktop-only sticky right panel (D-09, D-10)
// Relocated begin_checkout + InitiateCheckout trigger (TRACK-02)
// ---------------------------------------------------------------------------
export default function StickyBookingPanel() {
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const distanceKm = useBookingStore((s) => s.distanceKm)
  const tripType = useBookingStore((s) => s.tripType)

  // Compute price display
  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const priceDisplay = selectedPrice
    ? `€${selectedPrice.base}`
    : null

  // CTA label
  const ctaLabel = vehicleClass
    ? `SELECT ${VEHICLE_LABELS[vehicleClass]?.toUpperCase() ?? vehicleClass.toUpperCase()}`
    : 'SELECT A CLASS'

  // Aria label for CTA including price
  const ctaAriaLabel = vehicleClass && selectedPrice
    ? `Select ${VEHICLE_LABELS[vehicleClass] ?? vehicleClass} class — €${selectedPrice.base}`
    : ctaLabel

  // ---------------------------------------------------------------------------
  // handleSelectClass — fires analytics then advances the wizard (TRACK-02)
  // Uses getState() for fresh reads inside the handler (stale-closure pattern)
  // ---------------------------------------------------------------------------
  function handleSelectClass() {
    if (!vehicleClass) return

    const s = useBookingStore.getState()
    const currentVehicleClass = s.vehicleClass
    if (!currentVehicleClass) return

    const breakdown = s.priceBreakdown
    const selectedBreakdown = breakdown ? breakdown[currentVehicleClass] : null
    const extrasTotal = computeExtrasTotal(s.extras)
    const baseTotal = selectedBreakdown ? selectedBreakdown.base + extrasTotal : 0
    const totalEur =
      s.promoDiscount > 0
        ? Math.round(baseTotal * (1 - s.promoDiscount / 100))
        : baseTotal
    const currency = selectedBreakdown?.currency ?? 'EUR'

    const items = [
      {
        item_id: currentVehicleClass,
        item_name: VEHICLE_LABELS[currentVehicleClass] ?? currentVehicleClass,
        item_category: s.tripType ?? 'transfer',
        item_variant: s.tripType ?? 'transfer',
        price: totalEur,
        quantity: 1,
      },
    ]

    // GA4 begin_checkout
    pushGA4Event('begin_checkout', { currency, value: totalEur, items })

    // Meta Pixel InitiateCheckout (TRACK-02 — relocated from BookingWizard)
    trackMetaEvent('InitiateCheckout', { value: totalEur, currency, num_items: 1 })

    // Advance the wizard
    useBookingStore.getState().nextStep()
  }

  return (
    // Desktop only — hidden on mobile (D-10)
    <div
      className="hidden md:block sticky"
      style={{
        top: 24,
        width: 320,
        background: 'var(--anthracite-mid)',
        border: '1px solid var(--anthracite-light)',
        padding: 24,
        alignSelf: 'flex-start',
      }}
    >
      {/* Animated route map (top of panel) */}
      <RouteMap
        origin={origin}
        destination={destination}
        pickupTime={pickupTime}
        distanceKm={distanceKm}
      />

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'var(--anthracite-light)',
          margin: '16px 0',
        }}
      />

      {/* Selected class name */}
      <p
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 400,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--offwhite)',
          marginBottom: 8,
        }}
      >
        {vehicleClass ? VEHICLE_LABELS[vehicleClass] ?? vehicleClass : 'No class selected'}
      </p>

      {/* Price */}
      {priceDisplay && (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--copper)',
            marginBottom: 4,
          }}
        >
          {priceDisplay}
        </p>
      )}

      {/* "All fees included" note */}
      <p
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 400,
          color: 'var(--warmgrey)',
          marginBottom: 16,
        }}
      >
        All fees included
      </p>

      {/* Select CTA */}
      <button
        type="button"
        className="btn-primary"
        onClick={handleSelectClass}
        disabled={!vehicleClass}
        aria-label={ctaAriaLabel}
        aria-disabled={!vehicleClass ? 'true' : undefined}
        style={{
          width: '100%',
          opacity: vehicleClass ? 1 : 0.4,
          cursor: vehicleClass ? 'pointer' : 'not-allowed',
          letterSpacing: '0.1em',
        }}
      >
        {ctaLabel}
      </button>

      {/* Hidden accessibility text for trip type context */}
      {vehicleClass && tripType && (
        <p className="sr-only">
          {VEHICLE_LABELS[vehicleClass] ?? vehicleClass} — {tripType} transfer
        </p>
      )}
    </div>
  )
}
