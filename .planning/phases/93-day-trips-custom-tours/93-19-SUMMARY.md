---
phase: 93-day-trips-custom-tours
plan: 19
subsystem: tours-confirmation-communication
tags: [tours, confirmation, emails, google-calendar, manage-page]
requires: ["93-18", "93-17", "93-02"]
provides:
  - "app/[locale]/book/confirmation/page.tsx: tour variant (TourConfirmation) fed by readTourConfirmation(ref); ICS = pickup to pickup + 2 x drive + hours"
  - "lib/email.ts: BookingEmailData.tourTitle / tourExtraHours; Day trip / Time at the destination / Pickup and return rows in the client confirmation, client reminder and manager alert"
  - "lib/payments/emails/send.ts: bookingEmailDataFromRow passes tourTitle, tourExtraHours (hours already total)"
  - "lib/google-calendar.ts: tour summary 'Day trip: {title} ({hours} h)' and duration covering the drive"
  - "lib/manage-view.ts: ManageView.tourTitle / hoursIncluded / extraHours; tour rows on /manage/[token]"
  - "lib/tours/confirmation-snapshot.ts: optional passengers and driveMinutes"
  - "Tours.confirmation.payCard in all 8 locales"
affects: ["93-28 canary booking (live email / calendar checks)"]
tech-stack:
  added: []
  patterns:
    - "Tour branches are purely additive: no tour title / not tripType 'tour' = byte-identical email, event, page"
    - "Tour variant of the confirmation page reads only the sessionStorage snapshot, never the wizard store"
key-files:
  created:
    - tests/confirmation-tour.test.tsx
    - tests/email-tour-rows.test.ts
  modified:
    - app/[locale]/book/confirmation/page.tsx
    - app/[locale]/book/tour/page.tsx
    - components/tours/TourCheckout.tsx
    - lib/tours/confirmation-snapshot.ts
    - lib/email.ts
    - lib/payments/emails/send.ts
    - app/api/cron/reminder-24h/route.ts
    - app/api/cron/reminder-2h/route.ts
    - lib/google-calendar.ts
    - lib/manage-view.ts
    - app/[locale]/manage/[token]/page.tsx
    - messages/{en,ru,es,fr,ar,hi,zh,zh-hant}.json
    - tests/tour-checkout.test.tsx
    - tests/google-calendar-sync.test.ts
    - tests/manage-page.test.tsx
decisions:
  - "Drive minutes for the confirmation ICS are carried in the snapshot (driveMinutes, written by TourCheckout from tour.drive_minutes_each_way); a snapshot without it makes the file cover the hours at the destination only (no invented drive)"
  - "Calendar sync reads the tour's drive minutes in a second, failure-safe read of tours; unreadable = 60 min each way default (TOUR_DRIVE_ESTIMATE_MIN). No PostgREST embed, so a missing FK cannot break the sync of other bookings"
  - "The tour confirmation card sentence is a new key Tours.confirmation.payCard (no generic card-hold sentence without a hold date existed); the cash sentence reuses Booking.confirmation.payCash"
  - "Extra hours read '+1 hour extra' in emails (same wording as Tours.checkout.extra), not '1 extra'"
  - "A tour reminder says 'day trip' in heading and subject (the shell said Transfer)"
status: complete
commits: 3
plan_head_before: 74141937db34bd3f957cff9fc6dabcd4db5079f3
plan_head_after: 95145c1997a256e045e2147c9d3b76d458597e67
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
metrics:
  completed: 2026-11-18
---

# Phase 93 Plan 19: Tour confirmation, emails, calendar and manage page Summary

A booked tour is now confirmed on screen ("Your day trip is booked" with reference, trip details, payment sentence, three next steps and a calendar file), by email (Day trip / Time at the destination / Pickup and return rows in the client confirmation, client reminders and the operator alert), in the operations Google Calendar ("Day trip: Dresden (6 h)" with a trip-long event) and on the client manage page, with every non-tour output unchanged.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 (tracer) confirmation page tour variant | 955c7437 | TourConfirmation from the snapshot, ICS, payCard key in 8 locales, snapshot gains passengers / driveMinutes |
| 2 tour rows in emails | 5d50ca99 | BookingEmailData fields, confirmation / reminder / manager rows, email calendar link, reminder cron selects |
| 3 ops calendar and manage page | 95145c19 | buildCalendarEvent tour branch, drive-time read, ManageView tour fields and rows |

## What was built

