---
phase: 87-status-service-driver-step-flow
verified: 2026-11-03T17:10:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - "app/api/driver/trip/[token]/progress/route.ts"
  - "lib/booking-events.ts"
  - "lib/booking-status-service.ts"
  - "lib/booking-status.ts"
  - "lib/booking-transitions.ts"
  - "lib/driver-trip-step.ts"
  - "lib/gnet-push.ts"
  - "lib/no-show.ts"
  - "supabase/migrations/084_booking_statuses_status_log.sql"
covered_digest: "v2:sha256:64e04e0a7a66470ed7b370ba07352b7d73912cc0993cdf0beddc041cb6c91db6"
behavior_unverified: 0
overrides_applied: 1
re_verification: false
gaps: []
deferred: []
suggested_overrides:
  - must_have: "For a GNet booking each driver step is pushed to GNet exactly once"
    reason: "The 'passenger on board' step is not pushed: GNet has no on_board status (GnetStatus = CONFIRMED|ASSIGNED|EN_ROUTE|ON_LOCATION|COMPLETE|CANCEL). Locked decision D-22 fallback: send nothing for on_board. Three of four driver steps (en route, on site, completed) are pushed exactly once."
    accepted_by: "owner"
    accepted_at: "2026-11-03"
human_verification:
  - test: "Real-phone production driver run on a test booking: open the trip link, run On my way -> I have arrived -> Passenger on board -> Complete trip, each with the confirm dialog"
    expected: "One slide-to-advance control per step; each step needs confirmation; the completed screen shows no amount; the booking row in admin shows En Route / On Location / On Board / Completed after a reload"
    why_human: "87-13 Task 3 steps 3-8 were deferred by the owner. Touch slide gesture, device layout and the live admin view cannot be checked by grep or unit tests."
  - test: "Double-tap / airplane-mode retry / second device on the same step"
    expected: "Second tap shows the latest step (200 replay or 409 'office has updated'), no second status_log row, no second GNet push"
    why_human: "Real network behavior and timing on a device; unit tests cover the server replay path only."
  - test: "Admin cancel racing a driver tap, using the dedicated Cancel button (not the status dropdown)"
    expected: "Exactly one applies. The loser sees a clear message."
    why_human: "Needs two live sessions. Code review shows the Cancel button surfaces the raw string 'status_conflict' (see WR below), so a person should judge whether that is acceptable."
  - test: "E2 attribution, E4 in-app browsers (WhatsApp/Telegram), VoiceOver, 200% zoom on the trip page"
    expected: "Page renders, dialog is focus-trapped and announced, controls stay reachable"
    why_human: "Device and assistive-technology checks, deferred by the owner (87-13 Task 3)."
  - test: "Owner decision: accept that the on_board step is not pushed to GNet (suggested override above), or choose to send a free-form status"
    expected: "Override recorded in this file, or a follow-up plan opened"
    why_human: "ROADMAP criterion 4 says 'each driver step'; the implementation follows locked decision D-22, which narrows it."
---

# Phase 87: Status Service and Driver Step Flow Verification Report

**Phase Goal:** Every booking status change goes through one trusted service, and the driver moves a trip forward one strict step at a time from the trip link while the admin sees each step immediately.
**Verified:** 2026-11-03
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

