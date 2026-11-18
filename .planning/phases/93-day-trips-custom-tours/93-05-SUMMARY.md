---
phase: 93-day-trips-custom-tours
plan: 05
subsystem: tours-domain
tags: [tours, pricing, cancellation-policy, completeness, pickup-area]
status: complete
requires: ["93-01"]
provides:
  - "lib/tours/store.ts: guarded readers (getPublishedTourForLocale, listPublishedTours, getPublishedTourLocales, getTourSettings, getPublishedTourBySlug)"
  - "lib/tours/pricing.ts: tourFare, classesForPassengers, lowestFittingPrice, totalTripHours, TourPriceError"
  - "lib/tours/completeness.ts: isLocaleComplete with leak guard"
  - "lib/tours/publish-checklist.ts: publishChecklist, PublishFailure"
  - "lib/tours/policy.ts: TOUR_POLICY_VERSION_PREFIX, tourPolicy, buildTourPolicySnapshot"
  - "lib/tours/pickup-area.ts: OLD_TOWN_SQUARE, distanceKm, checkTourPickup"
  - "lib/tours/custom-tour-link.ts: CUSTOM_TOUR_REQUEST_LIVE, customTourHref, buildCustomTourHref"
  - "lib/tours/photo-url.ts: tourPhotoUrl"
  - "lib/cancellation-policy.ts: tour branch in freeHoursFor"
affects: [93-06, 93-07, 93-10, 93-16, 93-21, 93-34]
tech-stack:
  added: []
  patterns: ["service client built inside try, null/[]/not_found on any failure", "pure client-safe rule modules shared by page, checkout and server"]
key-files:
  created:
    - lib/tours/store.ts
    - lib/tours/pricing.ts
    - lib/tours/photo-url.ts
    - lib/tours/completeness.ts
    - lib/tours/publish-checklist.ts
    - lib/tours/policy.ts
    - lib/tours/pickup-area.ts
    - lib/tours/custom-tour-link.ts
    - tests/tour-store.test.ts
    - tests/tour-pricing.test.ts
    - tests/tour-completeness.test.ts
    - tests/tour-policy.test.ts
    - tests/tour-pickup-area.test.ts
  modified:
    - lib/cancellation-policy.ts
decisions:
  - "lib/tours/store.ts has no `import 'server-only'`: lib/route-prices.ts does not use it either and the readers must stay loadable in vitest; the header comment states server-only use."
  - "buildTourPolicySnapshot builds the snapshot inline instead of calling buildPolicySnapshot, because lib/cancellation-settings.ts imports the service client (server-only) and policy.ts must stay client-safe; a test asserts the two shapes are equal."
  - "Public readers filter status via .eq('status', 'published') and trust the server-set is_complete flag for translations (the grep acceptance pattern `status', 'published'` matches)."
  - "MISSING_CREDIT applies to every non-own photo source (commons, unsplash, other): credit_text and license both required."
  - "Leak guard checks title and short_description separately, each must contain the locale script; es/fr compare case-insensitively with the EN row when provided."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
plan_head_before: 62c473eeedad4d3de91200b645ccb3834b23a007
plan_head_after: 130d3cc9fae425a2bd1f7cc5e46df24db78edad7
---

# Phase 93 Plan 05: Tour domain core Summary

The tour domain core in `lib/tours`: guarded Supabase readers, one price function (`tourFare`) used by page, box and server, one completeness and leak rule, the publish checklist, a `tour-` cancellation snapshot that round-trips off the legacy fallback, and a shared Prague pickup-area check.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Guarded store + pricing + photo URL, tests | 10eafade |
| 2 | Locale completeness with leak guard + publish checklist | 3ee3d4c6 |
| 3 | Tour cancellation snapshot, pickup-area check, custom-tour link (`security:`) | 130d3cc9 |

## Verification

- `npx vitest run --exclude '.claude/**'` on tour-store, tour-pricing, tour-completeness, tour-policy, tour-pickup-area, cancellation-policy, cancellation-wording, payments-cancel: all green (24 + 27 + 263 tests across the runs).
- `npx tsc --noEmit`: 8 errors total, equal to the tests/ baseline, none in lib/.
- `npx eslint --quiet lib/tours lib/cancellation-policy.ts` and the new tests: exit 0.
- Tests that mock `@/lib/supabase` loaded fine inside the worktree; no next-intl server modules are involved in this plan.

## Deviations from Plan

None in behavior. Two implementation choices recorded under decisions (no `server-only` import; inline snapshot shape in policy.ts to keep it client-safe). `lib/tours/custom-tour-link.ts` cases live in `tests/tour-pickup-area.test.ts` as the plan specified.

## Known Stubs

None. `CUSTOM_TOUR_REQUEST_LIVE = false` is intentional: plan 93-34 flips it when `/book/custom-tour` exists.

## Threat Flags

None. Mitigations T-93-11 (integer 0..12 extra hours, closed class list, throws on missing price), T-93-12 (round-trip and DST tests), T-93-13 (airport rule plus haversine radius, unusable coordinates refused), T-93-14 (published and complete filters, stubbed-client tests) are implemented and tested.

## Self-Check: PASSED

All 14 listed files exist; commits 10eafade, 3ee3d4c6, 130d3cc9 exist on branch worktree-agent-a41470b11a1df2082.
