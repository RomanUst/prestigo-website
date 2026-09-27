---
phase: 70-string-externalization-booking-account
plan: 02
subsystem: i18n
tags: [next-intl, react, server-actions, auth, vitest, string-externalization]

requires:
  - phase: 70-string-externalization-booking-account
    plan: 01
    provides: "Locked externalization convention + renderWithIntl helper + seeded Booking namespaces (tracer)"
provides:
  - "Errors + Auth catalog namespaces (Errors reused by 70-08 account actions)"
  - "Server-Action locale-threading pattern (PATTERNS Pattern E): getTranslations({namespace, locale}) in actions + .bind(null, locale) in page useActionState"
  - "Fully externalized auth surface: login/actions.ts, login/page.tsx (4 modes), components/auth/OAuthButtons.tsx"
affects: [70-08]

actuals:
  tokens: 0
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Pattern E (Server-Action locale threading) established: Server Actions take a leading locale param, resolve error strings via getTranslations({namespace:'Errors', locale}); the Client page reads useLocale() and binds it into each useActionState via .bind(null, locale)"
    - "Shared Errors namespace collapses six byte-identical repeated error strings into 5 reused keys"

key-files:
  created: []
  modified:
    - app/[locale]/login/actions.ts
    - app/[locale]/login/page.tsx
    - components/auth/OAuthButtons.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/login-actions.test.ts
    - tests/auth-customer.test.ts

key-decisions:
  - "Errors namespace seeded with genericRetry/rateLimited/notAuthenticated/invalidCredentials/couldNotSaveBooking as shared keys — 70-08 account actions reuse these plus account-specific keys"
  - "app/[locale]/login/auth-helpers.ts required no string changes (pure helper, safeReturnTo) — left untouched despite being in the plan file list"
  - "Stub catalogs kept byte-identical EN copies (AI translation deferred to a later milestone phase)"

patterns-established:
  - "Pattern E (Server-Action locale threading) verified end-to-end: four login Server Actions localize errors by route locale, page binds locale into each useActionState, tests assert localized error returns"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "login/actions.ts four actions take a leading locale param and return error strings via getTranslations({namespace:'Errors', locale})"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "tests/login-actions.test.ts"
        status: pass
      - kind: unit
        ref: "grep getTranslations({ namespace: 'Errors', locale }) app/[locale]/login/actions.ts (x4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "login/page.tsx renders four modes from Auth.login and binds route locale into each useActionState via .bind(null, locale)"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep .bind(null, locale) app/[locale]/login/page.tsx (x4) + useLocale()"
        status: pass
    human_judgment: false
  - id: D3
    description: "OAuthButtons renders from Auth.oauth"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep useTranslations('Auth.oauth') components/auth/OAuthButtons.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 6 non-EN stub catalogs re-synced byte-identical to en.json (Auth + Errors added), no MISSING_MESSAGE"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/login-actions.test.ts tests/auth-customer.test.ts (16 tests)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 02: Externalize Auth Surface + Server-Action Locale Threading Summary

**Externalized the authentication surface and introduced the one genuinely new architecture of Phase 70 — the Server-Action locale-threading pattern (PATTERNS Pattern E): login Server Actions now localize their error strings by the validated route locale, and the login page binds that locale into every `useActionState` call.**

## Performance

- **Duration:** ~15 min (interrupted by a session rate-limit mid-Task-3; Task 3 re-sync + finalization completed deterministically by the orchestrator)
- **Completed:** 2026-09-05
- **Tasks:** 3 (plus 1 auto-fixed deviation)
- **Files modified:** 12

