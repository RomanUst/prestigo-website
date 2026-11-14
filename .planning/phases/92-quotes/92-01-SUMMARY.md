---
phase: 92-quotes
plan: 01
subsystem: database
tags: [quotes, migration, rls, guard-triggers, ledger, fake-db]
requires: []
provides:
  - "supabase/migrations/091_quotes.sql sections 1-8 (not applied; 92-12 applies it live)"
  - "lib/quotes/events.ts: QUOTE_EVENT_KINDS, appendQuoteEvent, hasQuoteEvent"
  - "LEDGER_KINDS gains quote_deposit, quote_remainder"
  - "fake payments DB models the eight quote tables with CHECKs, unique rules and guards"
affects: [92-02, 92-06, 92-09, 92-12, 92-13, 92-16]
tech-stack:
  added: []
  patterns:
    - "deny-all tables (REVOKE ALL + RLS + USING(false) / WITH CHECK(false))"
    - "BEFORE guard triggers with a transaction-local erasure bypass (prestigo.quote_erasure)"
    - "exactly-once event ledger keyed (quote_id, event_key)"
key-files:
  created:
    - supabase/migrations/091_quotes.sql
    - tests/migration-091.test.ts
    - lib/quotes/events.ts
    - tests/quote-events.test.ts
  modified:
    - tests/helpers/latest-migration.ts
    - tests/helpers/fake-payments-db.ts
    - lib/payments/state.ts
    - tests/migration-089.test.ts
    - tests/payments-migration-087.test.ts
key-decisions:
  - "Guard functions are plain plpgsql with search_path '' (no SECURITY DEFINER), revoked from PUBLIC, anon, authenticated"
  - "remainder_method CHECK is written as CHECK (remainder_method IN (...)) so latestCheckValues can read it; NULL passes a CHECK anyway"
  - "Table-level CHECKs deposit-percent and deposit-split are named (quote_versions_deposit_percent_check, quote_version_lines_deposit_split_check) so the fake DB can report them by name"
requirements-completed: [QUOTE-01, QUOTE-05, QUOTE-06]
status: complete
duration: ~1h
completed: 2026-11-14
estimate:
  tokens: 62000
  raw_tokens: 62000
  tasks: 3
  confidence: low
actuals:
  tokens: 90000
  tasks: 3
  commits: 4
plan_head_before: 6325ca5e50e19adb7b7cf63038485cfc259b9250
plan_head_after: 50744b06f98e96a771e202fc0abb7688150b5bf5
commits: 4
---

# Phase 92 Plan 01: Quote schema (migration 091) Summary

Migration 091 (first part): quotes, immutable versions with lines and stops, hashed links, the acceptance log, the quote event ledger, the stored PDF table and the booking link columns, with guard triggers, deny-all access and the widened ledger / consent CHECKs; the fake DB and `LEDGER_KINDS` follow it, and `lib/quotes/events.ts` writes the quote ledger exactly once per key.

## What was built

- **Task 1 (tracer)** - `supabase/migrations/091_quotes.sql` sections 1-4: `quotes`, `quote_versions` (named `quote_versions_locale_check` equal to `locales` of `i18n/locales.ts`, zh-hant included; no DEFAULT on deposit_kind / deposit_value / remainder_method; `quote_versions_frozen_complete`), `quote_version_lines`, `quote_version_line_stops`, `quote_links` (only `token_hash`, 64 lowercase hex, unique). Both DEFERRABLE foreign keys from `quotes` to `quote_versions`. All tables deny-all. `latestCheckValues` now also reads hyphenated values (so `'zh-hant'` is read). `tests/migration-091.test.ts` pins every column, CHECK and deny-all block; the locale expectation is derived from `locales`, never typed.
- **Task 2** - sections 5-8: `quote_acceptances`, `quote_events` (named `quote_events_kind_check`, unique `(quote_id, event_key)`), `quote_documents`; `bookings.quote_id / quote_line_id / quote_deposit_minor` with the unique partial index `bookings_quote_line_id_key` and `bookings_quote_id_idx`; ledger kind CHECK = full 089 list + `quote_deposit`, `quote_remainder`; consent mode CHECK adds `'quote'` (the locale CHECK is not touched: it belongs to 090); three guard functions and five triggers. `LEDGER_KINDS`, `FAKE_PAYMENT_VOCABULARY.kinds` and the fake DB follow (eight quote tables, defaults, CHECK emulation, FKs, the four unique rules plus reference / version_no / position, frozen-version guard, append-only logs).
- **Task 3** - `lib/quotes/events.ts` (`QUOTE_EVENT_KINDS`, `QuoteEventKind`, `QuoteEventInput`, `appendQuoteEvent`, `hasQuoteEvent`) and `tests/quote-events.test.ts` (runs against the fake DB; includes the SQL parity test).

## Commits

| Hash | Subject |
|------|---------|
| 9e74489a | feat(92-01): quote schema 091 - quotes, versions, lines, stops and hashed links |
| 3c693c14 | security(92-01): quote acceptance log, event ledger, booking link columns, guard triggers |
| a19a3cf4 | feat(92-01): appendQuoteEvent writes the quote ledger exactly once per key |
| 50744b06 | chore(92-01): single-space token_hash column in 091 so the plan's grep matches |

