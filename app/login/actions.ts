'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { safeReturnTo } from '@/app/login/auth-helpers'

// Note: safeReturnTo and buildOAuthOptions are pure (synchronous) helpers and
// live in ./auth-helpers — a 'use server' module may only export async
// functions, and re-exporting them here would re-trigger that constraint.
// Import auth-helpers directly where you need them.

// ---------------------------------------------------------------------------
// Helper: IP extraction
// ---------------------------------------------------------------------------

async function getIp(): Promise<string> {
  try {
    const headersList = await headers()
    return (
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      'unknown'
    )
  } catch {
    // Thrown outside request scope (e.g. in test environment)
    return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// AUTH-01: sendMagicLink
// ---------------------------------------------------------------------------

export async function sendMagicLink(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const ip = await getIp()
  const rl = await checkRateLimit('/login', ip, { failClosed: false })
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again in a minute.' }
  }

  const email = formData.get('email') as string
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Something went wrong. Please try again.' }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// AUTH-01: signInWithPassword
// ---------------------------------------------------------------------------

export async function signInWithPassword(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const ip = await getIp()
  // Auth-critical: password sign-in is the credential brute-force surface, so
  // it fails CLOSED on an Upstash outage (matching /admin/login). The
  // passwordless flows below (magic link, signup, password-reset) stay
  // fail-open since they expose no guessable secret to brute force.
  const rl = await checkRateLimit('/login', ip, { failClosed: true })
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again in a minute.' }
  }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const returnTo = safeReturnTo(formData.get('return-to') as string | null)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Invalid email or password.' }
  }

  redirect(returnTo)
}

// ---------------------------------------------------------------------------
// AUTH-04: signUpWithPassword
// ---------------------------------------------------------------------------

export async function signUpWithPassword(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const ip = await getIp()
  const rl = await checkRateLimit('/login', ip, { failClosed: false })
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again in a minute.' }
  }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const account_type = (formData.get('account_type') as string) || 'personal'
  const company_name = (formData.get('company_name') as string) || null
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: { account_type, company_name },
    },
  })

  if (error) {
    return { error: 'Something went wrong. Please try again.' }
  }

  // Upsert profile whenever a user row was created. This signup path is the
  // authoritative writer of account_type/company_name because the user just
  // supplied them on the form. In production with email confirmation,
  // data.session may be null here — a create-if-missing upsert also fires in
  // /auth/callback when the user confirms, but that path intentionally does NOT
  // reconcile metadata (see upsertProfile's ignoreDuplicates note) so it can't
  // clobber these values with OAuth defaults.
  if (data.user) {
    await supabase
      .from('customer_profiles')
      .upsert(
        { user_id: data.user.id, account_type, company_name },
        { onConflict: 'user_id' }
      )
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// D-02: sendPasswordReset
// ---------------------------------------------------------------------------

export async function sendPasswordReset(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const ip = await getIp()
  const rl = await checkRateLimit('/login', ip, { failClosed: false })
  if (!rl.allowed) {
    // Same generic success response as below to avoid leaking rate-limit state
    // for enumeration; the email simply isn't sent when throttled.
    return { success: true }
  }

  const email = formData.get('email') as string
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const supabase = await createClient()
  // Intentionally ignore errors to prevent email enumeration (T-57-10)
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?type=recovery`,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// AUTH-07: customerSignOut
// ---------------------------------------------------------------------------

export async function customerSignOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  try {
    revalidatePath('/', 'layout')
  } catch {
    // revalidatePath throws outside Next.js request scope (e.g. in tests)
  }
  redirect('/')
}

// ---------------------------------------------------------------------------
// ACCT-04: saveBookingWithUserId — links a booking to the CURRENT user
// ---------------------------------------------------------------------------

/**
 * Insert a booking row linked to the authenticated user.
 *
 * Ownership is NEVER trusted from the caller: any `user_id` present in
 * `bookingRow` is stripped and replaced with the id derived from the active
 * server session (`getUser()`). bookings has no customer-facing RLS yet
 * (deferred to Phase 60), so this server-side derivation is the only thing
 * preventing a caller from linking a booking to another user's id.
 *
 * Returns `{ error }` on failure (no session, or insert error) so callers can
 * react instead of silently dropping the write.
 */
export async function saveBookingWithUserId(
  bookingRow: Record<string, unknown>
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated.' }
  }

  // Strip any caller-supplied user_id; ownership comes from the session only.
  const { user_id: _ignored, ...rest } = bookingRow
  void _ignored

  const { error } = await supabase
    .from('bookings')
    .insert({ ...rest, user_id: user.id })

  if (error) {
    return { error: 'Could not save booking.' }
  }

  return {}
}
