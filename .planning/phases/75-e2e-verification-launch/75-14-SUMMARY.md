---
phase: 75-e2e-verification-launch
plan: 14
subsystem: i18n
tags: [next-intl, i18n, en-leak-fix, locale-continuity, booking, regression-test]

requires:
  - phase: 75-e2e-verification-launch (plan 02)
    provides: "scripts/qa/en_leak_static.mjs scanTree()/scanSource() R3 rule (locale-dropping navigation) + scripts/qa/en_leak_allowlist.json — the single detector this plan's backstop test reuses directly"
  - phase: 75-e2e-verification-launch (plan 13)
    provides: ".planning/phases/75-e2e-verification-launch/deferred-items.md + WINDOWS.md #20 — the ArticleByline next/link deferred item this plan resolves"
provides:
  - "components/booking/TripTypeTabs.tsx, BookingWizard.tsx, BookingWidget.tsx — all three now use useRouter from @/i18n/routing instead of next/navigation, so the multi-day tab switch, the quote-flow confirmation push, and the homepage widget's /book hand-off all keep the visitor's locale prefix"
  - "components/ArticleByline.tsx, app/[locale]/book/confirmation/page.tsx — both now use the i18n Link (@/i18n/routing) instead of next/link's default import (confirmation page copy itself untouched per D-05)"
  - "tests/locale-links-backstop.test.ts — permanent regression guard reusing scanTree()/R3 from scripts/qa/en_leak_static.mjs over app/[locale]/** + components/**, filtering only the pre-existing components/admin/** UNOWNED finding; fails immediately (with file:line) on any future locale-dropping navigation regression"
affects: [75-20 (final phase-wide re-verification; this backstop test becomes a permanent CI-adjacent guard, not just a one-time fix-plan check)]

actuals:
  tokens: 3150
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "useRouter from @/i18n/routing (not next/navigation) is the single router import for any client component that navigates to an internal route — matches the existing getPathname()/Link precedent from plans 75-05/75-11/75-13."
    - "Test files that mock a component tree containing a @/i18n/routing consumer must use vi.mock('@/i18n/routing', async (importOriginal) => ({ ...await importOriginal(), useRouter: () => ... })) rather than a full mock replacement — createNavigation()'s internal call to next/navigation's real redirect/permanentRedirect happens at module-load time, so dropping those exports (or next/navigation's own exports, if that module is instead fully mocked) breaks any sibling component in the same render tree that calls getPathname() (Step3Auth/OAuthButtons, Step6Payment)."
    - "A backstop/regression test can reuse an existing QA scanner's exported pure functions (scanTree/scanSource) directly inside vitest, with a narrow, code-level, well-commented scope exclusion (components/admin/**) instead of widening the shared JSON allowlist — keeps the allowlist reserved for D-09/D-05/external-link exceptions only."

key-files:
  created:
    - tests/locale-links-backstop.test.ts
  modified:
    - components/booking/TripTypeTabs.tsx
    - components/booking/BookingWizard.tsx
    - components/booking/BookingWidget.tsx
    - components/ArticleByline.tsx
    - app/[locale]/book/confirmation/page.tsx
    - tests/TripTypeTabs.test.tsx
    - tests/BookingWidget.test.tsx
    - tests/BookingWizard.test.tsx
    - tests/EntryBar.test.tsx
    - tests/confirmation-page.test.tsx
    - .planning/WINDOWS.md
    - .planning/phases/75-e2e-verification-launch/deferred-items.md

key-decisions:
  - "The backstop test's admin-panel exclusion lives in test code (a `!f.file.startsWith('components/admin/')` filter with an inline explanation), not in scripts/qa/en_leak_allowlist.json — the plan's own acceptance criteria forbids widening that shared allowlist in this plan, and the admin-panel scope boundary (STATE.md: never localize app/admin/*) is a distinct, pre-existing exclusion category from the JSON allowlist's D-09/D-05/external-link reasons."
  - "Resolved the ArticleByline deferred item (WINDOWS.md #20, logged in 75-13) as part of this plan's own Task 2 scope — the plan's files_modified frontmatter explicitly lists components/ArticleByline.tsx, so fixing it here (rather than waiting for 75-20) closes the deferred item instead of leaving it open."
  - "tests/confirmation-page.test.tsx's next/link mock was retargeted to @/i18n/routing even though the file isn't listed in this plan's files_modified frontmatter — the plan's own <action> text explicitly calls this out ('and tests/confirmation-page.test.tsx only if its mock targets next/link'), and it did."

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes. Per worktree-mode instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT touched by this executor — the orchestrator owns those writes after merge.

