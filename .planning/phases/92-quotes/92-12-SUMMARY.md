---
phase: 92-quotes
plan: 12
subsystem: database
tags: [quotes, erasure, gdpr, migration, smoke, stripe]
requires: ["92-01", "92-06"]
provides:
  - "091 section 10: erasure_quote_ids, erasure_quote_payment_open (internal), erasure_quote_customer_ids (service_role), full copies of erasure_confirm, erasure_scope, erasure_anonymise_person with quote coverage"
  - "ErasureStore.quoteStripeCustomerIds and the union in the Stripe step of lib/erasure.ts"
  - "counts.quotes in the erasure scope and a Quotes row in the admin preview"
  - ".planning/phases/92-quotes/92-12-smoke.sql and 92-12-smoke-erasure.sql (rolled-back live smoke of 091)"
affects: [92-13, 92-16]
tech-stack:
  added: []
  patterns:
    - "full-copy SQL functions proven by statement-by-statement text tests against the previous body"
    - "transaction-local guard bypass (prestigo.quote_erasure) opened and closed inside the erasure function"
key-files:
  created:
    - .planning/phases/92-quotes/92-12-smoke.sql
    - .planning/phases/92-quotes/92-12-smoke-erasure.sql
  modified:
    - supabase/migrations/091_quotes.sql
    - tests/migration-091.test.ts
    - tests/migration-089.test.ts
    - tests/erasure-payment-pii.test.ts
    - tests/erasure.test.ts
    - tests/erasure-page.test.tsx
    - lib/erasure-store.ts
    - lib/erasure.ts
    - components/admin/ErasurePreview.tsx
    - components/admin/ErasureSearch.tsx
    - components/admin/ErasureConfirmForm.tsx
key-decisions:
  - "A quote is deleted only when it has no booking, no paid_at / remainder_paid_at, no refund, no deposit or remainder intent and no acceptance carrying an intent; every other quote of the person is anonymised in place"
  - "Quotes are matched by normalised email, by normalised phone from the request's frozen subject_phones (never a shared desk number), and through bookings.quote_id"
  - "Internal helper erasure_quote_ids added (not in the plan's interface list) so the matching exists once; revoked from every role like erasure_payment_open"
  - "erasure_quote_customer_ids also skips a customer a booking still uses for an unfinished payment"
requirements-completed: [QUOTE-01, QUOTE-02, QUOTE-05]
status: waiting-for-live-apply-checkpoint
duration: ~1h30
completed: 2026-11-14
estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low
actuals:
  tokens: 60000
  tasks: 2
  commits: 2
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: e7043edab27e85ca28911fd48726e4477326d34a
commits: 2
---

# Phase 92 Plan 12: Erasure coverage for quotes and the 091 smoke Summary

**Status: waiting for the live-apply checkpoint (Task 3). Tasks 1 and 2 are done and committed; migration 091 is NOT applied and the smoke has NOT been run.** The orchestrator applies 091 through the Supabase MCP and runs the two smoke files; this summary must be completed with their output ("091 live" and the has_function_privilege rows) before the plan counts as complete.

Quote personal data now goes with the person (D-19): migration 091 section 10 re-creates the three public erasure functions as full copies that delete the person's money-free, booking-free quotes and anonymise the others in place, the Stripe step also deletes the Customers stored on quotes, and the admin preview shows the quote count.

## What was built

