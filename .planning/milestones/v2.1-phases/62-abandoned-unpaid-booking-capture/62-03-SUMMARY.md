---
phase: 62-abandoned-unpaid-booking-capture
plan: 03
subsystem: admin-ui
tags: [react, tanstack-table, zod, supabase-rpc, status-badge, admin-bookings]

requires:
  - phase: 62-abandoned-unpaid-booking-capture
    provides: "62-01/62-02 — unpaid status value, attempt_id dedup, one-way + round-trip capture and reconcile"
provides:
  - "StatusBadge 'unpaid' variant — distinct amber hex (#f59e0b), not shared with any of the other 7 status variants"
  - "BookingsTable: unpaid rows visually distinguished in the default 'All' view (badge + light amber row tint, desktop + mobile) — never hidden (D-09)"
  - "BookingsTable: 'Unpaid' filter chip — a status dimension independent of the trip-type chips (D-08)"
  - "GET /api/admin/bookings threads a whitelisted status filter as p_status to admin_search_bookings (ABND-04)"
  - "PATCH /api/admin/bookings: unpaid entry double-gated in both VALID_TRANSITIONS maps (route.ts server-enforced + lib/booking-transitions.ts UI source) — unpaid->confirmed / unpaid->cancelled only, never into unpaid manually (D-04, D-10)"
affects: [62-04]

actuals:
  tokens: 5300
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Status filter as a second, independent chip dimension (statusFilter) alongside the existing trip-type chip dimension (tripType) — same handleFilterChange helper, separate state"
    - "GET status-param whitelist (KNOWN_STATUSES Set) before binding to an RPC positional parameter — defense against forwarding arbitrary strings even though the RPC binds positionally"

key-files:
  created:
    - .planning/phases/62-abandoned-unpaid-booking-capture/deferred-items.md
  modified:
    - components/admin/StatusBadge.tsx
    - components/admin/BookingsTable.tsx
    - lib/booking-transitions.ts
    - app/api/admin/bookings/route.ts
    - tests/BookingsTable.test.tsx
    - tests/admin-bookings.test.ts

key-decisions:
  - "unpaid badge hex: bg #3a1a12 / color #f59e0b / border rgba(245,158,11,0.3) — amber, distinct from pending (#fb923c) and on_location (#fbbf24), the two nearest existing warm-toned variants"
  - "Row tint uses the exact same rgba(245,158,11,0.06) value as a flat replacement background (not layered), consistent between the desktop <tr> and the mobile card — falls through to the existing hover/expanded color so interaction affordance is preserved"
  - "GET's status filter is whitelisted against a KNOWN_STATUSES set (including all 8 status values, not just 'unpaid') before being passed as p_status — an unrecognized value is silently treated as no-filter (null) rather than rejected with an error, matching the existing tolerant-query-param convention in this handler (page/limit/tripType all clamp/ignore rather than 400)"
  - "statusFilter is typed useState<string> (not a narrower union) to stay structurally compatible with the existing handleFilterChange(setter: (v: string) => void) helper without a cast, matching tripType's own typing"

requirements-completed: [ABND-03, ABND-04]