coverage:
  - id: D1
    description: "TripTypeTabs' multi-day tab, BookingWizard's quote-flow confirmation push, and BookingWidget's /book hand-off all use the i18n router (@/i18n/routing), so none of them drop the locale prefix on client-side navigation"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/TripTypeTabs.test.tsx > clicking MULTI-DAY tab calls the i18n router push + ru-locale variant"
        status: pass
      - kind: unit
        ref: "tests/BookingWidget.test.tsx > calls router.push(\"/book\") on valid submit"
        status: pass
      - kind: other
        ref: "grep -n \"from 'next/navigation'\" components/booking/TripTypeTabs.tsx components/booking/BookingWizard.tsx components/booking/BookingWidget.tsx — returns nothing (exit 1) for all three"
        status: pass
    human_judgment: false
  - id: D2
    description: "ArticleByline and the /book/confirmation page's BOOK NOW link use the i18n Link instead of next/link's default import; confirmation page copy itself is untouched (D-05)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/confirmation-page.test.tsx (full suite, 10 tests, i18n Link mock)"
        status: pass
      - kind: other
        ref: "grep -rn \"from 'next/link'\" components app/[locale] --include=*.tsx — only components/admin/AdminSidebar.tsx remains (pre-existing, UNOWNED, out of i18n scope per STATE.md)"
        status: pass
    human_judgment: false
  - id: D3
    description: "tests/locale-links-backstop.test.ts reuses the plan-75-02 scanner's R3 rule over app/[locale]/** + components/** and reports zero non-allowlisted findings — a permanent regression guard"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/locale-links-backstop.test.ts (2 tests: zero non-admin R3 findings + admin-exclusion sanity check)"
        status: pass
      - kind: other
        ref: "git diff scripts/qa/en_leak_allowlist.json — empty (allowlist not widened)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-26
status: complete
---

# Phase 75 Plan 14: Booking Flow Locale Links + Permanent Backstop Test Summary

**TripTypeTabs, BookingWizard, and BookingWidget now navigate through the i18n router instead of next/navigation; ArticleByline and the /book/confirmation link now use the i18n Link instead of next/link; and a new tests/locale-links-backstop.test.ts reuses the plan-75-02 static scanner's R3 rule as a permanent regression guard so no phase-75 link fix can silently revert.**

## Performance

- **Duration:** 20 min (approx.)
- **Started:** 2026-09-26T19:27:00Z (approx.)
- **Completed:** 2026-09-26T19:44:00Z
- **Tasks:** 2
- **Files modified:** 12 (5 production files, 5 test files, 2 planning-doc updates)

## Accomplishments

