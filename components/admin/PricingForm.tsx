'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'

const pricingSchema = z.object({
  config: z.array(z.object({
    vehicle_class: z.string(),
    rate_per_km: z.number().positive(),
    hourly_rate: z.number().positive(),
    daily_rate: z.number().positive(),
  })),
  globals: z.object({
    airport_fee: z.number().min(0),
    night_coefficient: z.number().positive(),
    holiday_coefficient: z.number().positive(),
    extra_child_seat: z.number().min(0),
    extra_meet_greet: z.number().min(0),
    extra_luggage: z.number().min(0),
  }),
})
type PricingData = z.infer<typeof pricingSchema>

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const GLOBALS_FIELDS: Array<{
  key: keyof PricingData['globals']
  label: string
  suffix: string
}> = [
  { key: 'airport_fee', label: 'AIRPORT FEE', suffix: 'EUR flat' },
  { key: 'night_coefficient', label: 'NIGHT COEFFICIENT', suffix: 'x multiplier' },
  { key: 'holiday_coefficient', label: 'HOLIDAY COEFFICIENT', suffix: 'x multiplier' },
  { key: 'extra_child_seat', label: 'CHILD SEAT', suffix: 'EUR / booking' },
  { key: 'extra_meet_greet', label: 'MEET & GREET', suffix: 'EUR / booking' },
  { key: 'extra_luggage', label: 'EXTRA LUGGAGE', suffix: 'EUR / booking' },
]

const inputBaseStyle: React.CSSProperties = {
  width: '100px',
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  textAlign: 'right',
  padding: '8px',
  outline: 'none',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  padding: '24px',
}

const headerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: 'var(--warmgrey)',
}

export default function PricingForm({ initialData }: { initialData: PricingData }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<PricingData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: initialData,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [focusedInput, setFocusedInput] = useState<string | null>(null)

  async function onSubmit(data: PricingData) {
    setSaveStatus('idle')
    const res = await fetch('/api/admin/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } else {
      setSaveStatus('error')
    }
  }

  function getInputStyle(id: string): React.CSSProperties {
    return {
      ...inputBaseStyle,
      borderColor: focusedInput === id ? 'var(--copper)' : 'var(--anthracite-light)',
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Section A — Vehicle Class Rates */}
      <div style={cardStyle}>
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 1fr 1fr',
            gap: '16px',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div />
          <div>
            <div style={headerLabelStyle}>RATE / KM</div>
            <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)', marginTop: '2px' }}>
              EUR / km
            </div>
          </div>
          <div>
            <div style={headerLabelStyle}>HOURLY RATE</div>
            <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)', marginTop: '2px' }}>
              EUR / h
            </div>
          </div>
          <div>
            <div style={headerLabelStyle}>DAILY RATE</div>
            <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)', marginTop: '2px' }}>
              EUR / day
            </div>
          </div>
        </div>

        {/* Data rows */}
        {initialData.config.map((row, index) => (
          <div
            key={row.vehicle_class}
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr 1fr 1fr',
              gap: '16px',
              alignItems: 'center',
              marginTop: '12px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                color: 'var(--offwhite)',
              }}
            >
              {VEHICLE_LABELS[row.vehicle_class] ?? row.vehicle_class}
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                min="0"
                style={getInputStyle(`config-${index}-rate_per_km`)}
                onFocus={() => setFocusedInput(`config-${index}-rate_per_km`)}
                onBlur={() => setFocusedInput(null)}
                {...register(`config.${index}.rate_per_km`, { valueAsNumber: true })}
              />
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                min="0"
                style={getInputStyle(`config-${index}-hourly_rate`)}
                onFocus={() => setFocusedInput(`config-${index}-hourly_rate`)}
                onBlur={() => setFocusedInput(null)}
                {...register(`config.${index}.hourly_rate`, { valueAsNumber: true })}
              />
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                min="0"
                style={getInputStyle(`config-${index}-daily_rate`)}
                onFocus={() => setFocusedInput(`config-${index}-daily_rate`)}
                onBlur={() => setFocusedInput(null)}
                {...register(`config.${index}.daily_rate`, { valueAsNumber: true })}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Section B — Global Parameters */}
      <div style={{ ...cardStyle, marginTop: '16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
          }}
        >
          {GLOBALS_FIELDS.map(({ key, label, suffix }) => (
            <div key={key}>
              <div
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3em',
                  color: 'var(--warmgrey)',
                  marginBottom: '6px',
                }}
              >
                {label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  style={getInputStyle(`globals-${key}`)}
                  onFocus={() => setFocusedInput(`globals-${key}`)}
                  onBlur={() => setFocusedInput(null)}
                  {...register(`globals.${key}`, { valueAsNumber: true })}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '11px',
                    color: 'var(--warmgrey)',
                  }}
                >
                  {suffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button + inline feedback */}
      <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            border: '1px solid var(--copper)',
            color: 'var(--offwhite)',
            background: 'transparent',
            padding: '16px 32px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            textTransform: 'uppercase',
            letterSpacing: '0.35em',
            borderRadius: '0',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.5 : 1,
            transition: 'background 300ms ease, color 300ms ease',
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--copper)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--anthracite)'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--offwhite)'
          }}
        >
          SAVE PRICING
        </button>

        {saveStatus === 'success' && (
          <span style={{ fontSize: '11px', color: '#4ade80' }}>Pricing saved.</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: '11px', color: '#f87171' }}>Save failed. Try again.</span>
        )}
      </div>
    </form>
  )
}
