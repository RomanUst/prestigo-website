/**
 * first-visit-banner.test.tsx — Phase 74, 74-06 Task 1 (RED-GREEN-REFACTOR)
 *
 * Pins the UX-02 suggest/switch/stay contract for FirstVisitBanner:
 *   - consent-gated (never shows while CookieBanner's modal is unresolved)
 *   - cookie-gated (shows at most once per visitor)
 *   - adjacency (exact browser-locale match suggests nothing)
 *   - deterministic top-preference matching (navigator.languages[0] only)
 *   - "Switch" navigates via the same router.replace(pathname, {locale})
 *     bridge as LocaleSwitcher (74-05) — never a hand-built URL/home jump
 *   - "Stay" hand-writes NEXT_LOCALE to the CURRENT locale and never
 *     navigates (D-04/D-05 — no automatic redirect, ever)
 *
 * NOTE: This file is intentionally RED (failing) until Task 2 creates
 * components/FirstVisitBanner.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const { mockReplace, mockPush, mockUsePathname, mockGetConsent, mockUseLocale } =
  vi.hoisted(() => {
    return {
      mockReplace: vi.fn(),
      mockPush: vi.fn(),
      mockUsePathname: vi.fn(() => '/routes/prague-vienna'),
      mockGetConsent: vi.fn(),
      mockUseLocale: vi.fn(() => 'en'),
    }
  })

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mirrors the LocaleSwitcher (74-05) mock convention — usePathname/useRouter
// come from the single D-03 navigation bridge, never string concatenation.
vi.mock('@/i18n/routing', () => ({
  routing: { locales: ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] },
  usePathname: mockUsePathname,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

// Only useLocale is mocked — NextIntlClientProvider/useTranslations stay
// real so the component's t('Common.firstVisitBanner.*') calls resolve
// against the fixture messages object below.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useLocale: mockUseLocale,
  }
})

// getConsent() controlled directly — avoids real localStorage/timing
// dependence, per the plan's read_first note.
vi.mock('@/components/CookieBanner', () => ({
  getConsent: mockGetConsent,
}))

// ---------------------------------------------------------------------------
// Import (production target — does not exist yet; tests are RED)
// ---------------------------------------------------------------------------
import FirstVisitBanner from '@/components/FirstVisitBanner'

// ---------------------------------------------------------------------------
// Fixture messages — only the keys this component needs.
// ---------------------------------------------------------------------------
const messages = {
  Common: {
    firstVisitBanner: {
      suggestion: 'This site is also available in {endonym}.',
      switchTo: 'Switch to {endonym}',
      stayIn: 'Stay in {endonym}',
    },
  },
}

function renderBanner(locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FirstVisitBanner />
    </NextIntlClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim()
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
    }
  })
}

function stubNavigatorLanguages(languages: string[] | undefined, language?: string) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FirstVisitBanner — suggest/switch/stay contract (UX-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLocale.mockReturnValue('en')
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    clearCookies()
  })

  afterEach(() => {
    clearCookies()
  })

  it('renders nothing while getConsent() returns null, regardless of navigator.languages', () => {
    mockGetConsent.mockReturnValue(null)
    stubNavigatorLanguages(['ru-RU', 'ru'], 'ru-RU')

    const { container } = renderBanner('en')

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when a NEXT_LOCALE cookie already exists (already switched or dismissed once)', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    document.cookie = 'NEXT_LOCALE=en; path=/'
    stubNavigatorLanguages(['ru-RU', 'ru'], 'ru-RU')

    const { container } = renderBanner('en')

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the top browser preference base subtag equals the current locale (adjacency)', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    stubNavigatorLanguages(['en-US', 'ru'], 'en-US')

    const { container } = renderBanner('en')

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the suggestion + Switch/Stay controls when the top preference is a supported, different locale', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')

    renderBanner('en')

    expect(
      screen.getByText('This site is also available in Русский.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to Русский' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay in English' })).toBeInTheDocument()
  })

  it('clicking "Switch to {endonym}" calls router.replace(pathname, { locale }) — never a hand-built URL or home jump', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')

    renderBanner('en')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Русский' }))

    expect(mockReplace).toHaveBeenCalledWith('/routes/prague-vienna', { locale: 'ru' })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('clicking "Stay in {endonym}" writes NEXT_LOCALE=<currentLocale> and hides the banner without navigating', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    stubNavigatorLanguages(['ru-RU', 'en'], 'ru-RU')

    renderBanner('en')

    fireEvent.click(screen.getByRole('button', { name: 'Stay in English' }))

    expect(document.cookie).toContain('NEXT_LOCALE=en')
    expect(document.cookie).not.toContain('NEXT_LOCALE=ru')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(
      screen.queryByText('This site is also available in Русский.')
    ).not.toBeInTheDocument()
  })

  it('renders nothing and throws no error when navigator.languages/navigator.language are missing or unparseable', () => {
    mockGetConsent.mockReturnValue({ analytics: true, marketing: true })
    stubNavigatorLanguages(undefined, undefined)

    expect(() => renderBanner('en')).not.toThrow()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    stubNavigatorLanguages([], '')
    expect(() => renderBanner('en')).not.toThrow()
  })
})
