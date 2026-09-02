import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'

describe('DriverAssignmentSection — Phase 53 prop evolution', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('returns null when bookingStatus is completed (D-01)', () => {
    const { container } = render(
      <DriverAssignmentSection bookingId="b1" bookingStatus="completed" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when bookingStatus is cancelled (D-01)', () => {
    const { container } = render(
      <DriverAssignmentSection bookingId="b1" bookingStatus="cancelled" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the DRIVER section for confirmed bookings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drivers: [], assignment: null }),
    }) as unknown as typeof fetch
    render(<DriverAssignmentSection bookingId="b1" bookingStatus="confirmed" />)
    // CSS textTransform is not applied in jsdom — match case-insensitively
    await waitFor(() => expect(screen.getByText(/^driver$/i)).toBeDefined())
  })

  it('renders the DRIVER section for pending bookings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drivers: [], assignment: null }),
    }) as unknown as typeof fetch
    render(<DriverAssignmentSection bookingId="b1" bookingStatus="pending" />)
    await waitFor(() => expect(screen.getByText(/^driver$/i)).toBeDefined())
  })

  it('invokes onAssigned("assigned") after a successful POST (D-06)', async () => {
    const onAssigned = vi.fn()
    const driverId = '11111111-1111-1111-1111-111111111111'
    // Sequence:
    // 1. GET /api/admin/bookings/b1/assignment  -> { assignment: null }
    // 2. GET /api/admin/drivers                 -> { data: [driver] }
    // 3. POST /api/admin/bookings/b1/assign     -> 201 ok
    // 4. GET /api/admin/bookings/b1/assignment  -> { assignment: {...} }
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assignment: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: driverId, name: 'Test Driver', active: true }] }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ assignment: { id: 'a1', driver_id: driverId, status: 'pending', token: 't' }, booking_status: 'assigned' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assignment: { id: 'a1', driver_id: driverId, status: 'pending', token: 't' } }) }) as unknown as typeof fetch

    render(
      <DriverAssignmentSection
        bookingId="b1"
        bookingStatus="confirmed"
        onAssigned={onAssigned}
      />
    )

    await waitFor(() => expect(screen.getByText(/^driver$/i)).toBeDefined())
    const select = await screen.findByRole('combobox')
    await userEvent.selectOptions(select, driverId)
    const assignBtn = screen.getByRole('button', { name: /^assign$/i })
    await userEvent.click(assignBtn)

    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith('assigned'))
    expect(onAssigned).toHaveBeenCalledTimes(1)
  })

  it('does NOT invoke onAssigned when POST fails', async () => {
    const onAssigned = vi.fn()
    const driverId = '22222222-2222-2222-2222-222222222222'
    // Sequence:
    // 1. GET /api/admin/bookings/b1/assignment  -> { assignment: null }
    // 2. GET /api/admin/drivers                 -> { data: [driver] }
    // 3. POST /api/admin/bookings/b1/assign     -> 500 error
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assignment: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: driverId, name: 'Test Driver', active: true }] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) }) as unknown as typeof fetch

    render(
      <DriverAssignmentSection
        bookingId="b1"
        bookingStatus="confirmed"
        onAssigned={onAssigned}
      />
    )
    await waitFor(() => expect(screen.getByText(/^driver$/i)).toBeDefined())
    const select = await screen.findByRole('combobox')
    await userEvent.selectOptions(select, driverId)
    await userEvent.click(screen.getByRole('button', { name: /^assign$/i }))

    // wait for the error mode to settle (2 initial loads + 1 failed POST = 3)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    expect(onAssigned).not.toHaveBeenCalled()
  })

  it('renders Copy Trip Link in assigned mode and copies the trip URL (D-10b)', async () => {
    const driverId = '33333333-3333-3333-3333-333333333333'
    const tripToken = '44444444-4444-4444-4444-444444444444'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assignment: {
          id: 'a1',
          driver_id: driverId,
          status: 'pending',
          trip_token: tripToken,
          drivers: { name: 'Test Driver', email: 'driver@example.com' },
        },
      }),
    }) as unknown as typeof fetch

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<DriverAssignmentSection bookingId="b1" bookingStatus="assigned" />)

    const copyBtn = await screen.findByRole('button', { name: /copy trip link/i })
    await userEvent.click(copyBtn)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/driver\/trip\//)))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(tripToken))
    await waitFor(() => expect(screen.getByRole('button', { name: /copied!/i })).toBeDefined())
  })

  it('falls back to a selectable text field when clipboard copy fails (D-10b)', async () => {
    const driverId = '55555555-5555-5555-5555-555555555555'
    const tripToken = '66666666-6666-6666-6666-666666666666'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assignment: {
          id: 'a2',
          driver_id: driverId,
          status: 'pending',
          trip_token: tripToken,
          drivers: { name: 'Test Driver', email: 'driver@example.com' },
        },
      }),
    }) as unknown as typeof fetch

    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    render(<DriverAssignmentSection bookingId="b1" bookingStatus="assigned" />)

    const copyBtn = await screen.findByRole('button', { name: /copy trip link/i })
    await userEvent.click(copyBtn)

    await waitFor(() => expect(screen.getByText(/couldn.t copy/i)).toBeDefined())
    const input = screen.getByDisplayValue(new RegExp(`/driver/trip/${tripToken}`))
    expect(input).toBeDefined()
  })

  it('renders a labeled trip-progress badge distinct from the accept/decline badge when trip_progress is non-null (DTRIP-05)', async () => {
    const driverId = '77777777-7777-7777-7777-777777777777'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assignment: {
          id: 'a3',
          driver_id: driverId,
          status: 'accepted',
          trip_token: '',
          trip_progress: 'on_board',
          trip_note: null,
          trip_progress_updated_at: '2026-05-01T11:00:00Z',
          drivers: { name: 'Test Driver', email: 'driver@example.com' },
        },
      }),
    }) as unknown as typeof fetch

    render(<DriverAssignmentSection bookingId="b1" bookingStatus="assigned" />)

    await waitFor(() => expect(screen.getByText(/on board/i)).toBeDefined())
    // Distinct from the accept/decline StatusBadge, which renders the raw status
    expect(screen.getByText(/^accepted$/i)).toBeDefined()
    expect(screen.getByText(/^on board$/i)).toBeDefined()
  })

  it('renders no trip-progress badge when trip_progress is null (DTRIP-05)', async () => {
    const driverId = '88888888-8888-8888-8888-888888888888'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assignment: {
          id: 'a4',
          driver_id: driverId,
          status: 'pending',
          trip_token: '',
          trip_progress: null,
          trip_note: null,
          trip_progress_updated_at: null,
          drivers: { name: 'Test Driver', email: 'driver@example.com' },
        },
      }),
    }) as unknown as typeof fetch

    render(<DriverAssignmentSection bookingId="b1" bookingStatus="assigned" />)

    await waitFor(() => expect(screen.getByText(/^pending$/i)).toBeDefined())
    expect(screen.queryByText(/en route/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^arrived$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/on board/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^completed$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no-show/i)).not.toBeInTheDocument()
  })
})