- **Confirmation page:** `ConfirmationContent` looks the snapshot up after mount (`readTourConfirmation(ref)`, storage is client-only); the analytics / reset effect waits for the lookup. With a snapshot the page renders `TourConfirmation` (eyebrow "BOOKING CONFIRMED", display H1, reference box with `<bdi dir="ltr">`, trip details, payment sentence, "WHAT HAPPENS NEXT" with 01-03, "Add to calendar", "See other day trips" to `/services/day-trips-from-prague`). Without a snapshot, or with one for another ref, the existing page renders unchanged. The tour variant shows nothing from the wizard store, and its Meta CAPI call carries no wizard contact data (the store can hold an earlier visitor's details); the GA4 purchase comes from the snapshot CardPaymentStage wrote.
- **ICS:** one event, pickup time to pickup + (2 x driveMinutes + 60 x (included + extra) minutes), location the pickup address, SUMMARY `{title} – Prestigo` (Tours.confirmation.icsTitle).
- **Emails:** in the confirmation the Route row becomes "Day trip" (escaped title); "Time at the destination" ("5 hours included, +1 hour extra") and "Pickup and return" follow the Date row. The client reminder (24 h and 2 h) has the same rows and says "Day Trip" in heading and subject; the manager alert prints the same three lines in place of `Route:`. The "ADD TO CALENDAR" link of the email is titled with the tour and lasts the hours at the destination. A tour without a title falls back to the plain journey. The cancellation box already reads the stored `tour-` snapshot (policyFromSnapshot); a test pins 24 h vs 48 h free-until.
- **Ops calendar:** summary and description carry `Day trip: {title} ({hours} h)` and `Pickup and return: {address}`; duration = 2 x drive + hours. The sync selects `tour_id, tour_title` and reads `tours.drive_minutes_each_way` in a separate try/catch read (default 60 min each way).
- **Manage page:** `MANAGE_BOOKING_COLUMNS` gains `hours, tour_title, tour_extra_hours`; the view exposes `tourTitle`, `hoursIncluded` (hours - extra) and `extraHours`; the page shows "Day trip" and "Time at the destination" after "to" using `Tours.manage.dayTrip` and `Tours.checkout.timeAtDest / included / extra` in the page locale (ru verified in a test). The cancellation section already reads the stored policy snapshot.

## Verification

- `npx vitest run --exclude '.claude/**' tests/confirmation-tour.test.tsx tests/confirmation-page.test.tsx tests/confirmation-page-i18n.test.tsx tests/ics.test.ts tests/tour-checkout.test.tsx` green (tour-checkout needed one expectation updated for the new `passengers` snapshot field).
- Emails: `tests/email-tour-rows.test.ts` (14), email.test, email-policy-block, payments-emails, email-trip-route, cron-reminder-24h / 2h, email-reply-to, phase91 / 92 e2e, payments-hold and others: green (565 + 728 tests across two runs).
- Calendar and manage: `tests/google-calendar-sync.test.ts` (35) green; `tests/manage-page.test.tsx` (78, 7 new) green, plus manage-actions, booking-status-parity, payments-engine-gates, payments-paynow-money.
- i18n: `i18n-completeness`, `i18n-freeze-manifest`, `i18n-catalog-array-types` green with the new `payCard` key in en, ru, es, fr, ar, hi, zh, zh-hant (translated in-session, no dry-run).
- `npx tsc --noEmit`: no error outside the 8-error `tests/` baseline. `npx eslint --quiet` clean on every changed source and test file. No euro literal in `app/` or `components/`.
- **Environment note:** in this worktree `tests/manage-page.test.tsx` (and `tests/account-trips.test.tsx`, untouched) fail to load with the stock config because the symlinked `node_modules` resolves outside the root for the react-server next-intl build. I ran them through a temporary config (`resolve.preserveSymlinks`, `server.fs.strict: false`, deleted before committing); with it all 78 pass. A normal checkout is not affected.

## Deviations from Plan

**1. [Rule 3 - Blocking] Files outside the plan list**
- `components/tours/TourCheckout.tsx`, `app/[locale]/book/tour/page.tsx`, `tests/tour-checkout.test.tsx`: the snapshot had no drive minutes or passengers, which the ICS and the trip-details rows need (the plan allowed adding driveMinutes; passengers added the same way). The checkout now passes `driveMinutesEachWay` and writes `passengers` / `driveMinutes`; the 93-18 snapshot test expects `passengers: 2`.
- `app/api/cron/reminder-24h/route.ts`, `reminder-2h/route.ts`: the select lists omitted `hours, tour_title, tour_extra_hours` (plan action asked to widen them); `trip_type` was already selected. Both map the four fields onto `ReminderEmailBooking`.
- `messages/*.json`: new key `Tours.confirmation.payCard` (see decisions), added to all eight locales.

**2. [Rule 2 - Missing critical] Tour variant must not use wizard data**
- The existing analytics effect sends the wizard store's email, name and phone to Meta CAPI. For a tour that store may hold another visitor's data, so the tour path sends none of it; its purchase value comes from the CardPaymentStage snapshot only.

**3. Email calendar link duration**
- The email's "ADD TO CALENDAR" link of a tour (`buildGoogleCalendarUrl`, also used by the card-saved / hold emails) lasts the hours at the destination only; the email data has no drive time. The confirmation-page ICS and the ops event include the drive.

## Known Stubs

None.

## Deferred / for the orchestrator and plan 93-28

- **Live checks (not attempted here):** the canary tour booking in `ar` (plan 93-28): open the confirmation, reminder and operator emails in Gmail, Outlook and Apple Mail and check the tour rows next to the RTL Arabic policy block (UI Considerations E24); confirm the Google Calendar ops event of the canary shows "Day trip: ..." with a trip-long duration; browser check of `/book/confirmation?ref=` right after a real tour checkout.
- The legacy PaymentIntent webhook path (`app/api/webhooks/stripe/route.ts` `emailData`) does not pass `tourTitle` / `tourExtraHours`: tours book through the card flow (card-confirm uses `bookingEmailDataFromRow` with `select('*')`), so it is not reachable for a tour today. Add the two fields there if a pay-now tour is ever introduced.
- The driver reminder and driver assignment emails still show Route (pickup to tour label) for a tour; D-11 / D-12 only name the client and operator emails.

## Threat Flags

None beyond the register. T-93-53 (escapeHtml on title and pickup address in the confirmation and reminder, a `<b>` / `<script>` title test) and T-93-54 (policy block built from the stored `tour-` snapshot, 24 h vs 48 h test) are mitigated and tested.

## Self-Check: PASSED

- FOUND: tests/confirmation-tour.test.tsx, tests/email-tour-rows.test.ts, `readTourConfirmation` in the confirmation page, "Time at the destination" in lib/email.ts, `tourTitle` in lib/payments/emails/send.ts and lib/manage-view.ts, "Day trip" in lib/google-calendar.ts
- FOUND commits 955c7437, 5d50ca99, 95145c19
