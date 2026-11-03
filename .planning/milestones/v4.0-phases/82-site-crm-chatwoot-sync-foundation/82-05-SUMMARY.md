---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 05
subsystem: sync / identity
tags: [supabase, identity, phone-matching, security, tdd]
status: complete
requires:
  - phase: 82-01 (migration 069 live: identity tables, identity_resolve_core email rules, identity_person shared-phone filter)
provides:
  - public.identity_normalize_phone (SQL port of lib/phone.ts normalizePhone)
  - phone-aware public.identity_resolve_core (D-04 merge-by-phone, D-05 shared numbers, signup and erasing guards)
  - lib/identity.ts (normalizeIdentityEmail, normalizeIdentityPhone, ERASED_EMAIL_DOMAIN)
  - tests/fixtures/identity-cases.json (shared by the TS test and the live SQL smoke)
affects: [82-08, 82-09, 82-11, 82-14]
key-files:
  created:
    - supabase/migrations/072_identity_phone_rules.sql
    - lib/identity.ts
    - tests/identity.test.ts
    - tests/fixtures/identity-cases.json
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-05-smoke.sql
  modified: []
decisions:
  - "D-04/D-05 implemented literally: the first phone-only merge for a number happens and flips it to shared (source auto) in the same transaction; no extra guard (for example last-name check) because no locked decision asks for it"
  - "A signup that phone-merges into a guest identity (user_id NULL) claims it, same as the email-match branch; a signup is never merged into an identity of a different account"
  - "A phone_flags row with shared = false (owner said not shared) is respected: automatic flags are INSERT ... ON CONFLICT DO NOTHING and never override an owner row"
  - "identity_normalize_phone builds its character classes with chr() (no regex backslash-u escapes, ASCII-clean file); the code-point tables are parsed back out of the migration text by the test and run in JS over the fixtures"
  - "normalizeIdentityEmail does not import lib/lead-mapping (no currency/CRM chain); it mirrors identity_normalize_email, so it also rejects a missing local part and addresses over 254 characters"
metrics:
  tasks_total: 3
  tasks_done: 3 (Tasks 1-2 executor; Task 3 orchestrator via Supabase MCP)
  commits: 3
  plan_head_before: c7ab2f3fe2d25f16e1be293b798a025cbf3d38e2
  plan_head_after: 81d1890a6cdfcf53e17f71249f1753e8dd39ea4d
  completed: 2026-10-19
actuals:
  tokens: 60000
  tasks: 2
  commits: 3
---

# Phase 82 Plan 05: Identity phone rules Summary

