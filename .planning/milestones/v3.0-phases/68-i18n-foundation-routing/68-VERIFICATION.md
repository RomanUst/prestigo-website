---
phase: 68-i18n-foundation-routing
verified: 2026-09-03T22:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 68: i18n Foundation & Routing Verification Report

**Phase Goal:** The public site is served through next-intl locale routing with English at the root (existing English URLs unchanged, `localePrefix: 'as-needed'`), all seven locales configured as a single typed source, the locale middleware composed non-destructively into the existing CSP/Supabase/CSRF chain, and per-locale `<html lang>`/`dir` plus not-found handling in place — with public routes rendering under `app/[locale]/` in English only (no translations yet).

**Verified:** 2026-09-03T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Existing EN URLs resolve unchanged at root with no `/en` prefix (`localePrefix: 'as-needed'`); public routes render from `app/[locale]/` | ✓ VERIFIED | `i18n/routing.ts` sets `localePrefix: 'as-needed'`, `defaultLocale: 'en'`. `app/[locale]/` contains all 17 public route folders + `page.tsx` (`about, account, authors, blog, book, contact, corporate, data-deletion, faq, fleet, login, privacy, routes, services, terms`). No stray `app/layout.tsx` or duplicate route folders remain at `app/` root (confirmed via `find app -maxdepth 1 -type d`). `middleware.ts` returns next-intl's redirect as-is for the `/en → /` case (`intlResponse.status >= 300 && < 400` branch). Orchestrator live-observed: `/` → 200 no redirect, `/en` → 307 → `/`. |
| 2 | Composed `middleware.ts` preserves CSP nonce / Supabase `updateSession` / CSRF Origin-guard byte-for-byte, with locale detection added; admin/api/auth/driver stay non-localized at root | ✓ VERIFIED | Read `middleware.ts` in full: `checkCsrf()` runs first unchanged; `isNonLocalizedRoute()` gates `/admin`,`/api`,`/auth`,`/driver` BEFORE `handleI18nRouting` ever runs; `runCspAndAuthChain` reuses the pre-phase nonce/static-CSP/`isDynamicPath` logic. `lib/supabase/middleware.ts`'s `updateSession` gained purely-additive optional params (`baseResponse`, `pathnameOverride`) — default (no-args) call sites are unchanged. `tests/middleware-customer.test.ts` has **zero diff** since before Phase 68 (`git diff a1ea0c3 -- tests/middleware-customer.test.ts` is empty) and passes standalone (7/7). T-68-04 fix (nonce decided off RAW pathname, not locale-stripped) is present in code (`middleware.ts:234-236`) and covered by a named passing test (`/ru/admin does NOT emit an admin auth redirect and does NOT set a nonce CSP`). |
| 3 | `<html lang>`/`dir` emitted dynamically per locale (`dir="rtl"` for `ar`); each locale resolves a per-locale not-found | ✓ VERIFIED | `app/[locale]/layout.tsx`: `<html lang={locale} dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}>`, guarded by `hasLocale(...) ?? notFound()`. `app/[locale]/not-found.tsx` exists (per-locale 404, noindex). `app/(internal)/not-found.tsx` and top-level `app/not-found.tsx` also exist for the other two route trees, each with `robots: {index:false, follow:false}`. `rtlLocales = ['ar']` in `i18n/routing.ts` — only `ar` triggers rtl. Orchestrator live-observed `/ar` → `<html lang="ar" dir="rtl">`, all other locales `dir="ltr"`. |
| 4 | Locale config typed + single-source for `en,ru,es,fr,ar,hi,zh`; visiting a configured non-EN subpath renders EN without 404 | ✓ VERIFIED | `i18n/routing.ts` exports `locales = ['en','ru','es','fr','ar','hi','zh'] as const`, `AppLocale` type, `routing` (defineRouting), `rtlLocales`, and `stripLocalePrefix` — consumed by `middleware.ts` and both root layouts (single import site each, grepped). `i18n/request.ts` resolves `messages: {}` (intentional Phase-68 stub, no translations yet, per REQUIREMENTS.md scope). `tests/i18n-routing.test.ts` (17 tests) asserts the 7-tuple, `localeDetection: false`, `hasLocale` true/false cases, and `stripLocalePrefix` behavior including adjacency guards — all pass. Orchestrator live-observed all 7 locale subpaths → 200 rendering EN, never 404. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `i18n/routing.ts` | Single typed source of 7 locales, `defineRouting`, `stripLocalePrefix` | ✓ VERIFIED | Present, substantive, imported by `middleware.ts` + `app/[locale]/layout.tsx` |
| `i18n/request.ts` | `getRequestConfig` locale resolution stub | ✓ VERIFIED | Present, wired via `next.config.ts`'s `createNextIntlPlugin('./i18n/request.ts')` |
| `components/SiteChrome.tsx` | Shared fonts/globals/head/6 global components | ✓ VERIFIED | Present, imported by both `app/[locale]/layout.tsx` and `app/(internal)/layout.tsx` |
| `app/[locale]/layout.tsx` | Dynamic `<html lang dir>`, `hasLocale` guard, `setRequestLocale` | ✓ VERIFIED | All present and correctly ordered |
| `app/[locale]/not-found.tsx` | Per-locale 404 | ✓ VERIFIED | Present, noindex metadata |
| `app/(internal)/layout.tsx` | `<html lang="en">` for admin/driver | ✓ VERIFIED | Present, hard-coded `lang="en"` as designed |
| `app/(internal)/not-found.tsx` | Internal-branch 404 (Plan 02) | ✓ VERIFIED | Present, noindex, no Nav/Footer (correct — internal has own chrome) |
| `app/not-found.tsx` | Top-level fallback with own `<html>/<body>` | ✓ VERIFIED | Present — necessary since no single root layout exists anymore |
| `tests/middleware-i18n.test.ts` | Composition + edge/security regression tests | ✓ VERIFIED | 13 named test cases, all pass |
| `tests/i18n-routing.test.ts` | Config-contract + `stripLocalePrefix` unit tests | ✓ VERIFIED | 17 named test cases, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `next.config.ts` | `i18n/request.ts` | `createNextIntlPlugin('./i18n/request.ts')` wraps `withMDX(nextConfig)` | ✓ WIRED | `export default withNextIntl(withMDX(nextConfig));` confirmed at next.config.ts:156 |
| `middleware.ts` public branch | `lib/supabase/middleware.ts updateSession` | `intlResponse` threaded as `baseResponse`, not recreated | ✓ WIRED | `runCspAndAuthChain(request, { pathname: strippedPathname, baseResponse: intlResponse })`; `updateSession` uses `baseResponse` when supplied instead of a fresh `NextResponse.next()` |
| `middleware.ts` | `isDynamicPath` / admin checks | Non-localized branch uses RAW pathname; public branch uses locale-stripped pathname for `isDynamicPath`, RAW pathname for `useNonceCsp` | ✓ WIRED | Confirmed via code read — this is the T-68-04 fix location |
| `app/[locale]/layout.tsx` | `components/SiteChrome.tsx` | Import + render | ✓ WIRED | Both root layouts import and wrap `<SiteChrome>` |
| `middleware.ts` | `i18n/routing.ts` | Imports `routing`, `stripLocalePrefix` | ✓ WIRED | `import { routing, stripLocalePrefix } from '@/i18n/routing'` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Named composition/edge tests exist and pass | `npx vitest run tests/middleware-i18n.test.ts tests/i18n-routing.test.ts tests/middleware-customer.test.ts` | 3 files, 49 tests passed | ✓ PASS |
| `tests/middleware-customer.test.ts` unchanged since pre-phase | `git diff a1ea0c3 -- tests/middleware-customer.test.ts` | empty diff | ✓ PASS |
| Full production build succeeds | `npm run build` | Completed cleanly, 551 pages incl. API routes/pages; only pre-existing unrelated workspace-root warning | ✓ PASS |
| No stale `@/app/login\|account\|admin\|driver\|book` imports remain | `grep -rn` across `app/, components/, lib/, tests/` | 0 matches outside `[locale]`/`(internal)` | ✓ PASS |
| Route tree physically moved as claimed | `ls app/[locale]`, `ls app/(internal)` | Public folders under `[locale]`, admin+driver under `(internal)`, `api`/`auth`/`sitemap.ts` remain at root | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| I18N-01 | 68-01 | next-intl + `app/[locale]/` routing, `localePrefix: 'as-needed'`, EN unchanged | ✓ SATISFIED | Route tree, config, live 200/307 checks |
| I18N-02 | 68-01 | Composed middleware preserves CSP/Supabase/CSRF byte-for-byte | ✓ SATISFIED | Code read, T-68-04 fix, zero-diff regression test, 49/49 passing |
| I18N-03 | 68-01, 68-02 | `<html lang>`/`dir` dynamic, rtl for ar, not-found handling | ✓ SATISFIED | Layout code, 3 not-found surfaces, live rtl confirmation |
| I18N-04 | 68-01, 68-02 | Typed single-source locale config, all 7 render EN w/o 404 | ✓ SATISFIED | `i18n/routing.ts`, 17 config tests, live 200 checks for all 7 locales |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps only I18N-01..04 to Phase 68, and all four appear in both plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned all phase-touched core files (`i18n/routing.ts`, `i18n/request.ts`, `middleware.ts`, `lib/supabase/middleware.ts`, `app/[locale]/layout.tsx`, `app/(internal)/layout.tsx`, both not-found files, `components/SiteChrome.tsx`, `next.config.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-shaped patterns — zero matches. The `messages: {}` stub in `i18n/request.ts` is an intentional, documented, in-scope placeholder (translations are explicitly out of scope for Phase 68 per REQUIREMENTS.md — STR-01/02 are separate, not-yet-started requirements for Phase 69).

### Accepted Deviation Noted (Not a Gap)

T-68-06 (Plan 02): case-variant locale prefixes (`/RU`, `/Ru`, `/aR`) 307-redirect to the canonical lowercase locale via next-intl's own case-normalization, rather than hard-404ing as originally anticipated in the threat register wording. This was human-reviewed and accepted at the Task 3 checkpoint as documented in 68-02-PLAN.md and 68-02-SUMMARY.md (redirect target is always one of the 7 fixed configured locales, never attacker-controlled; `/RU/admin → /ru/admin → 404` non-bypass preserved). Per the orchestrator's briefing, this is treated as an accepted deviation, not a gap, and does not affect the verified score.

### Human Verification Required

None. All must-haves are either directly verifiable in code + automated tests, or were already live-verified by the orchestrator against a running dev server (RTL rendering, all-7-locale render fidelity, EN-URL byte-identical spot-check, live CSP nonce freshness on reload) as documented in the task briefing and corroborated by 68-01/68-02-SUMMARY.md's `human_judgment: true` coverage entries — these are one-time visual/experiential checks already discharged during phase execution, not outstanding items.

### Gaps Summary

None found. All 4 ROADMAP success criteria (mapped 1:1 to I18N-01..04) are verified against actual source code (not SUMMARY claims): `i18n/routing.ts`, `i18n/request.ts`, `middleware.ts`, `lib/supabase/middleware.ts`, both root layouts, all three not-found surfaces, and the full route-tree move were read in full and match the plan's must-haves. The regression-critical `tests/middleware-customer.test.ts` has a verified-empty diff since before the phase started and passes. The new test suites (`tests/middleware-i18n.test.ts`, `tests/i18n-routing.test.ts`) total 30 named tests covering composition, edge cases, and the T-68-04 security fix, all passing (49/49 combined with the customer regression suite). `npm run build` succeeds cleanly. No stale imports, no stub/placeholder anti-patterns, no orphaned requirements.

---

_Verified: 2026-09-03T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
