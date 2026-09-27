---
phase: 70-string-externalization-booking-account
plan: 07
subsystem: i18n
tags: [next-intl, react, string-externalization, named-icu, auth, vitest, booking]

requires:
  - phase: 70-string-externalization-booking-account
    plan: 06
    provides: "Locked externalization convention (PascalCase namespace / camelCase key / named-ICU / renderWithIntl Pattern F) + 6 byte-identical stub locales"
  - phase: 70-string-externalization-booking-account
    plan: 02
    provides: "Auth + Errors catalog namespaces (Auth.login / Auth.oauth / Errors shared keys) reused here"
provides:
  - "Booking.multiDayForm + Booking.dayCard (named-ICU day aria) catalog namespaces"
  - "Auth.inWizard namespace: the in-wizard sign-in/register UI, reusing shared Auth.login + Errors keys"
  - "Fully externalized multi-day booking flow (MultiDayForm, DayCard) + in-wizard auth (Step3Auth)"
  - "New tests/Step3Auth.test.tsx renderWithIntl smoke test"
affects: [70-08]

actuals:
  tokens: 9031
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Named-ICU day aria (Pattern D): DayCard's six-plus interpolated `Day ${index+1} …` aria/label templates collapse to a single `dayLabel: \"Day {day}\"` + per-variant `t('key',{day})` calls"
    - "Cross-namespace key reuse: Step3Auth binds three hooks (Auth.inWizard + Auth.login + Errors) to share byte-identical labels (Email/Password/Sign in/Create account/or/Use password) and error strings (genericRetry/invalidCredentials) rather than re-minting them"
    - "t.rich value+tag combo: codeSentTo renders `<strong>{email}</strong>` with email as a value and strong as a wrapping tag in one ICU message"

key-files:
  created:
    - tests/Step3Auth.test.tsx
  modified:
    - components/booking/MultiDayForm.tsx
    - components/booking/DayCard.tsx
    - components/booking/steps/Step3Auth.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/MultiDayForm.test.tsx
    - tests/DayCard.test.tsx

key-decisions:
  - "MultiDayForm's module-scope validateDays/validatePassenger now take a translator param (t: MultiDayTranslator) so the role=alert validation strings — including the interpolated `Day {day}: …` variants — resolve from the catalog via named-ICU without moving the helpers into the component closure"
  - "DayCard hours <option> uses ICU plural `{count, plural, one {# hour} other {# hours}}` in place of the `{h} {h === 1 ? 'hour' : 'hours'}` ternary"
  - "Step3Auth reuses Auth.login (emailLabel/passwordLabel/signInButton/createAccountButton/divider/tabUsePassword) and Errors (genericRetry/invalidCredentials) keys; only 11 in-wizard-specific keys live under Auth.inWizard"
  - "Marketing teaser headlines in BookingSection/HourlyBookingSection left untouched — deferred to Phase 71 as planned (their embedded BookingWidget was externalized in 70-05)"
  - "Stub catalogs re-synced byte-identical to en.json via `cp` (AI translation deferred to a later milestone phase, per locked convention)"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "MultiDayForm renders all labels, the start-date aria, and the role=alert validation block from Booking.multiDayForm"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep useTranslations('Booking.multiDayForm') components/booking/MultiDayForm.tsx"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/MultiDayForm.test.tsx (11 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DayCard's interpolated day aria templates use named-ICU t('key',{day}); no template-literal aria remains"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep -nE 'aria-label=\\{`Day ' components/booking/DayCard.tsx returns 0"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/DayCard.test.tsx (10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Step3Auth renders all visible strings from Auth.inWizard, reusing shared Auth.login/Errors keys where identical; Supabase logic unchanged"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep useTranslations('Auth.inWizard') components/booking/steps/Step3Auth.tsx + 0 hardcoded alpha placeholders"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/Step3Auth.test.tsx (new renderWithIntl smoke)"
        status: pass
    human_judgment: false
  - id: D4
    description: "6 non-EN stub catalogs re-synced byte-identical to en.json; full suite green"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json (all pass)"
        status: pass
      - kind: unit
        ref: "npx vitest run (1188 passed | 4 files skipped)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 07: Externalize Multi-Day Booking Flow + In-Wizard Auth Summary

