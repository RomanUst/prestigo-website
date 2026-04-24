'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { VehicleClass } from '@/types/booking'

const VEHICLE_DISPLAY_LABEL: Record<VehicleClass, string> = {
  business: 'Mercedes E-Class Business',
  first_class: 'Mercedes S-Class First Class',
  business_van: 'Mercedes V-Class Business Van',
}

interface PriceBreakdownEntry {
  base: number
  extras: number
  total: number
  currency: string
}

interface QuoteResultProps {
  onBook?: () => void
  // Props-based interface (used by tests and QuoteCalculator)
  priceBreakdown?: Record<VehicleClass, PriceBreakdownEntry> | null
  vehicleClass?: VehicleClass | null
  quoteMode?: boolean
  from?: { address: string; placeId: string; lat?: number; lng?: number } | null
  to?: { address: string; placeId: string; lat?: number; lng?: number } | null
  date?: string | null
  time?: string | null
  passengers?: number
  serviceType?: string
}

export default function QuoteResult({
  onBook,
  priceBreakdown = null,
  vehicleClass = null,
  quoteMode = false,
  from = null,
  to = null,
  date = null,
  time = null,
  passengers = 1,
  serviceType = 'transfer',
}: QuoteResultProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  // Build deeplink URL
  const buildDeeplinkUrl = () => {
    const params = new URLSearchParams()
    params.set('type', serviceType)
    if (from) {
      params.set('from', from.address)
      params.set('fromPlaceId', from.placeId)
      if (from.lat != null) params.set('fromLat', String(from.lat))
      if (from.lng != null) params.set('fromLng', String(from.lng))
    }
    if (to) {
      params.set('to', to.address)
      params.set('toPlaceId', to.placeId)
      if (to.lat != null) params.set('toLat', String(to.lat))
      if (to.lng != null) params.set('toLng', String(to.lng))
    }
    if (date) params.set('date', date)
    if (time) params.set('time', time)
    if (vehicleClass) params.set('class', vehicleClass)
    params.set('pax', String(passengers))
    return `/book?${params.toString()}`
  }

  // quoteMode fallback
  if (quoteMode) {
    return (
      <div
        style={{
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          padding: '24px',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            marginBottom: '8px',
            letterSpacing: '0.03em',
          }}
        >
          Unable to calculate fare automatically
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            lineHeight: 1.75,
            marginBottom: '16px',
          }}
        >
          Enter your details and we&apos;ll confirm your price by email.
        </p>
        <a
          href="/contact"
          className="btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: 44,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          GET A BESPOKE QUOTE →
        </a>
      </div>
    )
  }

  // Empty state
  if (!priceBreakdown || !vehicleClass) {
    return (
      <p
        style={{
          fontSize: '14px',
          color: 'var(--warmgrey)',
          textAlign: 'center',
        }}
      >
        Enter your From and To to see fares
      </p>
    )
  }

  const breakdown = priceBreakdown[vehicleClass]
  const vehicleLabel = VEHICLE_DISPLAY_LABEL[vehicleClass]
  const total = breakdown?.total ?? 0

  return (
    <div
      style={{
        background: 'var(--anthracite-mid)',
        border: '1px solid var(--anthracite-light)',
        padding: '24px',
      }}
    >
      {/* Fare figure */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: '28px',
            fontWeight: 300,
            color: 'var(--copper)',
          }}
        >
          Your fare: €{total}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
          }}
        >
          · {vehicleLabel}
        </span>
      </div>

      {/* Collapsible breakdown */}
      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          aria-expanded={breakdownOpen}
          onClick={() => setBreakdownOpen((v) => !v)}
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
          }}
        >
          {breakdownOpen ? 'Hide breakdown ▲' : 'See breakdown ▼'}
        </button>
        {breakdownOpen && (
          <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--warmgrey)' }}>
              <span>Base</span>
              <span>€{breakdown.base}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--warmgrey)' }}>
              <span>Extras</span>
              <span>€{breakdown.extras}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--offwhite)', fontWeight: 400 }}>
              <span>Total</span>
              <span>€{breakdown.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* All-inclusive bullets */}
      <p
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '12px',
          fontWeight: 300,
          color: 'var(--warmgrey)',
          marginBottom: '16px',
          lineHeight: 1.6,
        }}
      >
        Fixed price · Meet &amp; Greet · Flight tracking · 60 min free wait · English driver · No surcharges
      </p>

      {/* BOOK NOW CTA */}
      <a
        href={buildDeeplinkUrl()}
        className="btn-primary"
        onClick={onBook}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: 44,
          textAlign: 'center',
          textDecoration: 'none',
          marginBottom: vehicleClass === 'first_class' ? '12px' : undefined,
        }}
      >
        BOOK NOW — PAY ONLINE
      </a>

      {/* First Class bespoke link */}
      {vehicleClass === 'first_class' && (
        <Link
          href="/calculator/bespoke"
          style={{
            display: 'block',
            textAlign: 'center',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 300,
            color: 'var(--copper-light)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Or request bespoke quote →
        </Link>
      )}
    </div>
  )
}
