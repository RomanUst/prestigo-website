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
  - "D-14 (owner): confirm rows 1 Corporate, 2 Agency, 3 Agency, 5 Corporate, 6 Corporate; row 4 (Gnet) NOT confirmed. 5 confirmed, no Account created in this plan (80-13)"
  - "Continuation: UAT records deleted by orchestrator, dry-run now equals approved numbers; --limit 1 live write failed with POST /Contact -> 400 (empty reason). Held at the first unexpected result, nothing written"
actuals:
  tokens: 40000
  tasks: 2
  commits: 4
plan_head_before: 786d6458ec8897022667490a19f80a7e16acb84d
---

# Phase 80 Plan 12: Booking history backfill + D-14 candidates Summary (PARTIAL, blocked)

**Candidate scan CLI built, tested and run live (6 candidates, no email in output). The live booking write is held back: the dry-run differs from the approved numbers because of the temporary UAT Test Contact.**

## Status

| Task | State |
| ---- | ----- |
| 1 live backfill | BLOCKED (continuation): dry-run matches approved numbers, but `--limit 1` failed at `POST /Contact -> 400`. CBooking=0, Contact=0 (nothing written) |
| 2 account-candidates CLI | done, commit 9275aea5, 44/44 tests, eslint clean |
| 3 D-14 owner decision | DONE: owner confirmed 5 of 6 (see below); candidates.json verified |

## Continuation run (2026-10-17)

UAT records were deleted by the orchestrator (CRM: Contact=0, Opportunity=0, Account=1 canary). Results:

- Dry-run (`--input` main-checkout export): rows=56 eligible=56 excluded_abandoned=0 invalid=0 duplicate_rows=0; by_status cancelled=19 completed=24 confirmed=10 unpaid=3; by_source gnet=6 manual=23 online=27; by_payment_method Stripe=35 Invoice=4 Cash=8 Other=9; contacts create=29 update=0 unchanged=0; bookings create=56 update=0 unchanged=0 without_contact=0. **Equal to the approved D-21 lines.**
- `backfill.mjs --limit 1`: plan was contacts create=1, bookings create=1; the first write `POST /Contact` returned **400** with an empty body and empty X-Status-Reason (exit 2). Not a 401/403 (no auth problem, no ban risk).
- After the failure: `inspect.mjs count CBooking` = 0, `count Contact` = 0. Nothing was written, no partial state; the full run, repeat run and audit were NOT executed.
- Cause not yet established. The first Contact payload has 4 fields (firstName 5 chars, lastName 8 chars, emailAddress, phoneNumber = 9 bare digits with no country prefix). Most likely suspect: EspoCRM phone-number validation rejecting a number without an international prefix (the 400 is a validation-type response); other suspects: a required Contact field added by an earlier plan's metadata, or an email-address validation rule. A further diagnostic that replays the real payload to capture response headers was blocked by the auto-mode PII classifier, so it was not worked around.
- Suggested next step (needs a decision/permission, and a fix in `infra/espocrm/lib/booking-map.mjs` rowToContact with tests if phone is the cause): capture the 400's X-Status-Reason via the client with a PII-masked logger, then either normalise phones to E.164 (needs a default country, e.g. +420 for 9-digit CZ numbers, which may be wrong for other customers) or send the Contact without phoneNumber when it does not validate (phone stays only on the booking). Then repeat: dry-run, `--limit 1`, full run, repeat run, `--audit`, `count CBooking` = 56, `count CBooking contactId=` = 0.

## Task 3: D-14 owner decision (done, answered by owner)

Owner reply: "1 Corporate, 2 Agency, 3 Agency, 5 Corporate, 6 Corporate" (row 4 Gnet not confirmed; it is the `gnet.local` placeholder source, not a real partner).
`infra/espocrm/.work/candidates.json` (git-ignored) verified: rows 1, 5, 6 = Corporate confirm:true; rows 2, 3 = Agency confirm:true; row 4 confirm:false, type null. `selectConfirmed` returns **confirmed=5**. No Account was created, renamed or deleted in this plan; seeding is plan 80-13.

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
