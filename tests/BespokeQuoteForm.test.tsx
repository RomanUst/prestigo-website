import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BespokeQuoteForm from '@/components/calculator/BespokeQuoteForm'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('BespokeQuoteForm', () => {
  it('renders all required fields including 4-option occasion radio group', () => {
    render(<BespokeQuoteForm />)

    // 4 occasion radio options
    expect(screen.getByRole('radio', { name: /wedding/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /corporate/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /airport.?vip/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /other/i })).toBeInTheDocument()

    // Other required fields
    expect(screen.getByRole('spinbutton')).toBeInTheDocument() // guests number input
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /special.?request/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send|submit/i })).toBeInTheDocument()
  })

  it('renders occasion as fieldset/legend/radio group, not a select', () => {
    render(<BespokeQuoteForm />)

    // Must be radio inputs, not a select
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThanOrEqual(4)

    // Must not have a select for occasion
    const selects = document.querySelectorAll('select[name="occasion"]')
    expect(selects.length).toBe(0)

    // Must be inside a fieldset with a legend
    const fieldset = document.querySelector('fieldset')
    expect(fieldset).not.toBeNull()
    expect(fieldset!.querySelector('legend')).not.toBeNull()
  })

  it('submits POST to /api/bespoke-quote with JSON body when valid', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    render(<BespokeQuoteForm />)

    await user.click(screen.getByRole('radio', { name: /wedding/i }))

    const guestsInput = screen.getByRole('spinbutton')
    await user.clear(guestsInput)
    await user.type(guestsInput, '4')

    await user.type(screen.getByLabelText(/date/i), '2026-06-15')
    await user.type(screen.getByLabelText(/time/i), '14:30')
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')

    await user.click(screen.getByRole('button', { name: /send|submit/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/bespoke-quote')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body.occasion).toBe('wedding')
    expect(typeof body.guests).toBe('number')
    expect(body.date).toBeDefined()
    expect(body.time).toBeDefined()
    expect(body.name).toBeDefined()
    expect(body.email).toBeDefined()
  })

  it('shows success message after 200 response', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    render(<BespokeQuoteForm />)

    await user.click(screen.getByRole('radio', { name: /wedding/i }))

    const guestsInput = screen.getByRole('spinbutton')
    await user.clear(guestsInput)
    await user.type(guestsInput, '2')

    await user.type(screen.getByLabelText(/date/i), '2026-06-15')
    await user.type(screen.getByLabelText(/time/i), '14:30')
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')

    await user.click(screen.getByRole('button', { name: /send|submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/received|thank/i)).toBeInTheDocument()
    })
  })

  it('shows specific error messages for 400 / 429 / 502 responses', async () => {
    const user = userEvent.setup()

    // Test 429
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many requests' }),
    })

    render(<BespokeQuoteForm />)

    await user.click(screen.getByRole('radio', { name: /wedding/i }))

    const guestsInput = screen.getByRole('spinbutton')
    await user.clear(guestsInput)
    await user.type(guestsInput, '2')

    await user.type(screen.getByLabelText(/date/i), '2026-06-15')
    await user.type(screen.getByLabelText(/time/i), '14:30')
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')

    await user.click(screen.getByRole('button', { name: /send|submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/too many/i)).toBeInTheDocument()
    })
  })

  it('renders hidden honeypot input named "website" and includes it in payload', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    render(<BespokeQuoteForm />)

    // Honeypot must be present and hidden
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement
    expect(honeypot).not.toBeNull()
    const isHidden =
      honeypot.style.display === 'none' ||
      honeypot.getAttribute('aria-hidden') === 'true' ||
      honeypot.tabIndex === -1 ||
      honeypot.getAttribute('class')?.includes('sr-only')
    expect(isHidden).toBe(true)

    // Submit and verify honeypot is in payload
    await user.click(screen.getByRole('radio', { name: /wedding/i }))

    const guestsInput = screen.getByRole('spinbutton')
    await user.clear(guestsInput)
    await user.type(guestsInput, '2')

    await user.type(screen.getByLabelText(/date/i), '2026-06-15')
    await user.type(screen.getByLabelText(/time/i), '14:30')
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')

    await user.click(screen.getByRole('button', { name: /send|submit/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect('website' in body).toBe(true)
  })

  it('disables submit button while request is in flight', async () => {
    const user = userEvent.setup()
    // Never resolve so we can check the in-flight state
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))

    render(<BespokeQuoteForm />)

    await user.click(screen.getByRole('radio', { name: /wedding/i }))

    const guestsInput = screen.getByRole('spinbutton')
    await user.clear(guestsInput)
    await user.type(guestsInput, '2')

    await user.type(screen.getByLabelText(/date/i), '2026-06-15')
    await user.type(screen.getByLabelText(/time/i), '14:30')
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe')
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')

    await user.click(screen.getByRole('button', { name: /send|submit/i }))

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /send|submit|sending/i })
      expect(btn).toBeDisabled()
    })
  })
})
