---
phase: 68-i18n-foundation-routing
reviewed: 2026-09-03T19:51:07Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - middleware.ts
  - lib/supabase/middleware.ts
  - i18n/routing.ts
  - i18n/request.ts
  - next.config.ts
  - components/SiteChrome.tsx
  - components/Nav.tsx
  - components/admin/AdminSidebar.tsx
  - app/[locale]/layout.tsx
  - app/(internal)/layout.tsx
  - app/[locale]/not-found.tsx
  - app/(internal)/not-found.tsx
  - app/not-found.tsx
  - app/auth/callback/route.ts
  - app/sitemap.ts
  - .husky/pre-commit
  - package.json
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 68: Code Review Report

**Reviewed:** 2026-09-03T19:51:07Z
**Depth:** standard
**Files Reviewed:** 17 (13 read in full + package.json/package-lock.json spot-checked)
**Status:** issues_found (no blockers)

## Summary

Reviewed the composed `middleware.ts` chain (next-intl → CSP nonce → Supabase `updateSession` → CSRF Origin-guard), `lib/supabase/middleware.ts`, `i18n/routing.ts`/`i18n/request.ts`, `next.config.ts`, the two split root layouts + three `not-found` surfaces, `app/auth/callback/route.ts`, `app/sitemap.ts`, and `.husky/pre-commit`. Traced the `/ru/admin`, `/RU`, `/xx/`, `/ru/account`, `/ru/book` request paths through the middleware by hand against the actual code (not just the test suite) to independently verify the claims in 68-01-SUMMARY.md and 68-02-SUMMARY.md.

**Ordering and nonce-freshness verdict:** correct. `checkCsrf` → `isNonLocalizedRoute` (raw pathname) → `handleI18nRouting` → `stripLocalePrefix` → `runCspAndAuthChain` is the right order, and `useNonceCsp` is deliberately keyed off the *raw* `request.nextUrl.pathname` rather than the locale-stripped `decisionPathname` — this is the correct fix for T-68-04 and I confirmed by tracing the code (not just reading the test) that a crafted `/ru/admin` request cannot reach `isDynamicPath`'s `/admin` branch with `useNonceCsp=true`, and cannot reach `lib/supabase/middleware.ts`'s admin-gate checks at all (those also key off the raw pathname). No bypass found.

**Case-variant redirect deviation:** accepted per the scope note — not re-flagged.

No Critical/blocking findings. Two Warnings (both about the *robustness* of invariants that currently hold only because of route-tree layout, not because the middleware enforces them directly) and three Info items (test-coverage gap, a forward-looking i18n-navigation gap explicitly owned by Phase 69, and a minor breadth issue in the widened pre-commit hook).

## Warnings

### WR-01: CSRF Origin-guard and the non-localized-route gate both key off the RAW pathname only — currently safe by route-tree layout, not by an enforced invariant

**File:** `middleware.ts:133-166` (`checkCsrf`) and `middleware.ts:179-181` (`isNonLocalizedRoute`)
**Issue:** `checkCsrf()` matches `CSRF_PROTECTED_PREFIXES` (`/api/admin`, `/api/create-payment-intent`, etc.) against the *raw* `request.nextUrl.pathname`, and `isNonLocalizedRoute()` matches `/admin|/api|/auth|/driver` the same way — both run *before* any locale stripping. A request to `/ru/api/admin/bookings` therefore:
1. Skips `checkCsrf` entirely (`'/ru/api/admin/bookings'.startsWith('/api/admin')` is `false`) — no Origin-header CSRF check runs at all.
2. Is *not* classified as non-localized, so it falls into the public/`handleI18nRouting` branch instead of the CSP/Supabase chain that would otherwise gate `/admin`.

I verified this is currently **not exploitable**: `app/api/`, `app/admin/` (now `app/(internal)/admin/`), `app/auth/`, and `app/(internal)/driver/` all live *outside* `app/[locale]/`, and there is no catch-all route under `app/[locale]/` (`find app/[locale] -iname "*...*"` returns nothing). Next.js's router therefore resolves `/ru/api/admin/bookings` as `locale='ru'` + remaining segments `api/admin/bookings` under `app/[locale]/`, finds no matching page, and 404s via `app/[locale]/not-found.tsx` — the real handler at `app/api/admin/bookings/route.ts` is never reached. Same reasoning protects `/ru/driver/...` and `/ru/auth/callback`.

This is the *same* bug class T-68-04 explicitly fixed for `/admin` (nonce-CSP leak) — but for `checkCsrf`/`isNonLocalizedRoute` the safety is an emergent property of "no route exists at that path," not something the middleware itself asserts. If a future change adds any route/rewrite under `app/[locale]/` that happens to shadow `/api`, `/admin`, `/auth`, or `/driver` (e.g. a programmatic-SEO catch-all, or a `next.config.ts` rewrite), this reopens a real CSRF/auth-bypass path silently, with no test to catch the regression.
**Fix:** Either (a) run `checkCsrf`/`isNonLocalizedRoute` against `stripLocalePrefix(pathname, routing.locales)` in addition to the raw pathname (defense-in-depth, cheap), or (b) at minimum add regression tests analogous to the existing `/ru/admin` case for `/ru/api/admin/bookings` (expect CSRF check to still apply or the request to 404 without invoking the real handler) and `/ru/driver/...`, so a future route-tree change that breaks this invariant fails CI instead of failing silently in production.

