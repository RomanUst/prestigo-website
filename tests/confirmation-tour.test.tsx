// Phase 93 (plan 93-19; TRIP-04): the tour variant of /book/confirmation, fed by the confirmation snapshot.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import type { ReactNode } from 'react'
import { writeTourConfirmation, type TourConfirmationSnapshot } from '@/lib/tours/confirmation-snapshot'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

const REF = 'PRG-20261201-ABCDEF'

const { useSearchParamsMock } = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(() => new URLSearchParams('ref=PRG-20261201-ABCDEF')),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: useSearchParamsMock,
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/analytics-snapshot', () => ({ consumePurchaseSnapshot: vi.fn(() => null) }))
vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn(() => 0) }))

const resetBookingMock = vi.fn()
// The wizard store holds an unrelated transfer: the tour variant must not show any of it.
const wizardStore = {
  origin: { address: 'WIZARD-ORIGIN', lat: 1, lng: 1, placeId: 'o' },
  destination: { address: 'WIZARD-DESTINATION', lat: 1, lng: 1, placeId: 'd' },
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  returnDate: null,
  returnTime: null,
  vehicleClass: 'business',
  passengers: 2,
  hours: null,
  tripType: 'transfer',
  priceBreakdown: null,
  extras: {},
  promoDiscount: 0,
  passengerDetails: { email: 'wizard@example.com', firstName: 'Wiz', lastName: 'Ard', phone: '+420000000000' },
  resetBooking: resetBookingMock,
}

vi.mock('@/lib/booking-store', () => ({
  useBookingStore: Object.assign(
    vi.fn((selector?: (s: typeof wizardStore) => unknown) =>
      typeof selector === 'function' ? selector(wizardStore) : wizardStore,
    ),
    { getState: vi.fn(() => wizardStore) },
  ),
}))

const SNAP: TourConfirmationSnapshot = {
  ref: REF,
  title: 'Dresden',
  date: '2026-12-01',
  time: '09:30',
  pickupAddress: 'Hotel Alcron, Prague',
  carLabelKey: 'business',
  hoursIncluded: 5,
  extraHours: 1,
  passengers: 3,
  driveMinutes: 90,
  payment: 'card',
  amountLabel: '€540.00',
}

async function loadPage() {
  const mod = await import('@/app/[locale]/book/confirmation/page')
  return mod.default
}

let lastBlob: Blob | null = null

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  lastBlob = null
  useSearchParamsMock.mockReturnValue(new URLSearchParams(`ref=${REF}`))
  global.URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    lastBlob = b as Blob
    return 'blob:stub'
  })
  global.URL.revokeObjectURL = vi.fn()
  ;(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag = vi.fn()
})

async function blobText(): Promise<string> {
  if (!lastBlob) throw new Error('no ICS blob was created')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(lastBlob as Blob)
  })
}

function unfold(ics: string): string {
  return ics.replace(/\r?\n[ \t]/g, '')
}

function icsStamp(ics: string, key: 'DTSTART' | 'DTEND'): string {
  const event = unfold(ics).slice(unfold(ics).indexOf('BEGIN:VEVENT'))
  const m = event.match(new RegExp(`${key}[^:]*:(\\d{8}T\\d{6})`))
  if (!m) throw new Error(`${key} missing`)
  return m[1]
}

function minutesBetween(a: string, b: string): number {
  const toMs = (s: string) =>
    Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13))
  return (toMs(b) - toMs(a)) / 60000
}

