'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function signIn(prevState: { error: string } | null, formData: FormData) {
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  // fail-closed: if the distributed limiter (Upstash) is unavailable, deny
  // the login rather than fall back to an in-memory per-instance counter
  // that would open a cross-instance brute-force window on Vercel.
  const rl = await checkRateLimit('/admin/login', ip, { failClosed: true })
  if (!rl.allowed) {
    if (rl.degraded) {
      console.error('[admin/login] rate limiter degraded — denying login', { ip })
      return { error: 'Login is temporarily unavailable. Please try again shortly.' }
    }
    return { error: 'Too many login attempts. Please try again in a minute.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: 'Invalid email or password.' }
  }

  redirect('/admin')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/admin/login')
}
