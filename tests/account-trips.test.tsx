/**
 * account-trips.test.tsx — Wave-0 test scaffold
 * Phase 58 — Sign-in UI + Account Dashboard
 *
 * Covers: ACCT-01
 *
 * NOTE: This file is intentionally RED (failing) until Plan 04 creates
 * app/account/trips/page.tsx. The module import itself will fail at this
 * stage — that is the intended RED result.
 *
 * 75-15 (D-04) additions: the page now resolves the request locale via
 * getLocale() and, when unauthenticated, redirects via next-intl's
 * localized `redirect()` (from @/i18n/routing) to the visitor's own
 * locale's /login with a `return-to` (not the legacy `next`) pointing back
 * at the localized /account/trips — proven with `redirect` mocked (it
 * throws in production to halt rendering; the mock lets the assertion run)
 * and the REAL `getPathname` (via importOriginal, pure/deterministic, no
 * mocking needed — see tests/localized-href.test.ts precedent).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import enMessages from '../messages/en.json'

// Minimal shape of the single arg next-intl's redirect() receives here —
// typed explicitly so mockRedirect.mock.calls[0][0] isn't inferred as the
// empty tuple `[]` (which would make any destructure/index access a type
// error).
type MockRedirectArgs = {
  href: { pathname: string; query?: Record<string, string> }
  locale: string
}

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockRedirect,
  mockLocaleRef,
} = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    // Real next-intl redirect() throws to halt rendering immediately — the
    // mock must do the same (a plain no-op vi.fn() would fall through to
    // `user.id` below the redirect call with `user` still null). The test
    // inspects mockRedirect.mock.calls after catching this marker error.
    mockRedirect: vi.fn((_args: MockRedirectArgs) => {
      throw new Error('NEXT_REDIRECT_MOCK')
    }),
    // getLocale()/getTranslations() resolve against this per-test-mutable
    // ref (see next-intl/config mock below) — plain object so tests can
    // reassign `.value` without re-registering the mock factory.
    mockLocaleRef: { value: 'en' },
  }
})

// ---------------------------------------------------------------------------
// next-intl/server: force the real react-server build (Phase 70, Pattern C).
//
// The trips page is a Server Component that now calls
// `await getTranslations('Account.trips')` + `getTranslations('Booking.vehicleClasses')`.
// Vitest has no RSC "react-server" export condition, so the plain
// `next-intl/server` specifier resolves to a client stub that throws. Redirect
// both `next-intl/server` and `next-intl/config` (aliased to i18n/request.ts by
// createNextIntlPlugin in the real build) to the real react-server impl + the
// real messages/en.json so getTranslations resolves against the live catalog.
//
// `locale` reads mockLocaleRef.value at CALL time — proven safe (no stale
// memoization across tests) because React's `cache()` wrapper around
// next-intl's getConfig()/getLocale() is a pass-through outside an actual
// React render/request lifecycle (75-15 login-actions.test.ts precedent).
// ---------------------------------------------------------------------------
vi.mock('next-intl/server', async () => {
  return await vi.importActual(
    '../node_modules/next-intl/dist/esm/development/server.react-server.js'
  )
})

vi.mock('next-intl/config', async () => {
  const { getRequestConfig } = await vi.importActual<typeof import('next-intl/server')>(
    '../node_modules/next-intl/dist/esm/development/server.react-server.js'
  )
  return {
    default: getRequestConfig(async () => ({
      locale: mockLocaleRef.value,
      messages: enMessages,
    })),
  }
})

// `redirect` throws in production (halts rendering) — mocked so the
// unauthenticated-branch tests can assert on its call args instead of
// catching a thrown NEXT_REDIRECT-style error. `getPathname` stays REAL
// (importOriginal) — it is pure/deterministic and needs no mocking, exactly
// like tests/localized-href.test.ts.
vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return { ...actual, redirect: mockRedirect }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
    // The trips page now queries bookings (added post-Phase-58): from('bookings')
    // .select().eq().order().limit(). Return an empty result so the ACCT-01
    // empty-state assertions hold.
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      return chain
    }),
  }),
}))

// Nav has its own dedicated test file (nav-auth.test.tsx); stub it here so this
// file stays focused on ACCT-01 page content and doesn't need to mock Nav's
// @supabase/ssr browser-client dependency.
vi.mock('@/components/Nav', () => ({
  default: () => null,
}))

// ---------------------------------------------------------------------------
// Import (does not exist yet — module resolution fails = RED)
// ---------------------------------------------------------------------------
import AccountTripsPage from '@/app/[locale]/account/trips/page'

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AccountTripsPage — empty state (ACCT-01)', () => {
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocaleRef.value = 'en'

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
    const PageElement = await AccountTripsPage()
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    // Exact copy from UI-SPEC Copywriting Contract
    expect(screen.getByText('No trips yet')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // ACCT-01: Empty state body text
  // -------------------------------------------------------------------------
  it('renders the empty state body text about booked transfers', async () => {
    const PageElement = await AccountTripsPage()
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
    const PageElement = await AccountTripsPage()
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    // Exact copy from UI-SPEC Copywriting Contract
    const bookLink = screen.getByRole('link', { name: /book a transfer/i })
    expect(bookLink).toHaveAttribute('href', '/book')
  })

  // -------------------------------------------------------------------------
  // 75-15 (D-04): locale "ru" — the "Book a transfer" CTA carries the
  // locale prefix (localizedHref(), not a bare next/link href).
  // -------------------------------------------------------------------------
  it('locale="ru" — "Book a transfer" CTA href is /ru/book (localizedHref, not next/link)', async () => {
    mockLocaleRef.value = 'ru'
    const PageElement = await AccountTripsPage()
    const { render, screen } = await import('@testing-library/react')
    render(PageElement)

    const bookLink = screen.getByRole('link', { name: /book a transfer/i })
    expect(bookLink).toHaveAttribute('href', '/ru/book')
  })
})

// ---------------------------------------------------------------------------
// 75-15 (D-04): unauthenticated redirect — localized login, return-to (not
// the legacy 'next' param the login page never reads).
// ---------------------------------------------------------------------------
describe('AccountTripsPage — unauthenticated redirect (D-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('locale="ru" — redirects via next-intl redirect() to localized /login with return-to=/ru/account/trips (not next=)', async () => {
    mockLocaleRef.value = 'ru'

    // redirect() throws (matching production halt-on-redirect semantics);
    // the call was still recorded before the throw.
    await expect(AccountTripsPage()).rejects.toThrow('NEXT_REDIRECT_MOCK')

    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const [args] = mockRedirect.mock.calls[0]
    expect(args.locale).toBe('ru')
    expect(args.href).toEqual({
      pathname: '/login',
      query: { 'return-to': '/ru/account/trips' },
    })
  })

  it('locale="en" — redirects to the unprefixed /login (regression backstop)', async () => {
    mockLocaleRef.value = 'en'

    await expect(AccountTripsPage()).rejects.toThrow('NEXT_REDIRECT_MOCK')

    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const [args] = mockRedirect.mock.calls[0]
    expect(args.locale).toBe('en')
    expect(args.href).toEqual({
      pathname: '/login',
      query: { 'return-to': '/account/trips' },
    })
  })
})
