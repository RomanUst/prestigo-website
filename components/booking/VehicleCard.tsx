'use client'

import { useState } from 'react'
import type { VehicleConfig, PriceBreakdown } from '@/types/booking'
import { eurToCzk, formatCZK } from '@/lib/currency'

interface VehicleCardProps {
  config: VehicleConfig
  price: PriceBreakdown | null
  roundTripPrice: PriceBreakdown | null
  returnDiscountPercent: number
  isSelectedOneWay: boolean
  isSelectedRoundTrip: boolean
  isRoundTripMode: boolean
  isLoading: boolean
  quoteMode: boolean
  onSelectOneWay: () => void
  onSelectRoundTrip: () => void
}

export default function VehicleCard({
  config,
  price,
  roundTripPrice,
  returnDiscountPercent,
  isSelectedOneWay,
  isSelectedRoundTrip,
  isRoundTripMode,
  isLoading,
  quoteMode,
  onSelectOneWay,
  onSelectRoundTrip,
}: VehicleCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  const isSelected = isSelectedOneWay || isSelectedRoundTrip

  const bgColor = isSelected || hovered ? 'var(--anthracite-light)' : 'var(--anthracite-mid)'

  const combinedTotal = price && roundTripPrice ? price.total + roundTripPrice.total : null

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        border: isSelected ? '2px solid var(--copper)' : '1px solid var(--anthracite-light)',
        background: bgColor,
        borderRadius: 4,
        padding: isSelected ? 23 : 24,
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
      }}
    >
      {/* Vehicle photo */}
      {imgError ? (
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--anthracite-light)', borderRadius: 4, marginBottom: 16 }} />
      ) : (
        <img
          src={config.image}
          alt={config.label}
          onError={() => setImgError(true)}
          style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 4, marginBottom: 16 }}
        />
      )}

      {/* Class name */}
      <span
        style={{
          display: 'block',
          fontFamily: 'var(--font-montserrat)',
          fontSize: 10,
          fontWeight: 400,
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
          color: 'var(--offwhite)',
          marginBottom: 8,
        }}
      >
        {config.label}
      </span>

      {/* Capacity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warmgrey)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="7" r="4" />
            <path d="M5.5 21c0-4.5 2.9-7 6.5-7s6.5 2.5 6.5 7" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)' }}>{config.maxPassengers}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warmgrey)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="6" y="7" width="12" height="14" rx="1" />
            <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)' }}>{config.maxLuggage}</span>
        </div>
      </div>

      {/* Price options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        {isLoading ? (
          <>
            <div className="skeleton-shimmer" />
            <div className="skeleton-shimmer" style={{ width: 120 }} />
          </>
        ) : quoteMode ? (
          <button
            type="button"
            onClick={onSelectOneWay}
            aria-pressed={isSelectedOneWay}
            style={priceButtonStyle(isSelectedOneWay)}
          >
            <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, color: 'var(--warmgrey)' }}>
              Request a quote
            </span>
          </button>
        ) : isRoundTripMode && price && roundTripPrice && combinedTotal !== null ? (
          /* Three-line round-trip layout */
          <button
            type="button"
            onClick={onSelectRoundTrip}
            aria-pressed={isSelectedRoundTrip}
            aria-label={`Combined €${combinedTotal}`}
            style={priceButtonStyle(isSelectedRoundTrip)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Line 1: Outbound */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>
                  Outbound
                </span>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)' }}>
                  &euro;{price.total}
                </span>
              </div>
              {/* Line 2: Return with discount badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>
                    Return
                  </span>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.1em', color: 'var(--copper)', background: 'rgba(184,115,51,0.12)', padding: '1px 6px' }}>
                    -{returnDiscountPercent}%
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)' }}>
                  &euro;{roundTripPrice.total}
                </span>
              </div>
              {/* Line 3: Combined total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--anthracite-light)', paddingTop: 6, marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.3em', textTransform: 'uppercase', color: isSelectedRoundTrip ? 'var(--copper)' : 'var(--warmgrey)' }}>
                  Combined
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 18, fontWeight: 500, color: 'var(--offwhite)', letterSpacing: '0.03em' }}>
                    &euro;{combinedTotal}
                  </span>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)', marginTop: 1 }}>
                    {formatCZK(eurToCzk(combinedTotal))}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ) : (
          <>
            {/* One Way */}
            <button
              type="button"
              onClick={onSelectOneWay}
              aria-pressed={isSelectedOneWay}
              style={priceButtonStyle(isSelectedOneWay)}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.3em', textTransform: 'uppercase', color: isSelectedOneWay ? 'var(--copper)' : 'var(--warmgrey)', marginBottom: 2 }}>
                  One Way
                </span>
                {price ? (
                  <>
                    <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 18, fontWeight: 500, color: 'var(--offwhite)', letterSpacing: '0.03em' }}>
                      &euro;{price.total}
                    </span>
                    <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)', marginTop: 1 }}>
                      {formatCZK(eurToCzk(price.total))}
                    </span>
                  </>
                ) : null}
              </div>
            </button>

            {/* Round Trip */}
            {roundTripPrice && (
              <button
                type="button"
                onClick={onSelectRoundTrip}
                aria-pressed={isSelectedRoundTrip}
                style={priceButtonStyle(isSelectedRoundTrip)}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.3em', textTransform: 'uppercase', color: isSelectedRoundTrip ? 'var(--copper)' : 'var(--warmgrey)' }}>
                      Round Trip
                    </span>
                    <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, fontWeight: 400, letterSpacing: '0.1em', color: 'var(--copper)', background: 'rgba(184,115,51,0.12)', padding: '1px 6px' }}>
                      -{returnDiscountPercent}%
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 18, fontWeight: 500, color: 'var(--offwhite)', letterSpacing: '0.03em' }}>
                    &euro;{roundTripPrice.total}
                  </span>
                  <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)', marginTop: 1 }}>
                    {formatCZK(eurToCzk(roundTripPrice.total))}
                  </span>
                </div>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function priceButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: isActive ? 'rgba(184,115,51,0.08)' : 'rgba(255,255,255,0.03)',
    border: isActive ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background 0.2s ease',
    borderRadius: 2,
  }
}
