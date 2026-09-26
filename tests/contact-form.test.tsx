import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { render } from '@testing-library/react'
import { renderWithIntl, screen } from '@/tests/helpers/renderWithIntl'
import ContactForm from '@/components/ContactForm'
import ContactPage from '@/app/[locale]/contact/page'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages

// Nav pulls in a Supabase browser client that requires real env vars — not
// relevant to this test's assertions (detail labels + locale-prefixed hrefs).
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('ContactForm (en)', () => {
  it('renders every visible string from the EN catalog', () => {
    renderWithIntl(<ContactForm />)
    expect(screen.getByText(enMessages.ContactForm.heading)).toBeTruthy()
    expect(screen.getAllByText(enMessages.ContactForm.responseNote).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(enMessages.ContactForm.namePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.ContactForm.emailPlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.ContactForm.messagePlaceholder)).toBeTruthy()
    expect(screen.getByText(enMessages.ContactForm.services.airportTransfer)).toBeTruthy()
    expect(screen.getByRole('button', { name: enMessages.ContactForm.submit })).toBeTruthy()
    // GA4 form_name identifier stays the English literal regardless of locale.
    expect(screen.getByLabelText(/^Service/).outerHTML).toBeTruthy()
  })

  it('sends the English service value (unchanged) to the API, not the translated label', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })
    renderWithIntl(<ContactForm />)

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'jane@example.com' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'VIP & Events' } })
    fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: 'Test message' } })
    fireEvent.click(screen.getByRole('button', { name: enMessages.ContactForm.submit }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.service).toBe('VIP & Events')
  })
})

describe('ContactForm (ru) — no English leakage, GA4 identifiers untouched', () => {
  it('renders every ru label/placeholder/button and no English text', () => {
    renderWithIntl(<ContactForm />, { locale: 'ru', messages: ruMessagesTyped })

    expect(screen.getByText(ruMessages.ContactForm.heading)).toBeTruthy()
    expect(screen.getAllByText(ruMessages.ContactForm.responseNote).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(ruMessages.ContactForm.namePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.ContactForm.emailPlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.ContactForm.messagePlaceholder)).toBeTruthy()
    expect(screen.getByText(ruMessages.ContactForm.services.airportTransfer)).toBeTruthy()
    expect(screen.getByRole('button', { name: ruMessages.ContactForm.submit })).toBeTruthy()

    expect(screen.queryByText(enMessages.ContactForm.heading)).toBeNull()
    expect(screen.queryByText(enMessages.ContactForm.submit)).toBeNull()
    expect(screen.queryByPlaceholderText(enMessages.ContactForm.messagePlaceholder)).toBeNull()
  })

  it('shows the ru success heading/body/link after a successful submit', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })
    renderWithIntl(<ContactForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.change(screen.getByLabelText(new RegExp(`^${ruMessages.ContactForm.nameLabel}`)), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`^${ruMessages.ContactForm.emailLabel}`)), { target: { value: 'ivan@test.com' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`^${ruMessages.ContactForm.messageLabel}`)), { target: { value: 'Тест' } })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.ContactForm.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.ContactForm.success.heading)).toBeTruthy())
    const successParagraph = screen.getByText(ruMessages.ContactForm.success.heading).nextElementSibling as HTMLElement
    expect(successParagraph.textContent).toContain(ruMessages.ContactForm.success.body)
    expect(successParagraph.textContent).toContain(ruMessages.ContactForm.success.followUp)
    expect(screen.getByText(ruMessages.ContactForm.success.another)).toBeTruthy()
  })

  it('shows the ru error heading/body/retry link when the API call fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })
    renderWithIntl(<ContactForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.ContactForm.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.ContactForm.errors.heading)).toBeTruthy())
    const errorParagraph = screen.getByText(ruMessages.ContactForm.errors.heading).nextElementSibling as HTMLElement
    expect(errorParagraph.textContent).toContain(ruMessages.ContactForm.errors.body)
    expect(screen.getByText(ruMessages.ContactForm.errors.retry)).toBeTruthy()
    expect(screen.queryByText(enMessages.ContactForm.errors.heading)).toBeNull()
  })

  it('pushGA4Event form_name/form_id identifiers stay the English literal on form_start', () => {
    const gtagMock = vi.fn()
    vi.stubGlobal('gtag', gtagMock)
    renderWithIntl(<ContactForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.change(screen.getByLabelText(new RegExp(`^${ruMessages.ContactForm.nameLabel}`)), { target: { value: 'И' } })
    expect(gtagMock).toHaveBeenCalledWith('event', 'form_start', { form_id: 'contact', form_name: 'Contact form' })
    vi.unstubAllGlobals()
  })
})

describe('/contact page (ru) — details labels + locale-prefixed internal links', () => {
  it('renders ru detail labels and prefixes every internal href with /ru/', async () => {
    const PageElement = await ContactPage({ params: Promise.resolve({ locale: 'ru' }) })
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessagesTyped}>
        {PageElement}
      </NextIntlClientProvider>
    )

    // Detail labels come from content/pages/ru/contact.json::details.
    // "Телефон"/"Электронная почта" also appear as ContactForm's own field
    // labels, so use getAllByText for those two — presence, not uniqueness.
    expect(screen.getAllByText('Телефон').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Электронная почта').length).toBeGreaterThan(0)
    expect(screen.getByText('Местоположение')).toBeTruthy()
    expect(screen.getByText('Доступность')).toBeTruthy()
    expect(screen.getByText('Юридическое лицо')).toBeTruthy()

    // Legal entity block + phone/email stay verbatim DNT.
    expect(screen.getByText('chelautotrans s.r.o.')).toBeTruthy()
    expect(screen.getByText('+420 725 986 855')).toBeTruthy()
    expect(screen.getByText('info@rideprestigo.com')).toBeTruthy()

    // Every single-slash internal href (the "Also useful" links) is locale-prefixed.
    const internalLinks = screen.getAllByRole('link').filter((a) => {
      const href = a.getAttribute('href') ?? ''
      return href.startsWith('/') && !href.startsWith('//')
    })
    expect(internalLinks.length).toBeGreaterThan(0)
    for (const link of internalLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/ru\//)
    }
  })
})
