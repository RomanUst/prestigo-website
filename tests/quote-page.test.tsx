/**
 * Phase 92 plan 92-09 Task 2 (QUOTE-02, QUOTE-06; D-02, D-05, D-09, D-10; T-92-29, T-92-30, T-92-31): the public quote
 * page, rendered for real.
 *
 * The REAL page (app/[locale]/quote/[token]/page.tsx) is awaited and rendered with Testing Library, and it reads the
 * REAL resolver and view builder against the in-memory payments database. The mount proof: the rendered markup holds
 * data-testid quote-viewed-ping, which only the page's own QuoteViewedPing produces.
 *
 * Server components are awaited as functions; next-intl/server is pointed at its react-server build with the real
 * catalogs (the pattern of tests/manage-page.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { locales, rtlLocales } from '@/i18n/locales'
import enMessages from '../messages/en.json'
import ruMessages from '../messages/ru.json'
import esMessages from '../messages/es.json'
import frMessages from '../messages/fr.json'
import arMessages from '../messages/ar.json'
import hiMessages from '../messages/hi.json'
import zhMessages from '../messages/zh.json'
import zhHantMessages from '../messages/zh-hant.json'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { countingClient, seedPublicQuote, QUOTE_SECRETS, type PublicQuoteSeed } from './helpers/quote-public-fixture'
import { newQuoteToken } from '@/lib/quotes/token'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { formatMinor } from '@/lib/payments/money'
import { formatLocaleDate } from '@/lib/locale-date'
import { WAITING_PRICE } from './helpers/quote-waiting-price'

const ALL_MESSAGES: Record<string, Record<string, unknown>> = {
  en: enMessages,
  ru: ruMessages,
  es: esMessages,
  fr: frMessages,
  ar: arMessages,
  hi: hiMessages,
  zh: zhMessages,
  'zh-hant': zhHantMessages,
}

const { mockLocaleRef, world, rateLimit, redirectSpy, reactServerBuild, stripeDouble } = vi.hoisted(() => ({
  stripeDouble: { submit: vi.fn(), confirmPayment: vi.fn() },
  // The react-server build of next-intl/server (vitest has no react-server export condition).
  reactServerBuild: { path: `${process.cwd()}/node_modules/next-intl/dist/esm/development/server.react-server.js` },
  mockLocaleRef: { value: 'en' },
  world: { client: null as null | { from: (t: string) => unknown }, serviceClients: 0 },
  rateLimit: { allowed: true, calls: [] as Array<[string, string]> },
  redirectSpy: vi.fn(),
}))

vi.mock('next-intl/server', async () => {
  return await vi.importActual(reactServerBuild.path)
})

vi.mock('next-intl/config', async () => {
  const { getRequestConfig } = await vi.importActual<typeof import('next-intl/server')>(reactServerBuild.path)
  return {
    default: getRequestConfig(async () => ({
      locale: mockLocaleRef.value,
      messages: ALL_MESSAGES[mockLocaleRef.value],
    })),
  }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => {
    world.serviceClients += 1
    return { from: (table: string) => world.client!.from(table) }
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (path: string, ip: string) => {
    rateLimit.calls.push([path, ip])
    return { allowed: rateLimit.allowed, remaining: 1, limit: 30 }
  }),
  getClientIp: (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown',
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
}))

// The accept island (plan 92-17) is mounted by the page for real; only Stripe itself and the router are doubles.
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue({}) }))
vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react')
  return {
    Elements: ({ children }: { children: React.ReactNode }) => children,
    PaymentElement: (props: { onReady?: () => void }) => {
      React.useEffect(() => {
        props.onReady?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return React.createElement('div', { 'data-testid': 'payment-element' })
    },
    useStripe: () => ({ confirmPayment: stripeDouble.confirmPayment }),
    useElements: () => ({ submit: stripeDouble.submit }),
  }
})
vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return { ...actual, useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }
})

// next/navigation's redirect throws NEXT_REDIRECT in the app; the spy records the target and throws the same way.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    redirect: (url: string) => {
      redirectSpy(url)
      throw new Error(`NEXT_REDIRECT:${url}`)
    },
  }
})

import QuotePage, { generateMetadata } from '@/app/[locale]/quote/[token]/page'
import QuoteDonePage, { generateMetadata as generateDoneMetadata } from '@/app/[locale]/quote/done/page'
import { isPrivateLinkPath } from '@/lib/private-link-path'

const DAY = 24 * 3_600_000

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)
}

let db: FakePaymentsDb
let counter: ReturnType<typeof countingClient>
let fetchMock: ReturnType<typeof vi.fn>

async function seed(over: PublicQuoteSeed = {}) {
  const fx = await seedPublicQuote(db, { pickupDate: isoDate(60), ...over })
  counter.writes.count = 0
  return fx
}

async function renderPage(locale: string, token: string) {
  mockLocaleRef.value = locale
  const element = await QuotePage({ params: Promise.resolve({ locale, token }) })
  const { render } = await import('@testing-library/react')
  return render(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  db = createFakePaymentsDb()
  counter = countingClient(db)
  world.client = counter
  world.serviceClients = 0
  rateLimit.allowed = true
  rateLimit.calls = []
  mockLocaleRef.value = 'en'
  fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type Catalog = { Quote: Record<string, Record<string, unknown> | string> }
const catalog = (locale: string) => ALL_MESSAGES[locale] as unknown as Catalog
const q = (locale: string, group: string, key: string): string => {
  const g = catalog(locale).Quote[group] as Record<string, string>
  return g[key]
}

// ---------------------------------------------------------------------------------------------------------------------
describe('generateMetadata', () => {
  it('is noindex, nofollow, no-referrer and carries the Quote.meta.title of the locale', async () => {
    for (const locale of ['en', 'ru', 'zh-hant']) {
      mockLocaleRef.value = locale
      const meta = await generateMetadata({ params: Promise.resolve({ locale, token: newQuoteToken() }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.referrer).toBe('no-referrer')
      expect(meta.title).toBe(q(locale, 'meta', 'title'))
    }
  })
})

describe('the page source', () => {
  const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/page.tsx'), 'utf8')

  it('is force-dynamic, uses params.locale + setRequestLocale and never a bare getLocale()', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic'")
    expect(source).toContain('setRequestLocale(locale)')
    expect(source).not.toMatch(/getLocale\(/)
  })

  it('creates no database client of its own (only the resolver does, inside the request)', () => {
    expect(source).not.toMatch(/createSupabase|createClient/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('quote page, live offer', () => {
  it('tracer: renders the itemised quote, one price per trip, the summary, the remainder sentence and the terms; mounts the viewed ping', async () => {
    const fx = await seed({ cancelFreeHours: 72, cancelFeePercent: 40 })
    const { getByTestId, getAllByTestId } = await renderPage('en', fx.token)

    expect(getByTestId('quote-page')).toBeTruthy()
    expect(getByTestId('quote-page').textContent).toContain('Q-20261114-ABC123')

    const lines = getByTestId('quote-lines')
    const rows = getAllByTestId('quote-line')
    expect(rows).toHaveLength(2)
    const [row1, row2] = rows
    expect(row1.textContent).toContain(formatLocaleDate(isoDate(60), 'en'))
    expect(row1.textContent).toContain('10:30')
    expect(row1.textContent).toContain('10:05')
    expect(row1.textContent).toContain('Vaclav Havel Airport Prague')
    expect(row1.textContent).toContain('Hotel Aria, Prague')
    expect(row1.textContent).toContain('Business')
    expect(row2.textContent).toContain('Business Van')
    // Stops in order, each with its waiting minutes.
    const stopsText = row2.textContent ?? ''
    expect(stopsText.indexOf('Cesky Sternberk Castle')).toBeGreaterThan(-1)
    expect(stopsText.indexOf('Cesky Sternberk Castle')).toBeLessThan(stopsText.indexOf('Kutna Hora, Czechia'))
    expect(stopsText).toContain('waiting 30 min')
    expect(stopsText).toContain('waiting 45 min')

    // Exactly one price per row, and no other money in the row.
    expect(rows.map((r) => r.querySelectorAll('[data-testid="quote-line-price"]').length)).toEqual([1, 1])
    expect(row1.querySelector('[data-testid="quote-line-price"]')?.textContent).toBe(formatMinor(12000, 'eur'))
    expect(row2.querySelector('[data-testid="quote-line-price"]')?.textContent).toBe(formatMinor(18000, 'eur'))
    expect((row1.textContent ?? '').match(/€/g)).toHaveLength(1)
    expect((row2.textContent ?? '').match(/€/g)).toHaveLength(1)
    expect(lines.textContent).not.toMatch(/€\s?(14|7)(?!\d)/)

    const summary = getByTestId('quote-summary')
    expect(getByTestId('quote-total').textContent).toBe(formatMinor(30000, 'eur'))
    expect(getByTestId('quote-deposit').textContent).toBe(formatMinor(9000, 'eur'))
    // The summary row (renamed from quote-remainder in plan 92-27: that test id is the remainder payment area now).
    expect(getByTestId('quote-remainder-amount').textContent).toBe(formatMinor(21000, 'eur'))
    expect(summary.textContent).toContain(q('en', 'remainder', 'saved_card'))

    const terms = getByTestId('quote-terms').textContent ?? ''
    expect(terms).toContain(q('en', 'terms', 'heading'))
    expect(terms).toContain('Free cancellation until')
    expect(terms).toContain('Prague time')
    expect(terms).toContain('40% of the deposit is kept')
    expect(terms).toContain(q('en', 'terms', 'cap'))
    expect(terms).toContain(q('en', 'terms', 'howToCancel'))

    // The mount: the page itself renders QuoteViewedPing.
    expect(getByTestId('quote-viewed-ping')).toBeTruthy()
  })

  it('the mounted ping posts the token once to /api/quote/view and nothing else is fetched', async () => {
    const fx = await seed()
    await renderPage('en', fx.token)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/quote/view')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: fx.token })
  })

  it('names no waiting amount anywhere on the page', async () => {
    const fx = await seed()
    const { getByTestId } = await renderPage('en', fx.token)
    const text = getByTestId('quote-page').textContent ?? ''
    // The rows carry stop fees of 14 and 7 euro; they must not surface, and no waiting-fee wording exists.
    expect(text).not.toMatch(/€\s?(14|7)(?!\d)/)
    expect(text).not.toMatch(/waiting (fee|charge|cost|amount)/i)
    // The only euro amounts are the ones the quote states: two trips, total, deposit, remainder, plus the deposit
    // named once in the consent text and once on the pay button (plan 92-17).
    expect((text.match(/€/g) ?? []).length).toBe(7)
  })

  it('shows the all-of-the-deposit sentence for a default fee, and the operator expiry when one is set', async () => {
    const fx = await seed({ expiresAt: new Date(Date.now() + 10 * DAY).toISOString() })
    const { getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-terms').textContent).toContain(q('en', 'terms', 'lateAll'))
    expect(getByTestId('quote-page').textContent).toContain('Valid until')
  })

  it('says free cancellation is gone once the free window has passed', async () => {
    const fx = await seed({ pickupDate: isoDate(1), cancelFreeHours: 720 })
    const { getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-terms').textContent).toContain(q('en', 'terms', 'noFree'))
  })

  it('a paid quote shows its booking references', async () => {
    const fx = await seed({ status: 'paid', withBooking: true })
    const { getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-paid').textContent).toContain('PR-9001')
  })

  it('never exposes the last name, email, phone, billing or special requests', async () => {
    const fx = await seed({ status: 'paid', withBooking: true })
    const { container } = await renderPage('en', fx.token)
    for (const secret of [QUOTE_SECRETS.lastName, QUOTE_SECRETS.email, QUOTE_SECRETS.phone, QUOTE_SECRETS.billingName, QUOTE_SECRETS.note, QUOTE_SECRETS.special]) {
      expect(container.innerHTML).not.toContain(secret)
    }
    expect(container.innerHTML).not.toContain(fx.token)
    expect(container.innerHTML).not.toContain(fx.versionId)
    expect(container.innerHTML).not.toContain(fx.quoteId)
  })

  it('rendering performs zero database writes: no insert, update or delete, the status stays sent, no event', async () => {
    const fx = await seed({ status: 'sent' })
    await renderPage('en', fx.token)
    expect(counter.writes.count).toBe(0)
    expect(db.state.quotes[0].status).toBe('sent')
    expect(db.state.quote_events).toHaveLength(0)
    expect(db.state.quote_links).toHaveLength(1)
  })

  it('checks the /quote rate limit with the client IP before reading', async () => {
    const fx = await seed()
    await renderPage('en', fx.token)
    expect(rateLimit.calls).toEqual([['/quote', '203.0.113.9']])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('quote page, accept and pay (plan 92-17; QUOTE-03, QUOTE-05; D-08)', () => {
  const ltrIsolate = (value: string) => `⁦${value}⁩`

  async function expectedConsent(token: string): Promise<string> {
    const resolved = await resolveQuoteToken(token)
    expect(resolved).not.toBeNull()
    return (await renderQuoteTerms({ resolved: resolved!, nowMs: Date.now() })).text
  }

  it('tracer: a live offer renders the accept area with the stored consent text and a deposit button', async () => {
    const fx = await seed({ cancelFreeHours: 72, cancelFeePercent: 40 })
    const { getByTestId, queryByTestId } = await renderPage('en', fx.token)

    // The mount: the real page renders the real island.
    const accept = getByTestId('quote-accept')
    expect(queryByTestId('quote-paid')).toBeNull()
    expect(accept.textContent).toContain(q('en', 'accept', 'heading'))
    expect(getByTestId('quote-accept-consent').textContent).toBe(await expectedConsent(fx.token))
    const button = accept.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(button.textContent).toBe(`Pay deposit ${ltrIsolate(formatMinor(9000, 'eur'))}`)
    expect(button.disabled).toBe(true)
    expect(getByTestId('payment-element')).toBeTruthy()
  })

  it('the cancellation terms are on the page before the accept area, and the consent text carries them too', async () => {
    const fx = await seed({ cancelFreeHours: 72, cancelFeePercent: 40 })
    const { getByTestId } = await renderPage('en', fx.token)
    const page = getByTestId('quote-page')
    const terms = getByTestId('quote-terms')
    const accept = getByTestId('quote-accept')
    expect(terms.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const consent = getByTestId('quote-accept-consent').textContent ?? ''
    expect(consent).toContain('Free cancellation until')
    expect(consent).toContain('40% of the deposit is kept')
    expect(consent).toContain(q('en', 'terms', 'cap'))
    // One total per line and per quote; the accept area adds only the deposit.
    expect(page.textContent).toContain(formatMinor(30000, 'eur'))
  })

  it('the consent text names the remainder method of the quote (D-21, D-22)', async () => {
    for (const method of ['saved_card', 'payment_link', 'cash', 'invoice'] as const) {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      const fx = await seed({ remainderMethod: method })
      const { getByTestId, unmount } = await renderPage('en', fx.token)
      expect(getByTestId('quote-accept-consent').textContent).toContain(q('en', 'remainder', method))
      unmount()
    }
  })

  it('an accepted quote that is not paid yet can still pay (the accept route lets the same version continue)', async () => {
    const fx = await seed({ status: 'accepted' })
    const { getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-accept')).toBeTruthy()
  })

  it('a paid quote shows the booked trips with each booking reference and no accept area', async () => {
    const fx = await seed({ status: 'paid', withBooking: true })
    const { getByTestId, queryByTestId } = await renderPage('en', fx.token)
    expect(queryByTestId('quote-accept')).toBeNull()
    expect(queryByTestId('payment-element')).toBeNull()
    const paid = getByTestId('quote-paid')
    expect(paid.textContent).toContain(q('en', 'paid', 'heading'))
    expect(paid.textContent).toContain('PR-9001')
  })

  it('the token is never written into the markup (it only travels as a prop of the island)', async () => {
    const fx = await seed()
    const { container } = await renderPage('en', fx.token)
    expect(container.innerHTML).not.toContain(fx.token)
  })

  it('the page props reach the island: the press posts the token, the displayed version and the displayed deposit', async () => {
    const fx = await seed()
    stripeDouble.submit.mockResolvedValue({})
    stripeDouble.confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/quote/accept'
        ? new Response(JSON.stringify({ clientSecret: 'pi_1_secret_x', amountMinor: 9000, currency: 'eur' }), { status: 200 })
        : new Response('{}'),
    )
    const { getByTestId } = await renderPage('en', fx.token)
    const { fireEvent, act } = await import('@testing-library/react')

    const accept = getByTestId('quote-accept')
    const button = accept.querySelector('button[type="submit"]') as HTMLButtonElement
    fireEvent.click(accept.querySelector('input[type="checkbox"]') as HTMLInputElement)
    expect(button.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(button)
    })

    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/quote/accept') as [string, RequestInit]
    expect(JSON.parse(call[1].body as string)).toEqual({
      token: fx.token,
      displayedVersionNo: 1,
      displayedDepositMinor: 9000,
      consent: true,
    })
    const confirm = stripeDouble.confirmPayment.mock.calls[0][0] as { confirmParams: { return_url: string } }
    expect(confirm.confirmParams.return_url).toMatch(/\/quote\/done$/)
    expect(confirm.confirmParams.return_url).not.toContain(fx.token)
  })

  it.each([...locales])('%s: the accept area speaks the quote language, with its own stored consent text', async (locale) => {
    const fx = await seed({ locale })
    const { getByTestId } = await renderPage(locale, fx.token)
    const accept = getByTestId('quote-accept')
    expect(accept.textContent).toContain(q(locale, 'accept', 'heading'))
    const button = accept.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(button.textContent).toBe(
      (catalog(locale).Quote.accept as Record<string, string>).button.replace('{amount}', ltrIsolate(formatMinor(9000, 'eur'))),
    )
    expect(getByTestId('quote-accept-consent').textContent).toBe(await expectedConsent(fx.token))
    expect(accept.textContent).not.toMatch(/Quote\.[a-z]|\{[a-zA-Z]+\}/)
  })

  it('the page source mounts QuoteAcceptPay and builds no amount of its own for it', () => {
    const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/page.tsx'), 'utf8')
    expect((source.match(/QuoteAcceptPay/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('renderQuoteTerms')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('quote page, Download PDF (plan 92-27; QUOTE-07; D-14; T-92-83, T-92-84)', () => {
  const FILE = 'Prestigo-quote-Q-20261114-ABC123-v1.pdf'

  function stubDownload() {
    const createObjectURL = vi.fn(() => 'blob:quote-pdf')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const clicked: Array<{ href: string; download: string }> = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })
    return { createObjectURL, revokeObjectURL, clicked }
  }

  it('tracer: a live offer renders the Download PDF button; the press posts the token and saves the returned bytes', async () => {
    const fx = await seed()
    const { createObjectURL, clicked } = stubDownload()
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/quote/pdf'
        ? new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'Content-Type': 'application/pdf' } })
        : new Response('{}'),
    )
    const { getByTestId } = await renderPage('en', fx.token)
    const { fireEvent, act } = await import('@testing-library/react')

    const area = getByTestId('quote-pdf')
    const button = area.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toBe(q('en', 'pdf', 'download'))
    await act(async () => {
      fireEvent.click(button)
    })

    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/quote/pdf') as [string, RequestInit]
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body as string)).toEqual({ token: fx.token })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked).toEqual([{ href: 'blob:quote-pdf', download: FILE }])
    expect(area.textContent).not.toContain(q('en', 'pdf', 'unavailable'))
  })

  it('a paid quote has the button too', async () => {
    const fx = await seed({ status: 'paid', withBooking: true })
    const { getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-pdf').querySelector('button')?.textContent).toBe(q('en', 'pdf', 'download'))
  })

  it('D-14: on 503 the button area says the PDF is unavailable and offers Print, which opens the print dialog', async () => {
    const fx = await seed()
    const { createObjectURL } = stubDownload()
    const print = vi.fn()
    vi.stubGlobal('print', print)
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/quote/pdf' ? new Response(JSON.stringify({ error: 'pdf_unavailable' }), { status: 503 }) : new Response('{}'),
    )
    const { getByTestId } = await renderPage('en', fx.token)
    const { fireEvent, act } = await import('@testing-library/react')
    const area = getByTestId('quote-pdf')
    await act(async () => {
      fireEvent.click(area.querySelector('button') as HTMLButtonElement)
    })

    expect(area.textContent).toContain(q('en', 'pdf', 'unavailable'))
    expect(createObjectURL).not.toHaveBeenCalled()
    const printButton = [...area.querySelectorAll('button')].find((b) => b.textContent === q('en', 'pdf', 'print'))
    expect(printButton).toBeTruthy()
    fireEvent.click(printButton!)
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('the page carries a print stylesheet that hides the accept, remainder and PDF controls', async () => {
    const fx = await seed()
    const { container } = await renderPage('en', fx.token)
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
    expect(css).toContain('@media print')
    for (const id of ['quote-accept', 'quote-remainder', 'quote-pdf']) expect(css).toContain(`[data-testid="${id}"]`)
    expect(css).toMatch(/display:\s*none/)
  })

  it('the page source mounts QuotePdfButton', () => {
    const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/page.tsx'), 'utf8')
    expect((source.match(/QuotePdfButton/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
type Method = 'saved_card' | 'payment_link' | 'cash' | 'invoice'

/**
 * A paid quote whose line 1 became a quote-mode trip with 12000 left to pay. `remainderPaid` marks that trip paid
 * and stamps the quote's remainder_paid_at, as applyQuoteRemainderPaid does.
 */
