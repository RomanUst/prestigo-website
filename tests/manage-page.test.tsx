/**
 * Phase 89, plan 89-15 — the client's manage-booking page, read side (UI-SPEC Surface 1; HOLD-06, CANC-01, D-01, D-02).
 *
 * Tracer: a token through resolveManageToken and buildManageView to the rendered page, for every row of the state
 * table. Then the invalid view (one markup for every reason), the loading state, the leak guard (T-89-52), the My trips
 * link and the 7-locale catalog parity.
 *
 * Server components are awaited as functions and rendered with Testing Library; next-intl/server is pointed at its
 * react-server build with the real catalogs (the pattern of tests/account-trips.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import enMessages from '../messages/en.json'
import ruMessages from '../messages/ru.json'
import esMessages from '../messages/es.json'
import frMessages from '../messages/fr.json'
import arMessages from '../messages/ar.json'
import hiMessages from '../messages/hi.json'
import zhMessages from '../messages/zh.json'

const ALL_MESSAGES: Record<string, unknown> = {
  en: enMessages,
  ru: ruMessages,
  es: esMessages,
  fr: frMessages,
  ar: arMessages,
  hi: hiMessages,
  zh: zhMessages,
}

const { mockLocaleRef, mockResolve, mockLoad, mockEnsure, mockGetUser, mockBookings, reactServerBuild } = vi.hoisted(() => ({
  // The react-server build of next-intl/server (vitest has no react-server export condition). Built from the project
  // root so it also resolves through a node_modules symlink.
  reactServerBuild: { path: `${process.cwd()}/node_modules/next-intl/dist/esm/development/server.react-server.js` },
  mockLocaleRef: { value: 'en' },
  mockResolve: vi.fn(),
  mockLoad: vi.fn(),
  mockEnsure: vi.fn(),
  mockGetUser: vi.fn(),
  mockBookings: { rows: [] as Record<string, unknown>[] },
}))

vi.mock('next-intl/server', async () => {
  return await vi.importActual(reactServerBuild.path)
})

vi.mock('next-intl/config', async () => {
  const { getRequestConfig } = await vi.importActual<typeof import('next-intl/server')>(
    reactServerBuild.path,
  )
  return {
    default: getRequestConfig(async () => ({
      locale: mockLocaleRef.value,
      messages: ALL_MESSAGES[mockLocaleRef.value] as Record<string, unknown>,
    })),
  }
})

vi.mock('@/lib/manage-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/manage-link')>()
  return { ...actual, resolveManageToken: mockResolve, ensureManageToken: mockEnsure }
})

vi.mock('@/lib/manage-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/manage-view')>()
  return { ...actual, loadManageView: mockLoad }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: mockBookings.rows, error: null })),
      }
      return chain
    }),
  }),
}))

vi.mock('@/components/Nav', () => ({ default: () => null }))

// The client island (plan 89-28) reads the app router; a page render needs none of it.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return { ...actual, useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }
})

import { buildManageView, MANAGE_BOOKING_COLUMNS, type ManageView } from '@/lib/manage-view'
import ManageBookingPage, { generateMetadata } from '@/app/[locale]/manage/[token]/page'
import ManageLoading from '@/app/[locale]/manage/[token]/loading'
import AccountTripsPage from '@/app/[locale]/account/trips/page'

const TOKEN = 'A'.repeat(43)
const HOUR = 3_600_000
const NOW = Date.parse('2026-11-10T10:00:00Z')

const POLICY = {
  version: '2026-11-1',
  kmThreshold: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 100,
}

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'booking-1',
    booking_reference: 'PR-4821',
    status: 'confirmed',
    trip_type: 'transfer',
    distance_km: 300,
    pickup_utc: new Date(NOW + 48 * HOUR).toISOString(),
    pickup_date: '2026-11-12',
    pickup_time: '11:00',
    origin_address: 'Václavské náměstí 1, Praha',
    destination_address: 'Vienna International Airport',
    vehicle_class: 'business',
    passengers: 2,
    amount_eur: 180,
    payment_mode: 'card_hold',
    payment_state: 'card_saved',
    payment_currency: 'eur',
    payment_amount_minor: 18000,
    payment_intent_id: null,
    hold_payment_intent_id: null,
    hold_amount_minor: null,
    hold_at: new Date(NOW + 24 * HOUR).toISOString(),
    captured_amount_minor: null,
    leg: 'outbound',
    cancel_policy: POLICY,
    cancel_policy_version: '2026-11-1',
    booking_source: 'online',
    stripe_payment_method_id: 'pm_1',
    // Fields the page must never expose, present on purpose to prove the allow-list.
    client_email: 'secret.client@example.com',
    client_phone: '+420111222333',
    client_first_name: 'Secretina',
    client_last_name: 'Clientova',
    driver_name: 'Hidden Driver',
    special_requests: 'operator note: VIP, do not mention',
    admin_notes: 'internal remark',
    ...over,
  }
}

async function renderPage(locale = 'en', view: ManageView | null = null, resolved: string | null = 'booking-1') {
  mockLocaleRef.value = locale
  mockResolve.mockResolvedValue(resolved)
  mockLoad.mockResolvedValue(view)
  const element = await ManageBookingPage({ params: Promise.resolve({ locale, token: TOKEN }) })
  const { render } = await import('@testing-library/react')
  return render(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLocaleRef.value = 'en'
})

afterEach(async () => {
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})

// ---------------------------------------------------------------------------------------------------------------------
describe('buildManageView (pure view model)', () => {
  it('free window: outcome free, the end of the window, hold released for a card booking', () => {
    const v = buildManageView(row({ payment_state: 'authorized', hold_amount_minor: 18000 }), {}, NOW)
    expect(v.variant).toBe('active')
    expect(v.cancel?.outcome).toBe('free')
    expect(v.cancel?.freeUntilMs).toBe(NOW + 48 * HOUR - 12 * HOUR)
    expect(v.cancel?.freeMoney).toBe('hold')
    expect(v.payment?.key).toBe('holdActive')
  })

  it('late window: proposed fee is the stored percent of the stored amount', () => {
    const v = buildManageView(row({ pickup_utc: new Date(NOW + 5 * HOUR).toISOString(), cancel_policy: { ...POLICY, feePercent: 50 } }), {}, NOW)
    expect(v.cancel?.outcome).toBe('late')
    expect(v.cancel?.feePercent).toBe(50)
    expect(v.cancel?.proposedFeeMinor).toBe(9000)
    expect(v.cancel?.currency).toBe('eur')
  })

  it('judges by the policy the booking was made under, not today settings (legacy snapshot: free to 1 hour)', () => {
    const v = buildManageView(row({ cancel_policy: null, pickup_utc: new Date(NOW + 5 * HOUR).toISOString() }), {}, NOW)
    expect(v.cancel?.outcome).toBe('free')
  })

  it('pickup reached: too_late, still a manage view with the change slot', () => {
    const v = buildManageView(row({ pickup_utc: new Date(NOW - HOUR).toISOString() }), {}, NOW)
    expect(v.variant).toBe('active')
    expect(v.cancel?.outcome).toBe('too_late')
  })

  it('an unreadable pickup instant promises nothing (too_late), as cancelBooking does', () => {
    const v = buildManageView(row({ pickup_utc: null, pickup_date: 'nonsense', pickup_time: '' }), {}, NOW)
    expect(v.cancel?.outcome).toBe('too_late')
    expect(v.cancel?.freeUntilMs).toBeNull()
  })

  it('pay-now: refund of the fare and the bank sentence flag', () => {
    const v = buildManageView(
      row({ payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_1', payment_amount_minor: null, payment_currency: null }),
      {},
      NOW,
    )
    expect(v.cancel?.freeMoney).toBe('refund')
    expect(v.cancel?.refundMinor).toBe(18000)
    expect(v.cancel?.payNow).toBe(true)
    expect(v.payment).toMatchObject({ key: 'paidCard', amountMinor: 18000, currency: 'eur' })
  })

  it('payment sentence rows: cash, card saved with its hold date, captured; none for a manual booking', () => {
    expect(buildManageView(row({ payment_mode: 'cash_guarantee', payment_state: 'card_saved' }), {}, NOW).payment?.key).toBe('cash')
    const saved = buildManageView(row(), {}, NOW).payment
    expect(saved?.key).toBe('cardSaved')
    expect(saved?.holdAtMs).toBe(NOW + 24 * HOUR)
    expect(buildManageView(row({ payment_state: 'captured', captured_amount_minor: 17000 }), {}, NOW).payment).toMatchObject({
      key: 'paidCard',
      amountMinor: 17000,
    })
    expect(
      buildManageView(row({ payment_mode: null, payment_state: 'none', payment_amount_minor: null, payment_currency: null }), {}, NOW).payment,
    ).toBeNull()
  })

  it.each([
    ['on_board', 'on_board'],
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
    ['no_show', 'no_show'],
    ['pending', 'active'],
    ['confirmed', 'active'],
    ['assigned', 'active'],
    ['en_route', 'active'],
    ['on_location', 'active'],
    ['unpaid', 'active'],
    ['something_new', 'unknown'],
  ])('status %s maps to variant %s', (status, variant) => {
    const v = buildManageView(row({ status }), {}, NOW)
    expect(v.variant).toBe(variant)
    if (variant !== 'active') expect(v.cancel).toBeNull()
    if (variant === 'unknown') expect(v.statusKey).toBeNull()
  })

  it('the cancelled summary carries the fee case status and amount, never a reason', () => {
    const v = buildManageView(
      row({ status: 'cancelled' }),
      { feeCase: { status: 'charged', currency: 'eur', proposedMinor: 18000, decidedMinor: 9000, freeUntil: null }, cancelledAtMs: NOW },
      NOW,
    )
    expect(v.cancelled).toMatchObject({ feeStatus: 'charged', feeAmountMinor: 9000, currency: 'eur', cancelledAtMs: NOW })
    expect(JSON.stringify(v)).not.toMatch(/reason|note|evidence/i)
  })

  it('serialises without any client, driver or operator value (T-89-52)', () => {
    const json = JSON.stringify(buildManageView(row(), {}, NOW))
    for (const secret of ['secret.client@example.com', '+420111222333', 'Secretina', 'Clientova', 'Hidden Driver', 'operator note', 'internal remark']) {
      expect(json).not.toContain(secret)
    }
    expect(json).not.toMatch(/client_email|client_phone|driver|special_requests|admin_notes/)
  })

  it('reads an explicit column list with no personal column and no star', () => {
    expect(MANAGE_BOOKING_COLUMNS).not.toContain('*')
    expect(MANAGE_BOOKING_COLUMNS).not.toMatch(/client_|driver|special_requests|notes|email|phone/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('manage page, state table (E3 populated)', () => {
  const view = (over: Record<string, unknown> = {}, extras = {}) => buildManageView(row(over), extras, Date.now())
  const futureRow = (hours: number, over: Record<string, unknown> = {}) => ({
    pickup_utc: new Date(Date.now() + hours * HOUR).toISOString(),
    ...over,
  })

  it('tracer: a token resolves to the booking and the page shows reference, details and the free panel', async () => {
    const { container, getByTestId, getByRole } = await renderPage('en', view(futureRow(48)))
    expect(mockResolve).toHaveBeenCalledWith(TOKEN)
    expect(mockLoad).toHaveBeenCalledWith('booking-1')
    expect(getByRole('heading', { level: 1 }).textContent).toMatch(/^Your trip on /)
    expect(container.textContent).toContain('PR-4821')
    expect(getByTestId('manage-details').textContent).toContain('Vienna International Airport')
    expect(getByTestId('manage-panel-free').textContent).toMatch(/Free cancellation until/)
    expect(container.querySelector('[data-manage-slot="cancel-region"]')).not.toBeNull()
    expect(container.querySelector('[data-manage-slot="change-request"]')).not.toBeNull()
  })

  it('resolves the token before it reads any booking', async () => {
    const order: string[] = []
    mockResolve.mockImplementation(async () => {
      order.push('resolve')
      return 'booking-1'
    })
    mockLoad.mockImplementation(async () => {
      order.push('load')
      return view(futureRow(48))
    })
    await ManageBookingPage({ params: Promise.resolve({ locale: 'en', token: TOKEN }) })
    expect(order).toEqual(['resolve', 'load'])
  })

  it('late: the heading, the fee sentence and the human-decides line', async () => {
    const { getByTestId } = await renderPage('en', view(futureRow(5)))
    const text = getByTestId('manage-panel-late').textContent ?? ''
    expect(text).toContain('Free cancellation has ended')
    expect(text).toMatch(/100% of the fare \(.+\) applies/)
    expect(text).toContain('A person at Prestigo decides the final charge')
  })

  it('late without anything to charge: no percent sentence', async () => {
    const { getByTestId } = await renderPage('en', view(futureRow(5, { payment_mode: null, payment_state: 'none', payment_amount_minor: null, payment_currency: null, stripe_payment_method_id: null })))
    const text = getByTestId('manage-panel-late').textContent ?? ''
    expect(text).toContain('Nothing will be charged')
    expect(text).not.toMatch(/% of the fare/)
  })

  it('pickup passed: phone button instead of a cancel control', async () => {
    const { getByTestId } = await renderPage('en', view({ pickup_utc: new Date(Date.now() - HOUR).toISOString() }))
    const panel = getByTestId('manage-panel-too-late')
    expect(panel.textContent).toContain('Pickup time has passed')
    expect(panel.querySelector('a[href^="tel:"]')).not.toBeNull()
    expect(panel.querySelector('[data-manage-slot="cancel-region"]')).toBeNull()
  })

  it('on_board: enjoy your ride, no panel, no change slot', async () => {
    const { getByRole, container } = await renderPage('en', view({ status: 'on_board' }))
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Enjoy your ride')
    expect(container.querySelector('[data-testid^="manage-panel"]')).toBeNull()
    expect(container.querySelector('[data-manage-slot]')).toBeNull()
  })

  it('completed: thank-you line and a primary new-ride button', async () => {
    const { getByRole, container } = await renderPage('en', view({ status: 'completed' }))
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Trip completed')
    expect(container.textContent).toContain('Thank you for travelling with Prestigo.')
    const book = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'Book a new ride')
    expect(book?.className).toContain('btn-primary')
    expect(container.querySelector('[data-manage-slot]')).toBeNull()
  })

  it('no_show: the could-not-meet-you H1 and emphasised contact buttons', async () => {
    const { getByRole, container } = await renderPage('en', view({ status: 'no_show' }))
    expect(getByRole('heading', { level: 1 }).textContent).toBe('We could not meet you')
    expect(container.textContent).toContain('The driver waited at the pick-up point.')
    expect(container.querySelectorAll('a.btn-secondary').length).toBe(2)
    expect(container.querySelector('[data-manage-slot]')).toBeNull()
  })

  it.each([
    ['none', undefined, 'Nothing was charged.'],
    ['pending', { status: 'pending', currency: 'eur', proposedMinor: 18000, decidedMinor: null, freeUntil: null }, 'A cancellation fee of up to'],
    ['charged', { status: 'charged', currency: 'eur', proposedMinor: 18000, decidedMinor: 9000, freeUntil: null }, 'We charged'],
    ['waived', { status: 'waived', currency: 'eur', proposedMinor: 18000, decidedMinor: null, freeUntil: null }, 'We decided not to charge a cancellation fee.'],
  ])('cancelled summary, fee %s', async (_name, feeCase, sentence) => {
    const { getByTestId, getByRole } = await renderPage('en', view({ status: 'cancelled' }, { feeCase, cancelledAtMs: Date.now() }))
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Booking cancelled')
    const summary = getByTestId('manage-cancelled')
    expect(summary.textContent).toContain(sentence)
    expect(summary.textContent).toMatch(/^Cancelled on /)
    expect(summary.querySelector('button')).toBeNull()
  })

  it('cancelled with a refund seen: says what was refunded', async () => {
    const { getByTestId } = await renderPage('en', view({ status: 'cancelled' }, { refundedMinor: 18000 }))
    expect(getByTestId('manage-cancelled').textContent).toContain('We refunded')
  })

  it('an unknown status falls back to the details with no action', async () => {
    const { getByTestId, container } = await renderPage('en', view({ status: 'something_new' }))
    expect(getByTestId('manage-details')).toBeTruthy()
    expect(container.querySelector('[data-testid^="manage-panel"]')).toBeNull()
    expect(container.querySelector('[data-manage-slot]')).toBeNull()
  })

  it('E2 partial: a null row is not rendered and leaves no empty caption', async () => {
    const { getByTestId } = await renderPage(
      'en',
      view({ origin_address: null, passengers: null, amount_eur: null, payment_mode: null, payment_state: 'none', payment_amount_minor: null, payment_currency: null }),
    )
    const text = getByTestId('manage-details').textContent ?? ''
    for (const caption of ['From', 'Passengers', 'Fare', 'Payment']) expect(text).not.toContain(caption)
    expect(text).toContain('To')
    expect(text).toContain('Vehicle')
  })

  it('shows no client email, phone, name, driver or note anywhere in the markup', async () => {
    const { container } = await renderPage('en', view(futureRow(48)))
    for (const secret of ['secret.client@example.com', '+420111222333', 'Secretina', 'Hidden Driver', 'operator note', 'internal remark']) {
      expect(container.innerHTML).not.toContain(secret)
    }
  })

  it('has a mailto and a tel contact, the private-link warning and a terms link that opens safely', async () => {
    const { container } = await renderPage('en', view(futureRow(48)))
    expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull()
    expect(container.querySelector('a[href^="tel:"]')).not.toBeNull()
    expect(container.textContent).toContain('This page is private.')
    const terms = container.querySelector('a[href="/terms"]')
    expect(terms?.getAttribute('target')).toBe('_blank')
    expect(terms?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('wraps addresses and the reference in bdi, and amounts keep a direction', async () => {
    const { container } = await renderPage('ar', view(futureRow(48)))
    const auto = Array.from(container.querySelectorAll('bdi[dir="auto"]')).map((b) => b.textContent)
    expect(auto.some((t) => t?.includes('Václavské'))).toBe(true)
    const ltr = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).map((b) => b.textContent)
    expect(ltr).toContain('PR-4821')
  })

  it('renders in every locale without a missing-message marker', async () => {
    for (const locale of ['ru', 'es', 'fr', 'ar', 'hi', 'zh']) {
      const { container, unmount } = await renderPage(locale, view(futureRow(5)))
      expect(container.textContent, locale).not.toMatch(/Manage\.|MISSING_MESSAGE/)
      expect(container.querySelector('h1')?.textContent?.length, locale).toBeGreaterThan(3)
      expect(container.textContent, locale).not.toContain('Free cancellation has ended')
      unmount()
    }
  })

  it('ar page links use the locale prefix', async () => {
    const { container } = await renderPage('ar', view(futureRow(48)))
    expect(container.querySelector('a[href="/ar/book"]')).not.toBeNull()
  })

  it('metadata: noindex, nofollow and no referrer', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', token: TOKEN }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.referrer).toBe('no-referrer')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('invalid link (E1 error, E7 empty)', () => {
  it('malformed, unknown, revoked, expired and a throwing lookup render the same markup', async () => {
    const markups: string[] = []
    const attempts: Array<() => void> = [
      () => mockResolve.mockResolvedValue(null), // unknown, revoked, partner, expired, malformed all answer null
      () => mockResolve.mockRejectedValue(new Error('boom: stack trace text')),
      () => {
        mockResolve.mockResolvedValue('booking-1')
        mockLoad.mockResolvedValue(null)
      },
      () => {
        mockResolve.mockResolvedValue('booking-1')
        mockLoad.mockRejectedValue(new Error('db down'))
      },
    ]
    const { render, cleanup } = await import('@testing-library/react')
    for (const arrange of attempts) {
      arrange()
      const element = await ManageBookingPage({ params: Promise.resolve({ locale: 'en', token: 'not-a-token' }) })
      const { container } = render(element)
      markups.push(container.innerHTML)
      cleanup()
    }
    expect(new Set(markups).size).toBe(1)
    expect(markups[0]).not.toMatch(/boom|stack|db down|PR-4821/)
  })

  it('has the title, the body, email, phone and a book link', async () => {
    const { getByRole, container } = await renderPage('en', null, null)
    expect(getByRole('heading', { level: 1 }).textContent).toBe('This link is not valid')
    expect(container.textContent).toContain('Check that you copied the whole link')
    expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull()
    expect(container.querySelector('a[href^="tel:"]')).not.toBeNull()
    expect(container.querySelector('a[href="/book"]')?.className).toContain('btn-primary')
  })

  it('is localized', async () => {
    const { getByRole } = await renderPage('fr', null, null)
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Ce lien n\'est pas valide')
  })
})

describe('loading state (E1)', () => {
  it('shows the header and three reserved blocks', async () => {
    const { render } = await import('@testing-library/react')
    mockLocaleRef.value = 'en'
    const { container, getAllByTestId } = render(await ManageLoading())
    expect(container.querySelector('header')).not.toBeNull()
    expect(getAllByTestId('manage-loading-block')).toHaveLength(3)
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('true')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('page source rules', () => {
  const src = readFileSync(join(process.cwd(), 'app/[locale]/manage/[token]/page.tsx'), 'utf8')

  it('is dynamic, localized by params and has no euro literal', () => {
    expect((src.match(/force-dynamic/g) ?? []).length).toBe(1)
    expect(src).toContain('setRequestLocale')
    expect(src).not.toMatch(/getLocale\(/)
    expect(src).not.toContain('€')
  })

  it('does not build a Supabase client itself', () => {
    expect(src).not.toMatch(/createSupabase|createClient/)
  })

  it('resolves the token before it reads the booking', () => {
    expect(src.indexOf('resolveManageToken(')).toBeGreaterThan(-1)
    expect(src.indexOf('resolveManageToken(')).toBeLessThan(src.indexOf('loadManageView('))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('My trips Manage link (D-02)', () => {
  const user = { id: 'user-uuid', email: 'user@example.com' }
  const trip = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    booking_reference: `PR-${id}`,
    pickup_date: '2026-11-12',
    pickup_time: '11:00',
    origin_address: 'A',
    destination_address: 'B',
    vehicle_class: 'business',
    amount_eur: 100,
    status: 'confirmed',
    leg: 'outbound',
    trip_type: 'transfer',
    cancel_policy_version: '2026-11-1',
    ...over,
  })

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user } })
    mockEnsure.mockImplementation(async (id: string) => (id === 'no-token' ? null : `T${id}`.padEnd(43, 'x')))
  })

  async function renderTrips(locale = 'en') {
    mockLocaleRef.value = locale
    const { render } = await import('@testing-library/react')
    return render(await AccountTripsPage())
  }

  it('links a non-terminal booking with a stored policy, with the locale prefix', async () => {
    mockBookings.rows = [trip('a')]
    const { getByRole } = await renderTrips('ru')
    const link = getByRole('link', { name: 'Управлять бронированием' })
    expect(link.getAttribute('href')).toBe(`/ru/manage/${'Ta'.padEnd(43, 'x')}`)
    expect(mockEnsure).toHaveBeenCalledWith('a')
  })

  it('reads Manage booking in English', async () => {
    mockBookings.rows = [trip('a')]
    const { getByRole } = await renderTrips('en')
    expect(getByRole('link', { name: 'Manage booking' }).getAttribute('href')).toMatch(/^\/manage\/T/)
  })

  it('shows no link for a terminal booking, a legacy booking or a booking without a token', async () => {
    mockBookings.rows = [
      trip('done', { status: 'completed' }),
      trip('gone', { status: 'cancelled' }),
      trip('missed', { status: 'no_show' }),
      trip('legacy', { cancel_policy_version: null }),
      trip('no-token'),
    ]
    const { queryAllByRole } = await renderTrips('en')
    expect(queryAllByRole('link', { name: 'Manage booking' })).toHaveLength(0)
    // Terminal and legacy rows are skipped before any token is minted.
    expect(mockEnsure).toHaveBeenCalledTimes(1)
    expect(mockEnsure).toHaveBeenCalledWith('no-token')
  })

  it('a failing token read drops that link only', async () => {
    mockBookings.rows = [trip('a'), trip('b')]
    mockEnsure.mockImplementation(async (id: string) => {
      if (id === 'a') throw new Error('db')
      return 'Tb'.padEnd(43, 'x')
    })
    const { queryAllByRole } = await renderTrips('en')
    expect(queryAllByRole('link', { name: 'Manage booking' })).toHaveLength(1)
  })

  it('the trips page never reads a token column through the user client', () => {
    const src = readFileSync(join(process.cwd(), 'app/[locale]/account/trips/page.tsx'), 'utf8')
    expect(src).toContain('ensureManageToken')
    expect(src).not.toMatch(/booking_manage_tokens/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('catalog parity (7 locales)', () => {
  type Json = string | { [k: string]: Json }
  const flatten = (node: Json | undefined, prefix = ''): Record<string, string> => {
    if (node === undefined) return {}
    if (typeof node === 'string') return { [prefix]: node }
    return Object.assign({}, ...Object.entries(node).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)))
  }
  const catalog = (loc: string) => ALL_MESSAGES[loc] as { Manage: Json; Account: { trips: { manage: string } } }
  const params = (s: string) =>
    Array.from(s.matchAll(/\{(\w+)[,}]|<(\/?\w+)>/g), (m) => m[1] ?? m[2])
      .filter((p) => !p.startsWith('/'))
      .sort()
      .join(',')
  const others = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']
  const en = flatten(catalog('en').Manage)

  it('the English namespace is non-trivial and carries Account.trips.manage', () => {
    expect(Object.keys(en).length).toBeGreaterThan(60)
    expect(catalog('en').Account.trips.manage).toBe('Manage booking')
  })

  it.each(others)('%s has the same keys and the same ICU parameters as English', (loc) => {
    const flat = flatten(catalog(loc).Manage)
    expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort())
    for (const [key, value] of Object.entries(flat)) {
      expect(params(value), `${loc} ${key}`).toBe(params(en[key]))
      expect(value.trim().length, `${loc} ${key}`).toBeGreaterThan(0)
    }
    expect(params(catalog(loc).Account.trips.manage)).toBe('')
  })

  it.each(others)('%s: no new key equals its English value (real translations, no stubs)', (loc) => {
    const flat = flatten(catalog(loc).Manage)
    for (const [key, value] of Object.entries(flat)) {
      const onlyParams = en[key].replace(/<\/?bdi>|\{\w+\}|[\s.,:;()%]/g, '') === ''
      if (onlyParams) continue
      expect(value, `${loc} ${key}`).not.toBe(en[key])
    }
    expect(catalog(loc).Account.trips.manage).not.toBe(catalog('en').Account.trips.manage)
    expect(JSON.stringify(flat)).not.toMatch(/\[(RU|ES|FR|AR|HI|ZH)\]/)
  })

  it('no catalog value types an amount', () => {
    for (const loc of ['en', ...others]) {
      for (const [key, value] of Object.entries(flatten(catalog(loc).Manage))) {
        expect(value, `${loc} ${key}`).not.toMatch(/[€]|\bCZK\b|\bKč\b|\bEUR\b/)
      }
    }
  })
})
