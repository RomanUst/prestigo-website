---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Blacklane-style Booking + Customer Accounts
status: planning
stopped_at: Phase 57 context gathered
last_updated: "2026-06-10T12:57:18.246Z"
last_activity: 2026-06-10 — Roadmap for v2.0 created (Phases 57-61), 26/26 requirements mapped
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-10)

**Core value:** Every page must convert a visitor into a confirmed booking or qualified lead without friction
**Current focus:** Milestone v2.0 — roadmap ready, Phases 57-61; next is planning Phase 57

## Current Position

Phase: Not started (roadmap ready — 5 phases: 57-61)
Plan: —
Status: Roadmap created, awaiting phase planning
Last activity: 2026-06-10 — Roadmap for v2.0 created (Phases 57-61), 26/26 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.0: Customer auth reuses Supabase Auth (GoTrue) — same stack as admin; add Google + Apple OAuth. No new auth library.
- v2.0: Bookings stay anonymous-capable; add nullable `user_id` FK so guest checkout never breaks.
- v2.0: Existing booking wizard is already structurally Blacklane-like (6 steps) — redesign is visual + behavioural, preserve store (`lib/booking-store.ts`) and pricing APIs.
- v2.0: Dense analytics wiring (GA4 + Meta Pixel/CAPI + server GA4 in Stripe webhook + sessionStorage price snapshot) must survive the rebuild — TRACK-* requirements are guardrails.
- v2.0 roadmap: Phase 59 (booking redesign) is independent of 57/58 and can run in parallel with auth UI; Phase 61 is a dedicated end-to-end analytics verification gate.

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

Last session: 2026-06-10T12:57:18.240Z
Stopped at: Phase 57 context gathered
Resume file: .planning/phases/57-customer-auth-foundation/57-CONTEXT.md
