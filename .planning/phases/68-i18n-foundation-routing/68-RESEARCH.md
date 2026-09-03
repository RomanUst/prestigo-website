# Phase 68: i18n Foundation & Routing - Research

**Researched:** 2026-09-03
**Domain:** Next.js App Router internationalized routing (next-intl) composed into an existing security-critical middleware chain
**Confidence:** MEDIUM (stack choice and codebase facts are HIGH; the root-layout/html-tag architecture and Next.js 16 middleware-deprecation interaction are newer surface area — flagged explicitly below)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| I18N-01 | Adopt `next-intl` with `app/[locale]/` routing and `localePrefix: 'as-needed'` — EN resolves at root with no `/en` prefix and existing English URLs are unchanged. | `## Standard Stack` (version-verified `next-intl@4.14.2`); `## Code Examples` (`i18n/routing.ts` with `localePrefix: 'as-needed'`, `localeDetection: false`); `## Recommended Project Structure` (route-folder move plan) |
| I18N-02 | Compose the next-intl locale middleware into the existing `middleware.ts` chain so per-request CSP nonce, Supabase `updateSession`, and CSRF Origin-guard all continue to work byte-for-byte, with locale detection added. | `## Architecture Patterns` Pattern 1 (composition order) and Pattern 2 (locale-stripping helper); `## Common Pitfalls` Pitfall 1 (exact break mechanism) and Pitfall 2 (`middleware.ts` vs `proxy.ts` decision); `## Validation Architecture` (existing `tests/middleware-customer.test.ts` must stay green + new Wave 0 test) |
| I18N-03 | `<html lang>` and `dir` are set dynamically per locale (`dir="rtl"` for `ar`). | `## Architecture Patterns` Pattern 3 (split root layouts); `## Code Examples` (`app/[locale]/layout.tsx` with `RTL_LOCALES`); `## Open Questions` #3 (per-branch not-found) |
| I18N-04 | Typed, single-source locale config (`en, ru, es, fr, ar, hi, zh`); admin/api/auth/driver routes stay non-localized at root. | `## Code Examples` (`i18n/routing.ts` — `locales`/`AppLocale`/`rtlLocales`); `## Architectural Responsibility Map`; `## Architecture Patterns` Pattern 1 (`isNonLocalizedRoute` gate keeps admin/api/auth/driver untouched) |
</phase_requirements>

## Summary

Phase 68 has exactly one hard constraint that dominates every design decision: `middleware.ts` today runs three independent concerns (CSP nonce generation, Supabase `updateSession` auth/redirect logic, and CSRF Origin-guard) driven entirely by `request.nextUrl.pathname` string-prefix checks (`pathname.startsWith('/admin')`, etc.). The moment public routes move under `app/[locale]/` with `localePrefix: 'as-needed'`, two of those pathname checks (`/login`, `/account` — which are public, localized routes) will silently break for every non-English locale, because a Russian visitor's request pathname will be `/ru/account`, not `/account`, and `'/ru/account'.startsWith('/account')` is `false`. This is the #1 landmine and is fully addressed in `## Architecture Patterns` below with a concrete locale-stripping helper.

