import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

const { useSearchParamsMock } = vi.hoisted(() => {
  const useSearchParamsMock = vi.fn(() => new URLSearchParams('ref=PRG-20260415-ABCDEF&type=paid'))
  return { useSearchParamsMock }
})

vi.mock('next/navigation', () => ({
  useSearchParams: useSearchParamsMock,
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

const { buildIcsMock } = vi.hoisted(() => {
  const buildIcsMock = vi.fn(() => 'ICS-STUB')
  return { buildIcsMock }
})
vi.mock('@/lib/ics', () => ({
  buildIcs: buildIcsMock,
}))

vi.mock('@/lib/analytics-snapshot', () => ({
  consumePurchaseSnapshot: vi.fn(() => ({
    value: 6585,
    currency: 'CZK',
    items: [{ item_id: 'business', item_name: 'Business', item_category: 'round_trip', item_variant: 'round_trip', price: 6585, quantity: 1 }],
  })),
}))

vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn(() => 0) }))

interface MockStore {
  origin: { address: string; lat: number; lng: number; placeId: string } | null
  destination: { address: string; lat: number; lng: number; placeId: string } | null
  pickupDate: string | null
  pickupTime: string | null
  returnDate: string | null
  returnTime: string | null
  vehicleClass: string | null
  passengers: number
  hours: number | null
  tripType: string | null
  priceBreakdown: Record<string, unknown> | null
  extras: Record<string, unknown>
  promoDiscount: number
  resetBooking: () => void
}

const resetBookingMock = vi.fn()
const defaultStore: MockStore = {
  origin: { address: 'Prague Airport', lat: 50.1008, lng: 14.2632, placeId: 'prg' },
  destination: { address: 'Hotel Alcron', lat: 50.0801, lng: 14.4293, placeId: 'alc' },
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  returnDate: '2026-04-17',
  returnTime: '18:30',
  vehicleClass: 'business',
  passengers: 2,
  hours: null,
  tripType: 'transfer',
  priceBreakdown: null,
  extras: {},
  promoDiscount: 0,
  resetBooking: resetBookingMock,
}
let currentStore: MockStore = { ...defaultStore }

vi.mock('@/lib/booking-store', () => ({
  useBookingStore: Object.assign(
    vi.fn((selector?: (s: MockStore) => unknown) => {
      if (typeof selector === 'function') return selector(currentStore)
      return currentStore
    }),
    { getState: vi.fn(() => currentStore) }
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  currentStore = { ...defaultStore }
  resetBookingMock.mockClear()
  useSearchParamsMock.mockReturnValue(new URLSearchParams('ref=PRG-20260415-ABCDEF&type=paid'))
  global.URL.createObjectURL = vi.fn(() => 'blob:stub')
  global.URL.revokeObjectURL = vi.fn()
  ;(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag = vi.fn()
})

async function loadPage() {
  const mod = await import('@/app/book/confirmation/page')
  return mod.default
}

describe('Confirmation Page — one-way', () => {
  it('renders BOOKING CONFIRMED label and single reference', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText(/BOOKING CONFIRMED/i)).toBeTruthy()
    expect(screen.getByText('PRG-20260415-ABCDEF')).toBeTruthy()
  })

  it('calls resetBooking on mount', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(resetBookingMock).toHaveBeenCalled()
  })

  it('handleDownloadICS calls buildIcs with single event', async () => {
    const Page = await loadPage()
    render(<Page />)
    const btn = screen.getAllByRole('button').find((b) => /calendar|ics/i.test(b.textContent || ''))
    if (!btn) throw new Error('ADD TO CALENDAR button not found')
    fireEvent.click(btn)
    expect(buildIcsMock).toHaveBeenCalledTimes(1)
    const events = buildIcsMock.mock.calls[0][0] as Array<{ uid: string; date: string; time: string }>
    expect(events).toHaveLength(1)
    expect(events[0].uid).toContain('PRG-20260415-ABCDEF')
    expect(events[0].date).toBe('2026-04-15')
    expect(events[0].time).toBe('14:00')
  })

  it('does NOT render OUTBOUND/RETURN journey labels', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(screen.queryByText(/OUTBOUND JOURNEY/i)).toBeNull()
    expect(screen.queryByText(/RETURN JOURNEY/i)).toBeNull()
  })
})

