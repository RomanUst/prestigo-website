---
phase: 80-espocrm-deployment-core-entities
plan: 12
subsystem: infra
tags: [espocrm, backfill, account-candidates, crm]
status: blocked
requirements: [CRM-03, CRM-01]
requires: ["80-08", "80-09"]
provides:
  - "infra/espocrm/account-candidates.mjs: runCandidates, parseArgs (D-14 scan; --input, --out limited to .work/)"
  - "tests/espocrm-candidates.test.ts: 5 CLI tests added (44 total)"
affects: [80-13]
key-files:
  created:
    - infra/espocrm/account-candidates.mjs
  modified:
    - tests/espocrm-candidates.test.ts
decisions:
  - "Task 1 live write NOT performed: the CRM already holds the UAT Test Contact, and its email is a customer in the export (12 of 56 bookings)"
  - "runCandidates takes a workDir option so tests can use a temp folder; default is infra/espocrm/.work"
actuals:
  tokens: 25000
  tasks: 1
  commits: 2
plan_head_before: 786d6458ec8897022667490a19f80a7e16acb84d
---

# Phase 80 Plan 12: Booking history backfill + D-14 candidates Summary (PARTIAL, blocked)

**Candidate scan CLI built, tested and run live (6 candidates, no email in output). The live booking write is held back: the dry-run differs from the approved numbers because of the temporary UAT Test Contact.**

## Status

| Task | State |
| ---- | ----- |
| 1 live backfill | HELD, no CRM write done. CBooking count is still 0 |
| 2 account-candidates CLI | done, commit 9275aea5, 44/44 tests, eslint clean |
| 3 D-14 owner decision | awaiting owner (candidate list below) |

## Task 1: why the live write was not run

Live dry-run (prestigo-sync, export unchanged, nothing written):

- export: rows=56 eligible=56 excluded_abandoned=0 invalid=0 duplicate_rows=0 (same as approved)
- by_status / by_source / by_payment_method: identical to the approved 80-09 lines
- contacts: **create=28 update=1** (approved: create=29 update=0)
- bookings: create=56 update=0 unchanged=0 without_contact=0
- `inspect.mjs count CBooking`: count=0

Cause (checked without printing any personal data): the CRM has exactly 1 Contact (the temporary "UAT Test" Contact, owner's own gmail, linked to "UAT Test Account"). That email is also a customer in the export: **12 of 56 bookings** carry it, and it is the first row in export order. A live run would therefore (a) fill the UAT Contact's phone number (the `update=1`), and (b) link 12 real bookings to the UAT Contact and take on the UAT Account's accountId. `--limit 1` would hit the same Contact. That contradicts the rule that the UAT records are not touched, and when the UAT records are deleted later those 12 bookings would be left pointing at a deleted Contact. So the run was stopped at the first unexpected number.

Options for the owner / orchestrator:

1. **Delete the three UAT records first** (Account, Contact, Opportunity), then run the backfill unchanged. The dry-run then returns the approved `create=29 update=0`, and the 12 owner bookings get a normal Contact. Recommended.
2. Run the backfill now and accept that the UAT Contact becomes the owner's real Contact (phone filled, 12 bookings linked, UAT Account link kept); rename or move later by hand.
3. Skip the owner's 12 bookings (needs a small exclusion option in backfill.mjs plus tests; then CBooking total would be 44, not the approved 56).

Resume steps once decided (unchanged from the plan): dry-run, `--limit 1`, full run, repeat run (create=0 update=0), `--audit` (duplicates=0), `inspect.mjs count CBooking` = 56 (option 1/2) and `count CBooking contactId=` = 0. Run with `--input /Users/romanustyugov/Desktop/Prestigo/infra/espocrm/.work/export`.

## Task 2: live candidate scan (read-only, no CRM calls)

`node infra/espocrm/account-candidates.mjs --input <main checkout>/infra/espocrm/.work/export`: exit 0, `candidates: 6`, output checked with an email regex: 0 matches (stdout and candidates.json). File written to the worktree's git-ignored `infra/espocrm/.work/candidates.json` and copied (mode 600, no emails inside) to the main checkout's `infra/espocrm/.work/candidates.json`. Every entry is confirm:false, type:null. Canary name does not appear; no UAT record is in the export, so none is listed.

| # | Name | Domain | Bookers | Bookings | EUR | Suggested |
| - | ---- | ------ | ------- | -------- | --- | --------- |
| 1 | Connect Lifestyle Ltd | connectlifestyle.com | 1 | 4 | 236 | Other |
| 2 | Travel Express Services LLP | travelexpressservices.com | 1 | 4 | 0 | Agency |
| 3 | Ana Sofia Correia LDA - The Boutique Traveler | theboutiquetraveler.com | 1 | 2 | 142 | Agency |
| 4 | Gnet | gnet.local | 2 | 2 | 1047 | Other |
| 5 | NIPPON STEEL TRADING AUSTRIA GmbH | nst-eu.at | 1 | 2 | 1475 | Other |
| 6 | Hyundai Corporation EU Holdings GmbH | (none, company name only) | 1 | 1 | 288 | Other |

Note: #4 "Gnet" is the placeholder domain used for the gnet-source bookings (`gnet.local`), not a real partner company; suggest not confirming it (or confirming only if the owner wants a "Gnet" partner Account, type Agency).

## Deviations from Plan

**1. [Blocker] Live write held: unexpected dry-run number (UAT Test Contact collision).** See Task 1. No code defect; backfill.mjs unchanged.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

infra/espocrm/account-candidates.mjs exists; commit 9275aea5 in git log; candidates.json not tracked (`git status` clean for infra/espocrm/.work).
