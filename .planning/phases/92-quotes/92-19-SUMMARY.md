---
phase: 92-quotes
plan: 19
subsystem: admin-ui
tags: [quotes, admin-ui, builder, deposit, remainder-method, tdd]
requires: [92-08, 92-15]
provides:
  - "app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx: quote detail page (mounts QuoteBuilder)"
  - "components/admin/quotes/QuoteBuilder.tsx: QuoteBuilder (data-testid quote-builder), saveErrorText"
  - "components/admin/quotes/QuoteSettingsFields.tsx: QuoteSettingsFields (editable and read-only)"
  - "components/admin/quotes/quoteDraft.ts: draftFromDetail, draftToPayload, parseDeposit, draftTotals, depositProblem, termsProblems, draftProblems, sendWarning, pragueDay"
affects: [92-25]
key-files:
  created:
    - "app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx"
    - components/admin/quotes/QuoteBuilder.tsx
    - components/admin/quotes/QuoteSettingsFields.tsx
    - tests/quote-builder.test.tsx
  modified:
    - components/admin/quotes/quoteDraft.ts
key-decisions:
  - "QuoteBuilder takes the quote id and does its own GET and PATCH; the page only reads params with use() and renders a back link plus the builder"
  - "The deposit has no default: kind select starts on 'Choose', the value input is empty and disabled until a kind is chosen, and Save is disabled while the deposit is empty, 0, malformed or above the total (D-07)"
  - "The client and lead channel are fixed at creation (92-14), so they are shown but never sent; the expiry is sent only when the operator changed it (an old date that has since passed must not block every save); billing is sent only for the invoice method, null otherwise"
  - "Every problem that would be a bare 400 / 422 is caught first: each line needs a valid positive amount, date, time, pickup, destination (transfer), stop addresses, hours (hourly), return date (daily); a remainder method; terms in range; expiry not in the past. After the first Save press the list follows the draft live"
  - "After a successful save the detail is read again so the page shows what the server stored; a 409 version_frozen also reloads, and the quote comes back read-only"
  - "A voided, cancelled or paid quote is read-only too (the server would refuse the save with 422)"
status: complete
completed: 2026-11-14
estimate:
  tokens: 65000
  raw_tokens: 65000
  tasks: 3
  confidence: low
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
plan_head_before: c655ba8497d637243ef8f76bcdcc506e4c86b7ec
plan_head_after: fb0b0fe05242f055b5f1744bd4cc8159ee23b4d6
commits: 3
---

# Phase 92 Plan 19: Admin quote builder page Summary

The operator opens /admin/quotes/<id>, builds the whole quote on one page (trips, language, currency, optional expiry, deposit, remainder method, billing for an invoice, cancellation terms) with a live total / deposit / remainder panel, saves it with one PATCH, and sees a sent version as read-only text with its version number.

## Mount

`app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx` renders `QuoteBuilder`, which renders `QuoteSettingsFields` and one `QuoteLineEditor` per line. `tests/quote-builder.test.tsx` renders the REAL page (inside Suspense, with `params` as a resolved promise) and finds `quote-builder` and one `quote-line-editor` per line. The `(dashboard)` layout (admin gate, sidebar) is unchanged; the list rows already link here (92-14).

## What was built

