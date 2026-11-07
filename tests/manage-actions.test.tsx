/**
 * Phase 89, plan 89-28 — what a client can do on the manage page (UI-SPEC Surface 1; D-01 to D-04).
 *
 * The real page function is awaited (real buildManageView, real catalogs, mocked token resolver and reader) and the
 * result is rendered with Testing Library, so the ready-made strings of the page and the client island are tested
 * together. fetch is faked: the routes themselves are covered by tests/manage-booking.test.ts.
 *
 * Every line of the errors table and of the result table of Surface 1 is asserted for its response, with its ARIA role.
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

const { mockLocaleRef, mockResolve, mockLoad, mockRefresh, reactServerBuild } = vi.hoisted(() => ({
  // The react-server build of next-intl/server (vitest has no react-server export condition), built from the project root.
  reactServerBuild: { path: `${process.cwd()}/node_modules/next-intl/dist/esm/development/server.react-server.js` },
  mockLocaleRef: { value: 'en' },
  mockResolve: vi.fn(),
  mockLoad: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next-intl/server', async () => {
  return await vi.importActual(reactServerBuild.path)
})

vi.mock('next-intl/config', async () => {
  const { getRequestConfig } = await vi.importActual<typeof import('next-intl/server')>(reactServerBuild.path)
  return {
    default: getRequestConfig(async () => ({
      locale: mockLocaleRef.value,
      messages: ALL_MESSAGES[mockLocaleRef.value] as Record<string, unknown>,
    })),
  }
})

vi.mock('@/lib/manage-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/manage-link')>()
  return { ...actual, resolveManageToken: mockResolve }
})

vi.mock('@/lib/manage-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/manage-view')>()
  return { ...actual, loadManageView: mockLoad }
})

// The locale-aware router of the island (the next/navigation one drops the locale, tests/locale-links-backstop).
vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return { ...actual, useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }) }
})

import { buildManageView } from '@/lib/manage-view'
import ManageBookingPage from '@/app/[locale]/manage/[token]/page'

const HOUR = 3_600_000
const mockFetch = vi.fn()

const POLICY = {
  version: '2026-11-1',
  kmThreshold: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 50,
}

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'booking-1',
    booking_reference: 'PR-4821',
    status: 'confirmed',
    trip_type: 'transfer',
    distance_km: 300,
    pickup_utc: new Date(Date.now() + 48 * HOUR).toISOString(),
    pickup_date: '2030-11-12',
    pickup_time: '11:00',
    origin_address: 'Václavské náměstí 1, Praha',
    destination_address: 'Vienna International Airport',
    vehicle_class: 'business',
    passengers: 2,
    amount_eur: 180,
    payment_mode: 'card_hold',
    payment_state: 'authorized',
    payment_currency: 'eur',
    payment_amount_minor: 18000,
    hold_amount_minor: 18000,
    leg: 'outbound',
    cancel_policy: POLICY,
    cancel_policy_version: '2026-11-1',
    booking_source: 'online',
    stripe_payment_method_id: 'pm_1',
    ...over,
  }
}

const lateRow = (over: Record<string, unknown> = {}) => row({ pickup_utc: new Date(Date.now() + 5 * HOUR).toISOString(), ...over })

let seq = 0
// A token per test: the "cancelled in this browser" flag is keyed by token, so tests never see each other's cancel.
const nextToken = () => `T${String(++seq).padStart(42, '0')}`

async function renderPage(source: Record<string, unknown>, locale = 'en') {
  mockLocaleRef.value = locale
  const token = nextToken()
  mockResolve.mockResolvedValue('booking-1')
  mockLoad.mockResolvedValue(buildManageView(source, {}, Date.now()))
  const element = await ManageBookingPage({ params: Promise.resolve({ locale, token }) })
  const rtl = await import('@testing-library/react')
  const userEvent = (await import('@testing-library/user-event')).default
  return { ...rtl.render(element), token, user: userEvent.setup(), screen: rtl.screen, waitFor: rtl.waitFor, act: rtl.act }
}

const reply = (body: Record<string, unknown>, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

beforeEach(() => {
  vi.clearAllMocks()
  mockLocaleRef.value = 'en'
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(async () => {
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  vi.unstubAllGlobals()
})

type Page = Awaited<ReturnType<typeof renderPage>>

async function openCancel(p: Page) {
  await p.user.click(p.screen.getByRole('button', { name: 'Cancel booking' }))
}

// ---------------------------------------------------------------------------------------------------------------------
describe('cancel region: confirm (D-02), focus and keyboard', () => {
  it('the cancel always asks for confirmation: the button opens an inline group, nothing is sent yet', async () => {
    const p = await renderPage(row())
    expect(p.container.querySelector('[data-manage-slot="cancel-region"] button')).not.toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
    await openCancel(p)
    const group = p.screen.getByRole('group', { name: 'Cancel this booking?' })
    expect(group).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(group.textContent).toContain('Nothing will be charged.')
  })

  it('focus moves to the heading; Keep my booking is the first control and gold; Yes, cancel is the outline danger button', async () => {
    const p = await renderPage(row())
    await openCancel(p)
    const heading = p.screen.getByRole('heading', { name: 'Cancel this booking?' })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(heading)
    const buttons = p.screen.getByRole('group').querySelectorAll('button')
    expect(buttons[0].textContent).toBe('Keep my booking')
    expect(buttons[0].className).toContain('btn-primary')
    expect(buttons[1].textContent).toBe('Yes, cancel booking')
    expect(buttons[1].className).not.toContain('btn-primary')
  })

  it('Escape closes the region when not busy and gives focus back to Cancel booking', async () => {
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.keyboard('{Escape}')
    expect(p.screen.queryByRole('group')).toBeNull()
    await p.waitFor(() => expect(document.activeElement).toBe(p.screen.getByRole('button', { name: 'Cancel booking' })))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Keep my booking closes it too and nothing is sent', async () => {
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Keep my booking' }))
    expect(p.screen.queryByRole('group')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('free cancel: loading (E4), results, H1', () => {
  it('sends the token and acknowledge free; while pending: Cancelling…, aria-busy, both buttons disabled, Escape does not close', async () => {
    let finish: (r: Response) => void = () => {}
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)))
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/manage/cancel')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ token: p.token, acknowledge: 'free' })

    const busy = p.screen.getByRole('button', { name: /Cancelling/ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(p.screen.getByRole('button', { name: 'Keep my booking' })).toBeDisabled()
    expect(p.screen.getByRole('group')).toHaveAttribute('aria-busy', 'true')
    await p.user.keyboard('{Escape}')
    expect(p.screen.getByRole('group')).toBeInTheDocument()

    finish(new Response(JSON.stringify({ ok: true, outcome: 'free', money: 'released' }), { status: 200 }))
    await p.waitFor(() => expect(p.screen.getByTestId('manage-cancel-result')).toBeInTheDocument())
  })

  it('hold released: role status with the sentence, the email line, the H1 becomes Booking cancelled and the change form goes', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'free', money: 'released' }))
    const p = await renderPage(row())
    expect(p.screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Your trip on /)
    expect(p.screen.getByRole('button', { name: 'Ask for a change' })).toBeInTheDocument()
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    const result = await p.screen.findByRole('status')
    expect(result.textContent).toContain('Your booking is cancelled. Nothing was charged. The hold on your card is released')
    expect(result.textContent).toContain('We sent you an email.')
    expect(document.activeElement).toBe(result)
    expect(p.screen.getByRole('heading', { level: 1 }).textContent).toBe('Booking cancelled')
    expect(p.screen.queryByRole('button', { name: 'Ask for a change' })).toBeNull()
    expect(p.screen.queryByRole('group')).toBeNull()
  })

  it('refunded: the refund sentence with the formatted amount from the page', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'free', money: 'refunded', refundedMinor: 18000, currency: 'eur' }))
    const p = await renderPage(
      row({ payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_1', payment_amount_minor: null, payment_currency: null }),
    )
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    const result = await p.screen.findByRole('status')
    expect(result.textContent).toMatch(/We refunded .*180.*Your bank usually shows it within 5 to 10 business days\./)
    expect(result.textContent).toContain('We sent you an email.')
  })

  it('nothing collected: Nothing was charged', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'free', money: 'none' }))
    const p = await renderPage(row({ payment_mode: null, payment_state: 'none', payment_amount_minor: null, payment_currency: null }))
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    expect((await p.screen.findByRole('status')).textContent).toContain('Your booking is cancelled. Nothing was charged.')
  })

  it('the refund could not be made after the cancel: finished by hand, no error word, no email promise', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'free', money: 'manual' }))
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    const result = await p.screen.findByRole('status')
    expect(result.textContent).toContain('We need to finish your refund by hand and will email you when it is done.')
    expect(result.textContent).not.toMatch(/fail|error/i)
    expect(result.textContent).not.toContain('We sent you an email.')
  })

  it('a repeat cancel is a success: the page is refreshed into the cancelled state and no error is shown', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, alreadyCancelled: true }))
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    await p.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(p.screen.queryByRole('alert')).toBeNull()
    expect(p.screen.getByRole('heading', { level: 1 }).textContent).toBe('Booking cancelled')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('late cancel: the tick (E5) and POLICY_CHANGED (E3)', () => {
  it('shows the late summary and a tick row; the confirm stays disabled until it is ticked; the tick starts unticked', async () => {
    const p = await renderPage(lateRow())
    await openCancel(p)
    const group = p.screen.getByRole('group')
    expect(group.textContent).toMatch(/50% of the fare \(.*90.*\) applies\./)
    const tick = p.screen.getByRole('checkbox')
    expect(tick).not.toBeChecked()
    expect(tick.closest('label')?.textContent).toMatch(/I understand that 50% of the fare \(.*90.*\) applies because I am cancelling after /)
    const confirm = p.screen.getByRole('button', { name: 'Yes, cancel booking' })
    expect(confirm).toBeDisabled()
    await p.user.click(confirm)
    expect(mockFetch).not.toHaveBeenCalled()
    await p.user.click(tick)
    expect(confirm).toBeEnabled()
    await p.user.click(tick)
    expect(confirm).toBeDisabled()
  })

  it('sends acknowledge late and tells the client the decision comes by email', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'late', money: 'kept' }))
    const p = await renderPage(lateRow())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('checkbox'))
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    const result = await p.screen.findByRole('status')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ token: p.token, acknowledge: 'late' })
    expect(result.textContent).toMatch(/Your booking is cancelled and your driver is told\. Nothing has been charged yet\. Because you cancelled after .*, up to .*90.* may be charged\. We will email you our decision\./)
    expect(result.textContent).toContain('We sent you an email.')
  })

  it('late with nothing to charge: its own result line, and the tick names the end of the free period only', async () => {
    mockFetch.mockImplementation(() => reply({ ok: true, outcome: 'late', money: 'kept' }))
    const p = await renderPage(lateRow({ payment_mode: null, payment_state: 'none', payment_amount_minor: null, payment_currency: null, amount_eur: null }))
    await openCancel(p)
    expect(p.screen.getByRole('checkbox').closest('label')?.textContent).toMatch(/^I understand that free cancellation ended on /)
    await p.user.click(p.screen.getByRole('checkbox'))
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    expect((await p.screen.findByRole('status')).textContent).toContain('Nothing will be charged.')
  })

  it('409 POLICY_CHANGED: clears the tick, re-renders in the new variant, moves focus to the notice and refreshes the page', async () => {
    mockFetch.mockImplementation(() => reply({ error: 'POLICY_CHANGED', code: 'POLICY_CHANGED', outcome: 'late' }, 409))
    // The page was loaded inside the free window; by the time the client confirms, the window has ended.
    const p = await renderPage(row())
    await openCancel(p)
    expect(p.screen.queryByRole('checkbox')).toBeNull()
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))

    const notice = await p.screen.findByRole('status')
    expect(notice.textContent).toBe('The cancellation terms changed while you were reading. Please review and confirm again.')
    expect(document.activeElement).toBe(notice)
    expect(mockRefresh).toHaveBeenCalled()
    // New variant: the late summary and an unticked tick that gates the confirm.
    const tick = p.screen.getByRole('checkbox')
    expect(tick).not.toBeChecked()
    expect(p.screen.getByRole('button', { name: 'Yes, cancel booking' })).toBeDisabled()
    expect(p.screen.getByRole('group').textContent).toMatch(/50% of the fare/)
  })

  it('POLICY_CHANGED with a tick already given clears it', async () => {
    mockFetch.mockImplementation(() => reply({ error: 'POLICY_CHANGED', code: 'POLICY_CHANGED', outcome: 'late' }, 409))
    const p = await renderPage(lateRow())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('checkbox'))
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    await p.screen.findByText('The cancellation terms changed while you were reading. Please review and confirm again.')
    expect(p.screen.getByRole('checkbox')).not.toBeChecked()
    expect(p.screen.getByRole('button', { name: 'Yes, cancel booking' })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('cancel errors (E4): each keeps the booking unchanged and has its copy', () => {
  async function failWith(source: () => Promise<Response>) {
    mockFetch.mockImplementation(source)
    const p = await renderPage(row())
    await openCancel(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Yes, cancel booking' }))
    return p
  }

  it('409 payment_busy', async () => {
    const p = await failWith(() => reply({ error: 'payment_busy' }, 409))
    const alert = await p.screen.findByRole('alert')
    expect(alert.textContent).toBe('We are processing a payment for this booking. Please try again in a minute.')
    expect(p.screen.getByRole('group')).toBeInTheDocument()
    expect(p.screen.getByRole('button', { name: 'Yes, cancel booking' })).toBeEnabled()
    expect(p.screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Your trip on /)
  })

  it('429', async () => {
    const p = await failWith(() => reply({ error: 'Too many requests' }, 429))
    expect((await p.screen.findByRole('alert')).textContent).toBe('Too many attempts. Please wait a few minutes and try again.')
  })

  it('network failure', async () => {
    const p = await failWith(() => Promise.reject(new TypeError('Failed to fetch')))
    expect((await p.screen.findByRole('alert')).textContent).toBe('We could not reach the server. Nothing was changed. Please try again.')
    expect(p.screen.getByRole('button', { name: 'Yes, cancel booking' })).toBeEnabled()
  })

  it('any other failure: the call-us line with a tel link and the phone isolated left to right', async () => {
    const p = await failWith(() => reply({ error: 'cancel_failed' }, 500))
    const alert = await p.screen.findByRole('alert')
    expect(alert.textContent).toMatch(/^We could not cancel your booking\. Nothing was changed\. Please try again or call us: \+?[\d ]+\.$/)
    const link = alert.querySelector('a')
    expect(link?.getAttribute('href')).toMatch(/^tel:/)
    expect(link?.querySelector('bdi')?.getAttribute('dir')).toBe('ltr')
  })

  it('an unreadable body is the generic failure too', async () => {
    const p = await failWith(() => Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect((await p.screen.findByRole('alert')).textContent).toMatch(/^We could not cancel your booking/)
  })

  it('409 already cancelled or status moved: no error, the page is refreshed into what it is now', async () => {
    const p = await failWith(() => reply({ error: 'status_conflict', currentStatus: 'completed' }, 409))
    await p.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(p.screen.queryByRole('alert')).toBeNull()
  })

  it('409 too late / not cancellable: no error either, the page decides what to show', async () => {
    const p = await failWith(() => reply({ error: 'too_late' }, 409))
    await p.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(p.screen.queryByRole('alert')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('change request (D-01, E6)', () => {
  async function openChange(p: Page) {
    await p.user.click(p.screen.getByRole('button', { name: 'Ask for a change' }))
    return p.screen.getByRole('textbox')
  }

  it('is a collapsed button; opening shows the label, the helper, the phone line and a textarea with maxLength 1000 and rows 5', async () => {
    const p = await renderPage(row())
    expect(p.container.querySelector('[data-manage-slot="change-request"]')).not.toBeNull()
    expect(p.screen.queryByRole('textbox')).toBeNull()
    const box = await openChange(p)
    expect(document.activeElement).toBe(box)
    expect(box).toHaveAttribute('maxlength', '1000')
    expect(box).toHaveAttribute('rows', '5')
    expect(box).toHaveAttribute('autocomplete', 'off')
    const region = p.screen.getByTestId('manage-change-region')
    expect(region.textContent).toContain('What would you like to change?')
    expect(region.textContent).toContain('Date, time, address, vehicle or passengers. We will reply by email and tell you if the price changes. Nothing changes until we confirm.')
    expect(region.textContent).toMatch(/In a hurry\? Call us on \+?[\d ]+\./)
    expect(p.screen.getByLabelText('What would you like to change?')).toBe(box)
  })

  it('an empty message is blocked inline with an alert and nothing is sent', async () => {
    const p = await renderPage(row())
    await openChange(p)
    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))
    expect((await p.screen.findByRole('alert')).textContent).toBe('Please write what you would like to change.')
    expect(mockFetch).not.toHaveBeenCalled()
    await p.user.type(p.screen.getByRole('textbox'), '   ')
    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))
    expect(p.screen.getByRole('alert').textContent).toBe('Please write what you would like to change.')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends token and message; Sending… with aria-busy; success replaces the form with a status', async () => {
    let finish: (r: Response) => void = () => {}
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)))
    const p = await renderPage(row())
    await openChange(p)
    await p.user.type(p.screen.getByRole('textbox'), 'Pickup at 12:00 please')
    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/manage/change-request')
    expect(JSON.parse(init.body)).toEqual({ token: p.token, message: 'Pickup at 12:00 please' })
    const busy = p.screen.getByRole('button', { name: /Sending/ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')

    finish(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const status = await p.screen.findByRole('status')
    expect(status.textContent).toBe('Request sent. We will reply by email.')
    expect(p.screen.queryByRole('textbox')).toBeNull()
    expect(p.screen.queryByRole('button', { name: 'Send request' })).toBeNull()
    expect(p.screen.queryByRole('button', { name: 'Ask for a change' })).toBeNull()
  })

  it('429: its own line and the typed text is kept', async () => {
    mockFetch.mockImplementation(() => reply({ error: 'Too many requests' }, 429))
    const p = await renderPage(row())
    await openChange(p)
    await p.user.type(p.screen.getByRole('textbox'), 'Move it please')
    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))
    expect((await p.screen.findByRole('alert')).textContent).toBe('You already sent a request a moment ago. We will reply soon.')
    expect(p.screen.getByRole('textbox')).toHaveValue('Move it please')
    expect(p.screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
  })

  it('network and other failures: the call-us line, the typed text is kept', async () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
    mockFetch.mockImplementationOnce(() => reply({ error: 'send_failed' }, 502))
    const p = await renderPage(row())
    await openChange(p)
    await p.user.type(p.screen.getByRole('textbox'), 'Different address')
    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))
    let alert = await p.screen.findByRole('alert')
    expect(alert.textContent).toMatch(/^We could not send your request\. Please try again or call us: \+?[\d ]+\.$/)
    expect(alert.querySelector('a')?.getAttribute('href')).toMatch(/^tel:/)
    expect(p.screen.getByRole('textbox')).toHaveValue('Different address')

    await p.user.click(p.screen.getByRole('button', { name: 'Send request' }))
    await p.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    alert = await p.screen.findByRole('alert')
    expect(alert.textContent).toMatch(/^We could not send your request/)
    expect(p.screen.getByRole('textbox')).toHaveValue('Different address')
  })

  it('shows the counter only above 900 characters', async () => {
    const p = await renderPage(row())
    const box = await openChange(p)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(box, { target: { value: 'x'.repeat(900) } })
    expect(p.screen.getByTestId('manage-change-region').textContent).not.toMatch(/\/ 1000/)
    fireEvent.change(box, { target: { value: 'x'.repeat(901) } })
    expect(p.screen.getByTestId('manage-change-region').textContent).toContain('901 / 1000')
  })

  it('the form is still offered when the pickup has passed (no cancel there, only the call-us panel), D-01', async () => {
    const p = await renderPage(row({ pickup_utc: new Date(Date.now() - HOUR).toISOString() }))
    expect(p.screen.getByRole('button', { name: 'Ask for a change' })).toBeInTheDocument()
    expect(p.container.querySelector('[data-manage-slot="cancel-region"]')).toBeNull()
  })

  it('no cancel and no change form once the trip is on board, completed or cancelled', async () => {
    for (const status of ['on_board', 'completed', 'cancelled']) {
      const p = await renderPage(row({ status }))
      expect(p.screen.queryByRole('button', { name: 'Ask for a change' })).toBeNull()
      expect(p.screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull()
      const { cleanup } = await import('@testing-library/react')
      cleanup()
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Manage.actions in 7 locales', () => {
  type Json = string | { [k: string]: Json }
  const flatten = (node: Json | undefined, prefix = ''): Record<string, string> => {
    if (node === undefined) return {}
    if (typeof node === 'string') return { [prefix]: node }
    return Object.assign({}, ...Object.entries(node).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)))
  }
  const actionsOf = (loc: string) => flatten((ALL_MESSAGES[loc] as { Manage: { actions: Json } }).Manage.actions)
  // ICU arguments and rich tags, order-free.
  const params = (s: string) =>
    Array.from(s.matchAll(/\{(\w+)[,}]|<(\/?\w+)>/g), (m) => m[1] ?? m[2])
      .filter((p) => !p.startsWith('/'))
      .sort()
      .join(',')
  const others = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']
  const en = actionsOf('en')

  it('English carries the whole action vocabulary', () => {
    expect(Object.keys(en).length).toBe(32)
    expect(params(en['cancel.tickLate'])).toBe('amount,bdi,bdi,freeUntil,percent')
    expect(params(en['error.generic'])).toBe('phone,tel')
  })

  it.each(others)('%s has the same Manage.actions keys and ICU parameters as English', (loc) => {
    const flat = actionsOf(loc)
    expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort())
    for (const [key, value] of Object.entries(flat)) {
      expect(params(value), `${loc} ${key}`).toBe(params(en[key]))
      expect(value.trim().length, `${loc} ${key}`).toBeGreaterThan(0)
      expect(value, `${loc} ${key}`).not.toMatch(/[€]|\bCZK\b|\bKč\b|\bEUR\b/)
    }
  })

  it.each(others)('%s: no action string equals its English value (real translations)', (loc) => {
    for (const [key, value] of Object.entries(actionsOf(loc))) {
      const onlyParams = en[key].replace(/<\/?\w+>|\{\w+\}|[\s.,:;()%]/g, '') === ''
      if (onlyParams) continue
      expect(value, `${loc} ${key}`).not.toBe(en[key])
    }
  })

  it.each(['en', ...others])('%s: the confirm region, the late tick and the change form render with no missing-message marker', async (loc) => {
    const p = await renderPage(lateRow(), loc)
    const flat = actionsOf(loc)
    await p.user.click(p.container.querySelector('[data-manage-slot="cancel-region"] button') as HTMLElement)
    const group = p.screen.getByRole('group')
    expect(group.textContent).toContain(flat['cancel.heading'])
    const buttons = group.querySelectorAll('button')
    expect(buttons[0].textContent).toBe(flat['cancel.keep'])
    expect(buttons[1].textContent).toBe(flat['cancel.confirm'])
    expect(group.querySelector('label')?.textContent).not.toMatch(/\{|\}|<|>/)
    await p.user.click(p.container.querySelector('[data-manage-slot="change-request"] button') as HTMLElement)
    const region = p.screen.getByTestId('manage-change-region')
    expect(region.textContent).toContain(flat['change.label'])
    expect(region.textContent).toContain(flat['change.helper'])
    expect(region.querySelector('a')?.getAttribute('href')).toMatch(/^tel:/)
    expect(p.container.textContent).not.toMatch(/Manage\.actions|actions\.(cancel|result|error|change)/)
  })

  it('ar: the confirm region keeps Latin digits for the percent, the amount and the dates, and reads right to left', async () => {
    const p = await renderPage(lateRow(), 'ar')
    await p.user.click(p.container.querySelector('[data-manage-slot="cancel-region"] button') as HTMLElement)
    const group = p.screen.getByRole('group')
    const text = group.textContent ?? ''
    expect(text).toMatch(/50/)
    expect(text).toMatch(/90/)
    expect(text).not.toMatch(/[٠-٩۰-۹]/)
    expect(text).toMatch(/[؀-ۿ]{3,}/)
    // Amounts and dates are isolated, so they keep their direction inside the Arabic sentence.
    expect(group.querySelectorAll('bdi').length).toBeGreaterThanOrEqual(3)
  })

  it('ru: a failure shows the Russian call-us line with a working tel link', async () => {
    mockFetch.mockImplementation(() => reply({ error: 'cancel_failed' }, 500))
    const p = await renderPage(row(), 'ru')
    await p.user.click(p.container.querySelector('[data-manage-slot="cancel-region"] button') as HTMLElement)
    await p.user.click(p.screen.getByRole('button', { name: actionsOf('ru')['cancel.confirm'] }))
    const alert = await p.screen.findByRole('alert')
    expect(alert.textContent).toContain('Не удалось отменить бронирование')
    expect(alert.querySelector('a')?.getAttribute('href')).toMatch(/^tel:/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('source rules', () => {
  const src = readFileSync(join(process.cwd(), 'app/[locale]/manage/[token]/ManageActions.tsx'), 'utf8')

  it('types a euro sign nowhere in the client island', () => {
    expect(src.includes('€')).toBe(false)
  })

  it('is the only client component of the page and imports no server module', () => {
    expect(src.startsWith("'use client'")).toBe(true)
    expect(src).not.toMatch(/from '@\/lib\/(manage-view|manage-link|supabase|payments)/)
    for (const file of ['page.tsx', 'ManageHeader.tsx', 'InvalidManageLinkView.tsx', 'loading.tsx']) {
      expect(readFileSync(join(process.cwd(), 'app/[locale]/manage/[token]', file), 'utf8')).not.toMatch(/^'use client'/)
    }
  })

  it('never writes the token to a log or the URL', () => {
    expect(src).not.toMatch(/console\./)
    expect(src).not.toMatch(/localStorage|sessionStorage|location\.(search|hash)/)
  })
})
