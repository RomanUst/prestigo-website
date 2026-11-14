'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG, VEHICLE_CLASS_KEY, isAirportPlace } from '@/types/booking'
import type { VehicleClass } from '@/types/booking'
import { Check } from 'lucide-react'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'
import StickyBookingPanel from '@/components/booking/StickyBookingPanel'
import VehicleSlideshow from '@/components/booking/VehicleSlideshow'

// Structural key list — display copy lives in Booking.step3vehicle.included.*
const INCLUDED_ITEM_KEYS = [
  'fixedPrice',
  'phoneCharging',
  'freeWaiting',
  'wifi',
  'water',
  'meetGreet',
] as const

function pushVehicleSelect(
  vehicleKey: VehicleClass,
  itemName: string,
  price: number | null,
  currency: string,
  tripCategory: string,
): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  const params = {
    item_list_name: 'Vehicle Selection',
    currency,
    items: [
      {
        item_id: vehicleKey,
        item_name: itemName,
        item_category: tripCategory,
        item_variant: tripCategory,
        price: price ?? 0,
        quantity: 1,
      },
    ],
  }
  if (typeof w.gtag === 'function') {
    w.gtag('event', 'select_item', params)
  } else {
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(['event', 'select_item', params])
    w.dataLayer.push({ event: 'select_item', ...params })
  }
}

