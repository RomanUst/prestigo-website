import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl, screen } from '@/tests/helpers/renderWithIntl'
import CorporateForm from '@/app/[locale]/corporate/CorporateForm'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('CorporateForm (en)', () => {
  it('renders every visible string from the EN catalog (labels, placeholders, options, button)', () => {
    renderWithIntl(<CorporateForm />)

    expect(screen.getByText(enMessages.Corporate.form.heading)).toBeTruthy()
    expect(screen.getByText(enMessages.Corporate.form.subheading)).toBeTruthy()
    expect(screen.getByText(/Company name/)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.Corporate.form.companyPlaceholder)).toBeTruthy()
    expect(screen.getByText(/Contact name & role/)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.Corporate.form.contactNamePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.Corporate.form.emailPlaceholder)).toBeTruthy()
    expect(screen.getByText(enMessages.Corporate.form.tripsLabel)).toBeTruthy()
    expect(screen.getByText(enMessages.Corporate.form.tripsPlaceholder)).toBeTruthy()
    expect(screen.getByText('1–5 trips/month')).toBeTruthy()
    expect(screen.getByText('30+ trips/month')).toBeTruthy()
    expect(screen.getByText(enMessages.Corporate.form.notesLabel)).toBeTruthy()
    expect(screen.getByPlaceholderText(enMessages.Corporate.form.notesPlaceholder)).toBeTruthy()
    expect(screen.getByRole('button', { name: enMessages.Corporate.form.submit })).toBeTruthy()
  })

  it('sends the raw range value (unchanged) to the API, not the translated label', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })
    renderWithIntl(<CorporateForm />)

    fireEvent.change(screen.getByLabelText(/^Company name/), { target: { value: 'ACME Corp' } })
    fireEvent.change(screen.getByLabelText(/^Contact name & role/), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'jane@acme.com' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6–15' } })
    fireEvent.click(screen.getByRole('button', { name: enMessages.Corporate.form.submit }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.trips).toBe('6–15')
  })

  it('shows the success heading/body/link after a successful submit', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })
    renderWithIntl(<CorporateForm />)
    fireEvent.click(screen.getByRole('button', { name: enMessages.Corporate.form.submit }))
    await waitFor(() => expect(screen.getByText(enMessages.Corporate.form.success.heading)).toBeTruthy())
    const successParagraph = screen.getByText(enMessages.Corporate.form.success.heading).nextElementSibling as HTMLElement
    expect(successParagraph.textContent).toContain(enMessages.Corporate.form.success.body)
    expect(successParagraph.textContent).toContain(enMessages.Corporate.form.success.followUp)
    expect(screen.getByText(enMessages.Corporate.form.success.another)).toBeTruthy()
  })
})

describe('CorporateForm (ru) — no English leakage, incl. error paths', () => {
  it('renders every ru label/placeholder/button and no English text', () => {
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })

    expect(screen.getByText(ruMessages.Corporate.form.heading)).toBeTruthy()
    expect(screen.getByText(ruMessages.Corporate.form.subheading)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.Corporate.form.companyPlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.Corporate.form.contactNamePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.Corporate.form.emailPlaceholder)).toBeTruthy()
    expect(screen.getByText(ruMessages.Corporate.form.tripsLabel)).toBeTruthy()
    expect(screen.getByPlaceholderText(ruMessages.Corporate.form.notesPlaceholder)).toBeTruthy()
    expect(screen.getByRole('button', { name: ruMessages.Corporate.form.submit })).toBeTruthy()

    // None of the EN-only strings should be present.
    expect(screen.queryByText(enMessages.Corporate.form.heading)).toBeNull()
    expect(screen.queryByText(enMessages.Corporate.form.submit)).toBeNull()
    expect(screen.queryByPlaceholderText(enMessages.Corporate.form.notesPlaceholder)).toBeNull()
  })

  it('the trips-per-month option labels render via ICU with the numeric bucket values unchanged', () => {
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })
    expect(screen.getByText(`1–5 ${ruMessages.Corporate.form.tripsPerMonth.replace('{count} ', '')}`)).toBeTruthy()
    expect(screen.getByText(`30+ ${ruMessages.Corporate.form.tripsPerMonth.replace('{count} ', '')}`)).toBeTruthy()
  })

  it('shows the ru rate-limit message on a 429 response', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 })
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.Corporate.form.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.Corporate.form.errors.rateLimited)).toBeTruthy())
    expect(screen.queryByText(enMessages.Corporate.form.errors.rateLimited)).toBeNull()
  })

  it('shows the ru invalid-input message on a 400 response', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 400 })
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.Corporate.form.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.Corporate.form.errors.invalidInput)).toBeTruthy())
  })

  it('shows the ru generic message on a non-429/400 error status', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 })
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.Corporate.form.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.Corporate.form.errors.generic)).toBeTruthy())
  })

  it('shows the ru generic message when fetch throws (network failure)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))
    renderWithIntl(<CorporateForm />, { locale: 'ru', messages: ruMessagesTyped })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.Corporate.form.submit }))
    await waitFor(() => expect(screen.getByText(ruMessages.Corporate.form.errors.generic)).toBeTruthy())
  })
})
