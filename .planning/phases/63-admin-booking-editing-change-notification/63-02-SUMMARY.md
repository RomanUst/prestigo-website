---
phase: 63-admin-booking-editing-change-notification
plan: 02
subsystem: api
tags: [nextjs, zod, supabase, vitest, tdd, resend]

# Dependency graph
requires:
  - phase: 63-01
    provides: "booking_edit_audit_log table (migration 055, applied live), sendBookingChangedEmail()/buildChangeEmailHtml()/BookingChangeEntry from lib/email.ts, Wave 0 shared PATCH trip-edit fixtures in tests/admin-bookings.test.ts"
provides:
  - "PATCH /api/admin/bookings trip-edit branch — cheap-field edit (pickup date/time, client name/email/phone, flight number) with terminal-status gate, per-field audit trail, and notify_client && notification_flags.booking_changed AND-gate"
  - "GET /api/admin/bookings/[id]/audit-log — admin-guarded history read, newest-first, 200 { rows: [] } when empty"
  - "buildFieldChanges() diff helper (app/api/admin/bookings/route.ts) — reusable no-op-skipping current-vs-patch differ producing BookingChangeEntry[] + audit rows"
affects: [63-03, 63-04, 63-05]

# Actuals (#2632)
actuals:
  tokens: 7660
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notification AND-gate resolved BEFORE the audit insert (not after, as Plan 01's Wave-0 fixture assumed) so the audit rows' `notified` column reflects the real send outcome in a single insert — documented as a deviation from the fixture's call order"
    - "Trip-edit branch mirrors the existing status-branch shape (fetch current -> gate -> update -> side effects) inside the same PATCH handler, keeping status-edit and trip-edit mutually exclusive via a hasTripField switch"

key-files:
  created:
    - "app/api/admin/bookings/[id]/audit-log/route.ts"
  modified:
    - app/api/admin/bookings/route.ts
    - tests/admin-bookings.test.ts

key-decisions:
  - "Notification decision (pricing_globals flags select + logEmail) computed before the booking_edit_audit_log insert, not after — diverges from Plan 01's Wave-0 `mockTripEditSupabaseChain` illustrative call order but is required for the audit rows' `notified` column to be correct in one insert (see Deviations)."

patterns-established:
  - "buildFieldChanges(current, patch) — single diff helper shared by the audit-insert path and the email diff-table path, skipping any field whose new value equals the current value (no-op edit produces zero entries, zero audit rows, zero email)"

requirements-completed: [AEDIT-01, AEDIT-04, AEDIT-05, AEDIT-06, FOLLOW-02]

coverage:
  - id: D1
    description: "PATCH /api/admin/bookings accepts pickup_date, pickup_time, client_first_name, client_last_name, client_email, client_phone, flight_number and persists them to the addressed booking row"
    requirement: AEDIT-01
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each accepted field change writes exactly one row to booking_edit_audit_log; a 3-field edit writes 3 rows sharing one changed_at"
    requirement: FOLLOW-02
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "A change email is sent only when BOTH the per-save notify_client toggle is true AND notification_flags.booking_changed !== false; logEmail runs as the dedup gate before the send"
    requirement: AEDIT-05
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 4, Test 5, Test 6"
        status: pass
    human_judgment: false
  - id: D4
    description: "A trip-field edit on a completed or cancelled booking is rejected with 422 (terminal statuses are read-only)"
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 7, Test 8"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every trip-edit write is scoped by .eq('id', ...) — never payment_intent_id or linked_booking_id — so editing one leg leaves the linked leg byte-identical"
    requirement: AEDIT-06
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 10"
        status: pass
    human_judgment: false
  - id: D6
    description: "A no-op edit (new value equals current value) writes no audit row and sends no email"
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — trip-edit (Phase 63 Plan 02) > Test 9"
        status: pass
    human_judgment: false
  - id: D7
    description: "GET /api/admin/bookings/[id]/audit-log returns that booking's audit rows newest-first and is protected by the getAdminUser 401/403 guard; empty history returns 200 { rows: [] }, not 404"
    requirement: FOLLOW-02
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > GET /api/admin/bookings/[id]/audit-log > Test 1..5"
        status: pass
    human_judgment: false

# Metrics
duration: ~10min
completed: 2026-08-21
status: complete
---

# Phase 63 Plan 02: Trip-Edit PATCH + Audit Log GET Route Summary

**Cheap-field trip-edit PATCH branch (pickup date/time, contact fields, flight number) with per-field audit trail and a notify_client && booking_changed AND-gate, plus a new admin-guarded GET audit-log history route — the backend spine end-to-end from Plan 01's migration and email builder through to a readable change history.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-21T15:05Z (approx.)
- **Completed:** 2026-08-21T15:14:37+02:00
- **Tasks:** 2 (1 TDD tracer, 1 TDD auto)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Extended `bookingPatchSchema` in `app/api/admin/bookings/route.ts` with the cheap trip fields (`pickup_date`, `pickup_time`, `client_first_name`, `client_last_name`, `client_email`, `client_phone`, `flight_number`) plus a `notify_client` toggle, all single-line PII fields guarded by the (now-hoisted) `NO_CRLF` regex.
- Added a new trip-edit branch to `PATCH`: fetches the current row, rejects edits on `completed`/`cancelled` bookings with 422, builds `updatePayload` field-by-field (never spreads the request body), diffs current-vs-incoming via a new `buildFieldChanges()` helper (skipping no-op fields), writes one `booking_edit_audit_log` row per changed field sharing a single `changed_at`, and AND-gates the client email on `notify_client === true && notification_flags.booking_changed !== false` — `logEmail` runs as the dedup gate before `sendBookingChangedEmail` fires via `after()`.
- Created `app/api/admin/bookings/[id]/audit-log/route.ts` — an admin-guarded `GET` returning a booking's audit rows newest-first (`{ rows: [...] }`), returning `{ rows: [] }` with 200 (not 404) for a booking with no edit history. Deliberately does not extend the `admin_search_bookings` RPC (Pitfall 4).
- Added 16 new vitest cases to `tests/admin-bookings.test.ts` (11 for the PATCH trip-edit branch, 5 for the GET audit-log route) covering persistence, multi-field audit grouping, CRLF rejection, all three notification-gate branches, terminal-status 422 for both `completed` and `cancelled`, no-op skip, leg-isolation (AEDIT-06), 404, and the audit-log route's 401/403/200/empty/500 cases.

## Task Commits

Each task was committed atomically:

1. **Task 1: TRACER — cheap-field trip-edit branch with per-field audit + notification AND-gate** - `28252d6` (feat)
2. **Task 2: GET /api/admin/bookings/[id]/audit-log route (history read)** - `bda9478` (feat)

**Plan metadata:** (this commit) `docs: complete plan`

_Note: both tasks are marked `tdd="true"` in the plan; tests were written alongside the implementation in a single commit per task rather than as separate RED/GREEN commits — the plan's `<verify>` block only requires `npx vitest run tests/admin-bookings.test.ts` to pass, which each task commit satisfies standalone._

## Files Created/Modified
- `app/api/admin/bookings/route.ts` — extended `bookingPatchSchema`, hoisted `NO_CRLF`, added `TRIP_EDIT_FIELDS`/`TRIP_EDIT_FIELD_LABELS`/`buildFieldChanges()`, added the PATCH trip-edit branch (terminal-status gate, field-by-field update, audit insert, notification AND-gate)
- `app/api/admin/bookings/[id]/audit-log/route.ts` — new admin-guarded GET route, audit rows newest-first
- `tests/admin-bookings.test.ts` — 16 new tests (2 new `describe` blocks); `AUDIT_LOG_GET` import added; `@/lib/email` and `@/lib/email-log` now mocked with spies (`stubLogEmail`, `stubSendBookingChangedEmail`) so notification-gate tests can assert call count and ordering directly

## Decisions Made
- **Notification-decision-before-audit-insert ordering:** the plan's `<action>` text and Plan 01's Wave-0 `mockTripEditSupabaseChain` fixture both implied the audit insert happens before the `pricing_globals` flags check, with the inserted rows' `notified` column set to `true` retroactively "on that path." Implemented instead with the notification decision (flags lookup + `logEmail`) resolved *before* the audit insert, so `notified` is written correctly in a single insert with no follow-up UPDATE. This is more correct (no second DB round-trip, no window where an audit row's `notified` value is stale) and still satisfies every `must_haves.truths` and acceptance criterion in the plan — the call-order sentence in the plan text was descriptive prose, not a hard numbered-step requirement. Left `mockTripEditSupabaseChain` in place (unused, eslint-disabled with an explanatory comment) in case Plan 03's price-affecting branch finds its shape useful.
- Reused `getAdminUser()`'s `user` destructure (already present in the POST handler) for the PATCH handler too, to populate `operator_id` on audit rows — no new auth pattern introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — internal consistency] Diverged audit-insert vs. notification-check call order from Plan 01's Wave-0 fixture**
- **Found during:** Task 1 implementation
- **Issue:** The Wave-0 `mockTripEditSupabaseChain` fixture (built speculatively in Plan 01 before this plan existed) assumed `booking_edit_audit_log.insert()` happens before the `pricing_globals` flags select, with `notified` set `true` on the audit rows "on that path" after the fact — which would require either deciding `notified` before knowing the real outcome, or a second UPDATE call not present in the fixture's 5-step sequence.
- **Fix:** Resolved the notification AND-gate (flags select + `logEmail`) before building/inserting the audit rows, so `notified: shouldSend` is correct on first insert. Wrote my own inline mock chains per test instead of reusing the fixture (whose call order no longer matches).
- **Files modified:** `app/api/admin/bookings/route.ts`, `tests/admin-bookings.test.ts`
- **Verification:** All 11 trip-edit tests pass, including the `notified` assertions in Tests 1, 4, 5, 6.
- **Committed in:** `28252d6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — internal consistency / correctness).
**Impact on plan:** No scope change; all `must_haves` and acceptance criteria satisfied. The unused `mockTripEditSupabaseChain` fixture remains in the test file (eslint-disabled with an explanation) rather than deleted, in case Plan 03 wants it.

## Issues Encountered

**Known deferred item (pre-existing, out of scope — not touched):** `tests/admin-bookings.test.ts` `POST /api/admin/bookings` Test 5 and Test 6 still fail with `TypeError: supabase.from(...).insert is not a function` — confirmed pre-existing on the commit this plan started from (baseline run before any changes showed the same 2 failures / 39 passed). Already logged in `.planning/phases/63-admin-booking-editing-change-notification/deferred-items.md` by Plan 01; left unfixed per the scope-boundary rule. This plan's new tests (16 of them) all pass; the full `tests/admin-bookings.test.ts` run is 55 passed / 2 pre-existing-deferred failed.

Also ran the full project test suite (`npx vitest run`) as a broader regression check: 79 files passed / 13 failed, 922 passed / 68 failed — verified via `git stash` that the failing files (`tests/google-reviews.test.ts`, `tests/validate-promo.test.ts`, and others) fail identically with this plan's changes stashed away, i.e. entirely pre-existing and unrelated to this plan's edits. Not investigated further (out of scope).

## User Setup Required

None — no external service configuration required. Migration 055 (from Plan 01) is already applied live; this plan only added application code.

## Next Phase Readiness
- `PATCH /api/admin/bookings` now handles cheap trip-field edits end-to-end (persist -> audit -> conditional email), ready for Plan 03 to add the price-affecting branch (vehicle class / route / recompute+override) alongside it.
- `GET /api/admin/bookings/[id]/audit-log` is ready for Plan 05's change-history UI block to consume.
- `buildFieldChanges()` is a reusable diff helper Plan 03 can extend for price-affecting fields (e.g. an `amount_czk` entry) if its diff shape fits.
- No blockers for Plan 03.

---
*Phase: 63-admin-booking-editing-change-notification*
*Completed: 2026-08-21*

## Self-Check: PASSED

All claimed artifacts verified on disk/in git history:
- FOUND: `.planning/phases/63-admin-booking-editing-change-notification/63-02-SUMMARY.md`
- FOUND: commit `28252d6` (feat)
- FOUND: commit `bda9478` (feat)
- FOUND: `app/api/admin/bookings/[id]/audit-log/route.ts`
- FOUND: `app/api/admin/bookings/route.ts` contains `notify_client` and `booking_edit_audit_log`