- **Task 1 (tracer):** `components/booking/TripTypeTabs.tsx`'s `useRouter` import switched from `next/navigation` to `@/i18n/routing`, so clicking the multi-day tab pushes `/book/multi-day` through next-intl's locale-aware router (which prepends the active locale). `tests/TripTypeTabs.test.tsx`'s router mock retargeted to `@/i18n/routing`, with a new ru-locale render assertion proving the push still fires correctly under a non-EN locale.
- **Task 2:** `BookingWizard.tsx`'s quote-flow confirmation push and `BookingWidget.tsx`'s `/book` hand-off both switched to `useRouter` from `@/i18n/routing`. `ArticleByline.tsx` and `app/[locale]/book/confirmation/page.tsx`'s "BOOK NOW" link both switched from `next/link`'s default import to the i18n `Link` (confirmation page copy itself untouched, per D-05). Created `tests/locale-links-backstop.test.ts`, which imports `scanTree` from `scripts/qa/en_leak_static.mjs` and asserts zero non-allowlisted R3 (locale-dropping navigation) findings across `app/[locale]/**` + `components/**`, with a narrow, documented, code-level exclusion for the pre-existing `components/admin/**` UNOWNED finding (admin panel is explicitly out of i18n scope per STATE.md). Retargeted `tests/BookingWidget.test.tsx` and `tests/BookingWizard.test.tsx`'s router mocks to `@/i18n/routing`, and `tests/confirmation-page.test.tsx`'s `next/link` mock to `@/i18n/routing` (per the plan's own `<action>` instruction).
- Resolved the `components/ArticleByline.tsx` deferred item logged by plan 75-13 (`deferred-items.md`, WINDOWS.md #20) — marked `fixed` in the WINDOWS.md ledger.
- Verification: `npx vitest run tests/locale-links-backstop.test.ts tests/TripTypeTabs.test.tsx tests/BookingWidget.test.tsx tests/BookingWizard.test.tsx tests/confirmation-page.test.tsx` — 45/52 tests pass (7 pre-existing `it.todo`). `npx tsc --noEmit` — zero errors in any file this plan touched (only the same 3 pre-existing, unrelated test-file errors documented in 75-11/75-13). Full `npx vitest run` — 2306/2306 executable tests pass (5 pre-existing, worktree-environment-specific import failures, documented below, identical to 75-11/75-13's precedent).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — TripTypeTabs multi-day tab keeps the locale (i18n router)** - `59a961ae` (feat)
2. **Task 2: BookingWizard, BookingWidget, ArticleByline, confirmation links + the locale-links backstop test** - `09b5d6ad` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

_Note: no TDD RED/GREEN split commits — both tasks carry `tdd="true"` and were verified via each task's own inline RED-then-GREEN test run (test edited first, confirmed failing against the old implementation, then implementation fixed and confirmed passing) within a single task commit, matching plans 75-05/75-11/75-13's precedent._

## Files Created/Modified

- `components/booking/TripTypeTabs.tsx` — `useRouter` from `@/i18n/routing` (was `next/navigation`)
- `components/booking/BookingWizard.tsx` — `useRouter` from `@/i18n/routing` (quote-flow confirmation push)
- `components/booking/BookingWidget.tsx` — `useRouter` from `@/i18n/routing` (`/book` hand-off)
- `components/ArticleByline.tsx` — `Link` from `@/i18n/routing` (was `next/link` default import)
- `app/[locale]/book/confirmation/page.tsx` — `Link` from `@/i18n/routing` for the "BOOK NOW" link (copy untouched, D-05)
- `tests/TripTypeTabs.test.tsx` — router mock retargeted + ru-locale assertion
- `tests/BookingWidget.test.tsx` — router mock retargeted to `@/i18n/routing`
- `tests/BookingWizard.test.tsx` — router mock retargeted (`importOriginal` pattern preserved for `getPathname`)
- `tests/EntryBar.test.tsx` — router mock retargeted (deviation, see below)
- `tests/confirmation-page.test.tsx` — `next/link` mock retargeted to `@/i18n/routing`
- `tests/locale-links-backstop.test.ts` (new) — permanent R3 regression guard
- `.planning/WINDOWS.md` — ledger entry #20 marked `fixed`
- `.planning/phases/75-e2e-verification-launch/deferred-items.md` — ArticleByline item marked resolved

## Decisions Made

- The backstop test's `components/admin/**` exclusion lives in test code (a documented filter), not in `scripts/qa/en_leak_allowlist.json` — the plan forbids widening that shared allowlist in this plan, and the admin-panel exclusion is a distinct, pre-existing scope boundary (STATE.md), not a D-09/D-05/external-link case.
- Resolved the ArticleByline deferred item as part of this plan's own scope (it was already listed in `files_modified`) rather than leaving it for 75-20.
- Retargeted `tests/confirmation-page.test.tsx`'s mock even though the file isn't in this plan's `files_modified` frontmatter, per the plan's own explicit `<action>` instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `tests/EntryBar.test.tsx`'s next/navigation mock, broken by Task 1's TripTypeTabs change**
- **Found during:** Task 2's full-suite regression sweep (root-caused to Task 1)
- **Issue:** `EntryBar.tsx` renders `TripTypeTabs`, which after Task 1 imports `useRouter` from `@/i18n/routing` instead of `next/navigation`. `tests/EntryBar.test.tsx` fully replaced the `next/navigation` mock (`vi.mock('next/navigation', () => ({ useRouter: ... }))`, no `importOriginal`) — this mock is irrelevant to `TripTypeTabs` now, but `@/i18n/routing`'s `createNavigation()` call (invoked at module load by `TripTypeTabs`) still needs `next/navigation`'s real `redirect`/`permanentRedirect` exports internally, and those come through unmocked since `next/navigation` itself was never actually replaced for `@/i18n/routing`'s benefit — the real failure was `@/i18n/routing`'s own `useRouter` being un-mocked and throwing `invariant expected app router to be mounted` in jsdom.
- **Fix:** Replaced the `next/navigation` mock with a `@/i18n/routing` mock using the `importOriginal` pattern (matching `tests/BookingWizard.test.tsx`'s existing convention), mocking only `useRouter`.
- **Files modified:** `tests/EntryBar.test.tsx`
- **Verification:** `npx vitest run tests/EntryBar.test.tsx` — 15/15 pass (was 0/15, all erroring at render).
- **Committed in:** `09b5d6ad` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, a self-caused regression from Task 1 caught by the plan's own full-suite verification before commit).
**Impact on plan:** Necessary — without this fix, Task 1's change would have broken a passing test suite it didn't touch. No scope creep (same mock-retargeting pattern already established by this plan's other test files).

## Issues Encountered

- **Acceptance-criteria wording gap (not a defect, documented for clarity):** Task 2's acceptance criterion `grep -rn "from 'next/link'" components app/[locale] --include=*.tsx returns only allowlisted D-09 files (or nothing)` also matches `components/admin/AdminSidebar.tsx`. This file is not a D-09 (blog EN-fallback) allowlist case — it's the pre-existing, UNOWNED, admin-panel `next/link` finding (75-EN-LEAK-AUDIT.md, out of i18n scope per STATE.md, never touched by this or any phase-75 plan). The backstop test's own admin-panel exclusion (documented above) is the actual, precise verification; this grep's literal wording didn't anticipate the admin-panel case.
- **Pre-existing, out-of-scope `tsc --noEmit` failures** (not introduced by this plan, files never touched by this plan): `tests/i18n-translate-dnt.test.ts` (2 errors), `tests/nav-auth.test.tsx` (5 errors), `tests/passenger-actions.test.ts` (1 error). Zero `tsc` errors exist under any file this plan modified. Identical to the issue documented in 75-11-SUMMARY.md/75-13-SUMMARY.md.
- **Pre-existing, out-of-scope full-suite `vitest run` failures** (5 suites, worktree-environment-specific, not introduced by this plan): `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` all fail at import time with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` — a relative path into `node_modules` that only resolves in the main checkout, not this worktree's symlinked `node_modules`. None of the 5 failing files were touched by this plan. Identical to the issue documented in 75-11-SUMMARY.md/75-13-SUMMARY.md (WINDOWS.md #17/#18/#19); all 2306 other tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every client-side navigation in the booking flow (TripTypeTabs, BookingWizard, BookingWidget) and the two remaining `next/link` sites this plan owned (ArticleByline, confirmation page) now keep the visitor's locale.
- `tests/locale-links-backstop.test.ts` is a permanent regression guard — any future plan or refactor that reintroduces `next/link`'s default import, `next/navigation`'s `useRouter`, a raw `<a href="/...">`, or a root-relative `redirect()` literal anywhere under `app/[locale]/**` or `components/**` (outside the documented `components/admin/**` exclusion) will fail this test immediately with the offending `file:line`.
- The `components/admin/AdminSidebar.tsx` `next/link` finding remains open and UNOWNED by design — it is out of i18n scope per STATE.md and is not expected to be fixed by any phase-75 plan, including 75-20's final re-verification.
- The two pre-existing/unrelated issue clusters noted above (tsc errors in 3 test files; 5 worktree-environment test failures) remain for whichever future work resolves them, or resolve naturally once this worktree merges into the main checkout.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26*

## Self-Check: PASSED

All created/modified files found on disk (`tests/locale-links-backstop.test.ts` and all 11 modified files); both task commits (`59a961ae`, `09b5d6ad`) found in `git log` on `worktree-agent-a007181338886becd`. Plan-level `<verification>` re-run clean: `npx vitest run tests/locale-links-backstop.test.ts tests/TripTypeTabs.test.tsx tests/BookingWidget.test.tsx tests/BookingWizard.test.tsx tests/confirmation-page.test.tsx` — 45/52 pass (7 pre-existing `it.todo`), zero failures. `npx tsc --noEmit` shows only pre-existing unrelated errors in 3 other test files. `git diff scripts/qa/en_leak_allowlist.json` — empty.
