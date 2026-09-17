# Phase 68: i18n Foundation & Routing - Pattern Map

**Mapped:** 2026-09-03
**Files analyzed:** 10 (new/modified)
**Analogs found:** 10 / 10 (all internal — this is greenfield i18n infra composed into existing files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `middleware.ts` (MODIFIED) | middleware | request-response | itself (current `middleware.ts:1-219`) | exact — modify in place |
| `lib/supabase/middleware.ts` (MODIFIED) | middleware | request-response | itself (current file, 73 lines) | exact — modify in place |
| `i18n/routing.ts` (NEW) | config | transform | `lib/routes.ts` (typed single-source data module) | role-match (config-hub pattern) |
| `i18n/request.ts` (NEW) | config | transform | `lib/supabase/middleware.ts` (server-side async factory pattern) + next-intl API | partial — mostly library-prescribed shape |
| `app/[locale]/layout.tsx` (NEW) | provider | request-response | `app/layout.tsx` (current root layout, 131 lines) | exact — direct split source |
| `app/(internal)/layout.tsx` (NEW) | provider | request-response | `app/layout.tsx` (current root layout, 131 lines) | exact — direct split source |
| `components/SiteChrome.tsx` (NEW, extraction) | component | request-response | `app/layout.tsx` body (lines 100-129) | exact — pure extraction |
| `app/[locale]/not-found.tsx` (NEW) | route (error boundary) | request-response | `app/not-found.tsx` (current, 42 lines) | exact — move/adapt |
| `next.config.ts` (MODIFIED) | config | transform | itself (current file, 152 lines) | exact — modify in place |
| `tests/middleware-i18n.test.ts` (NEW) | test | request-response | `tests/middleware-customer.test.ts` (217 lines, same suite family) | exact — same fixtures/helpers reusable |

## Pattern Assignments

### `middleware.ts` (middleware, request-response) — MODIFY IN PLACE

**Analog:** itself, `/Users/romanustyugov/Desktop/Prestigo/middleware.ts` (current, 219 lines)

**Imports pattern** (lines 1-2):
```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
```
Add: `import createMiddleware from 'next-intl/middleware'` and `import { routing } from '@/i18n/routing'`.

**Existing dynamic-path gate to extend** (lines 98-112):
```typescript
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
```
This is the exact function that must be called with the **locale-stripped** pathname for the public branch (RESEARCH.md Pattern 2), and NOT stripped at all for the non-localized branch (`/admin`, `/api`, `/auth`, `/driver` — RESEARCH.md Pattern 1).

**Core composition pattern — main handler** (lines 161-212):
```typescript
export async function middleware(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  const { pathname } = request.nextUrl

  if (isDynamicPath(pathname)) {
    const useNonceCsp = pathname.startsWith('/admin') || pathname.startsWith('/driver')
    const nonce = useNonceCsp ? btoa(crypto.randomUUID()) : null
    const csp = nonce ? buildCsp(nonce) : buildCspStatic()
    const reqHeaders = new Headers(request.headers)
    if (nonce) {
      reqHeaders.set('Content-Security-Policy', csp)
      reqHeaders.set('x-nonce', nonce)
    }
    try {
      const response = await updateSession(request, reqHeaders)
      response.headers.set('Content-Security-Policy', csp)
      return response
    } catch {
      const response = NextResponse.next({ request: { headers: reqHeaders } })
      response.headers.set('Content-Security-Policy', csp)
      return response
    }
  } else {
    const response = NextResponse.next({ request: { headers: request.headers } })
    response.headers.set('Content-Security-Policy', buildCspStatic())
    return response
  }
}
```
**Required structural change (per RESEARCH.md Pattern 1):** branch on `isNonLocalizedRoute(pathname)` (new helper, `/admin|/api|/auth|/driver` prefixes) BEFORE anything else. For the non-localized branch, run this exact block unmodified. For everything else, call `handleI18nRouting(request)` first, short-circuit on a 3xx response, then thread the resulting `intlResponse` (not a fresh `NextResponse.next()`) into `updateSession`/the static branch, and use `stripLocalePrefix(pathname, routing.locales)` as the pathname argument to `isDynamicPath()`.

**Config/matcher** (lines 214-218) — unchanged, no modification needed:
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

### `lib/supabase/middleware.ts` (middleware, request-response) — MODIFY IN PLACE

**Analog:** itself, `/Users/romanustyugov/Desktop/Prestigo/lib/supabase/middleware.ts` (current, 73 lines)

**Full current signature and response-threading pattern** (lines 1-9):
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, extraReqHeaders?: Headers) {
  const reqHeaders = extraReqHeaders ?? new Headers(request.headers)
  let response = NextResponse.next({ request: { headers: reqHeaders } })
  ...
```
**Critical:** this function currently ALWAYS constructs its own base `NextResponse.next(...)` (line 9) and again inside `setAll` (line 23). Per RESEARCH.md's Anti-Pattern warning, when composing with next-intl this must instead accept and mutate an existing response object (the `intlResponse` from `handleI18nRouting`) so the `x-middleware-rewrite` header survives. Add an optional `baseResponse?: NextResponse` param, defaulting to today's `NextResponse.next(...)` behavior — this keeps the `/admin`/`/driver` call sites (which never pass a base response) byte-for-byte identical.

**Pathname-prefix redirect checks to make locale-aware for the public branch ONLY** (lines 38-70):
```typescript
if (pathname.startsWith('/admin') && pathname !== '/admin/login' && user && !user.app_metadata?.is_admin) { ... }
if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !user) { ... }
if (pathname === '/admin/login' && user) { ... }
if (pathname.startsWith('/account') && !user) {
  const url = request.nextUrl.clone()
  const returnTo = encodeURIComponent(pathname + request.nextUrl.search)
  url.pathname = '/login'
  url.search = `?return-to=${returnTo}`
  return NextResponse.redirect(url)
}
```
The `/admin` checks never need stripping (never locale-prefixed, per Pattern 1). The `/account` check DOES need the caller in `middleware.ts` to pass a stripped pathname (or this function needs an optional `pathnameOverride` param) so `/ru/account` still redirects unauthenticated users to `/login`. Preserve the `returnTo` construction exactly — it already correctly encodes the ORIGINAL (locale-prefixed) `pathname`, not the stripped one, so the redirect-back target stays correct.

---

### `i18n/routing.ts` (config, transform) — NEW

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/lib/routes.ts` (typed single-source data-hub convention, lines 1-40+)

