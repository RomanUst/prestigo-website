/**
 * i18n-navigation.test.tsx — Phase 69, 69-01 Task 3 (RED-GREEN-REFACTOR)
 *
 * Locale-prefix retention regression lock (RESEARCH.md IN-01 closure):
 * a localized internal link keeps the locale prefix under a non-default
 * locale, and stays unprefixed under the default locale ('en',
 * localePrefix: 'as-needed').
 *
 * Two levels of coverage:
 *  1. The createNavigation Link primitive directly (i18n/routing.ts) —
 *     proves the navigation bridge itself is correctly wired.
 *  2. Nav.tsx's own rendered internal links — proves the component
 *     actually consumes that bridge (not just next/link's raw Link),
 *     which is the actual behavior STR-01/IN-01 requires.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from './helpers/renderWithIntl'
import { Link } from '@/i18n/routing'

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

// 74-05: Nav now mounts LocaleSwitcher, which calls useRouter() from
// @/i18n/routing (-> next/navigation). next/navigation's useRouter() throws
// "invariant expected app router to be mounted" outside a real Next App
// Router context (unlike usePathname(), which returns null gracefully) — so
// a router stub is required wherever the real Nav is rendered. usePathname
// keeps its real (already-working) implementation via importOriginal.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    useRouter: () => ({
      replace: vi.fn(),
      push: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
  }
})

import Nav from '@/components/Nav'

describe('i18n navigation — locale-prefix retention (IN-01 closure)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockOnAuthStateChange.mockImplementation(
      (cb: (event: string, session: null) => void) => {
        cb('SIGNED_OUT', null)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }
    )
  })

  describe('createNavigation Link primitive', () => {
    it('prefixes href with /ru under locale=ru', () => {
      renderWithIntl(<Link href="/services">Services</Link>, { locale: 'ru' })
      const link = screen.getByRole('link', { name: 'Services' })
      expect(link.getAttribute('href')).toMatch(/^\/ru/)
    })

    it('keeps href unprefixed under locale=en (localePrefix: as-needed)', () => {
      renderWithIntl(<Link href="/services">Services</Link>, { locale: 'en' })
      const link = screen.getByRole('link', { name: 'Services' })
      expect(link.getAttribute('href')).toBe('/services')
    })
  })

  describe('Nav internal links', () => {
    it('keeps the /ru prefix on a Nav internal link under locale=ru', () => {
      renderWithIntl(<Nav />, { locale: 'ru' })
      const servicesLink = screen.getAllByText('Services')[0].closest('a')
      expect(servicesLink).not.toBeNull()
      expect(servicesLink?.getAttribute('href')).toBe('/ru/services')
    })

    it('has no locale prefix on a Nav internal link under locale=en', () => {
      renderWithIntl(<Nav />, { locale: 'en' })
      const servicesLink = screen.getAllByText('Services')[0].closest('a')
      expect(servicesLink).not.toBeNull()
      expect(servicesLink?.getAttribute('href')).toBe('/services')
    })
  })
})
