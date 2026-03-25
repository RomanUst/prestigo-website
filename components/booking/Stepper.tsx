'use client'

import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export default function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const atMin = value <= min
  const atMax = value >= max

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span className="label">{label}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label.toLowerCase()}`}
          aria-disabled={atMin}
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--anthracite-light)',
            background: 'var(--anthracite-mid)',
            cursor: atMin ? 'not-allowed' : 'pointer',
            opacity: atMin ? 0.3 : 1,
            color: 'var(--copper)',
            transition: 'opacity 0.2s ease',
          }}
        >
          <Minus size={14} />
        </button>

        <span
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            minWidth: '32px',
            textAlign: 'center',
          }}
        >
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label.toLowerCase()}`}
          aria-disabled={atMax}
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--anthracite-light)',
            background: 'var(--anthracite-mid)',
            cursor: atMax ? 'not-allowed' : 'pointer',
            opacity: atMax ? 0.3 : 1,
            color: 'var(--copper)',
            transition: 'opacity 0.2s ease',
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
