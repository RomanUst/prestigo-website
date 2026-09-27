---
phase: 70-string-externalization-booking-account
plan: 08
subsystem: i18n
tags: [next-intl, react, server-components, server-actions, account, auth, vitest, string-externalization, phase-gate]

requires:
  - phase: 70-string-externalization-booking-account
    plan: 02
    provides: "Errors namespace + Pattern E (Server-Action locale threading)"
  - phase: 70-string-externalization-booking-account
    plan: 04
    provides: "Booking.vehicleClasses single-source labels + VEHICLE_CLASS_KEY"
provides:
  - "Fully externalized account + auth-account surface: account/page.tsx + trips/page.tsx (getTranslations), ProfileForm.tsx + reset-password/page.tsx (useTranslations), account/actions.ts (locale-threaded Server Actions)"
  - "Account.dashboard / Account.trips (statusLabels) / Account.profile / Account.resetPassword catalog namespaces"
  - "Errors extended with fullNameRequired / phoneRequired / duplicateDefaultPassenger / invalidAccountType (shared, reused from 70-02)"
  - "PHASE 70 GATE GREEN: full vitest suite, 7-locale build (0 MISSING_MESSAGE), single-source vehicle-label grep = 0"
affects: []

actuals:
  tokens: 12343
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pattern C (Server Component getTranslations) applied to account/page.tsx + trips/page.tsx; class labels resolved from Booking.vehicleClasses via VEHICLE_CLASS_KEY (single source, no local label map)"
    - "Pattern E (Server-Action locale threading) reused: account/actions.ts 4 actions take a leading locale param + getTranslations({namespace:'Errors', locale}); ProfileForm binds locale via .bind(null, locale) into each useActionState"
    - "Status-label split: STATUS_STYLES keeps colour-only values in code; label text moves to Account.trips.statusLabels; the 4-key gap + ?? pending fallback preserved byte-for-byte"

key-files:
  created: []
  modified:
    - app/[locale]/account/page.tsx
    - app/[locale]/account/trips/page.tsx
    - components/account/ProfileForm.tsx
    - app/[locale]/account/actions.ts
    - app/[locale]/account/reset-password/page.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/account-trips.test.tsx
    - tests/profile-actions.test.ts
    - tests/passenger-actions.test.ts

