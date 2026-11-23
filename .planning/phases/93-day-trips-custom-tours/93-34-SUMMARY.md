---
phase: 93-day-trips-custom-tours
plan: 34
subsystem: tours
tags: [custom-tour, form, next-intl, noindex]
requires: [93-29, 93-05, 93-02]
provides:
  - "/{locale}/book/custom-tour request page"
  - "CustomTourForm client component"
  - "parseCustomTourQuery prefill validator"
  - "CUSTOM_TOUR_REQUEST_LIVE = true"
affects: [tour pages, hub, booking box, tour checkout refusal]
key-files:
  created:
    - app/[locale]/book/custom-tour/page.tsx
    - components/tours/CustomTourForm.tsx
    - tests/custom-tour-form.test.tsx
  modified:
    - lib/tours/custom-tour-link.ts
    - tests/tour-pickup-area.test.ts
decisions:
  - "No start-time field: custom tours have no pickup window; the owner's any-time rule for day trips needs no time picker here"
  - "Wishes counter rendered as language-neutral digits '{n} / 1000' (no new i18n string; Tours.checkout.counter says 'of 490')"
  - "Date must be strictly after Prague today (today and earlier disabled, UI-SPEC 6.2); prefill uses the same rule"
metrics:
  tasks: 2
  completed: 2026-11-23
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: 6a345351921fa9f0f0b04702c21cb37c1b3cbd8f
plan_head_after: d2eb8b13cf16c9392a733295030a5651efcb17c6
---

# Phase 93 Plan 34: Custom-tour request page Summary

Noindex request page at /{locale}/book/custom-tour with a tour-prefilled form that posts to /api/custom-tour, and CUSTOM_TOUR_REQUEST_LIVE switched on so every custom-tour entry point opens it.

## Commits

- f18e5252 feat(93-34): custom-tour request page and form posting to /api/custom-tour
- d2eb8b13 feat(93-34): CUSTOM_TOUR_REQUEST_LIVE = true, every custom-tour entry point opens /book/custom-tour

## What was built

- Page: `force-dynamic`, `robots` noindex, `params.locale` + `setRequestLocale`, 404 for an unknown locale. `parseCustomTourQuery` (in `lib/tours/custom-tour-link.ts`) validates ?tour (slug pattern), ?date (real date after Prague today) and ?pax (1..50); invalid values are dropped silently. The chip shows only when `getPublishedTourForLocale` returns `ok` for the locale (a throwing store means no chip).
- Form: where (textarea, 1000, required, prefilled with the localized title), date (DayPicker panel, today and earlier disabled, Escape closes), people (stepper plus typeable, 1..50, default 2), wishes (1000, counter from 900), name, email, phone / WhatsApp (country code check, helper), honeypot `website` (aria-hidden, tabIndex -1, autocomplete off), privacy line with the localized link. Sending: LoaderCircle plus "Sending…", `aria-busy`, inputs read-only. Success: `role="status"` panel, heading focused, typed email shown, "See day trips" link. Errors: client field errors without a request; 400 fieldErrors mapped to the catalog messages; 422 INVALID_PHONE; 429; rejected fetch; any other status generic. Typed values always stay.
- Payload: `{ where, date, people, wishes, name, email, phone (normalized), locale, website }` plus `tourSlug` only while the chip is present.
- Live switch: `CUSTOM_TOUR_REQUEST_LIVE = true`; `customTourHref({tour, date, pax})` now returns `/book/custom-tour?tour=...&date=...&pax=...`.

## Tests

- `tests/custom-tour-form.test.tsx`: 20 tests (prefill, chip removal, payload, pending state, success focus, honeypot, stepper, counter, all error states, metadata noindex, setRequestLocale, 404).
- Link assertion updated in `tests/tour-pickup-area.test.ts` (the actual home of the live expectation; `tests/tour-catalogue.test.tsx` mocks the switch and needed no change, `tests/tour-checkout.test.tsx` and `tests/tour-booking-box.test.tsx` compare with `customTourHref`).
- Run: custom-tour-form, tour-pickup-area, tour-policy, tour-catalogue, tour-booking-box, tour-checkout, tour-pages, tours-copy-i18n, tour-route-links, tour-sticky-bar: 10 files, 264 tests passed. `npx tsc --noEmit`: only the 8 baseline errors in tests/. eslint --quiet clean on changed files.

## Deviations from Plan

None - plan executed as written. No messages/*.json change: all 32 `Tours.request` keys, `Tours.box.chooseDate/fewer/more` already exist in every locale (93-02).

## Notes for the orchestrator

- `/api/custom-tour` is delivered by 93-32 (not in this branch). Until it lands, a submit gets a non-OK answer and shows the generic error. The form sends `wishes` as a trimmed string (possibly `''`) and omits `tourSlug` when there is no chip; confirm 93-32's strict schema accepts an empty `wishes`.
- Entry points are live after this merge, so 93-32 should ship in the same release (otherwise the visible page cannot send).
- No browser/preview check was done in the worktree (no dev server there); the form was verified with jsdom tests only.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files exist (page, form, test, link, summary); commits f18e5252 and d2eb8b13 present on worktree-agent-a5cb2ef499596afb0.
