'use client'

import { useState } from 'react'
import { useCalculatorStore } from '@/lib/calculator-store'

interface QuoteStepProps {
  onNext?: () => void
  onBack?: () => void
  showBack?: boolean
}

interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}

function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const [hoverDec, setHoverDec] = useState(false)
  const [hoverInc, setHoverInc] = useState(false)

  const atMin = value <= min
  const atMax = value >= max

  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: '1px solid var(--anthracite-light)',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 400,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--copper-light)',
          flex: 1,
        }}
      >
        {label}
      </span>

      {/* Stepper controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Decrement */}
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          aria-disabled={atMin}
          disabled={atMin}
          onClick={() => !atMin && onChange(value - 1)}
          onMouseEnter={() => setHoverDec(true)}
          onMouseLeave={() => setHoverDec(false)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '1px solid var(--anthracite-light)',
            background: hoverDec && !atMin ? 'rgba(184,115,51,0.12)' : 'transparent',
            color: atMin ? 'var(--warmgrey)' : 'var(--offwhite)',
            cursor: atMin ? 'not-allowed' : 'pointer',
            opacity: atMin ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 300,
            transition: 'background 0.15s ease',
            flexShrink: 0,
          }}
        >
          −
        </button>

        {/* Value */}
        <span
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '16px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            minWidth: '40px',
            textAlign: 'center',
          }}
        >
          {value}
        </span>

        {/* Increment */}
        <button
          type="button"
          aria-label={`Increase ${label}`}
          aria-disabled={atMax}
          disabled={atMax}
          onClick={() => !atMax && onChange(value + 1)}
          onMouseEnter={() => setHoverInc(true)}
          onMouseLeave={() => setHoverInc(false)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '1px solid var(--anthracite-light)',
            background: hoverInc && !atMax ? 'rgba(184,115,51,0.12)' : 'transparent',
            color: atMax ? 'var(--warmgrey)' : 'var(--offwhite)',
            cursor: atMax ? 'not-allowed' : 'pointer',
            opacity: atMax ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 300,
            transition: 'background 0.15s ease',
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}

export default function QuoteStep3Pax({ onNext, onBack }: QuoteStepProps) {
  const { passengers, childSeats, extraStops, setPassengers, setChildSeats, setExtraStops } =
    useCalculatorStore()

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
        Passengers
      </h2>
      <div
        style={{
          width: '40px',
          height: '1px',
          background: 'linear-gradient(90deg, var(--copper) 0%, var(--copper-pale) 60%, transparent 100%)',
          marginBottom: '24px',
        }}
      />

      {/* Stepper rows */}
      <div style={{ marginBottom: '24px' }}>
        <Stepper
          label="PASSENGERS"
          value={passengers}
          min={1}
          max={7}
          onChange={setPassengers}
        />
        <Stepper
          label="CHILD SEATS"
          value={childSeats}
          min={0}
          max={3}
          onChange={setChildSeats}
        />
        <Stepper
          label="EXTRA STOPS"
          value={extraStops}
          min={0}
          max={5}
          onChange={setExtraStops}
        />
      </div>

      {/* Footer */}
      <div className="quote-step-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          className="btn-primary"
          onClick={onNext}
          style={{ width: '100%', minHeight: 44 }}
        >
          CONTINUE →
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
