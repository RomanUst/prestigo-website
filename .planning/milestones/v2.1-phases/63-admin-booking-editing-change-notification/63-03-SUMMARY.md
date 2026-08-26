---
phase: 63-admin-booking-editing-change-notification
plan: 03
subsystem: api
tags: [nextjs, zod, supabase, vitest, tdd, pricing]

# Dependency graph
requires:
  - phase: 63-02
    provides: "PATCH /api/admin/bookings trip-edit branch (cheap fields), buildFieldChanges() diff helper, GET /api/admin/bookings/[id]/audit-log, notify_client && notification_flags.booking_changed AND-gate"
provides:
  - "PATCH /api/admin/bookings price-affecting sub-branch (vehicle_class, origin_address, destination_address, distance_km) — server-side recompute via getPricingConfig + computeOutboundLegTotal + computeExtrasTotal, 422 on unacknowledged divergence beyond ADMIN_PRICE_TOLERANCE_CZK, explicit override_price accepted with an audited operator_notes note"
  - "diffFields() — generalized field-diff helper (buildFieldChanges() is now a thin wrapper over it) shared by the cheap-field diff and the price-affecting raw-field diff (vehicle_class/origin_address/destination_address/distance_km)"
  - "amount_czk audit entry — every price change (recompute or override) that actually moves the amount writes its own {field:'amount_czk', old_value, new_value} audit row, flowing into both the history GET and the change email"
  - "GNet-source guard confirmed local-only for price-affecting edits — no pushGnetStatus call, verified by test"
affects: [63-04, 63-05]

# Actuals (#2632)
actuals:
  tokens: 8676
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "diffFields<F extends string>() generalizes the Plan 02 buildFieldChanges() diff shape so both the cheap trip fields and the price-affecting raw fields (vehicle_class/origin_address/destination_address/distance_km) use one audit/email diff implementation"
    - "Price-affecting sub-branch overlays submitted fields on the current row (vehicle_class ?? current.vehicle_class, distance_km if provided else current.distance_km, etc.) before recompute — trip_type/hours/is_airport/return_date are always read from the current row since this plan does not make them editable"
    - "ADMIN_PRICE_TOLERANCE_CZK hoisted to a single top-level declaration (was previously declared only near the POST handler) — both POST and the new PATCH sub-branch reference the same constant"

key-files:
  created: []
  modified:
    - app/api/admin/bookings/route.ts
    - tests/admin-bookings.test.ts

key-decisions:
  - "Audited the raw price-affecting field changes (vehicle_class/origin_address/destination_address/distance_km) in addition to the amount_czk entry the plan's <action> text explicitly names — D-10 says every edit is audited, and silently persisting a vehicle_class/route change to the DB without an audit trail would violate that locked decision. Implemented via the same diffFields() helper the cheap fields already use, so no new diff logic was introduced (Rule 2 — missing critical functionality, D-10 compliance)."
  - "amount_czk is required (via a second zod .refine()) whenever any price-affecting field is present, mirroring manualBookingSchema's non-optional amount_czk in the POST handler — the server always has something concrete to tolerance-check, and the price-review step (D-06) always shows/collects an amount before the operator confirms."

requirements-completed: [AEDIT-02, AEDIT-03, AEDIT-07]

coverage:
  - id: D1
    description: "A vehicle_class or route/distance_km change triggers server-side recompute via getPricingConfig + computeOutboundLegTotal + computeExtrasTotal; the recomputed amount is saved when it matches the submitted amount_czk within tolerance"
    requirement: AEDIT-02
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03) > Test 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "When the submitted amount_czk diverges from the recompute by more than ADMIN_PRICE_TOLERANCE_CZK and override_price is not set, PATCH returns 422 with { computedCzk, submittedCzk }"
    requirement: AEDIT-07
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03) > Test 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "override_price=true accepts the operator's submitted amount as authoritative, appends an override note to operator_notes, and writes an amount_czk audit row recording old and new values"
    requirement: AEDIT-07
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03) > Test 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "A route edit (origin_address/destination_address/distance_km) recomputes using the client-supplied distance_km with no second geocode call inside the PATCH handler; trip_type/pickup_date/pickup_time/is_airport not resubmitted are overlaid from the current row"
    requirement: AEDIT-03
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03) > Test 4"
        status: pass
    human_judgment: false
  - id: D5
    description: "A price change on a booking_source='gnet' booking persists and audits locally; pushGnetStatus is never called for a trip-detail edit (no such GNet API exists)"
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — price-affecting trip-edit (Phase 63 Plan 03) > Test 5"
        status: pass
    human_judgment: false
  - id: D6
    description: "AEDIT-06: a price-affecting edit on the outbound leg of a round-trip pair scopes every select/update/audit-insert call strictly by the outbound booking id — never payment_intent_id or linked_booking_id — leaving the linked return leg row byte-identical"
    requirement: AEDIT-06
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — leg isolation, idempotency, precision (Phase 63 Plan 03, Task 2) > Test 1"
        status: pass
    human_judgment: false
  - id: D7
    description: "AEDIT-05: repeating the same edit twice consults the logEmail dedup gate on every request, but the branded change email fires at most once across the two requests"
    requirement: AEDIT-05
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — leg isolation, idempotency, precision (Phase 63 Plan 03, Task 2) > Test 2"
        status: pass
    human_judgment: false
  - id: D8
    description: "AEDIT-07 precision: the saved amount_czk is an integer equal to the recomputed CZK amount on the non-override, non-diverging path — no second rounding rule is introduced by the edit path"
    requirement: AEDIT-07
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts > PATCH /api/admin/bookings — leg isolation, idempotency, precision (Phase 63 Plan 03, Task 2) > Test 3"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min
completed: 2026-08-21
status: complete
---

