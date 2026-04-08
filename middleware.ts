import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Public endpoints that mutate state — require Origin validation to prevent CSRF
const CSRF_PROTECTED_PREFIXES = [
  '/api/admin',
  '/api/submit-quote',
  '/api/contact',
  '/api/create-payment-intent',
]

/**
 * CSRF protection via Origin header validation for all mutation endpoints.
 *
 * How it works:
 * - Browsers always include the `Origin` header on cross-origin requests.
 * - If the Origin is present but doesn't match an allowed origin → 403.
 * - If Origin is absent (server-to-server, curl) → allow through (not a browser CSRF vector).
 * - Combined with Supabase SSR's SameSite=Lax cookies, this gives defence-in-depth.
 */
function checkCsrf(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  const isCsrfProtected = CSRF_PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  if (!isCsrfProtected) return null
  if (!MUTATION_METHODS.has(request.method)) return null

  const origin = request.headers.get('origin')
  if (!origin) return null // no Origin header → server-to-server, not a browser CSRF attack

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  // Derive allowed origin from the Host header + forwarded protocol as a
  // reliable fallback that works on Vercel even without NEXT_PUBLIC_SITE_URL.
  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? 'https'
  const hostOrigin = host ? `${proto}://${host}` : null

  const allowedOrigins = new Set(
    [siteUrl, hostOrigin, request.nextUrl.origin, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)
  )

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

export async function middleware(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
