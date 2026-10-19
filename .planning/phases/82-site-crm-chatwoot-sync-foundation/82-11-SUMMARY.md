---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 11
subsystem: admin-identities-ui
tags: [admin, identities, split, shared-numbers, tabs, SYNC-03, D-05, D-06]
status: complete
requires:
  - "82-08: GET /api/admin/identities, POST split, POST shared"
  - "82-02: outbox page pattern, sidebar, table metrics"
provides:
  - "/admin/identities page (Merged by phone + Shared numbers tabs)"
  - "components: MergedByPhoneTable, SharedNumbersTable, SplitContactForm, MarkSharedForm"
  - "components/admin/adminFieldStyles.ts (inputBaseStyle, labelStyle, errorStyle copied verbatim from AccountForm, plus focusRingHandlers)"
  - "Sidebar entry Identities after Outbox"
affects: [82-14 (identity pass: owner pre-marks desk numbers here first)]
key-files:
  created:
    - app/(internal)/admin/(dashboard)/identities/page.tsx
    - components/admin/MergedByPhoneTable.tsx
    - components/admin/SharedNumbersTable.tsx
    - components/admin/SplitContactForm.tsx
    - components/admin/MarkSharedForm.tsx
    - components/admin/adminFieldStyles.ts
    - tests/identities-page.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - tests/AdminSidebar.test.tsx
decisions:
  - "The page consumes the camelCase shape the 82-08 store actually returns (identityId, contactEmail, mergedEmail, mergedAt, markedAt), not the snake_case shape in the plan interface block"
  - "invalid_phone field error uses the API's own message (which carries the +420 777 123 456 example), with a generic fallback; so no Czech-shaped number literal lives in the UI files and tests/business-number-guard.test.ts needed no new THIRD_PARTY_NUMBERS entry"
  - "One shared tabpanel (id identities-panel) whose aria-labelledby follows the selected tab, so aria-controls is always valid"
  - "Separate filter state per tab; the shared-phone-merge-ordering assumption holds (a merge whose number later flipped to shared shows on both tabs)"
metrics:
  tasks_total: 2
  tasks_done: 2
  plan_head_before: 2732e874340e31b910c4d77935c5715f57a98296
  plan_head_after: 0a95fd5663a27dc4717c5e260ec27abbaa1d2ca2
  commits: 2
  completed: 2026-10-19
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 82 Plan 11: Identities admin page Summary

The owner can review every phone-based merge and split a wrong one, see all shared numbers (automatic, manual, after split), and pre-mark an agency or hotel desk number as shared, all on one `/admin/identities` page that follows 82-UI-SPEC copy and state contract (SYNC-03, D-05, D-06).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Merged tab -> Split contact modal -> POST split -> "Split queued" + View Outbox link; sidebar entry | dcfa109f |
| 2 | Shared numbers tab, Mark number as shared form, filter, keyboard tabs, #shared hash, every state | 0a95fd56 |

`commits: 2` is measured with `git rev-list --count 2732e874..HEAD` before this SUMMARY commit.

## What was built

- **Page** (client component, fetch in `useEffect`, "Refresh identities"): h1, intro, header primary button "Mark number as shared", tablist (`Merged by phone (N)` / `Shared numbers (N)`, 44px tabs, 2px copper bottom border on the active one, roving tabindex, Left/Right arrows with wrap, selected tab kept in the URL hash `#shared` via `history.replaceState` and read back on load and on `hashchange`), per-tab filter input "Filter by email or phone" (also matches phones typed with spaces), load-error block ("Could not load identities. Refresh to retry."), aria-live split-queued message with a `View Outbox` link.
- **MergedByPhoneTable**: CONTACT, MERGED EMAIL (+ "Phone merge" quote badge), PHONE, BOOKINGS, MERGED, Split action (`Split` icon, aria-label "Split {mergedEmail} from {contactEmail}"). 48px header/rows, 16px padding, hover `var(--anthracite-light)`, `th scope=col`, cells truncated at 280px with `title`, wrapper `overflow-x: auto`, table `min-width: 720px`, "Loading..." cell, empty state or "No matches. Clear the filter to see all {N} rows."
- **SharedNumbersTable**: PHONE, HOW (pending -> Automatic, quote -> Manual, confirmed -> After split), EMAILS (first two joined by ", " then "+N more", full list in `title`), NOTE, MARKED; same metrics and states. No action column, no unmark.
- **SplitContactForm** (modal body for "Split this contact"): UI-SPEC body text, "Keep contact merged" / gold "Split contact" ("Splitting..." while pending), `submittingRef` double-submit guard, failure keeps the modal open with a `role="alert"` message; success closes the modal, shows "Split queued..." and reloads the lists.
- **MarkSharedForm** (modal "Mark a number as shared"): PHONE NUMBER (focused on open, helper text, field error under the input: `invalid_phone` shows the API message, `already_shared` shows "That number is already marked as shared.", anything else a generic retry message) and optional NOTE (`maxLength` 80, placeholder "e.g. TravelExpress desk"); Enter submits; "Don't mark number" closes with no request; success closes and reloads.
- **adminFieldStyles.ts**: the three AccountForm style objects verbatim, plus `focusRingHandlers` that draw the `2px solid var(--copper)` ring on the inputs (the copied `outline: none` would otherwise hide the global ring). New code overrides `fontWeight: 300` with 400 where it spreads `inputBaseStyle`. `AccountForm` itself is unchanged.
- **Sidebar**: `Identities` -> `/admin/identities` directly after `Outbox`.

