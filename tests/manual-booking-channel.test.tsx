import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ManualBookingForm from '@/components/admin/ManualBookingForm'

// AddressInput loads Google Places. Replace it with a button that selects a
// fixed place so the submit path can get past the pickup-address check.
vi.mock('@/components/booking/AddressInput', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label: string
    onSelect: (p: { address: string; placeId: string; lat: number; lng: number }) => void
  }) => (
    <button
      type="button"
      onClick={() => onSelect({ address: 'Prague Airport', placeId: 'pid', lat: 50.1, lng: 14.26 })}
    >
      {`pick ${label}`}
    </button>
  ),
}))

function renderForm() {
  return render(<ManualBookingForm open onClose={() => {}} onCreated={() => {}} />)
}

function channelSelect(): HTMLSelectElement {
  const label = screen.getByText('CHANNEL')
  const select = label.parentElement?.querySelector('select')
  if (!select) throw new Error('CHANNEL select not found')
  return select as HTMLSelectElement
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('form not found')
  fireEvent.submit(form)
}

describe('ManualBookingForm — CHANNEL select (D-08)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ booking: { id: 'b1' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the five options and an empty placeholder selected by default', () => {
    renderForm()
    const select = channelSelect()
    expect(select.value).toBe('')
    const options = Array.from(select.options)
    expect(options.map((o) => o.textContent)).toEqual([
      'Select channel…',
      'WhatsApp',
      'Phone',
      'Email',
      'Partner',
      'Other',
    ])
    expect(options.map((o) => o.value)).toEqual(['', 'whatsapp', 'phone', 'email', 'partner', 'other'])
    expect(options[0].disabled).toBe(true)
  })

  it('blocks submit with a visible error and no fetch when no channel is chosen', () => {
    const { container } = renderForm()
    fireEvent.click(screen.getByText('pick PICKUP ADDRESS'))
    submitForm(container)
    expect(screen.getByText('Please choose the booking channel.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the chosen channel in the POST body', async () => {
    const { container } = renderForm()
    fireEvent.click(screen.getByText('pick PICKUP ADDRESS'))
    // hourly trips need no calculated distance, so submit gets as far as fetch
    const tripType = screen.getByText('TRIP TYPE').parentElement?.querySelector('select') as HTMLSelectElement
    fireEvent.change(tripType, { target: { value: 'hourly' } })
    fireEvent.change(channelSelect(), { target: { value: 'email' } })
    submitForm(container)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/bookings')
    expect(JSON.parse(init.body).channel).toBe('email')
    expect(screen.queryByText('Please choose the booking channel.')).toBeNull()
  })
})
