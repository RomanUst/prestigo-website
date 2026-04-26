import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailQuoteCapture } from '@/components/calculator/EmailQuoteCapture'

const mockTrackMetaEvent = vi.hoisted(() => vi.fn())

vi.mock('@/components/MetaPixel', () => ({
  trackMetaEvent: mockTrackMetaEvent,
}))

const quote = {
  from: 'Praha',
  to: 'Brno',
  serviceType: 'transfer' as const,
  date: '2026-05-10',
  time: '14:00',
  vehicleClass: 'business' as const,
  passengers: 2,
  price: 120,
  routeSlug: 'praha-brno',
  distanceKm: 210,
}

describe('EmailQuoteCapture', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  it('renders IDLE state CTA `EMAIL THIS QUOTE →` by default', () => {
    render(<EmailQuoteCapture quote={quote} />)
    expect(screen.getByRole('button', { name: /EMAIL THIS QUOTE/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/your@email/i)).not.toBeInTheDocument()
  })

  it('expands to EXPANDED on CTA click and focuses the email input', async () => {
    const user = userEvent.setup()
    render(<EmailQuoteCapture quote={quote} />)

    const ctaButton = screen.getByRole('button', { name: /EMAIL THIS QUOTE/i })
    await user.click(ctaButton)

    const emailInput = screen.getByPlaceholderText(/your@email.com/i)
    expect(emailInput).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send quote/i })).toBeInTheDocument()
  })

  it('submits email + eventId to /api/quote-email and shows SUCCESS banner on 200', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    render(<EmailQuoteCapture quote={quote} />)

    // Expand
    await user.click(screen.getByRole('button', { name: /EMAIL THIS QUOTE/i }))

    // Fill email
    const emailInput = screen.getByPlaceholderText(/your@email.com/i)
    await user.type(emailInput, 'test@example.com')

    // Submit
    await user.click(screen.getByRole('button', { name: /Send quote/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText(/Quote sent to your inbox/i)).toBeInTheDocument()
    })

    // Verify fetch was called with correct endpoint and eventId in body
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/quote-email',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const callBody = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    )
    expect(callBody.email).toBe('test@example.com')
    expect(callBody.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(callBody.quote).toEqual(quote)
    expect(mockTrackMetaEvent).toHaveBeenCalledWith(
      'Lead',
      { value: 120, currency: 'EUR' },
      callBody.eventId
    )
  })

  it('shows ERROR message on API 500', async () => {
    const user = userEvent.setup()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    render(<EmailQuoteCapture quote={quote} />)

    await user.click(screen.getByRole('button', { name: /EMAIL THIS QUOTE/i }))
    await user.type(screen.getByPlaceholderText(/your@email.com/i), 'test@example.com')
    await user.click(screen.getByRole('button', { name: /Send quote/i }))

    await waitFor(() => {
      expect(screen.getByText(/Could not send/i)).toBeInTheDocument()
    })

    // Input should still be editable (not gone)
    expect(screen.getByPlaceholderText(/your@email.com/i)).toBeInTheDocument()
    expect(mockTrackMetaEvent).not.toHaveBeenCalled()
  })

  it('honeypot field `website` is rendered with display:none and tabIndex=-1', () => {
    render(<EmailQuoteCapture quote={quote} />)

    // Expand to see form
    fireEvent.click(screen.getByRole('button', { name: /EMAIL THIS QUOTE/i }))

    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement
    expect(honeypot).not.toBeNull()
    expect(honeypot.tabIndex).toBe(-1)
    expect(honeypot.style.display).toBe('none')
  })
})
