'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { X } from 'lucide-react'

const pricingSchema = z.object({
  config: z.array(z.object({
    vehicle_class: z.string(),
    rate_per_km: z.number().positive(),
    hourly_rate: z.number().positive(),
    daily_rate: z.number().positive(),
    min_fare: z.number().min(0),
  })),
  globals: z.object({
    airport_fee: z.number().min(0),
    night_coefficient: z.number().positive(),
    holiday_coefficient: z.number().positive(),
    extra_child_seat: z.number().min(0),
    extra_meet_greet: z.number().min(0),
    extra_luggage: z.number().min(0),
    return_discount_percent: z.number().min(0).max(100),
    hourly_min_hours: z.number().int().positive(),
    hourly_max_hours: z.number().int().positive(),
  }).refine(
    (g) => g.hourly_min_hours < g.hourly_max_hours,
    {
      message: 'Minimum hours must be less than maximum hours',
      path: ['hourly_max_hours'],
    }
  ),
})
type PricingData = z.infer<typeof pricingSchema>

type PricingFormProps = {
  initialData: PricingData & { holidayDates: string[] }
}

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
  { key: 'return_discount_percent', label: 'ROUND TRIP DISCOUNT', suffix: '% off total' },
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

export default function PricingForm({ initialData }: PricingFormProps) {
  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<PricingData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: initialData,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'range-error'>('idle')
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const [holidayDates, setHolidayDates] = useState<string[]>(initialData.holidayDates ?? [])
  const [newDate, setNewDate] = useState('')

  async function onSubmit(data: PricingData) {
    setSaveStatus('idle')
    const res = await fetch('/api/admin/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        globals: {
          ...data.globals,
          holiday_dates: holidayDates,
        },
      }),
    })
    if (res.ok) {
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } else if (res.status === 422) {
      setSaveStatus('range-error')
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

  // Returns register props merged with focus/blur handlers that set focus border
  function registerNumeric(
    name: Parameters<typeof register>[0],
    inputId: string
  ) {
    const registeredProps = register(name, { valueAsNumber: true })
    return {
      ...registeredProps,
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        setFocusedInput(null)
        void registeredProps.onBlur(e)
      },
      onFocus: () => setFocusedInput(inputId),
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
            gridTemplateColumns: '160px 1fr 1fr 1fr 1fr',
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
          <div>
            <div style={headerLabelStyle}>MIN FARE</div>
            <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)', marginTop: '2px' }}>
              EUR min
            </div>
          </div>
        </div>

        {/* Data rows */}
        {initialData.config.map((row, index) => {
          // eslint-disable-next-line react-hooks/incompatible-library
          const minFareValue = watch(`config.${index}.min_fare`)
          return (
            <div
              key={row.vehicle_class}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr 1fr 1fr 1fr',
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
                  {...registerNumeric(`config.${index}.rate_per_km`, `config-${index}-rate_per_km`)}
                />
              </div>
              <div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  style={getInputStyle(`config-${index}-hourly_rate`)}
                  {...registerNumeric(`config.${index}.hourly_rate`, `config-${index}-hourly_rate`)}
                />
              </div>
              <div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  style={getInputStyle(`config-${index}-daily_rate`)}
                  {...registerNumeric(`config.${index}.daily_rate`, `config-${index}-daily_rate`)}
                />
              </div>
              <div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  style={getInputStyle(`config-${index}-min_fare`)}
                  {...registerNumeric(`config.${index}.min_fare`, `config-${index}-min_fare`)}
                />
                {minFareValue === 0 && (
                  <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '10px', color: 'var(--warmgrey)', marginTop: '2px' }}>
                    (no floor)
                  </div>
                )}
              </div>
            </div>
          )
        })}
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
                  {...registerNumeric(`globals.${key}`, `globals-${key}`)}
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

      {/* Section C — Hourly Hire (min/max range for hourly tripType) */}
      <div style={{ ...cardStyle, marginTop: '16px' }}>
        <div style={headerLabelStyle}>HOURLY HIRE</div>
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
          marginTop: '4px',
          marginBottom: '16px',
        }}>
          Operator-controlled min and max hour range for Hourly trip type. Booking wizard
          Step 2 dropdown renders one option per hour from MIN to MAX (inclusive, step 1).
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
          }}
        >
          <div>
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
              MINIMUM HOURS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                step="1"
                min="1"
                style={getInputStyle('globals-hourly_min_hours')}
                {...registerNumeric('globals.hourly_min_hours', 'globals-hourly_min_hours')}
              />
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)' }}>
                hours min
              </span>
            </div>
          </div>

          <div>
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
              MAXIMUM HOURS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                step="1"
                min="1"
                style={getInputStyle('globals-hourly_max_hours')}
                {...registerNumeric('globals.hourly_max_hours', 'globals-hourly_max_hours')}
              />
              <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', color: 'var(--warmgrey)' }}>
                hours max
              </span>
            </div>
          </div>
        </div>

        {errors.globals?.hourly_max_hours?.message && (
          <div
            style={{
              marginTop: '12px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              color: '#f87171',
            }}
            role="alert"
          >
            {errors.globals.hourly_max_hours.message}
          </div>
        )}
      </div>

      {/* Section D — Holiday Dates */}
      <div style={{ ...cardStyle, marginTop: '16px' }}>
        <div style={headerLabelStyle}>HOLIDAY DATES</div>
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
          marginTop: '4px',
          marginBottom: '16px',
        }}>
          Trips on these dates apply the holiday coefficient.
        </div>

        {/* Date list */}
        {holidayDates.length === 0 ? (
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            color: 'var(--warmgrey)',
            fontStyle: 'italic',
            marginBottom: '16px',
          }}>
            No holiday dates configured.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {[...holidayDates].sort().map((date) => (
              <div
                key={date}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  borderRadius: '2px',
                  padding: '6px 12px',
                  width: 'fit-content',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--offwhite)',
                }}>
                  {date}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${date}`}
                  onClick={() => setHolidayDates(prev => prev.filter(d => d !== date))}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: '32px',
                    minHeight: '32px',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => {
                    const svg = e.currentTarget.querySelector('svg')
                    if (svg) (svg as SVGElement & { style: CSSStyleDeclaration }).style.color = '#f87171'
                  }}
                  onMouseLeave={(e) => {
                    const svg = e.currentTarget.querySelector('svg')
                    if (svg) (svg as SVGElement & { style: CSSStyleDeclaration }).style.color = 'var(--warmgrey)'
                  }}
                >
                  <X size={14} style={{ color: 'var(--warmgrey)' }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add date row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            style={{
              background: 'var(--anthracite)',
              border: `1px solid ${newDate && holidayDates.includes(newDate) ? '#f87171' : focusedInput === 'holiday-date-input' ? 'var(--copper)' : 'var(--anthracite-light)'}`,
              borderRadius: '2px',
              color: 'var(--offwhite)',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              padding: '8px 12px',
              width: '160px',
              outline: 'none',
            }}
            onFocus={() => setFocusedInput('holiday-date-input')}
            onBlur={() => setFocusedInput(null)}
          />
          <button
            type="button"
            disabled={!newDate || holidayDates.includes(newDate)}
            onClick={() => {
              if (newDate && !holidayDates.includes(newDate)) {
                setHolidayDates(prev => [...prev, newDate])
                setNewDate('')
              }
            }}
            style={{
              border: '1px solid var(--copper)',
              color: 'var(--copper)',
              background: 'transparent',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.3em',
              padding: '8px 16px',
              borderRadius: '0',
              cursor: !newDate || holidayDates.includes(newDate) ? 'not-allowed' : 'pointer',
              opacity: !newDate || holidayDates.includes(newDate) ? 0.5 : 1,
              transition: 'background 300ms ease, color 300ms ease',
            }}
            onMouseEnter={(e) => {
              if (newDate && !holidayDates.includes(newDate)) {
                e.currentTarget.style.background = 'var(--copper)'
                e.currentTarget.style.color = 'var(--anthracite)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--copper)'
            }}
          >
            + ADD DATE
          </button>
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
        {saveStatus === 'range-error' && (
          <span style={{ fontSize: '11px', color: '#f87171' }}>Minimum hours must be less than maximum hours.</span>
        )}
      </div>
    </form>
  )
}
