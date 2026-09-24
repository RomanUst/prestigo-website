/**
 * locale-switcher.test.tsx — Phase 74, 74-05 Task 2 (RED-GREEN)
 *
 * Pins the UX-01 switch contract for components/LocaleSwitcher.tsx BEFORE
 * the component exists:
 *  - Renders exactly 7 rows with the endonym labels in fixed order
 *    en, ru, es, fr, ar, hi, zh (LOCALE_ENDONYMS from i18n/locales.ts —
 *    structural config, not messages/*.json).
 *  - The active locale's row is marked (does not reorder the list).
 *  - Clicking a non-active row calls the routing bridge's router.replace
 *    with the current pathname and { locale: target } (D-03) — asserted
 *    via a mocked useRouter/usePathname from @/i18n/routing, mirroring the
 *    existing Nav test mocking convention (vi.hoisted + vi.mock).
 *  - The component never navigates home and never assembles the URL by
 *    string concatenation — proven by asserting router.replace receives
 *    the exact pathname value from the mocked usePathname(), not a
 *    hand-built string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from './helpers/renderWithIntl'
import { locales, LOCALE_ENDONYMS } from '@/i18n/locales'

const { mockReplace, mockUsePathname, mockUseLocale } = vi.hoisted(() => {
  const mockReplace = vi.fn()
  const mockUsePathname = vi.fn(() => '/routes/prague-vienna')
  const mockUseLocale = vi.fn(() => 'en')
  return { mockReplace, mockUsePathname, mockUseLocale }
})

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useLocale: () => mockUseLocale(),
  }
})

vi.mock('@/i18n/routing', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: mockReplace }),
}))

import LocaleSwitcher from '@/components/LocaleSwitcher'

describe('LocaleSwitcher — UX-01 switch contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    mockUseLocale.mockReturnValue('en')
  })

  it('renders exactly 7 rows with endonym labels in fixed order en, ru, es, fr, ar, hi, zh', () => {
    renderWithIntl(<LocaleSwitcher />)
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(7)
    expect(items.map((el) => el.textContent?.trim())).toEqual(
      locales.map((loc) => LOCALE_ENDONYMS[loc])
    )
  })

  it('marks the active locale row without reordering the list', () => {
    mockUseLocale.mockReturnValue('fr')
    renderWithIntl(<LocaleSwitcher />)
    const items = screen.getAllByRole('menuitem')
    // Order stays fixed — fr is index 3, not moved to the front.
    expect(items.map((el) => el.textContent?.trim())).toEqual(
      locales.map((loc) => LOCALE_ENDONYMS[loc])
    )
    const frRow = screen.getByRole('menuitem', { name: LOCALE_ENDONYMS.fr })
    expect(frRow).toHaveAttribute('aria-current', 'true')
    const enRow = screen.getByRole('menuitem', { name: LOCALE_ENDONYMS.en })
    expect(enRow).not.toHaveAttribute('aria-current')
  })

  it('shows the active locale 2-letter code on the trigger', () => {
    mockUseLocale.mockReturnValue('ru')
    renderWithIntl(<LocaleSwitcher />)
    const trigger = screen.getByRole('button', { expanded: false })
    expect(trigger.textContent).toMatch(/RU/)
  })

  it('clicking a non-active row calls router.replace with the current pathname and { locale: target } — never a hand-built string', () => {
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    mockUseLocale.mockReturnValue('en')
    renderWithIntl(<LocaleSwitcher />)

    const trigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(trigger)

    const ruRow = screen.getByRole('menuitem', { name: LOCALE_ENDONYMS.ru })
    fireEvent.click(ruRow)

    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/routes/prague-vienna', { locale: 'ru' })
    // Never a hand-built string like '/ru/routes/prague-vienna' or home '/'.
    const [calledPath] = mockReplace.mock.calls[0]
    expect(calledPath).toBe('/routes/prague-vienna')
    expect(calledPath).not.toBe('/')
  })

  it('selecting the already-active locale is a safe same-page no-op-equivalent navigation', () => {
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    mockUseLocale.mockReturnValue('en')
    renderWithIntl(<LocaleSwitcher />)

    const trigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(trigger)

    const enRow = screen.getByRole('menuitem', { name: LOCALE_ENDONYMS.en })
    fireEvent.click(enRow)

    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/routes/prague-vienna', { locale: 'en' })
  })
})

describe('LocaleSwitcher — inline variant (mobile menu)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/routes/prague-vienna')
    mockUseLocale.mockReturnValue('ru')
  })

  it('renders all 7 endonyms in-flow as buttons (no popover, nothing to scroll to)', () => {
    renderWithIntl(<LocaleSwitcher variant="inline" />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((el) => el.textContent?.trim())).toEqual(
      locales.map((loc) => LOCALE_ENDONYMS[loc])
    )
    buttons.forEach((b, i) => expect(b).toHaveAttribute('lang', locales[i]))
  })

  it('marks only the active locale with aria-current', () => {
    renderWithIntl(<LocaleSwitcher variant="inline" />)
    expect(screen.getByRole('button', { name: LOCALE_ENDONYMS.ru })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: LOCALE_ENDONYMS.en })).not.toHaveAttribute('aria-current')
  })

  it('one tap switches to the same page in that locale', () => {
    renderWithIntl(<LocaleSwitcher variant="inline" />)
    fireEvent.click(screen.getByRole('button', { name: LOCALE_ENDONYMS.zh }))
    expect(mockReplace).toHaveBeenCalledWith('/routes/prague-vienna', { locale: 'zh' })
  })
})
