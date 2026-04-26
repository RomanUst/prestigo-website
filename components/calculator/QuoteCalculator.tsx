'use client'

import { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '@/lib/calculator-store'
import useDebouncedPrice from '@/lib/use-debounced-price'
import { useMediaQuery } from '@/lib/use-media-query'
import QuoteWizard from './QuoteWizard'
import QuoteDesktop from './QuoteDesktop'
import QuoteResult from './QuoteResult'

export default function QuoteCalculator() {
  const [showResult, setShowResult] = useState(false)
  useDebouncedPrice()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Read store values for GA4 event
  const priceBreakdown = useCalculatorStore((s) => s.priceBreakdown)
  const vehicleClass = useCalculatorStore((s) => s.vehicleClass)
  const matchedRouteSlug = useCalculatorStore((s) => s.matchedRouteSlug)
  const serviceType = useCalculatorStore((s) => s.serviceType)
  const from = useCalculatorStore((s) => s.from)
  const to = useCalculatorStore((s) => s.to)
  const date = useCalculatorStore((s) => s.date)
  const time = useCalculatorStore((s) => s.time)
  const passengers = useCalculatorStore((s) => s.passengers)
  const distanceKm = useCalculatorStore((s) => s.distanceKm)

  // Dedup ref — only fire quote_generated once per (route, class, price, serviceType) tuple
  const lastTrackedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!priceBreakdown || !vehicleClass) return
    const total = priceBreakdown[vehicleClass]?.total
    if (total == null) return
    const key = `${matchedRouteSlug ?? 'custom'}|${vehicleClass}|${total}|${serviceType}`
    if (lastTrackedKeyRef.current === key) return
    lastTrackedKeyRef.current = key

    const w = window as unknown as { gtag?: (...args: unknown[]) => void }
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'quote_generated', {
        class: vehicleClass,
        service_type: serviceType,
        price: total,
        route: matchedRouteSlug ?? 'custom',
      })
    }
  }, [priceBreakdown, vehicleClass, matchedRouteSlug, serviceType])

  const handleBook = () => {
    const s = useCalculatorStore.getState()
    if (!s.from || !s.vehicleClass) return
    const params = new URLSearchParams()
    params.set('type', s.serviceType)
    if (s.from) {
      params.set('from', s.from.address)
      params.set('fromPlaceId', s.from.placeId)
      params.set('fromLat', String(s.from.lat))
      params.set('fromLng', String(s.from.lng))
    }
    if (s.to) {
      params.set('to', s.to.address)
      params.set('toPlaceId', s.to.placeId)
      params.set('toLat', String(s.to.lat))
      params.set('toLng', String(s.to.lng))
    }
    if (s.date) params.set('date', s.date)
    if (s.time) params.set('time', s.time)
    if (s.vehicleClass) params.set('class', s.vehicleClass)
    params.set('pax', String(s.passengers))
    sessionStorage.setItem('booking_deeplink', '1')
    window.location.href = `/book?${params.toString()}`
  }

  if (isDesktop) {
    return (
      <QuoteDesktop
        data-testid="quote-desktop"
        onBook={handleBook}
      />
    )
  }

  // Mobile: show wizard or result
  if (showResult) {
    return (
      <div style={{ maxWidth: '520px', padding: '24px 16px', margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => setShowResult(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--warmgrey)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '0',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          ← Back
        </button>
        <QuoteResult
          onBook={handleBook}
          from={from}
          to={to}
          date={date}
          time={time}
          passengers={passengers}
          serviceType={serviceType}
          matchedRouteSlug={matchedRouteSlug}
          distanceKm={distanceKm}
        />
      </div>
    )
  }

  return (
    <QuoteWizard
      data-testid="quote-wizard"
      onCalculate={() => setShowResult(true)}
    />
  )
}
