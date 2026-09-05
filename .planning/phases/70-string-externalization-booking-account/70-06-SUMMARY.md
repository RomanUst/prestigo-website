---
phase: 70-string-externalization-booking-account
plan: 06
subsystem: i18n
tags: [next-intl, react, zod, stripe, t-rich, named-icu, vitest, string-externalization]

requires:
  - phase: 70-string-externalization-booking-account
    plan: 01
    provides: "Booking.validation seed keys + renderWithIntl helper"
  - phase: 70-string-externalization-booking-account
    plan: 04
    provides: "Booking.vehicleClasses single source + VEHICLE_CLASS_KEY"
provides:
  - "Booking.step1 / step2 (leadTimeNotice t.rich) / extended Booking.validation / step5 (flight status) / step6 catalog namespaces"
  - "Four externalized wizard steps: Step1TripType, Step2DateTime, Step5Passenger, Step6Payment"
affects: [70-08]

actuals:
  tokens: 0
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pattern D (t.rich) applied to Step2's lead-time notice: t.rich('leadTimeNotice', {wa: chunks => <a>…</a>, hours}) — href kept as a code constant, not in the catalog"
    - "Component-body zod schema: Step5 builds z.object() inside the component via useMemo so .min()/.email()/.refine() messages come from useTranslations, with every validation RULE unchanged"
    - "Named-ICU for flight-status interpolation in Step5"
    - "Stripe Elements locale:'en' left literal (separate i18n system, RESEARCH Pitfall 7)"

key-files:
  created: []
  modified:
    - components/booking/steps/Step1TripType.tsx
    - components/booking/steps/Step2DateTime.tsx
    - components/booking/steps/Step5Passenger.tsx
    - components/booking/steps/Step6Payment.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/Step1TripType.test.tsx
    - tests/Step2DateTime.test.tsx
    - tests/Step5Passenger.test.tsx

key-decisions:
  - "Step5 zod schema moved from module scope into the component body (useMemo) so messages can read useTranslations — rules identical, only the message argument changed"
  - "Step2 lead-time WhatsApp href stays a code constant; the catalog holds only {hours} + <wa>…</wa> chunk markup"
  - "Step6 Stripe Elements locale:'en' untouched (Pitfall 7); vehicle-class label reuses Booking.vehicleClasses, local label map removed"
  - "tests/Step6Payment.test.tsx is all it.todo (nothing renders) — no renderWithIntl migration applied"
  - "Stub catalogs kept byte-identical EN copies (AI translation deferred)"

