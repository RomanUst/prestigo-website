---
phase: 84-chatwoot-dashboard-app
plan: 01
subsystem: database
tags: [supabase, postgres, rpc, identity, chatwoot, security-definer, read-only]
requires:
  - phase: 82
    provides: identity tables and helpers (069, 072), booking_identity, phone_flags
  - phase: 83
    provides: chat_leads and chat_conversations (078)
provides:
  - "public.panel_bookings(text, text, bigint): read-only SECURITY DEFINER RPC (migration 080, NOT YET APPLIED live)"
  - "lib/panel-dto.ts: PanelResponse / PanelBooking types, label maps, PANEL_ERROR_CODES"
  - "lib/panel-links.ts: adminBookingHref, isSafePaymentLinkUrl, espoLeadUrl"
  - "lib/panel-bookings.ts: createPanelBookingsStore, buildPanelResponse, buildNoContactResponse, paymentState, pickupInstantMs"
affects: [84-04 api route, 84-07 iframe, 84-08 iframe]
tech-stack:
  added: []
  patterns:
    - "RPC wrapper with zod-validated result; every error becomes PanelStoreError(db_error)"
    - "Identity resolution in SQL (reuses 069/072 helpers) so the panel sees what the sync sees"
key-files:
  created:
    - supabase/migrations/080_panel_bookings.sql
    - lib/panel-dto.ts
    - lib/panel-links.ts
    - lib/panel-bookings.ts
    - tests/panel-bookings-migration.test.ts
    - tests/panel-bookings.test.ts
    - .planning/phases/84-chatwoot-dashboard-app/84-01-smoke.sql
  modified: []
key-decisions:
  - "Unknown (non-erasing) person still gets the conversation's open Lead id with identity_found false and zero rows, so a Lead-only chat shows its CRM link"
  - "A conversation Lead owned by an identity under erasure is never exposed, even via another contact"
  - "Task 1 commit carries the email path only; phone, mismatch and Lead pointer arrive in Task 2 as the plan describes"
patterns-established:
  - "Pickup instant: pickup_utc, else Europe/Prague wall clock via Intl offset lookup (DST-safe), else null"
requirements-completed: []
duration: ~35min
completed: 2026-10-29
status: complete
actuals:
  tokens: 36000
  tasks: 2
  commits: 3
plan_head_before: 0987055cdc1dcad8f3942f1ce4f33d2014bb4890
plan_head_after: 5c7577581201f8c139a13ab51c091bf99cba4641
---

# Phase 84 Plan 01: panel_bookings RPC and panel DTO layer Summary

**Read-only panel_bookings SECURITY DEFINER RPC (email-owned identity, unique non-shared phone fallback, mismatch flag, Lead pointer, 24-key allowlist, SQL totals, 200-row cap) plus the DTO, link and mapper modules the Dashboard App API and iframe share.**

Status: all 3 tasks complete. Task 3 was run by the orchestrator via Supabase MCP on 2026-10-29. PANEL-01 / PANEL-02 stay open in `requirements-completed` until the panel is live (84-09).

`commits: 3` counts the three code/test commits (two task commits and the smoke draft); the SUMMARY commit that follows is not included in `plan_head_after`.

## Tasks

| Task | Name | Commit | Status |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | email -> panel_bookings -> store.load -> buildPanelResponse | d1a44471 | done |
| 2 | phone rules, mismatch, Lead pointer, mapper edge matrix | 2e9acfd6 | done |
| smoke draft | 84-01-smoke.sql | 5c757758 | done (UNTESTED against Postgres) |
| 3 | apply 080 live + smoke SMOKE_OK_84_01 | - | done (orchestrator MCP) |

Tracer gate: the `<verify>` of Task 1 (two test files + tsc filter) ran green before expansion to Task 2.

## Verification run here

