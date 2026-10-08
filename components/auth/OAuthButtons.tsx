'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import { createBrowserClient } from '@supabase/ssr'
import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { safeReturnTo } from '@/app/[locale]/login/auth-helpers'
import GoogleIdButton from './GoogleIdButton'

interface OAuthButtonsProps {
  returnTo?: string
  /** Called after an in-page Google sign-in. Default: navigate to returnTo. */
  onSignedIn?: () => void
  /** Show Google One Tap alongside the button. */
  oneTap?: boolean
  googleTheme?: 'outline' | 'filled_black'
}

// Google sign-in runs only through Google Identity Services (no Supabase
// redirect flow), so the Supabase domain is not an authorized domain of the
// Google OAuth client — a requirement for Google brand verification.
export default function OAuthButtons({ returnTo, onSignedIn, oneTap, googleTheme }: OAuthButtonsProps) {
  const locale = useLocale()
  // Memoize so the browser client isn't re-instantiated on every render.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  const afterGoogleSignIn =
    onSignedIn ??
    (() => window.location.assign(safeReturnTo(returnTo ?? null, getPathname({ locale: locale as AppLocale, href: '/account' }))))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <GoogleIdButton
        supabase={supabase}
        onSignedIn={afterGoogleSignIn}
        oneTap={oneTap}
        theme={googleTheme}
      />
    </div>
  )
}