key-decisions:
  - "account/trips class labels resolve from the single-source Booking.vehicleClasses catalog via VEHICLE_CLASS_KEY (snake_case DB value -> camelCase catalog key); no local CLASS_LABELS map re-added (prohibition honoured)"
  - "STATUS_STYLES reduced to colour-only values; label text externalized into Account.trips.statusLabels keeping EXACTLY 4 keys; status resolution derives statusKey then falls back to 'pending' — preserving the pre-existing gap byte-for-byte (Success Criterion 4)"
  - "account/actions.ts reuses shared Errors keys notAuthenticated/genericRetry from 70-02 and extends Errors with fullNameRequired/phoneRequired/duplicateDefaultPassenger/invalidAccountType (no duplicate namespace); ownership checks + control flow untouched"
  - "reset-password/page.tsx uses Account.resetPassword for page copy and reuses Errors.genericRetry (second useTranslations('Errors') hook) for the supabase error fallback rather than duplicating the string"
  - "PassengerEditor (module-scoped to avoid remount) receives the translator via a `t` prop typed ProfileTranslator = ReturnType<typeof useTranslations<'Account.profile'>>"
  - "profile/page.tsx confirmed pure composition (0 user-facing strings) — left unchanged"
  - "reset-password 'PRESTIGO' wordmark left literal (brand proper noun); en-GB date format in trips untouched (L10N-PRICE, deferred)"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "account/page.tsx + trips/page.tsx render all strings via getTranslations('Account.*'); Signed-in-as uses named-ICU; trips class labels reuse Booking.vehicleClasses; 4-key status gap + en-GB format preserved"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep getTranslations('Account.dashboard') + getTranslations('Account.trips'); en-GB count >=1; First Class = 0; node check statusLabels == 4 keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "ProfileForm + reset-password render from the catalog; account/actions.ts localizes errors via a threaded locale reusing/extending Errors; ownership checks untouched"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep getTranslations({namespace:'Errors' x4; useTranslations in actions = 0; .bind(null, locale) >=4; useLocale() >=1; template-literal aria = 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "account tests migrated to real next-intl/server build, locale='en' threaded, Errors round-trip asserted; 6 stubs byte-identical"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "npx vitest run tests/account-trips.test.tsx tests/profile-actions.test.ts tests/passenger-actions.test.ts (23 passed); cmp -s all 6 stubs"
        status: pass
    human_judgment: false
  - id: D4
    description: "PHASE 70 GATE: full suite green, 7-locale build clean (no MISSING_MESSAGE), phase-wide single-source vehicle-label grep = 0"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "npx vitest run -> 1190 passed; npm run build -> exit 0, 0 MISSING_MESSAGE; grep residual vehicle-class label = 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 08: Account + Auth-Account Externalization + Phase Gate Summary

**Externalized the entire account and auth-account surface — the dashboard and trips Server Components (`getTranslations`), `ProfileForm` and `reset-password` Client Components (`useTranslations`), and the four `account/actions.ts` Server Actions (locale-threaded, reusing the shared `Errors` namespace) — then ran the Phase 70 gate green: full test suite, a clean 7-locale production build with no `MISSING_MESSAGE`, and a phase-wide single-source vehicle-label grep returning zero. STR-02 complete.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-05
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- `account/page.tsx`: Server Component now renders via `await getTranslations('Account.dashboard')`; the "Signed in as {email}" line uses named-ICU
- `account/trips/page.tsx`: renders via `await getTranslations('Account.trips')`; deleted the local `CLASS_LABELS` map and resolves class labels from the single-source `Booking.vehicleClasses` (via `VEHICLE_CLASS_KEY`); status labels externalized to `Account.trips.statusLabels` keeping EXACTLY the 4 keys and the `?? pending` fallback; `en-GB` date format untouched
- `components/account/ProfileForm.tsx`: added `useLocale()` + `useTranslations('Account.profile')`; bound the locale into all four `useActionState` calls via `.bind(null, locale)`; converted `Edit ${name}`/`Delete ${name}` aria to named-ICU; converted the remove-confirmation to `t.rich` with an inline highlighted name; threaded the translator into the module-scoped `PassengerEditor`
- `account/actions.ts`: all four actions (`updateProfile`, `addPassenger`, `updatePassenger`, `deletePassenger`) gained a leading `locale` param and resolve errors via `getTranslations({ namespace: 'Errors', locale })`; reused `notAuthenticated`/`genericRetry` and extended `Errors` with `fullNameRequired`/`phoneRequired`/`duplicateDefaultPassenger`/`invalidAccountType`; ownership checks + control flow untouched
- `reset-password/page.tsx`: renders from `Account.resetPassword`; the supabase error fallback reuses `Errors.genericRetry`
- `profile/page.tsx`: confirmed pure composition (0 user-facing strings) — unchanged
- Added `Account.dashboard` / `Account.trips` / `Account.profile` / `Account.resetPassword` to the catalog, English byte-for-byte; re-synced 6 non-EN stubs byte-identical
- Extended `account-trips` / `profile-actions` / `passenger-actions` tests: real `next-intl/server` build mock, `locale='en'` first arg, explicit `Errors` round-trip assertions

## Task Commits

1. **Task 1: externalize account dashboard + trips Server Components** — `78f31f8` (feat)
2. **Task 2: externalize ProfileForm + account actions + reset-password** — `7f96679` (feat)
3. **Task 3: phase gate — account tests + resync stubs** — `b8185e7` (test)

_Metadata commit (docs: complete plan) is created separately per execute-plan protocol._

## Phase 70 Gate Result

- **Full `npx vitest run`:** 108 files passed / 4 skipped — **1190 tests passed**, 10 skipped, 139 todo (no regression from the phase baseline plus this plan's additions)
- **`npm run build`:** exit 0, "Compiled successfully", **0 `MISSING_MESSAGE`** across all 7 locale subpaths
- **Single-source vehicle-label grep:** `grep -rn "First Class" components/booking "app/[locale]/account" | grep -v messages` → **0 matches** (no hardcoded vehicle-class display label remains in the in-scope tree)

## Decisions Made
- Class labels in `trips/page.tsx` resolve from `Booking.vehicleClasses` via `VEHICLE_CLASS_KEY` (snake_case DB `vehicle_class` → camelCase catalog key); the raw value remains the fallback for an unknown class. No local label map re-added (prohibition honoured).
- `STATUS_STYLES` reduced to colour-only entries; label text moved to `Account.trips.statusLabels`. Status resolution computes `statusKey = STATUS_STYLES[trip.status] ? trip.status : 'pending'`, then reads colour + label from that key — preserving the pre-existing 4-key gap and `pending` fallback byte-for-byte (Success Criterion 4).
- `account/actions.ts` reuses the shared `Errors` keys from 70-02 and extends the same namespace (no duplication). Only error string values changed; the `getUser()`-derived `user_id` ownership checks and all control flow are untouched (T-70-08-02 mitigation).
- `reset-password` reuses `Errors.genericRetry` via a second `useTranslations('Errors')` hook rather than duplicating the string in `Account.resetPassword`.
- `PassengerEditor` stays module-scoped (CR-03: avoids React remount) and receives the translator through a typed `t` prop.

## Deviations from Plan
None — plan executed as written. `profile/page.tsx` confirmed 0-string and left unchanged (as the plan anticipated). Three pre-existing `AccountTripsPage({})` call sites (0-arg function) were tidied to `AccountTripsPage()` while migrating that test file, clearing their pre-existing `TS2554` errors.

## Threat Mitigations Applied
- **T-70-08-01 (Spoofing/Tampering):** `locale` is bound from `useLocale()` (validated route segment), never from FormData.
- **T-70-08-02 (Elevation of Privilege):** only error string values changed + a leading `locale` param added; `getUser()`-derived ownership checks and control flow untouched (verified by diff + passing IDOR/mass-assignment tests).
- **T-70-08-03 (Repudiation):** `profile-actions`/`passenger-actions` tests assert the exact English error text via the live `Errors` catalog; stub-sync keeps non-EN locales resolving every key.
- **T-70-08-04 (Information Disclosure):** only visible copy externalized; no PII/token/session detail enters the catalog.

## Known Stubs
None. All account strings are wired to the catalog; the 6 non-EN locales are byte-identical EN copies (intentional stub-sync per the locked convention — real translations land in later i18n phases).

## Issues Encountered
- Pre-existing `tsc` errors in `tests/nav-auth.test.tsx` (unrelated to this plan, noted in 70-04) remain out of scope. All errors in the account test files this plan touched are resolved.

## User Setup Required
None.

## Next Phase Readiness
STR-02 is complete and the Phase 70 gate is green — the full booking + account + auth surface renders from the catalog with English byte-for-byte unchanged across all 7 locales. **Next step:** Phase 70 is finished; proceed to phase verification (`/gsd-verify-work` or the milestone's next phase, e.g. Phase 71 per ROADMAP v3.0).

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All 15 modified files + SUMMARY.md verified present on disk; all 3 task commit hashes (78f31f8, 7f96679, b8185e7) verified in git log. Phase gate independently re-run: 1190 tests passed, build exit 0 with 0 MISSING_MESSAGE, residual vehicle-class label grep = 0.
