'use client'

import { useBookingStore } from '@/lib/booking-store'
import { trackMetaEvent } from '@/components/MetaPixel'
import { computeExtrasTotal } from '@/lib/extras'
import RouteMap from '@/components/booking/RouteMap'
import { estimateTravelMinutes } from '@/lib/travel-time'

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
    w.dataLayer.push({ event: eventName, ...params })
  }
}

// ---------------------------------------------------------------------------
// StickyBookingPanel — desktop-only sticky right panel (D-09, D-10)
// Relocated begin_checkout + InitiateCheckout trigger (TRACK-02)
// ---------------------------------------------------------------------------
function fmt24to12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const isPM = h >= 12
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
}

function estDropoff(pickupTime: string, distanceKm: number | null, durationMin: number | null): string | null {
  // Prefer Google's real drive time; fall back to the distance-based estimate.
  const min = durationMin ?? estimateTravelMinutes(distanceKm)
  if (min === null) return null
  const [h, m] = pickupTime.split(':').map(Number)
  const total = h * 60 + m + min
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return fmt24to12(`${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`)
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function StickyBookingPanel() {
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const extras = useBookingStore((s) => s.extras)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const distanceKm = useBookingStore((s) => s.distanceKm)
  const durationMin = useBookingStore((s) => s.durationMin)
  const tripType = useBookingStore((s) => s.tripType)

  // Compute price display
  const selectedPrice = vehicleClass && priceBreakdown ? priceBreakdown[vehicleClass] : null
  const priceDisplay = selectedPrice
    ? `€${selectedPrice.base}`
    : null

  // Round-trip combined total (mirrors PriceSummary). Return leg comes from
  // roundTripPriceBreakdown; when present, the panel shows a two-leg breakdown
  // instead of the one-way price.
  const extrasTotal = computeExtrasTotal(extras)
  const isRoundTripMode = tripType === 'round_trip'
  const selectedReturnLegPrice =
    vehicleClass && roundTripPriceBreakdown ? roundTripPriceBreakdown[vehicleClass] : null
  const outboundWithExtras = selectedPrice ? selectedPrice.base + extrasTotal : 0
  const combinedTotal =
    isRoundTripMode && selectedPrice && selectedReturnLegPrice
      ? outboundWithExtras + selectedReturnLegPrice.total
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
    // Include the return leg for round trips so analytics value matches the charge.
    const returnLeg =
      s.tripType === 'round_trip' && s.roundTripPriceBreakdown
        ? s.roundTripPriceBreakdown[currentVehicleClass]
        : null
    const baseTotal =
      (selectedBreakdown ? selectedBreakdown.base + extrasTotal : 0) + (returnLeg ? returnLeg.total : 0)
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
    // Desktop only — hidden on mobile (D-10). Mobile CTA is rendered in Step3Vehicle.tsx.
    <div
      className="hidden md:block sticky"
      style={{
        top: 24,
        width: 320,
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
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
      />

      {/* Pickup / dropoff time row */}
      {pickupTime && pickupDate && (
        <>
          <div style={{ height: 1, background: 'var(--anthracite-light)', margin: '16px 0' }} />
          <div style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>Pick up</span>
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)' }}>{fmt24to12(pickupTime)}</span>
            </div>
            {estDropoff(pickupTime, distanceKm, durationMin) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>Est. drop-off</span>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)' }}>{estDropoff(pickupTime, distanceKm, durationMin)}</span>
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 10, color: 'var(--warmgrey)' }}>{fmtDate(pickupDate)}</span>
            </div>
          </div>
        </>
      )}

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

      {/* Price — round-trip two-leg breakdown or one-way single price */}
      {isRoundTripMode && combinedTotal !== null && selectedReturnLegPrice ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>Outbound</span>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, color: 'var(--offwhite)' }}>&euro;{outboundWithExtras}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>
              Return <span style={{ color: 'var(--copper)', letterSpacing: '0.08em', marginLeft: 4 }}>&minus;{returnDiscountPercent}%</span>
            </span>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, color: 'var(--offwhite)' }}>&euro;{selectedReturnLegPrice.total}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: '1px solid var(--anthracite-light)' }}>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--copper)' }}>Combined</span>
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 20, fontWeight: 600, color: 'var(--copper)' }}>&euro;{combinedTotal}</span>
          </div>
          <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 400, color: 'var(--warmgrey)', marginTop: 8 }}>
            Both legs · all fees included
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}

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