- **Task 1 (tracer), 055cce8b** - page, `QuoteBuilder` (load, client summary, lines with add up to 20 / reorder / remove, one PATCH of the whole draft, "Saved", 503 "Route or prices unavailable, try again", 409 reload into read-only), and the draft model in `quoteDraft.ts` (`draftFromDetail`, `draftToPayload` through `lineToPayload`, validation helpers). A sentence for every server refusal: `deposit_zero`, `deposit_above_total`, `no_lines`, `currency_needs_lines`, `expiry_in_past`, `quote_voided`, `quote_cancelled`, `quote_paid`, `version_frozen`, `pricing_unavailable`, plus 400 (field names), 401/403, 404, 413 and 500.
- **Task 2, dcc0416c** - `QuoteSettingsFields`: language (one option per entry of `locales`, labelled with `LOCALE_ENDONYMS`, so zh-hant is included), currency EUR / CZK (a currency change drops the stored suggestions, the typed amounts stay), optional expiry, deposit (type + value, nothing pre-filled), four remainder methods as radios, billing fields for Invoice, free-cancellation hours (0..720) and fee percent (1..100) with "Empty = standard policy" / "Empty = all of the deposit", the totals panel from `depositMinorFor`, and a non-blocking warning from `validateVersionMoney` when a card charge would be below the Stripe minimum.
- **Task 3, fb0b0fe0** - "Version N (sent)" / "(draft)", earlier version numbers, settings as text, no Save / Add trip for a frozen version (and for a voided / cancelled / paid quote).

## Verification

- `npx vitest run tests/quote-builder.test.tsx tests/quote-line-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 3 files, 80 tests passed (31 in the new file; includes a test named "D-07").
- `npx tsc --noEmit`: only the 8 old baseline errors in `tests/` (nav-auth, i18n-translate-dnt, passenger-actions).
- `npx eslint --quiet` on page, QuoteBuilder, QuoteSettingsFields, quoteDraft, the test: clean.
- Acceptance greps: `QuoteBuilder` in the page 2x, `QuoteLineEditor` in QuoteBuilder 2x, `remainder_method` present, no euro sign in `components/admin/quotes` or the quotes pages.
- No test failed to LOAD through the symlinked `node_modules`.
- Browser check skipped: the admin login needs a session (fail-closed limiter locally); the page is covered by the real-page render test.

## Deviations from Plan

**1. [Rule 3 - Blocking] `quoteDraft.ts` modified (not in the plan's file list)**
- The draft model of the whole quote (load from the detail, build the PATCH body, deposit parsing, totals, problem lists) is pure logic and lives next to `lineToPayload` and `lineFromDetail` from 92-15. `QuoteDraft.deposit` changed from `{kind, valueInput} | null` to `{kind: DepositKind | null, valueInput}` so that "nothing chosen yet" is representable (D-07). Nothing else used the old shape.

**2. [Rule 2 - Missing critical] Validation beyond the amount**
- Besides the amount check the plan asks for, the builder checks the other fields the strict server schema would refuse with a bare 400 (date, time, pickup, destination, stop addresses, hours, return date, terms ranges, past expiry).

**3. Choices beyond the plan text**
- The plan says Save is disabled while the deposit is empty or 0. That means a draft with trips only cannot be saved until a deposit is chosen (the server would accept it). Followed as written; a hint "Save is available once the deposit is set." sits under the button. Changing this is one line (`depositBlocked`).
- Tests that save twice were split into single-save tests because the builder re-reads the detail after a save and the fetch mock returns one fixed detail.

TDD note: tests were written before each task's code, but RED runs were not captured separately (the page / component import fails by construction before the file exists).

## Known Stubs

None.

## Threat Flags

None. T-92-62 (no pre-filled deposit; test asserts empty fields and disabled Save) and T-92-63 (read-only UI, 409 reload; the server and database guard remain) are mitigated; T-92-SC accepted, no package installed.

## Notes for the orchestrator

- 92-25 adds the send / revise / void bar: `QuoteBuilder` already exposes `frozen`, `readOnly` and the version label; the read-only text says "To change it, make a new version" and expects Revise from 92-25.
- `sendWarning` only warns; the real freeze check (`validateVersionMoney`) belongs to the send route.

## Self-Check: PASSED

- Files exist: page.tsx, QuoteBuilder.tsx, QuoteSettingsFields.tsx, tests/quote-builder.test.tsx, quoteDraft.ts.
- Commits exist: 055cce8b, dcc0416c, fb0b0fe0.