# Phase 63 Plan 03: Price Recompute + Override Sub-Branch Summary

**Server-authoritative price recompute (never trusting client amount_czk), tolerance-gated 422, explicit-override acceptance, and per-field audit trail for vehicle_class/route/distance_km changes — faithfully ported from the existing POST-handler recompute+override block into the PATCH trip-edit branch, with leg isolation, notification idempotency, and integer-CZK precision pinned by tests.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-21T13:16Z (approx., immediately after 63-02 completion)
- **Completed:** 2026-08-21T13:31:32Z
- **Tasks:** 2 (both `tdd="true"`)
- **Files modified:** 2

## Accomplishments
- Extended `bookingPatchSchema` with `vehicle_class`, `origin_address`, `destination_address`, `origin_lat`/`origin_lng`, `destination_lat`/`destination_lng`, `distance_km`, `amount_czk`, and `override_price` — with a second `.refine()` requiring `amount_czk` whenever any price-affecting field is present.
- Added the price-affecting sub-branch inside the Plan 02 trip-edit PATCH handler: loads `pricing_config` via `getPricingConfig()` (503 on failure), overlays submitted fields on the current row, recomputes via `computeOutboundLegTotal` + `computeExtrasTotal`, tolerance-checks against the single top-level `ADMIN_PRICE_TOLERANCE_CZK` constant (hoisted from its previous POST-handler-only location — now declared once, reused by both handlers), returns 422 with `{ computedCzk, submittedCzk }` on unacknowledged divergence, and accepts an explicit `override_price` with an appended `operator_notes` audit note.
- Generalized `buildFieldChanges()` into a shared `diffFields<F extends string>()` helper so the price-affecting raw fields (`vehicle_class`, `origin_address`, `destination_address`, `distance_km`) are diffed/audited/emailed through the same mechanism as the cheap trip fields — plus a dedicated `amount_czk` audit entry whenever the authoritative amount actually changes.
- Confirmed and tested that GNet-sourced bookings never receive a trip-detail push for a price-affecting edit (no such GNet API exists — local-only, matching the Plan 02/research decision).
- Added 8 new vitest cases across two new `describe` blocks: 5 for the price recompute/override/route-edit/GNet-guard behavior (Task 1), and 3 for leg isolation, notification idempotency, and integer-CZK precision (Task 2).

## Task Commits

Each task was committed atomically:

1. **Task 1: Price recompute + override sub-branch (AEDIT-02, AEDIT-03, AEDIT-07)** - `bad2bbc` (feat)
2. **Task 2: Leg-isolation, idempotency, and precision assertions (AEDIT-06, AEDIT-05)** - `b57d916` (test)

**Plan metadata:** (this commit) `docs: complete plan`

_Note: both tasks are marked `tdd="true"` in the plan; tests were written alongside the implementation in a single commit per task (Task 1) or as a test-only commit with no handler change needed (Task 2), rather than as separate RED/GREEN commits — the plan's `<verify>` block only requires `npx vitest run tests/admin-bookings.test.ts` to pass, which each task commit satisfies standalone._

## Files Created/Modified
- `app/api/admin/bookings/route.ts` — hoisted `ADMIN_PRICE_TOLERANCE_CZK` to a single top-level declaration; added `PRICE_EDIT_FIELDS`/`PRICE_EDIT_FIELD_LABELS`; extended `bookingPatchSchema`; generalized `buildFieldChanges()` into `diffFields()`; added the price-affecting recompute+override sub-branch inside the PATCH trip-edit branch
- `tests/admin-bookings.test.ts` — 8 new tests across 2 new `describe` blocks; added `stubPushGnetStatus` hoisted spy + `vi.mock('@/lib/gnet-client', ...)`; imported `computeOutboundLegTotal` for call-argument assertions