async function seedPaid(method: Method, opts: { remainderPaid?: boolean; locale?: string } = {}) {
  const fx = await seed({ status: 'paid', remainderMethod: method, locale: opts.locale })
  const line1 = db.state.quote_version_lines.find((l) => l.id === fx.lineIds[0])!
  line1.remainder_minor = 12000
  const paidAt = opts.remainderPaid ? '2026-11-15T10:00:00.000Z' : null
  const { error } = await db.client.from('bookings').insert({
    booking_reference: 'PR-9101',
    quote_id: fx.quoteId,
    quote_line_id: fx.lineIds[0],
    status: 'confirmed',
    payment_mode: 'quote',
    paid_at: paidAt,
  })
  if (error) throw new Error(error.message)
  if (paidAt) db.state.quotes[0].remainder_paid_at = paidAt
  counter.writes.count = 0
  return fx
}

describe('quote page, pay the remainder (plan 92-27; QUOTE-04; D-16; T-92-85)', () => {
  const ltrIsolate = (value: string) => `⁦${value}⁩`

  it('tracer: a paid payment-link quote with 12000 due renders the remainder area with the due and the pay button', async () => {
    const fx = await seedPaid('payment_link')
    const { getByTestId, queryByTestId } = await renderPage('en', fx.token)
    const area = getByTestId('quote-remainder')
    const amount = ltrIsolate(formatMinor(12000, 'eur'))
    expect(area.textContent).toContain(q('en', 'remainderPay', 'heading'))
    expect(area.textContent).toContain(`Remainder to pay: ${amount}`)
    expect((area.querySelector('button[type="submit"]') as HTMLButtonElement).textContent).toBe(`Pay ${amount}`)
    expect(area.querySelector('input[type="checkbox"]')).toBeNull()
    expect(queryByTestId('quote-remainder-paid')).toBeNull()
    expect(queryByTestId('quote-accept')).toBeNull()
  })

  it('the press posts the token and the server-computed due as the displayed amount', async () => {
    const fx = await seedPaid('payment_link')
    stripeDouble.submit.mockResolvedValue({})
    stripeDouble.confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/quote/remainder'
        ? new Response(JSON.stringify({ clientSecret: 'pi_r_secret_x', amountMinor: 12000, currency: 'eur' }), { status: 200 })
        : new Response('{}'),
    )
    const { getByTestId } = await renderPage('en', fx.token)
    const { fireEvent, act } = await import('@testing-library/react')
    await act(async () => {
      fireEvent.click(getByTestId('quote-remainder').querySelector('button[type="submit"]') as HTMLButtonElement)
    })
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/quote/remainder') as [string, RequestInit]
    expect(JSON.parse(call[1].body as string)).toEqual({ token: fx.token, displayedAmountMinor: 12000 })
    const confirm = stripeDouble.confirmPayment.mock.calls[0][0] as { confirmParams: { return_url: string } }
    expect(confirm.confirmParams.return_url).toMatch(/\/quote\/done$/)
    expect(confirm.confirmParams.return_url).not.toContain(fx.token)
  })

  it('a paid remainder (due 0) shows the paid sentence and no pay button', async () => {
    const fx = await seedPaid('payment_link', { remainderPaid: true })
    const { getByTestId, queryByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-remainder-paid').textContent).toBe(q('en', 'remainderPay', 'paid'))
    expect(queryByTestId('quote-remainder')).toBeNull()
  })

  it('a paid quote whose trips are not created yet shows neither the pay area nor the paid sentence', async () => {
    const fx = await seed({ status: 'paid', remainderMethod: 'payment_link' })
    const { queryByTestId } = await renderPage('en', fx.token)
    expect(queryByTestId('quote-remainder')).toBeNull()
    expect(queryByTestId('quote-remainder-paid')).toBeNull()
  })

  it('an invoice quote shows the invoice note with the amount, and no pay button', async () => {
    const fx = await seedPaid('invoice')
    const { getByTestId, queryByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-invoice-note').textContent).toBe(
      `We will send you an invoice for the remainder of ${ltrIsolate(formatMinor(12000, 'eur'))}.`,
    )
    expect(queryByTestId('quote-remainder')).toBeNull()
    expect(queryByTestId('quote-remainder-paid')).toBeNull()
  })

  it.each(['saved_card', 'cash'] as const)('a paid %s quote renders neither the remainder area nor the invoice note', async (method) => {
    const fx = await seedPaid(method)
    const { queryByTestId } = await renderPage('en', fx.token)
    expect(queryByTestId('quote-remainder')).toBeNull()
    expect(queryByTestId('quote-remainder-paid')).toBeNull()
    expect(queryByTestId('quote-invoice-note')).toBeNull()
  })

  it('an offer on a payment-link quote has no remainder area yet (the deposit comes first)', async () => {
    const fx = await seed({ remainderMethod: 'payment_link' })
    const { queryByTestId, getByTestId } = await renderPage('en', fx.token)
    expect(getByTestId('quote-accept')).toBeTruthy()
    expect(queryByTestId('quote-remainder')).toBeNull()
  })

  it('rendering the remainder area writes nothing', async () => {
    const fx = await seedPaid('payment_link')
    await renderPage('en', fx.token)
    expect(counter.writes.count).toBe(0)
  })

  it('the page source mounts QuoteRemainderPay', () => {
    const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/page.tsx'), 'utf8')
    expect((source.match(/QuoteRemainderPay/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the finished page: every locale, no token or waiting price leaks (plan 92-27 Task 3; QUOTE-02; T-92-84)', () => {
  const ltrIsolate = (value: string) => `⁦${value}⁩`

  /** Every attribute value that can navigate or load: none may carry the token. */
  function urlAttributes(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[href], [src], [action], [formaction]')].flatMap((el) =>
      ['href', 'src', 'action', 'formaction'].map((a) => el.getAttribute(a)).filter((v): v is string => v !== null),
    )
  }

  it.each([...locales])(
    '%s: a live paid quote with a remainder due renders its own Quote.title, the PDF button and the remainder area, with no missing message',
    async (locale) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fx = await seedPaid('payment_link', { locale })
      const { getByTestId, container } = await renderPage(locale, fx.token)
      expect(redirectSpy).not.toHaveBeenCalled()

      const page = getByTestId('quote-page')
      const title = (catalog(locale).Quote.title as string).replace('{reference}', ltrIsolate('Q-20261114-ABC123'))
      expect(page.querySelector('h1')?.textContent).toBe(title)
      expect(getByTestId('quote-pdf').querySelector('button')?.textContent).toBe(q(locale, 'pdf', 'download'))
      const remainder = getByTestId('quote-remainder')
      expect(remainder.textContent).toContain(q(locale, 'remainderPay', 'heading'))
      expect(remainder.querySelector('button[type="submit"]')?.textContent).toBe(
        q(locale, 'remainderPay', 'button').replace('{amount}', ltrIsolate(formatMinor(12000, 'eur'))),
      )

      // No untranslated key, unfilled ICU placeholder or next-intl missing-message report.
      expect(page.textContent).not.toMatch(/Quote\.[a-z]|\{[a-zA-Z]+\}/)
      expect(errors.mock.calls.map((c) => String(c[0])).filter((m) => /MISSING_MESSAGE|IntlError/i.test(m))).toEqual([])

      // The token lives only in the islands' props: never in the markup, a link or any URL attribute.
      expect(container.innerHTML).not.toContain(fx.token)
      for (const value of urlAttributes(container)) expect(value).not.toContain(fx.token)

      // One price per line: no separate waiting price in the locale's words, and the stop fees never surface.
      expect(WAITING_PRICE[locale].test(page.textContent ?? '')).toBe(false)
      expect(page.textContent).not.toMatch(/€\s?(14|7)(?!\d)/)
    },
  )

  it('an offer, a paid remainder and an invoice quote leak neither the token nor a waiting price either', async () => {
    const setups: Array<() => Promise<{ token: string }>> = [
      () => seed({ remainderMethod: 'payment_link' }),
      () => seedPaid('payment_link', { remainderPaid: true }),
      () => seedPaid('invoice'),
    ]
    for (const setup of setups) {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      const fx = await setup()
      const { container, getByTestId, unmount } = await renderPage('en', fx.token)
      expect(container.innerHTML).not.toContain(fx.token)
      for (const value of urlAttributes(container)) expect(value).not.toContain(fx.token)
      expect(WAITING_PRICE.en.test(getByTestId('quote-page').textContent ?? '')).toBe(false)
      unmount()
    }
  })

  it('the Stripe return URL of the remainder carries no token', async () => {
    const fx = await seedPaid('payment_link')
    stripeDouble.submit.mockResolvedValue({})
    stripeDouble.confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/quote/remainder'
        ? new Response(JSON.stringify({ clientSecret: 'pi_r_secret_x', amountMinor: 12000, currency: 'eur' }), { status: 200 })
        : new Response('{}'),
    )
    const { getByTestId } = await renderPage('en', fx.token)
    const { fireEvent, act } = await import('@testing-library/react')
    await act(async () => {
      fireEvent.click(getByTestId('quote-remainder').querySelector('button[type="submit"]') as HTMLButtonElement)
    })
    const confirm = stripeDouble.confirmPayment.mock.calls[0][0] as { confirmParams: { return_url: string } }
    expect(confirm.confirmParams.return_url).not.toContain(fx.token)
    // Every request the page made carried the token in a POST body only, never in its URL.
    for (const [url] of fetchMock.mock.calls as Array<[string]>) expect(url).not.toContain(fx.token)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('quote page in every locale (D-09)', () => {
  it.each([...locales])('%s: renders the offer in its own language', async (locale) => {
    const fx = await seed({ locale })
    const { getByTestId, getAllByTestId } = await renderPage(locale, fx.token)
    expect(redirectSpy).not.toHaveBeenCalled()
    const text = getByTestId('quote-page').textContent ?? ''
    expect(getAllByTestId('quote-line')).toHaveLength(2)
    expect(text).toContain(q(locale, 'summary', 'heading'))
    expect(text).toContain(q(locale, 'terms', 'heading'))
    expect(text).toContain(q(locale, 'remainder', 'saved_card'))
    expect(text).toContain(formatMinor(30000, 'eur'))
    expect(text).toContain(formatLocaleDate(isoDate(60), locale))
    // No untranslated key or unfilled ICU placeholder leaks into the markup.
    expect(text).not.toMatch(/Quote\.[a-z]|\{[a-zA-Z]+\}/)
  })

  it('ar: Arabic strings, with amounts, times and references isolated left-to-right; the locale layout supplies dir rtl', async () => {
    expect(rtlLocales).toContain('ar')
    const layout = readFileSync(join(process.cwd(), 'app/[locale]/layout.tsx'), 'utf8')
    expect(layout).toMatch(/dir=\{rtlLocales\.includes\(locale as AppLocale\) \? 'rtl' : 'ltr'\}/)

    const fx = await seed({ locale: 'ar' })
    const { getByTestId, container } = await renderPage('ar', fx.token)
    expect(getByTestId('quote-terms').textContent).toContain(q('ar', 'terms', 'heading'))
    expect(/[؀-ۿ]/.test(getByTestId('quote-page').textContent ?? '')).toBe(true)
    const total = getByTestId('quote-total')
    expect(total.getAttribute('dir')).toBe('ltr')
    expect(container.querySelectorAll('bdi[dir="ltr"]').length).toBeGreaterThan(8)
  })

  it('a request on another locale prefix redirects to the quote language prefix', async () => {
    const fx = await seed({ locale: 'ru' })
    await expect(renderPage('en', fx.token)).rejects.toThrow(`NEXT_REDIRECT:/ru/quote/${fx.token}`)
    expect(redirectSpy).toHaveBeenCalledWith(`/ru/quote/${fx.token}`)
  })

  it('an English quote opened under /ru redirects to the unprefixed English path', async () => {
    const fx = await seed({ locale: 'en' })
    await expect(renderPage('ru', fx.token)).rejects.toThrow(`NEXT_REDIRECT:/quote/${fx.token}`)
  })

  it('a zh-hant quote opened under /zh redirects to /zh-hant', async () => {
    const fx = await seed({ locale: 'zh-hant' })
    await expect(renderPage('zh', fx.token)).rejects.toThrow(`NEXT_REDIRECT:/zh-hant/quote/${fx.token}`)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the one invalid view (T-92-30)', () => {
  async function invalidMarkup(locale: string, token: string): Promise<string> {
    const { container, getByTestId, queryByTestId, unmount } = await renderPage(locale, token)
    expect(getByTestId('quote-invalid')).toBeTruthy()
    expect(queryByTestId('quote-page')).toBeNull()
    expect(queryByTestId('quote-viewed-ping')).toBeNull()
    // Plan 92-27: the new islands never appear on the invalid view.
    for (const id of ['quote-pdf', 'quote-remainder', 'quote-remainder-paid', 'quote-invoice-note']) {
      expect(queryByTestId(id)).toBeNull()
    }
    const html = container.innerHTML
    unmount()
    return html
  }

  const reasons: Array<[string, PublicQuoteSeed, 'seeded' | 'malformed' | 'unknown' | 'rate-limited']> = [
    ['malformed token', {}, 'malformed'],
    ['unknown token', {}, 'unknown'],
    ['revoked link', { revokeLink: true }, 'seeded'],
    ['superseded (version 2 is current)', { supersede: true }, 'seeded'],
    ['draft', { status: 'draft' }, 'seeded'],
    ['voided', { status: 'voided' }, 'seeded'],
    ['cancelled', { cancelledAt: '2026-11-01T00:00:00.000Z' }, 'seeded'],
    ['past the operator expiry (D-02)', { expiresAt: '2026-01-01T00:00:00.000Z' }, 'seeded'],
    ['past the first pickup (D-05)', { pickupDate: '2026-01-01' }, 'seeded'],
    ['rate limited', {}, 'rate-limited'],
  ]

  it.each([...locales])('%s: every reason renders byte-identical markup with no price, name or trip data', async (locale) => {
    const baseline = await (async () => {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      return invalidMarkup(locale, 'not-a-token')
    })()
    expect(baseline).toContain(q(locale, 'invalid', 'title'))

    for (const [name, over, kind] of reasons) {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      rateLimit.allowed = kind !== 'rate-limited'
      let token: string
      if (kind === 'malformed') token = 'x'.repeat(10)
      else if (kind === 'unknown') {
        await seed({ locale })
        token = newQuoteToken()
      } else {
        const fx = await seed({ locale, ...over })
        token = fx.token
      }
      const html = await invalidMarkup(locale, token)
      expect(html, name).toBe(baseline)
    }

    for (const leak of ['€', 'Kč', 'Q-2026', QUOTE_SECRETS.firstName, QUOTE_SECRETS.lastName, 'Hotel Aria', 'Vaclav Havel', 'PR-9001']) {
      expect(baseline).not.toContain(leak)
    }
  })

  it('a rate-limited request reads nothing from the database', async () => {
    const fx = await seed()
    world.serviceClients = 0
    rateLimit.allowed = false
    await invalidMarkup('en', fx.token)
    expect(world.serviceClients).toBe(0)
  })

  it('a malformed token never reaches the database', async () => {
    world.serviceClients = 0
    await invalidMarkup('en', 'short')
    expect(world.serviceClients).toBe(0)
  })

  it('the invalid view renders in the URL locale', async () => {
    const html = await invalidMarkup('fr', newQuoteToken())
    expect(html).toContain(q('fr', 'invalid', 'title'))
  })

  it('a database failure is the same invalid view, not an error page', async () => {
    const fx = await seed()
    world.client = {
      from: () => {
        throw new Error('database down')
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const html = await invalidMarkup('en', fx.token)
    expect(html).toContain(q('en', 'invalid', 'title'))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the tokenless Stripe return page (plan 92-17 Task 2; T-92-54)', () => {
  async function renderDone(locale: string) {
    mockLocaleRef.value = locale
    const element = await QuoteDonePage({ params: Promise.resolve({ locale }) })
    const { render } = await import('@testing-library/react')
    return render(element)
  }

  it.each([...locales])('%s: renders the thank-you title and body in the URL locale', async (locale) => {
    const { getByTestId } = await renderDone(locale)
    const main = getByTestId('quote-done')
    expect(main.querySelector('h1')?.textContent).toBe(q(locale, 'done', 'title'))
    expect(main.textContent).toContain(q(locale, 'done', 'body'))
    expect(main.textContent).not.toMatch(/Quote\.[a-z]|\{[a-zA-Z]+\}/)
  })

  it('reads nothing: no database client, no rate-limit lookup, no request, no price or reference', async () => {
    world.serviceClients = 0
    const { container } = await renderDone('en')
    expect(world.serviceClients).toBe(0)
    expect(rateLimit.calls).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toMatch(/€|Q-2026|PR-9/)
  })

  it('is noindex, nofollow and no-referrer in every locale', async () => {
    for (const locale of locales) {
      mockLocaleRef.value = locale
      const meta = await generateDoneMetadata({ params: Promise.resolve({ locale }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.referrer).toBe('no-referrer')
      expect(meta.title).toBe(q(locale, 'meta', 'title'))
    }
  })

  it('the source uses params.locale + setRequestLocale, no bare getLocale(), no database and no search params', () => {
    const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/done/page.tsx'), 'utf8')
    expect(source).toContain('setRequestLocale(locale)')
    expect(source).not.toMatch(/getLocale\(/)
    expect(source).not.toMatch(/createSupabase|createClient|resolveQuoteToken/)
    // Stripe appends payment_intent_client_secret to the return URL: the page must never read or echo it.
    expect(source).not.toMatch(/searchParams/)
  })

  it('the path is private, so no analytics, chat or banner run there', () => {
    for (const path of ['/quote/done', '/ru/quote/done', '/zh-hant/quote/done']) {
      expect(isPrivateLinkPath(path)).toBe(true)
    }
  })
})
