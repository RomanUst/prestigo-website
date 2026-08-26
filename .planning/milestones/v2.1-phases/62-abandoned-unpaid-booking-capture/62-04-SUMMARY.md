---
phase: 62-abandoned-unpaid-booking-capture
plan: 04
subsystem: database
tags: [supabase, postgres, migration, rpc, admin_search_bookings, production]

requires:
  - phase: 62-abandoned-unpaid-booking-capture
    provides: migration 053 (unpaid status + attempt_id) from 62-01; p_status GET threading from 62-03
provides:
  - Migration 054 file — admin_search_bookings gains a p_status parameter + status predicate
  - Live production schema now matches the phase-62 code (unpaid CHECK value, attempt_id column + partial index, RPC p_status)
affects: [63, 64]

actuals:
  tokens: 18000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Author RPC migrations from the VERBATIM live pg_get_functiondef body (no local migration exists for admin_search_bookings)"
    - "Add a parameter via DROP old-signature + recreate + re-GRANT (avoids overload; restores ACL that pg_get_functiondef omits)"

key-files:
  created:
    - supabase/migrations/054_admin_search_bookings_status_filter.sql
  modified: []

key-decisions:
  - "Checkpoint (Task 2, blocking-human production apply) confirmed by operator: apply 053+054 to live rideprestigo project"
  - "054 derived verbatim from live pg_get_functiondef, not guessed (T-62-06 mitigation)"
  - "DROP the exact 6-arg signature before recreate to avoid a dangling overload; re-GRANT EXECUTE to service_role (ACL was {service_role=X/postgres}, not carried by pg_get_functiondef)"

patterns-established:
  - "Live-schema apply is a supervised blocking-human step via Supabase MCP apply_migration, verified immediately with execute_sql"

requirements-completed: [ABND-02, ABND-04]

coverage:
  - id: D1
    description: "Migration 054 authored from the live admin_search_bookings body + p_status parameter and predicate; search/pagination/return preserved"
    requirement: "ABND-04"
    verification:
      - kind: manual_procedural
        ref: "supabase/migrations/054_admin_search_bookings_status_filter.sql — grep p_status + admin_search_bookings; body verbatim from pg_get_functiondef"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migrations 053 + 054 applied to the live production DB; unpaid CHECK value, attempt_id column + partial unique index, and RPC p_status all verified present"
    requirement: "ABND-02"
    verification:
      - kind: integration
        ref: "Supabase MCP execute_sql live verification (project enakcryrtxlnjvjutfpv) — see evidence below"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-20
status: complete
---

# Phase 62 · Plan 04: Live Schema Apply Summary

**Closed the live-schema gap: migrations 053 + 054 are applied to the production `rideprestigo` project, so the live DB now matches the phase-62 code (unpaid status, attempt_id capture key, and the admin status filter).**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-20
- **Tasks:** 2 (Task 1 author 054; Task 2 blocking-human production apply — confirmed by operator)
- **Files:** 1 created (`supabase/migrations/054_...sql`)
- **Commits:** 2 (`3ac1482` migration 054; SUMMARY/tracking commit below)

## Accomplishments
- **Task 1 — Migration 054 authored.** Pulled the VERBATIM live `admin_search_bookings` body via `pg_get_functiondef` (no local migration exists for this RPC). Added `p_status text DEFAULT NULL` and `AND (p_status IS NULL OR b.status = p_status)`. Preserved p_query/p_start_date/p_end_date/p_trip_type/p_offset/p_limit, the search/pagination logic, and the `{ rows, total_count }` return exactly. Used DROP old-signature + recreate (avoids a dangling overload) and re-granted `EXECUTE … TO service_role` (the ACL `pg_get_functiondef` does not emit).
- **Task 2 — Applied 053 then 054 to production** (project `enakcryrtxlnjvjutfpv`) via Supabase MCP `apply_migration`, operator-confirmed.

## Live verification evidence (Supabase MCP execute_sql, project enakcryrtxlnjvjutfpv)
Before apply: `bookings_status_check` had 7 values (no `unpaid`); `attempt_id` absent; partial index absent; RPC had no `p_status`.

After apply:
- `bookings_status_check` = `CHECK (status = ANY (ARRAY['unpaid','pending','confirmed','completed','cancelled','assigned','en_route','on_location']))` — accepts `unpaid`.
- `attempt_id` column present (count 1).
- Partial unique index present: `CREATE UNIQUE INDEX bookings_attempt_id_leg_unpaid_key ON public.bookings USING btree (attempt_id, leg) WHERE (status = 'unpaid')`.
- `admin_search_bookings` has `p_status` parameter (count 1) and exactly **one** function (no leftover overload).
- Functional call `admin_search_bookings(p_status => 'unpaid')` returns the `{ rows, total_count }` shape (total_count 0 — no unpaid rows yet).

## Verification
- Phase-62 test files re-run post-apply: 113 passed / 2 failed / 5 todo. The 2 failures are the pre-existing `POST /api/admin/bookings` Test 5/6 (unrelated to phase 62; documented in `deferred-items.md` for Phase 64) — no regression.

## Notes
- `types/database.types.ts` was not regenerated here (out of this plan's `files_modified`; 62-03 already typechecked clean against the new `p_status` call). Regenerate types opportunistically in a later phase if desired.
- Rollback (should it ever be needed) requires a new migration to drop `unpaid` from the CHECK + dispose of any live `unpaid` rows, and to restore the prior RPC signature — consistent with the one-way reversibility flagged at the 62-01 gate.
