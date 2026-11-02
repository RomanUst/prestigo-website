---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 07
subsystem: sync / EspoCRM
tags: [espocrm, outbox, qstash, contact, cbooking, tdd]
status: complete
requires:
  - phase: 82-01 (identity_person / crm_booking read contracts, identity store, router)
provides:
  - lib/customer-mapping.ts (pure CBooking and Contact drafts, TS port of the Phase 80 mapper)
  - lib/crm-sync.ts (deliverEspoSync: sync.espo handler for a person and for an orphan booking)
  - sync.espo routing in lib/lead-sync.ts behind the crm_unconfigured gate
affects: [82-10, 82-14, 82-15]
key-files:
  created:
    - lib/customer-mapping.ts
    - lib/crm-sync.ts
    - tests/crm-sync.test.ts
    - tests/customer-mapping-parity.test.ts
  modified:
    - lib/lead-sync.ts
    - tests/infra-vps-isolation-guard.test.ts
    - tests/sync-resolve.test.ts
decisions:
  - "Chatwoot refresh is enqueued BEFORE setEspoContact so a failure in between is retried with the id still unstored (refresh never lost)"
  - "Orphan rows pass contactId undefined: an existing CBooking-to-Contact link (Phase 80 backfill) is never removed; only anonymised bookings are explicitly unlinked"
  - "'' and null count as equal when diffing a CBooking (EspoCRM returns null for an empty varchar), otherwise every run would PUT"
  - "The CBooking `in` lookup uses indexed where[0][value][n] keys (PHP parses both forms; the shared fake only parses indexed)"
metrics:
  tasks_total: 3
  tasks_done: 3
  commits: 3
  plan_head_before: c7ab2f3fe2d25f16e1be293b798a025cbf3d38e2
  plan_head_after: 8273a73118753742f06ccba85f0f4c29f9bd05e3
  completed: 2026-10-19
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
---

# Phase 82 Plan 07: EspoCRM person sync Summary

A `sync.espo` row now makes EspoCRM equal the current Supabase state of one person: one Contact (cached id, else found by any identity email, else created with the duplicate check skipped) and one CBooking per non-abandoned booking, upserted by `supabaseBookingId` and linked to that Contact. Orphan bookings (GNet placeholder email, anonymised) write a Contact-less CBooking.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: person with one booking -> Contact -> linked CBooking -> espo_contact_id stored; router branch; isolation allowlist | 0d77cc8c |
| 2 | Contact convergence: cached id/404, find by any email, 400/409 ladders, email merge/split, phone only when empty, signup-only, erasing | 2f64cd20 |
| 3 | CBooking convergence: diff/PUT, anonymised blanking, orphans, unmapped, deadline, ordering/idempotency/concurrency, mapper parity | 8273a731 |

## What was built

- `lib/customer-mapping.ts`: `buildCBookingDraft` (rowToBooking semantics, same enums, amounts, payment method, Prague pickup conversion, caps; anonymised -> passengerName/flightNumber/pickup/dropoff empty, driverName kept), `buildContactDraft` (primary = first non-phone email, all identity emails, names from profile then newest booking, phone = first E.164 only), `CBOOKING_SYNCED_FIELDS`. The backfill phone guesser is not ported.
- `lib/crm-sync.ts`: `deliverEspoSync`. Person path: identity_missing / identity_erasing skips, `ensureContact` (cached GET with 404 -> forget id, find by emails primary first, POST with `X-Skip-Duplicate-Check`, 400 -> retry without phone, 409 -> re-find), update path writes only the merged `emailAddressData` (adds identity emails, removes only addresses `emailOwners` maps to another identity, keeps exactly one primary and operator flags) and `phoneNumber` only when empty (400 tolerated). `upsertBookings`: one `in` list call (chunks of 50; 400 falls back to per-booking equals), POST missing (409 -> re-find and PUT), PUT only changed keys; `accountId` copied from the Contact when set; anonymised bookings get `contactId: null`. Unmapped bookings are skipped, the rest written, row completes `failed booking_unmapped` with one `[crm-sync] ALERT` line. 45 s deadline guard before every write reschedules 5 s ahead with code `deadline` and `dl<attempts>` dedup suffix. Log line is `[crm-sync] key outcome code` only.
- `lib/lead-sync.ts`: `sync.espo` -> `crm_unconfigured` breaker when no config, else `deliverEspoSync`; failures go through the existing `handleFailure` (transient retry, 401/403 `crm_auth` breaker).
- When the Contact id changes, a `sync.chatwoot` refresh is enqueued (syncBucketKey + publish, suffix `f`) so the Chatwoot CRM link is filled even if Chatwoot ran first.
- Isolation guard allowlist entry for `lib/crm-sync.ts` (reason from the plan).

## Verification

- `npx vitest run` on crm-sync, customer-mapping-parity, espocrm-booking-map, lead-sync, lead-sync-booking, sync-resolve, infra-vps-isolation-guard, identity-store, outbox: 334 passed.
- `tsc --noEmit`: no error in lib/ or app/ or the touched tests; `eslint --quiet` clean on every touched file; no `infra/` import in either lib file (also asserted by a test).
- Full suite in this worktree: 5676 passed, 6 files fail. Five are `next-intl` module-resolution failures caused by the symlinked main-checkout `node_modules` (account-trips, auth-customer, login-actions, passenger-actions, profile-actions; same environment note as 82-01) and `Step6Payment` (Stripe locale) which touches none of this plan's files. Re-run on the main checkout to confirm.

## Deviations from Plan

**1. [Process] Implementation written before tests.** Same as 82-01: no observed RED run. `lib/crm-sync.ts` and `lib/customer-mapping.ts` therefore landed whole in the Task 1 commit; Tasks 2 and 3 commits add the Contact and CBooking test suites (and parity test) against that code. All behaviours in the plan's behavior lists are covered by tests with the required names.

**2. [Rule 1 - test fix] `tests/sync-resolve.test.ts`.** The 82-01 test asserting `sync.espo` completes `failed unsupported_event` became obsolete; it now asserts the CRM gate (`breaker crm_unconfigured`) and keeps `sync.chatwoot` as unsupported until 82-10.

**3. [Rule 2 - robustness] Chatwoot refresh before storing the id** (see decisions), and `no_email` skip for a person whose identity emails all fail validation (unreachable in practice).

## Known Stubs

None.

## Threat Flags

None beyond the register (T-82-19..22). Every `where` value passes `encodeURIComponent`; logs carry ids and codes only.

## Open points for the orchestrator

- Cross-link edge: a Contact found by email may still belong to another identity until that identity's own sync removes the address after a split (the split removal runs on the next sync of the original identity). Not mitigated here; 82-14 live smoke / 82-15 counts should watch for it.
- RESEARCH A4 (`in` operator and whole-list `emailAddressData` PUT semantics) remains unverified live; fallbacks are implemented and tested against the fake. Live confirmation is 82-14.
- No live EspoCRM write or probe was made by this plan.

## Self-Check: PASSED

- Files exist: lib/customer-mapping.ts, lib/crm-sync.ts, tests/crm-sync.test.ts, tests/customer-mapping-parity.test.ts.
- Commits exist: 0d77cc8c, 2f64cd20, 8273a731.
- STATE.md and ROADMAP.md untouched.