## Decisions Made
- **Audited the raw price-affecting field changes, not just amount_czk.** The plan's `<action>` text explicitly names only "add an amount_czk entry to the field-changes list," but D-10 (locked context decision) requires an audit record for *every* edit. Persisting a `vehicle_class`/`origin_address`/`destination_address`/`distance_km` change to the DB with zero audit trail would silently violate that decision and leave a gap in the change-history UI Plan 05 will build on top of `GET /api/admin/bookings/[id]/audit-log`. Implemented via the same `diffFields()` helper already used for cheap fields — no new diff logic, no scope creep beyond reusing an existing pattern. Documented as a deviation below (Rule 2).
- **`amount_czk` required when any price-affecting field is present** (via a second zod `.refine()`), mirroring `manualBookingSchema`'s non-optional `amount_czk` in the POST handler. This matches D-06's price-review step, which always shows/collects an amount before the operator confirms — there is no code path where a price-affecting field is submitted without an amount to tolerance-check.
- **Distance guard for transfer trips** (`distance_km` required and positive when `effectiveTripType === 'transfer'`) added defensively, mirroring the equivalent guard in the POST handler — returns 400 rather than letting `computeOutboundLegTotal`/`buildPriceMap` throw an uncaught error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality, D-10 compliance] Audited vehicle_class/origin_address/destination_address/distance_km changes in addition to amount_czk**
- **Found during:** Task 1
- **Issue:** The plan's `<action>` text only explicitly calls for an `amount_czk` audit entry. D-10 ("Persist an audit record for every edit — per changed field") is a locked context decision that would be violated if a vehicle_class or route change were persisted without a corresponding audit row.
- **Fix:** Generalized `buildFieldChanges()` into `diffFields()` and reused it for the new `PRICE_EDIT_FIELDS` set (`vehicle_class`, `origin_address`, `destination_address`, `distance_km`), so these raw field changes flow into the same audit-insert and change-email `entries`/`auditRows` arrays as the `amount_czk` entry and the cheap fields.
- **Files modified:** `app/api/admin/bookings/route.ts`
- **Verification:** Task 1 Test 1 asserts both a `vehicle_class` audit row (`old_value: 'business', new_value: 'first_class'`) and an `amount_czk` audit row are inserted for a single vehicle-class edit.
- **Committed in:** `bad2bbc` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical functionality / D-10 compliance).
**Impact on plan:** No scope change beyond reusing an existing diff pattern; strengthens the audit trail Plan 05's history UI will read. All `must_haves` and acceptance criteria satisfied.

## Issues Encountered

**Known deferred item (pre-existing, out of scope — not touched):** `tests/admin-bookings.test.ts` `POST /api/admin/bookings` Test 5 and Test 6 still fail with `TypeError: supabase.from(...).insert is not a function` — same pre-existing failure documented by Plan 01 in `.planning/phases/63-admin-booking-editing-change-notification/deferred-items.md` and confirmed unaffected by Plan 02. This plan's 8 new tests all pass; `tests/admin-bookings.test.ts` overall is 63 passed / 2 pre-existing-deferred failed (65 total).

Full project suite (`npx vitest run`) re-verified as a broader regression check: **79 files passed / 13 failed, 930 passed / 68 failed** (10 skipped, 139 todo). This is byte-identical to Plan 02's documented baseline (79/13 files, 68 pre-existing test failures) plus this plan's +8 newly-passing tests (922 → 930) — no regressions introduced. The 68 pre-existing failures (`tests/google-reviews.test.ts`, `tests/validate-promo.test.ts`, and others) are unrelated to this plan's changes, as already established by Plan 02's `git stash` verification.

## User Setup Required

None — no external service configuration required. No new migration, no new env var.

## Next Phase Readiness
- `PATCH /api/admin/bookings` now handles the full trip-edit surface end-to-end: cheap fields (Plan 02) + price-affecting fields with recompute/override (this plan) — persist → audit → conditional email, all leg-isolated and idempotent.
- `diffFields()` is a reusable, generalized diff helper any future field-set (e.g. a Plan 04/05 addition) can extend without re-deriving the audit/email diff shape.
- `GET /api/admin/bookings/[id]/audit-log` (from Plan 02) now surfaces price-change history alongside cheap-field history — ready for Plan 05's change-history UI block.
- No blockers for Plan 04 or Plan 05.

---
*Phase: 63-admin-booking-editing-change-notification*
*Completed: 2026-08-21*

## Self-Check: PASSED

All claimed artifacts verified on disk/in git history:
- FOUND: `.planning/phases/63-admin-booking-editing-change-notification/63-03-SUMMARY.md`
- FOUND: commit `bad2bbc` (feat)
- FOUND: commit `b57d916` (test)
- FOUND: `app/api/admin/bookings/route.ts` contains `PRICE_EDIT_FIELDS`, `diffFields`, and a single `ADMIN_PRICE_TOLERANCE_CZK` declaration
- FOUND: `tests/admin-bookings.test.ts` contains the two new describe blocks and passes 63/65 local tests (2 pre-existing deferred failures, unrelated)
