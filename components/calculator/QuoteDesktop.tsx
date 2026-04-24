'use client'

import Link from 'next/link'
import { useCalculatorStore } from '@/lib/calculator-store'
import QuoteStep1Route from './QuoteStep1Route'
import QuoteStep2Date from './QuoteStep2Date'
import QuoteStep3Pax from './QuoteStep3Pax'
import QuoteStep4Class from './QuoteStep4Class'

interface QuoteDesktopProps {
  onBook?: () => void
  'data-testid'?: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}

export default function QuoteDesktop({ onBook = noop, 'data-testid': testId }: QuoteDesktopProps) {
  const priceBreakdown = useCalculatorStore((s) => s.priceBreakdown)
  const vehicleClass = useCalculatorStore((s) => s.vehicleClass)
  const quoteMode = useCalculatorStore((s) => s.quoteMode)

  const allFieldsValid = useCalculatorStore((s) => {
    const { from, to, serviceType, date, time } = s
    const routeReady =
      (serviceType === 'transfer' && from !== null && to !== null) ||
      (serviceType === 'hourly' && from !== null)
    return routeReady && date !== null && time !== null
  })

  const selectedPrice =
    vehicleClass && priceBreakdown && priceBreakdown[vehicleClass]
      ? priceBreakdown[vehicleClass].total
      : null

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        gap: '32px',
        alignItems: 'flex-start',
      }}
    >
      {/* Hide step footers in desktop form */}
      <style>{`.quote-desktop-form .quote-step-footer { display: none; }`}</style>

      {/* Form column */}
      <div
        className="quote-desktop-form"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        <QuoteStep1Route onNext={noop} onBack={noop} showBack={false} />
        <QuoteStep2Date onNext={noop} onBack={noop} />
        <QuoteStep3Pax onNext={noop} onBack={noop} />
        <QuoteStep4Class onNext={noop} onBack={noop} />
      </div>

      {/* Price panel column */}
      <div
        id="quote-live-price-panel"
        style={{
          width: '380px',
          flexShrink: 0,
          position: 'sticky',
          top: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          padding: '24px',
        }}
      >
        {/* Price display area */}
        {priceBreakdown === null && !quoteMode ? (
          /* Skeleton */
          <div
            className="skeleton-shimmer"
            style={{ height: '80px', width: '100%' }}
          />
        ) : quoteMode ? (
          /* Quote mode fallback */
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '14px',
                fontWeight: 400,
                color: 'var(--offwhite)',
                marginBottom: '8px',
                letterSpacing: '0.03em',
              }}
            >
              Unable to calculate fare automatically
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                fontWeight: 300,
                color: 'var(--warmgrey)',
                lineHeight: 1.75,
                marginBottom: '16px',
              }}
            >
              Enter your details and we&apos;ll confirm your price by email.
            </p>
            <Link
              href="/contact"
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minHeight: 44,
                textAlign: 'center',
              }}
            >
              GET A CUSTOM QUOTE →
            </Link>
          </div>
        ) : selectedPrice !== null ? (
          /* Show selected vehicle price */
          <div
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: '32px',
              fontWeight: 300,
              color: 'var(--copper)',
              lineHeight: 1.1,
            }}
          >
            €{selectedPrice}
          </div>
        ) : (
          /* No vehicle class selected yet */
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 300,
              color: 'var(--warmgrey)',
            }}
          >
            Select a vehicle class to see your fare
          </p>
        )}

        {/* Book CTA */}
        <button
          type="button"
          className="btn-primary"
          disabled={!allFieldsValid}
          onClick={allFieldsValid ? onBook : undefined}
          aria-disabled={!allFieldsValid}
          style={{
            width: '100%',
            minHeight: 44,
            opacity: allFieldsValid ? 1 : 0.4,
            cursor: allFieldsValid ? 'pointer' : 'not-allowed',
          }}
        >
          BOOK NOW — PAY ONLINE
        </button>
      </div>
    </div>
  )
}