## Verification

- `npx vitest run tests/identities-page.test.tsx tests/AdminSidebar.test.tsx`: 2 files, 28 tests passed (24 in the page test file and 4 in the sidebar test file, covering header, loading, merged rows, empty, 403 load error + refresh, split flow incl. double-click guard and failure, Keep merged, shared tab, "+2 more", mark flow incl. `invalid_phone` / `already_shared`, no unmark, filter, arrow-key tabs, `#shared` hash on load, 44px tabs, table metrics, no font weight 300/700, hover).
- `npx vitest run tests/business-number-guard.test.ts tests/infra-vps-isolation-guard.test.ts`: 46 passed (no new third-party number entry needed).
- `npx eslint --quiet` on the page, four components, `adminFieldStyles.ts` and the test file: clean.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (none in new files).
- No `€` in any new file; no secrets; no package installs.

## Deviations from Plan

**1. [Rule 3 - ordering] `adminFieldStyles.ts` was committed with Task 1, not Task 2.** `SplitContactForm` (Task 1) imports `errorStyle` from it, so the file had to exist with the tracer. It was copied verbatim as planned; Task 2 only added the consumers.

**2. [Rule 1 - plan/API mismatch] The plan's interface block lists snake_case fields (`identity_id`, `merged_email`, ...)**, but `lib/identity-admin-store.ts` (82-08) returns camelCase. The UI types come from the store (`import type { PhoneMergeRow, SharedPhoneRow }`) and the tests mock the real shape.

**3. [Process] `/verify` skill file is absent in the worktree**; its checks were run by hand (tsc, eslint, scoped vitest, currency and secret grep). `plan_head_before` is the dispatch base (the per-plan ledger file could not be written because `git rev-parse --git-dir` points into the main repo's `.git/worktrees/`).

**4. [Design choice] Mark-shared error copy for `invalid_phone` is taken from the API response `message`** (identical to the UI-SPEC string), with the fallback "Enter the number with country code." for an empty field or missing message. This keeps a Czech-shaped example number out of the UI sources, which `tests/business-number-guard.test.ts` would otherwise flag. If a future API change drops `message`, the field shows the shorter fallback.

No other deviations.

## Not done / handoff

- Live browser check was skipped as allowed; the plan's human check (arrow keys switch tabs, focus returns to the opener after each modal closes, every badge shows text, table scrolls sideways on a phone) is left to the orchestrator/UAT. Focus return is provided by the existing `Modal` and unit-tested only for tab focus.
- Known limitation: after a successful split the opener row disappears on reload, so `Modal`'s focus return has no element to focus; focus falls back to the document.

## Known Stubs

None.

## Threat Flags

None beyond the plan register. T-82-32 (page under the `(dashboard)` layout guard; 401/403 renders only the load-error message, no table) and T-82-33 (confirm modal states exactly what changes, `submittingRef` guard, disabled button while pending) are mitigated and covered by tests. T-82-SC: no packages installed.

## Self-Check: PASSED

- Files exist: page, MergedByPhoneTable, SharedNumbersTable, SplitContactForm, MarkSharedForm, adminFieldStyles, tests/identities-page.test.tsx.
- Commits exist: dcfa109f, 0a95fd56.
- STATE.md and ROADMAP.md were not modified.
