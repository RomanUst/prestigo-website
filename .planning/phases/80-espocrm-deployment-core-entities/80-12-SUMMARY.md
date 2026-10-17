---
phase: 80-espocrm-deployment-core-entities
plan: 12
subsystem: infra
tags: [espocrm, backfill, account-candidates, crm, phone-normalisation]
status: complete
requirements: [CRM-03, CRM-01]
requires: ["80-08", "80-09"]
provides:
  - "infra/espocrm/account-candidates.mjs: runCandidates, parseArgs (D-14 scan; --input, --out limited to .work/)"
  - "infra/espocrm/lib/booking-map.mjs: normalizeContactPhone, KNOWN_CALLING_CODES; rowToContact now sends an E.164 phone or none"
  - "infra/espocrm/backfill.mjs: contact_phones count line, phone_dropped retry; live backfill executed (CBooking=56, Contact=29)"
affects: [80-13]
key-files:
  created:
    - infra/espocrm/account-candidates.mjs
  modified:
    - infra/espocrm/lib/booking-map.mjs
    - infra/espocrm/backfill.mjs
    - tests/espocrm-candidates.test.ts
    - tests/espocrm-booking-map.test.ts
    - tests/espocrm-backfill.test.ts
decisions:
  - "D-14 (owner): confirm rows 1 Corporate, 2 Agency, 3 Agency, 5 Corporate, 6 Corporate; row 4 (Gnet) NOT confirmed. 5 confirmed, no Account created in this plan (80-13)"
  - "Phone (owner, 'как предлагаешь'): the CONTACT phone is normalised, the booking row keeps its original. Strip spaces/dashes/dots/parens; 00 -> +; E.164 kept; exactly 9 digits -> +420; 11-12 digits with a known calling code -> +; anything else omitted"
  - "A Contact whose normalised phone EspoCRM still rejects (400) is retried once without phoneNumber and counted as phone_dropped; the run does not fail"
  - "runCandidates takes a workDir option so tests can use a temp folder; default is infra/espocrm/.work"
actuals:
  tokens: 60000
  tasks: 3
  commits: 11
plan_head_before: 786d6458ec8897022667490a19f80a7e16acb84d
plan_head_after: 6da1cf66bd9a9184602b2c4c2b4c88a5ebefda6a
---

# Phase 80 Plan 12: Booking history backfill + D-14 candidates Summary

**All 56 historical bookings and their 29 Contacts are in EspoCRM, linked, idempotent and audit-clean; the 6 account candidates were scanned and the owner confirmed 5 (D-14).**

## Status

| Task | State |
| ---- | ----- |
| 1 live backfill | DONE: CBooking=56, Contact=29, bookings without contact=0, audit duplicates=0 |
| 2 account-candidates CLI | done, commit 9275aea5, 44/44 tests, eslint clean |
| 3 D-14 owner decision | DONE: owner confirmed 5 of 6; no Account created here (80-13) |

## Root cause of the earlier `POST /Contact -> 400` and the fix

EspoCRM validates `phoneNumber` and rejects numbers with no international prefix (`{"field":"phoneNumber","type":"valid"}`); E.164 `+420...` is accepted. The export holds phones in mixed shapes (aggregate counts from the orchestrator: international "+" 34, 9 bare digits 9, 11-12 digits without "+" 3, 10 digits 3, empty 6, other 1 bookings).

Fix (commit 6da1cf66), Contact only (the CBooking has no phone field, the source row keeps the original):

- `normalizeContactPhone` in `infra/espocrm/lib/booking-map.mjs`: strip spaces, dashes, dots, parentheses; leading `00` becomes `+`; `+` plus E.164 (`/^\+[1-9]\d{7,14}$/`) is kept; exactly 9 digits gets `+420`; 11-12 digits starting with a known calling code (420, 421, 43, 44, 49, 48, 36, 33, 39, 34, 31, 32, 41, 1, 7, 380, 972, 971, 90, 86, 81, 82, 91) gets `+` when the result is E.164; everything else (10 digits, empty, text) is omitted.
- `rowToContact` sends `phoneNumber` only when a usable number exists.
- `backfill.mjs`: a new `contact_phones: kept=N prefixed=N omitted=N` count line (per Contact, aggregate only); a 400 on `POST /Contact` that carried a phone is retried once without it (`phone_dropped`); a 400 on the later phone-fill `PUT` is skipped and counted the same way. A 400 that persists without the phone still fails the run.
- Tests: 96 in `tests/espocrm-booking-map.test.ts` (every rule, synthetic numbers) plus 3 new in `tests/espocrm-backfill.test.ts` (phone count line, retry without phone, persistent 400 still fails). `npx vitest run tests/espocrm`: 363/363; eslint clean; no new tsc errors.

## Task 1: live backfill (identity prestigo-sync, export from the main checkout)

