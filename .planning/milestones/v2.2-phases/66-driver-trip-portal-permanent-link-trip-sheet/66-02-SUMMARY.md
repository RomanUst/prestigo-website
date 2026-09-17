---
phase: 66-driver-trip-portal-permanent-link-trip-sheet
plan: 02
subsystem: api
tags: [nextjs, supabase, resend, lucide-react, driver-portal, security]

# Dependency graph
requires:
  - phase: 66-driver-trip-portal-permanent-link-trip-sheet
    provides: "trip_token column, isTripLinkValid predicate, and /driver/trip/[token] route (Plan 01)"
provides:
  - "DriverAssignmentEmailData.tripUrl + VIEW TRIP SHEET CTA delivering the permanent trip link to the driver by email (D-10a)"
  - "trip_token threaded through assign POST insert (email-only delivery, SEC-18-safe) and exposed on assignment GET (admin read surface)"
  - "Copy Trip Link control in DriverAssignmentSection giving the dispatcher a one-click copy of the same permanent link (D-10b)"
affects: [67-driver-trip-portal-status-marking]

# Actuals (#2632)
actuals:
  tokens: 4511
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Third CTA anchor appended to an existing multi-button email block, reusing the exact ACCEPT TRIP gold inline-style (not the red DECLINE TRIP style), same escapeHtml(data.field) convention as every other interpolated value"
    - "Copy-to-clipboard component pattern: try/await navigator.clipboard.writeText → 'Copied!' state-swap for 2s on success; catch → read-only selectable <input> fallback with an explicit failure message, never a silent no-op"

key-files:
  created: []
  modified:
    - lib/email.ts
    - app/api/admin/bookings/[id]/assign/route.ts
    - app/api/admin/bookings/[id]/assignment/route.ts
    - components/admin/DriverAssignmentSection.tsx
    - tests/admin-assignment.test.ts
    - tests/DriverAssignmentSection.test.tsx

key-decisions:
  - "Assignment.trip_token kept required (string, not optional) to match the plan's Assignment interface contract; the one code path that cannot supply it (the degraded POST-fallback object used only when the immediate post-assign GET re-fetch itself fails) sets trip_token: '' and the Copy Trip Link button is conditionally hidden on a falsy trip_token, rather than loosening the type — preserves a single non-nullable field for every normal (GET-sourced) render path."
  - "VIEW TRIP SHEET CTA placed in its own centered div directly below the existing ACCEPT TRIP / DECLINE TRIP button row rather than inside that flex row, so it visually reads as a secondary/tertiary action, not a third option in the same primary decision (matches D-10a intent without editing the accept/decline block's layout)."

patterns-established:
  - "SEC-18 token-omission discipline reaffirmed for a second column: trip_token follows the exact same rule as the existing single-use token — selected into the insert for server-side email URL construction, never placed in the POST JSON response body, and instead surfaced to the browser only via a dedicated read (GET) endpoint."

requirements-completed: [DTRIP-01, DTRIP-07]