Identity resolution now matches by phone exactly as D-04 and D-05 say: a new email that arrives with an un-shared E.164 phone owned by exactly one person joins that person (marked basis `phone` + `via_phone`), and the merge flips the number to shared so it can never merge again; collisions, owner-flagged numbers, signups of another account and erasing owners are all protected. Migration 072 is written and tested but NOT yet applied live (Task 3 is the orchestrator's).

## Status

Code, fixtures and tests (Tasks 1 and 2) are complete and committed. Task 3 (apply 072 live, rolled-back smoke, advisor check) was done by the orchestrator on 2026-10-19 ~20:05 UTC (see below). The smoke SQL is committed at `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-05-smoke.sql`.

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: new email + known un-shared phone -> merged (basis phone) -> number shared | done | 9c1e67a4 |
| 2 | Shared-number protections: collision, manual flag, signup guard, erasing owner, phone-only rows | done | 89a25a15 |
| 3 | Apply 072 live + SMOKE_OK_82_05 + advisors (orchestrator, Supabase MCP) | DONE (orchestrator) | smoke SQL 81d1890a |

Task 1's resolver branches were all written in the tracer commit (the five rules are one function); Task 2's commit adds the drift guards on top (the SQL normaliser executed in JS from the migration's own code-point constants, and rule-branch contract tests).

## What was built

- **`supabase/migrations/072_identity_phone_rules.sql`**
  - `identity_normalize_phone(text)`: IMMUTABLE, `SET search_path = ''`, line-by-line port of `lib/phone.ts` (invisible marks, four Unicode digit blocks, fullwidth plus/brackets/dot, Unicode dashes, JS-equivalent whitespace set, `(0)` drop, `00` prefix, `+` required, `+420/+421` followed by 0 rejected, trunk zero dropped after 44 49 43 41 31 32 33 36 48, `^\+[1-9][0-9]{7,14}$`). No country guessing.
  - `identity_resolve_core(text, text, text, uuid)`: same signature and SECURITY DEFINER / empty search_path as 069. Rules: (1) unusable email -> `no_identity`; shared numbers are treated as absent; (2) email already owned -> `erasing` or attach account + handle phone; (3) new email of a user who already has an identity -> joins it (basis `signup`); (4) new email + un-shared phone owned by exactly one live identity of no other account -> `identity_emails(basis 'phone', via_phone)` and `phone_flags(phone, true, 'auto')`; (5) otherwise a new identity, with the phone stored, flagged shared (live owner exists) or ignored (only an erasing owner).
  - REVOKE for both functions from PUBLIC/anon/authenticated, GRANT of the normaliser to service_role; `identity_resolve_core` stays ungranted (internal, caller holds the lock). Header documents the D-04/D-05 interplay and that 82-14 has the owner mark known agency/hotel desk numbers before the identity pass. `identity_person` (069) is untouched.
- **`lib/identity.ts`**: `normalizeIdentityEmail` (trim, lower-case; null for no usable local part, over 254 characters, `@gnet.local`, `@erased.invalid`), `normalizeIdentityPhone = normalizePhone`, `ERASED_EMAIL_DOMAIN`. Pure, no CRM import.
- **`tests/fixtures/identity-cases.json`**: 57 phone cases, 12 email cases, 13 scenarios (the 8 required plus manual-shared-after-owner, adjacency-single-not-shared, signup-phone-merge, signup-existing-account, unusable-phone).
- **`tests/identity.test.ts`** (173 tests): fixtures vs the TS normalisers; a pure reference model of rules 1-5 run over every scenario; named collision / manual / signup guard / erasing / adjacency tests; text-level contract of 072 (signature identical to 069, rule order, grants, no country guessing, no `ON CONFLICT ... DO UPDATE`); the SQL normaliser run in JS from the migration's own `chr()` tables over all 57 phone fixtures (this proved every code point in the migration).
- **`82-05-smoke.sql`** (generated from the fixture file, 1344 lines, 235 assertions): precondition `crm_sync_start` absent and no `+420777` phone in use; function shape (IMMUTABLE / SECURITY DEFINER / empty search_path); all 57 phone and 12 email fixtures; every scenario in its own sub-block under the advisory lock (ordinal of the identity per step, outcome, identity count, `basis 'phone'` merges with `via_phone`, `identity_phones` rows, shared flags with source, `identity_person(...).phones` never listing a shared number, account ownership); an end-to-end pass through `identity_resolve_booking` with two bookings (new email, same phone -> joined, marked, flagged); privilege checks. Ends with `RAISE EXCEPTION 'SMOKE_OK_82_05'` (DETAIL carries the assertion count, expected 235).

## Verification

- `npx vitest run tests/identity.test.ts tests/phone.test.ts tests/crm-sync-migrations.test.ts`: 3 files, 202 tests green (after Task 2: identity.test.ts alone 173 green).
- `npx eslint --quiet lib/identity.ts tests/identity.test.ts`: clean. `npx tsc --noEmit`: no errors in the new files (only the baseline `tests/` errors remain).
- Acceptance greps: `CREATE OR REPLACE FUNCTION public.identity_normalize_phone` count 1; `via_phone` count 3; fixtures have 57 phones / 13 scenarios and contain all 8 required scenario names.
- NOT run here: the migration against Postgres (no database tooling in the executor); the live smoke is the proof.

## Pending for the orchestrator (Task 3)

1. MCP `apply_migration` name `072_identity_phone_rules` with the file text.
2. MCP `execute_sql` with the contents of `82-05-smoke.sql`; the result must be exactly `SMOKE_OK_82_05` (DETAIL: `235 assertions`). Any other message names the failing assertion.
3. MCP `get_advisors` (security): no new ERROR naming `identity_normalize_phone` or `identity_resolve_core`.
4. Record the apply result, the assertion count, the smoke message and the advisor ERROR count here.

Things worth watching when the smoke runs (written without a database to test on): PostgreSQL regex handling of the `chr()`-built bracket classes in `identity_normalize_phone`; `auth.users` inserts need the empty token columns (already in the smoke); the booking insert shape is copied from `82-01-smoke.sql`.

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 2 - Missing critical functionality] Signup claim on a phone merge**
- **Found during:** Task 1 (rule 4)
- **Issue:** the contract for rule 4 inserts the email and flags the number but does not attach the signing-up account to the guest identity it lands on; the 069 email branch does ("a signup claims the identity"), so without it the account would have no identity linked to its `user_id` until the next resolve.
- **Fix:** rule 4 claims the identity (`user_id` set when the identity has none and the user has no other identity), guarded exactly like the email branch.
- **Files modified:** supabase/migrations/072_identity_phone_rules.sql (scenario `signup-phone-merge` pins it)
- **Commit:** 9c1e67a4

**2. [Rule 1 - Consistency] normalizeIdentityEmail aligned to the SQL normaliser**
- **Found during:** Task 1
- **Issue:** the contract defines it as `normalizeLeadEmail` plus the erased domain, but `identity_normalize_email` (069) also rejects a missing local part (`@x.com`) and addresses over 254 characters; the shared fixtures would otherwise diverge between TS and SQL.
- **Fix:** standalone implementation mirroring the SQL (also avoids pulling `lib/lead-mapping` and its currency import into an identity module). A test asserts agreement with `normalizeLeadEmail` wherever the lead rule yields an address.
- **Commit:** 9c1e67a4

### Known limits (documented, not fixed)

- SQL `identity_normalize_email` trims only space, tab, CR, LF while JS `trim()` also strips Unicode spaces; fixtures avoid such input. Not part of this plan's phone scope.
- Rule 2 stores a phone on the email-matched person when the only other owner is an erasing identity (literal reading of the contract); rule 5 ignores it in the same situation.
- Live ordering: which of two same-phone new emails becomes the primary depends on delivery order (backstop; the Identities page lists either outcome for a split).

## Authentication gates

None.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries; the two functions are REVOKEd from anon/authenticated. T-82-14, T-82-15, T-82-16 are mitigated in code (merge-once-then-shared, collision and manual flags, signup and erasing guards, one fixture file for TS and SQL).

## Self-Check: PASSED

- FOUND: supabase/migrations/072_identity_phone_rules.sql, lib/identity.ts, tests/identity.test.ts, tests/fixtures/identity-cases.json, .planning/phases/82-site-crm-chatwoot-sync-foundation/82-05-smoke.sql
- FOUND commits: 9c1e67a4, 89a25a15, 81d1890a
- STATE.md and ROADMAP.md untouched.

## Orchestrator: live apply (Task 3)

- `apply_migration 072_identity_phone_rules` → success (live 2026-10-19).
- The generated 80 KB smoke is too large for one MCP `execute_sql` payload, so it was run as four rolled-back DO blocks with identical assertions (the per-step blocks folded into VALUES loops; post-checks verbatim):
  - fixtures: 57 phone + 12 email normaliser cases → `SMOKE_OK_82_05_fixtures` (69 assertions) — the Postgres regex / chr() classes match the TS normaliser on every fixture.
  - part 1 (shape + scenarios 1-5) → `SMOKE_OK_82_05_part1` (64)
  - part 2 (scenarios 6-9) → `SMOKE_OK_82_05_part2` (45)
  - part 3 (scenarios 10-13 + booking resolver path + privileges) → `SMOKE_OK_82_05_part3` (57)
  - total 235 assertions = the generated smoke's DETAIL count.
- Leftovers after all runs: 0 identities, 0 identity_emails, 0 phone_flags, 0 smoke auth users, 0 SMK-82-05 bookings, 0 new outbox rows; crm_sync_start absent.
- `get_advisors` (security): 0 ERROR; nothing names identity_normalize_phone / identity_resolve_core.
