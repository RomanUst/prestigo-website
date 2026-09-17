/**
 * Step3Auth.test.tsx — Phase 70 / 70-07
 *
 * Minimal renderWithIntl smoke test for the in-wizard sign-in/register UI
 * (Auth.inWizard). Proves Step3Auth renders inside a next-intl provider
 * without throwing and shows a known Auth.inWizard label. Supabase client
 * and OAuthButtons are mocked (vi.hoisted) — this test does NOT exercise the
 * Supabase auth flow, only that the externalized copy renders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}))

// Mock the Supabase browser client — Step3Auth calls getUser() on mount.
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  })),
}))

// Stub OAuthButtons (has its own client wiring) — irrelevant to this smoke test.
vi.mock('@/components/auth/OAuthButtons', () => ({
  __esModule: true,
  default: () => null,
}))

import Step3Auth from '@/components/booking/steps/Step3Auth'

describe('Step3Auth — in-wizard auth (Auth.inWizard) smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No signed-in user → component stays on the main auth form.
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('renders inside a next-intl provider and shows an Auth.inWizard label', () => {
    render(<Step3Auth />)
    // "Continue as guest" is an Auth.inWizard-only label (t('continueAsGuest')).
    expect(screen.getByText('Continue as guest')).toBeInTheDocument()
  })
})