coverage:
  - id: D1
    description: "StatusBadge renders a distinct amber 'unpaid' variant; BookingsTable maps status='unpaid' to the 'Unpaid' label and casts it through all three badge render sites (desktop column, mobile card, detail panel)"
    requirement: "ABND-03"
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#BookingsTable unpaid status — Phase 62 ABND-03 > desktop: renders the Unpaid badge label for a status=\"unpaid\" row"
        status: pass
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#BookingsTable unpaid status — Phase 62 ABND-03 > mobile: renders the Unpaid badge label for a status=\"unpaid\" card"
        status: pass
    human_judgment: false
  - id: D2
    description: "In the default 'All' view, an unpaid row/card carries a light amber tint distinguishing it from confirmed rows, without being hidden"
    requirement: "ABND-03"
    verification: []
    human_judgment: true
    rationale: "Visual tint adequacy (does the amber read clearly against the dark theme, is it distinct enough from hover/expanded states in practice) is a design-judgment call the automated render tests don't assert on computed style contrast — worth a human glance at the live admin UI."
  - id: D3
    description: "An 'Unpaid' filter chip, independent of the trip-type chips, drives GET's status query param; GET whitelists and threads it to admin_search_bookings as p_status (null when absent or unrecognized)"
    requirement: "ABND-04"
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#clicking the Unpaid chip fetches with status=unpaid; clicking it again returns to all"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 8: status=unpaid passes p_status=\"unpaid\" to rpc (D-08, ABND-04)"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 9: no status param passes p_status=null to rpc"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 10: an unknown status value is whitelisted away — p_status=null"
        status: pass
    human_judgment: false
  - id: D4
    description: "Admin PATCH accepts unpaid->confirmed and unpaid->cancelled (200); rejects unpaid->completed and any manual transition INTO unpaid (422); unpaid entry present in both VALID_TRANSITIONS maps"
    requirement: "ABND-04"
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 9: returns 200 for valid transition (unpaid -> confirmed)"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 10: returns 200 for valid transition (unpaid -> cancelled)"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 11: returns 422 for invalid transition (unpaid -> completed)"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings.test.ts#Test 12: returns 422 for a manual transition INTO unpaid"
        status: pass
    human_judgment: false
  - id: D5
    description: "The live admin_search_bookings RPC actually accepts and filters on p_status once migration 054 is applied"
    verification: []
    human_judgment: true
    rationale: "This plan wires the GET handler to pass p_status against a mocked RPC only (per the plan's Note); the RPC itself gains the parameter in migration 054, authored + applied in 62-04. Live-DB filtering behavior cannot be verified until then."

duration: 25min
completed: 2026-08-20
status: complete
---

# Phase 62 · Plan 03: Admin Unpaid Follow-up Surface Summary

**Unpaid bookings now get a distinct amber "Unpaid" badge and row tint in the admin list, a dedicated "Unpaid" filter chip independent of trip-type, and a double-gated unpaid→confirmed/unpaid→cancelled transition — turning the captured unpaid rows from 62-01/62-02 into a usable revenue-recovery queue.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-20
- **Tasks:** 2 (both `type="auto" tdd="true"`, no checkpoints)
- **Files modified:** 6 modified, 1 created
- **Commits:** 3 (`5dfa013`, `a38359c`, `f65fed2`)

## Accomplishments

- **Badge + tint (D-03, D-09, ABND-03):** `StatusBadge.tsx` gained an `unpaid` variant (`#f59e0b` amber, distinct from all 7 existing variants including the nearest warm-toned `pending`/`on_location`). `BookingsTable.tsx`'s `STATUS_LABELS` maps `unpaid → 'Unpaid'`; all three `StatusBadge` cast sites (desktop status column, mobile card, expanded detail panel) accept `'unpaid'`. Unpaid rows/cards carry a light `rgba(245,158,11,0.06)` amber tint in the default "All" view on both desktop and mobile, falling through to the existing hover/expanded background so interaction affordance is preserved. Rows are never hidden.
- **Filter chip + p_status threading (D-08, ABND-04):** A new `statusFilter` state and "Unpaid" chip sit alongside the existing trip-type chips in `BookingsTable.tsx` — a genuinely separate filter dimension (its own state, its own query param) that coexists with `tripType`. `fetchBookings` sends `status=unpaid` when active. The GET handler in `app/api/admin/bookings/route.ts` reads `status`, whitelists it against a `KNOWN_STATUSES` set (all 8 status values), and threads it as `p_status` to the `admin_search_bookings` RPC call — an unrecognized value silently falls back to `null` (no filter) rather than being forwarded raw or rejected with an error.
- **Double-gated transitions (D-04, D-10):** `unpaid: ['confirmed', 'cancelled']` added to the inline server-enforced `VALID_TRANSITIONS` in `app/api/admin/bookings/route.ts` (actually gates the PATCH) and to `lib/booking-transitions.ts`'s `VALID_TRANSITIONS` (flows into `UI_TRANSITIONS` via the existing spread, so the admin status dropdown offers Confirmed/Cancelled from an unpaid row). The Zod `bookingPatchSchema` status enum accepts `'unpaid'`. No transition INTO `unpaid` is permitted from a manual PATCH in either map — `unpaid` is reached only by the capture write from 62-01/62-02.