All five roadmap criteria are implemented and wired in the code. The 10 phase test files I re-ran pass (370 tests). No criterion is FAILED. The status is `human_needed` rather than `passed` because (a) the owner deferred the real-phone production UAT, and (b) one criterion is narrower than its roadmap wording (GNet `on_board`). The six code-review warnings are listed below. None is a blocker for the five criteria. Two of them (WR-03, WR-05) should be fixed soon because they touch the GNet/partner intent.

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | Trip link shows one "next step" button; strict order en route, on site, on board, completed | VERIFIED | `lib/booking-status.ts`: `NEXT_STEP` map (assigned->en_route, en_route->on_site, on_location->on_board, on_board->completed), `nextStepFor()` returns one step or null. `TripScreen.tsx` renders one `SlideToAdvance` driven by `view.nextStep`, labels from `DRIVER_STEP_LABEL`. Server enforces order (`driverTripStep` step 3: `step !== nextStepFor(status)` -> 409). Device feel is in human_verification. |
| 2 | Each step changes status in admin immediately; skipped step rejected; repeat tap harmless | VERIFIED | Route -> `driverTripStep` -> `advanceBookingStatus` -> RPC `advance_booking_status` writing `bookings.status` directly (reload shows it). `StatusBadge` and `BookingsTable` handle `on_board`/`no_show`. Replay branch: `booking.status === DRIVER_STEP_TARGET[step]` returns 200 `replay:true` with no write; skipped step returns 409 `step_conflict`. Trigger log row only on a real change; unique partial index allows one `completed` row. Tests: `driver-trip-step.test.ts`, `driver-trip-progress.test.ts`. |
| 3 | One status service with compare-and-set; concurrent cancel + driver tap -> exactly one applies, loser rejected with clear message; every change logged with actor; admin transitions unchanged | VERIFIED (with warnings) | RPC does `UPDATE ... WHERE id AND status = p_from` in one statement; trigger `bookings_status_log` logs every writer (actor via transaction-local GUCs, legacy writers as `system`). `tests/status-writers-gate.test.ts` fails on any direct `bookings.status` writer outside a 4-file allowlist and pins the RPC to one caller file. Admin PATCH, cancel, assign and no-show routes call `advanceBookingStatus`. Parity tests for admin behavior pass (`booking-status-service.test.ts`). Warnings: WR-01 (refund before CAS), cancel button shows raw `status_conflict` text, WR-05 (legacy writers). Live smoke of CAS (stale `p_from` rejected) recorded in 87-02-SUMMARY; true two-session concurrency rests on Postgres READ COMMITTED re-evaluation and is in human_verification. |
| 4 | GNet booking: each driver step pushed exactly once; marked partner so no hold/capture/no-show charge can apply | VERIFIED (documented deviation) | `pushGnetForTransition` claims `gnet_bookings.last_push_status` conditionally before calling GNet; replay of a step re-offers the push but claims nothing after success. Tests `gnet-push.test.ts`, `gnet-status-push.test.ts`. Mapping: en_route->EN_ROUTE, on_location->ON_LOCATION, completed->COMPLETE. **`on_board` and `no_show` map to nothing** (D-22 fallback; `GnetStatus` has no such value; asserted in `gnet-push.test.ts:233`). Partner marker: `isPartnerBooking` (`booking_source === 'gnet'`), `assertMoneyEligible` throws `PartnerBookingMoneyError`, `emitBookingCompleted` carries `partner`. No hold/capture/no-show-charge code exists in `app/` or `lib/` yet (grep for capture/off_session: none), so nothing can charge a GNet booking today. `assertMoneyEligible` has no production callers yet; enforcing it is a written hand-off obligation for Phases 88/89 (`lib/booking-events.ts` header). |
| 5 | "Completed" asks the driver to confirm, fires exactly one completion event for Phase 88, driver never sees/enters an amount | VERIFIED | `TripScreen` opens `ConfirmStepDialog` (`isFinal` for completed) before `postProgress`; initial focus on "Not yet". Request schema is `.strict()` `{step}` / `{note}` / `{action}` only, no amount. `page.tsx` does not select `amount_eur` (nulls it). `completed` event: `advanceBookingStatus` calls `emitBookingCompleted` inside `after()` only when the RPC applied the move to `completed`, any actor. Durable facts: `bookings.completed_at` (set only on the applying call) and the unique `completed` row in `booking_status_log`. |

