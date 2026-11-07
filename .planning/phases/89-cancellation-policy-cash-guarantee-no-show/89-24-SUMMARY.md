---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 24
subsystem: admin-settings, blog
tags: [go-live, card-flow, settings, confirm-dialog, blog-wording]
requires: [89-19]
provides: ["card_flow_mode 'on' selectable in code", "All clients tile with confirm dialog", "Vienna blog free of the retired cancellation windows"]
affects: [89-23]
tech-stack:
  added: []
  patterns: ["confirm Modal with initial focus on the safe button", "source-reading wording guard test"]
key-files:
  created: [tests/blog-cancellation-wording.test.ts]
  modified:
    - app/api/admin/settings/route.ts
    - components/admin/CardFlowSettings.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
    - tests/CardFlowSettings.test.tsx
    - tests/admin-settings.test.ts
decisions:
  - "Arrowing onto the All clients tile opens the confirm dialog only; nothing is selected or saved until the owner confirms"
  - "The Vienna FAQ answer carried a second retired rule (two hours before pickup); fixed together with the table cell"
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: f031c0b1fbd56d8f0603b1d0dc41d34ff1cab442
plan_head_after: 3131121d0d027be2e473d9bb5cdc3e9af7fd30eb
completed: 2026-11-07
---

# Phase 89 Plan 24: All clients go-live tile and Vienna blog wording Summary

Guarded "All clients" switch (settings value `on`, confirm dialog, focus on the safe button) plus the Vienna blog corrected to the new cancellation policy. Nothing is written to the live flag and nothing is merged; the switch reaches production only with the wording, in plan 89-23.

## What was built

**Task 1 (tracer) - `security(89-24)` dfd61a4f.**
- `app/api/admin/settings/route.ts`: zod enum for `card_flow_mode` is now `off | canary | on` (matches the 087 CHECK). Auth guard order and every other validation unchanged; unknown values (`ON`, `all`, empty, boolean, null) still answer 400 and update nothing.
- `components/admin/CardFlowSettings.tsx`: third tile "All clients" in the order Off, Owner test only, All clients. Choosing it (click or arrow key) opens a `Modal` titled "Open card payment to all clients" with the spec body word for word; buttons "Open to all clients" (accent) and "Keep owner test only" (initial focus). Only the confirm sends `PATCH { card_flow_mode: 'on' }`; on failure the previous tile stays selected and "Failed to save — try again" shows. Off and Owner test only still save at once. Helper text updated verbatim. With `on`: test emails stay editable, the muted line "Test emails are ignored while card payment is open to all clients." shows, the empty-list warning stays canary-only. Tokens only, no colour literals.
- Tests: `CardFlowSettings.test.tsx` gained a dialog block (no PATCH before confirm, arrow key does not save, focus on the safe button, keep/Escape save nothing, confirm saves once and selects, failure keeps the previous tile, Off from on saves at once, muted line); `admin-settings.test.ts` now asserts `on` is accepted and unknown values are rejected.

**Task 2 - `fix(89-24)` 3131121d.**
- Prestigo cell of "Flexibility / cancellation" is now "Free until the deadline in your booking" (no digit). No other table row changed, no price or comparison added.
- `tests/blog-cancellation-wording.test.ts` reads the page source and fails if that cell holds a digit, if the old text returns, or if the FAQ states a fixed cancellation window.

## Verification (verify skill checks)

- `npx vitest run tests/CardFlowSettings.test.tsx tests/admin-settings.test.ts tests/admin-no-hardcoded-colors.test.ts`: 3 files, 150 passed.
- `npx vitest run tests/blog-cancellation-wording.test.ts tests/blog-live-prices.test.ts`: 2 files, 242 passed.
- Other tests that read the Vienna page (`llms-content`, `blog-locale-fallback`, `rtl-backstop`, `author-surfaces-i18n`, `blog`): 5 files, 204 passed.
- `npx tsc --noEmit`: 8 errors, all in `tests/` (baseline), none in changed files.
- `npx eslint --quiet` on all changed source and test files: exit 0.
- No `€` literal added to `app/` or `components/` (the blog table's existing euro text is pre-existing competitor data, untouched).
- Not run: full suite (about 90s, orchestrator), live browser check of the settings page (admin login is gated; no live flag write was allowed anyway).

## Deviations from Plan

**1. [Rule 1 - Bug] Second retired cancellation rule in the Vienna FAQ**
- **Found during:** Task 2
- **Issue:** the FAQ answer (line 239) stated "free cancellation up to two hours before pickup", contradicting the policy. The plan's truth is that the blog no longer states the old rule.
- **Fix:** reworded to "free cancellation until the deadline shown in your booking"; guarded in the new test.
- **Files modified:** app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
- **Commit:** 3131121d
- Consequence: `git diff --stat` for the page shows two lines each way instead of one (acceptance criterion read literally said one).

**2. Commit prefix.** Task 1 changes admin route validation, so it was committed with `security:` per project rules (the plan listed no prefix).

## Known Stubs

None.

## Threat Flags

None. T-89-65 (accidental go-live) mitigated: confirm dialog, focus on the safe button, no PATCH before confirm (tested), and the tile ships to production only in plan 89-23 together with the wording.

## Self-Check: PASSED

Files and commits dfd61a4f, 3131121d verified present.
