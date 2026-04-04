'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG, PRG_CONFIG } from '@/types/booking'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'

export default function Step3Vehicle() {
  const [loading, setLoading] = useState(true)

  const tripType = useBookingStore((s) => s.tripType)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const setPriceBreakdown = useBookingStore((s) => s.setPriceBreakdown)
  const setRoundTripPriceBreakdown = useBookingStore((s) => s.setRoundTripPriceBreakdown)
  const setReturnDiscountPercent = useBookingStore((s) => s.setReturnDiscountPercent)
  const setDistanceKm = useBookingStore((s) => s.setDistanceKm)
  const setQuoteMode = useBookingStore((s) => s.setQuoteMode)
  const setVehicleClass = useBookingStore((s) => s.setVehicleClass)
  const setTripType = useBookingStore((s) => s.setTripType)

  const [fetchError, setFetchError] = useState(false)

  const fetchPrice = useCallback(async () => {
    const s = useBookingStore.getState()
    // Always send as 'transfer' to get one-way prices; round trip is computed from those
    const effectiveTripType = s.tripType === 'round_trip' ? 'transfer' : s.tripType
    setLoading(true)
    try {
      const res = await fetch('/api/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: s.origin ? { lat: s.origin.lat, lng: s.origin.lng } : null,
          destination: s.destination ? { lat: s.destination.lat, lng: s.destination.lng } : null,
          tripType: effectiveTripType,
          hours: s.hours,
          pickupDate: s.pickupDate,
          returnDate: s.returnDate,
          pickupTime: s.pickupTime,
          returnTime: s.returnTime,
          isAirport: !!(s.origin?.placeId === PRG_CONFIG.placeId || s.destination?.placeId === PRG_CONFIG.placeId),
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

  useEffect(() => {
    fetchPrice()
  }, [fetchPrice]) // fetch once on mount

  const showRoundTripPrices = !!(roundTripPriceBreakdown && tripType === 'round_trip')

  const cards = VEHICLE_CONFIG.map((vc) => (
    <VehicleCard
      key={vc.key}
      config={vc}
      price={priceBreakdown?.[vc.key] ?? null}
      roundTripPrice={showRoundTripPrices ? (roundTripPriceBreakdown?.[vc.key] ?? null) : null}
      returnDiscountPercent={returnDiscountPercent}
      isSelectedOneWay={vehicleClass === vc.key && tripType !== 'round_trip'}
      isSelectedRoundTrip={vehicleClass === vc.key && tripType === 'round_trip'}
      isRoundTripMode={tripType === 'round_trip'}
      isLoading={loading}
      quoteMode={quoteMode}
      onSelectOneWay={() => {
        setVehicleClass(vc.key)
        setTripType('transfer')
      }}
      onSelectRoundTrip={() => {
        setVehicleClass(vc.key)
        setTripType('round_trip')
      }}
    />
  ))

  return (
    <div>
      {/* Fetch error message */}
      {fetchError && (
        <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)', marginBottom: 24 }}>
          Pricing unavailable. Your selection has been saved — continue to request a quote.
        </p>
      )}

      {/* Desktop layout: 2-col grid (cards + sticky summary) */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {cards}
        </div>
        <PriceSummary desktopOnly />
      </div>

      {/* Mobile layout: single column */}
      <div className="grid md:hidden" style={{ gridTemplateColumns: '1fr', gap: 24, paddingBottom: 80 }}>
        {cards}
      </div>

      {/* Mobile fixed bottom bar */}
      <PriceSummary mobileOnly />
    </div>
  )
}
