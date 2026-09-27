---
phase: 68-i18n-foundation-routing
plan: 02
subsystem: infra
tags: [next-intl, middleware, i18n, csp, testing, vitest, security]

requires:
  - phase: 68-01
    provides: next-intl@4.14.2 composed into middleware.ts, i18n/routing.ts single-source locale config, split root layouts, route tree under app/[locale]/, tests/middleware-i18n.test.ts + tests/i18n-routing.test.ts regression files
provides:
  - Edge/security/all-7-locale probe tests appended to tests/i18n-routing.test.ts and tests/middleware-i18n.test.ts (unconfigured prefix, case-variant canonicalization, /ru/admin non-bypass, all-7 dynamic-branch parity)
  - stripLocalePrefix moved to i18n/routing.ts as the single-source implementation (I18N-04), directly unit-testable without pulling in next-intl/middleware's next/server dependency
  - app/(internal)/not-found.tsx — minimal noindex 404 for the (internal) route group (admin/driver), closing RESEARCH.md Open Question #3
  - Human-verify checkpoint sign-off: RTL rendering, all-7-locale render fidelity, EN-unchanged URLs, live per-request CSP nonce freshness, 404 edges — all PASS
  - Accepted deviation on T-68-06: case-variant locale prefixes canonicalize via next-intl's own 307 redirect (not a hard 404), reviewed and accepted as safe
affects: [74-seo-hreflang, 75-e2e-verification-launch]

actuals:
  tokens: 4536
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Locale-related pure helpers (stripLocalePrefix) live in i18n/routing.ts, not middleware.ts — keeps them free of next-intl/middleware's next/server dependency so they're directly unit-testable in plain vitest without mocking, and reinforces I18N-04's single-source-of-truth discipline"
    - "Edge/security test cases parametrize over routing.locales (never hard-code the 7-locale list) so future locale additions/removals don't require touching every test file"

key-files:
  created:
    - app/(internal)/not-found.tsx
  modified:
    - middleware.ts
    - i18n/routing.ts
    - tests/i18n-routing.test.ts
    - tests/middleware-i18n.test.ts
    - .planning/phases/68-i18n-foundation-routing/68-02-PLAN.md

key-decisions:
  - "Moved stripLocalePrefix from middleware.ts into i18n/routing.ts (Rule 3 — blocking import issue): the plan's Task 1 spec required direct-importing and unit-testing stripLocalePrefix from tests/i18n-routing.test.ts, but importing @/middleware unmocked pulls in next-intl/middleware -> next/server, which fails to resolve in vitest outside the mocked middleware-i18n.test.ts harness. Relocating the pure helper to i18n/routing.ts (which only imports next-intl/routing) fixes this and matches the plan's own 'single-source per I18N-04' instruction."
  - "ACCEPTED DEVIATION (human-reviewed at the Task 3 checkpoint): case-variant locale prefixes (/RU, /Ru, /aR) do NOT hard-404 as T-68-06 originally specified — next-intl's own createMiddleware case-normalizes the locale segment and 307-redirects to the fixed canonical lowercase locale before middleware.ts's own logic ever runs. Verified safe: the redirect target is always one of the 7 configured locales (never attacker-controlled/reflected), only the locale segment is normalized (arbitrary path segments are untouched), and /ru/admin non-bypass holds after normalization (/RU/admin -> /ru/admin -> 404). Human accepted this as-is (safe and SEO-beneficial); PLAN.md's threat register and edge statement for T-68-06 were updated to describe the accepted behavior."

patterns-established:
  - "Backstop edges (must_haves verification: backstop) that cannot be deterministically asserted in a mocked vitest harness (per-request nonce freshness under concurrency, trailing-slash/case normalization) are explicitly left unasserted with a comment pointing to the human-verify checkpoint, rather than faking an assertion — see tests/middleware-i18n.test.ts's 'Backstop edges' comment block."

requirements-completed: [I18N-01, I18N-02, I18N-03, I18N-04]

