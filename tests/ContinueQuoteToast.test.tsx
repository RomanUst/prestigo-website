import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContinueQuoteToast from '@/components/calculator/ContinueQuoteToast'

// We'll vary the store state per test
const mockStoreState = vi.fn()

vi.mock('@/lib/calculator-store', () => ({
  useCalculatorStore: () => mockStoreState(),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ContinueQuoteToast — CALC-15', () => {
  it('shows toast when store has valid TTL from+to', () => {
    mockStoreState.mockReturnValue({
      from: { address: 'Prague', placeId: 'place-1', lat: 50.08, lng: 14.43 },
      to: { address: 'Vienna', placeId: 'place-2', lat: 48.20, lng: 16.37 },
      expiresAt: Date.now() + 86400000, // 24h in the future
    })

    render(<ContinueQuoteToast />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does NOT show toast when TTL expired', () => {
    mockStoreState.mockReturnValue({
      from: { address: 'Prague', placeId: 'place-1', lat: 50.08, lng: 14.43 },
      to: { address: 'Vienna', placeId: 'place-2', lat: 48.20, lng: 16.37 },
      expiresAt: Date.now() - 1000, // 1s in the past — expired
    })

    render(<ContinueQuoteToast />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
