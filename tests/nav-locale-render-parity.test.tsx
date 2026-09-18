/**
 * nav-locale-render-parity.test.tsx — Phase 73, 73-01 Task 3 (RTL-01, D-12)
 *
 * Nav-inclusive byte-parity coverage for the physical->logical Tailwind
 * class conversion + chevron JS-rotation change made in components/Nav.tsx
 * (73-01 Task 1). Renders the REAL Nav.tsx (not the null-mocked stand-in
 * tests/route-page-render.test.tsx uses for its route-content snapshot)
 * under dir="ltr" for every locale this phase must not regress —
 * en/ru/es/fr — and locks each as a golden snapshot.
 *
 * Kept as its own file rather than appended to route-page-render.test.tsx:
 * that file's module-scope `vi.mock('@/components/Nav', () => ({ default:
 * () => null }))` is hoisted by Vitest ahead of any in-test vi.unmock call
 * (confirmed live — vi.unmock does not un-hoist), so a real Nav render
 * cannot coexist with that file's null-mocked PragueViennaPage suite in
 * the same module. A dedicated file avoids the conflict entirely and
 * matches the existing tests/nav-auth.test.tsx / tests/i18n-navigation.test.tsx
 * mocking pattern (createBrowserClient + customerSignOut).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithIntl } from './helpers/renderWithIntl'
import type { AbstractIntlMessages } from 'next-intl'
import Nav from '@/components/Nav'
import enMessages from '../messages/en.json'
import ruMessages from '../messages/ru.json'
import esMessages from '../messages/es.json'
import frMessages from '../messages/fr.json'

const { mockOnAuthStateChange, mockGetUser } = vi.hoisted(() => {
  const mockOnAuthStateChange = vi.fn()
  const mockGetUser = vi.fn()
  return { mockOnAuthStateChange, mockGetUser }
})

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getUser: mockGetUser,
    },
  })),
}))

vi.mock('@/app/[locale]/login/actions', () => ({
  customerSignOut: vi.fn(),
}))

const localeFixtures: Array<{ locale: string; messages: AbstractIntlMessages }> = [
  { locale: 'en', messages: enMessages as unknown as AbstractIntlMessages },
  { locale: 'ru', messages: ruMessages as unknown as AbstractIntlMessages },
  { locale: 'es', messages: esMessages as unknown as AbstractIntlMessages },
  { locale: 'fr', messages: frMessages as unknown as AbstractIntlMessages },
]

describe('Nav — byte-parity across en/ru/es/fr under dir="ltr" (RTL-01, D-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Guest state (SIGNED_OUT) — deterministic render, matches nav-auth.test.tsx.
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
      cb('SIGNED_OUT', null)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  it.each(localeFixtures)(
    'renders Nav identically (golden snapshot) for locale=$locale',
    ({ locale, messages }) => {
      const { container } = renderWithIntl(<Nav />, { locale, messages })
      expect(container.innerHTML).toMatchSnapshot()
    }
  )
})
