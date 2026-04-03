import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock @tanstack/react-table
vi.mock('@tanstack/react-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-table')>()
  return actual
})

// Mock fetch for bookings API
describe('BookingsTable mobile card layout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookings: [], total: 0 }),
    }))
  })

  it('renders card layout wrapper with md:hidden class when isMobile is true', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    window.dispatchEvent(new Event('resize'))

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)
    const mobileCards = screen.getByTestId('mobile-cards')
    expect(mobileCards).toBeDefined()
    expect(mobileCards.className).toContain('md:hidden')
  })

  it('renders table wrapper with hidden md:block class for desktop', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    window.dispatchEvent(new Event('resize'))

    const { default: BookingsTable } = await import('@/components/admin/BookingsTable')
    render(<BookingsTable />)
    const desktopTable = screen.getByTestId('desktop-table')
    expect(desktopTable).toBeDefined()
    expect(desktopTable.className).toContain('hidden')
    expect(desktopTable.className).toContain('md:block')
  })
})
