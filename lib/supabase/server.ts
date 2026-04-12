import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — writes fail silently.
            // Middleware (updateSession) handles the actual cookie persistence.
          }
        },
      },
    }
  )
}
