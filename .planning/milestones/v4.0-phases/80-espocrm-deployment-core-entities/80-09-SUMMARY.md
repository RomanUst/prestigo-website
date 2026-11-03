---
phase: 80-espocrm-deployment-core-entities
plan: 09
subsystem: infra
tags: [espocrm, backfill, supabase-export, idempotency, crm]
status: complete
requirements: [CRM-03]
requires: ["80-03", "80-07"]
provides:
  - "infra/espocrm/backfill.mjs: loadExport, planBackfill, runBackfill, runRelink, runAudit, runCli, parseArgs (flags --dry-run --input --limit --delay-ms --relink --audit)"
  - "tests/espocrm-backfill.test.ts (22 tests against the fake: idempotency, field ownership, 409, paging, relink, audit, PII-free logs)"
affects: [80-12]
key-files:
  created:
    - infra/espocrm/backfill.mjs
    - tests/espocrm-backfill.test.ts
decisions:
  - "Contacts are keyed by normalized email; first row in export order (created_at, id) supplies the names; phone comes from the first non-empty phone among that contact's rows"
  - "A booking without a valid email is written without a contact link (counted as without_contact); contactId/accountId are only diffed for bookings that have a contact"
  - "API-error output prints method, path without query string and status only: a Contact lookup URL carries an email address"
  - "Preload dedupes records by id because orderBy=createdAt can tie across page boundaries on the live API"
metrics:
  duration: ~45min
  completed: 2026-10-13
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
plan_head_before: 6f89a434d64c30c27290bba84d8b3b2ca98a8bc9
plan_head_after: 866f123c7d9a5f57672cb0d4c221b1d74be1c459
---

# Phase 80 Plan 09: Booking backfill Summary (PARTIAL, blocked before the live dry-run)

**Idempotent Supabase-export to Contact + CBooking loader is built and tested against the fake; the Supabase export and the live dry-run could not run because the Supabase MCP tools were not available to this executor.**

## Status

| Task | State |
| ---- | ----- |
| 1 (tracer) code + tests | done, commit c3be9904 |
| 1 export via Supabase MCP | BLOCKED: `mcp__82acaec4-...__execute_sql` / `list_projects` are not available in this sub-agent (no ToolSearch to load them, direct call returns "No such tool") |
| 1 live `--dry-run` with the real export | not run (needs the export) |
| 2 write path, relink, audit, PII-free logs | done, commit 866f123c |
| 3 D-21 owner decision | not reached |

No CRM data was written. No customer data was read or committed. `infra/espocrm/.work/` does not exist yet.

## What was verified

- `npx vitest run tests/espocrm-backfill.test.ts tests/espocrm-booking-map.test.ts` : 85/85 pass (22 backfill).
- `npx tsc --noEmit`: no errors in the new files. `npx eslint --quiet`: clean.
- `grep -c "X-Skip-Duplicate-Check" infra/espocrm/backfill.mjs` prints 0; the runRelink/runAudit grep prints 2.
- Live read-only connectivity: `node infra/espocrm/backfill.mjs --dry-run` against an EMPTY export (`[]` in the session scratchpad) ran the real preload of /Contact and /CBooking with the prestigo-sync key: exit 0, zero rows, nothing written. So the Sync writer role can read both entities.
- Missing input path: `Config error: Export input not found: <path>`, exit 1.

## Tests (behavior bullets -> evidence)

Run 1 creates / run 2 `create=0 update=0`; owner-edited Contact keeps accountId and names, empty phone filled, bookings get accountId; 409 on Contact create resolved by lookup (one POST, no bypass header); 450 bookings over 3 pages and a shuffled copy give identical dry-run output, second run over 450 contacts and 450 bookings (more than 200 per entity) is a no-op; status change gives `bookings: update=1`; `--relink` updates exactly the drifted contact's bookings then 0; `--audit` exits 3 and lists both ids, clean fake prints `duplicates=0`; `--limit 1` writes one booking and one contact; PII-free output asserted over dry-run, run, relink, audit and an API-error path.

## Deviations from Plan

