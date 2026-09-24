/**
 * cookie-banner-locale-suggestion.test.tsx — Phase 74 UX-02 (revised).
 *
 * The first-visit language suggestion lives inside the CookieBanner consent
 * modal (one prompt instead of two). Pins:
 *   - row shown only when navigator.languages[0] is a supported locale that
 *     differs from the page locale (top preference only, base subtag match)
 *   - "Switch to {endonym}" navigates to the SAME page via
 *     router.replace(pathname, { locale }) — never a hand-built URL — and
 *     does not record any consent choice
 *   - no row (and no modal) once consent was already given
 *   - consent buttons keep working and never navigate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '@/messages/en.json'

const { mockReplace, mockPush, mockUsePathname, mockUseLocale } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockUsePathname: vi.fn(() => '/routes/prague-vienna'),
  mockUseLocale: vi.fn(() => 'en'),
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: mockUsePathname,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useLocale: mockUseLocale }
})

import CookieBanner from '@/components/CookieBanner'

function stubNavigatorLanguages(languages: string[] | undefined, language?: string) {
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true })
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

function renderBanner(locale = 'en') {
  mockUseLocale.mockReturnValue(locale)
  return render(
    <NextIntlClientProvider locale={locale} messages={enMessages}>
      <CookieBanner />
    </NextIntlClientProvider>
  )
}

const SUGGESTION_RU = 'This site is also available in Русский.'

describe('CookieBanner — built-in language suggestion (UX-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
  })

  afterEach(() => {
    localStorage.clear()
    document.body.style.overflow = ''
  })

  it('shows the suggestion row inside the consent modal for a supported, different browser language', () => {
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')
    renderBanner('en')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(SUGGESTION_RU)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to Русский' })).toBeInTheDocument()
  })

  it('"Switch to {endonym}" goes to the same page in that locale and records no consent', () => {
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')
    renderBanner('en')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Русский' }))

    expect(mockReplace).toHaveBeenCalledWith('/routes/prague-vienna', { locale: 'ru' })
    expect(mockPush).not.toHaveBeenCalled()
    expect(localStorage.getItem('prestigo_consent_v2')).toBeNull()
  })

  it('no suggestion row when the browser language equals the page locale', () => {
    stubNavigatorLanguages(['en-US', 'ru'], 'en-US')
    renderBanner('en')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/also available in/)).not.toBeInTheDocument()
  })

  it('no suggestion row when the top browser language is unsupported (only the top preference counts)', () => {
    stubNavigatorLanguages(['de-DE', 'ru'], 'de-DE')
    renderBanner('en')

    expect(screen.queryByText(/also available in/)).not.toBeInTheDocument()
  })

  it('no suggestion row after switching — /ru page with a ru browser', () => {
    stubNavigatorLanguages(['ru-RU'], 'ru-RU')
    renderBanner('ru')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/also available in/)).not.toBeInTheDocument()
  })

  it('suggests zh for zh-CN browsers and uses the zh endonym', () => {
    stubNavigatorLanguages(['zh-CN', 'en'], 'zh-CN')
    renderBanner('en')

    expect(screen.getByRole('button', { name: 'Switch to 中文' })).toBeInTheDocument()
  })

  it('renders nothing (no modal, no suggestion) once consent was already given', () => {
    localStorage.setItem('prestigo_consent_v2', JSON.stringify({ analytics: true, marketing: true }))
    stubNavigatorLanguages(['ru-RU'], 'ru-RU')

    const { container } = renderBanner('en')

    expect(container).toBeEmptyDOMElement()
  })

  it('handles a missing navigator.languages/language without a suggestion or error', () => {
    stubNavigatorLanguages(undefined, undefined)
    renderBanner('en')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/also available in/)).not.toBeInTheDocument()
  })

  it('Accept all still records consent, closes the modal and never navigates', () => {
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')
    renderBanner('en')

    fireEvent.click(screen.getByRole('button', { name: enMessages.CookieBanner.acceptAll }))

    expect(JSON.parse(localStorage.getItem('prestigo_consent_v2') ?? 'null')).toEqual({
      analytics: true,
      marketing: true,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
