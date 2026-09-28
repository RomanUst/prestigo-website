import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readEnv } from '@/lib/env'
import { buildWidgetConfig } from '@/lib/chatwoot-identity'

// Fetched only after the visitor clicks "Chat on site" (never on page render).
// No request parameter is accepted at all — identity is always derived from
// the Supabase session, never from a query string or request body.
export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = readEnv('CHATWOOT_BASE_URL')
  const websiteToken = readEnv('CHATWOOT_WEBSITE_TOKEN')
  const hmacSecret = readEnv('CHATWOOT_WIDGET_HMAC_SECRET')

  let user: { id: string; email?: string | null } | null = null
  let profile: { full_name: string | null; phone: string | null } | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()

    if (data?.user) {
      user = { id: data.user.id, email: data.user.email }

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('customer_profiles')
          .select('full_name, phone')
          .eq('user_id', data.user.id)
          .maybeSingle()
        profile = profileError ? null : (profileData ?? null)
      } catch {
        // A profile read failure never blocks the widget — anonymous identity fields only.
        profile = null
      }
    }
  } catch {
    // Any Supabase failure yields the anonymous shape — the widget still loads.
    user = null
    profile = null
  }

  const config = buildWidgetConfig({ baseUrl, websiteToken, hmacSecret, user, profile })

  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
