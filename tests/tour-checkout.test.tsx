// @vitest-environment jsdom
/**
 * Phase 93, plan 93-18 (TRIP-04; D-09, D-10, D-11; T-93-49..52) - the tour checkout.
 * The address input, the payment stage and fetch are mocked: this suite proves the page wiring, the init request
 * (no amount), the two stages and the states. The payment stage itself is covered by card-payment-stage.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import enMessages from '@/messages/en.json'
import { formatMinor } from '@/lib/payments/money'
import type { PlaceResult } from '@/types/booking'

const h = vi.hoisted(() => ({
  place: null as null | { address: string; placeId: string; lat: number; lng: number },
  stageProps: null as null | Record<string, unknown>,
  setRequestLocale: vi.fn(),
  tourResult: null as unknown,
}))

vi.mock('@/i18n/routing', () => ({
  getPathname: ({ href }: { locale: string; href: string }) => href,
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

vi.mock('@/components/booking/AddressInputNew', () => ({
  default: (props: {
    label: string
    onSelect: (p: PlaceResult) => void
    onClear: () => void
    value: PlaceResult | null
  }) => (
    <div>
      <span>{props.label}</span>
      <span data-testid="address-value">{props.value?.address ?? ''}</span>
      <button type="button" onClick={() => h.place && props.onSelect(h.place)}>
        choose-address
      </button>
      <button type="button" onClick={() => props.onClear()}>
        clear-address
      </button>
    </div>
  ),
}))

vi.mock('@/components/booking/CardPaymentStage', () => ({
  CardPaymentStage: (props: Record<string, unknown>) => {
    h.stageProps = props
    const init = props.init as { amountMinor: number; currency: 'eur' | 'czk' }
    return (
      <div data-testid="stage">
        <span data-testid="stage-amount">{init.amountMinor}</span>
        <button type="button" onClick={() => (props.onInvalidPhone as () => void)()}>
          stage-invalid-phone
        </button>
        <button type="button" onClick={() => (props.onFallback as () => void)()}>
          stage-fallback
        </button>
        <button
          type="button"
          onClick={() => (props.onConfirmed as (r: { ref: string; cashLabel: string | null }) => void)({ ref: 'PR-100', cashLabel: null })}
        >
          stage-confirmed-card
        </button>
        <button
          type="button"
          onClick={() => (props.onConfirmed as (r: { ref: string; cashLabel: string | null }) => void)({ ref: 'PR-101', cashLabel: '€420' })}
        >
          stage-confirmed-cash
        </button>
        <button type="button" onClick={() => (props.onAmountChange as (n: number) => void)(43000)}>
          stage-price-changed
        </button>
      </div>
    )
  },
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { locale: string; namespace: string }) => {
    const parts = namespace.split('.')
    let node: unknown = enMessages
    for (const p of parts) node = (node as Record<string, unknown>)[p]
    return (key: string) => String((node as Record<string, unknown>)[key] ?? key)
  },
  setRequestLocale: h.setRequestLocale,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('@/lib/tours/store', () => ({
  getPublishedTourForLocale: async () => h.tourResult,
}))

vi.mock('@/components/Nav', () => ({ default: () => <nav data-testid="nav" /> }))
vi.mock('@/components/Footer', () => ({ default: () => <footer data-testid="footer" /> }))

import TourCheckout from '@/components/tours/TourCheckout'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import {
  readTourConfirmation,
  writeTourConfirmation,
  type TourConfirmationSnapshot,
} from '@/lib/tours/confirmation-snapshot'
import TourCheckoutPage, { generateMetadata } from '@/app/[locale]/book/tour/page'

const en = enMessages as unknown as { Tours: { checkout: Record<string, string> }; Booking: { validation: Record<string, string> } }
const co = en.Tours.checkout

const QUERY = { tour: 'karlovy-vary-day-trip', date: '2027-06-15', time: '09:00', pax: 2, car: 'business' as const, xh: 1 }
const PRAGUE = { address: 'Hotel Mosaic, Prague', placeId: 'p1', lat: 50.09, lng: 14.42 }

const INIT_OK = {
  eligible: true,
  mode: 'setup',
  holdAtIso: '2027-06-14T08:00:00.000Z',
  holdDateIso: '2027-06-14',
  amountMinor: 42000,
  currency: 'eur',
  cashAvailable: true,
  policy: {
    version: 'tour-1',
    freeUntilIso: '2027-06-13T07:00:00.000Z',
    freeUntilPassed: false,
    hours: 36,
    percent: 100,
    feeMinor: 42000,
    waitMin: 30,
  },
}

type FetchReply = { status?: number; body?: unknown } | Error
let fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []
let fetchReply: FetchReply = { body: INIT_OK }
let fetchGate: Promise<void> | null = null

function setup(over: Partial<React.ComponentProps<typeof TourCheckout>> = {}) {
  return render(
    <TourCheckout
      tour={{ slug: QUERY.tour, title: 'Karlovy Vary day trip', hoursIncluded: 8, coverUrl: null }}
      query={QUERY}
      fareEur={465}
      pickupRadiusKm={15}
      {...over}
    />,
  )
}

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillDetails() {
  fireEvent.click(screen.getByText('choose-address'))
  type('FIRST NAME', 'Anna')
  type('LAST NAME', 'Novak')
  type('EMAIL', 'anna@example.com')
  type('PHONE', '+420 123 456 789')
}

const continueBtn = () => screen.getByRole('button', { name: new RegExp(`^(${co.continue}|${co.checking})$`) })

async function continueToPayment() {
  fillDetails()
  fireEvent.click(continueBtn())
  return screen.findByTestId('stage')
}

beforeEach(() => {
  h.place = PRAGUE
  h.stageProps = null
  h.setRequestLocale.mockClear()
  fetchCalls = []
  fetchReply = { body: INIT_OK }
  fetchGate = null
  window.sessionStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> })
      if (fetchGate) await fetchGate
      if (fetchReply instanceof Error) throw fetchReply
      return {
        ok: (fetchReply.status ?? 200) < 400,
        status: fetchReply.status ?? 200,
        json: async () => fetchReply && !(fetchReply instanceof Error) ? fetchReply.body : {},
      }
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TourCheckout page (server): tracer', () => {
  it('renders the checkout with the tour, the server fare and the radius, is noindex and sets the request locale', async () => {
    h.tourResult = {
      status: 'ok',
      data: {
        tour: {
          slug: QUERY.tour,
          hours_included: 8,
          price_e_eur: 410,
          price_s_eur: 520,
          price_v_eur: 640,
        },
        translation: { title: 'Karlovy Vary day trip' },
        settings: {
          extra_hour_e_eur: 55,
          extra_hour_s_eur: 75,
          extra_hour_v_eur: 90,
          free_cancel_hours: 36,
          pickup_radius_km: 15,
        },
        photos: [],
      },
    }
    const el = await TourCheckoutPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        tour: QUERY.tour,
        date: QUERY.date,
        time: QUERY.time,
        pax: '2',
        car: 'business',
        xh: '1',
        junk: 'x',
      }),
    })
    expect(h.setRequestLocale).toHaveBeenCalledWith('en')
    render(el)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(co.title)
    // 410 + 1 extra hour at 55, from the shared tourFare.
    expect(screen.getByTestId('summary-total').textContent).toBe('€465')
    expect(screen.getByText('Karlovy Vary day trip', { selector: 'h2' })).toBeTruthy()

    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})

describe('TourCheckout: Stage A to init to Stage B', () => {
  it('blocks Continue with field errors until the pickup, names, email and phone are valid', () => {
    setup()
    fireEvent.click(continueBtn())
    expect(screen.getByText(en.Booking.validation.originRequired)).toBeTruthy()
    expect(screen.getByText(en.Booking.validation.firstNameRequired)).toBeTruthy()
    expect(screen.getByText(en.Booking.validation.invalidEmail)).toBeTruthy()
    expect(screen.getByText(en.Booking.validation.invalidPhone)).toBeTruthy()
    expect(fetchCalls).toHaveLength(0)
  })

  it('posts the tour bookingData with currency eur and no amount, shows Checking with aria-busy, then opens Stage B', async () => {
    let release!: () => void
    fetchGate = new Promise<void>((r) => {
      release = r
    })
    setup()
    fillDetails()
    fireEvent.click(continueBtn())

    const busyBtn = await screen.findByRole('button', { name: co.checking })
    expect(busyBtn.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByTestId('stage')).toBeNull()

    await act(async () => {
      release()
    })
    await screen.findByTestId('stage')

    expect(fetchCalls).toHaveLength(1)
    const { url, body } = fetchCalls[0]
    expect(url).toBe('/api/card-checkout/init')
    expect(body.currency).toBe('eur')
    const data = body.bookingData as Record<string, unknown>
    expect(data).toMatchObject({
      tripType: 'tour',
      tourSlug: QUERY.tour,
      extraHours: '1',
      vehicleClass: 'business',
      passengers: '2',
      pickupDate: '2027-06-15',
      pickupTime: '09:00',
      originAddress: PRAGUE.address,
      originLat: '50.09',
      originLng: '14.42',
      firstName: 'Anna',
      lastName: 'Novak',
      email: 'anna@example.com',
      phone: '+420123456789',
      specialRequests: '',
      locale: 'en',
    })
    expect(data.attemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    // T-93-50: nothing that looks like an amount travels from the client.
    expect(JSON.stringify(body)).not.toMatch(/amount|price|total/i)
  })

  it('collapses Stage A into a read-only summary, focuses the Stage B heading and feeds the stage the init answer', async () => {
    setup()
    await continueToPayment()
    expect(screen.getByRole('button', { name: co.editDetails })).toBeTruthy()
    expect(screen.queryByRole('button', { name: co.continue })).toBeNull()

    const heading = screen.getByRole('heading', { level: 2, name: enMessages.Booking.step6.securePaymentLabel })
    await waitFor(() => expect(document.activeElement).toBe(heading))

    expect(screen.getByTestId('stage-amount').textContent).toBe('42000')
    const stage = h.stageProps as { init: { amountMinor: number; policy: { version: string } }; buildIntentBody: (id: string) => Record<string, unknown> }
    expect(stage.init.policy.version).toBe('tour-1')
    // The intent body is the same tour bookingData with the stage's attempt id; no amount.
    const intent = stage.buildIntentBody('11111111-1111-4111-8111-111111111111')
    expect((intent.bookingData as Record<string, unknown>).attemptId).toBe('11111111-1111-4111-8111-111111111111')
    expect((intent.bookingData as Record<string, unknown>).tripType).toBe('tour')
    expect(JSON.stringify(intent)).not.toMatch(/amount|price|total/i)
  })

  it("'Total per car' shows the client fare before init and the server amount after", async () => {
    setup()
    expect(screen.getByTestId('summary-total').textContent).toBe('€465')
    await continueToPayment()
    expect(screen.getByTestId('summary-total').textContent).toBe(formatMinor(42000, 'eur'))
  })

  it("'Edit details' unmounts Stage B; continuing again calls init again", async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByRole('button', { name: co.editDetails }))
    expect(screen.queryByTestId('stage')).toBeNull()
    // The typed values are kept.
    expect((screen.getByLabelText('FIRST NAME') as HTMLInputElement).value).toBe('Anna')
    fireEvent.click(continueBtn())
    await screen.findByTestId('stage')
    expect(fetchCalls).toHaveLength(2)
  })

  it('a server INVALID_PHONE reopens Stage A and focuses the phone field', async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByText('stage-invalid-phone'))
    expect(screen.queryByTestId('stage')).toBeNull()
    expect(screen.getByText(en.Booking.validation.invalidPhone)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('PHONE')))
  })
})

const AIRPORT = { address: 'Vaclav Havel Airport Prague', placeId: 'p2', lat: 50.1008, lng: 14.26 }
// About 20 km north of Old Town Square; the radius in these tests is 15.
const FAR = { address: 'Melnik', placeId: 'p3', lat: 50.2675, lng: 14.4213 }

const OK_TOUR = {
  status: 'ok',
  data: {
    tour: { slug: QUERY.tour, hours_included: 8, price_e_eur: 410, price_s_eur: 520, price_v_eur: 640 },
    translation: { title: 'Karlovy Vary day trip' },
    settings: { extra_hour_e_eur: 55, extra_hour_s_eur: 75, extra_hour_v_eur: 90, free_cancel_hours: 36, pickup_radius_km: 15 },
    photos: [],
  },
}

async function renderPage(search: Record<string, string>) {
  const el = await TourCheckoutPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({
      tour: QUERY.tour,
      date: QUERY.date,
      time: QUERY.time,
      pax: '2',
      car: 'business',
      xh: '1',
      ...search,
    }),
  })
  return render(el)
}

describe('TourCheckout page: query and tour states', () => {
  it('an invalid query (xh=40) shows "We could not find your trip details" with "See all day trips"', async () => {
    h.tourResult = OK_TOUR
    await renderPage({ xh: '40' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(co.missingTitle)
    expect(screen.getByText(co.missingBody)).toBeTruthy()
    const link = screen.getByRole('link', { name: co.seeAll })
    expect(link.getAttribute('href')).toBe('/services/day-trips-from-prague')
    expect(screen.queryByText(co.continue)).toBeNull()
  })

  it('a car that cannot seat the party is an invalid query', async () => {
    h.tourResult = OK_TOUR
    await renderPage({ pax: '5', car: 'business' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(co.missingTitle)
  })

  it.each([{ status: 'not_found' }, { status: 'locale_incomplete', completeLocales: ['en'] }])(
    'an unpublished or incomplete-locale tour (%j) shows "This day trip is not available" with both buttons',
    async (result) => {
      h.tourResult = result
      await renderPage({})
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(co.unavailableTitle)
      expect(screen.getByText(co.unavailableBody)).toBeTruthy()
      expect(screen.getByRole('link', { name: co.seeAll })).toBeTruthy()
      const custom = screen.getByRole('link', { name: co.refusalCta })
      expect(custom.getAttribute('href')).toBe(customTourHref({ tour: QUERY.tour, date: QUERY.date, pax: 2 }))
    },
  )

  it('a car class without a price is "not available" too', async () => {
    h.tourResult = { ...OK_TOUR, data: { ...OK_TOUR.data, tour: { ...OK_TOUR.data.tour, price_e_eur: null } } }
    await renderPage({})
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(co.unavailableTitle)
  })
})

describe('TourCheckout: pickup refusal (client check)', () => {
  const customLink = () => screen.getByRole('link', { name: co.refusalCta })

  it('an address 20 km from Old Town Square (radius 15) shows the outside text and a prefilled custom-tour link; Continue stays blocked', () => {
    h.place = FAR
    setup()
    fillDetails()
    const panel = screen.getByRole('status')
    expect(panel.textContent).toContain(co.refusalOutside)
    expect(customLink().getAttribute('href')).toBe(customTourHref({ tour: QUERY.tour, date: QUERY.date, pax: 2 }))
    expect(screen.queryByText(co.pickupHelper)).toBeNull()
    fireEvent.click(continueBtn())
    expect(fetchCalls).toHaveLength(0)
    expect(screen.queryByTestId('stage')).toBeNull()
  })

  it('an airport address shows the airport text, never opens Stage B, and a Prague address removes the panel', () => {
    h.place = AIRPORT
    setup()
    fillDetails()
    expect(screen.getByTestId('pickup-refusal').getAttribute('data-kind')).toBe('airport')
    expect(screen.getByRole('status').textContent).toContain(co.refusalAirport)
    fireEvent.click(continueBtn())
    expect(fetchCalls).toHaveLength(0)

    h.place = PRAGUE
    fireEvent.click(screen.getByText('choose-address'))
    expect(screen.queryByTestId('pickup-refusal')).toBeNull()
    expect(screen.getByText(co.pickupHelper)).toBeTruthy()
  })

  it('the wishes helper links to the custom tour request', () => {
    setup()
    const link = screen.getByRole('link', { name: 'request a custom tour' })
    expect(link.getAttribute('href')).toBe(customTourHref({ tour: QUERY.tour, date: QUERY.date, pax: 2 }))
  })
})

describe('TourCheckout: init answers and errors', () => {
  it.each([
    ['PICKUP_OUT_OF_AREA', co.refusalOutside],
    ['AIRPORT_PICKUP', co.refusalAirport],
  ])('init reason %s shows the same refusal panel and Stage B never opens', async (reason, text) => {
    fetchReply = { body: { eligible: false, reason } }
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(text))
    expect(screen.queryByTestId('stage')).toBeNull()
    // Choosing another address removes the server refusal.
    fireEvent.click(screen.getByText('choose-address'))
    expect(screen.queryByTestId('pickup-refusal')).toBeNull()
  })

  it('reason LEAD_TIME shows "Online booking closes 12 hours before pickup" with the custom-tour and contact links', async () => {
    fetchReply = { body: { eligible: false, reason: 'LEAD_TIME', policy: INIT_OK.policy } }
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    const panel = await screen.findByRole('status')
    expect(panel.textContent).toContain(
      'Online booking closes 12 hours before pickup. For an earlier trip, message us or request a custom tour.',
    )
    expect(screen.getByRole('link', { name: co.refusalCta })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe('/contact')
    expect(screen.queryByTestId('stage')).toBeNull()
  })

  it('a plain { eligible: false } shows the booking-off panel', async () => {
    fetchReply = { body: { eligible: false } }
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    expect((await screen.findByRole('status')).textContent).toContain(co.bookingOff)
  })

  it('reason TOUR_UNAVAILABLE shows "This day trip is not available"', async () => {
    fetchReply = { body: { eligible: false, reason: 'TOUR_UNAVAILABLE' } }
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    expect((await screen.findByRole('status')).textContent).toContain(co.unavailableTitle)
  })

  it('a fetch rejection shows the network message in a role=alert above the button and keeps the typed values', async () => {
    fetchReply = new Error('offline')
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(co.networkError)
    expect((screen.getByLabelText('FIRST NAME') as HTMLInputElement).value).toBe('Anna')
    expect(screen.getByTestId('address-value').textContent).toBe(PRAGUE.address)
    expect(screen.getByRole('button', { name: co.continue }).getAttribute('aria-busy')).toBe('false')
  })

  it('a 500 shows "Something went wrong. Nothing was charged. Please try again." in a role=alert', async () => {
    fetchReply = { status: 500, body: {} }
    setup()
    fillDetails()
    fireEvent.click(continueBtn())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong. Nothing was charged. Please try again.')
    expect((screen.getByLabelText('LAST NAME') as HTMLInputElement).value).toBe('Novak')
    // The visitor can try again and reach the payment stage.
    fetchReply = { body: INIT_OK }
    fireEvent.click(continueBtn())
    await screen.findByTestId('stage')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a price change inside the payment stage updates the summary total', async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByText('stage-price-changed'))
    expect(screen.getByTestId('summary-total').textContent).toBe(formatMinor(43000, 'eur'))
  })

  it('the stage leaving the card flow (fallback) returns to Stage A with the booking-off panel', async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByText('stage-fallback'))
    expect(screen.queryByTestId('stage')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(co.bookingOff)
  })
})

describe('TourCheckout: wishes', () => {
  it('limits the textarea to 490 characters (the server keeps 490) and shows the counter from 440', () => {
    setup()
    const box = screen.getByLabelText(co.wishes) as HTMLTextAreaElement
    expect(box.maxLength).toBe(490)
    fireEvent.change(box, { target: { value: 'a'.repeat(439) } })
    expect(screen.queryByText('439 of 490')).toBeNull()
    fireEvent.change(box, { target: { value: 'a'.repeat(440) } })
    expect(screen.getByText('440 of 490')).toBeTruthy()
  })

  it('sends the wishes in the init bookingData', async () => {
    setup()
    fireEvent.change(screen.getByLabelText(co.wishes), { target: { value: 'Two child seats' } })
    await continueToPayment()
    expect((fetchCalls[0].body.bookingData as Record<string, unknown>).specialRequests).toBe('Two child seats')
  })
})

describe('tour confirmation snapshot', () => {
  const SNAP: TourConfirmationSnapshot = {
    ref: 'PR-200',
    title: 'Karlovy Vary day trip',
    date: '2027-06-15',
    time: '09:00',
    pickupAddress: 'Hotel Mosaic, Prague',
    carLabelKey: 'business',
    hoursIncluded: 8,
    extraHours: 1,
    payment: 'card',
    amountLabel: '€465',
  }

  it('round-trips under tour-confirmation:<ref>', () => {
    writeTourConfirmation(SNAP)
    expect(window.sessionStorage.getItem('tour-confirmation:PR-200')).not.toBeNull()
    expect(readTourConfirmation('PR-200')).toEqual(SNAP)
  })

  it('returns null for another ref, no entry and unparsable data', () => {
    writeTourConfirmation(SNAP)
    expect(readTourConfirmation('PR-999')).toBeNull()
    expect(readTourConfirmation('')).toBeNull()
    window.sessionStorage.setItem('tour-confirmation:PR-201', '{not json')
    expect(readTourConfirmation('PR-201')).toBeNull()
  })

  it.each([
    ['unknown car', { carLabelKey: 'limousine' }],
    ['non-string title', { title: 42 }],
    ['bad date', { date: '15/06/2027' }],
    ['bad time', { time: '9am' }],
    ['unknown payment', { payment: 'crypto' }],
    ['extra hours out of range', { extraHours: 99 }],
    ['fractional hours', { hoursIncluded: 1.5 }],
  ])('returns null for a tampered value (%s)', (_name, patch) => {
    window.sessionStorage.setItem('tour-confirmation:PR-200', JSON.stringify({ ...SNAP, ...patch }))
    expect(readTourConfirmation('PR-200')).toBeNull()
  })

  it('returns null when the stored ref differs from the key', () => {
    window.sessionStorage.setItem('tour-confirmation:PR-300', JSON.stringify({ ...SNAP, ref: 'PR-200' }))
    expect(readTourConfirmation('PR-300')).toBeNull()
  })

  it('stores nothing for an invalid snapshot and never throws when storage does', () => {
    writeTourConfirmation({ ...SNAP, carLabelKey: 'x' as never })
    expect(window.sessionStorage.length).toBe(0)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeTourConfirmation(SNAP)).not.toThrow()
    spy.mockRestore()
  })
})

describe('TourCheckout: confirmation and the way back', () => {
  it('a confirmed card booking writes the snapshot (reference, trip, pickup, car, hours, mode, amount) and no contact details', async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByText('stage-confirmed-card'))
    expect(readTourConfirmation('PR-100')).toEqual({
      ref: 'PR-100',
      title: 'Karlovy Vary day trip',
      date: '2027-06-15',
      time: '09:00',
      pickupAddress: PRAGUE.address,
      carLabelKey: 'business',
      hoursIncluded: 8,
      extraHours: 1,
      passengers: 2,
      payment: 'card',
      amountLabel: formatMinor(42000, 'eur'),
    })
    const raw = window.sessionStorage.getItem('tour-confirmation:PR-100') ?? ''
    expect(raw).not.toContain('anna@example.com')
    expect(raw).not.toContain('Novak')
    expect(raw).not.toContain('+420')
  })

  it('a confirmed cash booking stores the cash label as the amount', async () => {
    setup()
    await continueToPayment()
    fireEvent.click(screen.getByText('stage-confirmed-cash'))
    const snap = readTourConfirmation('PR-101')
    expect(snap?.payment).toBe('cash')
    expect(snap?.amountLabel).toBe('€420')
  })

  it("'Change trip details' links to the tour page #book and leaves tour-box:<slug> with the current choices", () => {
    setup()
    const link = screen.getByRole('link', { name: co.change })
    expect(link.getAttribute('href')).toBe('/services/karlovy-vary-day-trip#book')
    link.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(link)
    expect(JSON.parse(window.sessionStorage.getItem('tour-box:karlovy-vary-day-trip') ?? 'null')).toEqual({
      date: '2027-06-15',
      time: '09:00',
      pax: 2,
      car: 'business',
      xh: 1,
    })
  })
})

describe('TourCheckout: its own state', () => {
  it('never touches the wizard store', () => {
    for (const file of ['components/tours/TourCheckout.tsx', 'app/[locale]/book/tour/page.tsx', 'components/tours/TourTripSummary.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).not.toContain('booking-store')
    }
  })
})
