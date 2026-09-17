---
phase: 70-string-externalization-booking-account
plan: 05
subsystem: i18n
tags: [next-intl, react, vitest, booking, string-externalization, extras, pricing]

requires:
  - phase: 70-string-externalization-booking-account
    provides: "Locked externalization convention (PascalCase namespace / camelCase key / named-ICU / renderWithIntl Pattern F / 6 EN-copy stubs); Booking.vehicleClasses single source (70-04) + VEHICLE_CLASS_KEY"
provides:
  - "Booking.extras.{meetAndGreet,infantSeat,childSeat,boosterSeat}.{label,description} — READ-ONLY UI mirror of lib/extras.ts EXTRAS_CONFIG (email-coupled data file left untouched)"
  - "Booking.priceSummary / summaryBlock / bookingWidget / bookingWizard namespaces + step4extras.free"
  - "Fully externalized PriceSummary, BookingSummaryBlock, Step4Extras, BookingWidget, BookingWizard — all vehicle-class labels resolved from Booking.vehicleClasses via VEHICLE_CLASS_KEY (no local label maps)"
affects: [70-06, 70-08]

actuals:
  tokens: 8580
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Read-only catalog mirror of an email-coupled data file (Pattern B extras): UI reads label/description from Booking.extras by key; lib/extras.ts stays English-only for lib/email.ts transactional emails"
    - "Analytics label continuity: GA4 item_name resolved from the shared Booking.vehicleClasses catalog (via VEHICLE_CLASS_KEY), event names/params untouched"

key-files:
  created: []
  modified:
    - components/booking/PriceSummary.tsx
    - components/booking/BookingSummaryBlock.tsx
    - components/booking/steps/Step4Extras.tsx
    - components/booking/BookingWidget.tsx
    - components/booking/BookingWizard.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/PriceSummary.test.tsx
    - tests/BookingSummaryBlock.test.tsx
    - tests/Step4Extras.test.tsx
    - tests/BookingWidget.test.tsx

key-decisions:
  - "Booking.extras is a READ-ONLY mirror keyed by the exact EXTRAS_CONFIG keys (meetAndGreet/infantSeat/childSeat/boosterSeat); lib/extras.ts untouched because lib/email.ts imports EXTRAS_CONFIG for transactional emails (RESEARCH Pitfall 1). UI reads label/description from the catalog by key; the data file still supplies key/price/alwaysSelected structurally."
  - "Single scoped hook useTranslations('Booking') in the 3 EXTRAS_CONFIG consumers so t(`extras.${key}.label`) resolves by key and t(`vehicleClasses.${VEHICLE_CLASS_KEY[vc]}.label`) reuses the shared class-label source — one hook instead of three."
  - "BookingWizard analytics: the local VEHICLE_LABELS map was replaced by a classLabelOf() resolver over Booking.vehicleClasses (via VEHICLE_CLASS_KEY); GA4/Meta event names and params (checkout_progress, view_item_list, view_item, add_payment_info, form_start, checkout_step, item_category) are byte-for-byte unchanged."
  - "Full externalization of all 5 owned files (Rule 2 / 70-04 precedent), not just the extras+class-label triplet — leaving OUTBOUND/at/passengers/Subtotal/Final/widget placeholders hardcoded would strand English in the 6 non-EN locales."

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "Extras label/description single-sourced in Booking.extras; the 3 EXTRAS_CONFIG consumers render by key; lib/extras.ts untouched"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "git diff --name-only HEAD~3 HEAD does not list lib/extras.ts; tests/Step4Extras.test.tsx asserts key parity for every EXTRAS_CONFIG key"
        status: pass
      - kind: unit
        ref: "node: Booking.extras/priceSummary/summaryBlock/bookingWidget/bookingWizard present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Vehicle-class labels in the 5 files reuse Booking.vehicleClasses (no local label map remains)"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep 'First Class|Business Van' across the 5 files -> 0; grep 'vehicleLabels' PriceSummary/BookingSummaryBlock -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "GA4/Meta analytics event names and params in BookingWizard unchanged"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep begin_checkout -> 0 (unchanged); checkout_step/item_category/checkout_progress/view_item_list/add_payment_info/form_start all present"
        status: pass
    human_judgment: false
  - id: D4
    description: "5 touched tests green under renderWithIntl; 6 stubs byte-identical; full suite green"
    verification:
      - kind: unit
        ref: "vitest (5 files) -> 40 passed/33 todo; cmp -s all 6 stubs; vitest (full) -> 1187 passed / 0 failed"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 05: Booking Pricing/Extras + Widget/Wizard Shell Externalization Summary

