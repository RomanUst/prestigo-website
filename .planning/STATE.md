---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Blacklane-style Booking + Customer Accounts
status: executing
stopped_at: Phase 57 Plan 02 complete
last_updated: "2026-06-11T14:43:49.624Z"
last_activity: 2026-06-11 -- Phase 57 Plan 02 complete (auth surface, Wave-0 tests GREEN)
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 12
  completed_plans: 11
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-10)

**Core value:** Every page must convert a visitor into a confirmed booking or qualified lead without friction
**Current focus:** Phase 57 — customer-auth-foundation

## Current Position

Phase: 57 (customer-auth-foundation) — EXECUTING
Plan: 3 of 3
Status: Executing Phase 57
Last activity: 2026-06-11 -- Phase 57 Plan 02 complete (auth surface, Wave-0 tests GREEN)

Progress: [█████████░] 92%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

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

### Brownfield phases (pre-GSD, completed)

- Phase 47: DB migration — vehicle map
- Phase 51: Admin UI badge
- Phase 52: Extended booking statuses
- Phase 53: Driver assignment UI

### v1.0 (shipped)

- Phases 54–56: SEO Blog — MDX pipeline, /blog UI, article migration + 301s

### v2.0 roadmap (Phases 57-61)

- Phase 57: Customer Auth Foundation — AUTH-01..07, ACCT-04
- Phase 58: Sign-in UI + Account Dashboard — NAV-01,02, ACCT-01,02,03
- Phase 59: Booking Flow Redesign (Blacklane) — BOOK-01..05, TRACK-01,02,03,05
- Phase 60: Auth-in-Checkout + Guest Path — BOOK-06,07,08, TRACK-04
- Phase 61: Analytics Preservation & E2E Verify — TRACK-01..05 (verification)
- Execution: 57 → (58 ∥ 59) → 60 → 61

### Pending Todos

None yet.

### Blockers/Concerns

- Apple Sign In via Supabase has fiddly setup (Service ID, key, return URLs) — confirm config during `/gsd-plan-phase 57`.
- Next migration number is **044** (043_content_media_variants.sql is the latest); Phase 57 uses `044_customer_profiles.sql`.

## Session Continuity

Last session: 2026-06-11T14:43:49.610Z
Stopped at: Phase 57 Plan 02 complete
Resume file: .planning/phases/57-customer-auth-foundation/57-03-PLAN.md

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 57 P02 | 629 | 3 tasks | 9 files |
