'use client'

import useDebouncedPrice from '@/lib/use-debounced-price'
import { useMediaQuery } from '@/lib/use-media-query'
import QuoteWizard from './QuoteWizard'
import QuoteDesktop from './QuoteDesktop'

interface QuoteCalculatorProps {
  onCalculate?: () => void
  onBook?: () => void
}

export default function QuoteCalculator({
  onCalculate = () => {},
  onBook = () => {},
}: QuoteCalculatorProps) {
  useDebouncedPrice()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return isDesktop ? (
    <QuoteDesktop data-testid="quote-desktop" onBook={onBook} />
  ) : (
    <QuoteWizard data-testid="quote-wizard" onCalculate={onCalculate} />
  )
}
