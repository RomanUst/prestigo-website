---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 14
subsystem: notifications
tags: [email, resend, google-calendar, stops, airport-pickup, html-escaping]

requires:
  - phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
    provides: "booking_stops table and lib/booking-stops.ts loadStopsSafe (91-06), bookings.landing_date / landing_time / pickup_offset_min and lib/airport-pickup.ts pickupFromLanding (91-07), lib/stops.ts waitingTotalEur (91-05)"
provides:
  - "EmailTripRoute and tripRouteRowsHtml in lib/email.ts: one rows builder for client (with the waiting amount) and driver (no amounts) emails"
  - "Client confirmation (pay-now webhook and card-flow status email), manager alert, driver assignment and driver accepted emails list landing, pickup, stops with waits and the waiting line"
  - "Ops Google Calendar event description with a Landing line and Stop lines"
affects: [91-10, 91-12, 91-13, 91-16, 91-17]

actuals:
  tokens: 13850
  tasks: 3
  commits: 3
plan_head_before: d7533483c4e2dc329d7dba47472bc87f1e23d932
plan_head_after: a76e5c62c53ff7e1f0bc7e9d593938e3be2c8c4f

tech-stack:
  added: []
  patterns:
    - "Send functions that get a bookingId read stops themselves through loadStopsSafe; the optional landing fields travel on the email data types"
    - "Byte-identical regression guard: SHA-256 of the pre-plan HTML for a booking without route data, kept in tests/email-trip-route.test.ts"

key-files:
  created:
    - tests/email-trip-route.test.ts
  modified:
    - lib/email.ts
    - lib/payments/emails/send.ts
    - app/api/webhooks/stripe/route.ts
    - app/api/admin/bookings/[id]/assign/route.ts
    - lib/driver-accept-email.ts
    - lib/google-calendar.ts
    - tests/webhooks-stripe.test.ts
    - tests/driver-accept-email.test.ts
    - tests/admin-assignment.test.ts
    - tests/google-calendar-sync.test.ts

key-decisions:
  - "Pickup shown in emails is derived from landing + offset with pickupFromLanding (Prague, DST-safe), not typed arithmetic; when the pickup falls on another date it is shown with that date"
  - "The manager alert is plain text, so it gets text lines (Landing, Landing pickup, Stop N, Waiting at stops) from a sibling helper instead of HTML rows; the amount is included because the manager already sees the total"
  - "buildDriverAcceptedEmailHtml and buildDriverAssignmentHtml stay synchronous: the send functions load the route and pass it as an optional second argument"
  - "Every call to loadStopsSafe is also wrapped in try/catch inside lib/email.ts and lib/google-calendar.ts, so even a rejecting loader cannot block a message or a sync"

patterns-established:
  - "tripRouteRowsHtml(route, 'client' | 'driver') returns '' for no landing and no stops, so call sites insert rows only when non-empty and the old HTML stays byte-identical"

requirements-completed: [STOP-04, STOP-05]

coverage:
  - id: D1
    description: "Card-flow confirmed status email shows landing, pickup, each stop with its wait and the Waiting at stops line"
    requirement: STOP-04
    verification:
      - kind: unit
        ref: "tests/email-trip-route.test.ts#sendStatusConfirmedEmail (card-flow confirmed email) tracer"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pay-now client confirmation and manager alert carry the same route; webhook call sites pass bookingId and landing fields"
    requirement: STOP-05
    verification:
      - kind: unit
        ref: "tests/email-trip-route.test.ts#sendClientConfirmation (pay-now confirmation); tests/webhooks-stripe.test.ts#Phase 91-14"
        status: pass
    human_judgment: false
  - id: D3
    description: "Driver assignment and accepted emails and the ops calendar show landing, pickup and stops with no client money"
    requirement: STOP-05
    verification:
      - kind: unit
        ref: "tests/email-trip-route.test.ts#driver emails; tests/driver-accept-email.test.ts#91-14; tests/google-calendar-sync.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stop addresses are HTML-escaped and a stops read failure never blocks an email or a calendar sync"
    verification:
      - kind: unit
        ref: "tests/email-trip-route.test.ts (escape and read-failure cases)"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-11-12
status: complete
---

# Phase 91 Plan 14: Stops and landing in every booking message Summary

