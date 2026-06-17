'use client'

import Image from 'next/image'
import type { VehicleConfig } from '@/types/booking'

interface VehicleCardProps {
  config: VehicleConfig
  isSelected: boolean
  onSelect: () => void
  price?: string | null
}

export default function VehicleCard({ config, isSelected, onSelect, price }: VehicleCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        textAlign: 'left',
        border: isSelected ? '2px solid var(--copper)' : '1px solid var(--anthracite-light)',
        background: isSelected ? 'var(--anthracite-mid)' : 'var(--anthracite)',
        borderRadius: 4,
        padding: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease, background 0.2s ease',
        minHeight: 160,
        position: 'relative',
      }}
    >
      {/* Left copper accent bar when selected */}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: 3,
          background: 'var(--copper)',
          zIndex: 1,
        }} />
      )}

      {/* Info section — left side */}
      <div style={{
        flex: 1,
        padding: '24px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
      }}>
        <div>
          <span style={{
            display: 'block',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: isSelected ? 'var(--copper)' : 'var(--offwhite)',
            marginBottom: 6,
          }}>
            {config.label}
          </span>
          <span style={{
            display: 'block',
            fontFamily: 'var(--font-montserrat)',
            fontSize: 12,
            fontWeight: 300,
            color: 'var(--warmgrey)',
            lineHeight: 1.4,
          }}>
            {config.model}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--warmgrey)', flexShrink: 0 }}>
                <circle cx="12" cy="7" r="4" />
                <path d="M5.5 21c0-4.5 2.9-7 6.5-7s6.5 2.5 6.5 7" />
              </svg>
              <span style={{ fontSize: 12, color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)' }}>{config.maxPassengers}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--warmgrey)', flexShrink: 0 }}>
                <rect x="6" y="7" width="12" height="14" rx="1" />
                <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
              <span style={{ fontSize: 12, color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)' }}>{config.maxLuggage}</span>
            </div>
          </div>

          {price && (
            <span style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 18,
              fontWeight: 600,
              color: isSelected ? 'var(--copper)' : 'var(--offwhite)',
              letterSpacing: '0.02em',
            }}>
              {price}
            </span>
          )}
        </div>
      </div>

      {/* Car image — right side, landscape */}
      <div style={{
        position: 'relative',
        width: '45%',
        flexShrink: 0,
        background: '#1E1C1A',
        overflow: 'hidden',
      }}>
        <Image
          src={config.image}
          alt={`Prestigo ${config.label}`}
          fill
          style={{ objectFit: 'cover', objectPosition: 'center' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: isSelected
            ? 'linear-gradient(to right, var(--anthracite-mid) 0%, transparent 40%)'
            : 'linear-gradient(to right, var(--anthracite) 0%, transparent 40%)',
          pointerEvents: 'none',
        }} />
      </div>
    </button>
  )
}