## Verification

- `npx vitest run tests/migration-091.test.ts tests/quote-events.test.ts tests/payments-state.test.ts tests/payments-migration-085.test.ts tests/migration-089.test.ts tests/payments-migration-087.test.ts`: 6 files, 222 tests passed.
- All 44 test files that import the fake payments DB, `LEDGER_KINDS` or `latest-migration`: 2208 of 2211 passed; the 3 failures are explained below (1 fixed, 2 pre-existing and unrelated).
- `npx tsc --noEmit`: 8 errors, all the old baseline ones in `tests/` (`i18n-translate-dnt` 2, `nav-auth` 5, `passenger-actions` 1); none in touched files.
- `npx eslint --quiet` on the touched source and test files: clean.
- Plan acceptance greps all satisfied (091 is the last migration, no `090_quotes`, no `booking_payment_consents_locale_check` in 091, `security:` prefix on the 091 commit that last changed the guards).
- The SQL was never run (no Supabase access, per instructions); only text tests and the fake DB model it. The guard trigger bodies (jsonb OLD/NEW handling) and the `to_jsonb(OLD) - 'payment_intent_id' - 'confirmed_at'` comparison therefore have no live proof until the 92-12 smoke.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tests pinned to the "latest" CHECK list broke when 091 appended to it**
- **Found during:** Task 2 (wide test run over every file using the fake DB / ledger helpers)
- **Issue:** `tests/migration-089.test.ts` ("latest CHECK is the full 087 list followed by extra_charged and extra_failed") and `tests/payments-migration-087.test.ts` ("consent mode gains cash_setup", exact list) asserted the whole latest list; 091 legitimately appends `quote_deposit`, `quote_remainder` and `'quote'`.
- **Fix:** the 089 test now checks the head of the list (087 list + the two 089 kinds); the 087 test uses `arrayContaining`. The new full-list assertions live in `tests/migration-091.test.ts`.
- **Files modified:** tests/migration-089.test.ts, tests/payments-migration-087.test.ts
- **Commit:** 3c693c14

**2. [Rule 1 - Format] `token_hash` column written with single spaces**
- The plan's acceptance grep `token_hash text NOT NULL UNIQUE` did not match the column-aligned formatting used elsewhere in the file. Reformatted that one line.
- **Commit:** 50744b06

### Plan choices worth knowing

- The two table-level CHECKs (deposit percent range, deposit share + remainder = amount) are named constraints; the plan listed them unnamed. Names: `quote_versions_deposit_percent_check`, `quote_version_lines_deposit_split_check`. The landing all-or-none CHECK is `quote_version_lines_landing_complete_check` (089 name with the table swapped).
- `quote_versions_remainder_method_check` is `CHECK (remainder_method IN (...))` without an `IS NULL OR` (NULL satisfies a CHECK) so that `latestCheckValues` reads it.
- `hasQuoteEvent` throws `Error('quote event read failed')` on a database error (the plan only fixed the write message).
- `quote_events` UPDATE is always rejected by `quote_log_guard`; only `quote_acceptances` has the two once-only writes (the columns exist only there).
- The fake DB does not model cascades on quote deletion, nor the erasure bypass (`prestigo.quote_erasure`); 92-12 proves the erasure SQL by text test.

## Deferred Issues

Two tests fail in the wide run and are NOT caused by this plan (they fail at the request-schema parse, before any database access; `app/api/card-checkout/intent/route.ts` and its schema are untouched here):

- `tests/card-checkout-intent.test.ts` "consent missing -> 422 CONSENT_REQUIRED" (gets 400)
- `tests/card-checkout-cash.test.ts` "the consent must be the JSON boolean true for cash as well" (the `consent: undefined` iteration gets 400)

Cause: a missing `consent` key fails the zod parse (400 INVALID_REQUEST) while the tests expect the 422 business answer. Not verified against the base commit by running it there; the reasoning is that the failure path never reaches the fake DB. Left for the orchestrator.

## Known Stubs

None. (`lib/quotes/events.ts` and the migration are complete for this plan's scope; the conversion function (92-06) and the erasure copies (92-12) are appended to 091 by later plans, marked by the closing comment of section 8.)

## Threat Flags

None beyond the plan's register (T-92-01..04 mitigated in SQL and text-tested; T-92-SC accepted, no package installed).

## Notes for the orchestrator

- Apply `091_quotes.sql` live only in 92-12 (after 92-06 and the erasure copies are appended), then smoke: deny-all via the anon key on all eight tables, frozen-version update raises `quote_version_frozen`, acceptance delete raises `quote_log_append_only`.
- Known worktree artefact check: no test in this plan's set failed to LOAD through the symlinked `node_modules`.

## Self-Check: PASSED

- Files exist: supabase/migrations/091_quotes.sql, tests/migration-091.test.ts, lib/quotes/events.ts, tests/quote-events.test.ts.
- Commits exist: 9e74489a, 3c693c14, a19a3cf4, 50744b06.
