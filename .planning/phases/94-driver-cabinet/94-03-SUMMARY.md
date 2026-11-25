---
phase: 94-driver-cabinet
plan: 03
subsystem: api
tags: [driver-cabinet, offers, respond, idor, compare-and-set, supabase]
requires:
  - "94-01: getDriverSession, createFakeDriverCabinetDb, rate-limit key '/api/driver/cabinet/offers/respond'"
provides:
  - "lib/driver-offer.ts: respondToOffer (token and session callers), OfferAction, OfferCaller, OfferResult"
  - "lib/driver-cabinet/assignments.ts: newestAssignmentByBooking"
  - "lib/driver-cabinet/format.ts: driverFeeLabel, firstNameOf, pragueDayLabel, placeLabel, dropoffText, plateLabel"
  - "lib/driver-cabinet/offers.ts: OFFER_SELECT, OfferView, isLiveOffer, listLiveOffers, countLiveOffers"
  - "POST /api/driver/cabinet/offers/[assignmentId]/respond"
affects: [94-06, 94-09, 94-11]
tech-stack:
  added: []
  patterns:
    - "one respond function, two callers; the effects (accepted-trip email, decline notice) come back as a never-throwing closure the route runs in after()"
    - "session answers ignore token_expires_at but still set token_used_at, so the emailed link reads 'used' afterwards"
    - "offer visibility = pending + newest assignment of its booking + booking neither terminal nor started"
    - "column gate on the offer select string, asserted against the recorded calls of the fake DB"
key-files:
  created:
    - lib/driver-offer.ts
    - lib/driver-cabinet/assignments.ts
    - lib/driver-cabinet/format.ts
    - lib/driver-cabinet/offers.ts
    - "app/api/driver/cabinet/offers/[assignmentId]/respond/route.ts"
    - tests/driver-offer.test.ts
    - tests/driver-cabinet-offers.test.ts
    - tests/driver-cabinet-format.test.ts
  modified:
    - app/api/driver/respond/route.ts
key-decisions:
  - "The decline lookups (driver name, booking fields) now run inside runEffects, i.e. in after() after the response, instead of before it; the order of the lookups, the sender call and the 200 body are unchanged, and the existing respond tests pass unedited"
  - "A failing newest-assignment query yields an empty map, so every caller fails closed (not_available / not live)"
  - "The token path keeps the original guards and column list exactly; 'not_available' is session-only, the adapter maps invalid_token / used to the same 400 bodies as before"
status: complete
commits: 2
plan_head_before: dc4885941c966e5d9f33c76d7cabfc97bbfcc4fa
plan_head_after: 8022aba57c51e064eb1b13fc1a1a8d11a785b3e7
actuals:
  tokens: 16500
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 03: One respond path and live offers Summary

The emailed accept/decline link and the cabinet now answer an offer through one function, `respondToOffer`, and a signed-in driver can list and answer their live offers through `POST /api/driver/cabinet/offers/[assignmentId]/respond` with exactly the old effects.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit f448e437, `security:`)**: `lib/driver-offer.ts` holds the body of the old respond route for the token caller (same lookup columns, uniform `invalid_token`, guarded update `gt token_expires_at` + `is token_used_at null`, `used` on a lost race) and a session caller: row filtered by `driver_id` and id, status `pending`, booking neither terminal nor `en_route` / `on_location` / `on_board`, newest assignment of its booking, then a compare-and-set update `{ status, token_used_at }` guarded by `eq id`, `eq driver_id`, `eq status 'pending'`. `token_expires_at` is never read on that path (D-10). `app/api/driver/respond/route.ts` is a thin adapter. `newestAssignmentByBooking` added.
- **Task 2 (commit 8022aba5, `security:`)**: the pure label helpers, `OFFER_SELECT` + `isLiveOffer` + `listLiveOffers` (earliest pickup first, first name and driver fee only) + `countLiveOffers`, and the cabinet respond route (body cap 1 KB, rate limit, 401 without session, uuid check giving the same 409 as a foreign id, zod action, `after()` effects, no-store, never writes `bookings`).

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-offer.test.ts tests/driver-cabinet-offers.test.ts tests/driver-cabinet-format.test.ts tests/driver-accept-email.test.ts tests/admin-assignment.test.ts tests/status-writers-gate.test.ts`: 6 files, 162 tests passed. `git diff` on `tests/driver-accept-email.test.ts` and `tests/admin-assignment.test.ts` is empty.
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all 9 source and test files: exit 0.
- Acceptance greps: no forbidden column names in `offers.ts` / `format.ts` (0 / 0); `.eq('driver_id', driverId)` in `offers.ts`; `getDriverSession` and `enforceMaxBody` in the route; no `from('bookings')` in the route or `offers.ts`; no `.update(` in the token adapter.

## Deviations from Plan

None - plan executed as written. One noted judgement inside the plan's latitude: the plan said to keep the decline lookups before `after()` only if an existing test pinned that order; none does (tests call-count the lookups but wait for `after()`), so the lookups live in `runEffects` as the interface block specifies.

## Known Stubs

None.

## Threat surface

T-94-14 (IDOR): lookup and update both filtered by the session driver; foreign, missing, malformed ids share one 409 body (tested). T-94-15: newest-of-booking, non-terminal, not-started checks and `status = 'pending'` compare-and-set (tested incl. a concurrent answer). T-94-16: offer select gate asserted on recorded selects and on the serialised view. T-94-17: token path unchanged, existing tests green unedited. T-94-18: rate limit key, 1 KB body cap; CSRF strict Origin from 94-01 covers `/api/driver/cabinet`. No new surface beyond the register.

## Self-Check: PASSED

- FOUND: lib/driver-offer.ts, lib/driver-cabinet/assignments.ts, lib/driver-cabinet/format.ts, lib/driver-cabinet/offers.ts, app/api/driver/cabinet/offers/[assignmentId]/respond/route.ts, tests/driver-offer.test.ts, tests/driver-cabinet-offers.test.ts, tests/driver-cabinet-format.test.ts
- FOUND commits: f448e437, 8022aba5
