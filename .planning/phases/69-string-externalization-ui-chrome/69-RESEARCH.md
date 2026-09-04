# Phase 69: String Externalization — UI Chrome - Research

**Researched:** 2026-09-04
**Domain:** next-intl 4.x message catalogs + locale-aware navigation in a Next.js 16 App Router site with a pre-existing composed middleware (Phase 68)
**Confidence:** HIGH

## Summary

Phase 68 established the routing skeleton (`i18n/routing.ts`, composed middleware, split root layouts) but deliberately left `i18n/request.ts` returning `messages: {}` and zero `useTranslations`/`getTranslations` call sites exist anywhere in the codebase. Phase 69 is genuinely greenfield for message-catalog wiring: there is no legacy pattern to reconcile, no existing test mocks to migrate, no prior namespace convention to respect. Everything documented below is either read directly from the current source files this session or pulled from `next-intl@4.14.2`'s own docs via Context7 (the exact version installed and already human-approved in Phase 68).

Two findings drive the shape of the plan more than anything else:

1. **The "shared chrome" pattern from Phase 68 works in Phase 69's favor.** `components/SiteChrome.tsx` is rendered by both `app/[locale]/layout.tsx` (localized) and `app/(internal)/layout.tsx` (admin/driver, hard-coded `lang="en"`, no `next-intl` calls at all). Because `i18n/request.ts` already falls back to `routing.defaultLocale` ('en') when no locale is resolvable, wrapping `SiteChrome`'s children in `NextIntlClientProvider` sourced from `getLocale()`/`getMessages()` is safe on **both** trees — admin/driver pages will simply always receive the 'en' catalog, which matches the "admin/driver stay English-only" requirement without any conditional logic.
2. **The locale-aware `Link`/`usePathname` swap (closing Phase 68's IN-01) is a bigger diff than "swap `next/link` for the i18n one."** Grepping the actual target files found that `Footer.tsx`, `Fleet.tsx`, and `CookieBanner.tsx` use **raw `<a href="/...">` tags for internal links**, not `next/link`'s `Link` — these never had a locale-prefix bug to fix in the sense of "wrong import," they simply never went through Next.js client-side routing at all. Converting them to the next-intl `Link` from `i18n/routing.ts` is required for IN-01 closure and is a bigger, more error-prone diff than swapping `Nav.tsx`'s and `Services.tsx`'s already-`next/link`-based imports.

**Primary recommendation:** Extend `i18n/routing.ts` (not a new file) with `createNavigation(routing)` exports; update `i18n/request.ts` to load `messages/${locale}.json` with an EN fallback; wrap `SiteChrome`'s body in `NextIntlClientProvider` fed by `getLocale()`/`getMessages()`; convert every target component to `useTranslations` (client) or `getTranslations`/`useTranslations` (server, per next-intl's own guidance that a non-interactive Server Component may call the hook directly); replace every raw internal `<a href="/...">` and every `next/link` import across the 9 target components with the `Link` re-exported from `i18n/routing.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STR-01 | All UI-chrome strings (Nav, Footer, Hero, Services, Fleet, HowItWorks, Testimonials, CookieBanner, FeatureStrip, etc.) are moved into message catalogs (`messages/<locale>.json`) with namespaces and consumed via `useTranslations`/`getTranslations` | Standard Stack (no new deps needed), Architecture Patterns 1–5 (namespace/provider/navigation wiring), Common Pitfalls 1–5 (raw-`<a>` link sweep, test-provider gap, `SiteChrome` async ripple, ICU escaping, EN-byte-for-byte scope boundary), Code Examples (`i18n/request.ts`, `messages/en.json` convention), Open Question 1 (non-EN locale stub files, directly determines whether `/ru/` etc. keep rendering after this phase ships) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Message catalog loading (`messages/en.json`) | Frontend Server (SSR) | — | `i18n/request.ts`'s `getRequestConfig` runs server-side per request; catalogs are bundled at build/request time, never fetched client-side |
| Server-component translation (Footer, Fleet, HowItWorks, Services, FeatureStrip, HeroRating, Testimonials) | Frontend Server (SSR) | — | These are non-interactive React Server Components; `useTranslations`/`getTranslations` both run server-side with zero client JS cost |
| Client-component translation (Nav, CookieBanner, HeroTypewriter, HeroWhatsApp, HeroBackground) | Browser / Client | Frontend Server (SSR) | `'use client'` components need `useTranslations` fed by `NextIntlClientProvider`'s hydrated `messages` prop — the provider itself is set up server-side in `SiteChrome.tsx` |
| Locale-aware internal navigation (`Link`, `usePathname`) | Browser / Client | Frontend Server (SSR) | `createNavigation()`'s `Link`/`usePathname` work in both RSC and client trees (dual `react-server`/`react-client` export condition), but the *behavior* users perceive (locale-prefixed hrefs, active-link state) is a client-navigation concern |
| Provider wiring (`NextIntlClientProvider`) | Frontend Server (SSR) | — | Must be established in `SiteChrome.tsx` (a Server Component) so `getMessages()`/`getLocale()` can read the resolved request config before handing messages to the client subtree |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-intl | 4.14.2 | Message catalogs, `useTranslations`/`getTranslations`, `NextIntlClientProvider`, `createNavigation` | Already installed and human-approved in Phase 68 (package-legitimacy checkpoint cleared); `npm view next-intl version` confirms `4.14.2` is still the exact version on the registry `[VERIFIED: npm registry, checked this session]` — no version drift since Phase 68 |

**No new packages this phase.** Phase 69 exercises `next-intl` APIs the site does not yet call (`useTranslations`, `getTranslations`, `NextIntlClientProvider`, `createNavigation`, `getMessages`, `getLocale`) but installs nothing new.

### Supporting
None required — this phase is pure application-code wiring against an already-installed dependency.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next-intl`'s `createNavigation` | Hand-rolled `usePathname()` + string-prefix concatenation | Rejected — Phase 68's own `stripLocalePrefix` exists for middleware-internal use only; hand-rolling a second locale-prefixing implementation in component code would violate I18N-04's single-source discipline and re-introduce exactly the bug class IN-01 exists to close |
| A single flat `messages/en.json` | Per-namespace JSON files (`messages/en/nav.json`, `messages/en/footer.json`, ...) merged in `i18n/request.ts` | A single file is simpler for a catalog this size (9 components) and matches next-intl's own documented default (`import(`../../messages/${locale}.json`)`); split-file loading is a Phase 72+ concern only if the catalog grows large enough to matter for bundle size |

