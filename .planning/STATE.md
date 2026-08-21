---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Admin Booking Management & Payment Recovery
current_phase: 63
current_phase_name: Admin Booking Editing + Change Notification
status: executing
stopped_at: Completed 63-02-PLAN.md
last_updated: "2026-08-21T13:16:16.960Z"
last_activity: 2026-08-21
last_activity_desc: Phase 63 execution started
state_head: c009c72578011167876b882ccf494641d1704987
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 9
  completed_plans: 6
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-10)

**Core value:** Every page must convert a visitor into a confirmed booking or qualified lead without friction
**Current focus:** Phase 63 — Admin Booking Editing + Change Notification

## Current Position

Phase: 63 (Admin Booking Editing + Change Notification) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-08-21 — Phase 63 execution started

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.1 roadmap: ABND (abandoned/unpaid capture) is the foundation phase (62) — persists a booking row at the payment step and reconciles it in place on payment success (no duplicate insert). AEDIT (63) and ANEW (64) both depend on Phase 62's shared admin bookings surface / status vocabulary; ANEW-04 additionally reuses the reconcile-in-place webhook pattern for payment-link payments.
- v2.1 (user decision): ABND captures the booking as soon as the client reaches the payment step (before payment completes) — not just on abandonment detection — then reconciles the same row to paid on `payment_intent.succeeded`. No separate "abandonment" event/timeout needed for v2.1 (that's FOLLOW-01, deferred to v2).
- v2.1 (user decision): AEDIT-05 client notification is operator-controlled via an explicit "notify client" toggle at save time — not automatic on every edit.
- v2.1 phase order: 62 (ABND foundation) → 63 (AEDIT) → 64 (ANEW). 63 and 64 are independent of each other, both depend only on 62.
- v2.0 (57-01): TEXT + CHECK used for customer_profiles.account_type (not Postgres ENUM) — stays alterable, matches existing bookings status/source pattern.
- v2.0 (57-01): No DELETE RLS policy on customer_profiles — row removal via ON DELETE CASCADE from auth.users only.
- v2.0 (57-01): Migration 045 adds no RLS to bookings — deferred to Phase 60 (auth-in-checkout).
- v2.0: Customer auth reuses Supabase Auth (GoTrue) — same stack as admin; add Google + Apple OAuth. No new auth library.
- v2.0: Bookings stay anonymous-capable; add nullable `user_id` FK so guest checkout never breaks.
- v2.0: Existing booking wizard is already structurally Blacklane-like (6 steps) — redesign is visual + behavioural, preserve store (`lib/booking-store.ts`) and pricing APIs.
- v2.0: Dense analytics wiring (GA4 + Meta Pixel/CAPI + server GA4 in Stripe webhook + sessionStorage price snapshot) must survive the rebuild — TRACK-* requirements are guardrails.
- v2.0 roadmap: Phase 59 (booking redesign) is independent of 57/58 and can run in parallel with auth UI; Phase 61 is a dedicated end-to-end analytics verification gate.
- v2.0 (57-02): safeReturnTo() open-redirect guard: relative-only, rejects absolute URLs and // — used in both app/login/actions.ts and app/auth/callback/route.ts.
- v2.0 (57-02): NextResponse.redirect in callback uses explicit { status: 302 } — Next.js defaults to 307 which breaks OAuth/email confirmation redirects.
- v2.0 (57-02): signUpWithPassword upserts customer_profiles whenever data.user exists (not conditional on session) — idempotent via ignoreDuplicates in callback.
- [Phase ?]: Wave-0 TDD: NAV-02 test uses role=button+name=/account/i to distinguish account trigger from burger button
- [Phase ?]: Wave-0 TDD: deletePassenger/updatePassenger ownership tested via dual eq() call tracking with separate mockEqDelete/mockEqUpdate instances
- [Phase ?]: v2.0 (58-02): saved_passengers includes DELETE RLS policy (deliberate contrast with customer_profiles) + partial unique index WHERE is_default=true for DB-enforced single-default
- [Phase ?]: v2.0 (58-04): D-01 enforced — /account/trips makes no bookings query; trip history deferred to Phase 60
- [Phase ?]: v2.0 (58-05): Server actions in separate app/account/actions.ts — account mutations isolated from login actions
- [Phase ?]: v2.0 (59-03): EntryBar return expander conditionally mounts DOM children (not just CSS hide) to avoid duplicate label text
- [Phase ?]: v2.0 (59-03): begin_checkout relocated from BookingWizard to StickyBookingPanel (plan 59-04) per Pitfall 5
- [Phase 62]: 62-02: SELECT-then-INSERT-or-UPDATE attempt-keyed capture (not ON CONFLICT) — matches single-tab/sequential checkout traffic and Supabase-js onConflict cannot target the partial unique index's WHERE predicate
- [Phase 62]: 62-02: buildBookingRows widened with bookingType param (default 'confirmed') so round-trip capture reuses the same builder for unpaid rows without touching the existing confirmed-insert call site
- [Phase 62]: 62-03: statusFilter is a separate chip dimension from tripType (own state, own query param); GET status filter whitelisted against KNOWN_STATUSES before threading as p_status
- [Phase 62]: 62-03: unpaid double-gated in both VALID_TRANSITIONS maps (route.ts server + lib/booking-transitions.ts UI source), unpaid: [confirmed, cancelled] only, never manually into unpaid
- [Phase 63]: Phase 63 Plan 01: approved researched-shape as-is for booking_edit_audit_log (8 columns, text old/new_value, ON DELETE CASCADE, no RLS, notification_flags key 'booking_changed')
- [Phase 63]: [Phase 63] 63-02: notification AND-gate (flags select + logEmail) resolved before the booking_edit_audit_log insert, not after, so the audit rows' notified column is set correctly in one insert (diverges from Plan 01's Wave-0 fixture call order)

