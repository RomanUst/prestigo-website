import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

if (typeof window !== 'undefined') {
  // jsdom does not implement scrollIntoView — mock it globally
  window.HTMLElement.prototype.scrollIntoView = vi.fn()

  // jsdom does not implement matchMedia — mock it using window.innerWidth
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      // Parse min-width from query like '(min-width: 1024px)'
      const minWidthMatch = query.match(/min-width:\s*(\d+)px/)
      const minWidth = minWidthMatch ? parseInt(minWidthMatch[1], 10) : 0
      const matches = window.innerWidth >= minWidth
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    }),
  })
}

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => React.createElement('div', { 'data-testid': 'payment-element' }),
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))
