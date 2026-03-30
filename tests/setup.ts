import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => children,
  PaymentElement: () => React.createElement('div', { 'data-testid': 'payment-element' }),
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))
