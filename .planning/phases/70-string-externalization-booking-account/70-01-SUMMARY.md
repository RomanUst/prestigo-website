---
phase: 70-string-externalization-booking-account
plan: 01
subsystem: i18n
tags: [next-intl, react, vitest, booking, string-externalization]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: "Locked externalization convention (PascalCase namespace / camelCase key / named-ICU / 6 EN-copy stub files), renderWithIntl test helper, Nav.tsx analog pattern"
provides:
  - "Booking.entryBar + Booking.validation catalog namespaces (seed, extended by later Phase 70 plans)"
  - "Fully externalized components/booking/EntryBar.tsx (Client Component useTranslations tracer, first booking-surface file done)"
  - "Proven tracer: full vitest suite green after a booking form component moves to next-intl, including collateral fix to a sibling test file"
affects: [70-02, 70-03, 70-04, 70-05, 70-06, 70-07, 70-08]

actuals:
  tokens: 5250
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Booking.<subKey> namespace convention confirmed for booking Client Components (Pattern A)"
    - "Shared Booking.validation namespace seeded with 'required to continue' family for reuse across later step plans (avoids per-field key duplication, RESEARCH Pitfall 5)"

key-files:
  created: []
  modified:
    - components/booking/EntryBar.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/EntryBar.test.tsx
    - tests/BookingWizard.test.tsx

key-decisions:
  - "Booking.validation seeded with originRequired/destinationRequired/dateRequired/timeRequired/returnDateRequired/returnTimeRequired/returnAfterPickup as shared keys, not duplicated per booking step"
  - "Analytics event params (form_start, checkout_progress, step_name, currency) explicitly excluded from the catalog — third-party schema identifiers, not user copy"

patterns-established:
  - "Pattern A (Client Component useTranslations) verified end-to-end on a real booking form: hook + t()/tv() calls replace every literal, byte-identical English output, green tests"
  - "Any pre-existing test that mounts a now-externalized component transitively needs the renderWithIntl migration too — not just the component's own test file"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "EntryBar renders every visible string and validation error through useTranslations('Booking.entryBar')/('Booking.validation'), byte-identical to prior English text"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "tests/EntryBar.test.tsx (15 tests)"
        status: pass
      - kind: unit
        ref: "grep -c \"useTranslations('Booking.entryBar')\" / \"useTranslations('Booking.validation')\" components/booking/EntryBar.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "EntryBar.test.tsx migrated to renderWithIntl with zero assertion changes"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "npx vitest run tests/EntryBar.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 6 non-EN stub catalogs re-synced byte-identical to en.json, no MISSING_MESSAGE"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json"
        status: pass
      - kind: unit
        ref: "node -e catalog-parity check across all 7 locales for Booking.entryBar"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full vitest suite stays green after EntryBar externalization (wave-merge gate)"
    verification:
      - kind: unit
        ref: "npx vitest run (full suite)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 01: Externalize EntryBar (Booking Tracer) Summary

**Fully externalized `components/booking/EntryBar.tsx` via next-intl — labels, placeholders, aria-labels, and hand-rolled validation errors now source from a seeded `Booking.entryBar`/`Booking.validation` catalog, proving the Phase 69 convention on the first booking-surface file with a green end-to-end test run.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-05T09:21:00Z
- **Completed:** 2026-09-05T09:26:35Z
- **Tasks:** 3 (plus 1 auto-fixed deviation)
- **Files modified:** 10

## Accomplishments
- `EntryBar.tsx` calls `useTranslations('Booking.entryBar')` and `useTranslations('Booking.validation')`; every JSX literal, placeholder, aria-label, and `validate()` error string now resolves from the catalog — English output byte-identical to the prior hardcoded text
- `messages/en.json` gained `Booking.entryBar` (20 keys) and `Booking.validation` (7 seed keys covering the "required to continue" family, reused by later Phase 70 plans)
- `tests/EntryBar.test.tsx` migrated to `renderWithIntl` (Pattern F) — all 15 assertions pass unchanged
- All 6 stub locales (`ru`, `es`, `fr`, `ar`, `hi`, `zh`) re-synced byte-identical to `en.json`
- Full `npx vitest run` (1184 tests) green after also migrating `tests/BookingWizard.test.tsx`, which transitively mounts EntryBar

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize EntryBar visible strings + validation into the catalog** - `a72c7ee` (feat)
2. **Task 2: Migrate tests/EntryBar.test.tsx to renderWithIntl** - `ccbc592` (test)
3. **Task 3: Re-sync 6 non-EN stub catalogs** - `2c8fddf` (docs)