coverage:
  - id: D1
    description: "Driver assignment email includes a permanent trip-sheet link as {siteUrl}/driver/trip/{trip_token}, rendered as a neutral-gold 'VIEW TRIP SHEET' CTA (escapeHtml-wrapped) alongside the unchanged ACCEPT TRIP / DECLINE TRIP buttons and the '48 hours' note"
    requirement: "DTRIP-01"
    verification:
      - kind: unit
        ref: "tests/admin-assignment.test.ts#Test 5: calls logEmail and sendDriverAssignmentEmail (asserts tripUrl matches /driver/trip/)"
        status: pass
      - kind: other
        ref: "grep -n VIEW TRIP SHEET lib/email.ts (exactly one match) + grep -c ACCEPT TRIP|DECLINE TRIP lib/email.ts unchanged (2 button lines + 1 pre-existing comment)"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/admin/bookings/[id]/assign selects trip_token on the insert and threads tripUrl into the email; the raw trip_token is never present in the POST JSON response body (SEC-18 discipline)"
    requirement: "DTRIP-01"
    verification:
      - kind: unit
        ref: "tests/admin-assignment.test.ts#Test 3: returns 201 with assignment object (asserts json.assignment lacks trip_token)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/admin/bookings/[id]/assignment returns trip_token in the assignment object for the admin copy-link control"
    requirement: "DTRIP-01"
    verification:
      - kind: unit
        ref: "tests/admin-assignment.test.ts#Test 7: returns 200 with latest assignment (asserts json.assignment.trip_token)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Copy Trip Link control in DriverAssignmentSection's assigned branch copies {origin}/driver/trip/{trip_token} via navigator.clipboard.writeText, swaps to 'Copied!' for ~2s on success, and falls back to a selectable read-only field with an explicit failure message on rejection; never renders for terminal bookings (component already returns null)"
    requirement: "DTRIP-01"
    verification:
      - kind: unit
        ref: "tests/DriverAssignmentSection.test.tsx#renders Copy Trip Link in assigned mode and copies the trip URL (D-10b)"
        status: pass
      - kind: unit
        ref: "tests/DriverAssignmentSection.test.tsx#falls back to a selectable text field when clipboard copy fails (D-10b)"
        status: pass
      - kind: unit
        ref: "tests/DriverAssignmentSection.test.tsx#returns null when bookingStatus is completed/cancelled (D-01, pre-existing, unchanged)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The existing accept/decline flow is unchanged: /api/driver/respond accept, decline, invalid_token (expired/used/unknown) tests all remain green (DTRIP-07 regression)"
    requirement: "DTRIP-07"
    verification:
      - kind: unit
        ref: "tests/admin-assignment.test.ts#DRIVER-04: POST /api/driver/respond (6 tests: accepted, declined, expired, used, unknown, decline-notification)"
        status: pass
    human_judgment: false

duration: ~5min (active execution)
completed: 2026-08-31
status: complete
---

# Phase 66 Plan 02: Driver Trip Portal — Permanent Link & Trip Sheet Summary

**Permanent trip link delivered to both humans who need it — a VIEW TRIP SHEET email CTA for the driver and a Copy Trip Link control for the dispatcher — with trip_token routed through the assign insert (email-only) and the assignment GET (admin-only), while the existing accept/decline flow stays byte-for-byte unchanged**

## Performance

- **Duration:** ~5 min active execution
- **Started:** 2026-08-31T23:25:00Z (approx.)
- **Completed:** 2026-08-31T23:34:29Z
- **Tasks:** 3 (all `type="auto" tdd="true"`, no checkpoints)
- **Files modified:** 6

## Accomplishments
- `lib/email.ts` — `DriverAssignmentEmailData.tripUrl` (required field) + a VIEW TRIP SHEET CTA anchor, `escapeHtml`-wrapped like every other interpolated value, placed below the unchanged ACCEPT TRIP / DECLINE TRIP button row
- `app/api/admin/bookings/[id]/assign/route.ts` — insert now selects `trip_token`, builds `tripUrl` from it, and threads it into `sendDriverAssignmentEmail`; the SEC-18 comment and response shape are preserved (`trip_token` never reaches the POST response body)
- `app/api/admin/bookings/[id]/assignment/route.ts` — GET select now returns `trip_token`, the only change needed for the admin copy-link control to have data
- `components/admin/DriverAssignmentSection.tsx` — a "Copy Trip Link" control (Copy lucide icon, 44px, copper-accent border) next to the driver name/status badge in the assigned branch, with a `navigator.clipboard.writeText` success state ("Copied!" for 2s) and a selectable-text-field failure fallback

## Task Commits

1. **Task 1: Add the permanent trip link to the assignment email** — `e235a3e` (feat, TDD)
2. **Task 2: Thread trip_token through the assign insert + expose it on the assignment GET** — `56c6047` (feat, TDD)
3. **Task 3: Admin "Copy Trip Link" control in DriverAssignmentSection (D-10b)** — `f214a28` (feat, TDD, includes the Rule 1 fallback-object fix)

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: all three tasks carried `tdd="true"`. Each task's test additions were written and run alongside the implementation edit in the same commit (no separate RED-only commit was created for this plan, since each task's acceptance criteria were verified via `grep` + `vitest run` + `tsc --noEmit` inline before committing) — matching this plan's own convention of one feat commit per task with tests included._

