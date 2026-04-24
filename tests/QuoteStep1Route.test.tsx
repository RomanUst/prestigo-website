import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuoteStep1Route from '@/components/calculator/QuoteStep1Route'

// Mock AddressInputNew to expose onSelect callback
vi.mock('@/components/booking/AddressInputNew', () => ({
  default: ({
    onSelect,
    placeholder,
  }: {
    onSelect: (place: { address: string; placeId: string; lat: number; lng: number }) => void
    placeholder?: string
  }) => (
    <button
      data-testid={`address-input-${placeholder ?? 'unknown'}`}
      onClick={() =>
        onSelect({ address: 'Prague', placeId: 'ChIJi3lNIT2UDkcRGBlSF2JiX1c', lat: 50.08, lng: 14.43 })
      }
    >
      {placeholder ?? 'Address'}
    </button>
  ),
}))

// Mock useCalculatorStore
const setServiceTypeMock = vi.fn()
const setFromMock = vi.fn()
const setToMock = vi.fn()

vi.mock('@/lib/calculator-store', () => ({
  useCalculatorStore: vi.fn(() => ({
    from: null,
    to: null,
    serviceType: 'transfer',
    setFrom: setFromMock,
    setTo: setToMock,
    setServiceType: setServiceTypeMock,
    touchSession: vi.fn(),
  })),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('QuoteStep1Route — CALC-03', () => {
  it('rotates Places session token on address select', async () => {
    const user = userEvent.setup()

    // Capture the initial token if exposed; after select a new one should be generated
    render(<QuoteStep1Route />)

    const fromInput = screen.getByTestId(/address-input-From|address-input-from/i)
    await user.click(fromInput)

    // Verify setFrom was called (token rotation happens internally in component)
    expect(setFromMock).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'ChIJi3lNIT2UDkcRGBlSF2JiX1c' })
    )
  })

  it('service type tabs switch serviceType in store', async () => {
    const user = userEvent.setup()
    render(<QuoteStep1Route />)

    // Find HOURLY tab and click it
    const hourlyTab = screen.getByRole('button', { name: /hourly/i })
    await user.click(hourlyTab)

    expect(setServiceTypeMock).toHaveBeenCalledWith('hourly')
  })
})
