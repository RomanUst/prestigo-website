import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { FlightStatusBlock } from '@/components/admin/FlightStatusBlock'

// ── Global fetch mock ────────────────────────────────────────────────────────

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch
})

// ── Default props ─────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  bookingId: '00000000-0000-0000-0000-000000000001',
  flightIata: 'OK123',
  initialStatus: 'scheduled' as string | null,
  initialEstimatedArrival: '2026-04-15T14:35:00.000' as string | null,
  initialDelayMinutes: 0 as number | null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FLIGHT-05: FlightStatusBlock — display', () => {
  it('renders status badge, arrival time, delay when all data present', () => {
    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialStatus="delayed"
        initialEstimatedArrival="2026-04-15T15:20:00.000"
        initialDelayMinutes={25}
      />
    )
    expect(screen.getByText('DELAYED')).toBeTruthy()
    expect(screen.getByText(/Arrival:.*15:20/)).toBeTruthy()
    expect(screen.getByText(/Delay:.*25.*min/)).toBeTruthy()
  })

  it('does not render delay line when delay is 0', () => {
    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialDelayMinutes={0}
      />
    )
    expect(screen.queryByText(/Delay:/)).toBeNull()
  })

  it('does not render delay line when delay is null', () => {
    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialDelayMinutes={null}
      />
    )
    expect(screen.queryByText(/Delay:/)).toBeNull()
  })

  it('shows UNKNOWN badge when status is null', () => {
    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialStatus={null}
      />
    )
    expect(screen.getByText('UNKNOWN')).toBeTruthy()
  })

  it('arrival shows dash when estimatedArrival is null', () => {
    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialEstimatedArrival={null}
      />
    )
    // Should show "Arrival: —"
    expect(screen.getByText(/Arrival:/)).toBeTruthy()
    expect(screen.getByText(/—/)).toBeTruthy()
  })
})

describe('FLIGHT-06: FlightStatusBlock — refresh UX', () => {
  it('Refresh button disables during fetch', async () => {
    let resolveRefresh!: (value: unknown) => void
    mockFetch.mockReturnValue(
      new Promise(resolve => { resolveRefresh = resolve })
    )

    render(<FlightStatusBlock {...DEFAULT_PROPS} />)
    const btn = screen.getByRole('button', { name: /refresh/i })
    expect(btn).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(btn)
    })

    expect(btn).toBeDisabled()

    await act(async () => {
      resolveRefresh({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          flight_status: 'landed',
          flight_estimated_arrival: '2026-04-15T16:00:00.000',
          flight_delay_minutes: 0,
        }),
      })
    })

    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  it('block updates in place after successful refresh', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        flight_status: 'landed',
        flight_estimated_arrival: '2026-04-15T16:00:00.000',
        flight_delay_minutes: 0,
      }),
    })

    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialStatus="scheduled"
        initialEstimatedArrival="2026-04-15T14:35:00.000"
        initialDelayMinutes={null}
      />
    )

    const btn = screen.getByRole('button', { name: /refresh/i })

    await act(async () => {
      fireEvent.click(btn)
    })

    await waitFor(() => expect(screen.getByText('LANDED')).toBeTruthy())
    expect(screen.getByText(/Arrival:.*16:00/)).toBeTruthy()
    expect(screen.getByText(/Updated/)).toBeTruthy()
  })

  it('shows inline error on refresh failure, old data preserved', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ ok: false, error: 'API_ERROR' }),
    })

    render(
      <FlightStatusBlock
        {...DEFAULT_PROPS}
        initialStatus="scheduled"
        initialEstimatedArrival="2026-04-15T14:35:00.000"
        initialDelayMinutes={null}
      />
    )

    const btn = screen.getByRole('button', { name: /refresh/i })

    await act(async () => {
      fireEvent.click(btn)
    })

    await waitFor(() => expect(screen.getByText(/Refresh failed/)).toBeTruthy())
    // Old status still shown
    expect(screen.getByText('SCHEDULED')).toBeTruthy()
  })
})
