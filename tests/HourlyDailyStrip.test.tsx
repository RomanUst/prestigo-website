import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HourlyDailyStrip from '@/components/pricing/HourlyDailyStrip'

describe('HourlyDailyStrip', () => {
  it('renders three rows with DB-sourced prices', () => {
    const { container } = render(
      <HourlyDailyStrip hourlyRate={{ business: 49, first_class: 120, business_van: 76 }} />
    )
    expect(screen.getByText(/49/)).toBeTruthy()
    expect(screen.getByText(/120/)).toBeTruthy()
    expect(screen.getByText(/76/)).toBeTruthy()
    expect(container).toBeTruthy()
  })

  it('links to /book?type=hourly', () => {
    const { container } = render(
      <HourlyDailyStrip hourlyRate={{ business: 49, first_class: 120, business_van: 76 }} />
    )
    const anchor = container.querySelector('a[href="/book?type=hourly"]')
    expect(anchor).toBeTruthy()
  })

  it('renders Business / First Class / Business Van labels', () => {
    render(
      <HourlyDailyStrip hourlyRate={{ business: 49, first_class: 120, business_van: 76 }} />
    )
    expect(screen.getByText('Business')).toBeTruthy()
    expect(screen.getByText('First Class')).toBeTruthy()
    expect(screen.getByText('Business Van')).toBeTruthy()
  })
})
