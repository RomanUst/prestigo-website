---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 02
subsystem: security
tags: [privacy, csrf, rate-limit, referrer-policy, analytics, next-intl]
status: complete
requires: []
provides:
  - isPrivateLinkPath predicate (client-safe) covering /admin, /driver, /manage with locale prefixes
  - seven analytics / consent / chat components that do nothing on private link paths
  - Referrer-Policy no-referrer + Cache-Control no-store on /manage/* and the six locale-prefixed forms
  - /api/manage in both CSRF lists; LIMITS keys for /api/manage/cancel and /api/manage/change-request
affects: [89-15 manage page, 89-28 manage routes]
requirements: [HOLD-06]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2
plan_head_before: a6e076f163b99ea4d534892128d2044363cf0fc1
plan_head_after: 28cabe2d4ab2cd073a960767684f9f2e2178090c

tech-stack:
  added: []
  patterns:
    - "guard wrapper + inner body for hook-bearing client components (stable hook order)"

key-files:
  created:
    - lib/private-link-path.ts
    - tests/private-link-paths.test.tsx
  modified:
    - components/AnalyticsPageView.tsx
    - components/GoogleAnalytics.tsx
    - components/Clarity.tsx
    - components/MetaPixel.tsx
    - components/CookieBanner.tsx
    - components/EngagementTracker.tsx
    - components/ChatLauncher.tsx
    - next.config.ts
    - middleware.ts
    - lib/rate-limit.ts
    - tests/next-config-headers.test.ts

key-decisions:
  - "GoogleAnalytics and Clarity became client components so they can read the path; the public layout is static and cannot read it on the server."
  - "The inline /admin check in the GA init script was removed: the component now returns null for every private path, which is stricter (gtag.js no longer loads on /admin either)."
  - "A literal /en/... prefix is treated as a locale prefix by the predicate so the guard cannot be bypassed through it."
  - "/manage was not added to NON_LOCALIZED_PREFIXES and the middleware matcher is unchanged (a token path has no dot)."
---

# Phase 89 Plan 02: Private link paths Summary

One shared `isPrivateLinkPath` predicate keeps GA4, Meta Pixel, Clarity, the cookie banner, engagement events and Chatwoot off `/manage/<token>` and `/driver/trip/<token>`, `/manage` pages send no Referer and are not cached, and `/api/manage/*` is CSRF-guarded (Origin required) and rate-limited before the routes exist.

## What was done

**Task 1 (tracer), commit f6027a9c.** `lib/private-link-path.ts` (segment-exact match for admin/driver/manage after an optional locale prefix; `/managed`, `/en-route`, `/blog/manage-your-booking` stay public). Wired through `AnalyticsPageView` (replaces the `/admin` check), `GoogleAnalytics`, the two `next.config.ts` header entries (`/manage/:path*` and `/:locale(ru|es|fr|ar|hi|zh)/manage/:path*`), both CSRF lists in `middleware.ts`, and `LIMITS` (cancel 10, change-request 5). Pinned by `tests/private-link-paths.test.tsx` and `tests/next-config-headers.test.ts`.

**Task 2, commit 28cabe2d.** `Clarity` (client component), `MetaPixel`, `CookieBanner`, `EngagementTracker`, `ChatLauncher`. The four hook-bearing ones are split into a guard wrapper plus an inner body so no early return precedes a hook. The chrome test renders all seven on `/manage/tok`, `/ar/manage/tok`, `/driver/trip/tok` (no script, no Meta Pixel with stored consent, no launcher, no event, no modal) and on `/book` (everything still mounts), and greps that each of the seven source files uses the guard.

## Verification

- `npx vitest run` on private-link-paths, next-config-headers, analytics-page-view, middleware-csrf-forms, chat-launcher, chat-launcher-i18n, cookie-banner-locale-suggestion, meta-pixel-id, meta-pixel-locale, rtl-backstop, StickyBookingPanel, Step3Vehicle: all pass (710 tests in the last run, 91 in the Task 1 run).
- `npx tsc --noEmit`: 8 errors, all in the old `tests/` baseline, none in touched files.
- `npx eslint --quiet` on all touched source and test files: clean.
- `grep -l isPrivateLinkPath components/*.tsx | wc -l` prints 7.
- Node modules were symlinked from the main checkout; next-intl-importing tests (chat launcher, cookie banner) ran fine through the symlink.

## Deviations from Plan

None - plan executed as written. One implementation note: the plan said "replace the two /admin checks"; the second one lives inside the GA inline script string, so it was replaced by the component-level guard rather than by serialising the predicate into the script.

## Known Stubs

None.

## Threat Flags

None. Threats T-89-04, T-89-05, T-89-06, T-89-07 are mitigated as planned and asserted by tests (the live `curl -I` check of the headers belongs to the deploy-time plans).

## Notes for downstream plans

- 89-15 (manage page) and 89-28 (manage routes) need no further wiring for privacy, CSRF or rate limits; the routes must live at exactly `/api/manage/cancel` and `/api/manage/change-request` for the LIMITS keys to apply (an unknown key is unlimited).
- A new third-party tracker added later: import `isPrivateLinkPath`, add its name to `GUARDED_COMPONENTS` in `tests/private-link-paths.test.tsx`.

## Self-Check: PASSED

- lib/private-link-path.ts and tests/private-link-paths.test.tsx exist.
- Commits f6027a9c and 28cabe2d exist on branch worktree-agent-ac8e918e0ef49b8ff.
- STATE.md and ROADMAP.md untouched.