## Package Legitimacy Audit

**No new packages installed this phase.** `next-intl@4.14.2` was audited and approved via a blocking-human checkpoint in Phase 68 (68-01-SUMMARY.md key-decisions: "amannn/next-intl, 5+ year old package, 5.4M weekly downloads, no postinstall script"). `npm view next-intl version` re-confirms `4.14.2` is current on the registry this session — no re-audit needed.

## Architecture Patterns

### System Architecture Diagram

```
Request (e.g. GET /ru/)
        │
        ▼
middleware.ts (Phase 68 — unchanged)
  isNonLocalizedRoute? ──yes──▶ /admin,/api,/auth,/driver (no locale header set)
        │no
        ▼
  handleI18nRouting() sets x-next-intl-locale header
        │
        ▼
i18n/request.ts (getRequestConfig)
  requested = requestLocale (from header, or undefined on internal branch)
  locale = hasLocale(routing.locales, requested) ? requested : 'en'
  messages = (await import(`../messages/${locale}.json`)).default
        │
        ▼
app/[locale]/layout.tsx  ──or──  app/(internal)/layout.tsx
  (both call) <SiteChrome>{children}</SiteChrome>
        │
        ▼
components/SiteChrome.tsx (Server Component)
  locale = await getLocale()
  messages = await getMessages()
  <NextIntlClientProvider locale={locale} messages={messages}>
    <body>{children}<CookieBanner/>...</body>
  </NextIntlClientProvider>
        │
        ├─▶ Server components (Footer, Fleet, Services, HowItWorks,
        │    FeatureStrip, HeroRating, Testimonials) call
        │    useTranslations('Namespace') or getTranslations('Namespace')
        │    directly — no provider needed, runs server-side
        │
        └─▶ Client components (Nav, CookieBanner, HeroTypewriter,
             HeroWhatsApp, HeroBackground) call useTranslations('Namespace')
             — reads from the NextIntlClientProvider context set above
```

### Recommended Project Structure
```
messages/
└── en.json              # single flat file, top-level keys = component namespaces
i18n/
├── routing.ts            # EXTEND (not replace): add createNavigation(routing) exports
└── request.ts            # MODIFY: load messages/${locale}.json with EN fallback
components/
├── SiteChrome.tsx         # MODIFY: wrap body in NextIntlClientProvider
├── Nav.tsx                # MODIFY: useTranslations('Nav'); Link/usePathname from i18n/routing
├── Footer.tsx              # MODIFY: useTranslations('Footer'); raw <a> → Link
├── Hero.tsx                # MODIFY: getTranslations('Hero') (async) or useTranslations
├── HeroTypewriter.tsx       # MODIFY: useTranslations('Hero') — client, rotating word list
├── HeroRating.tsx            # MODIFY: useTranslations('Hero') — server
├── HeroWhatsApp.tsx           # MODIFY: useTranslations('Hero') — client
├── HeroBackground.tsx          # MODIFY: useTranslations('Hero') — client, alt text only
├── Services.tsx                 # MODIFY: useTranslations('Services'); Link import swap
├── Fleet.tsx                     # MODIFY: useTranslations('Fleet'); raw <a> → Link
├── HowItWorks.tsx                  # MODIFY: useTranslations('HowItWorks')
├── Testimonials.tsx                  # MODIFY: getTranslations('Testimonials') (async server)
├── CookieBanner.tsx                    # MODIFY: useTranslations('CookieBanner'); t.rich for links
└── FeatureStrip.tsx                      # MODIFY: useTranslations('FeatureStrip')
```

### Pattern 1: Extending `i18n/routing.ts` with `createNavigation` (not a new file)