### Brownfield phases (pre-GSD, completed)

- Phase 47: DB migration — vehicle map
- Phase 51: Admin UI badge
- Phase 52: Extended booking statuses
- Phase 53: Driver assignment UI

### v1.0 (shipped)

- Phases 54–56: SEO Blog — MDX pipeline, /blog UI, article migration + 301s

### v2.0 (shipped, Phases 57-61)

- Phase 57: Customer Auth Foundation — AUTH-01..07, ACCT-04
- Phase 58: Sign-in UI + Account Dashboard — NAV-01,02, ACCT-01,02,03
- Phase 59: Booking Flow Redesign (Blacklane) — BOOK-01..05, TRACK-01,02,03,05
- Phase 60: Auth-in-Checkout + Guest Path — BOOK-06,07,08, TRACK-04
- Phase 61: Analytics Preservation & E2E Verify — TRACK-01..05 (verification)
- Execution: 57 → (58 ∥ 59) → 60 → 61

### v2.1 roadmap (Phases 62-64)

- Phase 62: Abandoned & Unpaid Booking Capture — ABND-01..06
- Phase 63: Admin Booking Editing + Change Notification — AEDIT-01..07
- Phase 64: Admin-Created Bookings with Payment Link — ANEW-01..05
- Execution: 62 → (63 ∥ 64)

### Pending Todos

None yet.

### Blockers/Concerns

