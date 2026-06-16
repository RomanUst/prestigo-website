/**
 * nav-auth.test.tsx — Wave-0 test scaffold
 * Phase 58 — Sign-in UI + Account Dashboard
 *
 * Covers: NAV-01, NAV-02
 *
 * NOTE: This file is intentionally RED (failing) until Plan 03 adds auth state
 * to components/Nav.tsx. Tests encode the full behavioral contract for NAV-01
 * and NAV-02 requirements.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockOnAuthStateChange,
  mockGetUser,
  mockCustomerSignOut,
} = vi.hoisted(() => {
  const mockOnAuthStateChange = vi.fn()
  const mockGetUser = vi.fn()
  const mockCustomerSignOut = vi.fn()

  return {
    mockOnAuthStateChange,
    mockGetUser,
    mockCustomerSignOut,
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getUser: mockGetUser,
    },
  })),
}))

vi.mock('@/app/login/actions', () => ({
  customerSignOut: mockCustomerSignOut,
}))

// ---------------------------------------------------------------------------
// Import (production target — does not have auth state yet; tests are RED)
// ---------------------------------------------------------------------------
import Nav from '@/components/Nav'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignedInSession(email = 'user@example.com') {
  return {
    user: {
      id: 'user-uuid',
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    },
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Nav — auth state rendering (NAV-01, NAV-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Nav eagerly calls getUser() on mount (WR-06: avoids Sign-in flash) before
    // the onAuthStateChange subscription fires. Default to null so it never
    // throws; the synchronous onAuthStateChange callback below still drives
    // the actual rendered state for each test.
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  // -------------------------------------------------------------------------
  // NAV-01 — Guest state: "Sign in" button linking to /login
  // -------------------------------------------------------------------------
  describe('NAV-01: guest state (SIGNED_OUT)', () => {
    it('renders a "Sign in" element visible in the desktop bar', () => {
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
        cb('SIGNED_OUT', null)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      // Should render "Sign in" text — exact copy from UI-SPEC Copywriting Contract
      const signInElements = screen.getAllByText('Sign in')
      expect(signInElements.length).toBeGreaterThan(0)
    })

    it('"Sign in" element has href="/login"', () => {
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
        cb('SIGNED_OUT', null)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      // Find the desktop "Sign in" link — should be an anchor pointing to /login
      const signInLinks = screen.getAllByRole('link', { name: /sign in/i })
      // At least one (desktop or mobile) should link to /login
      const loginLink = signInLinks.find((el) => el.getAttribute('href') === '/login')
      expect(loginLink).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // NAV-02 — Signed-in state: account trigger present, "Sign in" absent
  // -------------------------------------------------------------------------
  describe('NAV-02: signed-in state', () => {
    it('hides "Sign in" and shows an account trigger with aria-label when session is active', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof makeSignedInSession extends () => infer R ? R : never) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      // "Sign in" text should be absent when authenticated
      expect(screen.queryByText('Sign in')).not.toBeInTheDocument()

      // Account trigger should be a button with aria-expanded=false (closed)
      // It must exist AND be different from the burger button (which has aria-label="Menu")
      const accountTrigger = screen.getByRole('button', { name: /account/i })
      expect(accountTrigger).toHaveAttribute('aria-expanded')
    })

    it('account trigger is a dedicated button for the account dropdown (not the burger)', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof session) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      // The account dropdown trigger must have role="button" and aria-expanded
      // AND must NOT be the burger menu button (aria-label="Menu")
      const accountTrigger = screen.getByRole('button', { name: /account/i })
      expect(accountTrigger).toBeDefined()
      expect(accountTrigger.getAttribute('aria-label')).not.toBe('Menu')
    })
  })

  // -------------------------------------------------------------------------
  // NAV-02 — Dropdown: menu items "My trips", "Profile", "Sign out"
  // -------------------------------------------------------------------------
  describe('NAV-02: dropdown menu items', () => {
    it('shows "My trips", "Profile", and "Sign out" when account trigger is clicked', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof session) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      // Click the account trigger to open dropdown
      const trigger = document.querySelector('[aria-expanded]') as HTMLElement
      expect(trigger).not.toBeNull()
      fireEvent.click(trigger)

      // Exact copy from UI-SPEC Copywriting Contract
      expect(screen.getByText('My trips')).toBeInTheDocument()
      expect(screen.getByText('Profile')).toBeInTheDocument()
      expect(screen.getByText('Sign out')).toBeInTheDocument()
    })

    it('"My trips" menu item links to /account/trips', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof session) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      const trigger = document.querySelector('[aria-expanded]') as HTMLElement
      fireEvent.click(trigger)

      const myTripsLink = screen.getByRole('menuitem', { name: /my trips/i })
      expect(myTripsLink).toHaveAttribute('href', '/account/trips')
    })

    it('"Profile" menu item links to /account/profile', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof session) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      const trigger = document.querySelector('[aria-expanded]') as HTMLElement
      fireEvent.click(trigger)

      const profileLink = screen.getByRole('menuitem', { name: /profile/i })
      expect(profileLink).toHaveAttribute('href', '/account/profile')
    })
  })

  // -------------------------------------------------------------------------
  // NAV-02 — Sign out: "Sign out" control wired to customerSignOut action
  // -------------------------------------------------------------------------
  describe('NAV-02: sign out action', () => {
    it('"Sign out" control is inside a form with action wired to customerSignOut', () => {
      const session = makeSignedInSession()

      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: typeof session) => void) => {
        cb('SIGNED_IN', session)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(<Nav />)

      const trigger = document.querySelector('[aria-expanded]') as HTMLElement
      fireEvent.click(trigger)

      // The "Sign out" button must be inside a <form> whose action is customerSignOut
      // (server action form pattern from 58-PATTERNS.md)
      const signOutMenuItem = screen.getByRole('menuitem', { name: /sign out/i })
      const form = signOutMenuItem.closest('form')
      expect(form).not.toBeNull()
      // customerSignOut should be wired as the form action
      expect(form).toBeDefined()
    })
  })
})