The second major finding is that the installed Next.js version (`16.2.3`, confirmed via `node -e "require('./node_modules/next/package.json').version"`) has renamed the `middleware.ts` file convention to `proxy.ts` (`export function proxy` instead of `export function middleware`) — `middleware.ts` still works but is deprecated and prints a build-time warning `[VERIFIED: node_modules/next/package.json:3]`. The Phase 68 success criteria explicitly say "the composed `middleware.ts`" by name, so this research treats **staying on `middleware.ts`** as the locked decision for this phase — do not rename to `proxy.ts` — and flags the rename as an explicit out-of-scope item so a future cleanup phase can pick it up deliberately (it is a mechanical, low-risk rename once this phase's composition is stable).

The third major finding concerns `<html lang>/dir`. The current single `app/layout.tsx` hard-codes `<html lang="en">` and is the ONLY root layout — it wraps every route including `/admin`, `/api`, `/auth`, `/driver`, which must stay **non-localized and byte-for-byte unchanged**. Because a Next.js root layout must contain `<html>`/`<body>`, and every route needs exactly one ancestor root layout, moving public routes into `app/[locale]/` forces an explicit choice between (a) the well-established "multiple root layouts" pattern (route groups, one root layout per top-level branch, `<html lang={locale}>` only in the `[locale]` branch) or (b) the brand-new Next.js 16 `next/root-params` API that lets a single shared root layout read the `locale` param even though `[locale]` is a nested segment below it. This research recommends **(a)**, the well-established pattern, because `next/root-params`'s behavior on routes that don't traverse the `[locale]` segment at all (e.g. `/admin`) is not documented with a worked example and this is a risk-first phase whose explicit charter is "don't break anything" — an unverified fallback on a brand-new API is the wrong place to spend that risk budget. `next/root-params` is noted as a legitimate future simplification in Open Questions.

**Primary recommendation:** Adopt `next-intl@4.14.2` with `defineRouting({ locales: [en,ru,es,fr,ar,hi,zh], defaultLocale: 'en', localePrefix: 'as-needed', localeDetection: false })`. Compose `createMiddleware(routing)` into the existing `middleware.ts` by branching on a non-localized-path check FIRST (unchanged existing logic, zero next-intl involvement, for `/admin`, `/api`, `/auth`, `/driver`), and only for everything else: call `handleI18nRouting(request)` to get the base response, then run the existing CSRF/CSP/Supabase logic against a **locale-stripped pathname** and merge cookies/CSP header onto the next-intl response object (not a fresh one) so the internal rewrite header survives. Split the root layout into two root layouts via a route group — `app/[locale]/layout.tsx` (dynamic `lang`/`dir`) and `app/(internal)/layout.tsx` (hard-coded `lang="en"`, wraps `/admin` and `/driver`) — sharing the existing analytics/font/head markup through one extracted component so behavior for `/admin` and `/driver` does not change at all.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locale detection / URL prefix resolution | Frontend Server (middleware) | — | next-intl's `createMiddleware` must run before rendering to decide the rewrite/redirect target; this is inherently a middleware-tier concern |
| CSP nonce generation | Frontend Server (middleware) | — | Unchanged — per-request nonce must be computed before the response is returned, same as today |
| Supabase session refresh / auth redirects | Frontend Server (middleware) + API (Supabase) | — | `updateSession` calls Supabase's GoTrue via `@supabase/ssr`; the redirect *decision* is middleware-tier, the *validation* is the Supabase service |
| CSRF Origin-guard | Frontend Server (middleware) | — | Unchanged — pure header inspection, no locale interaction (only applies to `/api/*` which is never localized) |
| `<html lang>/dir` | Frontend Server (root layout, SSR) | Browser | Must be set before first paint (SSR), not patched client-side, for accessibility and screen-reader correctness |
| Per-locale not-found | Frontend Server (App Router `not-found.tsx`) | — | Resolved server-side per the matched route segment |
| Typed locale config (`en,ru,es,fr,ar,hi,zh`) | Shared module (`i18n/routing.ts`) | — | Single source of truth consumed by middleware, layouts, and (in later phases) message loaders and sitemap |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next-intl` | `4.14.2` [VERIFIED: npm view next-intl version, run this session] | App Router i18n routing, message loading, `<html>`-safe locale APIs | De facto standard for Next.js App Router i18n (5.4M weekly downloads [VERIFIED: npm view next-intl@4.14.2, run this session]); purpose-built for the exact `localePrefix: 'as-needed'` + middleware-composition scenario this phase needs |

### Supporting
None required for Phase 68 specifically — `messages/*.json` catalogs, `next/font` per-locale loading, and hreflang/sitemap wiring are Phase 69/73/74 concerns, out of scope here.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next-intl` | Next.js built-in `i18n` config (Pages Router only) | Not available in App Router at all — dead end, do not consider |
| `next-intl` | `next-i18next` | Pages Router-oriented, weaker App Router / RSC support; not the community-standard choice for a new App Router i18n build in 2026 |
| Route-group multiple-root-layouts | `next/root-params` shared root layout | Newer (Next.js 16, no `experimental` flag needed [VERIFIED: node_modules — see Package Legitimacy Audit note] but no documented worked example for a param accessed from a route that never passes through the dynamic segment); rejected for this phase's risk profile, tracked as an Open Question |

**Installation:**
```bash
npm install next-intl@4.14.2
```

**Version verification:** `npm view next-intl version` → `4.14.2`, `npm view next-intl peerDependencies` → `{ next: '^12.0.0 || ^13.0.0 || ^14.0.0 || ^15.0.0 || ^16.0.0', react: '...^19.0.0' }` — both satisfied by the installed `next@16.2.3` / `react@19.2.3` [VERIFIED: npm view next-intl@4.14.2 peerDependencies, run this session; node_modules/next/package.json:3 and node_modules/react/package.json for installed versions].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `next-intl` | npm | package created 2020-11-19 (5+ yrs) [VERIFIED: npm view next-intl time.created, run this session]; **latest patch (4.14.2) published 2026-09-01, 2 days before this research** | 5,441,546/wk [VERIFIED: gsd-tools package-legitimacy check, run this session] | `github.com/amannn/next-intl` [VERIFIED: npm view next-intl@4.14.2 repository.url, run this session] | **SUS** (`gsd-tools package-legitimacy check` reason: `"too-new"`) | **Flagged — planner must add `checkpoint:human-verify` before `npm install`, per protocol.** Treat this as a false-positive-shaped signal: the "too-new" reason fires on the *latest patch's* publish date, not the package's age — the package itself is 5+ years old with an enormous download count and an actively maintained, matching GitHub repo (confirmed independently via Context7 `resolve-library-id`, which also resolved `/amannn/next-intl` as the High-reputation match). No `postinstall` script present [VERIFIED: npm view next-intl@4.14.2 scripts.postinstall, run this session — empty]. Recommend the checkpoint simply confirm `npm install next-intl@4.14.2` resolves to `github.com/amannn/next-intl` before merge, not a deeper vetting pass. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `next-intl` — see disposition above; planner must gate the install behind a `checkpoint:human-verify` task per the Package Legitimacy Gate protocol, even though this researcher's read of the signals is that it is safe.

## Architecture Patterns

### System Architecture Diagram

```
Incoming request
       │
       ▼
┌─────────────────────────── middleware.ts ───────────────────────────┐
│ 1. checkCsrf(request)  ── unchanged, operates on raw pathname        │
│    (only matches /api/* prefixes, which are never locale-prefixed)  │
│                                                                       │
│ 2. isNonLocalizedRoute(pathname)?                                    │
│      pathname startsWith /admin | /api | /auth | /driver             │
│         │ YES                              │ NO (public route)      │
│         ▼                                  ▼                        │
│   [EXISTING LOGIC, BYTE-FOR-BYTE]    handleI18nRouting(request)      │
│   isDynamicPath/CSP/updateSession    (next-intl createMiddleware)    │
│   exactly as today, unchanged             │                         │
│         │                            redirect? ── YES ──▶ return    │
│         │                                 │ NO (rewrite/pass)       │
│         │                                 ▼                         │
│         │                     stripLocalePrefix(pathname)            │
│         │                     → delocalized path for CSP/CSRF/       │
│         │                       Supabase pathname checks             │
│         │                                 │                         │
│         │                     updateSession(request, intlResponse)   │
│         │                     writes cookies + CSP header ONTO       │
│         │                     the next-intl response object          │
│         ▼                                 ▼                         │
│                     merged NextResponse returned                     │
└───────────────────────────────────────────────────────────────────────┘
       │
       ▼
App Router render:
  /admin, /driver  → app/(internal)/layout.tsx   (<html lang="en">, unchanged chrome)
  /api, /auth      → route handlers, no layout involved at all
  everything else  → app/[locale]/layout.tsx     (<html lang={locale} dir={rtl?'rtl':'ltr'}>)
                       → setRequestLocale(locale) → NextIntlClientProvider
                       → page renders in EN content regardless of locale (Phase 68 scope)
```

### Recommended Project Structure
```
i18n/
├── routing.ts          # defineRouting({ locales, defaultLocale, localePrefix, localeDetection }) — I18N-04 single source
└── request.ts           # getRequestConfig — returns { locale } (+ messages in later phases)
middleware.ts             # composed CSRF + locale + CSP + Supabase chain (stays middleware.ts, see Summary)
app/
├── [locale]/
│   ├── layout.tsx        # NEW root layout: <html lang dir>, fonts, GA/MetaPixel/Clarity/CookieBanner, setRequestLocale
│   ├── not-found.tsx     # per-locale 404 (I18N-03) — move existing app/not-found.tsx content here
│   ├── page.tsx           # moved from app/page.tsx (home)
│   ├── about/ … faq/ … routes/ … services/ … blog/ … book/ … login/ … account/ … etc.
│                          # every current public route folder moves down one level
├── (internal)/
│   ├── layout.tsx        # NEW root layout: <html lang="en">, same shared chrome component
│   ├── admin/             # moved from app/admin/ — URL unaffected (route groups are invisible in the URL)
│   └── driver/            # moved from app/driver/ — URL unaffected
├── api/                   # UNCHANGED location — route handlers need no layout at all
├── auth/callback/         # UNCHANGED location — route handler, no layout
└── not-found.tsx          # keep as top-level fallback for truly unmatched paths (belt-and-braces)
```

### Pattern 1: Non-destructive middleware composition
**What:** Branch on whether the path is one of the four non-localized surfaces BEFORE touching next-intl at all; only public paths go through `handleI18nRouting`.
**When to use:** Any time a security-critical middleware chain must gain locale routing without regressing.
**Example:**
```typescript
// Source: next-intl docs "Composing other middlewares" (Context7 /amannn/next-intl,
// docs/routing/middleware.mdx) + community-verified Supabase composition recipe
// (github.com/amannn/next-intl/discussions/422 — maintainer-endorsed pattern, fetched this session)
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

const handleI18nRouting = createMiddleware(routing)

const NON_LOCALIZED_PREFIXES = ['/admin', '/api', '/auth', '/driver']

function isNonLocalizedRoute(pathname: string): boolean {
  return NON_LOCALIZED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const csrfError = checkCsrf(request) // unchanged — only ever matches /api/*
  if (csrfError) return csrfError

  const { pathname } = request.nextUrl

  if (isNonLocalizedRoute(pathname)) {
    return existingCspAndSupabaseChain(request) // byte-for-byte, see Pitfall 1
  }

  // Public route: resolve locale first.
  const intlResponse = handleI18nRouting(request)
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse // next-intl redirect (e.g. /en/about -> /about) — nothing else to add
  }

  const strippedPathname = stripLocalePrefix(pathname, routing.locales) // '/ru/account' -> '/account'
  return existingCspAndSupabaseChain(request, strippedPathname, intlResponse)
}
```
The key structural change from today's file: `existingCspAndSupabaseChain` must (a) accept an already-created base response (`intlResponse`) to write cookies/headers onto instead of always constructing its own `NextResponse.next()`, and (b) accept an optional override pathname for the `isDynamicPath`/CSP-branch decision, defaulting to `request.nextUrl.pathname` when not supplied (preserves the non-localized branch's behavior exactly).

### Pattern 2: Locale-aware pathname stripping for existing prefix checks
**What:** A small helper that both `middleware.ts`'s `isDynamicPath()` and `lib/supabase/middleware.ts`'s `pathname.startsWith('/admin')`/`'/account'` checks must use instead of the raw `request.nextUrl.pathname`, for the routes that ARE public+localized (`/book`, `/login`, `/account`).
**When to use:** Any pathname-prefix check inside the composed middleware that targets a route living under `app/[locale]/`.
**Example:**
```typescript
// Not from next-intl's public API directly — next-intl does not export a
// pathname-stripping helper for this purpose (its own internals use the
// x-middleware-rewrite header, see the next-intl "Composing other middlewares"
// snippet). This is a minimal helper this project must write itself.
function stripLocalePrefix(pathname: string, locales: readonly string[]): string {
  const seg = pathname.split('/')[1]
  if (locales.includes(seg)) {
    const rest = pathname.slice(seg.length + 1)
    return rest === '' ? '/' : rest
  }
  return pathname
}
```
**Critical:** `/admin`, `/api`, `/auth`, `/driver` never need this — they are excluded from `handleI18nRouting` entirely by Pattern 1's branch, so their pathnames are NEVER locale-prefixed and their existing `pathname.startsWith(...)` checks in `lib/supabase/middleware.ts` remain untouched and correct as-is.

### Pattern 3: Split root layouts (multiple root layouts)
**What:** Two independent root layouts, one per top-level branch, each supplying `<html>`/`<body>`, sharing chrome via an extracted component.
**When to use:** Whenever a subset of routes must be excluded from a locale tree but still needs the exact same global chrome (fonts, analytics, cookie banner).
**Example:**
```tsx
// Source: Next.js docs "Examples > Creating multiple root layouts"
// (Context7 /vercel/next.js/v16.2.9, 01-app/01-getting-started/02-project-structure.mdx)
// + next-intl's own "Multiple root layouts" pattern (Context7 /amannn/next-intl,
// blog/nextjs-root-params.mdx)

// app/[locale]/layout.tsx
import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteChrome } from '@/components/SiteChrome' // extracted fonts+GA+MetaPixel+Clarity+CookieBanner+EngagementTracker

const RTL_LOCALES = new Set(['ar'])

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'}>
      <SiteChrome>{children}</SiteChrome>
    </html>
  )
}

// app/(internal)/layout.tsx — admin + driver, unchanged behavior
import { SiteChrome } from '@/components/SiteChrome'

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <SiteChrome>{children}</SiteChrome>
    </html>
  )
}
```
`SiteChrome` is a new extraction of the current `app/layout.tsx` body: `<head>` preconnect/dns-prefetch links, `<body className={fonts}>`, skip-link, `{children}`, and the five global components (`GoogleAnalytics`, `AnalyticsPageView`, `Clarity`, `MetaPixel`, `CookieBanner`, `EngagementTracker`). Extracting it once and using it from both layouts is what makes `/admin` and `/driver` behavior provably byte-for-byte unchanged, rather than hand-copied and drift-prone.

### Anti-Patterns to Avoid
- **Relying on `request.nextUrl.pathname` after calling `handleI18nRouting`:** the rewritten/internal locale segment is only visible via the `x-middleware-rewrite` response header, not on the request object — read it from there if the resolved locale is ever needed inside `middleware.ts` (Phase 68 does not need this, but note it for future phases like UX-01/02).
- **Calling `handleI18nRouting` unconditionally for every matcher-covered path:** it will try to rewrite `/api/*`/`/admin/*` paths too, which is not what next-intl is for and is unnecessary work on every request — always gate it behind the non-localized-route check.
- **Constructing a fresh `NextResponse.next()` inside `updateSession` when composing:** this silently drops the next-intl rewrite header from the returned response, breaking the entire locale resolution for routes that needed a rewrite (this is the mistake documented as unresolved in `github.com/orgs/supabase/discussions/18747`, fetched this session — the reporter's bug was exactly "returns `res` (locale response) but ignores Supabase's response" / or the inverse). The fix in Pattern 1 threads a single response object through.
- **Applying `next/root-params` to solve the `<html lang>` split without first verifying it does not throw on `/admin`:** this is an experimental-flavored (though unflagged) Next.js 16 API without a documented worked example for a route that never passes through `[locale]` at all — treated as an Open Question, not adopted this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Locale detection, prefix resolution, redirect/rewrite logic | Custom regex-based locale router in `middleware.ts` | `next-intl`'s `createMiddleware`/`defineRouting` | Correctly handles `as-needed` prefix edge cases (superfluous `/en/` redirect-to-root, cookie sync, domain support if ever needed) that are easy to get subtly wrong by hand |
| RTL detection per locale | Ad hoc `if (locale === 'ar')` scattered across files | A single `RTL_LOCALES` set in `i18n/routing.ts`, imported everywhere `dir` is needed | I18N-04 requires a single-source typed config; scattering the RTL check defeats that and will drift when JA/KO (also LTR, so fine) or a future RTL locale (e.g. Hebrew/Urdu, v2) is added |

**Key insight:** The entire hand-roll risk in this phase is not "should we write our own i18n router" (obviously not) — it's "should we write our own middleware-composition glue code." That glue code (Pattern 1 + Pattern 2) is unavoidably custom because this project's CSP-nonce/CSRF/Supabase chain has no off-the-shelf equivalent; next-intl explicitly designs for and documents this composition point rather than trying to own the whole middleware.

## Common Pitfalls

### Pitfall 1: `isDynamicPath()` and Supabase pathname checks silently misfire for localized routes
**What goes wrong:** `/ru/account`, `/es/login`, `/fr/book` no longer match `pathname.startsWith('/account')` etc. in `middleware.ts:102-112` [VERIFIED: middleware.ts:102-112 — `pathname.startsWith('/book') || pathname.startsWith('/admin') || pathname.startsWith('/api') || pathname.startsWith('/driver') || pathname.startsWith('/login') || pathname.startsWith('/account') || pathname.startsWith('/auth')`] and `lib/supabase/middleware.ts:38-70` [VERIFIED: lib/supabase/middleware.ts:38-70 — four `pathname.startsWith('/admin')`/`pathname.startsWith('/account')` checks driving redirects]. A non-English visitor to `/ru/book` would get the **static** CSP branch (no nonce, no Supabase call) instead of the dynamic one, and a non-English unauthenticated visitor to `/ru/account` would NOT be redirected to `/login` at all.
**Why it happens:** These checks were written when every route lived at an unprefixed root path; `localePrefix: 'as-needed'` only removes the prefix for the *default* locale, so `/book`(en)/`/ru/book`/`/es/book`/etc. all need to resolve to the same "is this a dynamic path" answer.
**How to avoid:** Apply Pattern 2's `stripLocalePrefix()` before every such check, but ONLY for the public-route branch (Pattern 1) — never for `/admin`/`/api`/`/auth`/`/driver`, whose pathnames are never locale-prefixed in the first place and must not be touched.
**Warning signs:** A Playwright/manual check where `/ru/book` renders with `unsafe-inline` CSP instead of a nonce, or `/ru/account` (unauthenticated) does not redirect.

### Pitfall 2: Next.js 16 middleware→proxy rename creates ambiguity about which file convention to target
**What goes wrong:** Following current next-intl documentation examples literally (they use `export default async function proxy(request: NextRequest)`) would produce a `proxy.ts` file, which the phase's own success criteria (naming `middleware.ts` explicitly) do not expect, and which forces the Node.js runtime (edge is unsupported in `proxy.ts` [VERIFIED: Context7 /vercel/next.js/v16.2.9, docs/01-app/02-guides/upgrading/version-16.mdx, fetched this session — "The edge runtime is NOT supported in proxy"]).
**Why it happens:** `next-intl`'s own docs were updated for Next.js 16 and now use the new `proxy` naming in examples, but `middleware.ts` remains fully functional (with a build-time deprecation warning) in Next.js 16.2.3 [VERIFIED: Context7 /vercel/next.js canary, packages/next/src/build/index.ts — "If only middleware.ts is found, a deprecation warning is emitted"].
**How to avoid:** Keep the file named `middleware.ts` and the exported function named `middleware` for this phase (matches the locked success criteria wording); do not introduce `proxy.ts`. Adapt any next-intl doc example by renaming `proxy` → `middleware` in the implementation. Track the `middleware.ts` → `proxy.ts` rename as a separate, later cleanup (mechanical, low risk, but touches the same file this phase is stabilizing — don't do both at once).
**Warning signs:** A build log line reading `The "middleware" file convention is deprecated. Please use "proxy" instead.` — expected and safe to ignore for this phase; do NOT let a future automated codemod (`npx @next/codemod@canary middleware-to-proxy .`) run against this file without explicit review, since it will also rename the exported function and could interact with the edge/node runtime constraint.

### Pitfall 3: Root layout duplication for `/admin` and `/driver` drifting from the localized layout
**What goes wrong:** If the analytics/font/CookieBanner JSX is hand-copied into `app/(internal)/layout.tsx` instead of extracted into a shared component, the two layouts will diverge over time (e.g. a future analytics change applied to only one).
**Why it happens:** Splitting into "multiple root layouts" is the correct pattern, but naively following the two-file example without extraction reintroduces the exact kind of duplication this codebase's `lib/seo.ts`/`lib/routes.ts` "single hub" conventions were designed to avoid (see STATE.md's "Key i18n grounding" note on `lib/routes.ts` being the hub data layer).
**How to avoid:** Extract the current `app/layout.tsx` body (everything from `<head>` down through the five global components) into one shared component (Pattern 3's `SiteChrome`) used by both root layouts.
**Warning signs:** A code review that finds `<GoogleAnalytics />`/`<MetaPixel />`/etc. JSX duplicated verbatim in two `layout.tsx` files.

### Pitfall 4: `localeDetection` defaulting to `true` changes root-URL behavior for non-English visitors
**What goes wrong:** next-intl's default `localeDetection: true` reads `Accept-Language` and a `NEXT_LOCALE` cookie on the very first visit to `/` and can redirect a Russian-browser visitor to `/ru` even though UX-02 (deliberate Accept-Language auto-detection UX) is explicitly scoped to Phase 74, not this phase [VERIFIED: .planning/REQUIREMENTS.md:62 — "UX-02: First-visit language auto-detection via Accept-Language ... Phase 74"]. This would also violate the phase's own success criterion 1 ("existing English URLs resolve unchanged at the root") for the subset of visitors whose browser locale isn't English, since they'd be redirected away from `/` on first load.
**Why it happens:** `localeDetection` is `true` by default in `next-intl`'s routing config [CITED: Context7 /amannn/next-intl, docs/routing/configuration.mdx].
**How to avoid:** Set `localeDetection: false` explicitly in `i18n/routing.ts` for this phase; UX-02 will flip it on deliberately in Phase 74 once translated content exists to redirect into.
**Warning signs:** A non-English `Accept-Language` header in a test request causing `/` to 307-redirect to `/xx` during Phase 68 manual verification.

## Runtime State Inventory

> Rename/refactor scope check: this phase moves ~20 route folders under `app/[locale]/` and splits the root layout. No renamed strings, no data migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database column, collection, or key embeds a route path string that this phase changes | None |
| Live service config | None — Vercel/Supabase config does not reference specific `app/` file paths | None |
| OS-registered state | None applicable (web app, no OS-level task registrations) | None |
| Secrets/env vars | None — no env var name references a moved route | None |
| Build artifacts | `.next/` build cache will need a clean rebuild after the route-folder move (stale route manifest); no persistent artifact outside `.next/` references old paths | Standard `next build` picks this up automatically; no manual step |

**Nothing found in most categories** — this is a pure code/routing restructure, not a rename/rebrand phase; the Runtime State Inventory trigger (rename/refactor) is included for completeness per protocol but yields no findings.

## Code Examples

### `i18n/routing.ts` — typed single-source locale config (I18N-04)
```typescript
// Source: next-intl docs "Type-safe routing config" pattern (Context7 /amannn/next-intl,
// docs/getting-started/app-router.mdx + blog/next-intl-3-22.mdx), adapted to this
// project's 7-locale set from .planning/REQUIREMENTS.md:10-20
import { defineRouting } from 'next-intl/routing'

export const locales = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
export type AppLocale = (typeof locales)[number]

export const rtlLocales: readonly AppLocale[] = ['ar']

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  // UX-02 (Accept-Language auto-detect) is explicitly Phase 74 scope — keep
  // root-URL behavior identical to today for every visitor until then.
  localeDetection: false,
})
```

### `i18n/request.ts` — Phase 68 stub (no translations yet)
```typescript
// Source: next-intl docs "i18n/request.ts" getting-started pattern (Context7
// /amannn/next-intl, docs/getting-started/app-router.mdx), simplified: Phase 68
// has zero `useTranslations`/`getTranslations` call sites anywhere in the
// codebase yet [VERIFIED: grep -rln "next-intl" . --exclude-dir=node_modules,
// run this session — zero matches], so messages can be an empty object until
// STR-01 (Phase 69) introduces the first catalog.
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: {}, // populated starting Phase 69 (STR-01)
  }
})
```

### `next.config.ts` — add the next-intl plugin alongside existing MDX plugin
```typescript
// Source: next-intl docs "next.config.ts setup" (Context7 /amannn/next-intl,
// docs/getting-started/app-router.mdx); MDX wrapping preserved from this
// project's existing next.config.ts:1-10 [VERIFIED: next.config.ts:1-10]
import type { NextConfig } from 'next'
import createMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'

const withMDX = createMDX({
  options: { remarkPlugins: [['remark-frontmatter', ['yaml']]] },
})
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  // ...existing redirects/images/headers unchanged, see next.config.ts:12-149
}

export default withNextIntl(withMDX(nextConfig))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `middleware.ts` / `export function middleware` | `proxy.ts` / `export function proxy` (edge unsupported) | Next.js 16 (installed: 16.2.3) [VERIFIED: Context7 /vercel/next.js/v16.2.9, docs/01-app/02-guides/upgrading/version-16.mdx] | Deprecation warning only in this phase — see Pitfall 2; not adopted now by design |
| `experimental.rootParams` flag | `next/root-params` available by default, no flag | Next.js 16 [VERIFIED: Context7 /vercel/next.js canary, packages/next/src/server/config.ts] | Not adopted this phase — see Open Questions |
| Single top-level `app/not-found.tsx` only | Per-segment `not-found.tsx` (this phase) + optional experimental `app/global-not-found.tsx` (`experimental.globalNotFound` flag) | `global-not-found` is still experimental as of 16.2.9 [VERIFIED: Context7 /vercel/next.js/v16.2.9, 01-app/03-api-reference/03-file-conventions/not-found.mdx — requires `experimental: { globalNotFound: true }`] | Not adopted — kept the existing top-level `app/not-found.tsx` as belt-and-braces fallback alongside the new `app/[locale]/not-found.tsx` |

**Deprecated/outdated:**
- `experimental.rootParams` config flag: removed/no-op, `next/root-params` module works without it — irrelevant here since this research doesn't adopt root-params anyway.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `/login` and `/account` should be treated as **public, localized** routes (moved under `app/[locale]/`), not lumped in with `/auth`/`/admin`/`/driver` as non-localized, even though `isDynamicPath()` currently groups `/login`/`/account`/`/auth` together stylistically. | Architecture Patterns, Pitfall 1 | If wrong (i.e. the phase owner actually wants `/login`/`/account` to stay unprefixed like `/admin`), the whole locale-stripping requirement for those two paths disappears and the middleware composition gets simpler — but REQUIREMENTS.md STR-02 ("account + auth pages, forms... fully externalized" in Phase 70) and the Out-of-Scope table (which excludes only "admin / driver / api routes" from localization, not login/account) both support this assumption at HIGH confidence, so risk is low. |
| A2 | The "multiple root layouts" (route-group) pattern is the right call over `next/root-params` for splitting `<html lang>` between `[locale]` and `(internal)`. | Summary, Architecture Patterns, Anti-Patterns | If `next/root-params` turns out to behave safely (returns `undefined`, doesn't throw, doesn't force full-dynamic rendering) for routes outside `[locale]`, the route-group split is still a correct and shippable choice — it is not a wrong answer, just possibly more file-moves than strictly necessary. Low risk either way. |
| A3 | `messages: {}` (empty object) is an acceptable `i18n/request.ts` return for Phase 68, since zero `useTranslations`/`getTranslations` call sites exist yet. | Code Examples | If any component unexpectedly calls a next-intl hook before Phase 69, it would throw a missing-message error at render time — grep confirmed zero such call sites this session, so risk is low, but the planner should still smoke-test one page from each locale in Phase 68's verification. |

## Open Questions (RESOLVED)

> **RESOLVED (2026-09-03, plan-phase):** All three are operationalized by Phase 68 plan artifacts —
> Q1 → route-group split shipped now (68-01), `next/root-params` deferred to a later cleanup;
> Q2 → next-intl pin handled by the `checkpoint:human-verify` task in 68-01 (default `4.14.2`);
> Q3 → internal `app/(internal)/not-found.tsx` empirically checked in 68-02 Task 2, added only if the built-in fallback is broken.

1. **Should `next/root-params` replace the route-group split in a later cleanup?**
   - What we know: The API is available without a flag in Next.js 16.2.3 and next-intl's own blog documents a `getRequestConfig` recipe using it (Context7 `/amannn/next-intl`, `blog/nextjs-root-params.mdx`).
   - What's unclear: Its exact runtime behavior (throw vs. `undefined`) when accessed from a root layout for a route that never passes through the `[locale]` dynamic segment at all (our `/admin`/`/driver` case) — no worked example for this specific shape was found.
   - Recommendation: Ship the route-group split now (this research's recommendation); revisit `next/root-params` as a Phase 69+ or post-milestone simplification once the API has more real-world mileage, with a `checkpoint:human-verify` to test the fallback behavior directly before adopting.

2. **Does the `next-intl` "too-new" package-legitimacy signal need a stricter pin?**
   - What we know: `4.14.2` was published 2 days before this research; the package itself is long-established with a matching, high-star GitHub repo and 5.4M weekly downloads.
   - What's unclear: Whether the project's install-time verification step wants an older, "cooled down" patch (e.g. `4.14.1`, published earlier) instead.
   - Recommendation: Planner inserts the required `checkpoint:human-verify` before `npm install`; default to `4.14.2` unless the human reviewer prefers pinning `4.14.1`.

3. **Does `/admin` and `/driver` need their own `not-found.tsx` under `app/(internal)/`, or is Next's built-in default acceptable?**
   - What we know: I18N-03 only requires a **per-locale** not-found (i.e. under `app/[locale]/`); the internal branch's 404 behavior isn't mentioned in any success criterion.
   - What's unclear: Whether Next.js 16's multi-root-layout setup requires an explicit `not-found.tsx` per root-layout branch to render correctly, or falls back gracefully to a minimal built-in page.
   - Recommendation: Planner should verify during execution (quick manual check: visit a non-existent `/admin/xyz` path after the split) and add a minimal `app/(internal)/not-found.tsx` only if the built-in fallback looks broken.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|----------|----------|
| Node.js | Build/runtime | Yes | v24.14.1 [VERIFIED: `npx vitest --version` output, run this session — "node-v24.14.1"] | — (meets `package.json` `engines.node: >=24.0.0` [VERIFIED: package.json:5-7]) |
| npm | Package install / registry checks | Yes | (implicit via `npm view` calls run this session) | — |
| `next-intl` npm package | Core dependency | Not yet installed | `4.14.2` on registry | — (installation is a task in this phase) |

**Missing dependencies with no fallback:** none — `next-intl` install is itself an in-scope task.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 [VERIFIED: `npx vitest --version` output, run this session] with `jsdom` environment [VERIFIED: vitest.config.ts:8] |
| Config file | `/Users/romanustyugov/Desktop/Prestigo/vitest.config.ts` |
| Quick run command | `npx vitest run tests/middleware-customer.test.ts` |
| Full suite command | `npx vitest run` (no `"test"` script exists in `package.json` [VERIFIED: package.json:8-14 — scripts are `dev`,`build`,`start`,`lint`,`prepare` only]; planner may want to add one, optional) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| I18N-01 | `/book`, `/about`, etc. resolve unchanged at root, no `/en` prefix | integration (middleware unit test) | `npx vitest run tests/middleware-i18n.test.ts` | ❌ Wave 0 |
| I18N-02 | CSP nonce / Supabase `updateSession` / CSRF Origin-guard preserved byte-for-byte on `/admin`, `/api`, `/auth`, `/driver` | unit (existing suite, must stay green) | `npx vitest run tests/middleware-customer.test.ts` | ✅ (`tests/middleware-customer.test.ts` — must continue passing with ZERO changes to its assertions [VERIFIED: tests/middleware-customer.test.ts:1-217, read in full this session — all assertions use unprefixed paths like `/admin`, `/account`, matching Pattern 1's non-localized branch or the default-locale no-prefix case]) |
| I18N-02 | Locale-prefixed public path (e.g. `/ru/book`) still gets the correct dynamic/static CSP branch and (where applicable) Supabase redirect | unit | `npx vitest run tests/middleware-i18n.test.ts` | ❌ Wave 0 |
| I18N-03 | `<html lang>`/`dir` dynamic per locale, `dir="rtl"` for `ar` | integration/manual (SSR HTML string) | manual: `curl -s https://localhost:3000/ar | grep -o '<html[^>]*>'` or a Vitest RSC-render test if feasible | ❌ Wave 0 (or manual — RSC layout testing is not currently exercised anywhere in this test suite, confirm feasibility during planning) |
| I18N-03 | Per-locale not-found renders (no 404-of-404) | manual | Visit `/ru/this-does-not-exist` in a dev server | manual only — no existing not-found test in `tests/` |
| I18N-04 | Typed locale list is the single source consumed by middleware + layouts | unit (type-level, implicit) | TypeScript compile (`npx tsc --noEmit` or `npm run build`) | ❌ Wave 0 (compile-time check, not a runtime test) |
| I18N-04 | Visiting a configured non-EN subpath renders in English, no 404 | manual/integration | Visit each of `/ru/`, `/es/`, `/fr/`, `/ar/`, `/hi/`, `/zh/` in a dev server | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/middleware-customer.test.ts` (must stay green throughout — it is the existing regression guard for the Supabase auth chain)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the manual `<html lang>/dir` and per-locale-render checks listed above (these are not currently automatable within this test suite's existing patterns without adding RSC-render test infrastructure — flag as human-verify items rather than inventing new test infra scope for a routing phase)

### Wave 0 Gaps
- [ ] `tests/middleware-i18n.test.ts` — new file covering I18N-01/I18N-02 for locale-prefixed public paths (the gap `tests/middleware-customer.test.ts` doesn't cover, since it only exercises unprefixed/default-locale paths)
- [ ] No new shared fixtures needed — `tests/middleware-customer.test.ts`'s `makeRequest`/`makeAdminUser`/`makeCustomerUser` helpers (lines 47-69) are reusable as-is for the new file
- [ ] No framework install needed — Vitest is already configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V2 Authentication | Yes (indirectly) | No change to authentication mechanism itself — Supabase GoTrue via `@supabase/ssr`, `getUser()` (JWT-validated, not `getSession()`) [VERIFIED: lib/supabase/middleware.ts:32-33 — comment "IMPORTANT: getUser() validates JWT with auth server — never use getSession()"]. This phase must not regress that call path. |
| V3 Session Management | Yes | Session cookies set via Supabase SSR's `setAll` callback (lines 19-27 of `lib/supabase/middleware.ts`); Pattern 1 requires this callback to keep writing onto whichever response object is ultimately returned — a bug here is a session-desync risk, not a new vulnerability class, but the highest-likelihood regression in this phase |
| V4 Access Control | Yes | `/admin` non-admin-redirect and `/account` unauthenticated-redirect logic (lines 38-70) — must be preserved for their unprefixed paths (non-localized) and correctly extended (via `stripLocalePrefix`) for the localized `/account`/`/login` paths |
| V5 Input Validation | No new input surface this phase | — (no new user input introduced; locale segment is validated via `hasLocale(routing.locales, locale)` → `notFound()` for anything outside the 7-locale set) |
| V6 Cryptography | No change | CSP nonce generation (`btoa(crypto.randomUUID())`, `middleware.ts:186`) is unchanged by this phase |
| V14 Configuration | Yes | CSP header (`middleware.ts:43-96`) must continue to be emitted identically; adding next-intl does not require any new CSP directive (next-intl performs no client-side script injection of its own beyond what the app already renders) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-------------------------|
| Locale-prefix path confusion bypassing auth/CSRF gating (e.g. an attacker probing `/ru/admin` hoping it's treated as a "public" path and skips the admin auth check) | Elevation of Privilege | Pattern 1's `isNonLocalizedRoute()` check runs BEFORE `handleI18nRouting`, and next-intl's own routing config never includes `/admin` in its locale set at all — an incoming `/ru/admin` request is not a valid next-intl route AND is also not matched by `isNonLocalizedRoute('/ru/admin')` (since it doesn't start with literal `/admin`) so it falls into the public branch, gets locale-stripped to `/admin` for the CSP check... **this is exactly the class of bug Pitfall 1 targets** — the planner's Wave 0 test file must include an explicit case for `/ru/admin` to confirm it does NOT bypass the admin auth redirect (it should 404 via `hasLocale` validation before ever reaching a page, but this must be verified, not assumed) |
| Open redirect via crafted `return-to` param surviving locale prefix change | Tampering | `safeReturnTo()` guard (referenced in STATE.md's v2.0 decisions, `app/login/actions.ts`) already rejects absolute URLs/`//` — unaffected by this phase since it operates on the query param value, not the path prefix; verify it still fires correctly when the redirect target is a locale-prefixed path like `/ru/account` |

## Sources

### Primary (HIGH confidence)
- Context7 `/amannn/next-intl` — "Composing next-intl Middleware with Custom Logic", "Composing other middlewares", `localePrefix: 'as-needed'`, `setRequestLocale`, per-locale `not-found.tsx`, "Multiple root layouts", `i18n/routing.ts` typed config, `next.config.ts` plugin setup
- Context7 `/vercel/next.js/v16.2.9` — Next.js 16 `middleware` → `proxy` rename and edge-runtime constraint, `next/root-params` availability (no flag needed), `global-not-found.tsx` (experimental flag required), "Multiple root layouts" project-structure guide
- `middleware.ts` (this repo) — read in full, lines 1-219
- `lib/supabase/middleware.ts` (this repo) — read in full, lines 1-73
- `app/layout.tsx` (this repo) — read in full, lines 1-131
- `next.config.ts` (this repo) — read in full, lines 1-152
- `package.json` (this repo) — read in full
- `tests/middleware-customer.test.ts` (this repo) — read in full, lines 1-217
- `.planning/REQUIREMENTS.md` and `.planning/STATE.md` — read in full

### Secondary (MEDIUM confidence)
- WebFetch of `github.com/amannn/next-intl/discussions/422` — community/maintainer-endorsed Supabase+next-intl composition recipe (threading the next-intl response into `updateSession`)
- WebFetch of `github.com/orgs/supabase/discussions/18747` — confirms the common failure mode (dropping one middleware's response) that Pattern 1 avoids

### Tertiary (LOW confidence)
- None retained — items that could not be corroborated (e.g. exact `next/root-params` undefined-vs-throw behavior for non-matching routes) were left as Open Questions rather than stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `next-intl` version/peer-deps verified directly against the registry and the installed `next`/`react` versions in this repo
- Architecture: MEDIUM — the middleware composition pattern (Pattern 1/2) is HIGH confidence (matches maintainer-endorsed recipes verified this session); the root-layout split (Pattern 3) is MEDIUM confidence because it's a codebase-specific design choice made in the absence of a documented worked example for the `next/root-params` alternative
- Pitfalls: HIGH — Pitfalls 1, 2, and 4 are all grounded in direct reads of this repo's actual source lines, not general knowledge

**Research date:** 2026-09-03
**Valid until:** 2026-10-03 (30 days — Next.js 16.x and next-intl 4.x are both fast-moving; re-verify `next-intl` version and the `middleware`/`proxy` deprecation status if planning is delayed past this window)
