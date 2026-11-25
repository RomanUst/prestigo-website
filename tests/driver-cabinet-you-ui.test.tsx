import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-12 (DCAB-10; D-13, UI-SPEC You items 1-3, E11, E13): the You tab page and its Help section.

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  requireDriver: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => h.db.client }))
vi.mock('@/lib/driver-cabinet/auth', () => ({
  requireDriver: h.requireDriver,
  getDriverSession: async () => ({ driverId: DRIVER, sessionId: 's1' }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  usePathname: () => '/driver/you',
  useRouter: () => ({ refresh: vi.fn() }),
}))

import YouPage from '@/app/(internal)/driver/(cabinet)/(tabs)/you/page'
import YouHelpSection from '@/components/driver/YouHelpSection'
import SignOutButton from '@/components/driver/SignOutButton'
import DriverHelpChat from '@/app/(internal)/driver/trip/help/DriverHelpChat'
import { openDriverHelpPage, DRIVER_HELP_STORAGE_KEY } from '@/lib/driver-help-contract'
import { BUSINESS_TEL_URL } from '@/lib/contact-channels'

const DRIVER = 'd0000000-0000-4000-8000-000000000001'
const HASH = 'b'.repeat(64)
const CONFIG = {
  enabled: true,
  baseUrl: 'https://chat.example.test',
  websiteToken: 'site-token',
  user: { identifier: `driver:${DRIVER}`, identifierHash: HASH, name: 'Ana Novak (driver)', email: null, phone: null },
  conversation: { chat_role: 'driver', driver_trip_ref: 'DRIVER-CABINET' },
}
const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function seed(drivers: Array<Record<string, unknown>>, assignments: unknown[] = [], bookings: unknown[] = []) {
  h.db = createFakeDriverCabinetDb({
    drivers: drivers as never,
    driver_assignments: assignments as never,
    bookings: bookings as never,
  })
}

const full = {
  id: DRIVER,
  name: 'Ana Novak',
  email: 'ana.novak@example.com',
  phone: '+420777111222',
  vehicle_info: 'Mercedes V-Class',
  vehicle_plate: '1AB 2345',
  cabinet_enabled: true,
}

async function renderPage() {
  render(await YouPage())
}

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')

beforeEach(() => {
  h.requireDriver.mockReset()
  h.requireDriver.mockResolvedValue({ driverId: DRIVER, sessionId: 's1' })
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('You page profile and stats', () => {
  it("gates itself with requireDriver('/driver/you') and shows the title", async () => {
    seed([full])
    await renderPage()
    expect(h.requireDriver).toHaveBeenCalledWith('/driver/you')
    expect(screen.getByRole('heading', { level: 1, name: 'You' })).toBeInTheDocument()
  })

  it('prints name, phone, email, vehicle and plate, read-only with the office note', async () => {
    seed([full])
    await renderPage()
    expect(screen.getByRole('heading', { level: 2, name: 'Ana Novak' })).toBeInTheDocument()
    expect(screen.getByText('+420777111222')).toBeInTheDocument()
    expect(screen.getByText('ana.novak@example.com')).toHaveStyle({ overflowWrap: 'anywhere' })
    expect(screen.getByText('Mercedes V-Class')).toBeInTheDocument()
    expect(screen.getByText('1AB 2345')).toBeInTheDocument()
    expect(screen.getByText('To change these details, ask the office.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('missing phone and vehicle show a muted dash, missing plate reads Pending', async () => {
    seed([{ ...full, phone: '', vehicle_info: null, vehicle_plate: null }])
    await renderPage()
    expect(screen.getAllByText('—')).toHaveLength(3) // phone, vehicle, offers-accepted tile
    expect(screen.getByText('Pending')).toBeInTheDocument()
    for (const dash of screen.getAllByText('—').slice(0, 2)) {
      expect(dash).toHaveStyle({ color: 'var(--admin-text-muted)' })
    }
  })

  it('stat tiles: completed rides and 75% accepted', async () => {
    const bookings = [1, 2, 3, 4].map((n) => ({
      id: bid(n),
      status: n === 1 ? 'completed' : 'assigned',
      pickup_date: '2026-10-01',
      pickup_time: '10:00',
      pickup_utc: null,
      origin_address: 'A',
      destination_address: 'B',
      client_first_name: 'Anna',
      vehicle_class: 'business_sedan',
      driver_price_czk: 1000,
    }))
    const statuses = ['accepted', 'accepted', 'accepted', 'declined']
    const assignments = statuses.map((status, i) => ({
      id: aid(i + 1),
      booking_id: bid(i + 1),
      driver_id: DRIVER,
      status,
      created_at: new Date(Date.UTC(2026, 9, 1, 8, 0, i)).toISOString(),
    }))
    seed([full], assignments, bookings)
    await renderPage()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Rides completed').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Offers accepted')).toBeInTheDocument()
  })

  it('no answered offer -> a dash instead of a percent', async () => {
    seed([full])
    await renderPage()
    expect(screen.getByText('Offers accepted').previousElementSibling).toHaveTextContent('—')
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('the page holds no rating, document or earnings sections', async () => {
    seed([full])
    await renderPage()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/rating|documents|earnings/i)
  })
})

describe('YouHelpSection', () => {
  const assign = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    assign.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    })
  })

  function json(status: number, body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  }

  it('Call the office is a tel: link with the number under it', () => {
    render(<YouHelpSection />)
    const link = screen.getByRole('link', { name: /Call the office/ })
    expect(link).toHaveAttribute('href', BUSINESS_TEL_URL)
  })

  it('chat success: one POST, config saved, hard navigation to the help page from the cabinet', async () => {
    let release: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)))
    render(<YouHelpSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Chat with the office' }))
    const busy = await screen.findByRole('button', { name: 'Opening chat…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')

    release(new Response(JSON.stringify(CONFIG), { status: 200 }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/driver/trip/help?from=cabinet'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/driver/cabinet/help')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(window.sessionStorage.getItem(DRIVER_HELP_STORAGE_KEY) ?? 'null')).toMatchObject({
      enabled: true,
      conversation: { driver_trip_ref: 'DRIVER-CABINET' },
    })
  })

  it('401 goes to the sign-in page with next and ended', async () => {
    fetchMock.mockReturnValue(json(401, { error: 'unauthorized' }))
    render(<YouHelpSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat with the office' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/driver/login?next=%2Fdriver%2Fyou&ended=1'))
  })

  it.each([
    ['enabled false', () => json(200, { enabled: false })],
    ['a server error', () => json(500, { error: 'boom' })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('%s shows the alert and the retry label', async (_label, respond) => {
    fetchMock.mockImplementation(respond)
    render(<YouHelpSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat with the office' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Chat is not available right now. Call the office instead.')
    const retry = screen.getByRole('button', { name: 'Try chat again' })
    expect(retry).not.toBeDisabled()
    expect(assign).not.toHaveBeenCalled()
    // The phone link stays available.
    expect(within(document.body).getByRole('link', { name: /Call the office/ })).toHaveAttribute('href', BUSINESS_TEL_URL)
  })
})

describe('SignOutButton and page placement', () => {
  const assign = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    assign.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
  })

  it('is the last section of the You page with the helper text under it', async () => {
    seed([full])
    await renderPage()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByText('You will need a new email code to sign in again.')).toBeInTheDocument()
    const main = document.querySelector('main') as HTMLElement
    expect(main.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Sign out' }))
  })

  it('posts once, shows Signing out…, clears the stored help config and goes to the sign-in page', async () => {
    let release: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)))
    window.sessionStorage.setItem(DRIVER_HELP_STORAGE_KEY, JSON.stringify(CONFIG))
    render(<SignOutButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const busy = await screen.findByRole('button', { name: 'Signing out…' })
    expect(busy).toBeDisabled()
    fireEvent.click(busy)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/driver/cabinet/sign-out')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })

    release(new Response('{"ok":true}', { status: 200 }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/driver/login'))
    expect(window.sessionStorage.getItem(DRIVER_HELP_STORAGE_KEY)).toBeNull()
  })

  it('still leaves for the sign-in page when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/driver/login'))
  })
})

describe('help page opened from the cabinet', () => {
  it('openDriverHelpPage() keeps the trip address, { from: cabinet } adds the query', () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
    openDriverHelpPage()
    expect(assign).toHaveBeenLastCalledWith('/driver/trip/help')
    openDriverHelpPage({ from: 'cabinet' })
    expect(assign).toHaveBeenLastCalledWith('/driver/trip/help?from=cabinet')
  })

  it('DriverHelpChat labels the history button Back when from=cabinet is in the address', async () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3)
    window.history.pushState({}, '', '/driver/trip/help?from=cabinet')
    render(<DriverHelpChat />)
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to trip' })).not.toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('DriverHelpChat keeps Back to trip without the query', async () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3)
    window.history.pushState({}, '', '/driver/trip/help')
    render(<DriverHelpChat />)
    expect(await screen.findByRole('button', { name: 'Back to trip' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })
})

describe('source gates (D-13)', () => {
  const root = process.cwd()
  const files = ['app/(internal)/driver/(cabinet)/(tabs)/you/page.tsx', 'components/driver/YouHelpSection.tsx']
  it.each(files)('%s holds no rating, documents or earnings wording', (file) => {
    expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/rating|documents|earnings/i)
  })
})
