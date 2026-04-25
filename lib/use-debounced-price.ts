'use client'
import { useEffect, useRef } from 'react'
import { useCalculatorStore } from '@/lib/calculator-store'

export default function useDebouncedPrice(): void {
  const from = useCalculatorStore((s) => s.from)
  const to = useCalculatorStore((s) => s.to)
  const serviceType = useCalculatorStore((s) => s.serviceType)
  const date = useCalculatorStore((s) => s.date)
  const time = useCalculatorStore((s) => s.time)
  const hours = useCalculatorStore((s) => s.hours)
  const passengers = useCalculatorStore((s) => s.passengers)
  const childSeats = useCalculatorStore((s) => s.childSeats)
  const extraStops = useCalculatorStore((s) => s.extraStops)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const ready =
      date && time &&
      ((serviceType === 'hourly' && from) ||
       (serviceType === 'transfer' && from && to))

    if (!ready) return

    timerRef.current = setTimeout(async () => {
      try {
        const body = {
          tripType: serviceType,
          origin: from ? { lat: from.lat, lng: from.lng } : null,
          destination: to ? { lat: to.lat, lng: to.lng } : null,
          pickupDate: date,
          pickupTime: time,
          hours,
          originPlaceId: from?.placeId,
          destinationPlaceId: to?.placeId,
          childSeats,
          extraStops,
          isAirport: false,
          intermediates: [],
        }
        const res = await fetch('/api/calculate-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        const s = useCalculatorStore.getState()
        s.setPriceBreakdown(data.prices ?? null)
        s.setQuoteMode(data.quoteMode === true)
        s.setMatchedRouteSlug(data.matchedRouteSlug ?? null)
        s.setDistanceKm(data.distanceKm ?? null)
      } catch (err) {
        console.error('[useDebouncedPrice] price fetch failed:', err)
        const s = useCalculatorStore.getState()
        s.setPriceBreakdown(null)
        s.setQuoteMode(true)
      }
    }, 400)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [from, to, serviceType, date, time, hours, passengers, childSeats, extraStops])
}