export default function Step3Vehicle() {
  const t = useTranslations('Booking.step3vehicle')
  const tClass = useTranslations('Booking.vehicleClasses')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  // D-05: classes that cannot price the chosen waiting (server answer, display only)
  const [waitingUnavailable, setWaitingUnavailable] = useState<VehicleClass[]>([])

  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const tripType = useBookingStore((s) => s.tripType)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const returnTime = useBookingStore((s) => s.returnTime)
  const pickupDate = useBookingStore((s) => s.pickupDate)

  const setPriceBreakdown = useBookingStore((s) => s.setPriceBreakdown)
  const setRoundTripPriceBreakdown = useBookingStore((s) => s.setRoundTripPriceBreakdown)
  const setReturnDiscountPercent = useBookingStore((s) => s.setReturnDiscountPercent)
  const setDistanceKm = useBookingStore((s) => s.setDistanceKm)
  const setDurationMin = useBookingStore((s) => s.setDurationMin)
  const setQuoteMode = useBookingStore((s) => s.setQuoteMode)
  const setVehicleClass = useBookingStore((s) => s.setVehicleClass)

  // Editing the route goes back to step 1 (EntryBar): it is the one form that knows the stops, the landing time of an
  // airport pickup and the return leg. A second editor here changed the pickup without the landing, and the server
  // then refused the checkout (PICKUP_MISMATCH); it also hid the stops the price was computed with.
  function startEditRoute() {
    useBookingStore.getState().prevStep()
  }

  const fetchPrice = useCallback(async () => {
    const s = useBookingStore.getState()
    // STOP-01: forward only stops with a resolved place; null-place stops are
    // filtered out (they cannot reach the Google Routes API safely — T-30-13).
    const intermediates = s.stops
      .filter((stop) => stop.place !== null)
      .map((stop) => ({ lat: stop.place!.lat, lng: stop.place!.lng, waitMinutes: stop.waitMinutes ?? 0 }))
    setLoading(true)
    try {
      const res = await fetch('/api/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: s.origin ? { lat: s.origin.lat, lng: s.origin.lng } : null,
          destination: s.destination ? { lat: s.destination.lat, lng: s.destination.lng } : null,
          tripType: 'transfer',
          hours: s.hours,
          pickupDate: s.pickupDate,
          returnDate: s.returnDate,
          pickupTime: s.pickupTime,
          returnTime: s.returnTime,
          isAirport: !!(isAirportPlace(s.origin) || isAirportPlace(s.destination)),
          intermediates,
        }),
      })
      const data = await res.json()
      // Set before the prices so the default-class effect never sees prices with a stale list.
      const unavailable: VehicleClass[] = Array.isArray(data.waitingUnavailable) ? data.waitingUnavailable : []
      setWaitingUnavailable(unavailable)
      const selected = useBookingStore.getState().vehicleClass
      if (selected && unavailable.includes(selected)) setVehicleClass(null)
      setPriceBreakdown(data.prices)
      setRoundTripPriceBreakdown(data.returnLegPrices ?? null)
      if (data.returnDiscountPercent !== null && data.returnDiscountPercent !== undefined) {
        setReturnDiscountPercent(data.returnDiscountPercent)
      }
      setDistanceKm(data.distanceKm)
      setDurationMin(data.durationMin ?? null)
      setQuoteMode(data.quoteMode)
      setFetchError(false)
    } catch {
      setWaitingUnavailable([])
      setQuoteMode(true)
      setPriceBreakdown(null)
      setRoundTripPriceBreakdown(null)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [setPriceBreakdown, setRoundTripPriceBreakdown, setReturnDiscountPercent, setDistanceKm, setDurationMin, setQuoteMode, setVehicleClass])

  // Initial fetch on mount
  useEffect(() => {
    fetchPrice()
  }, [fetchPrice])

  // Default to Business when no vehicle is selected yet and pricing is loaded.
  // Improves conversion by giving the user a sensible pre-selection — they
  // immediately see a total price in the summary and can advance without an
  // extra click. Round-trip flow is intentionally NOT auto-selected because
  // it requires a return date/time which would lock the user into an extra
  // section before they make a deliberate choice.
  useEffect(() => {
    if (!vehicleClass && priceBreakdown && priceBreakdown.business && !waitingUnavailable.includes('business')) {
      setVehicleClass('business')
    }
  }, [vehicleClass, priceBreakdown, waitingUnavailable, setVehicleClass])

  // Re-fetch when return date+time are both set (to compute returnLegPrices)
  const prevReturnTime = useRef<string | null>(null)
  useEffect(() => {
    if (returnTime && returnTime !== prevReturnTime.current) {
      fetchPrice()
    }
    prevReturnTime.current = returnTime ?? null
  }, [returnTime, fetchPrice])

  const isRoundTrip = tripType === 'round_trip'
  const cards = VEHICLE_CONFIG.map((vc) => {
    const p = priceBreakdown?.[vc.key]
    const rt = roundTripPriceBreakdown?.[vc.key]
    // Round trip: show combined (both legs) as the headline, one way as caption.
    const combined = isRoundTrip && p && rt ? p.base + rt.total : null
    const unavailable = waitingUnavailable.includes(vc.key)
    const card = (
      <VehicleCard
        key={vc.key}
        config={vc}
        isSelected={vehicleClass === vc.key}
        price={p ? `€${p.base}` : null}
        combinedPrice={combined !== null ? `€${combined}` : null}
        onSelect={() => {
          if (unavailable) return
          setVehicleClass(vc.key)
          // Preserve the round-trip selection made on Step 1 — selecting a
          // vehicle must not silently downgrade the booking to one-way.
          pushVehicleSelect(vc.key, tClass(`${VEHICLE_CLASS_KEY[vc.key]}.label`), p?.base ?? null, p?.currency ?? 'EUR', tripType === 'round_trip' ? 'round_trip' : 'transfer')
        }}
      />
    )
    if (!unavailable) return card
    // D-05: this class has no admin rate for paid waiting — shown disabled with the reason.
    return (
      <div key={vc.key} data-testid={`vehicle-card-unavailable-${vc.key}`}>
        <div aria-disabled="true" inert style={{ opacity: 0.45, pointerEvents: 'none' }}>
          {card}
        </div>
        <p
          role="note"
          style={{ margin: '8px 0 0', fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5 }}
        >
          {t('waitingUnavailable')}
        </p>
      </div>
    )
  })

  // "What's included" items — labels/subs sourced from the catalog
  const includedItems = INCLUDED_ITEM_KEYS.map((k) => ({
    label: t(`included.${k}Label`),
    sub: t(`included.${k}Sub`),
  }))

  // Format time helper (12h)
  function fmt12(t: string | null): string {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const isPM = h >= 12
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Abbreviate long address for summary bar
  function shortAddr(addr: string | undefined): string {
    if (!addr) return ''
    // Show up to first comma segment
    return addr.split(',')[0].trim()
  }

  return (
    <div className="theme-light">
      {/* Route summary bar — 4 clickable segments; a click returns to step 1 to edit the trip */}
      {origin && destination && (
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--anthracite-mid)', border: '1px solid var(--anthracite-light)',
          borderRadius: 4, marginBottom: 28, overflow: 'hidden',
        }}>
          <button type="button" onClick={startEditRoute} style={{ flex: 1, minWidth: 0, padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>{t('from')}</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr(origin.address)}</p>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M8.5 1L13 5L8.5 9M1 5h12" stroke="var(--copper)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <button type="button" onClick={startEditRoute} style={{ flex: 1, minWidth: 0, padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>{t('to')}</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr(destination.address)}</p>
          </button>
          <button type="button" onClick={startEditRoute} style={{ padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>{t('date')}</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', whiteSpace: 'nowrap' }}>{pickupDate ? fmtDate(pickupDate) : '—'}</p>
          </button>
          <button type="button" onClick={startEditRoute} style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>{t('time')}</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', whiteSpace: 'nowrap' }}>{pickupTime ? fmt12(pickupTime) : '—'}</p>
          </button>
        </div>
      )}

      {/* Step heading — shown here (below the route bar) instead of BookingWizard */}
      <h2
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontWeight: 300,
          fontSize: 26,
          lineHeight: 1.25,
          color: 'var(--offwhite)',
          marginBottom: 24,
        }}
      >
        {t('heading')}
      </h2>

      {fetchError && (
        <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)', marginBottom: 24 }}>
          {t('pricingUnavailable')}
        </p>
      )}

      {/* Desktop: 2-col grid — left: cards + slideshow; right: StickyBookingPanel (D-09, D-10) */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
        <div>
          {/* Vehicle cards — one per row, horizontal layout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cards}
          </div>

          {/* What's included — shared block, shown before slideshow */}
          <div
            style={{
              marginTop: 40,
              paddingTop: 32,
              borderTop: '1px solid var(--anthracite-light)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'var(--warmgrey)',
                marginBottom: 24,
              }}
            >
              {t('whatsIncluded')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {includedItems.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Check size={13} style={{ color: 'var(--copper)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <div>
                    <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)', marginBottom: 2 }}>
                      {item.label}
                    </p>
                    <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)' }}>
                      {item.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interior/luggage slideshow after inclusions block (D-15) */}
          <VehicleSlideshow activeClass={vehicleClass} />
        </div>
        <StickyBookingPanel />
      </div>

      {/* Mobile: single column. paddingBottom leaves room for the fixed PriceSummary.mobileBar
         (~68px + safe area) so cards aren't hidden behind it at scroll end. */}
      <div className="flex md:hidden flex-col" style={{ gap: 12, paddingBottom: 100 }}>
        {cards}

        {/* What's included — mobile */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 28,
            borderTop: '1px solid var(--anthracite-light)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--warmgrey)',
              marginBottom: 20,
            }}
          >
            {t('whatsIncluded')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {includedItems.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Check size={13} style={{ color: 'var(--copper)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <div>
                  <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)', marginBottom: 2 }}>
                    {item.label}
                  </p>
                  <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)' }}>
                    {item.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interior/luggage slideshow */}
        <VehicleSlideshow activeClass={vehicleClass} />
      </div>

      {/* Return date/time is collected on Step 1 (EntryBar "Add return journey"),
         so no return picker is rendered here — the price summary combines the
         legs automatically when tripType === 'round_trip'. */}

      {/* Mobile fixed bottom bar */}
      <PriceSummary mobileOnly />
    </div>
  )
}
