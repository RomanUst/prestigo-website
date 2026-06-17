'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG, isAirportPlace } from '@/types/booking'
import type { VehicleClass } from '@/types/booking'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'
import StickyBookingPanel from '@/components/booking/StickyBookingPanel'
import VehicleSlideshow from '@/components/booking/VehicleSlideshow'

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

function pushVehicleSelect(
  vehicleKey: VehicleClass,
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
        item_name: VEHICLE_LABELS[vehicleKey] ?? vehicleKey,
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

const TIME_SLOTS: string[] = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i / 12).toString().padStart(2, '0')
  const m = ((i % 12) * 5).toString().padStart(2, '0')
  return `${h}:${m}`
})

const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 13, fontWeight: 400, fontFamily: 'var(--font-montserrat)' },
  weekday: { color: 'var(--warmgrey)', fontSize: 13, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 44, height: 44 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  button_previous: { color: 'var(--warmgrey)', border: '1px solid var(--anthracite-light)', background: 'transparent', cursor: 'pointer' },
  button_next: { color: 'var(--warmgrey)', border: '1px solid var(--anthracite-light)', background: 'transparent', cursor: 'pointer' },
}

const modifiersStyles = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
}

export default function Step3Vehicle() {
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const tripType = useBookingStore((s) => s.tripType)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const pickupDate = useBookingStore((s) => s.pickupDate)

  const setPriceBreakdown = useBookingStore((s) => s.setPriceBreakdown)
  const setRoundTripPriceBreakdown = useBookingStore((s) => s.setRoundTripPriceBreakdown)
  const setReturnDiscountPercent = useBookingStore((s) => s.setReturnDiscountPercent)
  const setDistanceKm = useBookingStore((s) => s.setDistanceKm)
  const setQuoteMode = useBookingStore((s) => s.setQuoteMode)
  const setVehicleClass = useBookingStore((s) => s.setVehicleClass)
  const setTripType = useBookingStore((s) => s.setTripType)
  const setReturnDate = useBookingStore((s) => s.setReturnDate)
  const setReturnTime = useBookingStore((s) => s.setReturnTime)

  const isRoundTrip = tripType === 'round_trip'

  const fetchPrice = useCallback(async () => {
    const s = useBookingStore.getState()
    // STOP-01: forward only stops with a resolved place; null-place stops are
    // filtered out (they cannot reach the Google Routes API safely — T-30-13).
    const intermediates = s.stops
      .filter((stop) => stop.place !== null)
      .map((stop) => ({ lat: stop.place!.lat, lng: stop.place!.lng }))
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
      setPriceBreakdown(data.prices)
      setRoundTripPriceBreakdown(data.returnLegPrices ?? null)
      if (data.returnDiscountPercent !== null && data.returnDiscountPercent !== undefined) {
        setReturnDiscountPercent(data.returnDiscountPercent)
      }
      setDistanceKm(data.distanceKm)
      setQuoteMode(data.quoteMode)
      setFetchError(false)
    } catch {
      setQuoteMode(true)
      setPriceBreakdown(null)
      setRoundTripPriceBreakdown(null)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [setPriceBreakdown, setRoundTripPriceBreakdown, setReturnDiscountPercent, setDistanceKm, setQuoteMode])

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
    if (!vehicleClass && priceBreakdown && priceBreakdown.business) {
      setVehicleClass('business')
    }
  }, [vehicleClass, priceBreakdown, setVehicleClass])

  // Re-fetch when return date+time are both set (to compute returnLegPrices)
  const prevReturnTime = useRef<string | null>(null)
  useEffect(() => {
    if (returnTime && returnTime !== prevReturnTime.current) {
      fetchPrice()
    }
    prevReturnTime.current = returnTime ?? null
  }, [returnTime, fetchPrice])

  // Min return date = pickup date (same day return allowed)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const returnDateMin = pickupDate ? new Date(pickupDate + 'T00:00:00') : today
  const returnDateObj = returnDate ? new Date(returnDate + 'T00:00:00') : undefined

  function handleReturnDateSelect(date: Date | undefined) {
    if (date) {
      const iso =
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}-` +
        `${String(date.getDate()).padStart(2, '0')}`
      setReturnDate(iso)
      // Clear returnTime if it may now violate ordering
      if (returnTime) setReturnTime(null)
    } else {
      setReturnDate(null)
      setReturnTime(null)
    }
  }

  // Only transfer trips support round-trip
  const showRoundTripOption = tripType === 'transfer' || tripType === 'round_trip'

  const cards = VEHICLE_CONFIG.map((vc) => (
    <VehicleCard
      key={vc.key}
      config={vc}
      price={priceBreakdown?.[vc.key] ?? null}
      roundTripPrice={roundTripPriceBreakdown?.[vc.key] ?? null}
      returnDiscountPercent={returnDiscountPercent}
      showRoundTripOption={showRoundTripOption}
      isSelectedOneWay={vehicleClass === vc.key && tripType !== 'round_trip'}
      isSelectedRoundTrip={vehicleClass === vc.key && tripType === 'round_trip'}
      isLoading={loading}
      quoteMode={quoteMode}
      onSelectOneWay={() => {
        setVehicleClass(vc.key)
        if (tripType === 'round_trip') {
          setTripType('transfer')
          setReturnDate(null)
          setReturnTime(null)
        }
        const p = priceBreakdown?.[vc.key]
        pushVehicleSelect(vc.key, p?.base ?? null, p?.currency ?? 'EUR', 'transfer')
      }}
      onSelectRoundTrip={() => {
        setVehicleClass(vc.key)
        setTripType('round_trip')
        const p = roundTripPriceBreakdown?.[vc.key] ?? priceBreakdown?.[vc.key]
        pushVehicleSelect(vc.key, p?.base ?? null, p?.currency ?? 'EUR', 'round_trip')
      }}
    />
  ))

  return (
    <div className="theme-light">
      {/* Section heading (UI-SPEC copy) */}
      <h2
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--offwhite)',
          marginBottom: 24,
          letterSpacing: '0.03em',
        }}
      >
        Choose your experience
      </h2>

      {fetchError && (
        <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)', marginBottom: 24 }}>
          Pricing unavailable. Your selection has been saved — continue to request a quote.
        </p>
      )}

      {/* Desktop: 2-col grid — left: cards + slideshow; right: StickyBookingPanel (D-09, D-10) */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
        <div>
          {/* Three vehicle cards in a horizontal row (UI-SPEC desktop layout) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {cards}
          </div>
          {/* Interior/luggage slideshow below cards (D-15) */}
          <VehicleSlideshow activeClass={vehicleClass} />
        </div>
        <StickyBookingPanel />
      </div>

      {/* Mobile: single column. paddingBottom leaves room for the fixed PriceSummary.mobileBar
         (~68px + safe area) so cards aren't hidden behind it at scroll end. */}
      <div className="grid md:hidden" style={{ gridTemplateColumns: '1fr', gap: 24, paddingBottom: 100 }}>
        {cards}
      </div>

      {/* Return date/time — appears after clicking "Round Trip" on any card.
         pb-32 on mobile keeps the last calendar row + return-time list clear of
         the fixed PriceSummary bar (position:fixed bottom:0) that would otherwise
         obscure the only selectable dates when pickup is near month-end. */}
      {isRoundTrip && (
        <div
          className="pb-32 md:pb-0"
          style={{
            marginTop: 32,
            paddingTop: 32,
            borderTop: '1px solid var(--anthracite-light)',
          }}
        >
          <p className="label" style={{ marginBottom: 24 }}>RETURN DATE &amp; TIME</p>

          <div className="flex flex-col md:flex-row" style={{ gap: 32 }}>
            {/* Return date calendar */}
            <div className="md:w-[60%] w-full">
              <span className="label" style={{ display: 'block', marginBottom: 12 }}>
                RETURN DATE
              </span>
              <DayPicker
                mode="single"
                selected={returnDateObj}
                defaultMonth={returnDateObj ?? returnDateMin}
                onSelect={handleReturnDateSelect}
                disabled={{ before: returnDateMin }}
                styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                modifiersStyles={modifiersStyles}
              />
            </div>

            {/* Return time list */}
            <div className="md:w-[40%] w-full">
              <span className="label" style={{ display: 'block', marginBottom: 12 }}>
                RETURN TIME
              </span>
              {returnDate ? (
                <ul
                  role="listbox"
                  aria-label="Return time"
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    margin: 0,
                    padding: 0,
                    border: '1px solid var(--anthracite-light)',
                  }}
                >
                  {TIME_SLOTS.map((slot) => (
                    <li
                      key={slot}
                      role="option"
                      aria-selected={returnTime === slot}
                      onClick={() => setReturnTime(slot)}
                      style={{
                        minHeight: 44,
                        padding: '0 16px',
                        display: 'flex',
                        alignItems: 'center',
                        fontFamily: 'var(--font-montserrat)',
                        fontSize: 13,
                        fontWeight: 400,
                        color: returnTime === slot ? 'var(--offwhite)' : 'var(--warmgrey)',
                        background: returnTime === slot ? 'var(--anthracite-mid)' : 'transparent',
                        borderLeft: returnTime === slot ? '4px solid var(--copper)' : '4px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease, color 0.15s ease',
                        listStyle: 'none',
                      }}
                    >
                      {slot}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, color: 'var(--warmgrey)', lineHeight: 1.8 }}>
                  Select a return date first
                </p>
              )}
            </div>
          </div>

          {/* Ordering validation */}
          {returnDate && returnTime && pickupDate && useBookingStore.getState().pickupTime &&
            `${returnDate}T${returnTime}` <= `${pickupDate}T${useBookingStore.getState().pickupTime}` && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 13,
                color: 'var(--copper)',
                marginTop: 12,
                letterSpacing: '0.03em',
              }}
            >
              Return must be after pickup
            </p>
          )}
        </div>
      )}

      {/* Mobile fixed bottom bar */}
      <PriceSummary mobileOnly />
    </div>
  )
}