**Hub-module doc-comment convention to mirror** (lib/routes.ts lines 1-16):
```typescript
/**
 * Central route data layer.
 *
 * Single source of truth for the 30 indexed intercity routes from Prague.
 * Consumed by:
 *   - app/routes/page.tsx (hub listing)
 *   - app/sitemap.ts (sitemap entries)
 * ...
 */
export type RouteTier = 'green' | 'yellow'
export type Route = { ... }
```
Apply the same "single source of truth + explicit consumer list in the header comment" convention to `i18n/routing.ts` (per RESEARCH.md's Code Examples section — `defineRouting({ locales, defaultLocale, localePrefix: 'as-needed', localeDetection: false })`, exporting `locales`, `AppLocale`, `rtlLocales`). This satisfies I18N-04 the same way `lib/routes.ts` satisfies the "no duplicated route data" convention referenced in RESEARCH.md Pitfall 3.

---

### `app/[locale]/layout.tsx` + `app/(internal)/layout.tsx` (provider, request-response) — NEW, split from `app/layout.tsx`

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/app/layout.tsx` (current, full file, 131 lines)

**Font/metadata block to keep in the shared `SiteChrome` extraction** (lines 1-88): font loader setup (`Fraunces`/`Inter` with CSS var names `--font-cormorant`/`--font-montserrat` — do not rename these vars, 500+ existing `var()` references depend on them) and the `metadata` export.

**Body structure to extract into `components/SiteChrome.tsx`** (lines 99-129):
```tsx
<html lang="en">
  <head>
    <link rel="preconnect" href="https://www.googletagmanager.com" />
    <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
    <link rel="dns-prefetch" href="https://www.google-analytics.com" />
    <link rel="preconnect" href="https://connect.facebook.net" />
    <link rel="dns-prefetch" href="https://connect.facebook.net" />
    <link rel="dns-prefetch" href="https://www.facebook.com" />
    <link rel="dns-prefetch" href="https://www.clarity.ms" />
  </head>
  <body className={`${fraunces.variable} ${inter.variable}`}>
    <a href="#main-content" className="skip-link btn-primary">Skip to content</a>
    {children}
    <GoogleAnalytics />
    <AnalyticsPageView />
    <Clarity />
    <MetaPixel />
    <CookieBanner />
    <EngagementTracker />
  </body>
</html>
```
**Critical comment to preserve** (lines 93-98) — governs why neither new layout may add `headers()`/`cookies()` reads:
```typescript
// No headers()/cookies() read here on purpose: any dynamic API in the root
// layout opts the ENTIRE route tree into dynamic rendering, defeating the
// revalidate/force-static directives on the marketing pages below. The CSP
// nonce for dynamic routes is propagated automatically by Next.js from the
// Content-Security-Policy request header set in middleware...
```
Per RESEARCH.md Pattern 3, `app/[locale]/layout.tsx` wraps this in `<html lang={locale} dir={rtl?'rtl':'ltr'}>` with `setRequestLocale(locale)`/`hasLocale()` guard; `app/(internal)/layout.tsx` keeps `<html lang="en">` literally unchanged and wraps `SiteChrome` identically — this is what makes `/admin`/`/driver` provably byte-for-byte unchanged (RESEARCH.md Pitfall 3).

---

### `app/[locale]/not-found.tsx` (route, request-response) — NEW, moved from `app/not-found.tsx`

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/app/not-found.tsx` (current, full file, 42 lines)

**Full pattern to move as-is** (lines 1-41):
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Page Not Found — PRESTIGO',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main id="main-content">
      <Nav />
      <section className="bg-anthracite min-h-[70vh] flex items-center pt-16">
        {/* ... 404 copy, CTAs (Book a Transfer / View Services / Back to Home) ... */}
      </section>
      <Footer />
    </main>
  )
}
```
Move this content verbatim into `app/[locale]/not-found.tsx` (I18N-03). Keep a minimal top-level `app/not-found.tsx` as belt-and-braces fallback per RESEARCH.md's Recommended Project Structure (for truly unmatched paths outside `[locale]`/`(internal)`). Do NOT localize the copy itself this phase — TR-01/02 (Phase 72/73) handle translation; this phase only needs the per-locale route to exist and render correctly (English copy is fine for all 7 locales for now, consistent with RESEARCH.md Assumption A3 — zero `useTranslations` call sites expected yet).

---

### `next.config.ts` (config, transform) — MODIFY IN PLACE

**Analog:** itself, `/Users/romanustyugov/Desktop/Prestigo/next.config.ts` (current, 152 lines)

**Existing plugin-wrapping convention to extend** (lines 1-10, 151):
```typescript
import type { NextConfig } from "next";
import createMDX from '@next/mdx';

