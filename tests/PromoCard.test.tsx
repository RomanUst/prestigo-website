import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PromoCard from '@/components/admin/PromoCard'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

const defaultInitial = { active: true, regularPriceEur: 69, promoPriceEur: 59 }

describe('PromoCard', () => {
  it('renders toggle, regular-price input, promo-price input, and Save button', () => {
    render(<PromoCard initial={defaultInitial} />)
    expect(screen.getByRole('switch')).toBeTruthy()
    expect(screen.getByLabelText(/regular price/i)).toBeTruthy()
    expect(screen.getByLabelText(/promo price/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('dims promo input when active=false (opacity 0.5 + pointer-events: none)', () => {
    render(<PromoCard initial={{ ...defaultInitial, active: false }} />)
    const promoInput = screen.getByLabelText(/promo price/i) as HTMLInputElement
    expect(promoInput.style.opacity).toBe('0.5')
    expect(promoInput.style.pointerEvents).toBe('none')
  })

  it('shows promo input as interactive when active=true', () => {
    render(<PromoCard initial={defaultInitial} />)
    const promoInput = screen.getByLabelText(/promo price/i) as HTMLInputElement
    expect(promoInput.style.pointerEvents).not.toBe('none')
  })

  it('PUTs to /api/admin/promo with correct body on Save', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true })
    })
    render(<PromoCard initial={defaultInitial} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/promo', expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ active: true, regularPriceEur: 69, promoPriceEur: 59 }),
      }))
    })
  })

  it('shows 422 inline error when server returns 422', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 422, json: async () => ({ error: 'Promo price must not exceed regular price.' })
    })
    render(<PromoCard initial={defaultInitial} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(screen.getByText(/promo price must not exceed regular price/i)).toBeTruthy()
    })
  })

  it('shows success toast on 200', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true })
    })
    render(<PromoCard initial={defaultInitial} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(screen.getByText(/airport promo saved/i)).toBeTruthy()
    })
  })
})
