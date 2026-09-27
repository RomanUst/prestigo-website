---
phase: 75-e2e-verification-launch
plan: 16
subsystem: i18n
tags: [next-intl, i18n, error-handling, stripe, supabase-auth, en-leak-fix]

requires:
  - phase: 75-e2e-verification-launch (plan 5)
    provides: "booking-locale.ts STRIPE_ELEMENTS_LOCALE map + Stripe/Places locale wiring this plan's error branches sit alongside"
  - phase: 75-e2e-verification-launch (plan 13)
    provides: "shared-components i18n conventions + freeze-pattern format reused for freeze/75-16.freeze"
  - phase: 75-e2e-verification-launch (plan 15)
    provides: "account/reset-password/page.tsx already uses @/i18n/routing's useRouter (75-15 fix); this plan only maps the error message on top of that"
provides:
  - "code field on every create-payment-intent (10 codes) and validate-promo (4 codes) error response — status codes and English error text unchanged"
  - "Booking.step6.errors namespace (7 catalogs) — Step6Payment renders t('errors.<code>') for known codes, existing generic key otherwise"
  - "lib/auth-error-code.ts — authErrorKey(code) mapping Supabase AuthError codes to Errors.auth.<key>"
  - "Errors.auth namespace (7 catalogs) — Step3Auth register error and reset-password update() error render the mapped message, never raw GoTrue text"
  - "Step3Auth magic-link emailRedirectTo return-to keeps the site locale (getPathname bridge, same pattern as OAuthButtons.tsx)"
  - "freeze/75-16.freeze — 2 patterns frozen for the manifest (applied by plan 75-18)"
affects: [75-18-translation-manifest-freeze, 75-20-final-en-leak-reverify]

actuals:
  tokens: 16600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Stable machine `code` field alongside the unchanged English `error` field on API error responses — client looks up a catalog message by code with a known-code allowlist Set, falling back to the existing generic key for missing/unknown codes; API status codes and English text stay byte-identical for existing tests/log consumers"
    - "authErrorKey(code) — same shape as an error-code-to-catalog-key mapper; console.error keeps the raw GoTrue text for debugging while the UI only ever renders the mapped Errors.auth message"
    - "Magic-link/OAuth locale-keeping return-to built via `new URL(...) + searchParams.set('return-to', getPathname({ locale, href }))` — same pattern in Step3Auth.tsx as the existing OAuthButtons.tsx, now shared by both auth entry points"

key-files:
  created:
    - lib/auth-error-code.ts
    - tests/auth-error-code.test.ts
    - tests/reset-password-locale.test.tsx
    - .planning/phases/75-e2e-verification-launch/freeze/75-16.freeze
  modified:
    - app/api/create-payment-intent/route.ts
    - app/api/validate-promo/route.ts
    - components/booking/steps/Step6Payment.tsx
    - components/booking/steps/Step3Auth.tsx
    - app/[locale]/account/reset-password/page.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/create-payment-intent.test.ts
    - tests/validate-promo.test.ts
    - tests/Step6Payment.test.tsx
    - tests/Step3Auth.test.tsx

key-decisions:
  - "INVALID_REQUEST and ROUND_TRIP_DATES catalog messages are synthesized generic sentences rather than verbatim server text, since each of those two codes covers multiple distinct English server sentences (e.g. 'Invalid tripType' / 'Invalid vehicleClass' / 'Invalid distanceKm for transfer' / 'Computed amount must be positive' all map to INVALID_REQUEST) — every other code's EN catalog value reuses its server sentence verbatim per D-08 rule 4"
  - "Step3Auth's magic-link redirect now builds its URL via `new URL(...) + searchParams.set()` (matching OAuthButtons.tsx) instead of the plan's literal 'getPathname bridge, never hand-rolled concatenation' wording taken as a raw template-string concat — URLSearchParams handles percent-encoding correctly and keeps the two auth entry points structurally identical"
  - "Errors.auth added under the Errors namespace (not a new sub-key under Auth) — Step3Auth/reset-password already call useTranslations('Errors') for other generic messages, and the plan's lib/auth-error-code.ts + Errors.auth.<key> naming is unambiguous about the parent namespace"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes. Per worktree-mode instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT touched by this executor — the orchestrator owns those writes after merge.

