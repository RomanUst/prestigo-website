---
phase: 70-string-externalization-booking-account
plan: 04
subsystem: i18n
tags: [next-intl, react, vitest, booking, string-externalization, vehicle-class]

requires:
  - phase: 70-string-externalization-booking-account
    provides: "Locked externalization convention (PascalCase namespace / camelCase key / named-ICU / renderWithIntl Pattern F / 6 EN-copy stubs), Booking.* namespace seed"
provides:
  - "Booking.vehicleClasses.{business,firstClass,businessVan}.label — SINGLE source of truth for vehicle-class display labels (reused by 70-05, 70-06, 70-08)"
  - "VEHICLE_CLASS_KEY structural map (snake_case VehicleClass -> camelCase catalog key) in types/booking.ts; VehicleConfig/VEHICLE_CONFIG no longer carry a translatable label"
  - "Fully externalized VehicleCard, VehicleSlideshow, StickyBookingPanel, Step3Vehicle + catalog namespaces Booking.vehicleCard / vehicleSlideshow / stickyPanel / step3vehicle"
affects: [70-05, 70-06, 70-08]

actuals:
  tokens: 3961
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single-source enum-label split (Pattern B): one Booking.vehicleClasses catalog entry, resolved at every render site via VEHICLE_CLASS_KEY — no duplicate label maps"
    - "Structural enum->catalog-key map (VEHICLE_CLASS_KEY) lives in code (no translatable copy); display label always resolved from the catalog"

key-files:
  created: []
  modified:
    - types/booking.ts
    - components/booking/VehicleCard.tsx
    - components/booking/VehicleSlideshow.tsx
    - components/booking/StickyBookingPanel.tsx
    - components/booking/steps/Step3Vehicle.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/VehicleSlideshow.test.tsx
    - tests/StickyBookingPanel.test.tsx
    - tests/Step3Vehicle.test.tsx

key-decisions:
  - "Catalog keyed camelCase (business/firstClass/businessVan) per the must_have truth; VEHICLE_CLASS_KEY maps the snake_case VehicleClass enum ('first_class' etc.) to the camelCase catalog key at every render site — one consistent scheme across the plan"
  - "GA4 analytics item_name resolves from the SAME catalog label (single source), passed into the module-level pushVehicleSelect as an argument rather than via a local label map"
  - "Full externalization of all four owned components (not just the class-label triplet): this plan OWNS these files for the phase, so leaving 'Pick up'/'Outbound'/'one way'/route-edit copy hardcoded would strand them as untranslatable (Rule 2)"
  - "Step3Vehicle uses two scoped hooks: useTranslations('Booking.step3vehicle') for its own copy + useTranslations('Booking.vehicleClasses') for the shared label (matches plan acceptance grep)"

requirements-completed: [STR-02]

coverage:
  - id: D1
    description: "Booking.vehicleClasses is the single source of vehicle-class display labels; all four owned components resolve the label from it (no local label map remains)"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep -rn 'First Class|Business Van|Record<string, string>' across the 5 owned files -> 0"
        status: pass
      - kind: unit
        ref: "node parity check: Booking.vehicleClasses.{business,firstClass,businessVan}.label present"
        status: pass
    human_judgment: false
  - id: D2
    description: "StickyPanel interpolated select aria uses named-ICU (stickyPanel.selectClassAria) with className from the shared key"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep -nE 'aria-label=\\{`' components/booking/StickyBookingPanel.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mercedes model names (proper nouns) remain literal in code"
    requirement: STR-02
    verification:
      - kind: unit
        ref: "grep -c 'Mercedes-Benz' types/booking.ts -> 4 (3 models + interface comment)"
        status: pass
    human_judgment: false
  - id: D4
    description: "3 touched tests green under renderWithIntl; 6 stubs byte-identical; full suite green"
    verification:
      - kind: unit
        ref: "npx vitest run (3 files) -> 21 passed; cmp -s all 6 stubs; npx vitest run (full) -> 1185 passed"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-05
status: complete
---

# Phase 70 Plan 04: Vehicle-Class Single Source + Booking Vehicle Files Summary

**Established `Booking.vehicleClasses.{business,firstClass,businessVan}.label` as the ONE source of truth for vehicle-class display labels and fully externalized the four vehicle-facing booking components (VehicleCard, VehicleSlideshow, StickyBookingPanel, Step3Vehicle) plus `types/booking.ts` — removing four hand-duplicated label maps, converting the interpolated select aria to named-ICU, and keeping Mercedes proper nouns literal.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-09-05
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Added `Booking.vehicleClasses` (single-source label map) + `VEHICLE_CLASS_KEY` structural map (snake_case `VehicleClass` -> camelCase catalog key); removed the translatable `label` from `VehicleConfig`/`VEHICLE_CONFIG` (structural fields kept)
- Deleted the four duplicated class-label maps (StickyBookingPanel `VEHICLE_LABELS`, VehicleSlideshow `CLASS_LABELS`, Step3Vehicle `VEHICLE_LABELS`, and the `VehicleConfig.label` field) — every render site now resolves the label from the catalog
- Converted StickyBookingPanel's interpolated `Select {className} class — €{price}` aria to named-ICU (`stickyPanel.selectClassAria`); externalized the full panel copy (Pick up / Est. drop-off / Outbound / Return / Combined / fee notes / CTA / sr-only)
- Externalized VehicleSlideshow (slideshow aria, prev/next aria, caption) and VehicleCard (alt-text + one-way caption via named-ICU)
- Externalized all of Step3Vehicle: heading, route-summary labels, the full route edit-form (AddressInput labels/placeholders/aria, date/time selects, return sub-form, validation copy, Update/Cancel), the what's-included block (6 items), and the fetch-error notice
- GA4 `item_name` now sourced from the same catalog label (single source), passed into `pushVehicleSelect` as an argument
- Migrated the 3 touched tests to `renderWithIntl` (Pattern F); re-synced 6 stub locales byte-identical to `en.json`
- Touched slice: 21 passed; full suite: 1185 passed / 0 failed