## Task Commits

1. **Task 1: StatusBadge unpaid variant + BookingsTable badge, label, and 'All'-view row tint** - `5dfa013` (feat)
2. **Task 2: Unpaid filter chip + GET p_status threading + PATCH unpaid transitions in both maps** - `a38359c` (feat)
3. **Test disambiguation + chip-toggle coverage** (deviation follow-up, same task) - `f65fed2` (test)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `components/admin/StatusBadge.tsx` — `unpaid` variant added to the union + `variantStyles` (amber hex)
- `components/admin/BookingsTable.tsx` — `STATUS_LABELS['unpaid']`, 3 badge cast sites widened, desktop `<tr>` + mobile card row tint, `statusFilter` state + "Unpaid" chip, `fetchBookings` threading
- `lib/booking-transitions.ts` — `VALID_TRANSITIONS.unpaid = ['confirmed', 'cancelled']`
- `app/api/admin/bookings/route.ts` — `KNOWN_STATUSES` whitelist, GET `p_status` threading, PATCH Zod enum + inline `VALID_TRANSITIONS` unpaid entry
- `tests/BookingsTable.test.tsx` — unpaid badge render tests (desktop + mobile, scoped to avoid ambiguity with the new chip) + chip-toggle fetch-param test
- `tests/admin-bookings.test.ts` — `p_status` threading tests (unpaid / null / whitelist-rejects-garbage), unpaid transition tests (→confirmed 200, →cancelled 200, →completed 422, confirmed→unpaid 422), plus the `getAdminUser` mock fix (see Deviations)
- `.planning/phases/62-abandoned-unpaid-booking-capture/deferred-items.md` — new: documents the pre-existing unrelated POST test failures left out of scope

## Decisions Made

- Amber hex `#f59e0b` (bg `#3a1a12`, border `rgba(245,158,11,0.3)`) chosen as visually distinct from the two nearest existing warm variants (`pending` `#fb923c`, `on_location` `#fbbf24`) while still reading as an amber/warning tone per D-03.
- `statusFilter` typed as `useState<string>` (not a narrower `'all' | 'unpaid'` union) to stay structurally compatible with the existing `handleFilterChange(setter: (v: string) => void)` helper without introducing a cast — mirrors how `tripType` itself is typed.
- GET's status whitelist treats any unrecognized value as "no filter" (`p_status: null`) rather than a 400 error, matching this handler's existing tolerant-parameter convention for `page`/`limit`/`tripType`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed a pre-existing stale `getAdminUser` test mock in `tests/admin-bookings.test.ts`**
- **Found during:** Task 2, running the plan's own required verification (`npx vitest run tests/admin-bookings.test.ts`)
- **Issue:** The file's `vi.mock('@/lib/supabase/server', ...)` factory only exported `createClient`. `app/api/admin/bookings/route.ts` imports `getAdminUser` directly from that module (moved there by a pre-Phase-62 commit, `9eee3c0`, well before this plan). Confirmed via `git stash` isolation that this broke **all 34 pre-existing tests** in the file (GET/PATCH/POST alike) even before any of this plan's code changes — a stale mock from an old refactor, unrelated to Phase 62's `unpaid` work but directly blocking this task's own acceptance criteria (which require the GET p_status and PATCH transition tests to pass).
- **Fix:** Added `getAdminUser: vi.fn(async () => { ... })` delegating to the existing `supabaseAuthStub`, using the exact pattern already established in `tests/admin-drivers.test.ts` and `tests/admin-assignment.test.ts`.
- **Files modified:** `tests/admin-bookings.test.ts`
- **Verification:** All GET/PATCH tests (39 of 41) now pass; the fix is test-only, no production code touched.
- **Committed in:** `a38359c` (Task 2 commit)

