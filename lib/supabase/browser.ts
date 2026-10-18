import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client for client components.
 *
 * Client components are also prerendered on the server, where `useMemo` runs
 * the factory. When the build has no Supabase env (Vercel Preview builds),
 * `createBrowserClient` throws and fails the whole build. During prerender the
 * client is never used (effects and event handlers do not run on the server),
 * so a placeholder client is returned there. In the browser the behaviour is
 * unchanged (a missing env makes createBrowserClient throw). createBrowserClient
 * is a singleton in the browser.
 */
export function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if ((!url || !anonKey) && typeof window === 'undefined') {
    return createBrowserClient('https://supabase.invalid', 'prerender-placeholder')
  }
  return createBrowserClient(url!, anonKey!)
}