## Accomplishments
- `app/[locale]/login/actions.ts`: all four Server Actions (`sendMagicLink`, `signInWithPassword`, `signUpWithPassword`, `sendPasswordReset`) gained a leading `locale` parameter and resolve error strings via `await getTranslations({ namespace: 'Errors', locale })`
- `app/[locale]/login/page.tsx`: reads `useLocale()`, renders all four modes from `useTranslations('Auth.login')`, and binds the locale into each `useActionState` via `.bind(null, locale)`
- `components/auth/OAuthButtons.tsx`: renders from `useTranslations('Auth.oauth')` (`googleLabel`, `continueWithGoogle`)
- `messages/en.json` gained `Errors` (5 shared keys), `Auth.login` (22 keys) and `Auth.oauth` (2 keys); the six byte-identical repeated error strings collapse into reused `Errors` keys
- All 6 stub locales (`ru`, `es`, `fr`, `ar`, `hi`, `zh`) re-synced byte-identical to `en.json`
- `tests/login-actions.test.ts` added (localized error-return assertions); `tests/auth-customer.test.ts` migrated to the real next-intl/server build

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-Action locale threading — Errors namespace + login/actions.ts** - `1aa491b` (feat)
2. **Task 2: Externalize login/page.tsx (4 modes) + OAuthButtons, add login-actions test** - `2212d88` (feat)
3. **Task 3: Re-sync 6 non-EN stub catalogs (Auth + Errors)** - `e72d1a9` (docs)

**Deviation fix:** `0b0b916` (fix — migrate tests/auth-customer.test.ts to the real next-intl/server build)

## Files Created/Modified
- `app/[locale]/login/actions.ts` - Four actions take `locale`, localize errors via `getTranslations({namespace:'Errors', locale})`
- `app/[locale]/login/page.tsx` - `useLocale()` + `useTranslations('Auth.login')`; `.bind(null, locale)` on each `useActionState`
- `components/auth/OAuthButtons.tsx` - `useTranslations('Auth.oauth')`
- `messages/en.json` - New `Errors`, `Auth.login`, `Auth.oauth` namespaces
- `messages/{ru,es,fr,ar,hi,zh}.json` - Re-synced stubs, byte-identical to `en.json`
- `tests/login-actions.test.ts` - New test covering localized error returns
- `tests/auth-customer.test.ts` - Migrated to real next-intl/server build (deviation)

## Decisions Made
- `Errors` is a shared namespace: the five keys deduplicate the previously repeated inline error strings and are explicitly reused by plan 70-08 (account actions) rather than re-minted.
- `app/[locale]/login/auth-helpers.ts` (in the plan's file list) had no user-facing strings (`safeReturnTo` helper) and was left untouched.
- Stub catalogs remain byte-identical EN copies; AI translation is deferred to a later milestone phase (per the locked Phase 69/70 convention).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migrated tests/auth-customer.test.ts to the real next-intl/server build**
- **Issue:** With `login/actions.ts` now importing `getTranslations` from `next-intl/server`, the pre-existing `auth-customer.test.ts` mock shape no longer matched the real server build, so the test needed to exercise the real localization path.
- **Fix:** Migrated the test to the real next-intl/server build.
- **Committed in:** `0b0b916`

### Execution note
The plan's executor subagent was cut off by a session rate-limit (HTTP 429, resets 14:00 Europe/Prague) after committing Tasks 1 and 2 (working tree left clean, no partial uncommitted edits). The orchestrator completed the remaining mechanical **Task 3** (stub catalog re-sync — a deterministic byte-identical `en.json` copy, no model reasoning) and this finalization directly, verified by `cmp` parity and the auth test run.

## Issues Encountered
Session rate-limit interruption mid-plan (handled as above). No code-level issues.

## User Setup Required
None.

## Next Phase Readiness
Pattern E (Server-Action locale threading) is now proven and available for plan 70-08's `account/actions.ts` and `ProfileForm.tsx`, which reuse the shared `Errors` keys and the same `.bind(null, locale)` wiring. Plan 70-03 (booking input primitives) can proceed on the established Pattern A/B/D/F conventions.

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All modified files verified present on disk; commit hashes (1aa491b, 0b0b916, 2212d88, e72d1a9) verified in git log; catalog parity and auth tests (16/16) green.
