import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * CSRF protection for admin mutation endpoints via Origin header validation.
 *
 * How it works:
 * - Browsers always include the `Origin` header on cross-origin requests.
 * - If the Origin is present but doesn't match an allowed origin → 403.
 * - If Origin is absent (server-to-server, curl) → allow through (not a browser CSRF vector).
 * - Combined with Supabase SSR's SameSite=Lax cookies, this gives defence-in-depth.
 */
function checkAdminCsrf(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/api/admin')) return null
  if (!MUTATION_METHODS.has(request.method)) return null

  const origin = request.headers.get('origin')
  if (!origin) return null // no Origin header → server-to-server, not a browser CSRF attack

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  const allowedOrigins = new Set(
    [siteUrl, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)
  )

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

export async function middleware(request: NextRequest) {
  const csrfError = checkAdminCsrf(request)
  if (csrfError) return csrfError
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
