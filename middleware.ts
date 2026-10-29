import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { updateSession } from '@/lib/supabase/middleware'
import { routing, stripLocalePrefix } from '@/i18n/routing'

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Public endpoints that mutate state — require Origin validation to prevent CSRF
const CSRF_PROTECTED_PREFIXES = [
  '/api/admin',
  '/api/submit-quote',
  '/api/contact',
  '/api/corporate-contact',
  '/api/submit-multiday-quote',
  '/api/create-payment-intent',
  '/api/calculate-price',
  '/api/driver/respond',
  '/api/driver/trip',
  // Phase 84 (PANEL-02): same-origin fetch from the Dashboard App page,
  // authenticated by the operator's Chatwoot token. CSRF is defence in depth,
  // so it is deliberately NOT in CSRF_STRICT_ORIGIN_REQUIRED below.
  '/api/chatwoot/dashboard-app',
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
    "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
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
 *
 * INBOX-04/D-09 (Phase 77): the chat widget is loaded client-side, only after
 * the visitor clicks "Chat on site" on a public page (never by server code,
 * never on /admin or /driver — see components/chat/load-chat-widget.ts). Its
 * exact origin (the widget's VPS subdomain, below) is added here only —
 * never a wildcard subdomain, never to buildCsp() (the nonce CSP for /admin
 * and /driver, which never mount the launcher).
 *
 * WR-02: this host must equal the origin of the widget base URL that the
 * identity route serves from the Vercel env (the client builds sdk.js, the
 * iframe and the websocket from it). The Phase 76 isolation guard forbids the
 * host literal anywhere but these directive lines, so it cannot live in a
 * shared constant: tests/middleware-i18n.test.ts pins every occurrence here
 * to one host, and the client loader reports a CSP block of the widget origin
 * immediately (console + error state) instead of waiting out the 10 s timeout.
 * On a host change update every line below together with the env value.
 */
function buildCspStatic(): string {
  return [
    "default-src 'self'",
    // 'self' is added in development only: Next.js dev serves chunks over
    // http://localhost, which the https: scheme-source can't match, leaving
    // script-src-elem with nothing to allow external chunk <script> tags and
    // breaking hydration entirely in local dev. Production is unaffected.
    process.env.NODE_ENV === 'development'
      ? "script-src 'unsafe-inline' 'unsafe-eval' 'self' https: https://chat.rideprestigo.com"
      : "script-src 'unsafe-inline' https: https://chat.rideprestigo.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://chat.rideprestigo.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com https://*.clarity.ms https://chat.rideprestigo.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com https://places.googleapis.com https://www.facebook.com https://*.clarity.ms https://accounts.google.com https://appleid.apple.com https://chat.rideprestigo.com wss://chat.rideprestigo.com",
    "form-action 'self' https://accounts.google.com https://appleid.apple.com",
    "report-uri /api/csp-report",
  ].join('; ')
}

// Phase 84 (PANEL-02): the Chatwoot Dashboard App panel is rendered at /embed
// (outside app/[locale]) and talks to PANEL_API_PATH. Both are same-site with
// /admin, so both are made structurally cookie-less in middleware().
const EMBED_PREFIX = '/embed'
const PANEL_API_PATH = '/api/chatwoot/dashboard-app'

function isEmbedPath(pathname: string): boolean {
  return pathname === EMBED_PREFIX || pathname.startsWith(EMBED_PREFIX + '/')
}

/**
 * Per-request CSP for the Chatwoot Dashboard App page (/embed/*).
 *
 * - default-src 'none': the panel is a small self-contained page; every
 *   capability it needs is listed explicitly below and nothing else loads.
 * - script-src nonce + 'strict-dynamic': only Next's own scripts (which get
 *   the nonce through the Content-Security-Policy request header) and the
 *   scripts they load can run; no host-based script sources, no unsafe-inline.
 * - object-src / base-uri 'none', form-action 'none': no plugins, no <base>
 *   rewriting, no form posts (the panel talks to its API with fetch only).
 * - frame-ancestors is the ONLY framing allowance and names exactly the
 *   Chatwoot origin — never a wildcard. next.config.ts omits X-Frame-Options
 *   for /embed so the two cannot conflict (DENY would block Chatwoot).
 * - WR-02: the host in the frame-ancestors line must equal the single chat
 *   host of buildCspStatic(); tests/middleware-embed.test.ts pins that. It
 *   stays a single directive string alone on its line so the Phase 76
 *   isolation guard's CSP exemption covers it.
 * - The caller also removes the cookie request header: the iframe is
 *   same-site with /admin, so the browser attaches SameSite=Lax admin session
 *   cookies, and nothing rendering the panel may read them (PANEL-02).
 */
function buildCspEmbed(nonce: string): string {
  return [
    "default-src 'none'",
    // 'unsafe-eval' and 'self' are development-only, exactly as in buildCsp():
    // React dev tooling and http://localhost chunk URLs. Absent in production.
    process.env.NODE_ENV === 'development'
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'self'`
      : `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-ancestors https://chat.rideprestigo.com",
    "report-uri /api/csp-report",
  ].join('; ')
}

/**
 * Routes that require per-request dynamic rendering (auth, booking, API).
 * Everything else is a static marketing page served from the edge cache.
 *
 * Called with the RAW pathname for the non-localized branch (/admin, /api,
 * /auth, /driver — never locale-prefixed) and with the locale-STRIPPED
 * pathname for the public branch (/book, /login, /account — the only
 * dynamic paths reachable under app/[locale]/, per RESEARCH.md Pitfall 1).
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

// ---------------------------------------------------------------------------
// i18n composition (Phase 68 — I18N-01/02/04)
// ---------------------------------------------------------------------------

const handleI18nRouting = createMiddleware(routing)

// /admin, /api, /auth, /driver are never routed through next-intl at all —
// their pathnames are never locale-prefixed and the existing CSP/Supabase
// logic below must run byte-for-byte unchanged for them (RESEARCH.md Pattern 1).
// /embed (Phase 84) is non-localized too, but middleware() answers it in its
// own branch before this list is consulted — it never reaches runCspAndAuthChain.
const NON_LOCALIZED_PREFIXES = ['/admin', '/api', '/auth', '/driver', '/embed']

function isNonLocalizedRoute(pathname: string): boolean {
  return NON_LOCALIZED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// stripLocalePrefix now lives in i18n/routing.ts (I18N-04 single-source —
// see that file's doc comment) so it can be unit-tested without pulling in
// next-intl/middleware's next/server dependency. Only ever applied on the
// public/localized branch below — never for /admin, /api, /auth, /driver,
// whose pathnames are never locale-prefixed.

/**
 * The existing CSP + Supabase updateSession chain, unchanged in behavior
 * from the pre-Phase-68 middleware.ts. Parameterized so the public branch
 * can pass a locale-stripped pathname (for the isDynamicPath decision and
 * the /account gate) and thread the next-intl response object through
 * (baseResponse) so its x-middleware-rewrite header survives — see
 * lib/supabase/middleware.ts's updateSession doc comment.
 *
 * Non-localized call sites (/admin, /api, /auth, /driver) never pass
 * decisionOverrides, so this resolves byte-for-byte identically to today.
 */
async function runCspAndAuthChain(
  request: NextRequest,
  decisionOverrides?: { pathname: string; baseResponse: NextResponse }
): Promise<NextResponse> {
  const decisionPathname = decisionOverrides?.pathname ?? request.nextUrl.pathname
  const baseResponse = decisionOverrides?.baseResponse

  if (isDynamicPath(decisionPathname)) {
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
    // Nonce CSP is reserved for /admin and /driver reached via the
    // NON-localized branch (raw request pathname genuinely starts with
    // those prefixes). Deciding on the RAW pathname — not decisionPathname
    // — is deliberate: the public/localized branch is only ever entered
    // when isNonLocalizedRoute(raw pathname) is false, so raw pathname can
    // never actually start with /admin or /driver there, even though a
    // crafted /ru/admin request strips down to '/admin' for the
    // isDynamicPath decision above. Using decisionPathname here would let
    // that stripped collision leak a nonce CSP onto a route next-intl is
    // about to 404 anyway (T-68-04 — locale-prefix path confusion).
    const useNonceCsp =
      request.nextUrl.pathname.startsWith('/admin') ||
      request.nextUrl.pathname.startsWith('/driver')
    const nonce = useNonceCsp ? btoa(crypto.randomUUID()) : null
    const csp = nonce ? buildCsp(nonce) : buildCspStatic()
    const reqHeaders = new Headers(request.headers)
    if (nonce) {
      // Next extracts the nonce from this header and applies it to its scripts.
      reqHeaders.set('Content-Security-Policy', csp)
      reqHeaders.set('x-nonce', nonce)
    }
    try {
      const response = await updateSession(
        request,
        reqHeaders,
        baseResponse,
        decisionOverrides?.pathname
      )
      response.headers.set('Content-Security-Policy', csp)
      return response
    } catch {
      // Supabase not configured (local dev without .env) — fall through without auth
      const response = baseResponse ?? NextResponse.next({ request: { headers: reqHeaders } })
      response.headers.set('Content-Security-Policy', csp)
      return response
    }
  } else {
    // Static/cacheable marketing routes: skip Supabase auth roundtrip entirely.
    // No page under this branch reads user session, so getUser() on every
    // request only adds ~500-1000ms of TTFB. Only set the CSP header.
    const response = baseResponse ?? NextResponse.next({ request: { headers: request.headers } })
    response.headers.set('Content-Security-Policy', buildCspStatic())
    return response
  }
}

export async function middleware(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  const { pathname } = request.nextUrl

  if (pathname === PANEL_API_PATH) {
    // PANEL-02: the panel API never uses the admin session cookie. The page
    // is a same-site iframe, so the browser sends SameSite=Lax Supabase
    // cookies with its fetch; they are dropped here and updateSession is
    // skipped (no Supabase round-trip, no refreshed Set-Cookie). The route
    // authenticates the operator by their Chatwoot token alone.
    const reqHeaders = new Headers(request.headers)
    reqHeaders.delete('cookie')
    const response = NextResponse.next({ request: { headers: reqHeaders } })
    response.headers.set('Content-Security-Policy', buildCspStatic())
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  if (isEmbedPath(pathname)) {
    // PANEL-02: the Chatwoot Dashboard App page. No next-intl (no /en/embed
    // rewrite, no NEXT_LOCALE) and no updateSession (no Supabase round-trip,
    // no Set-Cookie). The nonce CSP goes on the forwarded request so Next
    // applies the nonce to its scripts, and on the response so the browser
    // enforces it. The cookie request header is removed so nothing rendering
    // the panel can read the admin session (same-site iframe, SameSite=Lax).
    const nonce = btoa(crypto.randomUUID())
    const csp = buildCspEmbed(nonce)
    const reqHeaders = new Headers(request.headers)
    reqHeaders.set('Content-Security-Policy', csp)
    reqHeaders.set('x-nonce', nonce)
    reqHeaders.delete('cookie')
    const response = NextResponse.next({ request: { headers: reqHeaders } })
    response.headers.set('Content-Security-Policy', csp)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  if (isNonLocalizedRoute(pathname)) {
    // EXISTING LOGIC, BYTE-FOR-BYTE — next-intl never touches these paths.
    return runCspAndAuthChain(request)
  }

  // Public route: resolve locale first.
  const intlResponse = handleI18nRouting(request)
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    // next-intl redirect (e.g. the as-needed /en/about -> /about strip) —
    // nothing else to add.
    return intlResponse
  }

  const strippedPathname = stripLocalePrefix(pathname, routing.locales)
  return runCspAndAuthChain(request, {
    pathname: strippedPathname,
    baseResponse: intlResponse,
  })
}

export const config = {
  matcher: [
    // NOTE: static-file extensions must be excluded here or requests to them
    // fall through to next-intl locale routing and 404 (regression that broke
    // every /public/**/*.avif in prod — e.g. /vehicles/*.avif on the fleet
    // page — while .webp/.png/.jpg served fine). Keep this list in sync with
    // the image formats actually shipped in /public (avif, ico added).
    // txt/xml/webmanifest: robots.txt, sitemap.xml (app/sitemap.ts), llms.txt,
    // BingSiteAuth.xml and the IndexNow key file were all rewritten to
    // /en/<file> and 404'd in prod until these were excluded.
    // SECURITY: the extension exclusion must NOT apply under api/, admin/,
    // driver/, auth/, embed/ or [locale/]account/ — otherwise a crafted dynamic
    // segment (e.g. PUT /api/admin/route-prices/prague-vienna.xml) skips
    // middleware and with it the CSRF Origin check and route gating
    // (Phase 74 security audit, T-74-07). Those prefixes never serve static
    // files, so they always run the middleware. embed/ (Phase 84, T-84-24) is
    // the Dashboard App page: a crafted /embed/x.xml must still get the embed
    // CSP and the cookie strip, not fall through unprotected.
    '/((?!_next/static|_next/image|favicon.ico|(?!(?:api|admin|driver|auth|embed)/|(?:[a-z]{2}/)?account/).*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)',
  ],
}
