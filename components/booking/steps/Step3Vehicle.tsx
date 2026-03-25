'use client'

import { useState, useEffect } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG } from '@/types/booking'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'

export default function Step3Vehicle() {
  const [loading, setLoading] = useState(true)

  const tripType = useBookingStore((s) => s.tripType)
  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const hours = useBookingStore((s) => s.hours)
  const pickupDate = useBookingStore((s) => s.pickupDate)
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

      {/* Desktop layout: 2-col grid (cards + summary) */}
      <div
        className="hidden md:grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}
      >
        {/* Vehicle cards column */}
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 32,
            }}
          >
            {VEHICLE_CONFIG.map((vc) => (
              <VehicleCard
                key={vc.key}
                config={vc}
                price={priceBreakdown?.[vc.key] ?? null}
                isSelected={vehicleClass === vc.key}
                isLoading={loading}
                quoteMode={quoteMode}
                onSelect={() => setVehicleClass(vc.key)}
              />
            ))}
          </div>
        </div>

        {/* Sticky price summary */}
        <PriceSummary />
      </div>

      {/* Mobile layout: single column + fixed bottom bar */}
      <div className="md:hidden" style={{ paddingBottom: 80 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 24,
          }}
        >
          {VEHICLE_CONFIG.map((vc) => (
            <VehicleCard
              key={vc.key}
              config={vc}
              price={priceBreakdown?.[vc.key] ?? null}
              isSelected={vehicleClass === vc.key}
              isLoading={loading}
              quoteMode={quoteMode}
              onSelect={() => setVehicleClass(vc.key)}
            />
          ))}
        </div>
        <PriceSummary />
      </div>
    </div>
  )
}