coverage:
  - id: D1
    description: "Unconfigured locale prefix (/xx/) resolves to a 404 via hasLocale rejection, never a reflected redirect"
    requirement: I18N-04
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#edge: unconfigured locale prefix (/xx/) — no reflected redirect (T-68-06)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint item 5 — live dev server: GET /xx/ -> 404 page, not a redirect or blank"
        status: pass
    human_judgment: false
  - id: D2
    description: "Case-variant locale prefixes (/RU, /Ru, /aR) canonicalize via a fixed-target 307 redirect to the lowercase locale (accepted deviation on T-68-06); /RU/admin non-bypass preserved after normalization"
    requirement: I18N-02
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#edge: case-variant locale prefix (/RU/) canonicalizes via redirect — accepted deviation (T-68-06)"
        status: pass
      - kind: unit
        ref: "tests/i18n-routing.test.ts#stripLocalePrefix — does NOT strip an uppercase locale-lookalike segment"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint item 5 — live dev server: /RU -> /ru, /Ru -> /ru, /aR -> /ar, /RU/admin -> /ru/admin -> 404"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 7 configured locales render their subpath in English with correct <html lang>/dir; /ar renders dir=\"rtl\" with no mirrored-layout breakage"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#edge: all-7 dynamic parity — locale-prefixed /book routes for every non-default locale"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint items 1-2 — live browser: /ar dir=\"rtl\" correct layout; /, /ru, /es, /fr, /hi, /zh all render EN with correct lang/dir"
        status: pass
    human_judgment: true
    rationale: "RTL visual layout correctness and per-locale render fidelity are not assertable in the vitest middleware harness (no RSC-render test infra in this suite) — verified live in a real browser per the Task 3 checkpoint."
  - id: D4
    description: "Existing EN URLs remain visually byte-identical to pre-phase, no /en prefix"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#public branch — default locale (en) resolves at root"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint item 3 — live browser spot-check: /book, /routes/prague-vienna, /services/airport-transfer"
        status: pass
    human_judgment: true
    rationale: "Visual byte-identical confirmation is a judgment call not reducible to a header/status assertion — verified live per the Task 3 checkpoint."
  - id: D5
    description: "Live per-request CSP nonce freshness on /admin (distinct nonce per reload); public pages carry static CSP without a nonce"
    requirement: I18N-02
    verification:
      - kind: manual_procedural
        ref: "Task 3 checkpoint item 4 — DevTools Network on /admin/login: nonce present, changes on reload"
        status: pass
    human_judgment: true
    rationale: "Per-request nonce freshness under real browser reload timing is a backstop edge (must_haves verification: backstop) not deterministically assertable against the mocked next-intl harness — verified live per the Task 3 checkpoint."
  - id: D6
    description: "app/(internal)/not-found.tsx added for parity/noindex hygiene; per-locale, internal, and top-level not-found surfaces all resolve to a 404 rather than blank/broken"
    requirement: I18N-03
    verification:
      - kind: other
        ref: "npm run build — 551 static pages, no errors"
        status: pass
      - kind: manual_procedural
        ref: "Live dev server: /ru/this-does-not-exist -> per-locale 404; /zzz -> top-level fallback 404; Task 3 checkpoint item 5 confirms /admin/xyz-nonexistent -> 404"
        status: pass
    human_judgment: false

duration: ~19min execution (across 3 task commits; excludes the human-verify checkpoint wait)
completed: 2026-09-03
status: complete
---

# Phase 68 Plan 02: i18n Foundation & Routing — Edge/Security Hardening Summary

**Edge/security/all-7-locale probe tests (unconfigured prefix, case-variant canonicalization, /ru/admin non-bypass) added to the Plan 01 middleware+routing regression suite, app/(internal)/not-found.tsx closes the internal-branch 404 gap, and a human-verify checkpoint confirmed RTL rendering, all-7-locale fidelity, EN-URL stability, and live CSP nonce freshness — with one accepted deviation on T-68-06 (case-variant locales canonicalize via redirect, not a hard 404)**

## Performance

- **Duration:** ~19 min execution (3 task commits, 21:23–21:42 local) + a human-verify checkpoint gap for Task 3
- **Completed:** 2026-09-03
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 6 (1 created: `app/(internal)/not-found.tsx`; 5 modified)

