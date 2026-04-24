'use client'

import Link from 'next/link'
import { useCalculatorStore } from '@/lib/calculator-store'
import AddressInputNew from '@/components/booking/AddressInputNew'
import type { QuoteServiceType } from '@/lib/calculator-store'
import type { PlaceResult } from '@/types/booking'

interface QuoteStepProps {
  onNext?: () => void
  onBack?: () => void
  showBack?: boolean
}

const SERVICE_TABS: { key: QuoteServiceType; label: string }[] = [
  { key: 'transfer', label: 'TRANSFER' },
  { key: 'hourly', label: 'HOURLY' },
  { key: 'daily', label: 'MULTI-DAY' },
]

export default function QuoteStep1Route({ onNext, showBack: _showBack = false }: QuoteStepProps) {
  const { from, to, serviceType, hours, setFrom, setTo, setServiceType, setHours } = useCalculatorStore()

  const canProceed =
    (serviceType === 'transfer' && from !== null && to !== null) ||
    (serviceType === 'hourly' && from !== null && hours >= 1) ||
    serviceType === 'daily'

  const continueLabel = serviceType === 'daily' ? 'GO TO MULTI-DAY FORM →' : 'CONTINUE →'

  function handleContinue() {
    if (serviceType === 'daily') return // navigation handled by Link
    if (canProceed) onNext?.()
  }

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
        Route
      </h2>
      <div
        style={{
          width: '40px',
          height: '1px',
          background: 'linear-gradient(90deg, var(--copper) 0%, var(--copper-pale) 60%, transparent 100%)',
          marginBottom: '24px',
        }}
      />

      {/* Service type tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
        }}
        aria-label="Service type"
      >
        {SERVICE_TABS.map(({ key, label }) => {
          const isActive = serviceType === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setServiceType(key)}
              style={{
                flex: 1,
                minHeight: '44px',
                padding: '12px 8px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: isActive ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                background: isActive ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
                transition: 'border-color 0.2s ease, background 0.2s ease, color 0.2s ease',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Multi-day redirect message */}
      {serviceType === 'daily' ? (
        <div
          style={{
            padding: '16px',
            background: 'var(--anthracite-mid)',
            border: '1px solid var(--anthracite-light)',
            marginBottom: '24px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '14px',
              fontWeight: 300,
              color: 'var(--offwhite)',
              marginBottom: '12px',
              lineHeight: 1.75,
            }}
          >
            Multi-day hire uses a separate booking form — redirecting...
          </p>
          <Link
            href="/book/multi-day"
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 400,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--copper)',
              textDecoration: 'none',
            }}
          >
            Open multi-day form →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          {/* From input */}
          <AddressInputNew
            label="FROM"
            placeholder="From — city, airport or address"
            value={from}
            onSelect={(place: PlaceResult) => setFrom(place)}
            onClear={() => setFrom(null)}
            ariaLabel="From — city, airport or address"
          />

          {/* To input — hidden for hourly, shown for transfer */}
          {serviceType === 'transfer' && (
            <AddressInputNew
              label="TO"
              placeholder="To — city, airport or address"
              value={to}
              onSelect={(place: PlaceResult) => setTo(place)}
              onClear={() => setTo(null)}
              ariaLabel="To — city, airport or address"
            />
          )}

          {/* Hours dropdown for hourly */}
          {serviceType === 'hourly' && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 400,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: 'var(--copper-light)',
                  marginBottom: '8px',
                }}
              >
                HOURS
              </label>
              <select
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  background: 'var(--anthracite-mid)',
                  border: '1px solid var(--anthracite-light)',
                  color: 'var(--offwhite)',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '14px',
                  fontWeight: 300,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? 'hour' : 'hours'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="quote-step-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {serviceType === 'daily' ? (
          <Link
            href="/book/multi-day"
            className="btn-primary"
            style={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44 }}
          >
            {continueLabel}
          </Link>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={!canProceed}
            onClick={handleContinue}
            aria-disabled={!canProceed}
            style={{
              width: '100%',
              minHeight: 44,
              opacity: canProceed ? 1 : 0.4,
              cursor: canProceed ? 'pointer' : 'not-allowed',
            }}
          >
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  )
}
