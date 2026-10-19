---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 02
subsystem: admin-outbox
tags: [outbox, admin, supabase-rpc, qstash, retry, SYNC-05, D-12]
requires:
  - integration_outbox (064), outbox_due_keys sweep (068), lib/outbox.ts publishOutboxDispatch
provides:
  - "migration 070: outbox_health, outbox_open_events, outbox_retry, outbox_retry_failed"
  - "lib/outbox-admin-store.ts (OutboxHealth, OpenOutboxEvent, outboxHealth, openOutboxEvents, retryOutboxEvent, retryFailedOutbox)"
  - "lib/outbox-labels.ts (outboxEventLabel, outboxErrorHint) shared with the digest"
  - "GET /api/admin/outbox, POST /api/admin/outbox/retry, POST /api/admin/outbox/retry-all"
  - "/admin/outbox page, HealthBanner, OutboxTable, sidebar entry"
affects: [82 digest (reuses outbox-labels), 82 erasure page (links to /admin/outbox)]
tech-stack:
  added: []
  patterns: [SECURITY DEFINER RPC + REVOKE/GRANT tail, admin guard order 401/403 -> 400 -> 422, batches of 10 publish]
key-files:
  created:
    - supabase/migrations/070_outbox_admin.sql
    - lib/outbox-admin-store.ts
    - lib/outbox-labels.ts
    - app/api/admin/outbox/route.ts
    - app/api/admin/outbox/retry/route.ts
    - app/api/admin/outbox/retry-all/route.ts
    - app/(internal)/admin/(dashboard)/outbox/page.tsx
    - components/admin/HealthBanner.tsx
    - components/admin/OutboxTable.tsx
    - tests/outbox-admin.test.ts
    - tests/outbox-admin-migration.test.ts
    - tests/outbox-admin-page.test.tsx
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-02-smoke.sql
  modified:
    - components/admin/AdminSidebar.tsx
decisions:
  - "Retry button is offered for failed and pending rows (the RPC accepts exactly those); processing rows get no action"
  - "Chip counts are summed from health.by_type (stuck rows stay in their own status bucket there), All = open_total"
  - "The page's Refresh outbox button lives in the toolbar and stays visible on load error, so there is a single Refresh button instead of a second one inside the error message"
  - "Global :focus-visible copper ring in globals.css already satisfies the UI-SPEC focus rule; no per-component outline code"
status: complete
commits: 3
plan_head_before: e8f6657b7b0a2fb8e71421be9af7dae9b31bbd4e
plan_head_after: 6d924e75dcd98d854e73832597b6409d187f060e
actuals:
  tokens: 21000
  tasks: 2
  commits: 3
metrics:
  completed: 2026-10-19
---

# Phase 82 Plan 02: Outbox admin health and retry Summary

Owner-facing `/admin/outbox` page: live pending/processing/failed/stuck counts, the latest 100 open events with last error codes and hints, and one-click retry for a single event or all failed events after a VPS outage (SYNC-05, D-12). Ids, references and codes only; no name, email or phone.

## Status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: health + open events -> GET route -> page | Done | 357fc8bd |
| 2 | Retry one / retry all, HealthBanner, OutboxTable, all page states | Done | b95544c7 |
| 3 | Apply migration 070 live + rolled-back smoke `SMOKE_OK_82_02` | **PENDING (orchestrator, Supabase MCP)** | 6d924e75 (smoke SQL only) |

`commits: 3` is measured over the three code/smoke commits before this SUMMARY commit (`plan_head_after` is the smoke commit).

## What was built

- **Migration 070** (not yet applied live): four SECURITY DEFINER functions with `SET search_path = ''`, REVOKE from PUBLIC/anon/authenticated, GRANT to service_role. Retries set status pending, attempts 0, available_at now, clear the lease, keep `last_error`; they only touch `failed`/`pending` rows (`failed` only for retry-all), never `processing`, so the claim lease and per-aggregate mutex stay authoritative. `outbox_open_events` caps at 100 and joins `bookings` only for `booking_reference`.
- **Routes**: guard order body-size -> `getAdminUser` 401/403 -> JSON 400 -> zod strict 400 -> key shape 422 `invalid_key` (`parseOutboxKey`) -> RPC; `false` from `outbox_retry` -> 422 `not_retryable`; store errors -> 500 `Database error` with a payload-free `console.error('[admin/outbox.<METHOD>] code=db_error')`. Publish uses dedup suffix `r<epoch>`; retry-all publishes in batches of 10. No CRM or Chatwoot import (isolation guard test passes).
- **UI** per 82-UI-SPEC: KPI row, health banner (healthy / problem with zero clause omitted), filter chips with totals, refresh with "Updated HH:MM:SS", inline "Retry N failed events?" confirm, aria-live success text that clears after 4 s, per-row "Retry event" -> "Queued" with the old error code kept visible, 100-row cap with caption, error-code hint lines, ellipsis at 280px with `title`, `overflowX: auto` wrapper with table `min-width: 720px`, weights 400/500 only (none 300/700 in new files), double-submit guard via ref.
- Sidebar: `Outbox` entry after Stats.

## Verification

- `npx vitest run tests/outbox-admin.test.ts tests/outbox-admin-page.test.tsx tests/outbox-admin-migration.test.ts tests/AdminSidebar.test.tsx tests/infra-vps-isolation-guard.test.ts`: 5 files, 76 tests passed (run through the symlinked main-checkout `node_modules`; no failures from the symlink).
- `npx tsc --noEmit`: no errors mentioning outbox files.
- `npx eslint --quiet` on all new files: clean.
- Task 3 acceptance (live): NOT run. `tests/outbox-admin-migration.test.ts` passes against the committed SQL.

## Task 3 handoff (orchestrator, Supabase MCP)

1. `apply_migration` name `070_outbox_admin` with the text of `supabase/migrations/070_outbox_admin.sql`.
2. `execute_sql` with the contents of `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-02-smoke.sql`. Expected: the only exception message is exactly `SMOKE_OK_82_02` (anything else names the failed assertion). The block uses synthetic `lead.inquiry:` keys only and ends in RAISE EXCEPTION, so everything rolls back. It has not been executed (no DB access in this worktree), so a typo in the SQL is possible; report the failing message if any.
3. `get_advisors` (security): expect no ERROR item naming `outbox_health`, `outbox_open_events`, `outbox_retry` or `outbox_retry_failed`.
4. Record the apply result, smoke message and advisor ERROR count here / in the phase notes.

## Deviations from Plan

None to the code scope. Process notes:
- The `verify` project skill file (`.claude/skills`) is absent in this worktree; its checks were run by hand (tsc, eslint, scoped vitest, no hard-coded currency, no secrets).
- `plan_head_before` was taken from the known base commit (`e8f6657b`) rather than a ledger file written before the first commit.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-82-06..09 mitigated: admin guard before body, Origin-strict CSRF in middleware for `/api/admin`, RPC EXECUTE to service_role only, ids/codes-only responses with a test that no email/phone pattern appears in responses, logs or page text, retry RPCs skip `processing`, cap 500 + batches of 10 + per-second dedup suffix).

## Self-Check: PASSED

- Files exist: migration 070, both lib files, three routes, page, two components, three test files, smoke SQL.
- Commits exist: 357fc8bd, b95544c7, 6d924e75.