**Externalized the pricing/summary surface (`PriceSummary`, `BookingSummaryBlock`, `Step4Extras`) and the standalone `BookingWidget` + orchestrator `BookingWizard` — creating `Booking.extras` as a READ-ONLY mirror of the email-coupled `lib/extras.ts` (which stays untouched), removing three more local vehicle-class label maps in favour of the shared `Booking.vehicleClasses` source, and keeping every GA4/Meta analytics identifier byte-for-byte unchanged.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-09-05
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Added `Booking.extras.{meetAndGreet,infantSeat,childSeat,boosterSeat}.{label,description}` — a read-only mirror of `EXTRAS_CONFIG`, keyed identically; `lib/extras.ts` untouched (verified `git diff` empty) so `lib/email.ts` transactional emails keep their English copy
- Converted `Step4Extras`, `PriceSummary`, `BookingSummaryBlock` to render extras label/description via `t(\`extras.${key}.label\`)` / `.description` while still reading `key`/`price`/`alwaysSelected` structurally from `EXTRAS_CONFIG`
- Added `Booking.priceSummary`, `Booking.summaryBlock`, `Booking.step4extras.free` and fully externalized the remaining pricing copy (Your Journey / Outbound / Return leg / Combined / Subtotal / Final / Promo / hourly "{hours} hours" / "{date} at {time}" / passenger-plural ICU / SELECT {className})
- Externalized `BookingWidget` (~15 strings: pick-up/drop-off labels+placeholders+aria, DATE/TIME labels, Pickup date/time aria, Select date, Choose a slot, validation notice, VIEW VEHICLES) via `useTranslations('Booking.bookingWidget')`
- Externalized `BookingWizard` adjacent UI (Back / Continue / "STEP {step} OF 6" / step headings) via `useTranslations('Booking.bookingWizard')`; removed its local `VEHICLE_LABELS` map and resolved GA4 `item_name` from `Booking.vehicleClasses` through a `classLabelOf()` helper
- Removed the local vehicle-class label maps in `PriceSummary` and `BookingSummaryBlock`; every class label now resolves from `Booking.vehicleClasses` via `VEHICLE_CLASS_KEY`
- Migrated 4 tests to `renderWithIntl` (Pattern F); `BookingWizard.test.tsx` was already on `renderWithIntl` (unchanged); added a `Booking.extras` key-parity test + a render-under-intl label check to `Step4Extras.test.tsx`
- Re-synced 6 stub locales byte-identical to `en.json`; touched slice 40 passed / 33 todo; full suite 1187 passed / 0 failed

## Task Commits

1. **Task 1: Booking.extras catalog + convert 3 EXTRAS_CONFIG consumers** - `6413179` (feat)
2. **Task 2: externalize BookingWidget + BookingWizard (analytics untouched)** - `93a2977` (feat)
3. **Task 3: migrate 4 booking tests to renderWithIntl, add extras parity test, resync 6 stubs** - `d8b0098` (test)

_Metadata commit (docs: complete plan) is created separately per execute-plan protocol._

