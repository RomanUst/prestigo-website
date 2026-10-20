---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 12
subsystem: GDPR erasure / outbox saga
tags: [gdpr, erasure, outbox, chatwoot, espocrm, supabase, security, tdd]
status: complete
requires:
  - phase: 82-01 (identity tables, erasing_at freeze, anonymised_at column, resolver answers 'erasing')
  - phase: 82-05 (phone rules: shared numbers excluded from identity_person)
  - phase: 82-07 (lib/crm-sync.ts, sync.espo skips erasing identities)
  - phase: 82-10 (Chatwoot admin client, sync.chatwoot skips erasing identities)
provides:
  - supabase/migrations/075_erasure.sql (erasure_requests + erasure_scope / preview_create / confirm / load / record_step / anonymise_person / complete / log) - NOT YET APPLIED LIVE
  - lib/erasure.ts (deliverErasure: erase.person saga)
  - lib/erasure-store.ts (RPC wrappers, deleteAuthUser, scope/preview/confirm/log for 82-13)
  - erase.person routed in lib/lead-sync.ts (replaces unsupported_event)
  - infra/espocrm/roles.json: Sync writer Contact delete 'all' (config as code, not applied live)
  - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-12-smoke.sql (rolled-back live smoke, 11.6 KB)
affects: [82-13, 82-14, 82-15]
key-files:
  created:
    - supabase/migrations/075_erasure.sql
    - lib/erasure.ts
    - lib/erasure-store.ts
    - tests/erasure.test.ts
    - tests/erasure-migration.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-12-smoke.sql
  modified:
    - lib/lead-sync.ts
    - infra/espocrm/roles.json
    - infra/vps/runbooks/crm-operators.md
    - tests/espocrm-roles.test.ts
    - tests/infra-vps-isolation-guard.test.ts
    - tests/sync-resolve.test.ts
decisions:
  - "Supabase is anonymised last and the order is enforced in the database too: erasure_anonymise_person raises unless the chatwoot and espocrm steps and a verify step with verified true are recorded on the request"
  - "erasure_anonymise_person records its own 'supabase' step (with the counts) in the same transaction, so there is no window between 'anonymised' and 'recorded'; a repeat call returns the stored counts"
  - "An unverified result completes the request as failed BEFORE Supabase is touched (the identity stays frozen, records stay findable); a new preview/confirm for the same person is possible because failed requests are not active"
  - "erasure_confirm refreshes the scope under the identity lock (identity found late, extra emails, non-shared phones, booking and inquiry ids) before it freezes, and takes the identity lock before the request row lock (the order every erasure function uses)"
  - "Only request phones that are not flagged shared reach Chatwoot lookups: a desk number can never pull another person's contact into the deletion"
  - "Edit-audit rows keep accounting field values (price, status, schedule) and wipe every other old/new value; email_log recipients of the person's emails or bookings become erased@erased.invalid"
  - "A step is skipped on resume only when recorded; a verify step recorded with verified false is run again. Gating is per open step (a resume past the CRM steps needs no CRM configuration)"
  - "DispatchDeps gained an optional 'erasure' store (default: the Supabase RPC store) so tests inject a double"
metrics:
  tasks_total: 3
  tasks_done: 3
  tasks_pending: 1
  commits: 3
  plan_head_before: f7210122ec95f2163500d5cb5a7026bffb82d55e
  plan_head_after: 74fb3b531b96d8a7fef1569a41c74d027f5e1de9
  completed: 2026-10-19
actuals:
  tokens: 60000
  tasks: 2
  commits: 3
---

# Phase 82 Plan 12: GDPR erasure saga Summary