**Score:** 5/5 truths verified (0 behavior-unverified; criterion 4 carries a suggested override for `on_board`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/084_booking_statuses_status_log.sql` | CHECK with 10 statuses, `completed_at`, status log + trigger, CAS RPC, no-show RPC, wait settings | VERIFIED | Read in full: all present, `search_path = ''`, deny-all RLS, privileges revoked from anon/authenticated. Live per orchestrator (smoke SMOKE_OK, privilege matrix re-checked). |
| `lib/booking-status.ts` | Single status vocabulary, step map, partner helpers | VERIFIED | Parity-tested against the migration CHECK. |
| `lib/booking-transitions.ts` | Transition map incl. on_board, no_show terminal | VERIFIED | |
| `lib/booking-status-service.ts` | One writer with CAS, side-effect profiles | VERIFIED | Wired from admin PATCH, cancel, assign, no-show, driver step. |
| `lib/driver-trip-step.ts` | Strict-step driver logic, never writes `bookings` directly | VERIFIED | Only direct write is the `trip_progress` mirror and the note. |
| `app/api/driver/trip/[token]/progress/route.ts` | Token-gated route, rate limit, strict schema | VERIFIED | UUID check, `enforceMaxBody`, live re-lookup per request. |
| `lib/gnet-push.ts` | Idempotent claim-then-push | VERIFIED | At-most-once across a crash (IN-04). |
| `lib/booking-events.ts` | Single completion hook | VERIFIED | Records and logs only; Phase 88 consumer to be added here. |
| Driver UI (`TripScreen`, `SlideToAdvance`, `ConfirmStepDialog`, `TripCompleted`, `InvalidTripLinkView`) | Single control, confirm, no amount | VERIFIED | Component tests pass (`driver-trip-screen.test.tsx`). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| progress route | status service | `driverTripStep` -> `advanceBookingStatus` (actor driver) | WIRED | Route never touches `bookings`. |
| status service | database | RPC `advance_booking_status` with `p_from` | WIRED | Single RPC caller file enforced by test. |
| RPC | status log | `AFTER UPDATE OF status` trigger | WIRED | Logs every writer; unique `completed` row. |
| status service | GNet | `pushGnetForTransition` in `after()` | WIRED | Gated by `booking_source = 'gnet'`. |
| status service | completion hook | `emitBookingCompleted` in `after()` on applied `completed` | WIRED | |
| admin routes | status service | PATCH / cancel / assign / no-show | WIRED | `expected_status` passed on PATCH and no-show. |
| TripScreen | progress route | `postProgress({ step })` after confirm | WIRED | 409/400/429 handled; server truth via `router.refresh()`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| TripScreen | `view.status` / `nextStep` | `page.tsx` live join on `driver_assignments` + `bookings`, `buildTripView` | Yes | FLOWING |
| BookingsTable | `booking.status` | `bookings` rows | Yes | FLOWING |
| TripCompleted | `completedAt` | 200 body from RPC row | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Status service, driver step, driver route, GNet push, writer gate, vocabulary, migration contract, no-show, trip screen | `npx vitest run` on the 10 matching test files | 10 files, 370 tests passed | PASS |
| Whole suite (given) | orchestrator run | 8507 passed; 3 earlier failures fixed in 2318555b / ab527dbd | PASS (not re-run) |
| Type check (given) | `npx tsc --noEmit` | only the 8 baseline errors in `tests/` | PASS (not re-run) |

### Probe Execution

SKIPPED: no `scripts/*/tests/probe-*.sh` declared by this phase. The live smoke is `87-02-smoke.sql`, run by the orchestrator (SMOKE_OK).

### Requirements Coverage

All six IDs are claimed by plans and map to Phase 87 in REQUIREMENTS.md. No orphans (REQUIREMENTS.md maps no other ID to Phase 87).

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| PAYF-02 | 87-01, 02, 03, 04, 05, 13 | All status changes through one service with compare-and-set | SATISFIED | Truth 3. Legacy system writers (Stripe webhook, GNet farm-in cancel, payment-link, `lib/supabase.ts` reconcilers) remain direct writes by design, allowlisted and trigger-logged; see WR-05. |
| DRV-01 | 87-02, 06, 08, 09, 10, 11, 12, 13, 14 | Single next-step button, strict order | SATISFIED | Truth 1 (device check pending). |
| DRV-02 | 87-02, 03, 04, 05, 06, 08, 09, 11, 12, 13 | Step updates status in admin immediately | SATISFIED | Truth 2 (live admin view pending). |
| DRV-03 | 87-03, 08, 10, 13, 14 | Completed asks confirmation, triggers capture; no amount | SATISFIED for Phase 87 scope | Truth 5. REQUIREMENTS.md line 187 assigns the capture itself to Phase 88 (HOLD-04). |
| DRV-04 | 87-08, 10, 13 | Skipped step rejected; repeat tap harmless | SATISFIED | Truth 2. |
| DRV-05 | 87-01, 02, 03, 07, 08, 13 | GNet steps pushed without duplicates; no hold/capture/no-show charge | SATISFIED with deviation | Truth 4: `on_board` not pushed (D-22); money exclusion is a marker plus a Phase 88/89 hand-off, because no money path exists yet. |

REQUIREMENTS.md still shows these six as `Pending`; the orchestrator should tick them after accepting this report. Note 87-13-SUMMARY deliberately left `requirements-completed: []` until UAT.

### Code Review Findings Weighed (87-REVIEW.md, 0 critical / 6 warnings)

| ID | Effect on goal | Verdict |
|----|----------------|---------|
| WR-03 (status emails lack a partner guard) | A driver "Complete trip" tap on a GNet booking sends the post-trip email to the partner passenger or to `noreply@gnet.local`. This is customer mail, not money, so criterion 4's literal text (push once, no hold/capture/no-show charge) still holds. It does go against the spirit of D-05 (partner bookings carry no Prestigo customer flow), it is live in production now, and it can hurt sender reputation. | WARNING. Fix soon: skip the email block when `isPartnerBooking(current)` or the recipient ends in `@gnet.local`. |
| WR-05 (legacy writers can overwrite completed/no_show) | GNet farm-in CANCEL does `update({status:'cancelled'})` with no status predicate and can flip a completed or no_show row. It is logged as `system`, so criterion 3's "every change logged" holds, but D-09 terminal intent does not. `completed -> cancelled` already happened before this phase. `no_show` is new. | WARNING. Add a `.not('status','in','(completed,no_show,cancelled)')` predicate to the GNet cancel; decide on refund paths. |
| WR-01 (refund before CAS) | When the driver wins the race, the admin gets 409 `status_conflict` plus `refund_id`, but the money is already refunded and the booking stays live. "Exactly one applies" is true for the status; the side effect is not rolled back. Separately, the Cancel button's error handler shows the raw text `status_conflict` instead of the UI-SPEC copy that the status dropdown and no-show modal use. | WARNING against criterion 3's "clear message" for the cancel path. Retry-or-explicit-message fix as in the review. |
| WR-02 (edit/assign ignore terminal no_show) | `app/api/admin/bookings/route.ts:370` gate misses `no_show`; assign route has no terminal check. Not part of the five criteria. | WARNING. |
| WR-04 (operator confirm skips wait threshold) | Latent until Phase 89 charges no-shows. | WARNING, hand-off note for Phase 89. |
| WR-06 (settings PATCH unguarded `request.json()`) | Returns 500 on malformed JSON. | WARNING. |

IN-01 to IN-07 are informational. IN-07 (EspoCRM enum): the owner confirmed the field sync ("ready to merge"), so that deployment-order risk is closed.

### Anti-Patterns Found

No `TBD`, `FIXME` or `XXX` markers in the 130 app/lib/components/supabase/infra files changed by the phase. The writer-gate test is the guard against new direct status writers. No hard-coded stub returns found in the verified paths.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/admin/BookingsTable.tsx` | 1323-1341, 2939 | Cancel button throws `data.error` ('status_conflict') into `cancelError` | Warning | Not a human-readable message on a lost race |
| `app/api/gnet/farmin/route.ts` | 236-243 | Unpredicated `status: 'cancelled'` update | Warning | WR-05 |

### Release state note

`origin/main` contains the phase code (PR #83 merge, 9e71bcdc). The local branch is 6 commits ahead of `origin/main`; five are docs and the test-path and SEO-copy fixes (2318555b, ab527dbd), plus the review report. No phase-87 source change is unmerged.

### Human Verification Required

1. **Real-phone driver run (87-13 Task 3 steps 3-8).** Test: run all four steps on a test booking from a phone, with confirmation each time. Expected: one control per step, completed screen shows no amount, admin shows En Route / On Location / On Board / Completed after a reload. Why human: touch gesture, device layout, live admin view.
2. **Retap and offline retry.** Test: double-tap and airplane-mode retry on a step. Expected: latest step shown, one log row, one GNet push. Why human: real network timing.
3. **Cancel-button race.** Test: admin Cancel while the driver taps next step. Expected: exactly one applies and a person-readable message appears. Why human: needs two live sessions; the Cancel button message is currently the raw `status_conflict`.
4. **E2 attribution, E4 in-app browsers, VoiceOver, 200% zoom.** Deferred by the owner. Why human: device and assistive technology.
5. **Owner decision on GNet `on_board`.** Accept the suggested override in the frontmatter, or open a follow-up to send a free-form status. Why human: product call; ROADMAP wording says "each driver step".

### Gaps Summary

No blocking gaps. Every roadmap criterion is backed by code, wiring and passing tests. Remaining work is the deferred device UAT, one owner decision on the `on_board` GNet push, and the review warnings. Recommended order: WR-03 (partner emails, live now), WR-05 and WR-01/cancel-message (criterion 3 and D-09 intent), then WR-02, WR-04, WR-06.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