**Deviation fix:** `62f1380` (fix — Rule 1, see below)

_Note: metadata commit (docs: complete plan) is created separately per execute-plan protocol._

## Files Created/Modified
- `components/booking/EntryBar.tsx` - Now consumes `Booking.entryBar`/`Booking.validation` via `useTranslations`; analytics payloads and validation logic untouched
- `messages/en.json` - New `Booking.entryBar` + `Booking.validation` namespaces
- `messages/ru.json`, `messages/es.json`, `messages/fr.json`, `messages/ar.json`, `messages/hi.json`, `messages/zh.json` - Re-synced stubs, byte-identical to `en.json`
- `tests/EntryBar.test.tsx` - `render` swapped for `renderWithIntl as render` (Pattern F), zero assertion changes
- `tests/BookingWizard.test.tsx` - Same swap, needed because it mounts `EntryBar` (deviation, see below)

## Decisions Made
- `Booking.validation` seeded as a shared namespace up front (not per-field duplicated) per RESEARCH Pitfall 5 guidance — later Phase 70 step plans (Step2DateTime, Step5Passenger, etc.) reuse these same 7 keys instead of minting near-duplicates.
- Analytics event identifiers (`form_start`, `checkout_progress`, `step_name: 'entry_bar'`, `currency: 'EUR'`) were left as raw string literals per the plan's explicit prohibition — confirmed via grep that they remain unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migrated tests/BookingWizard.test.tsx to renderWithIntl**
- **Found during:** Post-Task-3 wave-merge gate (`npx vitest run`, full suite)
- **Issue:** `BookingWizard.test.tsx` mounts `<BookingWizard />`, which renders `EntryBar` as its step-1 child. `EntryBar` now calls `useTranslations`, but this pre-existing test file still used a bare `render()` with no `NextIntlClientProvider`, causing `useTranslations` to throw ("context ... was not found") — 3 tests failed (`ProgressBar reports 5 steps total`, `step 1 mounts EntryBar`, `checkout_progress fires with step_name "entry_bar"`).
- **Fix:** Applied the same mechanical import-alias swap as `tests/EntryBar.test.tsx` — `import { renderWithIntl as render } from './helpers/renderWithIntl'` replacing the bare `@testing-library/react` render import. Zero assertion changes.
- **Files modified:** `tests/BookingWizard.test.tsx`
- **Verification:** `npx vitest run tests/BookingWizard.test.tsx` → 9 passed, 7 todo; full suite `npx vitest run` → 1184 passed, 10 skipped, 139 todo, 0 failed
- **Committed in:** `62f1380`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug, directly caused by this plan's EntryBar change)
**Impact on plan:** Necessary to keep the wave-merge gate green; no scope creep — the fix is the identical, already-locked Pattern F swap applied to a second file, not new work.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
The Phase 69 Pattern A/D/F convention is now proven end-to-end on a real booking form (not just UI chrome): hook wiring, hand-rolled validation-string sourcing, test-harness migration, and stub re-sync all work identically for `components/booking/`. Plan 70-02 can proceed with the same convention across the next booking step components with no unresolved convention questions.

Reminder for downstream plans: any pre-existing test file that mounts an already-externalized component (not just the component's own test) must also be checked for the `renderWithIntl` migration — this surfaced once here (`BookingWizard.test.tsx`) and will likely recur as more of the ~28 booking files convert (e.g. `Step3Vehicle.test.tsx`, `StickyBookingPanel.test.tsx` once their consumed components externalize).

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*
