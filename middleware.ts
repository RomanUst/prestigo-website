import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Public endpoints that mutate state — require Origin validation to prevent CSRF
const CSRF_PROTECTED_PREFIXES = [
  '/api/admin',
  '/api/submit-quote',
  '/api/contact',
  '/api/create-payment-intent',
  '/api/calculate-price',
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
 * Build a per-request Content-Security-Policy header.
 *
 * script-src uses a nonce + strict-dynamic instead of unsafe-inline:
 *   - 'nonce-{nonce}': only script elements with this exact nonce attribute execute.
 *   - 'strict-dynamic': scripts loaded by a nonce-bearing script inherit trust,
 *     which allows GTM's dynamically injected tags without needing unsafe-inline.
 *   - https: http: are CSP Level 1 fallbacks for browsers that predate
 *     strict-dynamic (Safari <15.4, IE — negligible production share in 2026).
 *
 * style-src keeps unsafe-inline: inline styles are far lower risk (no code
 * execution), and removing it would require auditing every Tailwind/Stripe
 * element — not worth the disruption now.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // unsafe-eval is needed by React dev tools for stack-trace reconstruction.
    // It is intentionally excluded from production builds.
    process.env.NODE_ENV === 'development'
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https: http:`
      : `script-src 'nonce-${nonce}' 'strict-dynamic' https: http:`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // GA4 Enhanced Measurement may load tracking pixels from google-analytics.com
    "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.google-analytics.com https://*.googletagmanager.com",
    "font-src 'self' https://fonts.gstatic.com",
    // places.googleapis.com: Places API (New) REST endpoint (AddressInputNew);
    // maps.googleapis.com: legacy JS SDK path.
    "connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com https://places.googleapis.com",
    "report-uri /api/csp-report",
  ].join('; ')
}

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

  // Generate a cryptographically random nonce per request.
  // btoa + randomUUID works in the Edge runtime (no Buffer/Node.js required).
  const nonce = btoa(crypto.randomUUID())

  // Forward nonce to server components via request header so layout.tsx can
  // read it with headers() and pass it to <Script nonce={nonce}> components.
  const reqHeaders = new Headers(request.headers)
  reqHeaders.set('x-nonce', nonce)

  const response = await updateSession(request, reqHeaders)
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
