import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { BookingChangeHistory } from '@/components/admin/BookingChangeHistory'

// ── Global fetch mock ────────────────────────────────────────────────────────

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch
})

const BOOKING_ID = '00000000-0000-0000-0000-000000000042'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) }
}

describe('FOLLOW-02: BookingChangeHistory — empty state', () => {
  it('shows the empty-state heading and body when rows is []', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [] }))

    render(<BookingChangeHistory bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('No changes recorded yet.')).toBeTruthy())
    expect(screen.getByText('Edits to this booking will appear here.')).toBeTruthy()
    expect(mockFetch).toHaveBeenCalledWith(`/api/admin/bookings/${BOOKING_ID}/audit-log`)
  })
})

describe('FOLLOW-02: BookingChangeHistory — loading state', () => {
  it('shows "Loading history…" while the fetch is in flight', async () => {
    let resolveFetch!: (value: unknown) => void
    mockFetch.mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))

    render(<BookingChangeHistory bookingId={BOOKING_ID} />)

    expect(screen.getByText('Loading history…')).toBeTruthy()

    await act(async () => {
      resolveFetch(jsonResponse({ rows: [] }))
    })

    await waitFor(() => expect(screen.getByText('No changes recorded yet.')).toBeTruthy())
  })
})

describe('FOLLOW-02: BookingChangeHistory — error + retry', () => {
  it('shows the error copy and re-issues the fetch when retry is clicked', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network_error'))

    render(<BookingChangeHistory bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText("Couldn't load change history — try again.")).toBeTruthy()
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)

    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [] }))
    const retryBtn = screen.getByRole('button', { name: /retry/i })

    await act(async () => {
      fireEvent.click(retryBtn)
    })

    await waitFor(() => expect(screen.getByText('No changes recorded yet.')).toBeTruthy())
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('also shows the error copy on a non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false))

    render(<BookingChangeHistory bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText("Couldn't load change history — try again.")).toBeTruthy()
    )
  })
})

describe('FOLLOW-02: BookingChangeHistory — populated + grouping', () => {
  it('groups rows by shared changed_at, renders newest-first, shows old -> new and notified badge', async () => {
    const rows = [
      // Older group — 2 fields changed in one PATCH
      {
        id: 'row-1',
        field: 'pickup_date',
        old_value: '2026-01-01',
        new_value: '2026-01-05',
        operator_id: 'operator-a',
        changed_at: '2026-01-10T10:00:00.000Z',
        notified: false,
      },
      {
        id: 'row-2',
        field: 'pickup_time',
        old_value: '10:00',
        new_value: '12:00',
        operator_id: 'operator-a',
        changed_at: '2026-01-10T10:00:00.000Z',
        notified: false,
      },
      // Newer group — 1 field changed
      {
        id: 'row-3',
        field: 'client_email',
        old_value: 'old@example.com',
        new_value: 'new@example.com',
        operator_id: 'operator-b',
        changed_at: '2026-01-15T09:30:00.000Z',
        notified: true,
      },
    ]
    mockFetch.mockResolvedValue(jsonResponse({ rows }))

    render(<BookingChangeHistory bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText(/Pickup date/)).toBeTruthy())

    // Two grouped headers (one per distinct changed_at)
    expect(screen.getByText(/operator-a/)).toBeTruthy()
    expect(screen.getByText(/operator-b/)).toBeTruthy()

    // Newest-first: operator-b's group (2026-01-15) renders before operator-a's (2026-01-10)
    const bodyText = document.body.textContent ?? ''
    expect(bodyText.indexOf('operator-b')).toBeLessThan(bodyText.indexOf('operator-a'))

    // old -> new text for a field entry
    expect(screen.getByText(/Email: old@example\.com → new@example\.com/)).toBeTruthy()
    expect(screen.getByText(/Pickup date: 2026-01-01 → 2026-01-05/)).toBeTruthy()
    expect(screen.getByText(/Pickup time: 10:00 → 12:00/)).toBeTruthy()

    // Notified badges
    expect(screen.getByText('Notified')).toBeTruthy()
    expect(screen.getAllByText('Not notified').length).toBe(2)
  })

  it('does not refetch on a parent re-render (lazy, fetch-once guard)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [] }))

    const { rerender } = render(<BookingChangeHistory bookingId={BOOKING_ID} />)
    await waitFor(() => expect(screen.getByText('No changes recorded yet.')).toBeTruthy())

    rerender(<BookingChangeHistory bookingId={BOOKING_ID} />)
    rerender(<BookingChangeHistory bookingId={BOOKING_ID} />)

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