patterns-established:
  - "Pattern D / t.rich verified on a real embedded WhatsApp link; component-body zod-message pattern verified end-to-end with rules intact"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "Step1TripType renders swap/pickup/destination copy from Booking.step1"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "tests/Step1TripType.test.tsx (renderWithIntl)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Step2DateTime renders date/time copy from Booking.step2; lead-time notice uses t.rich('leadTimeNotice', {wa, hours})"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep t.rich('leadTimeNotice' + node check leadTimeNotice has {hours} & <wa>"
        status: pass
      - kind: unit
        ref: "tests/Step2DateTime.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Step5Passenger builds its zod schema in the component body with messages from Booking.validation/Booking.step5 (rules unchanged); flight status via named-ICU"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep useTranslations('Booking.validation'/'Booking.step5') + tests/Step5Passenger.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Step6Payment renders payment/promo copy from Booking.step6, reuses Booking.vehicleClasses, Stripe Elements locale:'en' unchanged, no residual class-label map"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep -c locale: 'en' == 1; grep First Class == 0; every Booking.step6 value wired (node scan == 0 residual)"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 6 non-EN stubs re-synced byte-identical; full suite green"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json + npx vitest run (1187 passed / 0 failed)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 06: Externalize Wizard Steps 1/2/5/6 Summary

**Externalized the four remaining wizard steps — Step1TripType, Step2DateTime (lead-time notice via `t.rich` with an embedded WhatsApp link), Step5Passenger (zod schema messages sourced at component-body scope with validation rules intact + named-ICU flight status), and Step6Payment (payment/promo UI from `Booking.step6`, reusing `Booking.vehicleClasses`, Stripe Elements `locale:'en'` untouched).**

## Performance

- **Duration:** ~30 min (executor completed Task 1 + most of Task 2, then was cut off by a session rate-limit mid-Step6Payment; orchestrator finished the remaining Step6 promo/payment string sites, Task 3, and finalization)
- **Completed:** 2026-09-05
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- **Step1TripType** renders swap/pickup/destination copy from `Booking.step1` (`useTranslations('Booking.step1')`)
- **Step2DateTime** renders its date/time columns from `Booking.step2`; the lead-time notice is `t.rich('leadTimeNotice', { wa: chunks => <a href="https://wa.me/…">{chunks}</a>, hours: MIN_LEAD_HOURS })` — the catalog value carries `{hours}` and a `<wa>…</wa>` chunk, the href stays a code constant
- **Step5Passenger** builds its zod schema inside the component body (`useMemo`) so `.min()/.email()/.refine()` messages come from `useTranslations('Booking.validation')`/`('Booking.step5')`; every validation rule/predicate is unchanged; the flight-status block uses named-ICU
- **Step6Payment** renders SECURE PAYMENT / promo-code / currency / payment-error copy from `Booking.step6`, reuses `Booking.vehicleClasses` for the class label (local map removed), and leaves the Stripe Elements `locale: 'en'` option exactly as-is
- All 6 stub locales re-synced byte-identical to `en.json`; full `npx vitest run` → **1187 passed / 0 failed**

## Task Commits
1. **Task 1: Step1TripType + Step2DateTime (t.rich lead-time notice)** - `a626409` (feat)
2. **Task 2: Step5Passenger (zod messages + flight status) + Step6Payment** - `c541ef5` (feat)
3. **Task 3: Migrate 3 step tests to renderWithIntl + re-sync 6 stubs** - `c459d7d` (test)

## Files Created/Modified
- `components/booking/steps/Step1TripType.tsx` - `Booking.step1`
- `components/booking/steps/Step2DateTime.tsx` - `Booking.step2` + `t.rich` lead-time notice
- `components/booking/steps/Step5Passenger.tsx` - body-scope zod messages + named-ICU flight status
- `components/booking/steps/Step6Payment.tsx` - `Booking.step6`, `Booking.vehicleClasses` reuse, Stripe locale untouched
- `messages/en.json` - `Booking.step1`, `Booking.step2`, extended `Booking.validation`, `Booking.step5`, `Booking.step6`
- `messages/{ru,es,fr,ar,hi,zh}.json` - re-synced stubs
- `tests/Step1TripType.test.tsx`, `tests/Step2DateTime.test.tsx`, `tests/Step5Passenger.test.tsx` - migrated to `renderWithIntl`

## Decisions Made
- `tests/Step6Payment.test.tsx` is entirely `it.todo` (no render calls) and was intentionally left unmigrated.
- Stub catalogs remain byte-identical EN copies; AI translation deferred to a later milestone phase.

## Deviations from Plan

### Execution note
The plan's executor subagent (Opus) was cut off by a session rate-limit (HTTP 429) after committing Task 1 and completing most of Task 2, leaving Step5Passenger fully done and Step6Payment partially wired (uncommitted). The orchestrator completed the remaining Step6Payment string sites (`promoInvalid`, `promoGenericError`, `promoPlaceholder`, `remove`, `applyCode`, `networkError`, `paymentInitFailed`, `eurLabel`/`czkLabel` — all keys the executor had already added to the catalog), verified every `Booking.step6` value is wired (node residual scan == 0) with `tsc` clean and the Stripe `locale:'en'` + zod rules preserved, then committed Task 2, executed Task 3, and finalized. English output byte-for-byte unchanged.

## Issues Encountered
Session rate-limit interruption mid-plan (handled as above). No code-level issues; full suite green.

## User Setup Required
None.

## Next Phase Readiness
All booking wizard steps are now externalized. Plan 70-07 (multi-day flow + in-wizard auth step) and 70-08 (account surface + phase gate) can proceed; 70-08 runs the phase-wide residual-label grep gate, which this plan already satisfies (0 residual class labels in Step6Payment).

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All modified files verified present on disk; commit hashes (a626409, c541ef5, c459d7d) verified in git log; every Booking.step6 value wired (residual scan 0), Stripe locale:'en' intact, 6 stubs byte-identical, full suite 1187 passed / 0 failed.
