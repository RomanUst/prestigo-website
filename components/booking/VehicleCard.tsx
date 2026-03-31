'use client'

import { useState } from 'react'
import type { VehicleConfig, PriceBreakdown } from '@/types/booking'
import { eurToCzk, formatCZK } from '@/lib/currency'

interface VehicleCardProps {
  config: VehicleConfig
  price: PriceBreakdown | null
  isSelected: boolean
  isLoading: boolean
  quoteMode: boolean
  onSelect: () => void
}

export default function VehicleCard({
  config,
  price,
  isSelected,
  isLoading,
  quoteMode,
  onSelect,
}: VehicleCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  const bgColor = isSelected
    ? 'var(--anthracite-light)'
    : hovered
    ? 'var(--anthracite-light)'
    : 'var(--anthracite-mid)'

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        textAlign: 'left',
        border: isSelected ? '2px solid var(--copper)' : '1px solid var(--anthracite-light)',
        background: bgColor,
        borderRadius: 4,
        padding: isSelected ? 23 : 24,
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
      }}
    >
      {/* Vehicle photo */}
      {imgError ? (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            background: 'var(--anthracite-light)',
            borderRadius: 4,
            marginBottom: 16,
          }}
        />
      ) : (
        <img
          src={config.image}
          alt={config.label}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            aspectRatio: '16/9',
            objectFit: 'cover',
            borderRadius: 4,
            marginBottom: 16,
          }}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Passengers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warmgrey)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="7" r="4" />
            <path d="M5.5 21c0-4.5 2.9-7 6.5-7s6.5 2.5 6.5 7" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)' }}>
            {config.maxPassengers}
          </span>
        </div>
        {/* Luggage */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warmgrey)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="6" y="7" width="12" height="14" rx="1" />
            <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)' }}>
            {config.maxLuggage}
          </span>
        </div>
      </div>

      {/* Price slot — minHeight prevents layout shift */}
      <div style={{ minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isLoading ? (
          <div className="skeleton-shimmer" />
        ) : quoteMode ? (
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)' }}>
            Request a quote
          </span>
        ) : price ? (
          <>
            <span
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--offwhite)',
                letterSpacing: '0.03em',
                fontFamily: 'var(--font-montserrat)',
              }}
            >
              &euro;{price.total}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 300,
                color: 'var(--warmgrey)',
                fontFamily: 'var(--font-montserrat)',
                marginTop: 2,
              }}
            >
              {formatCZK(eurToCzk(price.total))}
            </span>
          </>
        ) : null}
      </div>
    </button>
  )
}
