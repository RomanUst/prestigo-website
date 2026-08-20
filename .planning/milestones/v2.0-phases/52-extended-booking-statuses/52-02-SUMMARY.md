---
phase: 52
plan: 02
subsystem: api-gnet-ui
status: complete
completed_at: 2026-05-04
self_check: PASSED
tags: [api, admin-ui, gnet, status-enum, tdd]
dependencies:
  requires: [040-migration-file, extended-status-check-constraint-applied]
  provides: [status-04-ext-complete, extended-zod-enum, extended-valid-transitions, gnet-mapping-extended, status-badge-extended]
  affects: []
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, Zod enum whitelist, VALID_TRANSITIONS double-gate, StatusBadge variant extension]
key_files:
  created: []
  modified:
    - prestigo/lib/gnet-client.ts
    - prestigo/app/api/admin/bookings/route.ts
    - prestigo/components/admin/StatusBadge.tsx
    - prestigo/components/admin/BookingsTable.tsx
    - prestigo/tests/gnet-status-push.test.ts
    - prestigo/tests/gnet-client.test.ts
decisions:
  - "VALID_TRANSITIONS in route.ts and BookingsTable.tsx kept in sync — both extended identically"
  - "confirmed keeps legacy path [completed, cancelled] AND gains assigned — Pitfall #5 avoided"
  - "assigned/en_route/on_location each allow cancelled abort path (defensive — driver no-show)"
  - "No new client emails introduced — flagKey lookup returns undefined for new statuses, email branch short-circuits"
  - "Live DB already verified by plan 52-01 MCP UPDATE chain — all 4 statuses accepted without check_violation (version 20260427130819)"
metrics:
  duration_minutes: 20
  tasks_completed: 6
  tasks_blocked: 0
  files_created: 0
  files_modified: 6
---

# Phase 52 Plan 02: Extended Booking Statuses — API, GNet, UI Summary

**One-liner:** TDD extension of GNet client mapping, PATCH route Zod enum + VALID_TRANSITIONS, StatusBadge variants, and BookingsTable UI — all three layers now accept assigned/en_route/on_location end-to-end.

## What Was Built

### Tasks Completed

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | [Wave 0] Update test files with failing tests (RED) | DONE | `9cf76bb` |
| 2 | Extend PRESTIGO_TO_GNET_STATUS map in gnet-client.ts | DONE | `5fec6a6` |
| 3 | Extend Zod enum + VALID_TRANSITIONS in route.ts | DONE | `340fa80` |
| 4 | Extend StatusBadge variant union + variantStyles | DONE | `a0cdb30` |
| 5 | Extend VALID_TRANSITIONS, STATUS_LABELS, 3 variant casts in BookingsTable | DONE | `51eeffd` |
| 6 | Full vitest suite + tsc + live DB verification | DONE | — (no file changes) |

---

### Task 1: TDD RED Baseline

**gnet-client.test.ts changes:**
- Added 3 new `it` assertions for `assigned/en_route/on_location` expecting `toBe('ASSIGNED')` / `toBe('EN_ROUTE')` / `toBe('ON_LOCATION')`
- Tests immediately failed (RED) — production map still had only 3 entries at commit time

**gnet-status-push.test.ts changes:**
- Removed `assigned/en_route/on_location` null assertions from D-01 guard
- Added 6 new Phase 52 tests:
  - `confirmed → assigned` triggers ASSIGNED push (200 + mockPushGnetStatus)
  - `assigned → en_route` triggers EN_ROUTE push
  - `en_route → on_location` triggers ON_LOCATION push
  - `on_location → completed` triggers COMPLETE push
  - `confirmed → en_route` invalid transition returns 422
  - `assigned → confirmed` backward transition returns 422

**RED result:** new test assertions failed — confirmed RED baseline before production code changes.

---

### Task 2: gnet-client.ts Map Extension

Extended `PRESTIGO_TO_GNET_STATUS` with three new entries:
```typescript
assigned:    'ASSIGNED',
en_route:    'EN_ROUTE',
on_location: 'ON_LOCATION',
```

`GnetStatus` type already included these values — no type union change needed.

Updated comment to reference Phase 52 STATUS-04-EXT (removed obsolete deferral note).

**After Task 2:** `gnet-client.test.ts` 17/17 GREEN.

---

### Task 3: route.ts Zod enum + VALID_TRANSITIONS

Extended `VALID_TRANSITIONS`:
```typescript
confirmed:   ['completed', 'cancelled', 'assigned'],  // legacy path preserved + assigned added
assigned:    ['en_route', 'cancelled'],
en_route:    ['on_location', 'cancelled'],
on_location: ['completed', 'cancelled'],
```

Extended `bookingPatchSchema` Zod enum to include `'assigned'`, `'en_route'`, `'on_location'`.

The `after()` GNet push branch required no changes — it already calls `prestigoToGnetStatus()` which now returns non-null for the three new statuses.