**1. [Blocker] Supabase MCP unavailable to the executor.** The orchestrator's brief said to load the Supabase SQL tools through ToolSearch; ToolSearch does not exist in this sub-agent and the MCP tool names are not callable. Fix path: the owner exports the data in the Supabase SQL editor (the plan's own fallback), see "Export instructions" below. I did not read `.env.local` or create any key file.

**2. [Plan wording] planBackfill behavior bullet.** The plan says "3 eligible rows (2 sharing one email in different case) yields contacts create=1". Two rows sharing an email and a third with another email give 2 contacts; the test uses three rows sharing one email (create=1) and a second test with two distinct emails (create=2).

**3. [Rule 2] Error output hardening.** API errors print method, path without query and status only (a lookup URL contains an email); a malformed export file names the file only (JSON parse errors can quote content).

The columns of `public.bookings`, `public.drivers`, `public.customer_profiles` were NOT confirmed by an information_schema query (no DB access), so no SQL adaptation was recorded. The owner should run the check query first.

## D-21 decision (Task 3) — approved by owner 2026-10-16

Export taken by the orchestrator via the Supabase MCP (json_agg, result kept in a tool-results file, never printed; written to the git-ignored infra/espocrm/.work/export/page-01.json, mode 600; columns check: all present).
Live dry-run (`node infra/espocrm/backfill.mjs --dry-run`, prestigo-sync key):
- export: rows=56 eligible=56 excluded_abandoned=0 invalid=0 duplicate_rows=0 (Supabase total 57, abandoned 1 excluded by the export SQL)
- by_status: cancelled=19 completed=24 confirmed=10 unpaid=3
- by_source: gnet=6 manual=23 online=27
- by_payment_method: Stripe=35 Invoice=4 Cash=8 Other=9
- contacts: create=29 update=0 unchanged=0; bookings: create=56 update=0 unchanged=0 without_contact=0
- dry-run: nothing written
Payment-method rule approved as-is: payment_intent_id -> Stripe; payment_link_id -> Stripe; invoice_number -> Invoice; source gnet -> Other; source manual -> Cash; otherwise Other.
Owner reply: "загрузить все брони" (approve). The live write runs in plan 80-12.

## Export instructions (needed to continue; SQL contains no customer data)

1. Column check (should list every column used below; if one is missing, alias it to `null` in the export SQL):
```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name in ('bookings','drivers','customer_profiles')
order by table_name, ordinal_position;
```
2. Counts: `select count(*) as total, count(*) filter (where b.status = 'unpaid' and coalesce(b.booking_source, 'online') = 'online' and b.payment_link_id is null) as abandoned from public.bookings b;`
3. Export (repeat with `offset 0, 1000, 2000, ...` until no rows; "Copy as JSON" one page per file):
```sql
select b.id, b.booking_reference, b.status, b.booking_source, b.leg, b.trip_type, b.vehicle_class, b.pickup_utc, b.pickup_date, b.pickup_time, b.origin_address, b.destination_address, b.amount_eur, b.amount_czk, b.client_first_name, b.client_last_name, b.client_email, b.client_phone, b.flight_number, b.payment_intent_id, b.payment_link_id, b.invoice_number, b.paid_at, b.attempt_id, b.user_id, b.created_at, d.name as driver_name, cp.company_name, cp.account_type
from public.bookings b left join public.drivers d on d.id = b.driver_id left join public.customer_profiles cp on cp.user_id = b.user_id
where not (b.status = 'unpaid' and coalesce(b.booking_source, 'online') = 'online' and b.payment_link_id is null)
order by b.created_at, b.id limit 1000 offset 0;
```
4. Save: `mkdir -p infra/espocrm/.work/export && pbpaste > infra/espocrm/.work/export/page-01.json` (page-02.json, ...) in the repo root (git-ignored).
5. Then: `node infra/espocrm/backfill.mjs --dry-run` and review the count lines (the D-21 checkpoint).

## Known Stubs

None.

## Threat Flags

None. The module only reads local export files and talks to the existing CRM API with the Sync writer key; no new endpoints or trust boundaries.

## Self-Check: PASSED

Files exist: infra/espocrm/backfill.mjs, tests/espocrm-backfill.test.ts. Commits c3be9904 and 866f123c found in git log.
