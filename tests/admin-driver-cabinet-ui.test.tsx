import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DriverCabinetCell } from '@/components/admin/DriverCabinetCell'
import { DriversTable } from '@/components/admin/DriversTable'
import { DriverForm, type Driver } from '@/components/admin/DriverForm'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'

// Phase 94 plan 94-04 (DCAB-03; UI-SPEC E16, D-03, D-06, D-18): the operator invites, disables and re-enables
// cabinet access and sets the plate from the admin drivers page.

const DRIVER_ID = '11111111-1111-4111-8111-111111111111'

function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: DRIVER_ID,
    name: 'Ana Novak',
    email: 'ana@example.com',
    phone: '+420123456789',
    vehicle_info: 'Mercedes E-Class',
    vehicle_plate: null,
    cabinet_enabled: false,
    cabinet_invited_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const invited = () => makeDriver({ cabinet_enabled: true, cabinet_invited_at: '2026-11-01T00:00:00Z' })
const disabled = () => makeDriver({ cabinet_enabled: false, cabinet_invited_at: '2026-11-01T00:00:00Z' })

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

let originalFetch: typeof fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  originalFetch = global.fetch
  fetchMock = vi.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
  vi.clearAllMocks()
})

function lastBody(): unknown {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return JSON.parse((call[1] as { body: string }).body)
}

