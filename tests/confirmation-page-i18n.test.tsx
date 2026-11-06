/**
 * Phase 89, plan 89-18 — the confirmation page is translated in all 7 locales (88 deferred item, UI-SPEC 2.5) and
 * gains two sentences that only a booking with stored terms shows. The manage link is never on the page (T-89-59).
 *
 * Deliberate early change: the translation is not behind the flag (it only translates existing text, no terms);
 * only the manage-link sentence and the cash sentence are gated, by the notice the checkout step writes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { locales } from '@/i18n/locales'
import { renderWithIntl } from './helpers/renderWithIntl'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

const { useSearchParamsMock } = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(() => new URLSearchParams('ref=PRG-20260415-ABCDEF&type=paid')),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: useSearchParamsMock,
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}))
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...rest }: { children: ReactNode; href: string; 'aria-label'?: string }) => (
    <a href={href} aria-label={rest['aria-label']}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn(() => 'ICS-STUB') }))
vi.mock('@/lib/analytics-snapshot', () => ({
  consumePurchaseSnapshot: vi.fn(() => ({ value: 100, currency: 'EUR', items: [] })),
}))
vi.mock('@/lib/extras', () => ({ computeExtrasTotal: vi.fn(() => 0) }))

const store = {
  origin: { address: 'Prague Airport' },
  destination: { address: 'Hotel Alcron' },
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  returnDate: '2026-04-17',
  returnTime: '18:30',
  vehicleClass: 'first_class',
  passengers: 3,
  hours: null as number | null,
  tripType: 'transfer',
  priceBreakdown: null,
  extras: {},
  promoDiscount: 0,
  resetBooking: vi.fn(),
}
vi.mock('@/lib/booking-store', () => ({
  useBookingStore: Object.assign(
    vi.fn((selector?: (s: typeof store) => unknown) => (typeof selector === 'function' ? selector(store) : store)),
    { getState: vi.fn(() => store) },
  ),
}))

import { writeConfirmationNotice, readConfirmationNotice } from '@/lib/confirmation-notice'

const REF = 'PRG-20260415-ABCDEF'
const NOTICE_KEY = 'prestigo-confirmation-notice'

function catalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Record<string, unknown>
}
const confirmationOf = (locale: string): Record<string, string> =>
  ((catalog(locale).Booking as Record<string, unknown>).confirmation as Record<string, string>)

async function renderPage(locale = 'en', search = `ref=${REF}&type=paid`) {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(search))
  const mod = await import('@/app/[locale]/book/confirmation/page')
  const Page = mod.default
  return renderWithIntl(<Page />, { locale, messages: catalog(locale) as never })
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
  global.URL.createObjectURL = vi.fn(() => 'blob:stub')
  global.URL.revokeObjectURL = vi.fn()
})

describe('the confirmation notice (lib/confirmation-notice.ts)', () => {
  it('is read once and cleared', () => {
    writeConfirmationNotice({ ref: REF })
    expect(readConfirmationNotice(REF)).toEqual({ ref: REF })
    expect(readConfirmationNotice(REF)).toBeNull()
  })

  it('carries the cash label and ignores another booking, bad JSON and non-string cash', () => {
    writeConfirmationNotice({ ref: REF, cash: '€120.00' })
    expect(readConfirmationNotice(REF)).toEqual({ ref: REF, cash: '€120.00' })

    writeConfirmationNotice({ ref: REF })
    expect(readConfirmationNotice('PRG-20260416-FFFFFF')).toBeNull()

    window.sessionStorage.setItem(NOTICE_KEY, '{not json')
    expect(readConfirmationNotice(REF)).toBeNull()

    window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ ref: REF, cash: 42 }))
    expect(readConfirmationNotice(REF)).toEqual({ ref: REF })
  })

  it('stores nothing but the reference and the label (no URL, no token)', () => {
    writeConfirmationNotice({ ref: REF, cash: '€120.00', ...({ manageUrl: 'https://x/manage/t' } as object) })
    const raw = window.sessionStorage.getItem(NOTICE_KEY)!
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['cash', 'ref'])
  })
})

describe('the page in every locale: static strings come from Booking.confirmation', () => {
  it.each(locales)('%s renders the localized heading, reference label, buttons and vehicle', async (locale) => {
    const c = confirmationOf(locale)
    await renderPage(locale)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(c.headingBooking)
    expect(screen.getByText(c.refBooking)).toBeTruthy()
    expect(screen.getByText(c.journeyDetails)).toBeTruthy()
    expect(screen.getByText(c.print)).toBeTruthy()
    expect(screen.getByText(c.calendar)).toBeTruthy()
    // Exact text match: French keeps a no-break space before the question mark, which getByText would normalise away.
    expect(screen.getByText((_, el) => el?.tagName === 'A' && el.textContent === c.contact)).toBeTruthy()
    expect(screen.getByText(c.bookAnother)).toBeTruthy()
    expect(screen.getByText(c.backHome)).toBeTruthy()
    expect(screen.getByLabelText(c.printAria)).toBeTruthy()
    expect(screen.getByLabelText(c.calendarAria)).toBeTruthy()
    expect(screen.getByLabelText(c.homeAria)).toBeTruthy()
    // Date and time through the message, vehicle through the existing vehicle-class catalog.
    expect(screen.getByText(c.dateTime.replace('{date}', '2026-04-15').replace('{time}', '14:00'))).toBeTruthy()
    const vehicle = (((catalog(locale).Booking as Record<string, unknown>).vehicleClasses as Record<string, { label: string }>).firstClass).label
    expect(screen.getByText(new RegExp(vehicle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
  })

  it('ru shows no English page text', async () => {
    const { container } = await renderPage('ru')
    for (const english of ['BOOKING CONFIRMED', 'JOURNEY DETAILS', 'ADD TO CALENDAR', 'passengers', 'First Class']) {
      expect(container.textContent).not.toContain(english)
    }
    expect(container.textContent).toContain('3 пассажира')
  })

  it('the quote flow and the expired session are translated too', async () => {
    await renderPage('ru', `ref=${REF}&type=quote`)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(confirmationOf('ru').headingQuote)
    expect(screen.getByText(confirmationOf('ru').quoteBody)).toBeTruthy()
  })

  it('expired session', async () => {
    await renderPage('ar', 'ref=garbage')
    expect(screen.getByText(confirmationOf('ar').sessionExpired)).toBeTruthy()
    expect(screen.getByText(confirmationOf('ar').bookNow)).toBeTruthy()
  })

  it('round trip labels and an hourly booking use the catalog', async () => {
    await renderPage('es', `ref=${REF}&returnRef=PRG-20260417-DEF456&type=paid`)
    const c = confirmationOf('es')
    expect(screen.getByText(c.outboundJourney)).toBeTruthy()
    expect(screen.getByText(c.returnJourney)).toBeTruthy()
    expect(screen.getAllByText(c.outbound).length).toBeGreaterThan(0)
  })

  it('hourly trips read the duration from the catalog', async () => {
    store.tripType = 'hourly'
    store.hours = 4
    try {
      await renderPage('fr')
      expect(screen.getByText('4 h')).toBeTruthy()
    } finally {
      store.tripType = 'transfer'
      store.hours = null
    }
  })
})

describe('the two gated sentences (CANC-02)', () => {
  it('a stored-policy card booking shows the manage sentence and no cash sentence', async () => {
    writeConfirmationNotice({ ref: REF })
    await renderPage('ru')
    const c = confirmationOf('ru')
    expect(await screen.findByText(c.manageSentence)).toBeTruthy()
    expect(screen.queryByText(/наличными/)).toBeNull()
  })

  it('a cash booking also shows the amount, isolated for right-to-left reading', async () => {
    writeConfirmationNotice({ ref: REF, cash: '€120.00' })
    const { container } = await renderPage('ar')
    expect(await screen.findByText(confirmationOf('ar').manageSentence)).toBeTruthy()
    const bdi = container.querySelector('bdi')
    expect(bdi?.textContent).toBe('€120.00')
    expect(bdi?.getAttribute('dir')).toBe('ltr')
    expect(container.textContent).toContain('نقدًا للسائق')
  })

  it('English wording is the plan wording', async () => {
    writeConfirmationNotice({ ref: REF, cash: '€120.00' })
    const { container } = await renderPage('en')
    expect(await screen.findByText('We sent your confirmation and a link to manage your booking to your email.')).toBeTruthy()
    expect(container.textContent).toContain('Pay €120.00 in cash to your driver.')
  })

  it('with no notice (policy not public) neither sentence appears and the existing text is intact', async () => {
    const { container } = await renderPage('en')
    expect(screen.queryByText(/link to manage your booking/)).toBeNull()
    expect(container.textContent).not.toContain('in cash to your driver')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('BOOKING CONFIRMED')
  })

  it('a reload (the notice was consumed) shows neither sentence', async () => {
    writeConfirmationNotice({ ref: REF })
    const first = await renderPage('en')
    expect(await screen.findByText(/link to manage your booking/)).toBeTruthy()
    first.unmount()
    await renderPage('en')
    expect(screen.queryByText(/link to manage your booking/)).toBeNull()
  })

  it('a notice written for another booking is not shown', async () => {
    writeConfirmationNotice({ ref: 'PRG-20260416-ABCDEF' })
    await renderPage('en')
    expect(screen.queryByText(/link to manage your booking/)).toBeNull()
  })

  it('the quote flow never shows the sentences', async () => {
    writeConfirmationNotice({ ref: REF })
    await renderPage('en', `ref=${REF}&type=quote`)
    expect(screen.queryByText(/link to manage your booking/)).toBeNull()
  })

  it('T-89-59: the manage link is never on the page', async () => {
    writeConfirmationNotice({ ref: REF, cash: '€120.00' })
    const { container } = await renderPage('en')
    await screen.findByText(/link to manage your booking/)
    expect(container.innerHTML).not.toMatch(/\/manage\//)
    expect(container.innerHTML).not.toMatch(/[A-Za-z0-9_-]{43}/)
  })
})

describe('the checkout steps write the notice only for a stored policy', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

  it('Step6Payment writes it after the snapshot, behind the policy flag', () => {
    const src = read('components/booking/steps/Step6Payment.tsx')
    expect(src).toContain("import { writeConfirmationNotice } from '@/lib/confirmation-notice'")
    expect(src).toMatch(/if \(showAcceptance\) writeConfirmationNotice\(\{ ref: bookingRef \}\)/)
    expect(src.indexOf('writePurchaseSnapshot({')).toBeLessThan(src.indexOf('writeConfirmationNotice({'))
  })

  it('Step6CardOnFile writes it before the redirect and names the cash amount with formatMinor', () => {
    const src = read('components/booking/steps/Step6CardOnFile.tsx')
    expect(src).toMatch(/writeConfirmationNotice\(\{ ref: bookingReference, \.\.\.\(cash \? \{ cash: formatMinor\(amountMinor, currency\) \} : \{\}\) \}\)/)
    expect(src.indexOf('writeConfirmationNotice({')).toBeLessThan(src.indexOf('navigateToConfirmation(bookingReference)'))
  })
})

describe('Booking.confirmation catalog parity', () => {
  const params = (value: string): string[] => {
    const names = new Set<string>()
    for (const m of value.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)) names.add(m[1])
    for (const m of value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) names.add(m[1])
    return [...names].filter((n) => !['one', 'two', 'few', 'many', 'other', 'plural'].includes(n)).sort()
  }
  const en = confirmationOf('en')
  const others = locales.filter((l) => l !== 'en')

  it('every locale has exactly the English keys', () => {
    for (const l of others) expect(Object.keys(confirmationOf(l)).sort()).toEqual(Object.keys(en).sort())
  })

  it('every locale uses the English ICU parameters of each key', () => {
    for (const l of others) {
      const c = confirmationOf(l)
      for (const key of Object.keys(en)) expect(params(c[key]), `${l}.${key}`).toEqual(params(en[key]))
    }
  })

  it('no translation equals its English value, except keys made only of ICU parameters', () => {
    for (const l of others) {
      const c = confirmationOf(l)
      for (const key of Object.keys(en)) {
        const onlyParams = en[key].replace(/\{[^}]*\}/g, '').trim() === ''
        if (!onlyParams) expect(c[key], `${l}.${key}`).not.toBe(en[key])
      }
    }
  })

  it('rich tags and plural keywords survive', () => {
    for (const l of others) {
      expect(confirmationOf(l).payCash).toMatch(/<bdi>\{amount\}<\/bdi>/)
      expect(confirmationOf(l).passengers).toMatch(/plural/)
    }
  })

  it('no stub placeholder leaked in', () => {
    for (const l of others) for (const v of Object.values(confirmationOf(l))) expect(v).not.toMatch(/^\[[A-Z]{2}\]/)
  })
})