describe('Confirmation Page — round-trip', () => {
  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('ref=PRG-20260415-ABCDEF&returnRef=PRG-20260417-DEF456&type=paid')
    )
    currentStore = { ...defaultStore, tripType: 'round_trip' }
  })

  it('renders BOTH references with OUTBOUND and RETURN section labels', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText('PRG-20260415-ABCDEF')).toBeTruthy()
    expect(screen.getByText('PRG-20260417-DEF456')).toBeTruthy()
    // section labels (the short "OUTBOUND" / "RETURN" above each ref)
    expect(screen.getAllByText(/OUTBOUND/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^RETURN$/i).length).toBeGreaterThan(0)
  })

  it('D-14: page has exactly one h1 (BOOKING CONFIRMED); refs are h2 inside sections with aria-labelledby', async () => {
    const Page = await loadPage()
    const { container } = render(<Page />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s.length).toBe(1)
    expect(h1s[0].textContent).toMatch(/BOOKING CONFIRMED/i)
    const outboundSection = container.querySelector('section[aria-labelledby="outbound-ref-label"]')
    const returnSection = container.querySelector('section[aria-labelledby="return-ref-label"]')
    expect(outboundSection).not.toBeNull()
    expect(returnSection).not.toBeNull()
    expect(outboundSection!.querySelector('h2')?.textContent).toBe('PRG-20260415-ABCDEF')
    expect(returnSection!.querySelector('h2')?.textContent).toBe('PRG-20260417-DEF456')
  })

  it('renders TWO journey cards with swapped routes', async () => {
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText(/OUTBOUND JOURNEY/i)).toBeTruthy()
    expect(screen.getByText(/RETURN JOURNEY/i)).toBeTruthy()
    expect(screen.getByText(/Prague Airport.*Hotel Alcron/)).toBeTruthy()
    expect(screen.getByText(/Hotel Alcron.*Prague Airport/)).toBeTruthy()
    expect(screen.getByText(/2026-04-15.*at 14:00/)).toBeTruthy()
    expect(screen.getByText(/2026-04-17.*at 18:30/)).toBeTruthy()
  })

  it('D-12: exactly ONE download button, click → buildIcs with 2 events', async () => {
    const Page = await loadPage()
    render(<Page />)
    const btns = screen.getAllByRole('button').filter((b) => /calendar|ics/i.test(b.textContent || ''))
    expect(btns.length).toBe(1)
    fireEvent.click(btns[0])
    expect(buildIcsMock).toHaveBeenCalledTimes(1)
    const events = buildIcsMock.mock.calls[0][0] as Array<{ uid: string; date: string; time: string; summary: string; location: string }>
    expect(events).toHaveLength(2)
    expect(events[0].uid).toContain('PRG-20260415-ABCDEF')
    expect(events[0].date).toBe('2026-04-15')
    expect(events[0].time).toBe('14:00')
    expect(events[0].summary).toContain('Outbound')
    expect(events[0].location).toBe('Prague Airport')
    expect(events[1].uid).toContain('PRG-20260417-DEF456')
    expect(events[1].date).toBe('2026-04-17')
    expect(events[1].time).toBe('18:30')
    expect(events[1].summary).toContain('Return')
    expect(events[1].location).toBe('Hotel Alcron')
  })
})

describe('Confirmation Page — URL param validation', () => {
  it('invalid returnRef format is dropped — page renders as one-way', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('ref=PRG-20260415-ABCDEF&returnRef=not-a-ref&type=paid')
    )
    currentStore = { ...defaultStore }
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText('PRG-20260415-ABCDEF')).toBeTruthy()
    expect(screen.queryByText(/OUTBOUND JOURNEY/i)).toBeNull()
    expect(screen.queryByText('not-a-ref')).toBeNull()
  })

  it('invalid primary ref → session expired', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('ref=garbage&returnRef=PRG-20260417-DEF456'))
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText(/session has expired/i)).toBeTruthy()
  })

  it('no ref → session expired', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''))
    const Page = await loadPage()
    render(<Page />)
    expect(screen.getByText(/session has expired/i)).toBeTruthy()
  })
})

describe('Confirmation Page — D-15 GA4 purchase fires once', () => {
  it('pushes purchase event exactly once per mount', async () => {
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag
    const Page = await loadPage()
    render(<Page />)
    const purchaseCalls = (gtag as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'event' && args[1] === 'purchase'
    )
    expect(purchaseCalls.length).toBe(1)
  })
})