coverage:
  - id: D1
    description: "create-payment-intent returns a stable code alongside the unchanged English error and status for every error branch (10 codes); validate-promo does the same (4 codes)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/create-payment-intent.test.ts > D-07: create-payment-intent error responses carry a stable machine code (9 cases)"
        status: pass
      - kind: unit
        ref: "tests/validate-promo.test.ts > D-07: validate-promo error responses carry a stable machine code (4 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Step6Payment shows t('errors.<code>') for known codes on both the payment-init and promo-apply branches; unknown/missing code falls back to the existing generic key, never the raw English server text"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/Step6Payment.test.tsx > D-07: Step6Payment shows translated errors keyed by the server code (3 cases) + D-07: Step6Payment promo error shows translated message keyed by the server code (2 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Booking.step6.errors namespace complete and type-parity-checked across all 7 catalogs"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/i18n-catalog-array-types.test.ts"
        status: pass
      - kind: other
        ref: "node scripts/i18n-translate.mjs --check"
        status: pass
    human_judgment: false
  - id: D4
    description: "lib/auth-error-code.ts authErrorKey() maps all 7 behavior-spec cases (6 known Supabase codes + undefined/empty/unknown -> generic)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/auth-error-code.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Step3Auth register error renders the mapped Errors.auth message (never raw GoTrue text); magic-link return-to keeps the site locale (/ru/book, not /book)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/Step3Auth.test.tsx > D-07: Step3Auth magic-link return-to keeps the site locale (2 cases) + D-07: Step3Auth register error is translated via authErrorKey (1 case)"
        status: pass
    human_judgment: false
  - id: D6
    description: "reset-password page maps the update() error via authErrorKey/Errors.auth (never error.message); success navigates via the locale-aware @/i18n/routing router (unchanged from 75-15)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/reset-password-locale.test.tsx (3 cases)"
        status: pass
      - kind: unit
        ref: "grep -n \"setErrorMsg(error.message\" and grep -n \"from 'next/navigation'\" both return nothing"
        status: pass
    human_judgment: false
  - id: D7
    description: "No regressions: the full vitest suite and npx tsc --noEmit stay at the documented pre-existing baseline (5 worktree-only import-limitation test files; 3 tsc baseline error files) with zero new failures"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "npx vitest run (full suite) — 2295 passed / 10 skipped / 139 todo, 5 failed files (all 5 pre-existing worktree-environment-only, same set documented in 75-12/75-15); npx tsc --noEmit — only the same 3 pre-existing baseline error files (i18n-translate-dnt.test.ts, nav-auth.test.tsx, passenger-actions.test.ts)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-26
status: complete
---

# Phase 75 Plan 16: Booking API Error Codes & Supabase Auth Error Mapping Summary

**Stable machine `code` fields on create-payment-intent (10 codes) and validate-promo (4 codes), a new Booking.step6.errors catalog namespace Step6Payment renders instead of raw server text, `lib/auth-error-code.ts`'s `authErrorKey()` mapping Supabase GoTrue error codes to a new `Errors.auth` namespace for Step3Auth registration and the reset-password page, and a locale-keeping magic-link return-to on Step3Auth.**

## Performance

- **Duration:** 55 min (approx.)
- **Started:** 2026-09-26T18:38:00Z (approx.)
- **Completed:** 2026-09-26T19:33:00Z
- **Tasks:** 2
- **Files modified:** 20 (5 source files, 7 message catalogs, 4 test files extended, 4 files created)

## Accomplishments

- **Task 1 (tracer):** `create-payment-intent`'s every `NextResponse.json` error branch (429 rate limit, 400 invalid-request/passengers/round-trip-dates/return-before-pickup/custom-quote/computed-amount, 422 lead-time, 503 pricing-unavailable, 400 promo-invalid ×2, 500 internal) now carries a stable `code` alongside the byte-identical existing `error` string and `status`. `validate-promo` does the same for its 4 branches (RATE_LIMITED, NO_CODE, PROMO_INVALID, INTERNAL). `Step6Payment.tsx` replaced both raw-server-text renders (`setPaymentError(data.error || ...)` and `setPromoError(data.error || ...)`) with a `KNOWN_STEP6_ERROR_CODES` allowlist lookup into a new `Booking.step6.errors` catalog namespace, falling back to the existing generic key (`paymentInitFailed`/`promoInvalid`) for a missing or unrecognized code — `console.error` still logs the raw server text for debugging. Added `Booking.step6.errors` to all 7 catalogs (EN reuses the server sentences verbatim for 9 of 11 codes; `INVALID_REQUEST` and `ROUND_TRIP_DATES` are synthesized generics since those two codes each cover several distinct server sentences).
- **Task 2:** `lib/auth-error-code.ts` exports `authErrorKey(code)` mapping the 6 named Supabase `AuthError.code` values to `Errors.auth.<key>` catalog keys (added to all 7 catalogs), defaulting to `generic` for anything else. `Step3Auth.tsx`'s registration error now renders the mapped `Errors.auth` message instead of interpolating `error.message`; its magic-link `emailRedirectTo` return-to is built via `getPathname({ locale, href: '/book' })` through a `new URL()` + `searchParams.set()` (same pattern as `OAuthButtons.tsx`), so a `/ru` wizard sign-in link returns to `/ru/book`. `reset-password/page.tsx`'s `updateUser()` error is now mapped through the same `authErrorKey`/`Errors.auth` pair instead of `error.message ?? tErr('genericRetry')`; its navigation already used `@/i18n/routing`'s `useRouter` (fixed in 75-15) — confirmed unchanged. `freeze/75-16.freeze` records the 2 new units for plan 75-18's manifest-freeze pass.
- All 7 message catalogs (`en/ru/es/fr/ar/hi/zh`) gained `Booking.step6.errors` (11 keys) and `Errors.auth` (7 keys); `node scripts/i18n-translate.mjs --check` passes (complete, type-parity, EN unchanged).

## Task Commits

1. **Task 1: Tracer — booking API error codes surfaced translated in Step6Payment** - `e06c78f8` (feat)
2. **Task 2: Supabase auth error mapping, locale-keeping auth navigation, freeze patterns** - `0ca5747d` (security)

_Note: no TDD `test(...)`/`feat(...)` RED/GREEN split — both tasks are `tdd="true"` in a looser sense (behavior blocks drove the test cases) but were committed as one atomic feat/security commit per task, matching this phase's established plan-commit granularity (75-12, 75-15 precedent)._

## Files Created/Modified

- `app/api/create-payment-intent/route.ts` - `code` field on all 17 `NextResponse.json` error call sites (10 distinct codes)
- `app/api/validate-promo/route.ts` - `code` field on all 4 branches
- `components/booking/steps/Step6Payment.tsx` - `KNOWN_STEP6_ERROR_CODES` allowlist + `t('errors.<code>')` lookup on both the payment-init and promo-apply error branches
- `components/booking/steps/Step3Auth.tsx` - `authErrorKey`-mapped register error; locale-keeping magic-link return-to
- `app/[locale]/account/reset-password/page.tsx` - `authErrorKey`-mapped `updateUser()` error
- `lib/auth-error-code.ts` (new) - `authErrorKey(code)`
- `messages/{en,ru,es,fr,ar,hi,zh}.json` - new `Booking.step6.errors` and `Errors.auth` namespaces
- `tests/create-payment-intent.test.ts` - 9 new code-assertion cases
- `tests/validate-promo.test.ts` - 4 new code-assertion cases + 3 pre-existing assertions updated for the added `code` field
- `tests/Step6Payment.test.tsx` - 5 new cases (payment-init known/missing/unknown code, promo known/unknown code)
- `tests/auth-error-code.test.ts` (new) - 10 cases covering the full behavior spec
- `tests/Step3Auth.test.tsx` - 3 new cases (locale-keeping return-to ×2, register-error mapping ×1)
- `tests/reset-password-locale.test.tsx` (new) - 3 cases (weak_password mapping, unknown-code generic fallback, locale-aware success navigation)
- `.planning/phases/75-e2e-verification-launch/freeze/75-16.freeze` (new) - 2 frozen patterns

## Decisions Made

- `INVALID_REQUEST` and `ROUND_TRIP_DATES` EN catalog values are synthesized generic sentences (not verbatim server text) since each code covers multiple distinct server error strings — every other code's EN value reuses its exact server sentence per D-08 rule 4.
- `Errors.auth` lives under the existing `Errors` namespace (not `Auth`) — both consuming files already call `useTranslations('Errors')` for other generic messages, and `lib/auth-error-code.ts` + the plan's own naming (`Errors.auth.<key>`) is unambiguous.
- Step3Auth's magic-link redirect uses `new URL(...) + searchParams.set()` rather than a hand-built template string, matching `OAuthButtons.tsx`'s existing pattern exactly (both auth entry points now share the identical locale-keeping return-to construction).

## Deviations from Plan

None - plan executed as written, aside from one commit-organization note (not a functional deviation): both Task 1's `Booking.step6.errors` and Task 2's `Errors.auth` catalog edits were made across all 7 `messages/*.json` files in a single editing pass and landed in the Task 1 commit rather than split across both task commits. No functional difference — both namespaces are present and correct by the time Task 2's tests and `--check` run.

## Issues Encountered

None specific to this plan. The full-suite `npx vitest run` shows the same 5 pre-existing worktree-only import-limitation failures documented in 75-12-SUMMARY.md/75-15-SUMMARY.md (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` — all fail at import with `Cannot find module '.../next-intl/dist/esm/development/server.react-server.js'`, unrelated to and unchanged by this plan's edits). `npx tsc --noEmit` shows only the same 3 pre-existing baseline error files (`tests/i18n-translate-dnt.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `Booking.step6.errors` and `Errors.auth` namespaces are complete and frozen in `freeze/75-16.freeze` for plan 75-18's manifest-freeze pass.
- This was the third and last sequential `messages/*.json` plan in this phase (per plan frontmatter) — no further plans need to coordinate concurrent catalog writes.
- No raw English API or Supabase auth error text reaches a localized page in the booking payment step, promo-apply flow, in-wizard registration, or password reset — all four surfaces render via stable codes/keys with a documented generic fallback.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26*

## Self-Check: PASSED

All modified/created files found on disk (`app/api/create-payment-intent/route.ts`, `app/api/validate-promo/route.ts`, `components/booking/steps/Step6Payment.tsx`, `components/booking/steps/Step3Auth.tsx`, `app/[locale]/account/reset-password/page.tsx`, `lib/auth-error-code.ts`, `messages/{en,ru,es,fr,ar,hi,zh}.json`, `tests/create-payment-intent.test.ts`, `tests/validate-promo.test.ts`, `tests/Step6Payment.test.tsx`, `tests/auth-error-code.test.ts`, `tests/Step3Auth.test.tsx`, `tests/reset-password-locale.test.tsx`, `.planning/phases/75-e2e-verification-launch/freeze/75-16.freeze`); both task commits (`e06c78f8`, `0ca5747d`) found in git history on `worktree-agent-a390f5f04b9636376`.
