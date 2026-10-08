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
import { screen, fireEvent, waitFor } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import ruMessagesRaw from '@/messages/ru.json'

const ruMessages = ruMessagesRaw as unknown as AbstractIntlMessages

// ---------------------------------------------------------------------------
// vi.hoisted: mock setup runs before any import factories
// ---------------------------------------------------------------------------
const { mockGetUser, mockSignInWithOtp, mockSignUp } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockSignUp: vi.fn(),
}))

// Mock the Supabase browser client — Step3Auth calls getUser() on mount.
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: mockSignUp,
    },
  })),
}))

// Stub OAuthButtons (has its own client wiring) — irrelevant to this smoke test.
vi.mock('@/components/auth/OAuthButtons', () => ({
  __esModule: true,
  default: () => null,
}))

import Step3Auth from '@/components/booking/steps/Step3Auth'

// Sign-in forms live in a modal opened by the second button (aria-haspopup="dialog").
function openLogin() {
  fireEvent.click(document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement)
}

describe('Step3Auth — in-wizard auth (Auth.inWizard) smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No signed-in user → component stays on the main auth form.
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null })
  })

  it('renders inside a next-intl provider and shows an Auth.inWizard label', () => {
    render(<Step3Auth />)
    // "Continue as guest" is an Auth.inWizard-only label (t('continueAsGuest')).
    expect(screen.getByText('Continue as guest')).toBeInTheDocument()
  })

  it('shows only guest + sign-in on the step; sign-in opens a modal that closes on ×', () => {
    render(<Step3Auth />)
    expect(document.querySelector('#otp-email')).toBeNull()
    openLogin()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.querySelector('#otp-email')).not.toBeNull()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('D-07: Step3Auth magic-link return-to keeps the site locale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null })
  })

  it('locale "ru" -> signInWithOtp emailRedirectTo return-to is /ru/book', async () => {
    render(<Step3Auth />, { locale: 'ru', messages: ruMessages })
    openLogin()

    const emailInput = document.querySelector('#otp-email') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    const form = emailInput.closest('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledTimes(1))
    const callArg = mockSignInWithOtp.mock.calls[0][0]
    const redirectUrl = new URL(callArg.options.emailRedirectTo)
    expect(redirectUrl.pathname).toBe('/auth/callback')
    expect(redirectUrl.searchParams.get('return-to')).toBe('/ru/book')
  })

  it('locale "en" -> signInWithOtp emailRedirectTo return-to is /book (no locale prefix)', async () => {
    render(<Step3Auth />, { locale: 'en' })
    openLogin()

    const emailInput = document.querySelector('#otp-email') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    const form = emailInput.closest('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledTimes(1))
    const callArg = mockSignInWithOtp.mock.calls[0][0]
    const redirectUrl = new URL(callArg.options.emailRedirectTo)
    expect(redirectUrl.searchParams.get('return-to')).toBe('/book')
  })
})

describe('D-07: Step3Auth register error is translated via authErrorKey, never the raw GoTrue text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null })
  })

  it('AuthError code "weak_password" under ru -> shows the ru Errors.auth.weakPassword message, not the English GoTrue text', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: { code: 'weak_password', message: 'Password should be at least 6 characters.' },
    })

    render(<Step3Auth />, { locale: 'ru', messages: ruMessages })
    openLogin()

    // Switch to the "Create account" tab (only occurrence before the form renders).
    fireEvent.click(screen.getByText('Создать учётную запись'))

    const emailInput = document.querySelector('#reg-email') as HTMLInputElement
    const passwordInput = document.querySelector('#reg-password') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: '123' } })

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement
    fireEvent.click(submitButton)

    const expected = (ruMessagesRaw as { Errors: { auth: { weakPassword: string } } }).Errors.auth.weakPassword
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Password should be at least 6 characters.')).toBeNull()
  })
})