**What:** The phase description explicitly says "next-intl `createNavigation`/`Link` from `i18n/routing.ts`" — extend the existing single-source file rather than introducing `i18n/navigation.ts`, matching Phase 68's own established convention ("extend this file, never redeclare the locale list elsewhere").

**When to use:** Any component needing an internal link, programmatic navigation, or the active-pathname check.

**Example:**
```typescript
// Source: Context7 /amannn/next-intl — "Basic Usage of createNavigation"
// i18n/routing.ts — appended to the existing file (routing.ts already
// exports `routing`, `locales`, `AppLocale`, `rtlLocales`, `stripLocalePrefix`)
import { createNavigation } from 'next-intl/navigation'
// ... existing defineRouting code above ...
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```
`next-intl/navigation` is a valid subpath export of the installed package `[VERIFIED: node_modules/next-intl/package.json "exports" field, contains "./navigation"]`.

### Pattern 2: `usePathname` from `createNavigation` strips the locale prefix automatically

**What:** `Nav.tsx`'s active-link check (`pathname === link.href`) currently compares `next/navigation`'s `usePathname()` (raw, includes any locale prefix) against unprefixed hrefs like `/services`. Swapping in the i18n-routing version requires no change to the comparison logic — it already returns the unprefixed path.

**When to use:** Any component doing pathname-based conditional rendering (active nav state, breadcrumbs).

**Example:**
```tsx
// Source: Context7 /amannn/next-intl — "usePathname basic usage"
// When the user is on `/ru`, this will be `/` (not `/ru`)
'use client'
import { usePathname } from '@/i18n/routing'
const pathname = usePathname()
```
This de-risks `Nav.tsx`'s existing `pathname === link.href ? 'text-offwhite' : ...` logic — it needs zero changes beyond the import swap.

### Pattern 3: `NextIntlClientProvider` wired once in `SiteChrome.tsx`, not per-layout

**What:** Because `SiteChrome.tsx` is a Server Component shared by both root layouts, and because `i18n/request.ts` already gracefully falls back to `'en'` when no locale header is present (the `(internal)` branch), the provider can wrap `SiteChrome`'s entire body in one place instead of duplicating it in `app/[locale]/layout.tsx` and `app/(internal)/layout.tsx` separately.

**When to use:** Exactly once, in `SiteChrome.tsx`.

**Example:**
```tsx
// Source: Context7 /amannn/next-intl — "app/layout.tsx setup" + "Configure Request Messages"
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

export default async function SiteChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <>
      <head>{/* ...unchanged... */}</head>
      <body className={`${fraunces.variable} ${inter.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#main-content" className="skip-link btn-primary">Skip to content</a>
          {children}
          <GoogleAnalytics /><AnalyticsPageView /><Clarity /><MetaPixel />
          <CookieBanner /><EngagementTracker />
        </NextIntlClientProvider>
      </body>
    </>
  )
}
```
**Note:** `SiteChrome` becomes `async` — verify this doesn't conflict with its current synchronous signature at both call sites (`app/[locale]/layout.tsx` already awaits nothing from `SiteChrome`, calls it as `<SiteChrome>{children}</SiteChrome>` inside an already-async `LocaleLayout`; `app/(internal)/layout.tsx`'s `InternalLayout` is currently **synchronous** — it will need to become `async` too, a small ripple the planner should call out explicitly as a task, not an incidental side effect).

### Pattern 4: Server components call `useTranslations` directly (no `await`) unless already async

**What:** next-intl's own docs are explicit: a Server Component that doesn't use any interactive React feature can call `useTranslations` synchronously (it's a Server Component, not a client hook in the traditional sense). Only genuinely `async` Server Components (ones that `await` data, like `Testimonials.tsx` which awaits `getReviews()`) must use the awaitable `getTranslations` instead, because React hooks cannot be called after an `await` boundary.

**When to use:**
- `Footer.tsx`, `Fleet.tsx`, `HowItWorks.tsx`, `Services.tsx`, `FeatureStrip.tsx`, `HeroRating.tsx` — all synchronous Server Components today → `useTranslations('Namespace')`, no `await`.
- `Hero.tsx` — synchronous Server Component today (props are passed in, not fetched) → `useTranslations('Hero')`.
- `Testimonials.tsx` — **already `async`** (awaits `getReviews()`) → must use `await getTranslations('Testimonials')`, not the hook.

**Example:**
```tsx
// Source: Context7 /amannn/next-intl — "Server Component using useTranslations" vs
// "Async Server Component using getTranslations"
// Footer.tsx (sync Server Component)
import { useTranslations } from 'next-intl'
export default function Footer() {
  const t = useTranslations('Footer')
  return <p className="label mb-3">{t('ctaLabel')}</p>
}