## Decisions Made
- **`Booking.extras` is a read-only mirror.** Keyed by the exact `EXTRAS_CONFIG` keys, each with `label`/`description` copied byte-for-byte. `lib/extras.ts` is imported by `lib/email.ts` for transactional emails (RESEARCH Pitfall 1), so it must stay English-only — the UI diverges via the catalog without editing the shared file. Enforced by the `git diff --name-only lib/extras.ts` prohibition (empty).
- **Single `useTranslations('Booking')` hook** in the three extras consumers so `t(\`extras.${key}...\`)` resolves by key and `t(\`vehicleClasses.${VEHICLE_CLASS_KEY[vc]}.label\`)` reuses the shared class-label source in one hook.
- **Analytics label continuity.** `BookingWizard`/`PriceSummary` GA4 `item_name` now resolves from the same `Booking.vehicleClasses` catalog rather than a local map, keeping reporting labels identical while removing the duplicate map. All event-name strings and params are untouched (`begin_checkout` grep unchanged at 0 in BookingWizard).
- **Full externalization of owned files (Rule 2).** See Deviations.

## Deviations from Plan

### Auto-added (Rule 2 — missing critical functionality)

**1. [Rule 2] Externalized all remaining user-facing copy in the 5 owned files, beyond the extras + class-label scope enumerated in the plan**
- **Found during:** Tasks 1-2
- **Issue:** The plan enumerates extras label/description + Outbound/Combined (PriceSummary) and Outbound/Subtotal/Final (BookingSummaryBlock), but these owned files also contain other visible copy (Your Journey, YOUR JOURNEY, OUTBOUND/RETURN, "{date} at {time}", passenger count, hourly "{hours} hours", Promo/Final; BookingWidget placeholders/aria/CTA; BookingWizard headings/Back/Continue/STEP labels). This plan OWNS these files for the phase, so leaving them hardcoded would render English across all 7 locales.
- **Fix:** Externalized every visible string into `Booking.priceSummary` / `summaryBlock` / `step4extras` / `bookingWidget` / `bookingWizard`, English byte-for-byte unchanged. Added `Booking.step4extras.free` (a namespace not enumerated in the plan artifacts) for the extras card "Free" price label.
- **Files modified:** all 5 owned components + `messages/en.json` (+ 6 stubs)
- **Committed in:** `6413179`, `93a2977`

### Minor (mechanical scope reconciliation)

**2. `tests/BookingWizard.test.tsx` needed no change**
- It was already using `renderWithIntl` before this plan, so the Pattern-F import swap was a no-op there. It is listed in the plan's `files_modified` but carries no diff this plan; it stays green because the new `Booking.bookingWizard`/`vehicleClasses` keys it now renders are present in `en.json`.

**Total deviations:** 1 auto-added (Rule 2) + 1 mechanical no-op. No architectural changes, no checkpoints, no auth gates.

## Out-of-Scope / Not Touched (intentional)
- **`lib/extras.ts`** — email-coupled data file; left untouched by design (prohibition verified).
- **GA4/Meta analytics identifiers** — event names + params (`checkout_progress`, `view_item_list`, `view_item`, `add_payment_info`, `form_start`, `checkout_step`, `item_category`, `currency`) left literal; only user-visible copy changed.
- **Mercedes proper nouns / `VEHICLE_CLASS_KEY` structural map** — not translatable copy.

## Known Stubs
None. All display copy is wired to the catalog; the 6 non-EN locales are byte-identical EN copies (intentional stub-sync per the locked convention — real translations land in Phases 72/73).

## Issues Encountered
- Pre-existing jsdom `Not implemented: Window's scrollTo()` warnings during the wizard tests are unchanged noise (not caused by this plan). Pre-existing eslint/tsc warnings noted in 70-04 remain out of scope.

## User Setup Required
None.

## Next Phase Readiness
The booking pricing/extras + widget/wizard shell is fully externalized. `Booking.extras` (read-only) and the shared `Booking.vehicleClasses` remain the single sources for extras and class labels. Downstream plans (70-06 Step6Payment, 70-08 account/trips) MUST reuse `Booking.vehicleClasses` via `VEHICLE_CLASS_KEY` and MUST NOT edit `lib/extras.ts`. 70-08 runs the phase-wide residual-label grep gate.

**Next step:** proceed to plan 70-06 (Step6Payment + auth/passenger steps externalization).

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All 5 modified source files + SUMMARY.md verified present on disk; all 3 task commit hashes (6413179, 93a2977, d8b0098) verified in git log.