- Apple Sign In via Supabase has fiddly setup (Service ID, key, return URLs) — confirm config during a future OAuth-config phase.
- Next migration number is **053** (052_bookings_driver_price.sql is the latest). Phase 62 will likely need a new `bookings.status` CHECK value for "unconfirmed/unpaid" — extend via DROP+ADD CONSTRAINT pattern (see migrations 039, 040).
- Brownfield findings relevant to v2.1 (verify during `/gsd-plan-phase 62`):
  - `app/api/create-payment-intent/route.ts` currently only creates a Stripe PaymentIntent — it does NOT write to `bookings`. Only the webhook (`payment_intent.succeeded`) inserts the row today. Phase 62 must move booking persistence earlier (into create-payment-intent, for both one-way and round-trip/linked-leg) and change the webhook from INSERT to UPDATE-if-exists.
  - `app/api/admin/bookings/route.ts` POST already implements most of ANEW-01/ANEW-05 (manual booking creation with server-side price recompute + `override_price` escape hatch, `booking_source: 'manual'`, `payment_intent_id: null`, `status: 'pending'`) — Phase 64 mainly adds Stripe Payment Link generation/email + webhook reconciliation on top of this existing endpoint.
  - `app/api/admin/bookings/route.ts` PATCH only supports `status`/`operator_notes`/`driver_price_czk` today — no date/vehicle/route/passenger edit exists yet. Phase 63 needs a new edit surface (endpoint + admin UI); there is currently no per-booking admin detail page (`app/admin/(dashboard)/bookings/page.tsx` is a single list view).
  - Round-trip legs are separate `bookings` rows linked via `linked_booking_id` + `leg` ('outbound'/'return') columns (see `types/database.types.ts`) — Phase 63's leg-isolated edit (AEDIT-06) and Phase 62's round-trip capture must respect this shape.
  - `lib/email.ts` already has branded senders to follow as a pattern (`sendStatusConfirmedEmail`, `sendStatusCancelledEmail`, `sendPostTripEmail`) — reuse this pattern for AEDIT-05's change-diff email and ANEW-03's payment-link email.

## Deferred Items

Items acknowledged and deferred at milestone v2.0 close on 2026-06-18:

| Category | Item | Status | Reason |
|----------|------|--------|--------|
| uat_gap | Phase 53: 53-HUMAN-UAT.md | passed (0 pending) | Pre-v2.0 phase, all tests passed |
| verification_gap | Phase 55: 55-VERIFICATION.md | human_needed | 5/5 truths verified; runtime checks (404, sitemap) require live env |
| verification_gap | Phase 56: 56-VERIFICATION.md | human_needed | 11/11 truths verified; Google Rich Results Test requires third-party tool |
| verification_gap | Phase 57: 57-VERIFICATION.md | human_needed | 8/8 truths verified; OAuth/OTP live round-trips require third-party auth |
| verification_gap | Phase 58: 58-VERIFICATION.md | human_needed | 9/9 truths verified; all requirements satisfied per UAT/SECURITY/VALIDATION |
| verification_gap | Phase 59: 59-VERIFICATION.md | human_needed | 9/9 truths verified; all requirements satisfied per UAT 7/7 |

v2.1 deferred to v2 (per REQUIREMENTS.md):

| Category | Item | Reason |
|----------|------|--------|
| v2 | FOLLOW-01: Automatic reminder email after N hours unpaid | Deferred — follow-up automation, not core payment recovery |
| v2 | FOLLOW-02: Audit log of admin edits per booking | Deferred — nice-to-have, not blocking operator workflow |

## Session Continuity

Last session: 2026-08-21T13:16:10.589Z
Stopped at: Completed 63-02-PLAN.md
Resume file: None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 57 P02 | 629 | 3 tasks | 9 files |
| Phase 58 P01 | 322 | 2 tasks | 4 files |
| Phase 58 P02 | 45min | 3 tasks | 3 files |
| Phase 58 P03 | 5min | 2 tasks | 1 file |
| Phase 58 P04 | 2min | 2 tasks | 3 files |
| Phase Phase 58 PP05 | 7min | 4 tasks | 4 files |
| Phase 59 P02 | 3min | 3 tasks | 4 files |
| Phase 59-booking-flow-redesign-blacklane P01 | 30min | 2 tasks | 13 files |
| Phase 59-booking-flow-redesign-blacklane P03 | 10min | 3 tasks | 6 files |
| Phase 59-booking-flow-redesign-blacklane P04 | 8min | 2 tasks | 3 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 62 P02 | 45min | 2 tasks | 8 files |
| Phase 62 P03 | 25min | 2 tasks | 7 files |
| Phase 63 P01 | 15min | 3 tasks | 4 files |
| Phase 63 P02 | 10min | 2 tasks | 3 files |

## Operator Next Steps

- Run `/gsd-plan-phase 62` to plan the Abandoned & Unpaid Booking Capture phase.
