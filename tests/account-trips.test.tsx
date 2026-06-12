/**
 * account-trips.test.tsx — Wave-0 test scaffold
 * Phase 58 — Sign-in UI + Account Dashboard
 *
 * Covers: ACCT-01
 *
 * NOTE: This file is intentionally RED (failing) until Plan 04 creates
 * app/account/trips/page.tsx. The module import itself will fail at this
 * stage — that is the intended RED result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockGetUser,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  return { mockGetUser }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
    // Note: no `from` mock needed — Phase 58 trips page makes no DB query (D-01)
  }),
}))

// ---------------------------------------------------------------------------
// Import (does not exist yet — module resolution fails = RED)
// ---------------------------------------------------------------------------
import AccountTripsPage from '@/app/account/trips/page'

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AccountTripsPage — empty state (ACCT-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user (middleware guarantees auth inside /account/*)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-uuid',
          email: 'user@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    })
  })

  // -------------------------------------------------------------------------
  // ACCT-01: Empty state heading "No trips yet"
  // -------------------------------------------------------------------------
  it('renders the empty state heading "No trips yet"', async () => {
    // Render the async server component by awaiting the JSX tree
    const PageElement = await AccountTripsPage({})
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    // Exact copy from UI-SPEC Copywriting Contract
    expect(screen.getByText('No trips yet')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // ACCT-01: Empty state body text
  // -------------------------------------------------------------------------
  it('renders the empty state body text about booked transfers', async () => {
    const PageElement = await AccountTripsPage({})
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    // Exact copy from UI-SPEC Copywriting Contract
    expect(
      screen.getByText(/Your booked transfers will appear here/i)
    ).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // ACCT-01: "Book a transfer" CTA linking to /book
  // -------------------------------------------------------------------------
  it('renders a "Book a transfer" link with href="/book"', async () => {
    const PageElement = await AccountTripsPage({})
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    // Exact copy from UI-SPEC Copywriting Contract
    const bookLink = screen.getByRole('link', { name: /book a transfer/i })
    expect(bookLink).toHaveAttribute('href', '/book')
  })
})
