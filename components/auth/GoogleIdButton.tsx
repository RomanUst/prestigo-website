'use client'

// Google Identity Services (GIS) sign-in.
//
// The Google account chooser is opened from rideprestigo.com itself (popup /
// One Tap), so it reads "to continue to rideprestigo.com" instead of the
// Supabase project domain the redirect flow shows. Google returns an ID token,
// which Supabase verifies via signInWithIdToken — no /auth/callback round-trip.
//
// If GIS can't load (blocked script, missing client ID, origin not registered
// in Google Cloud), the caller's `fallback` (the classic redirect button) is
// rendered instead, so sign-in never disappears.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale } from 'next-intl'
import type { SupabaseClient } from '@supabase/supabase-js'

// Public OAuth web client ID (the same one Supabase's Google provider uses).
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  '430231326806-po1japlsbjkjlegk7kg2hs8hduo4nt9q.apps.googleusercontent.com'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const LOAD_TIMEOUT_MS = 6000

interface GsiCredentialResponse { credential: string }
interface GsiId {
  initialize(config: Record<string, unknown>): void
  renderButton(el: HTMLElement, options: Record<string, unknown>): void
  prompt(): void
  cancel(): void
}
declare global {
  interface Window { google?: { accounts: { id: GsiId } } }
}

let gsiPromise: Promise<GsiId> | null = null

function loadGsi(): Promise<GsiId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise<GsiId>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('gsi timeout')), LOAD_TIMEOUT_MS)
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => {
      window.clearTimeout(timer)
      if (window.google?.accounts?.id) resolve(window.google.accounts.id)
      else reject(new Error('gsi missing'))
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('gsi load error'))
    }
    document.head.appendChild(script)
  }).catch(err => {
    gsiPromise = null
    throw err
  })
  return gsiPromise
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

interface GoogleIdButtonProps {
  supabase: SupabaseClient
  onSignedIn: () => void
  fallback: ReactNode
  /** Also show the One Tap prompt in the corner. */
  oneTap?: boolean
  theme?: 'outline' | 'filled_black'
}

export default function GoogleIdButton({ supabase, onSignedIn, fallback, oneTap = false, theme = 'outline' }: GoogleIdButtonProps) {
  const locale = useLocale()
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState(false)
  // Latest callback without re-initialising GIS on every parent render.
  const onSignedInRef = useRef(onSignedIn)
  useEffect(() => { onSignedInRef.current = onSignedIn }, [onSignedIn])

  useEffect(() => {
    let cancelled = false
    let gsi: GsiId | null = null

    ;(async () => {
      try {
        const rawNonce = randomNonce()
        const [id, hashedNonce] = await Promise.all([loadGsi(), sha256Hex(rawNonce)])
        if (cancelled || !containerRef.current) return
        gsi = id

        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashedNonce,
          context: 'continue',
          ux_mode: 'popup',
          itp_support: true,
          use_fedcm_for_prompt: true,
          cancel_on_tap_outside: true,
          callback: async (resp: GsiCredentialResponse) => {
            setError(false)
            const { data, error: signInError } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: resp.credential,
              nonce: rawNonce,
            })
            if (signInError || !data.user) {
              console.error('Google sign-in failed:', signInError?.message)
              setError(true)
              return
            }
            // Mirror /auth/callback: make sure a customer profile row exists.
            await supabase.from('customer_profiles').upsert(
              { user_id: data.user.id, account_type: 'personal', company_name: null },
              { onConflict: 'user_id', ignoreDuplicates: true }
            )
            window.gtag?.('event', 'login', { method: 'google' })
            onSignedInRef.current()
          },
        })

        const width = Math.min(400, Math.max(200, Math.floor(containerRef.current.clientWidth)))
        id.renderButton(containerRef.current, {
          type: 'standard',
          theme,
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width,
          locale,
        })
        if (oneTap) id.prompt()
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      gsi?.cancel()
    }
  }, [supabase, oneTap, theme, locale])

  if (failed) return <>{fallback}</>

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', minHeight: 44, display: 'flex', justifyContent: 'center' }} />
      {error && <div style={{ marginTop: 8 }}>{fallback}</div>}
    </div>
  )
}
