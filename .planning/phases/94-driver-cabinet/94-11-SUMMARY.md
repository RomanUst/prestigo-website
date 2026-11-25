---
phase: 94-driver-cabinet
plan: 11
subsystem: driver-cabinet-ui
tags: [driver-cabinet, offers, accept, decline, confirm-dialog, security]
requires:
  - "94-03: listLiveOffers, OfferView, POST /api/driver/cabinet/offers/[assignmentId]/respond"
  - "94-06 / 94-10: (tabs) layout with tab bar and badge, CabinetRefresh"
provides:
  - "/driver/offers page (app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx)"
  - "components/driver/OfferCard.tsx: default OfferCard, named OffersEmptyState"
  - "components/driver/OffersList.tsx: client island with the accept / decline state machine and banners"
  - "ConfirmStepDialog modes 'accept' and 'decline' and the optional offer prop"
affects: [94-13]
tech-stack:
  added: []
  patterns:
    - "answered cards are hidden by a local id set over the server prop, so a router.refresh() that returns a fresh list cannot resurrect them"
    - "one in-flight ref guards the single request per confirm; the dialog cannot be dismissed while it is set"
key-files:
  created:
    - components/driver/OfferCard.tsx
    - components/driver/OffersList.tsx
    - "app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx"
    - tests/driver-cabinet-offers-ui.test.tsx
  modified:
    - "app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx"
key-decisions:
  - "OfferCard renders only what OfferView carries (first name, route, class, fee); the test seeds last name, phone, flight, notes, reference and client price on the booking and asserts none reaches the DOM"
  - "409 also hides the card locally (the office changed the ride) and refreshes; 429 keeps the card because the answer was not saved"
  - "Task 1 shipped the page with plain cards and no buttons; Task 2 swapped in OffersList, so each commit is green on its own"
status: complete
commits: 2
plan_head_before: 45f01c5b44432f9fd65655609eb2e24aafe9d21a
plan_head_after: ec20d8839bd2c0942a60d021b7b0cd5df6756815
actuals:
  tokens: 14500
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 11: Offers tab with confirmed accept and decline Summary

A signed-in driver sees every live offer at /driver/offers (earliest pickup first, fee shown only when it exists, first name only) and answers it behind a confirm dialog that posts to the cabinet respond route, with the UI-SPEC banners, live region and session-end handling.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit d18bb2e3, `security:`)**: the Offers page gated by `requireDriver('/driver/offers')`, listing `listLiveOffers` results; `OfferCard` (day label, time, "Your fee" column only for a non-empty label, pickup / drop-off timeline with the 2-line clamp class, "Passenger {first name} · {class}", actions slot) and the empty state without a button.
- **Task 2 (commit ec20d883, `security:`)**: `ConfirmStepDialog` gained `accept` and `decline` modes (copy, secondary "Not yet" / "Keep offer" with initial focus on the secondary, danger-solid primary for decline, "Saving…" and "Try again" reused) and the optional `offer` prop; existing modes untouched. `OffersList` posts `{ action }` once per confirm and maps 200 / 409 / 429 / 401 / network and 5xx to the specified banners, dialog alert and redirect to `/driver/login?next=%2Fdriver%2Foffers&ended=1`; one banner slot (focus moves to it, ok and info clear after 8 s, amber is an alert), a visually hidden polite live region, local card removal plus `router.refresh()` so the tab badge updates.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-offers-ui.test.tsx tests/driver-trip-screen.test.tsx tests/driver-cabinet-offers.test.ts tests/admin-no-hardcoded-colors.test.ts`: 4 files, 223 tests passed (offers UI file: 22 tests).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in `app/(internal)/driver/` or `components/driver/`.
- `npx eslint --quiet` on the 5 changed source and test files: exit 0.
- Acceptance greps: `requireDriver('/driver/offers')` present; forbidden-term grep on `OfferCard.tsx` returns 0; `'accept'|'decline'` matches in the dialog; `/api/driver/cabinet/offers/` and `aria-live="polite"` present in `OffersList.tsx`.

## Deviations from Plan

None - plan executed as written. One implementation note: the passenger meta line is plain inline text with real spaces (not a flex row) so screen readers read "Passenger Anna · Business" with word breaks.

## Known Stubs

None.

## Threat surface

T-94-50: the card cannot show more than `OfferView` holds; the DOM test with a fully populated booking row finds no last name, phone, flight, notes, reference, client price or euro sign. T-94-51: confirm dialog, in-flight ref, both buttons disabled while saving, no dismissal while saving; the server compare-and-set stays the authority. T-94-52: 401 navigates to sign-in with `ended=1`, no retry. T-94-53: all text rendered through React. No new surface beyond the register.

## Self-Check: PASSED

- FOUND: components/driver/OfferCard.tsx, components/driver/OffersList.tsx, app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx, tests/driver-cabinet-offers-ui.test.tsx
- FOUND commits: d18bb2e3, ec20d883