// Testimonials.tsx (async Server Component — already awaits getReviews())
import { getTranslations } from 'next-intl/server'
export default async function Testimonials() {
  const reviews = await getReviews()
  const t = await getTranslations('Testimonials')
  return <h2>{t('heading')}</h2>
}
```

### Pattern 5: Rich text for the CookieBanner's embedded Privacy Policy / Legal Notice links

**What:** `CookieBanner.tsx`'s consent paragraph embeds two inline `<a>` tags inside a sentence ("...You may revoke or change your choice at any time. [Privacy Policy] · [Legal Notice]"). This needs `t.rich()`, not plain `t()`, because the link markup must stay inside the translated sentence for every locale (word order changes across languages).

**Example:**
```tsx
// Source: Context7 /amannn/next-intl — "Render rich text formatting with t.rich"
import { Link } from '@/i18n/routing'
const t = useTranslations('CookieBanner')
<p>
  {t.rich('consentBody', {
    privacy: (chunks) => <Link href="/privacy" className="text-copper-light hover:text-copper underline underline-offset-2">{chunks}</Link>,
    terms: (chunks) => <Link href="/terms" className="text-copper-light hover:text-copper underline underline-offset-2">{chunks}</Link>,
  })}
</p>
```
```json
// messages/en.json (excerpt)
"CookieBanner": {
  "consentBody": "Before your journey begins, a quick word on privacy. We use third-party technologies to run the booking flow and refine the experience. You may revoke or change your choice at any time. <privacy>Privacy Policy</privacy> · <terms>Legal Notice</terms>"
}
```

### Anti-Patterns to Avoid
- **Calling `useTranslations`/`getTranslations` before `setRequestLocale`/`hasLocale` validation runs:** `app/[locale]/layout.tsx` already calls `hasLocale` + `notFound()` + `setRequestLocale` before rendering `SiteChrome` — this ordering must be preserved; don't move translation calls earlier in the tree.
- **Re-declaring locale-prefix logic in a component:** every internal link goes through the `Link` re-exported from `i18n/routing.ts`. Do not hand-write `` `/${locale}${href}` `` string concatenation anywhere — that duplicates `stripLocalePrefix`'s job and is exactly the class of bug IN-01 exists to close.
- **Wrapping `SiteChrome`'s provider only in `app/[locale]/layout.tsx`:** this would leave `CookieBanner` (rendered by `app/(internal)/layout.tsx` too) throwing "no intl context found" on every `/admin` and `/driver` page. The provider must live inside `SiteChrome.tsx` itself (Pattern 3).
- **Treating `HeroTypewriter`'s word array as one message key:** the 5 rotating phrases (`words[0]` must stay the visually widest for LCP reasons — see the component's own comment) need 5 separate keys or a `t.raw()` array, not one comma-joined string, so a later phase's translation pipeline can reorder per-locale without touching code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Locale-prefixed internal links | Manual `${locale}${href}` string concatenation, or a custom `LocalizedLink` wrapper around `next/link` | `Link` re-exported from `i18n/routing.ts` (`createNavigation`) | Handles `localePrefix: 'as-needed'` (no `/en` prefix) automatically, matches Phase 68's routing config exactly, single source of truth |
| Active-pathname comparison across locales | Manually stripping the locale segment before comparing `pathname === href` | `usePathname` from `i18n/routing.ts` | Already strips the prefix (Pattern 2) — a hand-rolled strip would duplicate `stripLocalePrefix` and risk drifting from it |
| Message file loading with locale fallback | A custom `try { require(...) } catch { require(en) }` loader | `getRequestConfig`'s own `hasLocale` + dynamic `import()` (already the pattern `i18n/request.ts` uses for locale resolution) | next-intl's documented pattern is exactly `(await import(`../../messages/${locale}.json`)).default` — no custom fallback plumbing needed since Phase 69 only ships `en.json` and every other locale falls back to the resolved `defaultLocale` at the `i18n/request.ts` level, not a per-file try/catch |
| Rich-text interpolation (embedded links inside translated sentences) | Regex-splitting a translated string and re-inserting JSX | `t.rich()` | This is exactly what ICU rich text + next-intl's `t.rich` API exists for (Pattern 5) |

**Key insight:** Every "don't hand-roll" item above has a direct, already-verified next-intl API. The temptation in this phase is to write helper functions to bridge Phase 68's routing config to component-level navigation — resist it; `createNavigation(routing)` is that bridge.

## Common Pitfalls

### Pitfall 1: Raw `<a href="/...">` internal links silently bypass locale-prefixing
**What goes wrong:** Converting only the components that already import `next/link`'s `Link` (Nav.tsx, Services.tsx) and missing the raw `<a>` tags leaves IN-01 half-closed — a `/ru/` visitor clicking "Book now" in the footer, "See pricing →" in Fleet, or "Privacy Policy"/"Legal Notice" in the cookie banner gets bounced to the English root instead of staying in `/ru/`.
**Why it happens:** `next/link`'s `Link` and a raw `<a>` render visually identically and both "work" in the sense of navigating — the locale-loss bug is only visible by testing from a non-default-locale subpath, easy to miss if verification only checks `/`.
**How to avoid:** Grep-verified list of files with raw internal `<a href="/...">` this session — treat this as the authoritative punch list:
- `components/Footer.tsx` — lines 15 (`/book`), 51 (`s.href`, 8 service-list items), 74 (`r.href`, 5 route-list items), 80 (`/routes`), 97 (`g.href`, 3 blog-list items), 103 (`/blog`), 160 (`/privacy`), 168 (`/terms`)
- `components/Fleet.tsx` — line 82 (`/book`)
- `components/CookieBanner.tsx` — lines 172 (`/privacy`), 179 (`/terms`)

All confirmed via `grep -n 'href='` against the current file contents this session `[VERIFIED: components/Footer.tsx, components/Fleet.tsx, components/CookieBanner.tsx — read directly]`. `tel:`, `mailto:`, `https://` (WhatsApp, Instagram, Facebook), and same-page `#book`/`#main-content` fragment anchors correctly stay as raw `<a>` — do not convert those.
**Warning signs:** A manual click-through from `/ru/` (not `/`) on every footer link, the Fleet "See pricing →" link, and the CookieBanner's Privacy/Legal links, confirming the URL bar still shows `/ru/...` after navigation.

