'use client'

import Image from 'next/image'
import { useCalculatorStore } from '@/lib/calculator-store'
import { VEHICLE_CONFIG } from '@/types/booking'
import type { VehicleClass } from '@/types/booking'

interface QuoteStepProps {
  onNext?: () => void
  onBack?: () => void
  showBack?: boolean
}

export default function QuoteStep4Class({ onNext, onBack }: QuoteStepProps) {
  const priceBreakdown = useCalculatorStore((s) => s.priceBreakdown)
  const vehicleClass = useCalculatorStore((s) => s.vehicleClass)
  const setVehicleClass = useCalculatorStore((s) => s.setVehicleClass)

  const canProceed = vehicleClass !== null

  return (
    <div>
      {/* Step heading */}
      <h2
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '16px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          marginBottom: '8px',
          letterSpacing: '0.03em',
        }}
      >
        Vehicle class
      </h2>
      <div
        style={{
          width: '40px',
          height: '1px',
          background: 'linear-gradient(90deg, var(--copper) 0%, var(--copper-pale) 60%, transparent 100%)',
          marginBottom: '24px',
        }}
      />

      {/* Vehicle class radio group */}
      <div
        role="radiogroup"
        aria-label="Vehicle class"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}
      >
        {VEHICLE_CONFIG.map((config) => {
          const isSelected = vehicleClass === config.key
          const isFirstClass = config.key === 'first_class'
          const price = priceBreakdown?.[config.key as VehicleClass]?.total ?? null

          // First Class card always has copper outline (CALC-11 premium visual anchor)
          const borderStyle = isSelected
            ? '2px solid var(--copper)'
            : isFirstClass
            ? '1px solid var(--copper)'
            : '1px solid var(--anthracite-light)'

          const bgColor = isSelected ? 'var(--anthracite-light)' : 'var(--anthracite-mid)'

          return (
            <div key={config.key}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setVehicleClass(config.key as VehicleClass)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: bgColor,
                  border: borderStyle,
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                {/* Vehicle image */}
                <div
                  style={{
                    position: 'relative',
                    width: '120px',
                    height: '60px',
                    flexShrink: 0,
                    overflow: 'hidden',
                    borderRadius: '2px',
                  }}
                >
                  <Image
                    src={config.image}
                    alt={config.label}
                    width={200}
                    height={100}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>

                {/* Card content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Class name */}
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '16px',
                      fontWeight: 400,
                      color: 'var(--offwhite)',
                      marginBottom: '4px',
                    }}
                  >
                    {config.label}
                  </span>

                  {/* Capacity hint */}
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '12px',
                      fontWeight: 300,
                      color: 'var(--warmgrey)',
                      marginBottom: '8px',
                    }}
                  >
                    Up to {config.maxPassengers} passengers
                  </span>

                  {/* Price display */}
                  {price === null ? (
                    <div
                      className="skeleton-shimmer"
                      style={{ width: 80, height: 28 }}
                    />
                  ) : (
                    <div
                      style={{
                        fontFamily: 'Cormorant Garamond, serif',
                        fontSize: '24px',
                        fontWeight: 300,
                        color: 'var(--copper)',
                        lineHeight: 1.1,
                      }}
                    >
                      €{price}
                    </div>
                  )}
                </div>
              </button>

              {/* Bespoke link — First Class only, rendered outside button for keyboard accessibility */}
              {isFirstClass && (
                <a
                  href="/calculator/bespoke"
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '11px',
                    fontWeight: 400,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--copper-light)',
                    textDecoration: 'none',
                  }}
                >
                  Or request bespoke quote →
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          className="btn-primary"
          disabled={!canProceed}
          onClick={() => canProceed && onNext?.()}
          aria-disabled={!canProceed}
          style={{
            width: '100%',
            minHeight: 44,
            opacity: canProceed ? 1 : 0.4,
            cursor: canProceed ? 'pointer' : 'not-allowed',
          }}
        >
          SEE YOUR FARE →
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onBack}
          style={{ width: '100%', minHeight: 44 }}
        >
          ← BACK
        </button>
      </div>
    </div>
  )
}