- `npx vitest run tests/panel-bookings-migration.test.ts tests/panel-bookings.test.ts`: 56 passed.
- `npx tsc --noEmit`: no errors in any panel file (no output mentioning "panel").
- `npx eslint --quiet` on the three lib files and both tests: clean.
- No `€` literal in the three lib files. `lib/panel-dto.ts` and `lib/panel-links.ts` import nothing from `@/lib/supabase` or `node:*`.
- Tests ran through the symlinked `node_modules`; no next-intl server modules are imported by these files, so no failures to report.

## Task 3 status (orchestrator)

- apply_migration `080_panel_bookings`: success (live; 079 was newest before, no 080 existed; all columns the body names verified via information_schema; trip_progress/_updated_at live on driver_assignments)
- smoke message: exactly `SMOKE_OK_84_01` (second run). First run failed: `pickup_utc` is a GENERATED column (`prestigo_text_to_utc(pickup_date, pickup_time)`) and cannot be inserted. The orchestrator fixed the smoke to drive ordering through pickup_date (E = oldest date) instead. Since pickup_time is NOT NULL, a NULL pickup_utc cannot occur live; the TS null-fallback path stays covered by unit tests only. Leftover check after rollback: 0 bookings / identities / drivers / conversations.
- get_advisors security ERROR count naming panel_bookings: 0 (only pre-existing INFO rls_enabled_no_policy + WARN leaked-password)
- `npx vitest run tests/panel-bookings-migration.test.ts tests/panel-bookings.test.ts` on the main checkout after apply: 56/56 pass

## Deviations from Plan

### Auto-fixed Issues

None for rules 1-3. Plan choices that went slightly beyond the text:

**1. [Design] Lead pointer for an unknown, non-erasing person**
- The plan's erasing branch returns no Lead. For a person with no identity at all, I return the conversation's open Lead id (identity_found false, zero rows) instead of nothing, because D-08 wants the Lead link whenever one exists and a Lead-only chat has no bookings. Erasing identities still return NULL, and a Lead owned by an erasing identity is filtered out even when reached through another contact (smoke e2).
- Files: supabase/migrations/080_panel_bookings.sql. Easy to flip back if the owner prefers the strict reading.

**2. [Tooling] Task 1 migration was a reduced email-only version**
- Task 1 committed the email-only migration, Task 2 the full one, as the plan splits them. Task 2's migration tests were written alongside the code, not run red first.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the service_role-only RPC already in the plan's threat model.

## Notes for the orchestrator before applying

- The smoke SQL has not been executed anywhere; expect to fix a typo or two on first run. It resolves identities through `identity_resolve_booking()` (the 069 trigger only enqueues outbox rows, it does not create identities), and links the abandoned (F) and anonymised (G) rows to the identity by hand so the RPC filters are what is tested.
- Smoke preconditions fail fast if conversation ids 9000001..9000003, the two `smoke-84-*@example.test` emails or phones `+420700900001/2` already exist live.
- The smoke inserts `confirmed` bookings, which fire the 063 gcal and lead-outbox triggers; the pg_net calls are only sent after COMMIT, so the rollback sends nothing. If you prefer, switch the fixture statuses, but the counter assertions (3 trips, 320) depend on A/B/C being value statuses.
- It inserts a row with `anonymised_at = now()`: check there is no live CHECK that requires anonymised rows to carry placeholder values.
- `driver_assignments` columns used: `booking_id, driver_id, status, trip_progress, trip_progress_updated_at, created_at`; `drivers(name, email, phone)`. Confirm no extra NOT NULL columns without defaults.
- After applying, run `npx vitest run tests/panel-bookings-migration.test.ts` on the main checkout (text drift check) and, for the new tests overall, `npx vitest run tests/panel-bookings.test.ts`.

## Self-Check: PASSED

- Files exist: migration 080, lib/panel-dto.ts, lib/panel-links.ts, lib/panel-bookings.ts, both test files, 84-01-smoke.sql.
- Commits found: d1a44471, 2e9acfd6, 5c757758.
