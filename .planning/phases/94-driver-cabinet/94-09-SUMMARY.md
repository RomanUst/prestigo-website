---
phase: 94-driver-cabinet
plan: 09
subsystem: driver-notifications
tags: [driver-cabinet, email, web-push, assignment, security]
requires:
  - "94-03: pragueDayLabel and placeLabel format helpers"
  - "94-04: drivers.cabinet_enabled"
  - "94-05: sendDriverPush(supabase, driverId, payload)"
provides:
  - "lib/email.ts: DriverCabinetOfferEmailData, buildDriverCabinetOfferHtml, driverCabinetOfferSubject, sendDriverCabinetOfferEmail"
  - "lib/driver-cabinet/offer-notify.ts: buildOfferPushPayload, notifyCabinetDriverOfOffer"
  - "assign route branch on drivers.cabinet_enabled (cabinet email + push, or today's token email)"
affects: [94-10]
tech-stack:
  added: []
  patterns:
    - "route tests mock @/lib/email and offer-notify with importOriginal so the same file can unit-test the real builders and spy on the route's calls"
key-files:
  created:
    - lib/driver-cabinet/offer-notify.ts
    - tests/driver-cabinet-assign-email.test.ts
  modified:
    - lib/email.ts
    - app/api/admin/bookings/[id]/assign/route.ts
    - tests/admin-assignment.test.ts
key-decisions:
  - "D-18: the cabinet branch replaces the token email only for cabinet_enabled === true; false or absent keeps the existing sendDriverAssignmentEmail call untouched (asserted with a full toEqual on its argument object)"
  - "The cabinet branch sits inside the existing allowed block, after the notification_flags.driver_assigned check and the logEmail dedup, so the flag switch and dedup also gate the push (D-09)"
  - "Tokens and trip_token are still created for every assignment, so old links keep working (D-15)"
  - "Fee row uses a positive-integer check and formatCZK alone (no EUR conversion, D-11); the email omits phone, last name, flight, notes, reference, stops and landing rows"
  - "Short subject date is formatted at UTC noon in the UTC zone (same approach as pragueDayLabel) so it never shifts with the server zone"
patterns-established:
  - "notifyCabinetDriverOfOffer never rejects: the email failure does not stop the push and a push failure is swallowed"
requirements-completed: [DCAB-11, DCAB-12]
status: complete
commits: 2
plan_head_before: 75448e7f8f825d63057a3c8acba56f42eeed163c
plan_head_after: 2599a9a1d65b844e860aa38f0e5d64ecb0aa8ad3
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 09: Cabinet offer email and push on assignment Summary

A driver whose cabinet is enabled is now told about a new ride by a one-button "Open in cabinet" email to /driver/offers plus a web push to every stored browser; drivers without a cabinet get today's token email unchanged.

## What was built

- **Cabinet offer email** (`lib/email.ts`): same navy/gold shell as the other driver emails, hidden preheader, heading "You have a new ride offer", a "Ride details" panel (Pickup Date, From, To with "As directed", Passenger first name only, Vehicle, Your Fee only for a positive integer, CZK alone), one gold "Open in cabinet" button to `{site}/driver/offers` (no query, no token), the sign-in note and the help line. Subject `New ride offer: Fri 27 Nov at 14:30`. `sendDriverCabinetOfferEmail` returns false on error and logs without the address.
- **Push payload and notifier** (`lib/driver-cabinet/offer-notify.ts`): title "New ride offer", body `{Today 14:30}. {Pickup} to {Drop-off}. {Class}.` (place labels cut to 28 characters, "{pickup}, as directed" without a destination), tag `offer-{assignmentId}`, url `/driver/offers`. `notifyCabinetDriverOfOffer` sends the email, then the push, each in its own try/catch, and never rejects.
- **Assign route**: driver select now includes `cabinet_enabled`, booking select includes `vehicle_class`. Inside the existing `allowed` block (after the `driver_assigned` flag and `logEmail` dedup) a cabinet driver triggers `after(() => notifyCabinetDriverOfOffer(...))`; everyone else keeps the untouched `sendDriverAssignmentEmail` call. The 201 body is unchanged.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-assign-email.test.ts tests/admin-assignment.test.ts tests/status-writers-gate.test.ts tests/driver-accept-email.test.ts`: 100 passed. Also green: admin-bookings-status-gates, email-trip-route, email-payment-request, email-reply-to (77 passed).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/` only; none in this plan's files.
- `npx eslint --quiet` on all changed files: clean.
- `git diff --numstat tests/admin-assignment.test.ts`: 4 added, 0 removed (only a `vi.mock` entry).
- No real email or push was sent; Resend and web-push are mocked.

## Deviations from Plan

None - plan executed as written. Notes: the test file mocks `@/lib/email` and offer-notify with `importOriginal` spreads (rather than a bare factory) so one file covers both the real builders and the route branch; `RESEND_API_KEY` is stubbed with `vi.stubEnv` because `getResend()` throws without it.

## Backstop item (held out)

UI-SPEC E14 (the offer email reads correctly in a 600px column in two mail clients) is a held-out render check. It is not automated here: the markup uses the same 600px max-width shell and inline styles as the existing driver emails, but no real mail-client render was done.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema; the threat register items T-94-42 to T-94-46 are covered by tests (no token or reference in the email, first name only, lock-screen payload without name, fee or extra uuid, rejecting senders, legacy argument object, markup first name escaped).

## Self-Check: PASSED

- FOUND: lib/driver-cabinet/offer-notify.ts, tests/driver-cabinet-assign-email.test.ts
- FOUND commits: 8c01f100, 2599a9a1
