/**
 * reset-password-locale.test.tsx — Phase 75, Plan 16 (D-07).
 *
 * app/[locale]/account/reset-password/page.tsx:
 *   - update() error is mapped through authErrorKey() and rendered via the
 *     Errors.auth catalog namespace — never the raw GoTrue error.message.
 *   - on success, navigation uses @/i18n/routing's useRouter (locale-aware),
 *     never a hand-rolled path or next/navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import arMessagesRaw from '@/messages/ar.json'

const arMessages = arMessagesRaw as unknown as AbstractIntlMessages

const { mockPush, mockGetUser, mockOnAuthStateChange, mockUpdateUser } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
      updateUser: mockUpdateUser,
    },
  })),
}))

vi.mock('@/components/Nav', () => ({ default: () => null }))

import ResetPasswordPage from '@/app/[locale]/account/reset-password/page'

beforeEach(() => {
  vi.clearAllMocks()
  // A present recovery session — the form renders immediately (skips the
  // 'checking'/'absent' branches, which are unrelated to this plan's scope).
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('D-07: reset-password page maps the update() error via authErrorKey, never raw GoTrue text', () => {
  it('AuthError code "weak_password" under ar -> shows the ar Errors.auth.weakPassword message', async () => {
    mockUpdateUser.mockResolvedValue({
      error: { code: 'weak_password', message: 'Password should be at least 6 characters.' },
    })

    render(<ResetPasswordPage />, { locale: 'ar', messages: arMessages })

    const passwordInput = await waitFor(() => {
      const el = document.querySelector('#new-password')
      if (!el) throw new Error('password input not yet rendered')
      return el as HTMLInputElement
    })
    fireEvent.change(passwordInput, { target: { value: 'weakpw12' } })
    const form = passwordInput.closest('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    const expected = (arMessagesRaw as { Errors: { auth: { weakPassword: string } } }).Errors.auth.weakPassword
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Password should be at least 6 characters.')).toBeNull()
  })

  it('unknown/missing AuthError code under ar -> falls back to the ar Errors.auth.generic message', async () => {
    mockUpdateUser.mockResolvedValue({
      error: { code: undefined, message: 'Some raw GoTrue text.' },
    })

    render(<ResetPasswordPage />, { locale: 'ar', messages: arMessages })

    const passwordInput = await waitFor(() => {
      const el = document.querySelector('#new-password')
      if (!el) throw new Error('password input not yet rendered')
      return el as HTMLInputElement
    })
    fireEvent.change(passwordInput, { target: { value: 'weakpw12' } })
    const form = passwordInput.closest('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    const expected = (arMessagesRaw as { Errors: { auth: { generic: string } } }).Errors.auth.generic
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Some raw GoTrue text.')).toBeNull()
  })
})

describe('D-07: reset-password success navigation uses the locale-aware router', () => {
  it('success -> router.push("/account") via @/i18n/routing useRouter (locale-aware, resolves to /ar/account)', async () => {
    mockUpdateUser.mockResolvedValue({ error: null })

    render(<ResetPasswordPage />, { locale: 'ar', messages: arMessages })

    const passwordInput = await waitFor(() => {
      const el = document.querySelector('#new-password')
      if (!el) throw new Error('password input not yet rendered')
      return el as HTMLInputElement
    })
    fireEvent.change(passwordInput, { target: { value: 'strongpw123' } })
    const form = passwordInput.closest('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    // Real setTimeout(1500ms) fires before router.push('/account') — wait for
    // the real delay rather than faking timers (avoids a waitFor/timer deadlock).
    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/account')
      },
      { timeout: 3000 }
    )
  })
})