## Task Commits

1. **Task 1: single-source Booking.vehicleClasses; convert StickyBookingPanel + VehicleSlideshow** - `cc62b84` (feat)
2. **Task 2: externalize VehicleCard alt + Step3Vehicle strings** - `8736500` (feat)
3. **Task 3: migrate 3 vehicle tests to renderWithIntl, resync 6 stubs** - `564f938` (test)

_Metadata commit (docs: complete plan) is created separately per execute-plan protocol._

## Decisions Made
- **Catalog keyed camelCase** (`business`/`firstClass`/`businessVan`) per the must_have truth. The snake_case `VehicleClass` enum (`'first_class'` etc.) is normalized to the camelCase catalog key via a small structural `VEHICLE_CLASS_KEY` map — used identically at every render site. This map carries no translatable copy, so it is not a "label map" and does not violate the no-duplicate-label-map prohibition.
- **Analytics `item_name`** (GA4 `select_item` / `begin_checkout`) resolves from the SAME catalog label rather than a separate map. In Step3Vehicle, `pushVehicleSelect` is module-level (no hook in scope), so the resolved label is passed in as an argument from the component call site.
- **Full externalization of all four owned components** — not only the class-label triplet. Because this plan owns these five files for the phase, any string left hardcoded (Pick up, Outbound, one way, route-edit form copy) would be stranded as untranslatable in the 6 non-EN locales. Treated as Rule 2 (missing critical functionality). See Deviations.
- **Step3Vehicle two scoped hooks:** `useTranslations('Booking.step3vehicle')` for its own copy and `useTranslations('Booking.vehicleClasses')` for the shared label, matching the plan's acceptance grep.

## Deviations from Plan

### Auto-added (Rule 2 — missing critical functionality)

**1. [Rule 2] Externalized all remaining user-facing copy in the owned components, beyond the class-label triplet**
- **Found during:** Tasks 1-2, while editing the owned files
- **Issue:** The plan objective enumerates the class-label single-sourcing + specific aria/caption strings, but the four owned components also contain other visible copy (StickyBookingPanel: Pick up, Est. drop-off, Outbound, Return, Combined, fee notes, CTA, sr-only; VehicleCard: "one way"; Step3Vehicle: route-summary labels, the entire route edit-form, the what's-included block, fetch-error notice). This plan OWNS these files for the phase — no later plan will touch them — so leaving those strings hardcoded would render English in all 7 locales (the Phase-69 WR-02 bug class).
- **Fix:** Externalized every visible string in the owned components into `Booking.stickyPanel` / `vehicleCard` / `vehicleSlideshow` / `step3vehicle`, English byte-for-byte unchanged. Mercedes model names + GA4/analytics identifiers left literal.
- **Files modified:** components/booking/StickyBookingPanel.tsx, VehicleCard.tsx, steps/Step3Vehicle.tsx, messages/en.json (+ 6 stubs)
- **Committed in:** `cc62b84`, `8736500`, `564f938`

**Total deviations:** 1 auto-added (Rule 2). No architectural changes, no checkpoints, no auth gates.

## Out-of-Scope / Not Touched (intentional)
- **VehicleSlideshow `SLIDES_BY_CLASS` alt texts** ("Mercedes E-Class rear cabin with bottled water", etc.) — left literal; they are proper-noun-dominated (Mercedes model, Rimowa) descriptive alt text and were not enumerated in the plan. No class-label leakage.
- **Other files' own label maps** (`account/trips/page.tsx`, `Step6Payment.tsx`, `BookingWizard.tsx`, `book/confirmation/page.tsx`, admin components, `webhooks/stripe`) — owned by later plans (70-05/70-06/70-08) or out of scope (admin). This plan removed maps ONLY in its five owned files. 70-08 runs the phase-wide residual-label grep gate.

## Known Stubs
None. All display labels are wired to the catalog; the 6 non-EN locales are byte-identical EN copies (intentional stub-sync per the locked convention — real translations land in Phases 72/73).

## Issues Encountered
- Pre-existing eslint warnings in Step3Vehicle (`loading`, `returnDiscountPercent`, `quoteMode` unused store selectors) and pre-existing `tsc` errors in unrelated test files (`account-trips.test.tsx`, `nav-auth.test.tsx`, `passenger-actions.test.ts`) were present before this plan and are out of scope (not caused by these changes).

## User Setup Required
None.

## Next Phase Readiness
`Booking.vehicleClasses` is now the single source vehicle-class label contract. Downstream plans (70-05 pricing/wizard, 70-06 Step6Payment, 70-08 account trips) MUST reuse these keys via `t('vehicleClasses.<key>.label')` (client) / `getTranslations` (server) and the `VEHICLE_CLASS_KEY` normalization — never re-add a local label map. 70-08's phase gate greps the whole in-scope tree for residual hardcoded class labels.

**Next step:** proceed to plan 70-05 (booking pricing/wizard externalization), which consumes `Booking.vehicleClasses`.

---
*Phase: 70-string-externalization-booking-account*
*Completed: 2026-09-05*

## Self-Check: PASSED

All 5 modified source files + SUMMARY.md verified present on disk; all 3 task commit hashes (cc62b84, 8736500, 564f938) verified in git log.
