import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeReturnTo } from '@/app/login/auth-helpers'

// ---------------------------------------------------------------------------
// Profile upsert helper
// ---------------------------------------------------------------------------

// Create-if-missing only (WR-04): `ignoreDuplicates: true` compiles to
// INSERT ... ON CONFLICT DO NOTHING. This is intentional, NOT a missed
// reconciliation. OAuth providers (Google/Apple) don't carry our
// account_type/company_name in user_metadata, so reconciling on every sign-in
// would overwrite a corporate profile — set during email signup — with the
// 'personal'/null defaults below. The email-signup action remains the
// authoritative writer of those fields; this callback only backfills a profile
// row when one doesn't exist yet.
async function upsertProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> }
): Promise<void> {
  await supabase.from('customer_profiles').upsert(
    {
      user_id: user.id,
      account_type:
        (user.user_metadata?.account_type as string | undefined) ?? 'personal',
      company_name:
        (user.user_metadata?.company_name as string | undefined) ?? null,
    },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
}

// ---------------------------------------------------------------------------
// GET /auth/callback
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const returnTo = safeReturnTo(searchParams.get('return-to'))

  const errorRedirect = NextResponse.redirect(
    `${origin}/login?error=auth_callback_error`,
    { status: 302 }
  )

  const supabase = await createClient()

  // ── Path 1: OAuth code exchange ──────────────────────────────────────────
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await upsertProfile(supabase, data.user)
      return NextResponse.redirect(`${origin}${returnTo}`, { status: 302 })
    }

    return errorRedirect
  }

  // ── Path 2: Email OTP / magic-link / email confirmation (token_hash) ────
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error && data.user) {
      // Password recovery flow → send to reset-password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/account/reset-password`, { status: 302 })
      }

      await upsertProfile(supabase, data.user)
      return NextResponse.redirect(`${origin}${returnTo}`, { status: 302 })
    }

    return errorRedirect
  }

  // ── Path 3: No code and no token_hash ───────────────────────────────────
  return errorRedirect
}
