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
  '/api/driver/respond',
  '/api/driver/trip',
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
 * Build a per-request Content-Security-Policy header for dynamic routes.
 *
 * script-src uses a nonce + strict-dynamic instead of unsafe-inline:
 *   - 'nonce-{nonce}': only script elements with this exact nonce attribute execute.
 *   - 'strict-dynamic': scripts loaded by a nonce-bearing script inherit trust,
 *     which allows GTM's dynamically injected tags without needing unsafe-inline.
 *   - https: is a CSP Level 1 fallback for browsers that predate strict-dynamic
 *     (Safari <15.4 — effectively extinct in 2026). http: is intentionally NOT
 *     listed so mixed-content scripts cannot be injected even on legacy browsers.
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
    // 'self' is added in development only: Next.js dev serves chunks over
    // http://localhost, which the https: fallback source can't match. Modern
    // browsers ignore host/scheme sources once 'strict-dynamic' is present
    // (they trust only the nonce chain), so this has no effect in production.
    process.env.NODE_ENV === 'development'
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'self' https:`
      : `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // GA4 Enhanced Measurement may load tracking pixels from google-analytics.com.
    // Meta Pixel fires image beacons to www.facebook.com/tr/ and privacy_sandbox endpoints.
    "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com https://*.clarity.ms",
    "font-src 'self' https://fonts.gstatic.com",
    // places.googleapis.com: Places API (New) REST endpoint (AddressInputNew);
    // maps.googleapis.com: legacy JS SDK path.
    // www.facebook.com: Meta Pixel event API and fbevents.js XHR calls.
    "connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com https://places.googleapis.com https://www.facebook.com https://*.clarity.ms https://accounts.google.com https://appleid.apple.com",
    "form-action 'self' https://accounts.google.com https://appleid.apple.com",
    "report-uri /api/csp-report",
  ].join('; ')
}

/**
 * CSP for static/edge-cached routes (marketing pages).
 *
 * Nonce-based CSP is incompatible with edge caching: the nonce in the cached
 * HTML would be stale relative to the per-request nonce injected by middleware,
 * causing browsers to block the Next.js runtime chunks. These pages contain no
 * user-supplied content, so unsafe-inline is an acceptable trade-off.
 */
function buildCspStatic(): string {
  return [
    "default-src 'self'",
    // 'self' is added in development only: Next.js dev serves chunks over
    // http://localhost, which the https: scheme-source can't match, leaving
    // script-src-elem with nothing to allow external chunk <script> tags and
    // breaking hydration entirely in local dev. Production is unaffected.
    process.env.NODE_ENV === 'development'
      ? "script-src 'unsafe-inline' 'unsafe-eval' 'self' https:"
      : "script-src 'unsafe-inline' https:",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com https://*.clarity.ms",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com https://places.googleapis.com https://www.facebook.com https://*.clarity.ms https://accounts.google.com https://appleid.apple.com",
    "form-action 'self' https://accounts.google.com https://appleid.apple.com",
    "report-uri /api/csp-report",
  ].join('; ')
}

/**
 * Routes that require per-request dynamic rendering (auth, booking, API).
 * Everything else is a static marketing page served from the edge cache.
 */
function isDynamicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/book') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/auth')
  )
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

  const { pathname } = request.nextUrl

  if (isDynamicPath(pathname)) {
    // CSP strategy by area:
    //
    // - /admin and /driver are authed internal areas that serve NO third-party
    //   analytics, so they keep a strict per-request nonce CSP. Next.js reads
    //   the nonce from the Content-Security-Policy *request* header and
    //   auto-applies it to its framework scripts, so the app runs while inline
    //   analytics (which we don't want there) stay blocked.
    //
    // - /book and /api use the same unsafe-inline CSP as the marketing pages.
    //   The global analytics <Script> tags live in the ROOT layout and render
    //   on /book too; a per-request nonce can't reach them without a headers()
    //   read in the root layout, which would re-break static rendering + edge
    //   caching for the whole site. /book is conversion-critical (GA/Meta must
    //   fire) and its payment UI runs inside a Stripe iframe, so unsafe-inline
    //   here matches the rest of the public site's posture. A strict CSP for
    //   /book would require splitting analytics into a route-group layout.
    const useNonceCsp =
      pathname.startsWith('/admin') || pathname.startsWith('/driver')
    const nonce = useNonceCsp ? btoa(crypto.randomUUID()) : null
    const csp = nonce ? buildCsp(nonce) : buildCspStatic()
    const reqHeaders = new Headers(request.headers)
    if (nonce) {
      // Next extracts the nonce from this header and applies it to its scripts.
      reqHeaders.set('Content-Security-Policy', csp)
      reqHeaders.set('x-nonce', nonce)
    }
    try {
      const response = await updateSession(request, reqHeaders)
      response.headers.set('Content-Security-Policy', csp)
      return response
    } catch {
      // Supabase not configured (local dev without .env) — fall through without auth
      const response = NextResponse.next({ request: { headers: reqHeaders } })
      response.headers.set('Content-Security-Policy', csp)
      return response
    }
  } else {
    // Static/cacheable marketing routes: skip Supabase auth roundtrip entirely.
    // No page under this branch reads user session, so getUser() on every
    // request only adds ~500-1000ms of TTFB. Only set the CSP header.
    const response = NextResponse.next({ request: { headers: request.headers } })
    response.headers.set('Content-Security-Policy', buildCspStatic())
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
