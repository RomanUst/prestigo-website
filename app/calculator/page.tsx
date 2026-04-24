import type { Metadata } from 'next'
import QuoteCalculator from '@/components/calculator/QuoteCalculator'
import ContinueQuoteToast from '@/components/calculator/ContinueQuoteToast'

export const metadata: Metadata = {
  title: 'Instant Price Quote — Prestigo',
  description:
    'Get an instant fare quote for your Prestigo chauffeur trip. Transparent all-inclusive pricing across Business, First Class, and Business Van vehicles.',
}

export default function CalculatorPage() {
  return (
    <main style={{ padding: '48px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 'clamp(24px, 4vw, 32px)',
          fontWeight: 300,
          color: 'var(--offwhite)',
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        Get Your Fare Instantly
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--warmgrey)',
          textAlign: 'center',
          marginBottom: 32,
        }}
      >
        Transparent pricing for every trip. No hidden fees.
      </p>
      <QuoteCalculator />
      <ContinueQuoteToast />
    </main>
  )
}