describe('Confirmation page: tour variant', () => {
  it('shows the tour confirmation from the snapshot with reference, details and three steps', async () => {
    writeTourConfirmation(SNAP)
    const Page = await loadPage()
    render(<Page />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Your day trip is booked' })).toBeTruthy()
    expect(screen.getByText('BOOKING CONFIRMED')).toBeTruthy()
    expect(screen.getByText('YOUR BOOKING REFERENCE')).toBeTruthy()
    const ref = screen.getByText(REF)
    expect(ref.tagName).toBe('BDI')
    expect(ref.getAttribute('dir')).toBe('ltr')
    expect(screen.getByText('Dresden')).toBeTruthy()
    expect(screen.getByText('Hotel Alcron, Prague')).toBeTruthy()
    expect(screen.getByText('09:30, Prague time')).toBeTruthy()
    expect(screen.getByText('Business')).toBeTruthy()
    expect(screen.getByText(/5 hours included/)).toBeTruthy()
    expect(screen.getByText(/\+1 hour extra/)).toBeTruthy()
    expect(screen.getByText('WHAT HAPPENS NEXT')).toBeTruthy()
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[1].textContent).toMatch(/Your chauffeur meets you at your pickup address on .*2026.* at 09:30\./)
    expect(steps[2].textContent).toContain('You have 6 hours at the destination.')
    expect(screen.getByText('Add to calendar')).toBeTruthy()
    const other = screen.getByText('See other day trips')
    expect(other.closest('a')?.getAttribute('href')).toBe('/services/day-trips-from-prague')
  })

  it('states the card payment sentence, or the cash sentence for a cash booking', async () => {
    writeTourConfirmation(SNAP)
    const Page = await loadPage()
    const first = render(<Page />)
    expect(await screen.findByText(/Your card is saved for/)).toHaveTextContent('€540.00')
    first.unmount()

    writeTourConfirmation({ ...SNAP, payment: 'cash', amountLabel: '€540.00' })
    render(<Page />)
    expect(await screen.findByText(/in cash to your driver/)).toHaveTextContent('€540.00')
    expect(screen.queryByText(/Your card is saved for/)).toBeNull()
  })

  it('never reads the wizard store: nothing of it is shown and no contact data goes to Meta CAPI', async () => {
    writeTourConfirmation(SNAP)
    const Page = await loadPage()
    render(<Page />)
    await screen.findByText('Your day trip is booked')
    expect(screen.queryByText(/WIZARD-/)).toBeNull()
    await waitFor(() => expect(resetBookingMock).toHaveBeenCalled())
    const capiCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]) === '/api/meta-capi',
    )
    expect(capiCalls).toHaveLength(1)
    const body = JSON.parse((capiCalls[0][1] as { body: string }).body) as Record<string, unknown>
    expect(body.email).toBeUndefined()
    expect(body.phone).toBeUndefined()
  })

  it('ICS: runs from the pickup time for 2 x drive + hours at the destination, titled "{title} – Prestigo"', async () => {
    writeTourConfirmation(SNAP)
    const Page = await loadPage()
    render(<Page />)
    fireEvent.click(await screen.findByText('Add to calendar'))
    const ics = unfold(await blobText())
    expect(minutesBetween(icsStamp(ics, 'DTSTART'), icsStamp(ics, 'DTEND'))).toBe(2 * 90 + 60 * (5 + 1))
    expect(icsStamp(ics, 'DTSTART')).toBe('20261201T093000')
    expect(ics).toContain('SUMMARY:Dresden – Prestigo')
    expect(ics).toContain('LOCATION:Hotel Alcron\\, Prague')
  })

  it('ICS: a snapshot without drive minutes covers the hours at the destination only', async () => {
    const { driveMinutes: _drive, ...noDrive } = SNAP
    void _drive
    writeTourConfirmation(noDrive)
    const Page = await loadPage()
    render(<Page />)
    fireEvent.click(await screen.findByText('Add to calendar'))
    const ics = unfold(await blobText())
    expect(minutesBetween(icsStamp(ics, 'DTSTART'), icsStamp(ics, 'DTEND'))).toBe(60 * 6)
  })

  it('without a snapshot the existing confirmation renders', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(await screen.findByText(/BOOKING CONFIRMED/i)).toBeTruthy()
    expect(screen.queryByText('Your day trip is booked')).toBeNull()
    expect(screen.getByText('WIZARD-ORIGIN → WIZARD-DESTINATION')).toBeTruthy()
  })

  it('a snapshot of another reference does not turn the page into a tour confirmation', async () => {
    writeTourConfirmation({ ...SNAP, ref: 'PRG-20261201-FFFFFF' })
    const Page = await loadPage()
    render(<Page />)
    expect(await screen.findByText(/BOOKING CONFIRMED/i)).toBeTruthy()
    expect(screen.queryByText('Your day trip is booked')).toBeNull()
  })
})