**Externalized the multi-day booking surface (`MultiDayForm`, `DayCard`) and the separate in-wizard sign-in/register UI (`Step3Auth`) — DayCard's six-plus interpolated `Day {n} …` aria templates collapse to named-ICU, and Step3Auth renders under a new `Auth.inWizard` namespace that reuses shared `Auth.login` + `Errors` keys rather than re-minting byte-identical strings.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-05
- **Tasks:** 3
- **Files modified:** 12 (1 created)

## Accomplishments
- `components/booking/MultiDayForm.tsx`: `useTranslations('Booking.multiDayForm')` drives every label, the start-date aria, the `role=alert` validation block (including named-ICU `Day {day}: …` variants), fetch-error messages, and the success confirmation panel. `validateDays`/`validatePassenger` take a translator param so their strings resolve from the catalog.
- `components/booking/DayCard.tsx`: `useTranslations('Booking.dayCard')` — all six-plus `Day ${index+1} …` aria/label template literals converted to named-ICU `t('key', {day})`; the header/section day label shares one `dayLabel: "Day {day}"` key; hours `<option>` uses an ICU plural.
- `components/booking/steps/Step3Auth.tsx`: `useTranslations('Auth.inWizard')` for the 11 in-wizard-specific strings, plus `Auth.login` and `Errors` hooks for the six shared labels and two shared error strings; `codeSentTo` rendered via `t.rich` (value + `<strong>` tag). Supabase OTP/password/register control flow untouched.
- `messages/en.json`: `Booking.multiDayForm` (29 keys), `Booking.dayCard` (28 keys), `Auth.inWizard` (11 keys) added; 6 stub locales re-synced byte-identical.
- `tests/MultiDayForm.test.tsx` + `tests/DayCard.test.tsx` migrated to `renderWithIntl` (Pattern F); `tests/Step3Auth.test.tsx` created (renderWithIntl smoke, Supabase + OAuthButtons mocked via `vi.hoisted`).

## Task Commits

1. **Task 1: MultiDayForm + DayCard (named-ICU day aria)** — `23af767` (feat)
2. **Task 2: Step3Auth (in-wizard auth) → Auth.inWizard** — `d5db709` (feat)
3. **Task 3: Migrate MultiDayForm/DayCard tests + add Step3Auth smoke, re-sync stubs** — `6df216f` (test)

## Files Created/Modified
- `components/booking/MultiDayForm.tsx` — `Booking.multiDayForm`; translator-param validation helpers
- `components/booking/DayCard.tsx` — `Booking.dayCard`; named-ICU day aria; ICU-plural hours option
- `components/booking/steps/Step3Auth.tsx` — `Auth.inWizard` + shared `Auth.login`/`Errors` reuse; `t.rich` codeSentTo
- `messages/en.json` — new `Booking.multiDayForm`, `Booking.dayCard`, `Auth.inWizard`
- `messages/{ru,es,fr,ar,hi,zh}.json` — re-synced stubs, byte-identical to `en.json`
- `tests/MultiDayForm.test.tsx`, `tests/DayCard.test.tsx` — migrated to `renderWithIntl`
- `tests/Step3Auth.test.tsx` — new renderWithIntl smoke test

## Decisions Made
- The MultiDayForm validation helpers stay at module scope but take a `t: MultiDayTranslator` argument — the cleanest way to localize interpolated validation strings without restructuring the component.
- DayCard's hours `<option>` moved to an ICU plural (`{count, plural, one {# hour} other {# hours}}`), preserving the rendered "N hours"/"1 hour" output.
- Step3Auth reuses six `Auth.login` keys and two `Errors` keys via secondary hooks (`tLogin`, `tErr`) instead of duplicating them under `Auth.inWizard`, keeping the catalog DRY per the plan's must-have.

## Deviations from Plan

None — plan executed exactly as written. The teaser-wrapper marketing headlines (BookingSection/HourlyBookingSection) were left untouched as explicitly deferred to Phase 71.

## Threat Surface
No new security-relevant surface introduced. Step3Auth's client-side Supabase calls (OTP/password/register) are byte-for-byte unchanged; only display strings moved to the catalog (T-70-07-01/02 mitigations hold). No token, session, or PII entered the catalog.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
Plan 70-08 (account surface: `account/actions.ts`, `ProfileForm.tsx`, account pages) can proceed — it reuses the shared `Errors` keys and the Pattern E `.bind(null, locale)` wiring established in 70-02, plus the named-ICU and renderWithIntl conventions reaffirmed here.

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All modified/created files verified present on disk; commit hashes (23af767, d5db709, 6df216f) verified in git log; catalog parity (6 stubs byte-identical) and full test suite (1188 passed) green.
