// @vitest-environment jsdom
/**
 * Phase 93, plan 93-34 (TRIP-06; D-16, D-17; T-93-78, T-93-79) - the custom-tour request page and form.
 * Today is pinned to 2027-06-10 (Prague). next-intl/server is mocked with the real use-intl translator over the
 * real catalog; the store, Nav and Footer are mocked; fetch is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator } from 'use-intl/core'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import enMessages from '@/messages/en.json'
import { formatLocaleDate } from '@/lib/locale-date'

const h = vi.hoisted(() => ({
  setRequestLocale: vi.fn(),
  getPublishedTourForLocale: vi.fn(),
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
vi.mock('next-intl/server', () => ({
  setRequestLocale: h.setRequestLocale,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: enMessages as never, namespace } as never),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/tours/store', () => ({ getPublishedTourForLocale: h.getPublishedTourForLocale }))
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

import CustomTourPage, { generateMetadata } from '@/app/[locale]/book/custom-tour/page'

const NOW = Date.parse('2027-06-10T08:00:00Z')
const SLUG = 'dresden-day-trip'
const RU_TITLE = 'Дрезден за один день'
const VALID_PHONE = '+420725986855'

function okTour(title = RU_TITLE) {
  return { status: 'ok', data: { tour: { slug: SLUG }, translation: { title } } }
}

async function renderPage(search: Record<string, string> = {}, locale = 'ru') {
  const ui = await CustomTourPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(search),
  })
  return render(
    <NextIntlClientProvider locale={locale} messages={enMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement

function pickDate() {
  fireEvent.click(screen.getByRole('button', { name: /Choose a date/ }))
  fireEvent.click(screen.getByRole('button', { name: /June 15th, 2027/ }))
}

function fillForm(over: { where?: string; name?: string; email?: string; phone?: string; date?: boolean } = {}) {
  if (over.where !== undefined) fireEvent.change(field(/WHERE DO YOU WANT TO GO/), { target: { value: over.where } })
  if (over.date !== false) pickDate()
  fireEvent.change(field('WISHES (OPTIONAL)'), { target: { value: 'Child seat please' } })
  fireEvent.change(field('YOUR NAME'), { target: { value: over.name ?? 'Anna Novak' } })
  fireEvent.change(field('EMAIL'), { target: { value: over.email ?? 'anna@example.com' } })
  fireEvent.change(field(/PHONE \/ WHATSAPP/), { target: { value: over.phone ?? VALID_PHONE } })
}

const send = () => screen.getByRole('button', { name: /Send request|Sending/ })
const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.setRequestLocale.mockClear()
  h.getPublishedTourForLocale.mockReset()
  h.getPublishedTourForLocale.mockResolvedValue({ status: 'not_found' })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('custom-tour page: prefill from the query', () => {
  it('shows "Based on: <title>" and prefills where with the localized title for a published, complete tour', async () => {
    h.getPublishedTourForLocale.mockResolvedValue(okTour())
    await renderPage({ tour: SLUG })
    expect(h.getPublishedTourForLocale).toHaveBeenCalledWith(SLUG, 'ru')
    expect(screen.getByText(`Based on: ${RU_TITLE}`)).toBeTruthy()
    expect(field(/WHERE DO YOU WANT TO GO/).value).toBe(RU_TITLE)
    expect(screen.getByRole('button', { name: `Remove ${RU_TITLE}` })).toBeTruthy()
  })

  it('shows no chip for an unpublished tour or an invalid slug (the store is not asked for an invalid one)', async () => {
    await renderPage({ tour: SLUG })
    expect(screen.queryByText(/Based on:/)).toBeNull()
    expect(field(/WHERE DO YOU WANT TO GO/).value).toBe('')
    cleanup()
    h.getPublishedTourForLocale.mockClear()
    await renderPage({ tour: 'Dresden/../x' })
    expect(screen.queryByText(/Based on:/)).toBeNull()
    expect(h.getPublishedTourForLocale).not.toHaveBeenCalled()
  })

  it('shows no chip when the store throws', async () => {
    h.getPublishedTourForLocale.mockRejectedValue(new Error('db down'))
    await renderPage({ tour: SLUG })
    expect(screen.queryByText(/Based on:/)).toBeNull()
  })

  it('prefills a valid date and pax, and ignores yesterday, today, a bad date and pax 99', async () => {
    await renderPage({ date: '2027-06-15', pax: '4' })
    expect(screen.getByText(formatLocaleDate('2027-06-15', 'ru'))).toBeTruthy()
    expect(field('NUMBER OF PEOPLE').value).toBe('4')
    cleanup()
    for (const date of ['2027-06-09', '2027-06-10', '2027-02-30', 'tomorrow']) {
      await renderPage({ date, pax: '99' })
      expect(screen.getByText('Choose a date')).toBeTruthy()
      expect(field('NUMBER OF PEOPLE').value).toBe('2')
      cleanup()
    }
  })
})

describe('custom-tour page: module contract', () => {
  it('has noindex metadata', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.title).toBe('Request a custom tour')
  })

  it('reads params.locale, calls setRequestLocale and never the bare locale reader', async () => {
    await renderPage({}, 'ru')
    expect(h.setRequestLocale).toHaveBeenCalledWith('ru')
    const src = readFileSync(join(process.cwd(), 'app/[locale]/book/custom-tour/page.tsx'), 'utf8')
    expect(src).not.toMatch(/\bgetLocale\b/)
    expect(src).toMatch(/noindex|index: false/)
  })

  it('answers 404 for an unknown locale', async () => {
    await expect(renderPage({}, 'xx')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('custom-tour form: submit', () => {
  it('POSTs the fields, tourSlug, locale and an empty honeypot; pending shows Sending with aria-busy and read-only inputs; 200 shows the success panel', async () => {
    h.getPublishedTourForLocale.mockResolvedValue(okTour())
    let resolveFetch: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolveFetch = r)))
    await renderPage({ tour: SLUG })
    fillForm()
    fireEvent.change(field('NUMBER OF PEOPLE'), { target: { value: '4' } })
    fireEvent.click(send())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/custom-tour')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      where: RU_TITLE,
      date: '2027-06-15',
      people: 4,
      wishes: 'Child seat please',
      name: 'Anna Novak',
      email: 'anna@example.com',
      phone: VALID_PHONE,
      tourSlug: SLUG,
      locale: 'ru',
      website: '',
    })

    // pending
    const busy = send()
    expect(busy.textContent).toContain('Sending…')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(field('YOUR NAME').readOnly).toBe(true)
    expect(field('EMAIL').readOnly).toBe(true)

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    })
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Request sent')
    expect(status.textContent).toContain('anna@example.com')
    expect(screen.getByRole('heading', { name: 'Request sent' })).toBe(document.activeElement)
    expect(screen.getByRole('link', { name: 'See day trips' }).getAttribute('href')).toBe('/services/day-trips-from-prague')
    expect(screen.queryByLabelText('YOUR NAME')).toBeNull()
  })

  it('removing the chip clears tourSlug from the payload (where keeps what was typed)', async () => {
    h.getPublishedTourForLocale.mockResolvedValue(okTour())
    fetchMock.mockImplementation(() => jsonResponse(200, { ok: true }))
    await renderPage({ tour: SLUG })
    fireEvent.click(screen.getByRole('button', { name: `Remove ${RU_TITLE}` }))
    expect(screen.queryByText(/Based on:/)).toBeNull()
    fillForm()
    fireEvent.click(send())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect('tourSlug' in body).toBe(false)
    expect(body.where).toBe(RU_TITLE)
  })

  it('sends the honeypot value as typed by a bot', async () => {
    fetchMock.mockImplementation(() => jsonResponse(200, { ok: true }))
    await renderPage()
    fillForm({ where: 'Karlovy Vary and Marianske Lazne' })
    const honeypot = screen.getByTestId('custom-tour-website')
    fireEvent.change(honeypot, { target: { value: 'spam.example' } })
    fireEvent.click(send())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).website).toBe('spam.example')
    expect(honeypot.getAttribute('tabindex')).toBe('-1')
    expect(honeypot.getAttribute('autocomplete')).toBe('off')
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('custom-tour form: people stepper and counter', () => {
  it('steps 1..50 and accepts typing', async () => {
    await renderPage({ pax: '50' })
    expect((screen.getByRole('button', { name: 'More passengers' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Fewer passengers' }))
    expect(field('NUMBER OF PEOPLE').value).toBe('49')
    fireEvent.change(field('NUMBER OF PEOPLE'), { target: { value: '1' } })
    expect((screen.getByRole('button', { name: 'Fewer passengers' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the wishes counter from 900 characters', async () => {
    await renderPage()
    expect(screen.queryByText(/\/ 1000/)).toBeNull()
    fireEvent.change(field('WISHES (OPTIONAL)'), { target: { value: 'x'.repeat(900) } })
    expect(screen.getByText('900 / 1000')).toBeTruthy()
  })
})

describe('custom-tour form: errors', () => {
  it('empty where / date / name show inline errors and send no request', async () => {
    await renderPage()
    fireEvent.change(field(/PHONE \/ WHATSAPP/), { target: { value: VALID_PHONE } })
    fireEvent.change(field('EMAIL'), { target: { value: 'anna@example.com' } })
    fireEvent.click(send())
    expect(screen.getByText('Tell us where you want to go.')).toBeTruthy()
    expect(screen.getByText('Choose a date.')).toBeTruthy()
    expect(screen.getByText('Enter your name.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a phone without a country code or a bad email is refused on the client', async () => {
    await renderPage()
    fillForm({ where: 'Dresden', phone: '12345', email: 'nope' })
    fireEvent.click(send())
    expect(screen.getByText('Enter a phone number with the country code.')).toBeTruthy()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  async function submitWith(response: () => Promise<Response>) {
    fetchMock.mockImplementation(response)
    await renderPage()
    fillForm({ where: 'Dresden and Bastei' })
    fireEvent.click(send())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  }

  function expectTypedKept() {
    expect(field(/WHERE DO YOU WANT TO GO/).value).toBe('Dresden and Bastei')
    expect(field('YOUR NAME').value).toBe('Anna Novak')
    expect(field('EMAIL').value).toBe('anna@example.com')
    expect(field('WISHES (OPTIONAL)').value).toBe('Child seat please')
    expect(screen.getByText(formatLocaleDate('2027-06-15', 'ru'))).toBeTruthy()
    expect(send().textContent).toContain('Send request')
  }

  it('400 fieldErrors map to the field messages and keep everything typed', async () => {
    await submitWith(() => jsonResponse(400, { error: 'invalid', fieldErrors: { where: ['x'], name: ['y'], date: ['z'] } }))
    expect(await screen.findByText('Tell us where you want to go.')).toBeTruthy()
    expect(screen.getByText('Enter your name.')).toBeTruthy()
    expect(screen.getByText('Choose a date.')).toBeTruthy()
    expectTypedKept()
  })

  it('422 INVALID_PHONE shows the phone message', async () => {
    await submitWith(() => jsonResponse(422, { code: 'INVALID_PHONE' }))
    expect(await screen.findByText('Enter a phone number with the country code.')).toBeTruthy()
    expectTypedKept()
  })

  it('429 shows the rate-limit message', async () => {
    await submitWith(() => jsonResponse(429, {}))
    expect((await screen.findByRole('alert')).textContent).toBe('Too many requests. Please wait a minute and try again.')
    expectTypedKept()
  })

  it('a rejected fetch shows the network message', async () => {
    await submitWith(() => Promise.reject(new TypeError('Failed to fetch')))
    expect((await screen.findByRole('alert')).textContent).toBe('We could not reach our server. Check your connection and try again.')
    expectTypedKept()
  })

  it('any other status shows the generic message', async () => {
    await submitWith(() => jsonResponse(500, {}))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'We could not send your request. Please try again or message us on WhatsApp.',
    )
    expectTypedKept()
  })

  it('a 400 without known field errors shows the generic message', async () => {
    await submitWith(() => jsonResponse(400, { error: 'invalid' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We could not send your request.')
  })
})
