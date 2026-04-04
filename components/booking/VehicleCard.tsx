'use client'

import { useState } from 'react'
import type { VehicleConfig, PriceBreakdown } from '@/types/booking'
import { eurToCzk, formatCZK } from '@/lib/currency'

interface VehicleCardProps {
  config: VehicleConfig
  price: PriceBreakdown | null
  roundTripPrice: PriceBreakdown | null
  returnDiscountPercent: number
  showRoundTripOption: boolean
  isSelectedOneWay: boolean
  isSelectedRoundTrip: boolean
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
  showRoundTripOption,
  isSelectedOneWay,
  isSelectedRoundTrip,
  isLoading,
  quoteMode,
  onSelectOneWay,
  onSelectRoundTrip,
}: VehicleCardProps) {
  const [hovered, setHovered] = useState(false)

  const isSelected = isSelectedOneWay || isSelectedRoundTrip

  const bgColor = isSelected || hovered ? 'var(--anthracite-light)' : 'var(--anthracite-mid)'

  // Exact combined when returnLegPrices computed (after user picks return time)
  // Estimated combined when only one-way price is available (show immediately)
  const estimatedReturnTotal = price ? Math.round(price.total * (1 - returnDiscountPercent / 100)) : null
  const combinedTotal = price && roundTripPrice
    ? price.total + roundTripPrice.total
    : price
    ? price.total + estimatedReturnTotal!
    : null
  const isEstimated = !!price && !roundTripPrice
  // Savings vs buying two one-way tickets
  const savings = price ? Math.round(price.total * returnDiscountPercent / 100) : null

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
      <img
        src={config.image}
        alt={config.label}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 4, marginBottom: 16 }}
      />

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

      {/* Price buttons */}
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

            {/* Round Trip — only for transfer type */}
            {showRoundTripOption && (
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
                  {combinedTotal !== null && (
                    <>
                      <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 18, fontWeight: 500, color: 'var(--offwhite)', letterSpacing: '0.03em' }}>
                        &euro;{combinedTotal}
                      </span>
                      <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)', marginTop: 1 }}>
                        {formatCZK(eurToCzk(combinedTotal))}
                      </span>
                      {savings !== null && savings > 0 && (
                        <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: 10, fontWeight: 400, color: 'var(--copper)', marginTop: 3, letterSpacing: '0.03em' }}>
                          You save &euro;{savings}{isEstimated ? ' · select return date to confirm' : ''}
                        </span>
                      )}
                    </>
                  )}
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