describe('DriverCabinetCell status chip and buttons', () => {
  it('not invited: neutral chip and Invite only', () => {
    render(<DriverCabinetCell driver={makeDriver()} onChanged={vi.fn()} />)
    expect(screen.getByText('Not invited')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disable access' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enable access' })).toBeNull()
  })

  it('invited: Invited chip, Resend invite and Disable access', () => {
    render(<DriverCabinetCell driver={invited()} onChanged={vi.fn()} />)
    expect(screen.getByText('Invited')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resend invite' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disable access' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
  })

  it('disabled: Disabled chip and Enable access only', () => {
    render(<DriverCabinetCell driver={disabled()} onChanged={vi.fn()} />)
    expect(screen.getByText('Disabled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enable access' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resend invite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
  })
})

describe('DriverCabinetCell invite', () => {
  it('posts { action: invite }, shows Sending while running, then the success line', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => { resolveFetch = r }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={makeDriver()} onChanged={onChanged} />)

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/drivers/${DRIVER_ID}/cabinet`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(lastBody()).toEqual({ action: 'invite' })
    const busy = screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)

    resolveFetch(jsonResponse(200, {
      driver: { id: DRIVER_ID, cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' },
      emailSent: true,
    }))
    await waitFor(() => expect(screen.getByText('Invitation sent to ana@example.com')).toBeTruthy())
    expect(onChanged).toHaveBeenCalledWith({ cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' })
  })

  it('the success line clears after 4 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockResolvedValue(jsonResponse(200, {
      driver: { id: DRIVER_ID, cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' },
      emailSent: true,
    }))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<DriverCabinetCell driver={makeDriver()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() => expect(screen.getByText('Invitation sent to ana@example.com')).toBeTruthy())
    await vi.advanceTimersByTimeAsync(4100)
    await waitFor(() => expect(screen.queryByText('Invitation sent to ana@example.com')).toBeNull())
  })

  it('a 502 shows the invite error in role=alert and still applies the set flag', async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, {
      error: 'email_failed',
      driver: { id: DRIVER_ID, cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' },
    }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={makeDriver()} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not send the invitation. Try again.')
    expect(onChanged).toHaveBeenCalledWith({ cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' })
  })

  it('a network error shows the invite error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={makeDriver()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not send the invitation. Try again.')
  })
})

describe('DriverCabinetCell disable', () => {
  it('opens the modal with the driver name, focuses Keep access and posts nothing on Keep access', async () => {
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={invited()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Disable access' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Disable cabinet access')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Ana Novak is signed out on their next tap and stops receiving notifications. Rides already assigned, and the links in old emails, keep working. You can enable access again at any time.',
      ),
    ).toBeTruthy()
    const keep = within(dialog).getByRole('button', { name: 'Keep access' })
    expect(document.activeElement).toBe(keep)

    await user.click(keep)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('confirming posts { action: disable }, locks both buttons while saving, then closes with the Disabled chip', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => { resolveFetch = r }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<DriverCabinetCell driver={invited()} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: 'Disable access' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Disable access' }))

    expect(lastBody()).toEqual({ action: 'disable' })
    const saving = within(screen.getByRole('dialog')).getByRole('button', { name: 'Disabling…' }) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep access' }) as HTMLButtonElement).disabled).toBe(true)

    // the modal cannot be dismissed while saving
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeNull()

    resolveFetch(jsonResponse(200, {
      driver: { id: DRIVER_ID, cabinet_enabled: false, cabinet_invited_at: '2026-11-01T00:00:00Z' },
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onChanged).toHaveBeenCalledWith({ cabinet_enabled: false, cabinet_invited_at: '2026-11-01T00:00:00Z' })

    rerender(<DriverCabinetCell driver={disabled()} onChanged={onChanged} />)
    expect(screen.getByText('Disabled')).toBeTruthy()
  })

  it('a failed disable shows the inline error and keeps the modal open', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'DB update failed' }))
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={invited()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Disable access' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable access' }))
    const alert = await within(screen.getByRole('dialog')).findByRole('alert')
    expect(alert.textContent).toBe('Could not disable access. Try again.')
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep access' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('DriverCabinetCell enable', () => {
  it('posts { action: enable } and shows Access enabled.', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      driver: { id: DRIVER_ID, cabinet_enabled: true, cabinet_invited_at: '2026-11-01T00:00:00Z' },
    }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={disabled()} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: 'Enable access' }))
    expect(lastBody()).toEqual({ action: 'enable' })
    await waitFor(() => expect(screen.getByText('Access enabled.')).toBeTruthy())
    expect(onChanged).toHaveBeenCalledWith({ cabinet_enabled: true, cabinet_invited_at: '2026-11-01T00:00:00Z' })
  })

  it('shows the enable error on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'x' }))
    const user = userEvent.setup()
    render(<DriverCabinetCell driver={disabled()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Enable access' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not enable access. Try again.')
  })
})

describe('DriversTable Plate and Cabinet columns', () => {
  it('shows the plate or a muted dash and the Cabinet column; Edit and Delete stay', () => {
    render(
      <DriversTable
        drivers={[makeDriver({ vehicle_plate: '1AB 2345', cabinet_enabled: true, cabinet_invited_at: '2026-11-01T00:00:00Z' }), makeDriver({ id: '22222222-2222-4222-8222-222222222222', name: 'Ben' })]}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
        onDriverChanged={vi.fn()}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Plate' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Cabinet' })).toBeTruthy()
    expect(screen.getByText('1AB 2345')).toBeTruthy()
    expect(screen.getByText('Invited')).toBeTruthy()
    expect(screen.getByText('Not invited')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Edit driver' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Delete driver' })).toHaveLength(2)
  })

  it('passes a cabinet change to onDriverChanged with the driver id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      driver: { id: DRIVER_ID, cabinet_enabled: true, cabinet_invited_at: '2026-11-25T10:00:00Z' },
      emailSent: true,
    }))
    const onDriverChanged = vi.fn()
    const user = userEvent.setup()
    render(<DriversTable drivers={[makeDriver()]} onEdit={vi.fn()} onDeleted={vi.fn()} onDriverChanged={onDriverChanged} />)
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() =>
      expect(onDriverChanged).toHaveBeenCalledWith(DRIVER_ID, {
        cabinet_enabled: true,
        cabinet_invited_at: '2026-11-25T10:00:00Z',
      }),
    )
  })
})

describe('DriverForm Plate field', () => {
  it('has a Plate input (max 16, capitals, placeholder, helper) and sends vehicle_plate trimmed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: [makeDriver({ vehicle_plate: '1AB 2345' })] }))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<DriverForm onSaved={onSaved} onClose={vi.fn()} />)

    const plate = screen.getByLabelText('Plate') as HTMLInputElement
    expect(plate.maxLength).toBe(16)
    expect(plate.getAttribute('autocapitalize')).toBe('characters')
    expect(plate.placeholder).toBe('1AB 2345')
    expect(screen.getByText('Shown to the driver on every ride. Leave empty to show Pending.')).toBeTruthy()

    await user.type(screen.getByLabelText('Name'), 'Ana Novak')
    await user.type(screen.getByLabelText('Email'), 'ana@example.com')
    await user.type(plate, '  1AB 2345 ')
    await user.click(screen.getByRole('button', { name: 'Add Driver' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((lastBody() as Record<string, unknown>).vehicle_plate).toBe('1AB 2345')
  })

  it('sends null when an edited plate is emptied', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [makeDriver()] }))
    const user = userEvent.setup()
    render(<DriverForm driver={makeDriver({ vehicle_plate: '1AB 2345' })} onSaved={vi.fn()} onClose={vi.fn()} />)
    await user.clear(screen.getByLabelText('Plate'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect((lastBody() as Record<string, unknown>).vehicle_plate).toBeNull()
  })
})

describe('DriverAssignmentSection cabinet hint (D-18)', () => {
  const cabinetId = '33333333-3333-4333-8333-333333333333'
  const plainId = '44444444-4444-4444-8444-444444444444'

  async function renderWithDrivers() {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assignment: null }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: cabinetId, name: 'Cabinet Carl', cabinet_enabled: true },
            { id: plainId, name: 'Plain Pete', cabinet_enabled: false },
          ],
        }),
      })
    const user = userEvent.setup()
    render(<DriverAssignmentSection bookingId="b1" bookingStatus="confirmed" />)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(within(select).getByText('Cabinet Carl')).toBeTruthy())
    return { user, select }
  }

  it('shows no hint before a driver is chosen', async () => {
    await renderWithDrivers()
    expect(screen.queryByText(/Cabinet driver:/)).toBeNull()
    expect(screen.queryByText(/No cabinet:/)).toBeNull()
  })

  it('tells the operator a cabinet driver gets the Open in cabinet email and a notification', async () => {
    const { user, select } = await renderWithDrivers()
    await user.selectOptions(select, cabinetId)
    expect(screen.getByText('Cabinet driver: gets an Open in cabinet email and a notification.')).toBeTruthy()
  })

  it('tells the operator a driver without a cabinet gets the Accept and Decline email', async () => {
    const { user, select } = await renderWithDrivers()
    await user.selectOptions(select, plainId)
    expect(screen.getByText('No cabinet: gets the email with Accept and Decline buttons.')).toBeTruthy()
  })
})
