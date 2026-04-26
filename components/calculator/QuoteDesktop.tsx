'use client'

import { useCalculatorStore } from '@/lib/calculator-store'
import QuoteStep1Route from './QuoteStep1Route'
import QuoteStep2Date from './QuoteStep2Date'
import QuoteStep3Pax from './QuoteStep3Pax'
import QuoteStep4Class from './QuoteStep4Class'
import QuoteResult from './QuoteResult'

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
  const from = useCalculatorStore((s) => s.from)
  const to = useCalculatorStore((s) => s.to)
  const date = useCalculatorStore((s) => s.date)
  const time = useCalculatorStore((s) => s.time)
  const passengers = useCalculatorStore((s) => s.passengers)
  const serviceType = useCalculatorStore((s) => s.serviceType)
  const matchedRouteSlug = useCalculatorStore((s) => s.matchedRouteSlug)
  const distanceKm = useCalculatorStore((s) => s.distanceKm)

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
        }}
      >
        <QuoteResult
          onBook={onBook}
          priceBreakdown={priceBreakdown}
          vehicleClass={vehicleClass}
          quoteMode={quoteMode}
          from={from}
          to={to}
          date={date}
          time={time}
          passengers={passengers}
          serviceType={serviceType}
          matchedRouteSlug={matchedRouteSlug}
          distanceKm={distanceKm}
        />
      </div>
    </div>
  )
}