**2. [Scope boundary — documented, NOT auto-fixed] Two pre-existing unrelated POST test failures**
- **Found during:** Task 2, same verification run
- **Issue:** `POST /api/admin/bookings > Test 5` and `Test 6` fail with `TypeError: supabase.from(...).insert is not a function`. Confirmed via `git show 8d8e9e2:app/api/admin/bookings/route.ts` (the commit immediately before this plan's work) that the POST handler and its test mocks are byte-identical to the pre-Phase-62 state — this plan never touches the POST handler at all (it's Phase 64 / ANEW territory).
- **Action:** Left unfixed per the scope boundary rule (do not auto-fix pre-existing failures in code the current plan doesn't touch). Documented in `.planning/phases/62-abandoned-unpaid-booking-capture/deferred-items.md` for Phase 64 to pick up.
- **Files modified:** none (documentation only)
- **Committed in:** `a38359c` (deferred-items.md created alongside the Task 2 commit)

**3. [Rule 1 - Bug, test-only] Desktop "Unpaid" badge test became ambiguous after adding the filter chip**
- **Found during:** Task 2, after adding the "Unpaid" filter chip (which also renders the text "Unpaid")
- **Issue:** The Task 1 desktop test's `screen.getByText('Unpaid')` (inside a `waitFor`) could resolve against the filter chip's own "Unpaid" text before the row had even fetched/rendered — a false-positive risk once a second on-screen "Unpaid" text node existed, since `waitFor` stops retrying the moment a query call doesn't throw.
- **Fix:** Scoped the assertion to the specific row via `closest('tr')` + `within(...)`.
- **Files modified:** `tests/BookingsTable.test.tsx`
- **Verification:** Confirmed the fix by first reproducing the ambiguity with a standalone debug script (`screen.getAllByText('Unpaid')` returned 2 elements: the chip `<button>` and the badge `<span>`), then verifying the scoped query only matches the badge.
- **Committed in:** `f65fed2`

---

**Total deviations:** 3 (1 blocking auto-fixed, 1 out-of-scope documented/deferred, 1 test-only bug auto-fixed)
**Impact on plan:** The `getAdminUser` mock fix was necessary to make this plan's own required verification runnable at all — without it, zero admin-bookings tests could pass regardless of what this plan changed. The deferred POST failures and the chip-ambiguity fix are both fully contained to test code; no production behavior outside this plan's stated scope was altered.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — no external service configuration required. (Migrations 053/054 still need live application; that remains Plan 62-04's blocking-human task, unaffected by this plan. The live `admin_search_bookings` RPC does not yet accept `p_status` in production — this plan's GET handler passes it against a mocked RPC in tests only, per the plan's own Note.)

## Next Phase Readiness

- The admin follow-up surface (badge, tint, filter, transitions) is fully wired against the code paths from 62-01/62-02 and is ready for Plan 62-04's live-DB migration apply.
- Plan 62-04 must ensure the live `admin_search_bookings` RPC (migration 054) accepts and filters on `p_status`, matching what this plan's GET handler now sends.
- `tests/admin-bookings.test.ts`'s `getAdminUser` mock is now correct and reusable by any future test added to that file (no follow-up needed).
- Two pre-existing POST `/api/admin/bookings` test failures are logged in `deferred-items.md` for Phase 64 (ANEW) to pick up when it next touches that handler.

---
*Phase: 62-abandoned-unpaid-booking-capture*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk via `[ -f ]`; all 3 task commits (`5dfa013`, `a38359c`, `f65fed2`) confirmed in `git log --oneline`. Re-ran all task-level `<acceptance_criteria>` and the plan-level `<verification>` commands — all pass except the two pre-existing, out-of-scope `admin-bookings.test.ts` POST failures documented above and in `deferred-items.md`.