**One shared rows builder puts the landing, the pickup, each stop with its wait and (for clients) the waiting charge into the client confirmation, the manager alert, both driver emails and the ops calendar event, escaped and byte-identical for bookings without stops.**

## Performance

- **Duration:** 17 min
- **Tasks:** 3 (1 tracer, 2 auto TDD)
- **Files modified:** 11 (1 created)

## Accomplishments

- Tracer: the card-flow "Booking Confirmed" email for landing 14:00 + 30 and one stop waiting 45 minutes now contains Landing, Pickup 14:30, "Stop 1 ... Karlovy Vary (wait 45 min)" and "Waiting at stops". Stops are read in `sendStatusConfirmedEmail` through `loadStopsSafe(booking.id)`, so the two existing call sites (admin route, status service, both pass `select('*')` rows) needed no change.
- Pay-now path: `BookingEmailData` gained optional `bookingId`, `landingDate`, `landingTime`, `pickupOffsetMin`; both webhook confirmation call sites and `bookingEmailDataFromRow` (used by the card-on-file manager alert) set them. `sendClientConfirmation` and `sendManagerAlert` read the stops themselves.
- Driver emails: assignment and accepted emails render the rows inside TRIP DETAILS right after the pickup row, never an amount. The assign route and `lib/driver-accept-email.ts` select the landing columns and pass `bookingId` and the landing values.
- Calendar: `CalendarBooking` gained `landing` and `stops`; `buildCalendarEvent` adds "Landing HH:MM (pickup +N min)" and "Stop N: address (wait M min)"; `syncBookingToCalendar` selects the three columns and loads stops only for an event that is written (not on delete).
- Regression guard: SHA-256 hashes of the pre-plan HTML (status, client confirmation, driver assignment, driver accepted) and the exact pre-plan manager text prove a booking without stops and landing is byte-identical; the driver-assignment golden fixture still passes unchanged.

## Task Commits

1. **Task 1 (tracer): card-flow confirmed email** - `bc56f385` (feat)
2. **Task 2: pay-now confirmation and manager alert** - `6b753d9b` (feat)
3. **Task 3: driver emails and ops calendar** - `a76e5c62` (feat)

## Verification

- `npx vitest run tests/email-trip-route.test.ts tests/email.test.ts tests/webhooks-stripe.test.ts tests/payments-emails.test.ts tests/driver-accept-email.test.ts tests/admin-assignment.test.ts tests/google-calendar-sync.test.ts` green.
- Full suite (`--exclude '.claude/**' --exclude '**/node_modules/**'`): 411 files passed; the only 7 failing files are the known next-intl ERR_MODULE_NOT_FOUND environment artefacts (symlinked node_modules).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on all changed source and test files: clean.

## Deviations from Plan

None - plan executed as written. Notes on judgement calls inside the plan's scope:

- The plan's behavior bullet "snapshot taken in the test from the builder without route data" is implemented as SHA-256 constants captured from the pre-change code (the builders are not exported, and a hash needs no new fixture file outside `files_modified`).
- `lib/stripe-webhook/card-confirm.ts` and `lib/booking-status-service.ts` were not touched: the former reaches the manager alert through `bookingEmailDataFromRow`, the latter passes the full `select('*')` booking row to `sendStatusConfirmedEmail`.

## Known Stubs

None.

## Threat Flags

None. T-91-41 (markup in stop addresses) is mitigated by `escapeHtml` on every value in `tripRouteRowsHtml` with escape tests for the client, status and both driver emails; T-91-42 (stops read blocking a message) is mitigated by `loadStopsSafe` plus a defensive try/catch at each call site, with a "read fails, message still sent" test per surface. The manager alert and calendar are plain text and carry addresses unescaped by design (no HTML context).

## Next Phase Readiness

Wave-4 siblings (91-10 wizard, 91-12 admin trip route section, 91-13 driver trip page) are independent of these files. Localized payment emails (`lib/payments/emails/render.ts`) and the 24 h / 2 h reminders are intentionally unchanged (research A9).

## Self-Check: PASSED

- Files exist: tests/email-trip-route.test.ts, lib/email.ts (tripRouteRowsHtml, 4 matches), lib/google-calendar.ts (landing_time), lib/payments/emails/send.ts (landingTime)
- Commits exist: bc56f385, 6b753d9b, a76e5c62