## Files Created/Modified
- `lib/email.ts` — `DriverAssignmentEmailData.tripUrl`; VIEW TRIP SHEET CTA in `buildDriverAssignmentHtml`
- `app/api/admin/bookings/[id]/assign/route.ts` — insert select gains `trip_token`; new `tripUrl` local; `sendDriverAssignmentEmail` call gains `tripUrl`
- `app/api/admin/bookings/[id]/assignment/route.ts` — GET select gains `trip_token`
- `components/admin/DriverAssignmentSection.tsx` — `Assignment.trip_token`; new `handleCopyTripLink` + `copyState`; new "Copy Trip Link" control with Copied!/fallback states; POST-fallback assignment object fixed to satisfy the now-required `trip_token` field
- `tests/admin-assignment.test.ts` — `trip_token` added to all assign-insert mock fixtures; new assertions for tripUrl threading, POST-response trip_token omission, and assignment-GET trip_token exposure; DRIVER-04 accept/decline/invalid_token tests untouched
- `tests/DriverAssignmentSection.test.tsx` — two new tests: Copy Trip Link renders + copies in assigned mode, and the clipboard-failure fallback field

## Decisions Made
- Kept `Assignment.trip_token` as a required `string` (not optional) to match the plan's stated interface contract for the normal (GET-sourced) render path. The one code path that cannot supply a real token — the degraded POST-fallback object built only when the immediate post-assign GET re-fetch itself fails — sets `trip_token: ''` and the Copy Trip Link button is hidden whenever `trip_token` is falsy, rather than making the field optional everywhere.
- Placed the VIEW TRIP SHEET CTA in its own centered `<div>` directly below the existing accept/decline button row (not inside that same flex row), so it reads as a secondary action rather than a third choice alongside ACCEPT/DECLINE — no edits needed inside the accept/decline block itself, keeping DTRIP-07's "unchanged" guarantee literal at the DOM-structure level too.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a `tsc --noEmit` type error in the POST-success fallback assignment object**
- **Found during:** Task 3 (Copy Trip Link control)
- **Issue:** Making `Assignment.trip_token` a required field (per the plan's interface spec) broke type-checking on the pre-existing degraded-fallback branch in `handleAssign` — the object built when the POST succeeds but the immediate re-fetch GET fails did not (and structurally cannot) include `trip_token`, since the POST response never carries it (SEC-18).
- **Fix:** Set `trip_token: ''` on that fallback object with an explanatory comment, and gated the Copy Trip Link button's render on `assignment.trip_token` being truthy so the control simply doesn't appear until a page reload supplies the real token via the GET.
- **Files modified:** `components/admin/DriverAssignmentSection.tsx`
- **Verification:** `npx tsc --noEmit` clean (excluding the 3 pre-existing unrelated test-file errors documented in Plan 01's SUMMARY); full `npx vitest run` 1115 passed / 0 failed.
- **Committed in:** `f214a28` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Necessary for `tsc --noEmit` correctness; no scope creep, no behavior change to any test-covered path.

## Issues Encountered

None beyond the Rule 1 fix above.

## User Setup Required

None — no external service configuration required. `NEXT_PUBLIC_SITE_URL` (used to build `tripUrl` in the assign route) is an existing env var already relied on by the accept/decline URL construction in the same code block.

## Next Phase Readiness
- Plan 66-01 and 66-02 together complete DTRIP-01 (permanent link delivery, both channels) and DTRIP-07 (proven non-regression of accept/decline) for Phase 66.
- Full test suite green: 101 files, 1115 passed, 0 failed, 10 skipped, 139 todo.
- `npx tsc --noEmit` clean for every file this plan touched.
- Phase 67 (driver trip-progress status marking) can build directly on `/driver/trip/[token]` (Plan 01) and the now-fully-wired `trip_token` delivery surfaces (this plan) without further plumbing changes.
- Live visual verification of the VIEW TRIP SHEET email CTA and the admin Copy Trip Link control (real browser click, real clipboard write) was not exercised in this plan — same treatment as Plan 01's deferred live-map check — recommended before/at `/gsd-verify-work`.

---
*Phase: 66-driver-trip-portal-permanent-link-trip-sheet*
*Completed: 2026-08-31*

## Self-Check: PASSED

- FOUND: `lib/email.ts`
- FOUND: `app/api/admin/bookings/[id]/assign/route.ts`
- FOUND: `app/api/admin/bookings/[id]/assignment/route.ts`
- FOUND: `components/admin/DriverAssignmentSection.tsx`
- FOUND: `tests/admin-assignment.test.ts`
- FOUND: `tests/DriverAssignmentSection.test.tsx`
- FOUND commit: `e235a3e`
- FOUND commit: `56c6047`
- FOUND commit: `f214a28`