## Accomplishments
- Appended edge/security/all-7-locale probe tests to `tests/i18n-routing.test.ts` and `tests/middleware-i18n.test.ts`: unconfigured-prefix (`/xx/`) non-bypass, `/ru/admin` non-bypass (existing Plan 01 case retained as authoritative), and all-7-locale dynamic-branch parity parametrized over `routing.locales` (never hard-coded) — 42 assertions total in the two files combined, up from 20 in Plan 01
- Moved `stripLocalePrefix` from `middleware.ts` into `i18n/routing.ts` as the single implementation (Rule 3 fix — the original location couldn't be imported by a plain unit test without pulling in `next-intl/middleware`'s `next/server` dependency, which fails to resolve outside a mocked harness)
- Created `app/(internal)/not-found.tsx` — minimal noindex 404 for the admin/driver route group, closing RESEARCH.md Open Question #3; verified all three not-found surfaces (per-locale, internal, top-level fallback) render correctly
- Ran the Task 3 human-verify checkpoint against a live `npm run dev` server: RTL layout on `/ar`, all-7-locale render fidelity, EN-URL byte-identical stability, live per-request CSP nonce freshness on `/admin`, and 404 edges — all 5 checks PASS
- Resolved one accepted deviation discovered at the checkpoint: case-variant locale prefixes (`/RU`, `/Ru`, `/aR`) 307-redirect to the canonical lowercase locale via next-intl's own case normalization, rather than hard-404ing as the plan's T-68-06 threat-register wording originally anticipated — reviewed and accepted as safe (fixed non-reflected redirect target, non-bypass preserved), with the test suite and PLAN.md's threat register updated to match
- Full vitest suite green throughout: 104 files / 1180 tests passed, 0 regressions; `npm run build` green (551 static pages, no errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Edge + security probe tests (unconfigured/case-variant locales, /ru/admin non-bypass, all-7 resolution)** — `bb5c6fb` (test)
2. **Task 2: Not-found completeness across the three route trees** — `eee4158` (feat)
3. **Checkpoint: RTL + all-7-locale render + EN-unchanged + live CSP nonce smoke** — human-verified live (all 5 checks PASS, reported by orchestrator); accepted-deviation follow-up committed as `60860e5` (test)

**Plan metadata:** commit pending (this SUMMARY + STATE.md/ROADMAP.md/REQUIREMENTS.md update)

## Files Created/Modified
- `app/(internal)/not-found.tsx` — new minimal noindex 404 for the `(internal)` route group (admin/driver)
- `i18n/routing.ts` — gained `stripLocalePrefix` (moved from `middleware.ts`, single-source I18N-04 implementation)
- `middleware.ts` — `stripLocalePrefix` now imported from `i18n/routing.ts` instead of being defined locally (no behavior change)
- `tests/i18n-routing.test.ts` — added `stripLocalePrefix` direct unit tests (case-variant/unconfigured non-strip, bare/nested strip, adjacency guard, all-7 parametrized strip) + explicit `hasLocale(..., 'xx')` assertion
- `tests/middleware-i18n.test.ts` — added unconfigured-prefix, case-variant-canonicalization (2 tests), and all-7-locale dynamic-parity edge/security probes
- `.planning/phases/68-i18n-foundation-routing/68-02-PLAN.md` — T-68-06 threat-register row and trailing-slash/case-variance edge statement updated to describe the accepted redirect-to-canonical mitigation

## Decisions Made
- Relocated `stripLocalePrefix` to `i18n/routing.ts` rather than mocking `next-intl/middleware` in `tests/i18n-routing.test.ts` — cleaner single-source outcome, no added test-infra complexity
- Accepted next-intl's native case-normalization redirect behavior for case-variant locale prefixes instead of forcing a hard 404 — see Deviations below

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `stripLocalePrefix` unimportable by a plain unit test without pulling in `next/server`**
- **Found during:** Task 1 (writing the direct `stripLocalePrefix` unit tests per the plan's behavior spec)
- **Issue:** `stripLocalePrefix` was defined (unexported) inside `middleware.ts`. Exporting it and importing `@/middleware` from `tests/i18n-routing.test.ts` (which does not mock `next-intl/middleware`, unlike `tests/middleware-i18n.test.ts`) triggered `Error: Cannot find module '.../node_modules/next/server'` — `next-intl/middleware`'s real (unmocked) module resolution fails outside the harness that mocks it.
- **Fix:** Moved `stripLocalePrefix` into `i18n/routing.ts` (which only imports `next-intl/routing`, not `next-intl/middleware`), and updated `middleware.ts` to import it from there. This also directly matches the plan's own instruction that the 7-locale/stripping logic stay "single-source per I18N-04."
- **Files modified:** `i18n/routing.ts`, `middleware.ts`, `tests/i18n-routing.test.ts`
- **Verification:** Full vitest suite green (104 files / 1179 tests at the time) after the change; `middleware.ts`'s exported `middleware()` behavior is byte-identical (same logic, different file for the helper).
- **Committed in:** `bb5c6fb` (Task 1 commit)

### Accepted Deviations (human-reviewed at checkpoint, not auto-fixed)

**2. Case-variant locale prefixes canonicalize via redirect rather than hard-404 (T-68-06)**
- **Found during:** Task 3 human-verify checkpoint (live browser testing)
- **Original expectation:** PLAN.md's T-68-06 threat-register row and the trailing-slash/case-variance `edges` statement both anticipated `/RU/`, `/Ru/` resolving to a 404 (treated as "not a valid locale," same outcome as the unconfigured-prefix case).
- **Actual behavior:** next-intl's own `createMiddleware` case-normalizes the locale segment and issues a 307 redirect to the canonical lowercase locale (`/RU` → `/ru`, `/Ru` → `/ru`, `/aR` → `/ar`, percent-encoded variants too) — this happens inside next-intl itself, before `middleware.ts`'s own `stripLocalePrefix`/`isDynamicPath` logic ever runs.
- **Safety assessment (human-approved):** Not a security gap — the redirect target is always one of the 7 fixed, configured locales (never attacker-controlled or reflected from the request), only the locale segment is normalized (arbitrary path segments beyond it are untouched, not case-normalized or reflected), and the `/ru/admin` non-bypass invariant still holds after normalization (`/RU/admin` → `/ru/admin` → 404, verified live). Also SEO-beneficial (canonical URL consolidation).
- **Resolution:** Human explicitly accepted the redirect-to-canonical behavior as-is. Updated: `tests/middleware-i18n.test.ts`'s case-variant test (now asserts the 307-redirect-to-canonical behavior for both `/RU/` and `/RU/admin`), `tests/i18n-routing.test.ts`'s `stripLocalePrefix` doc comment (clarifies it documents the helper's own defense-in-depth behavior in isolation, not the end-to-end system behavior), and `.planning/phases/68-i18n-foundation-routing/68-02-PLAN.md`'s T-68-06 threat-register row and edge statement.
- **Files modified:** `tests/middleware-i18n.test.ts`, `tests/i18n-routing.test.ts`, `.planning/phases/68-i18n-foundation-routing/68-02-PLAN.md`
- **Verification:** Full vitest suite green (104 files / 1180 tests) after the update; live-verified in a real browser at the checkpoint.
- **Committed in:** `60860e5` (test, post-checkpoint)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking import issue), 1 accepted (human-reviewed behavior clarification, not a bug)
**Impact on plan:** The Rule 3 fix is a pure refactor with no behavior change (same logic, correct file). The accepted deviation does not weaken any security invariant — it only corrects the plan's anticipated shape of a safe, next-intl-native normalization behavior; the `/ru/admin` non-bypass and unconfigured-prefix 404 invariants are both intact and re-verified.

## Issues Encountered
None beyond the two items documented above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 68 (i18n Foundation & Routing) is now fully complete: route tree, middleware composition, locale config, edge/security hardening, and not-found completeness are all built, tested, and human-verified.
- Ready for Phase 69 (String Externalization — UI Chrome) and Phase 70 (String Externalization — Booking & Account), which can run in parallel per the roadmap's proposed execution order.
- `i18n/request.ts`'s `messages: {}` stub remains intentional — Phase 69 (STR-01) introduces the first message catalog.
- No blockers or concerns carried forward.

## Self-Check: PASSED

All 6 claimed created/modified files (`app/(internal)/not-found.tsx`, `i18n/routing.ts`, `middleware.ts`, `tests/i18n-routing.test.ts`, `tests/middleware-i18n.test.ts`, `.planning/phases/68-i18n-foundation-routing/68-02-PLAN.md`) confirmed present on disk. All 3 task commits (`bb5c6fb`, `eee4158`, `60860e5`) confirmed present in git history.

---
*Phase: 68-i18n-foundation-routing*
*Completed: 2026-09-03*