### WR-02: `.husky/pre-commit`'s widened EUR-price-check exclusion is a broad substring match, not anchored to the actual blog path

**File:** `.husky/pre-commit:9`
**Issue:** The exclusion was widened from the exact prefix `app/blog/` to a bare substring `/blog/` (`grep -v '/blog/'`). This now excludes *any* file whose path contains a `/blog/` segment anywhere — not just the intended `app/[locale]/blog/` content tree. E.g. a future `components/blog-widgets/PriceCard.tsx`, `app/[locale]/travel-blog/page.tsx`, or `lib/blog/pricing.ts` would all silently bypass the hard-coded-EUR-price guard, which exists specifically to force prices through `lib/route-prices.ts`/`lib/pricing-config.ts`/`lib/airport-promo.ts`. This is a real weakening of a price-integrity guardrail, even though it's very unlikely to be hit today.
**Fix:** Anchor to the actual moved path instead of a bare substring, e.g.:
```sh
MATCHES=$(grep -rEl '€[0-9]{2,}' --include='*.ts' --include='*.tsx' app components 2>/dev/null \
  | grep -v 'app/compare/' \
  | grep -v 'app/guides/' \
  | grep -v '^app/\[locale\]/blog/' \
  || true)
```
(Or, simpler and future-proof against further route moves: match on `content/blog/` + an explicit list of blog-serving directories rather than a floating `/blog/` substring.)

## Info

### IN-01: Nav/Footer links are not locale-aware — no `next-intl` navigation wrapper exists yet (explicitly Phase 69 scope, flagging per review-scope instruction)

**File:** `components/Nav.tsx` (62 call sites across `app/[locale]/**`), `app/[locale]/not-found.tsx:31-33`
**Issue:** `components/Nav.tsx` only received an import-path fix in this phase (`@/app/login/actions` → `@/app/[locale]/login/actions`); all its `<Link href="/services">`, `href="/book"`, `href="/account/trips"` etc. are plain unprefixed paths. No `next-intl`'s `createNavigation`-based locale-aware `Link`/`useRouter` wrapper exists anywhere in the repo (`grep -r "createNavigation"` returns nothing). Under `localePrefix: 'as-needed'`, once a non-default locale has real content, a user on `/ru/...` clicking any Nav link will land back on the English root (`/services`) rather than `/ru/services`, silently dropping their locale.
**Fix:** Not a Phase 68 defect — `.planning/ROADMAP.md` line 21 explicitly assigns Nav/Footer/Hero/etc. string externalization to Phase 69. Flagging only so Phase 69's plan also swaps `next/link` for next-intl's locale-aware `Link` (or manually re-prefixes hrefs with the current locale) — otherwise Phase 68's routing infrastructure won't actually keep users on their chosen locale once Phase 69 ships translated content.

### IN-02: `/ru/admin` non-bypass is tested; the identical `/ru/driver` and `/ru/api/*` cases are not

**File:** `tests/middleware-i18n.test.ts` (describe block `security: /ru/admin does not bypass admin gating (T-68-04)`)
**Issue:** The dedicated STRIDE security probe only covers `/ru/admin`. `/driver` is gated by the same raw-pathname mechanism in `lib/supabase/middleware.ts` (implicitly, via `isDynamicPath`/`useNonceCsp`'s `/driver` prefix) and the CSRF-protected `/api/*` prefixes share the same raw-pathname-only matching (see WR-01) — neither has an explicit locale-prefix-confusion regression test.
**Fix:** Extend the existing parametrized-locale pattern (`nonDefaultLocales.forEach(...)`) to also assert `/{locale}/driver/...` doesn't acquire a nonce CSP and `/{locale}/api/admin/...` doesn't reach the CSRF-protected/auth-gated logic — cheap to add given the harness already exists, and directly closes the coverage gap called out in WR-01.

### IN-03: Legacy `next.config.ts` redirects don't cover locale-prefixed variants of removed/migrated URLs

**File:** `next.config.ts:19-96` (`redirects()`)
**Issue:** The `/cs`, `/cs/*` (Czech-locale cleanup), `/guides`→`/blog`, `/compare`→`/blog`, and the 20 removed long-distance `/routes/prague-*` redirects all match only the unprefixed `source` path. A locale-prefixed request to e.g. `/ru/cs`, `/ru/guides`, or `/ru/routes/prague-erfurt` will not match any `source` pattern and will 404 via `app/[locale]/not-found.tsx` instead of redirecting.
**Fix:** Low priority — none of these old URLs were ever crawled/linked with a locale prefix (the pre-Phase-68 site was English-only), so there's no accumulated link equity to preserve for the `/ru/...` variants. Worth a one-line note in the Phase 74 (hreflang) or Phase 75 (E2E verification) plan so it isn't rediscovered as a surprise later; no action needed now.

---

_Reviewed: 2026-09-03T19:51:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