- **Task 1 (tracer, `security:`)** - 091 section 10. New: `erasure_quote_ids(text[], text[], uuid[])` (internal), `erasure_quote_payment_open(text[], text[])` (internal, per the interface), `erasure_quote_customer_ids(uuid)` (service_role). Full copies: `erasure_confirm` and `erasure_scope` (088 bodies), `erasure_anonymise_person` (089 body). `erasure_anonymise_person` sets `prestigo.quote_erasure = 'on'` (transaction-local), deletes quotes with no booking and no money (versions, lines, stops, links, events, acceptances and documents cascade through the guards' bypass), anonymises the rest (client fields, line and stop addresses and coordinates, line flight number and free text, version billing note, acceptance ip / user agent, Stripe ids where nothing is in flight; links and stored PDFs deleted), closes the bypass, and reports `quotes_deleted` / `quotes_anonymised`. `erasure_confirm` answers `payment_open` when a quote has a deposit paid and unconverted, or a remainder started and neither paid nor cancelled; `erasure_scope` reports `counts.quotes`, adds quote payments to `counts.payment_open` and finds a person who only has a quote. Every function of the section is REVOKEd from PUBLIC, anon, authenticated again (the two internal helpers also from service_role).
- **Task 2** - `ErasureStore.quoteStripeCustomerIds` (rpc `erasure_quote_customer_ids`, a read error or malformed answer becomes `db_error`), unioned with the booking customers in the Stripe step before the Supabase step; scope mapping and preview payload carry `quotes`; `ErasurePreview` shows a Quotes row; `AnonymiseCounts` gains the two new counters. Smoke files written (see below).
- **Task 3 (checkpoint, NOT done)** - the orchestrator applies 091 and runs the smoke.

## Tests

Test-first for the SQL: the new `091 erasure coverage for quotes` block in `tests/migration-091.test.ts` failed (functions missing) before the SQL was generated. It compares the three copies statement by statement against the 088 / 089 bodies (only the `not_found` condition and the closing RETURN of `erasure_scope` are allowed to change shape and are pinned separately), pins the delete conditions, the anonymise statements, the bypass open / close order, the in-flight predicate, the helper bodies, the grants and the SECURITY DEFINER / empty `search_path` of all six functions.

## Smoke files (for the orchestrator)

`92-12-smoke.sql` (14985 bytes) and `92-12-smoke-erasure.sql` (9390 bytes). The single file the plan asked for would have been about 22 KB, over the plan's 16 KB limit, so the erasure half is a second file. Both follow the 91-01 style: run in order with `execute_sql`, each statement separately.

1. `92-12-smoke.sql`, statement A: read-only catalog listing (eight quote tables RLS / privileges / policies, the three bookings columns, the two indexes, the CHECKs, quote triggers, `function_grants` for ten functions). Statement B: DO block ending in `RAISE EXCEPTION 'SMOKE_OK_92_12 ...'`. It proves anon and authenticated are denied on the eight tables (SET LOCAL ROLE) and on `quote_convert_to_bookings`, none of the ten functions is executable by anon / authenticated / PUBLIC, a zh-hant quote with three lines (two saved-card remainders, one without) converts to two `card_hold` and one `quote` booking with stops, ledger rows and consent rows (consent text over 2000 characters), the same intent again answers `first_time` false with no new bookings, another intent is refused with `intent_mismatch`, a frozen version / line / stop refuses update, insert and delete (`quote_version_frozen`), the acceptance log and event ledger are append-only (`quote_log_append_only`) and `payment_intent_id` is settable once.
2. `92-12-smoke-erasure.sql`: one DO block ending in `RAISE EXCEPTION 'SMOKE_OK_92_12_ERASURE ...'`. It proves `erasure_scope` counts an unconverted quote; `erasure_anonymise_person` deletes it with everything under it; a paid quote without a booking is anonymised in place (amounts, events, frozen version stay; client fields, addresses, acceptance ip, link, PDF and Stripe ids go); the guard bypass is closed afterwards; a quote with money in flight is counted, makes `erasure_confirm` answer `payment_open`, and its Stripe customer is not returned by `erasure_quote_customer_ids` (the free quote's customer is).

Every run FAILS by design with the success marker text; any other message is a defect (`SMOKE_FAIL ...`). Nothing persists. Afterwards: `SELECT count(*) FROM public.quotes WHERE reference LIKE 'Q-20991231-SMOKE%'` and `SELECT count(*) FROM public.bookings WHERE booking_reference LIKE 'SMOKE-92-12-%'` must both be 0, and `net._http_response` must have gained no row.

## Verification

- `npx vitest run tests/migration-091.test.ts tests/erasure-payment-pii.test.ts tests/erasure-migration.test.ts tests/migration-089.test.ts tests/erasure.test.ts tests/erasure-page.test.tsx tests/admin-erasure.test.ts`: 7 files, 297 tests passed. Also green: `tests/consent-locale-check.test.ts`, `payment-state-writers-gate`, `status-writers-gate`, `payments-engine-gates`, `webhook-security-fixes-migration`, `chat-registry-migration`, `booking-status-parity`.
- `npx tsc --noEmit`: 8 errors, all the old baseline ones in `tests/` (`i18n-translate-dnt` 2, `nav-auth` 5, `passenger-actions` 1); none in touched files.
- `npx eslint --quiet` on every touched source and test file: clean.
- Smoke file checks of the plan: under 16000 bytes, contains ROLLBACK, no COMMIT line.
- The SQL was never run (no Supabase access, no local Postgres); only text tests cover it. Plpgsql details with no live proof until the smoke: `RETURNING id INTO` after array appends in the smoke, `SET LOCAL ROLE` from the MCP role, the cascade delete through the BEFORE DELETE guards under the bypass, the deferred `current_version_id` FK on cascade delete, `identity_normalize_phone` on a raw `+420 777 000 921`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two older tests pinned "the latest body is the 089 / 088 one"**
- **Found during:** Task 1
- **Issue:** `tests/migration-089.test.ts` ("the latest definitions are the ones in 089") and `tests/erasure-payment-pii.test.ts` ("is the latest definition") asserted `norm(latest) === norm(089 body)` for `erasure_anonymise_person`; 091 legitimately supersedes it.
- **Fix:** both now assert that the latest body still contains every statement of the 089 body (the 088-statement check was already there); `erasure_payment_open` keeps the exact-equality check.
- **Files modified:** tests/migration-089.test.ts, tests/erasure-payment-pii.test.ts
- **Commit:** 91654fe3

**2. [Rule 2 - Missing critical] Client fields cannot be emptied**
- **Found during:** Task 1
- **Issue:** the plan says "client fields emptied, line and stop addresses ... nulled", but `quotes.client_first_name / client_last_name / client_email` are `CHECK (char_length >= 1 / >= 3)` and `quote_version_lines.origin_address` is NOT NULL with a minimum length of 1; an UPDATE to `''` or NULL would raise and roll the erasure back.
- **Fix:** names become `'-'`, the email `'erased-<id>@erased.invalid'` (the 075 pattern; `identity_normalize_email` ignores that domain), the phone NULL, `origin_address` the placeholder `'erased'`; destination, coordinates, flight number and free text are NULL. Pinned by a test that no quote UPDATE uses `''`.
- **Commit:** 91654fe3

**3. [Rule 2 - Missing critical] More PII and one safety condition than the plan listed**
- `quote_versions.billing_note` (free text), `quote_version_lines.flight_number` and `special_requests`, `quotes.user_id` and `source_inquiry_id` are also nulled. A quote is never deleted when it has a payment intent (deposit or remainder), a refund, or an acceptance carrying an intent (the plan listed bookings, `deposit_refunded_minor`, `paid_at`, `remainder_paid_at`). `erasure_quote_customer_ids` also leaves out a customer a booking still uses for an unfinished payment (a saved-card quote and its card_hold bookings share one customer), mirroring `stripeCustomerIds` on the TypeScript side. Billing name / address / company / VAT id on a version stay (invoice data, like bookings keep theirs): owner may want them wiped too.
- **Commit:** 91654fe3

**4. [Plan choice] Extra internal helper `erasure_quote_ids`**
- Not in the plan's interface list; it holds the matching (email, phone, booking link) once for scope, the Stripe-customer lookup and the anonymise function. `erasure_quote_payment_open(p_emails, p_phones)` keeps the planned two-argument shape and therefore matches by email and phone only; the booking-link match is not part of the in-flight guard (a converted quote keeps the booking's email, so the email match covers it).
- **Commit:** 91654fe3

**5. [Plan choice] Smoke split in two files, not starting with BEGIN**
- The one file would be about 22 KB, over the plan's 16 KB limit: `92-12-smoke.sql` (catalog + denial + conversion + guards) and `92-12-smoke-erasure.sql` (erasure). Style follows the 91-01 smoke as the orchestrator asked (catalog SELECT + DO block ending in RAISE EXCEPTION) instead of the plan's BEGIN ... ROLLBACK wrapper; the plan's text checks (size, ROLLBACK word, no COMMIT line) pass for the main file. The paid-quote anonymise case in the erasure smoke uses a paid quote without a booking (kept because `paid_at` is set); the booking-link match is checked in the main smoke after the conversion.
- **Commit:** e7043eda

**6. [Plan choice] No fake-DB erasure run**
- The tracer line in the plan mentions a "fake run" deleting the quote; the fake payments DB deliberately does not model the erasure functions (92-01 summary: "92-12 proves the erasure SQL by text test"). The proof is the text tests plus the live smoke; the TypeScript side is covered by the store double in `tests/erasure.test.ts` (union of customers, once each, read before the Supabase step).

**7. [Rule 2] Admin wording**
- `ErasureConfirmForm` and the `payment_open` note in `ErasurePreview` now mention quotes (deposit or remainder in flight); `ErasureSearch`'s preview type gets an optional `quotes`. The existing wording tests were updated ("2 bookings or quotes have a payment still in play").

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-92-37 (delete / anonymise by email, phone, booking link; Stripe customers of quotes deleted), T-92-38 (`erasure_quote_payment_open` in scope and confirm), T-92-39 (REVOKE repeated for each function; smoke reads has_function_privilege) are mitigated and text-tested; T-92-40 (smoke leaves rows / fires the webhook) is covered by the DO blocks ending in RAISE EXCEPTION plus the zero-row and `net._http_response` checks the orchestrator runs. T-92-SC accepted, no package installed.

## Checkpoint: what the orchestrator must do (Task 3)

1. Precondition: `ls supabase/migrations | tail -1` is `091_quotes.sql`; 090 (`090_consent_locale_zh_hant.sql`) is live; no `090_quotes` anywhere.
2. Apply `supabase/migrations/091_quotes.sql` to project enakcryrtxlnjvjutfpv (`apply_migration`, name `091_quotes`). The file is big (about 1,600 lines).
3. Run `92-12-smoke.sql` statement A (listing) and check: eight tables `rls=true anon_priv=false auth_priv=false policies=2`; function_grants all `public_exec=false anon_exec=false auth_exec=false`, `service_role_exec=true` only for convert, erasure_confirm, erasure_scope, erasure_anonymise_person, erasure_quote_customer_ids. Then statement B: expect the error text `SMOKE_OK_92_12 ...`.
4. Run `92-12-smoke-erasure.sql`: expect `SMOKE_OK_92_12_ERASURE ...`.
5. Zero-row checks (quotes `Q-20991231-SMOKE%`, bookings `SMOKE-92-12-%`) and `net._http_response` gained no row in the smoke window.
6. Record "091 live", the apply result, the has_function_privilege rows and the smoke output in this SUMMARY and set `status: complete`.

## Self-Check: PASSED

- Files exist: supabase/migrations/091_quotes.sql, tests/migration-091.test.ts, lib/erasure-store.ts, lib/erasure.ts, components/admin/ErasurePreview.tsx, .planning/phases/92-quotes/92-12-smoke.sql, .planning/phases/92-quotes/92-12-smoke-erasure.sql.
- Commits exist: 91654fe3, e7043eda.
- Plan acceptance greps: `erasure_quote_customer_ids` created once; `REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated` once in 091; `quoteStripeCustomerIds` in lib/erasure.ts; `quote_convert_to_bookings` 7 times in the main smoke.
- Live apply and smoke (Task 3): NOT done, waiting for the orchestrator.
