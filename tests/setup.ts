import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn()

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
