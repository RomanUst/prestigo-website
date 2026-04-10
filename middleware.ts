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

// Subset of CSRF_PROTECTED_PREFIXES where a missing Origin header is also
// rejected. These are paths an attacker could attempt to reach from a
// non-browser or proxy context that strips Origin. We accept a small amount
// of false-positive risk (curl/Postman users) in exchange for closing the
// no-Origin bypass — /api/webhooks/stripe is NOT in this list because Stripe
// is explicitly a server-to-server caller.
const CSRF_STRICT_ORIGIN_REQUIRED = [
  '/api/admin',
  '/api/create-payment-intent',
]

/**
 * CSRF protection via Origin header validation for all mutation endpoints.
 *
 * How it works:
 * - Browsers always include the `Origin` header on cross-origin mutations.
 * - If the Origin is present but doesn't match an allowed origin → 403.
 * - For sensitive paths (CSRF_STRICT_ORIGIN_REQUIRED) a missing Origin is ALSO 403.
 * - For less-sensitive mutation paths, a missing Origin is allowed through
 *   (some legitimate non-browser callers may need this) — but those paths
 *   still rely on auth + rate limiting for defense.
 * - Combined with Supabase SSR's SameSite=Lax cookies, this gives defence-in-depth.
 */
function checkCsrf(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  const isCsrfProtected = CSRF_PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  if (!isCsrfProtected) return null
  if (!MUTATION_METHODS.has(request.method)) return null

  const origin = request.headers.get('origin')
  const strict = CSRF_STRICT_ORIGIN_REQUIRED.some(p => pathname.startsWith(p))

  if (!origin) {
    if (strict) {
      return NextResponse.json({ error: 'Origin header required' }, { status: 403 })
    }
    return null // no Origin header → server-to-server, not a browser CSRF attack
  }

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
