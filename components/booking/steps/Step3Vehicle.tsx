'use client'

import { useState, useEffect } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG, PRG_CONFIG } from '@/types/booking'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'

export default function Step3Vehicle() {
  const [loading, setLoading] = useState(true)

  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const pickupDate = useBookingStore((s) => s.pickupDate)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const returnDate = useBookingStore((s) => s.returnDate)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const setPriceBreakdown = useBookingStore((s) => s.setPriceBreakdown)
  const setDistanceKm = useBookingStore((s) => s.setDistanceKm)
  const setQuoteMode = useBookingStore((s) => s.setQuoteMode)
  const setVehicleClass = useBookingStore((s) => s.setVehicleClass)

  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchPrice() {
      setLoading(true)
      try {
        const res = await fetch('/api/calculate-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
            destination: destination ? { lat: destination.lat, lng: destination.lng } : null,
            tripType,
            hours,
            pickupDate,
            returnDate,
            pickupTime,
            isAirport: !!(origin?.placeId === PRG_CONFIG.placeId || destination?.placeId === PRG_CONFIG.placeId),
          }),
        })
        const data = await res.json()
        if (!cancelled) {
          setPriceBreakdown(data.prices)
          setDistanceKm(data.distanceKm)
          setQuoteMode(data.quoteMode)
          setFetchError(false)
        }
      } catch {
        if (!cancelled) {
          setQuoteMode(true)
          setPriceBreakdown(null)
          setFetchError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    // Only fetch if we don't already have prices (e.g., navigating back to Step 3)
    if (!priceBreakdown) {
      fetchPrice()
    } else {
      setLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, []) // Empty deps — fetch once on mount only

  const cards = VEHICLE_CONFIG.map((vc) => (
    <VehicleCard
      key={vc.key}
      config={vc}
      price={priceBreakdown?.[vc.key] ?? null}
      isSelected={vehicleClass === vc.key}
      isLoading={loading}
      quoteMode={quoteMode}
      onSelect={() => setVehicleClass(vc.key)}
    />
  ))

  return (
    <div>
      {/* Fetch error message */}
      {fetchError && (
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: 'var(--warmgrey)',
            marginBottom: 24,
          }}
        >
          Pricing unavailable. Your selection has been saved — continue to request a quote.
        </p>
      )}

      {/* Desktop layout: 2-col grid (cards + sticky summary) */}
      <div
        className="hidden md:grid"
        style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {cards}
        </div>
        <PriceSummary desktopOnly />
      </div>

      {/* Mobile layout: single column, paddingBottom for fixed bar */}
      <div
        className="grid md:hidden"
        style={{ gridTemplateColumns: '1fr', gap: 24, paddingBottom: 80 }}
      >
        {cards}
      </div>

      {/* Mobile fixed bottom bar — rendered once, outside both layouts */}
      <PriceSummary mobileOnly />
    </div>
  )
}