**After Task 3:** `gnet-status-push.test.ts` 15/15 GREEN (all Phase 52 tests pass).

---

### Task 4: StatusBadge Extension

Extended `variant` union to include `'assigned' | 'en_route' | 'on_location'`.

Added `variantStyles` entries with exact hex values from UI-SPEC:
- `assigned`: emerald teal (`#1a3a35` bg, `#34d399` fg)
- `en_route`: violet (`#2a1f3a` bg, `#a78bfa` fg)
- `on_location`: amber (`#3a2a0a` bg, `#fbbf24` fg)

---

### Task 5: BookingsTable Extension

- `VALID_TRANSITIONS`: mirrored exactly from API route (7 entries)
- `STATUS_LABELS`: added `assigned: 'Assigned'`, `en_route: 'En Route'`, `on_location: 'On Location'`
- 3 `StatusBadge` variant casts widened at lines 431, 740, 1217:
  - Extended from `'pending' | 'confirmed' | 'completed' | 'cancelled'`
  - To `'pending' | 'confirmed' | 'completed' | 'cancelled' | 'assigned' | 'en_route' | 'on_location'`

---

### Task 6: Full Verification

**vitest run (full suite) — executed 2026-05-04:**
```
Test Files  67 passed | 5 skipped (72)
Tests  750 passed | 10 skipped | 139 todo (899)
```
0 new failures. 0 regressions.

**gnet-specific tests:**
```
tests/gnet-client.test.ts    17 passed (17)
tests/gnet-status-push.test.ts  15 passed (15)
Total: 32/32
```

**tsc --noEmit:** exits 0, empty output.

**Live DB verification:** Confirmed via Plan 52-01 SUMMARY.md that migration 040 was applied (version `20260427130819`) and the live `bookings_status_check` constraint already accepts `assigned`, `en_route`, `on_location` without `check_violation`. Constraint definition verified:
```
CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'assigned'::text, 'en_route'::text, 'on_location'::text])))
```

---

## Test Count Summary

| File | Before Plan 52-02 | After Plan 52-02 | New Tests Added |
|------|-------------------|------------------|-----------------|
| `gnet-client.test.ts` | 14 (no new status assertions) | 17 | +3 (new mapping assertions) |
| `gnet-status-push.test.ts` | 9 | 15 | +6 (4 push-trigger + 2 invalid-transition) |

Legacy tests still passing:
- D-01 guard (pending → null) PASS
- D-03 guard (non-GNet booking) PASS
- D-05 guard (missing gnet_bookings row) PASS
- STATUS-01..04 (original Phase 50 push tests) PASS

---

## File Diff Stats

| File | Changes Description |
|------|---------------------|
| `lib/gnet-client.ts` | +3 map entries (assigned/en_route/on_location), updated comment |
| `app/api/admin/bookings/route.ts` | +3 VALID_TRANSITIONS entries, +3 Zod enum values |
| `components/admin/StatusBadge.tsx` | +3 variant union members, +3 variantStyles entries |
| `components/admin/BookingsTable.tsx` | VALID_TRANSITIONS mirrored (7 entries), STATUS_LABELS +3, 3 casts widened |
| `tests/gnet-client.test.ts` | +3 new `it` blocks for new status mappings |
| `tests/gnet-status-push.test.ts` | D-01 guard updated, +6 Phase 52 test cases |

---

## Deviations from Plan

None — plan executed exactly as written. All tasks completed in order, TDD RED→GREEN cycle confirmed, all acceptance criteria met.

## Known Stubs

None.

## Threat Flags

None — no new endpoints, auth paths, or schema changes introduced. Zod enum and VALID_TRANSITIONS act as double whitelist per threat T-52-04 (mitigated). Email side-effect for new statuses correctly blocked by `flagKey` undefined path per T-52-08 (mitigated).

## Self-Check: PASSED

- [x] `lib/gnet-client.ts` — `assigned: 'ASSIGNED'` present (commit `5fec6a6`, verified by grep)
- [x] `app/api/admin/bookings/route.ts` — `'on_location'` in Zod enum + VALID_TRANSITIONS (commit `340fa80`)
- [x] `components/admin/StatusBadge.tsx` — `on_location: { bg: '#3a2a0a'` present (commit `a0cdb30`)
- [x] `components/admin/BookingsTable.tsx` — 3 casts widened, STATUS_LABELS extended (commit `51eeffd`)
- [x] `tests/gnet-status-push.test.ts` — 6 Phase 52 tests present, D-01 guard updated (commit `9cf76bb`)
- [x] `tests/gnet-client.test.ts` — 3 new mapping assertions present (commit `9cf76bb`)
- [x] Full vitest suite 750/750 passed (67 files, 0 failures)
- [x] tsc --noEmit exits 0
- [x] Live DB constraint verified via Plan 52-01 MCP — all 7 status values accepted (version 20260427130819)
