---
phase: 80-espocrm-deployment-core-entities
plan: 13
subsystem: infra
tags: [espocrm, accounts, seed, crm, pii-cleanup]
status: blocked
requires:
  - phase: 80-12
    provides: owner-confirmed candidates, 56 CBookings and 29 Contacts in the CRM
  - phase: 80-11
    provides: crm-operators runbook naming seed-accounts.mjs
provides:
  - infra/espocrm/seed-accounts.mjs (planSeed, runSeed, CLI)
  - 5 partner Accounts live, 5 Contacts linked, 13 CBooking records relinked
affects: [phase-80-uat]
tech-stack:
  added: []
  patterns: [pure plan + thin apply, counts-and-ids-only output, read-only dry-run client]
key-files:
  created:
    - infra/espocrm/seed-accounts.mjs
    - tests/espocrm-seed.test.ts
  modified:
    - infra/vps/runbooks/crm-operators.md
key-decisions:
  - "Accounts and Contacts are preloaded and matched in code (lower-case name or website host), not with per-candidate GET filters: fewer requests, no case-collation dependence, same result"
  - "Free-mail domains never link Contacts even if a hand-edited candidate carries one"
  - "Optional candidate field `note` fills cOtherTypeNote only for type Other"
requirements-completed: [CRM-01, CRM-03]
commits: 2
plan_head_before: cc27bc9585ad3c47c7728dfeb33d1c7855b02486
plan_head_after: 90ddb8011f15a19bc413362207ce4f50ff081c90
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 80 Plan 13: Partner Account seeding Summary

**Five owner-confirmed partner Accounts created in EspoCRM, their Contacts linked, and the whole booking history relinked so each Account shows its bookings; the customer-data working files are deleted. The owner walk-through (Task 3) is still open.**

## Status

Tasks 1 and 2 complete. Task 3 (owner walk-through, `checkpoint:human-verify`, blocking-human) is awaiting the owner. This SUMMARY is partial.

## Live results (counts and ids only)

| Step | Result |
|------|--------|
| `seed-accounts.mjs --dry-run` | `accounts: create=5 existing=0`, `contacts: link=5 already_linked=0 ambiguous=0` |
| `seed-accounts.mjs` | 5 Accounts created, 5 Contacts linked |
| `backfill.mjs --relink` | `update=13 unchanged=43` |
| Per Account CBooking count | 4, 4, 2, 2, 1 (sum 13, matches relink) |
| Per Account Contact count | 1 each |
| Re-run seed | `accounts: create=0 existing=5`, `contacts: link=0 already_linked=5 ambiguous=0` |
| Re-run relink | `update=0 unchanged=56` |
| Canary | `count Account name=Restore Drill Canary` = 1, never written |
| `sync.mjs --dry-run` | `create=0 update=0 removed=0` |
| `verify-acl.mjs` | `acl: pass=78 fail=0` |

Confirmed list (owner, 80-12): 3 Corporate (Connect Lifestyle Ltd, NIPPON STEEL TRADING AUSTRIA GmbH, Hyundai Corporation EU Holdings GmbH), 2 Agency (Travel Express Services LLP, Ana Sofia Correia LDA - The Boutique Traveler). Gnet was not confirmed and created nothing.

Account ids: 6ad3c81acb38836a3, 6ad3c81ae79353a88, 6ad3c81b10461c3ca, 6ad3c81b2d99033b4, 6ad3c81b4a3936096.

## Task Commits

1. Task 1 (tracer): `bc31ece8` feat(80-13): seed owner-confirmed partner accounts and relink booking history
2. Task 2: `90ddb801` chore(80-13): phase 80 regression green; customer-data working files removed

## Tests and gates

- `tests/espocrm-seed.test.ts`: 16 tests (confirm-only, reuse by name and website, Other note, link rules, ambiguity, canary and bad type abort, zero confirmed, idempotent second run, dry-run is GET-only and prints no name or email, CLI exit codes 0/1/2).
- Full phase set (13 files): 500 tests passed.
- `npx tsc --noEmit`: 8 errors, all in the existing tests/ baseline; none new.
- eslint on the two new files: clean.

## PII cleanup

`infra/espocrm/.work/export/` and `candidates.json` deleted from the main checkout after seeding and relink were verified; `ls infra/espocrm/.work` is empty and the existence check exits non-zero. Both were git-ignored throughout. Note: a re-run of the seed now needs a fresh export plus candidates file.

## Deviations from Plan

**1. [Rule 3 - Blocking] Runbook flags documented**
- The runbook said seed-accounts.mjs was "added by plan 80-13". Updated step 3 to the real flags (`--dry-run`, `--candidates`, `--input`, `--delay-ms`), the count lines and the first-round result. `tests/crm-runbook.test.ts` still passes (65/65); no needle changed.

**2. [Implementation choice] Preload instead of per-candidate GET filters**
- The plan described `GET /Account where name equals / website contains`. The seed preloads Accounts and Contacts once and matches in code. Behaviour is the same (case-insensitive name, website host equals domain) and it does not depend on server collation.

**3. [Rule 1 - tsc] Test typing**
- Two `possibly undefined` errors in the new test fixed (optional chaining / cast) so the tests/ error count stays at the 8-error baseline.

No auth gates and no 401/403 occurred.

## Known Stubs

None.

## Threat Flags

None. Writes are limited to `POST /Account` and `PUT /Contact/{id}` with the Sync writer key.

## Deferred: Task 3 owner walk-through

Pending. Checklist handed to the owner:

1. Accounts list shows the 5 companies with their types.
2. A company's Contacts panel and Bookings panel (date, route, vehicle, status, EUR amount).
3. A Contact's Bookings panel.
4. Opportunity Kanban shows the Prestigo stages (glance only).
5. Partner terms panel (commission; payment terms = Invoice shows the due-days field) and one Partner rate (route, V-Class, price, valid from/to).
6. Roles (Dispatcher sees Accounts without commercial fields) and mail.
7. Booking Admin link (80-02): merged to local main, not yet deployed to production; record "deep link pending deploy" and re-check after the production merge.

## Self-Check: PASSED

- infra/espocrm/seed-accounts.mjs, tests/espocrm-seed.test.ts: present
- commits bc31ece8, 90ddb801: present