An admin-confirmed `erasure_requests` row now flows through the outbox as `erase.person:<requestId>` and removes or anonymises the person in Chatwoot, EspoCRM and Supabase in a fixed, resumable order, then leaves a PII-free audit row. Code, tests and the live smoke script are done; migration 075 is NOT applied live yet (Task 3 is the orchestrator's: see below).

## Flow

freeze (`erasure_confirm`: status confirmed, `contact_identities.erasing_at`, outbox row on the person aggregate, one transaction) -> Chatwoot (administrator client: cached id, identifier = user id, each email, each non-shared phone; DELETE, 404 = done, 422 online = transient retry) -> EspoCRM (CBookings of the bookings and of the found Contacts anonymised in place and kept; Contacts and Leads found by cached id / email / `cSupabaseRef` `inquiry:`/`booking:` are PUT blank THEN DELETEd, because EspoCRM deletes are soft) -> verify (find and delete again; a second pass must find nothing) -> Supabase (`erasure_anonymise_person`, one transaction) -> auth user deletion -> `erasure_complete` (hash, dates, steps, counts, verified only).

Key behaviours, all test-pinned:
- The saga re-reads the request: any status other than confirmed/running, a missing row or a forged key completes `skipped erasure_not_confirmed` with zero external requests (T-82-34).
- Each finished step is recorded (counts only); a retry resumes after the last one. Past 45 s the run reschedules with `deadline` and does not call Supabase.
- Verify survivors after pass two: request `failed`, outbox row `failed erasure_unverified` (ALERT line, no PII), Supabase untouched.
- Scrub refused twice (full body, then minimal body) throws `crm_400`: a record is never deleted unscrubbed.
- Logs: `[erasure] key=<key> step=<s> outcome=<o> code=<c>` only (test asserts no email, name or phone).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: confirm -> erase.person -> Chatwoot -> EspoCRM -> verify -> Supabase -> auth -> audit; router branch; isolation allowlist | c7dfe265 |
| 2 | Leads, CBookings, residual tables, scope/preview/log, resume, verify re-delete, Sync writer Contact delete | a8bf13f0 |
| 3 | [ORCHESTRATOR] apply 075 live + rolled-back smoke SMOKE_OK_82_12 | DONE by orchestrator 2026-10-19 (smoke 74fb3b53 + fix below) |

## Task 3: DONE (orchestrator, Supabase MCP)

1. `apply_migration` name `075_erasure` with `supabase/migrations/075_erasure.sql`.
2. `execute_sql` with the whole of `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-12-smoke.sql` (11.6 KB, one DO block, precondition `crm_sync_start` absent). Expected message: exactly `SMOKE_OK_82_12`; any other message is `FAIL <label>`. I could not run it (no Postgres and no MCP in this session), so the SQL is statically reviewed only: if it fails, the label names the assertion; a failure inside a migration function is a defect in 075 to fix before go-live.
3. `get_advisors` (security): no new ERROR naming 075 objects. `select count(*) from public.integration_config where key = 'crm_sync_start'` must be 0.

Results (2026-10-19 ~20:55 UTC): apply result `success`, smoke message `SMOKE_OK_82_12`, advisor ERROR count `0` (nothing names 075 objects), crm_sync_start count `0`. Leftovers after rollback: 0 erasure_requests, 0 SMK-82-12 bookings / gnet rows, 0 smoke users, 0 new outbox rows, 0 identities.

First run failed on the smoke itself, not the migration: `bookings.pickup_utc` is a GENERATED column (computed from pickup_date/pickup_time), so the INSERT may not set it. The smoke now omits it (the 2030 pickup date still makes the booking upcoming); fixed in the committed `82-12-smoke.sql`.

## Deviations from Plan

### Auto-fixed / judgement calls

**1. [Rule 2 - Missing critical functionality] Order enforced in the database**
- **Issue:** the plan states "Supabase is never anonymised before the CRM steps succeed" only for the TS saga.
- **Fix:** `erasure_anonymise_person` raises unless chatwoot, espocrm and a verified verify step are recorded; `erasure_complete('completed')` demands verified true and the supabase step.
- **Files:** supabase/migrations/075_erasure.sql. **Commit:** c7dfe265

**2. [Rule 2] Scope refreshed at confirm; shared phones excluded**
- **Issue:** bookings, an identity or emails can appear between preview and confirm; a shared desk number in the request would make the saga delete another person's Chatwoot contact.
- **Fix:** `erasure_confirm` recomputes identity, emails, non-shared phones, user, booking and inquiry ids under the identity lock before the freeze; `erasure_anonymise_person` recomputes bookings once more (late bookings of the same email are anonymised too).
- **Commit:** c7dfe265

**3. [Rule 2] Expired previews are deleted**
- A preview holds plaintext scope; `erasure_preview_create` deletes expired unconfirmed previews. `erasure_log` lists only non-previewed requests.
- **Commit:** a8bf13f0

**4. [Rule 3] Operator runbook table updated**
- `tests/crm-runbook.test.ts` pins the role table to `roles.json`; the Sync writer Contact cell and its description sentence in `infra/vps/runbooks/crm-operators.md` were updated so the deliberate role change does not break the guard. The fuller erasure runbook is plan 82-15.
- **Commit:** a8bf13f0

**5. [Interface] DispatchDeps.erasure**
- Optional field added to inject the store double; default is the Supabase RPC store. `tests/sync-resolve.test.ts` erase.person case updated from `unsupported_event` to `skipped erasure_not_confirmed`.

### Notes / limits
- The confirm migration does not kick QStash (`outbox_kick`): the 82-13 confirm route publishes the dispatch message after `confirmErasure`; the daily sweep is the fallback.
- A Contact scrubbed but whose DELETE then fails transiently and that was found only by email (no cached id) cannot be found by email on the retry; it holds only blank fields ("Erased"), so no PII remains, but an orphan blank Contact may need manual removal.
- The EspoCRM blank bodies (`emailAddress: null`, `emailAddressData: []`, address and description fields) are an assumption about the live 10.0.x API; the minimal-body fallback covers a 400. Verify against the live CRM at go-live (82-14/82-15).
- `driver_assignments.trip_note` scrubbing is covered by migration text tests but not by the live smoke (needs a driver fixture).

## Verification

- `npx vitest run` on erasure, erasure-migration, espocrm-roles, crm-runbook, crm-sync, chatwoot-contact-sync, lead-sync(+booking, purge), sync-resolve, isolation guard, dispatch, sweep: 13 files, 421 tests green. Full suite: 240 files pass; 5 files (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) fail to load in this worktree because `next-intl/dist/.../server.react-server.js` cannot be resolved through the symlinked `node_modules` (unrelated to this plan; they do not import any file changed here).
- `npx tsc --noEmit`: no error outside the 8 baseline `tests/` errors. `npx eslint --quiet` on all new/changed files: clean.
- `node infra/espocrm/sync.mjs --dry-run --only roles`: `roles: create=0 update=1 unchanged=2`, `[update] roles Sync writer` (read-only dry run; nothing applied live).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-82-34..38 mitigated as listed: signed dispatch only, request-row authorisation, freeze at confirm, hash-only audit, Sync writer gains only Contact delete).

## Self-Check: PASSED

Files verified present: 075_erasure.sql, lib/erasure.ts, lib/erasure-store.ts, tests/erasure.test.ts, tests/erasure-migration.test.ts, 82-12-smoke.sql. Commits verified: c7dfe265, a8bf13f0, 74fb3b53.