const withMDX = createMDX({
  options: { remarkPlugins: [['remark-frontmatter', ['yaml']]] },
});
const nextConfig: NextConfig = { /* ...redirects/images/headers unchanged... */ };
export default withMDX(nextConfig);
```
Add `import createNextIntlPlugin from 'next-intl/plugin'` and `const withNextIntl = createNextIntlPlugin('./i18n/request.ts')`; change the final export to `export default withNextIntl(withMDX(nextConfig));` (compose, don't replace — mirrors the existing single-wrap convention already in the file).

**Note on the `/cs` redirect** (lines 70-84): the existing `/cs` → `/` redirects have a comment noting "Czech locale was never implemented... Remove these rules if a real CS locale is added later." CS is out of scope for v1 (LOC-CS is a v2/deferred requirement) — leave these redirects untouched this phase.

---

### `tests/middleware-i18n.test.ts` (test, request-response) — NEW

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/tests/middleware-customer.test.ts` (full file, 217 lines)

**Mock setup pattern to reuse verbatim** (lines 1-34):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockGetUser, mockCreateServerClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockCreateServerClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
  }))
  return { mockGetUser, mockCreateServerClient }
})

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

import { updateSession } from '@/lib/supabase/middleware'
```

**Fixture helpers to reuse as-is** (lines 47-69):
```typescript
function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://prestigo.cz${pathname}`)
}
function makeAdminUser() {
  return { id: 'admin-user-id', app_metadata: { is_admin: true }, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
}
function makeCustomerUser() {
  return { id: 'customer-user-id', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
}
```
Add cases per RESEARCH.md's Validation Architecture table: locale-prefixed public paths (`/ru/book` → dynamic CSP branch), `/ru/account` unauthenticated → redirect to `/login` (not `/ru/login`, matching the existing `returnTo` construction), and the security-critical `/ru/admin` probe (must NOT bypass admin auth — should resolve to a 404 via `hasLocale()` validation, not silently pass through the public branch). `makeRequest` may need a second optional `origin` param if CSRF-adjacent paths are tested, but the existing signature covers the locale-prefix cases described above unchanged.

## Shared Patterns

### Non-destructive middleware composition (branch-before-touch)
**Source:** RESEARCH.md Architecture Patterns 1 & 2 (`isNonLocalizedRoute` gate + `stripLocalePrefix` helper) — no existing codebase analog, this glue code is necessarily new, but it must slot around the two files above without altering their behavior for `/admin`, `/api`, `/auth`, `/driver`.
**Apply to:** `middleware.ts`, `lib/supabase/middleware.ts`.

### Response-object threading (never construct a fresh `NextResponse.next()` when composing)
**Source:** `lib/supabase/middleware.ts:9,23` (existing single-response-object pattern within `updateSession` itself) — extend the same discipline to the new outer composition so next-intl's `x-middleware-rewrite` header is never dropped.
**Apply to:** `middleware.ts` main handler, `lib/supabase/middleware.ts` `updateSession`.

### Extracted shared chrome to avoid layout drift
**Source:** `app/layout.tsx:99-129` (current single root layout body) → extract to `components/SiteChrome.tsx`.
**Apply to:** `app/[locale]/layout.tsx`, `app/(internal)/layout.tsx`.

### Typed single-source config module convention
**Source:** `lib/routes.ts:1-16` (header-comment "single source of truth + explicit consumer list" convention).
**Apply to:** `i18n/routing.ts`.

## No Analog Found

None — every file in this phase's scope either modifies an existing file in place or is a direct structural split/extraction of an existing file (`app/layout.tsx` → two layouts + `SiteChrome`; `app/not-found.tsx` → `app/[locale]/not-found.tsx`). `i18n/request.ts` is the closest thing to a pure library-prescribed stub (RESEARCH.md's Code Examples section gives the exact ~15-line shape); no in-repo analog exists for a `getRequestConfig` factory, but the shape is fully specified in RESEARCH.md and requires no further pattern search.

## Metadata

**Analog search scope:** repo root (`middleware.ts`, `next.config.ts`), `lib/`, `lib/supabase/`, `app/` (root layout + not-found), `tests/`
**Files scanned:** `middleware.ts`, `lib/supabase/middleware.ts`, `app/layout.tsx`, `app/not-found.tsx`, `next.config.ts`, `lib/routes.ts`, `tests/middleware-customer.test.ts`
**Pattern extraction date:** 2026-09-03