### Pitfall 2: `nav-auth.test.tsx` will break the moment `Nav.tsx` calls `useTranslations`
**What goes wrong:** `tests/nav-auth.test.tsx` renders `<Nav />` directly with no `NextIntlClientProvider` wrapper `[VERIFIED: tests/nav-auth.test.tsx:97,110,132,151,173,194,211,233 — read directly, all render(<Nav />) calls]`. Once `Nav.tsx` calls `useTranslations('Nav')`, every one of these 8 render calls throws "No intl context found" and the entire NAV-01/NAV-02 regression suite goes red.
**Why it happens:** `tests/setup.ts` has no global next-intl mock or provider wrapper `[VERIFIED: tests/setup.ts — read directly, no next-intl references]` — this is the first component test in the repo that will touch next-intl hooks.
**How to avoid:** Add a small test-local wrapper (either a literal `NextIntlClientProvider locale="en" messages={enMessages}` import of `messages/en.json`, per next-intl's own documented "Basic Component Testing" pattern, or a `vi.mock('next-intl', ...)` stub returning `key => key` if the test suite prefers not to depend on the real catalog). Also add `vitest.config.ts`'s `test.server.deps.inline: ['next-intl']` — next-intl's own testing docs flag this as required specifically once `createNavigation` is exercised (a documented Vercel/Next.js ESM-bundling issue, vercel/next.js#77200) — the current `vitest.config.ts` does not have this `[VERIFIED: vitest.config.ts — read directly, no `deps.inline` config present]`.
**Warning signs:** `vitest run` failing with "No intl context found for the ... component" the moment Nav.tsx's translation call lands, even before any test assertion runs.

### Pitfall 3: `SiteChrome` becoming `async` ripples into `app/(internal)/layout.tsx`
**What goes wrong:** `app/(internal)/layout.tsx`'s `InternalLayout` function is currently synchronous (`export default function InternalLayout(...)`) `[VERIFIED: app/(internal)/layout.tsx:9 — read directly, "export default function InternalLayout"]`. If `SiteChrome` becomes `async` (needed to call `getLocale()`/`getMessages()`), calling it as `<SiteChrome>{children}</SiteChrome>` from a synchronous parent still works at the JSX level (React allows rendering async Server Components as children), but the planner should explicitly verify this with a build, not assume it — Next.js 16's App Router generally handles async Server Component children fine, but it's an untested-in-this-repo combination.
**Why it happens:** Nothing in the codebase today calls an async component from inside a sync one; Phase 68's split intentionally kept both layouts minimal.
**How to avoid:** After wiring, run `npm run build` and manually load `/admin/login` and `/driver` to confirm no dev-mode "cannot await inside a synchronous component" style error; this is exactly the kind of edge Phase 68's own verification protocol caught with `lastModFor()`/husky-hook breakage — expect a similar small ripple here, not a design flaw.
**Warning signs:** A build-time or dev-server error mentioning `SiteChrome` returning a Promise where a `ReactNode` was expected.

### Pitfall 4: ICU message format — `#book`/`{price}` interpolation and stray curly braces
**What goes wrong:** `Services.tsx`'s price callouts (`` `From €${airportPrice}` ``, `` `From €${hourlyFrom}/hr` ``) and `Hero.tsx`'s price anchor (`` `Airport transfers from €${airportPrice} — fixed price, no surcharges` ``) interpolate a runtime number into the string. If the JSON message is written as `"From €{price}"` and passed via `t('fromAirport', { price: airportPrice })`, ICU treats `{price}` as an argument placeholder — this works, but a message author accidentally typing a literal `{` or `}` elsewhere in copy (not intended as an argument) will throw a compile error at render time, not silently misrender.
**Why it happens:** ICU MessageFormat reserves `{`, `}`, `#`, `<`, `|`, and `'` as syntax characters; an apostrophe (e.g. a future "driver's" in translated copy) also needs the `''` escape (two single quotes) to render as one literal apostrophe `[CITED: next-intl docs, "ICU double-single-quote apostrophe escaping"]`. None of the current EN strings in the 9 target components contain a literal apostrophe or unintended brace (verified by reading every target file this session), so Phase 69 itself is not at risk — but the message-catalog authors for Phase 72/73 translations need this documented so a translated string with a contraction doesn't break the build.
**How to avoid:** Use named ICU arguments (`{price}`) for every runtime-interpolated value; never string-concatenate translated text with a raw JS template literal.
**Warning signs:** A next-intl build/dev-server error referencing "MALFORMED_ARGUMENT" or a similar ICU parse failure on a specific message key.

### Pitfall 5: Byte-for-byte EN preservation — what's IN scope vs OUT of scope for this phase
**What goes wrong:** Externalizing strings that live in `siteMetadata` (title/description/OG tags in `components/SiteChrome.tsx`) or JSON-LD (`app/[locale]/page.tsx`'s `localBusinessSchema`) would touch SEO surface explicitly reserved for Phase 74 (SEO-01..04) and risk a Phase-69-scoped PR silently changing `<title>`/meta output — a regression the phase's own "EN output stays byte-for-byte unchanged" requirement exists to prevent.
**Why it happens:** `siteMetadata` and the JSON-LD block live in files adjacent to the target UI-chrome components (`SiteChrome.tsx` is literally where the provider gets wired) — easy to over-reach while already editing the file.
**How to avoid:** Externalize only the 9 named components' *rendered UI text* (labels, headings, body copy, button text, aria-labels tied to interactive elements, alt text on content images). Leave `siteMetadata`, `generateMetadata` calls, and JSON-LD strings untouched — they stay hardcoded EN literals until Phase 74.
**What SHOULD be externalized in this phase (confirmed by reading every target file):** all visible UI copy in the 9 components; `aria-label`s tied to interactive controls the user operates (`aria-label="Account menu"`, `aria-label="Menu"`, `HeroRating`'s `aria-label="Rated {x} out of 5..."`, `Toggle`'s `sr-only` "Enabled"/"Disabled"); `alt` text on content photography (`HeroBackground`'s `HERO_ALT`, `Fleet`'s `photoAlt`, `HowItWorks`'s `photoAlt`) — these are user-facing (screen readers, SEO alt-text) and squarely "UI chrome" text, not metadata.
**What should NOT be externalized:** `siteMetadata` (title/description/OG/twitter cards), JSON-LD structured data, vehicle model names (`Mercedes-Benz E-Class` etc. — proper nouns per the project's locked brand-glossary convention), the company legal block (`chelautotrans s.r.o.`, `IČO: 05650801`, `Spojovací 685, Vysoký Újezd` — legal entity name/registration number/street address are not translatable copy), phone numbers, email addresses, and social/WhatsApp URLs.

## Code Examples

### `i18n/request.ts` — loading real message catalogs (replaces the Phase 68 stub)
```typescript
// Source: Context7 /amannn/next-intl — "Configure Request Messages"
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
```
Note: only `messages/en.json` exists after this phase (STR-01 is EN-only, TR-02 fills in the other 6 locales in Phase 72/73). Every non-`en` locale resolves through `hasLocale` fallback to `en` at the *locale* level — but the `import(`../messages/${locale}.json`)` line will 404/throw for `ru`, `es`, etc. **until those files exist.** The planner must decide: either (a) ship all 7 empty/EN-copy files this phase so the import never throws, or (b) keep the import path conditional on the resolved (already-EN-falling-back) `locale` variable, which is what the snippet above already does — the `locale` variable is `routing.defaultLocale` ('en') whenever the requested locale isn't in `routing.locales`, but a *validly configured* locale like `ru` that simply has no message file yet **will** throw. This is a genuine Open Question below, not a solved pitfall — flag it for the plan.

### `messages/en.json` — namespace + key convention (excerpt, establishes the reusable pattern for Phases 70/71)
```json
{
  "Nav": {
    "services": "Services",
    "fleet": "Fleet",
    "routes": "Routes",
    "multiDay": "Multi-day",
    "corporate": "Corporate",
    "contact": "Contact",
    "new": "NEW",
    "signIn": "Sign in",
    "accountMenu": "Account menu",
    "myTrips": "My trips",
    "profile": "Profile",
    "signOut": "Sign out",
    "bookNow": "Book now",
    "menu": "Menu"
  },
  "Footer": {
    "ctaLabel": "Ready to travel?",
    "ctaHeadlineLine1": "Book your transfer.",
    "ctaHeadlineLine2": "We handle the rest.",
    "bookNow": "Book now"
  }
}
```
Convention: top-level key = component name (matches the phase description's own component list verbatim — `Nav`, `Footer`, `Hero`, `Services`, `Fleet`, `HowItWorks`, `Testimonials`, `CookieBanner`, `FeatureStrip`), sub-keys = camelCase, short, semantic (not literal-text-derived) so later locale files can carry entirely different string lengths/word orders without key churn.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 |
| Config file | `vitest.config.ts` (jsdom environment, `tests/setup.ts` global setup, `@` alias to repo root) |
| Quick run command | `npx vitest run tests/nav-auth.test.tsx` (single-file, fastest signal for the highest-risk regression) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STR-01 | Nav renders translated EN labels identical to current hardcoded text | unit | `npx vitest run tests/nav-auth.test.tsx` | ✅ (needs `NextIntlClientProvider` wrapper — Wave 0 gap) |
| STR-01 | Internal links from `/ru/...` stay locale-prefixed (Footer, Fleet, CookieBanner, Nav, Services) | e2e/manual | `npm run dev` then manual click-through from a `/ru/` page | ❌ — no existing automated locale-navigation test; recommend a new `tests/i18n-navigation.test.tsx` unit test asserting `Link`'s resolved `href` carries the locale prefix for a representative sample (Nav's `/services`, Footer's `/book`, Fleet's `/book`) |
| STR-01 | `npm run build` succeeds with the new message catalog and provider wiring | integration | `npm run build` | ✅ (existing build command, no new file needed) |
| STR-01 | EN output byte-for-byte unchanged (visual regression) | manual | Human diff of rendered `/` before/after against a saved snapshot, or targeted DOM-text assertions in updated component tests | ❌ — no visual-regression tooling in this repo; rely on the translated `en.json` values being copy-pasted verbatim from the current hardcoded JSX text (not re-typed), and a human spot-check |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/nav-auth.test.tsx` (fastest, highest-risk regression check)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + `npm run build` green + a live `npm run dev` spot-check from `/ru/` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — add `test.server.deps.inline: ['next-intl']` (required once `createNavigation` is exercised — Pitfall 2, `[CITED: next-intl docs testing.mdx, referencing vercel/next.js#77200]`)
- [ ] `tests/nav-auth.test.tsx` — wrap all 8 `render(<Nav />)` calls in a `NextIntlClientProvider` (or a `vi.mock('next-intl', ...)` stub); currently zero provider wrapping (Pitfall 2)
- [ ] `messages/en.json` — does not exist yet; must be created before any component's `useTranslations` call can resolve at all (build-breaking if missing, not just test-breaking)
- [ ] Recommend (not required by STR-01's letter, but closes IN-01's actual verification gap): a small `tests/i18n-navigation.test.tsx` asserting representative `Link` hrefs carry the locale prefix from a non-default locale

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 69 touches `Nav.tsx`'s already-existing auth-state rendering only cosmetically (translated labels); no auth logic changes |
| V3 Session Management | no | No session-handling code touched |
| V4 Access Control | no | No route-gating logic touched; middleware/access-control is Phase 68's completed surface, untouched here |
| V5 Input Validation | no | No user input is accepted or parsed by any of the 9 target components |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via translated rich-text (`t.rich`) rendering unsanitized HTML | Tampering | next-intl's `t.rich()` takes React-component renderers per tag (Pattern 5) — it never injects raw HTML strings, so this is structurally safe as long as message JSON values are static (author-controlled) content, never user input. Message catalog files are static JSON shipped with the build, not runtime-fetched from an untrusted source — no additional mitigation needed beyond "don't let `t.rich` render a message sourced from user input," which does not apply to any of the 9 target components. |
| Open redirect via `redirect()`/`useRouter().push()` from `createNavigation` | Tampering | Not exercised this phase — Phase 69 only uses `Link`/`usePathname`, not `redirect`/`useRouter`. Flag for whichever future phase first calls `redirect()` programmatically: `createNavigation`'s `redirect` only accepts internal pathnames resolved through `routing`, structurally safe against arbitrary external redirect targets. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A single flat `messages/en.json` (not split per-namespace files) is the right structure for this phase's catalog size | Standard Stack / Recommended Project Structure | Low — next-intl supports both; splitting later is a mechanical refactor, not a breaking change to component code (components import via `useTranslations('Namespace')`, agnostic to file layout) |
| A2 | `SiteChrome` can safely become `async` when called from the still-synchronous `InternalLayout` | Pitfall 3 | Medium — if Next.js 16's App Router does NOT tolerate a sync parent rendering an async child in this specific configuration, `app/(internal)/layout.tsx` needs to become `async` too (a one-line, low-risk fix, but must be verified with an actual build+dev-server check, not assumed) |
| A3 | Non-`en` locales (`ru`, `es`, ...) either get placeholder message files this phase, or the `i18n/request.ts` import needs a try/catch fallback to avoid a 404 on `/ru/` once `useTranslations` calls exist | Code Examples / `i18n/request.ts` | High if unresolved — this is the one genuinely open technical question in this research; see Open Questions below, it directly affects whether `/ru/`, `/es/`, etc. render at all after this phase ships |
| A4 | `TestimonialsCarousel.tsx`'s 4 aria-labels ("out of 5 stars", "Testimonials", "Testimonial pagination", "Go to slide N") are out of this phase's literal scope since the phase description names "Testimonials" but not "TestimonialsCarousel" as a sub-part (unlike Hero, which explicitly says "and its sub-parts") | Common Pitfalls / Don't Hand-Roll context | Low — deferring these 4 short aria-labels to a later phase leaves a minor, non-blocking a11y gap; including them is a trivial addition if the planner chooses to expand scope |

**If this table is empty:** N/A — see entries above; A3 is the one item genuinely worth a locked decision before planning proceeds.

## Open Questions

1. **Does `/ru/`, `/es/`, `/fr/`, `/ar/`, `/hi/`, `/zh/` need placeholder message files this phase, or does the message-loading `import()` need a fallback?**
   - What we know: `i18n/request.ts`'s locale-resolution `hasLocale` check already falls back cleanly to `en` for *invalid/unconfigured* locale strings. But `ru` etc. ARE configured (in `routing.locales`) — they are valid locales that Phase 68 already serves at `/ru` (rendering English content today, since `messages: {}` means every `useTranslations` call would currently throw if one existed). Once real `useTranslations` calls land in this phase, a request to `/ru/` will resolve `locale = 'ru'` (a valid, configured locale) and then attempt `import('../messages/ru.json')`, which does not exist yet.
   - What's unclear: whether the plan should (a) ship 6 stub `messages/{ru,es,fr,ar,hi,zh}.json` files this phase that are byte-identical copies of `en.json` (so every non-EN locale renders in English until Phase 72/73's real translation lands — arguably the correct behavior anyway, since "NO translation of other locales yet" is explicit in the phase description), or (b) add a try/catch fallback in `i18n/request.ts` that imports `en.json` whenever the locale-specific file is missing.
   - Recommendation: **Option (a)** — ship 6 EN-copy stub files. It's simpler, avoids a runtime try/catch that masks a genuinely missing file in a later phase (if `ru.json` is *supposed* to exist by Phase 73 and doesn't, a silent EN fallback would hide a real bug), and matches the phase description's explicit "EN output stays byte-for-byte unchanged; NO translation of other locales yet" — non-EN locales rendering EN text via their own EN-copy file is the correct, visible, easily-greppable interim state. Flag this as a locked decision for `/gsd-discuss-phase` or the plan itself, since it changes the file count materially (7 JSON files instead of 1).

2. **Should `Hero.tsx` use `useTranslations` (sync) or `getTranslations` (async)?**
   - What we know: `Hero.tsx` today is a synchronous Server Component (`export default function Hero(...)`, no `await` anywhere in its body) — per Pattern 4, it qualifies for the synchronous `useTranslations` hook.
   - What's unclear: nothing technical — this is settled. Flagging only because `Hero.tsx` is the most visually prominent component in the phase (LCP-critical, per its own extensive comments) and the planner should explicitly confirm no `await` is introduced elsewhere in the same task that would force a switch to `getTranslations`.
   - Recommendation: `useTranslations('Hero')`, synchronous, no behavior change to the component's async/sync signature.

## Environment Availability

Skipped — this phase has no external tool/service dependencies beyond the already-installed, already-verified `next-intl@4.14.2` npm package. No database, no new CLI, no third-party API.

## Sources

### Primary (HIGH confidence)
- Context7 `/amannn/next-intl` — queried for: (1) messages/NextIntlClientProvider/useTranslations-vs-getTranslations setup, (2) createNavigation/Link/usePathname/redirect wiring, (3) ICU rich-text and apostrophe-escaping syntax, (4) vitest/jest testing configuration for next-intl
- `node_modules/next-intl/package.json` — confirmed `./navigation`, `./server`, `./routing` subpath exports exist in the installed 4.14.2 package
- `node_modules/next-intl/dist/types/server/react-server/{getMessages,getLocale,getTranslations}.d.ts` — confirmed these exports exist
- `node_modules/next-intl/dist/types/shared/NextIntlClientProvider.d.ts` — confirmed `locale`/`messages` prop shape
- Direct `Read` of every target file this session: `i18n/routing.ts`, `i18n/request.ts`, `next.config.ts`, `app/[locale]/layout.tsx`, `app/(internal)/layout.tsx`, `components/SiteChrome.tsx`, `components/Nav.tsx`, `components/Footer.tsx`, `components/Hero.tsx`, `components/HeroTypewriter.tsx`, `components/HeroRating.tsx`, `components/HeroWhatsApp.tsx`, `components/HeroBackground.tsx`, `components/Services.tsx`, `components/Fleet.tsx`, `components/HowItWorks.tsx`, `components/Testimonials.tsx`, `components/CookieBanner.tsx`, `components/FeatureStrip.tsx`, `tests/nav-auth.test.tsx`, `tests/setup.ts`, `vitest.config.ts`
- `npm view next-intl version` — confirmed `4.14.2` current on the registry this session

### Secondary (MEDIUM confidence)
- None — all claims in this research trace to a directly-read source file or a Context7-sourced official next-intl doc page.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, exact installed version re-confirmed against the registry
- Architecture: HIGH — every pattern traces to either a directly-read source file or an official next-intl doc page fetched via Context7 this session
- Pitfalls: HIGH for Pitfalls 1–4 (each grounded in a direct file read or an official doc citation); MEDIUM for Pitfall 5's scope boundary (a reasoned judgment call about what counts as "UI chrome" vs "metadata," not a verified fact)

**Research date:** 2026-09-04
**Valid until:** 30 days (next-intl is a stable, mature library; the only fast-moving risk is Next.js 16 itself, already pinned and working per Phase 68)
