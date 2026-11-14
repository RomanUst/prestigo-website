---
phase: 92-quotes
plan: 15
subsystem: admin-ui
tags: [quotes, admin-ui, line-editor, pricing-suggestion, tdd]
requires: [92-08]
provides:
  - "components/admin/quotes/quoteDraft.ts: QuoteLineDraft, QuoteDraft, emptyLine, lineToPayload, lineToPriceRequest, lineFromDetail, lineAmountMinor, isManualPrice, newKey"
  - "components/admin/quotes/QuoteLineEditor.tsx: QuoteLineEditor (data-testid quote-line-editor)"
affects: [92-19]
key-files:
  created:
    - components/admin/quotes/quoteDraft.ts
    - components/admin/quotes/QuoteLineEditor.tsx
    - tests/quote-line-editor.test.tsx
key-decisions:
  - "The price suggestion is only ever a server answer (admin quote price route); a change to anything the tariffs read (trip type, class, pickup date, places, stops and waits, hours, return date, extras) drops the stored suggestion while the typed amount stays"
  - "Suggest price fills the amount only when it is empty or still equal to the previous suggestion; a typed amount is never overwritten"
  - "An answer that arrives after the line changed is discarded with a plain message (priceKey compared against the latest line through a ref)"
  - "lineToPayload turns an empty or invalid amount into 0, which the strict server schema refuses (amount_minor min 1), so it can never be saved by accident"
status: complete
completed: 2026-11-14
estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: 06ea50158783dbc77ce1bc71a1a5d75c1b573289
commits: 2
---

# Phase 92 Plan 15: Quote line editor Summary

The operator can enter one quote line completely (transfer with up to 5 stops and waits, hourly, daily, optional flight landing, extras, notes), ask the server for a live-tariff price suggestion, overwrite the amount by hand, reorder or remove the line, and see a frozen line as read-only text.

## Mount

`QuoteLineEditor` is mounted by `components/admin/quotes/QuoteBuilder.tsx` (plan 92-19), which `app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx` renders. Nothing mounts it yet in this plan; it is tested through its exported surface (`QuoteLineEditor`, `emptyLine`, `lineToPayload`, `lineToPriceRequest`) in `tests/quote-line-editor.test.tsx`. The mount proof (data-testid `quote-line-editor` inside the real page) is 92-19's page test.

## What was built

- **Task 1 (tracer), 25bc8c40** - `quoteDraft.ts` (draft types, `emptyLine`, `lineToPayload` with the amount through `parseAmountToMinor` and no distance or suggestion key, `lineFromDetail`) and the editor with pickup, route (existing `AddressInput`), up to `MAX_STOPS` stops each with a wait chosen from 0..`MAX_STOP_WAIT_MIN` in `WAIT_BLOCK_MIN` steps (15 marked free via `STOP_FREE_WAIT_MIN`), vehicle, passengers, luggage, and the price block (Suggest price, suggestion text with the formatted amount and km, "Manual price" mark, plain error text on a failed request).
- **Task 2, 06ea5015** - trip type select (hourly: hours 1..24, daily: return date; fields of other types are cleared), flight landing with date, time and offset 0/15/30/45/60/90 (pickup derived with `pickupFromLanding`, shown as text while derived, remove clears all three), extras, flight number, terminal, notes for the driver, move up / down / remove, and the read-only rendering (no inputs, selects, textareas or buttons).

## Verification

- `npx vitest run tests/quote-line-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 2 files, 49 tests passed (23 in the new file).
- `npx tsc --noEmit`: only the 8 old baseline errors in `tests/` (nav-auth, i18n-translate-dnt, passenger-actions).
- `npx eslint --quiet` on the three files: clean.
- Acceptance greps: `/api/admin/quotes/price` 1x in the editor, `parseAmountToMinor` 4x in quoteDraft.ts, `readOnly` 3x in the editor; no `€` amount in `components/admin/quotes/`.
- No test failed to LOAD through the symlinked `node_modules`.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Extra exports and behaviour beyond the interface list**
- `lineToPriceRequest` (the price body, same mapper without the amount), `lineAmountMinor`, `isManualPrice`, `newKey` exported from quoteDraft.ts; the price request must not carry `amount_minor` (strict schema) so it needed its own mapper.
- The landing pickup is derived in the editor (and locked as text) so the line always satisfies the server's pickup-equals-landing-plus-offset rule instead of failing with a 400 on save.
- "Suggest price" is disabled until the date, time, places, stops, hours (hourly) or return date (daily) and a complete landing are present, so the request cannot be invalid by construction.

**2. Wait options derived locally**
- The wait choices are built from the `lib/stops.ts` constants in the editor because `WAIT_TIME_OPTIONS` is module-private in `components/booking/StopItem.tsx`; that file was left untouched. The 15 minute option is marked "(free)".

TDD note: tests were written before each task's component code, but the RED run was not captured separately (the component import fails by construction before the file exists).

## Known Stubs

None.

## Threat Flags

None. T-92-47 (no hard-coded amount) and T-92-48 (no distance key in the payload, asserted by test) are mitigated; T-92-SC accepted, no package installed.

## Notes for the orchestrator

- Browser check skipped: the component is not mounted anywhere until 92-19.
- 92-19 should call `lineToPayload(line, draft.currency)` for the draft save and check that every line has a valid amount before saving (an invalid amount is sent as 0 and refused by the server with a 400).

## Self-Check: PASSED

- Files exist: quoteDraft.ts, QuoteLineEditor.tsx, tests/quote-line-editor.test.tsx.
- Commits exist: 25bc8c40, 06ea5015.