| Step | Result |
| ---- | ------ |
| dry-run | rows=56 eligible=56 excluded_abandoned=0 invalid=0 duplicate_rows=0; by_status cancelled=19 completed=24 confirmed=10 unpaid=3; by_source gnet=6 manual=23 online=27; by_payment_method Stripe=35 Invoice=4 Cash=8 Other=9; contacts create=29; bookings create=56 without_contact=0. Equals the approved numbers |
| `--limit 1` | contacts create=1, bookings create=1; applied contacts=1 bookings=1 (the case that failed before: 9-digit phone, now `+420`-prefixed) |
| full run | contacts create=28 unchanged=1; bookings create=55 unchanged=1; applied contacts=28 bookings=55; phone_dropped=1 |
| repeat run | contacts create=0 unchanged=28 **update=1**; bookings create=0 update=0 unchanged=56; applied contacts=0 bookings=0 (see note) |
| `--audit` | records=56 duplicates=0, exit 0 |
| `inspect.mjs count CBooking` | 56 |
| `inspect.mjs count Contact` | 29 |
| `inspect.mjs count CBooking contactId=` | 0 (bookings without contact) |

Phone handling (aggregate, per Contact, from the plan): kept=20, prefixed=2, omitted=7 (total 29). Live write: phone_dropped=1.

Note on the repeat run: it reports `update=1`, not 0. This is the one Contact whose phone EspoCRM rejects. Its number is `+` followed by only 9 digits (the format check passes the E.164 length rule but EspoCRM's own validator refuses it). The Contact exists without a phone; every re-run plans a phone fill for it, gets a 400, skips it and counts `phone_dropped=1`. Nothing is written (`applied: contacts=0 bookings=0`), no record changes, so the data is stable and idempotent in effect. Follow-up for the owner (optional): correct that one customer's phone in the source or in the CRM by hand; then the repeat run returns update=0.

No 401/403 occurred. No email, name or phone was printed (counts only; the one diagnostic printed only phone kind and digit counts). The Restore Drill Canary Account was not touched. The export stays in the main checkout (git-ignored), never copied or committed.

## Task 3: D-14 owner decision (done, answered by owner)

Owner reply: "1 Corporate, 2 Agency, 3 Agency, 5 Corporate, 6 Corporate" (row 4 Gnet not confirmed; it is the `gnet.local` placeholder source, not a real partner).
`infra/espocrm/.work/candidates.json` (git-ignored) verified: rows 1, 5, 6 = Corporate confirm:true; rows 2, 3 = Agency confirm:true; row 4 confirm:false, type null. `selectConfirmed` returns **confirmed=5**. No Account was created, renamed or deleted in this plan; seeding is plan 80-13.

## Task 2: live candidate scan (read-only, no CRM calls)

`node infra/espocrm/account-candidates.mjs --input <main checkout>/infra/espocrm/.work/export`: exit 0, `candidates: 6`, output checked with an email regex: 0 matches (stdout and candidates.json). File written to the git-ignored `infra/espocrm/.work/candidates.json`. Every entry started as confirm:false, type:null.

| # | Name | Domain | Bookers | Bookings | EUR | Suggested | D-14 |
| - | ---- | ------ | ------- | -------- | --- | --------- | ---- |
| 1 | Connect Lifestyle Ltd | connectlifestyle.com | 1 | 4 | 236 | Other | Corporate |
| 2 | Travel Express Services LLP | travelexpressservices.com | 1 | 4 | 0 | Agency | Agency |
| 3 | Ana Sofia Correia LDA - The Boutique Traveler | theboutiquetraveler.com | 1 | 2 | 142 | Agency | Agency |
| 4 | Gnet | gnet.local | 2 | 2 | 1047 | Other | not confirmed |
| 5 | NIPPON STEEL TRADING AUSTRIA GmbH | nst-eu.at | 1 | 2 | 1475 | Other | Corporate |
| 6 | Hyundai Corporation EU Holdings GmbH | (none, company name only) | 1 | 1 | 288 | Other | Corporate |

## Deviations from Plan

**1. [Rule 1 - Bug] Contact phone rejected by EspoCRM (`POST /Contact -> 400`).** Found during Task 1 live write. Fix: phone normaliser plus retry-without-phone, per the owner decision above. Commit 6da1cf66.

**2. [Observation] Repeat run shows contacts update=1 (not 0)** because of one customer's phone that EspoCRM rejects (above). No write occurs; data stable.

Earlier in this plan (before the continuation): the live write was first held because the temporary UAT Test Contact collided with an export customer (12 of 56 bookings); the orchestrator deleted the UAT records, after which the dry-run equalled the approved numbers.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

infra/espocrm/account-candidates.mjs exists; commits 9275aea5 and 6da1cf66 are in git log; `infra/espocrm/.work` is not tracked; live counts re-read from the CRM (CBooking=56, Contact=29, contactId empty=0, audit duplicates=0).
