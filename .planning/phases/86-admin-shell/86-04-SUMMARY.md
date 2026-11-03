---
phase: 86-admin-shell
plan: 04
subsystem: ui
tags: [admin, theme, css-custom-properties, bookings, vitest]
status: complete

requires:
  - phase: 86-01
    provides: token sheet (--admin-* / --status-*), colour guard ledger, capital-label scanner
provides:
  - BookingsTable.tsx with zero hex/rgba literals (all colours are theme tokens)
  - cancellation modal as a token sheet (D-12)
  - sentence-case label source text with inline uppercase (D-10)
affects: [86-13, 90]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: b6f39039ab48fe52e0e30cc52cdb206ca6785573

actuals:
  tokens: 6000   # chars/4 over the diff (3 files)
  tasks: 3
  commits: 3     # measured: git rev-list --count 043b2d1b..b6f39039 (SUMMARY commit excluded)

key-files:
  modified:
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
  deleted:
    - tests/fixtures/admin-color-pending/86-04.json

key-decisions:
  - "Values only in BookingsTable.tsx: no function, component or hook added, removed or renamed (Phase 90 boundary)"
  - "Shared components/booking/AddressInput labels converted to sentence case in source; the element is outside this plan's files and its global .label class keeps them uppercase in both themes (see Known Limitations)"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "Horizon segment active tint uses var(--admin-accent-tint), asserted by the existing test"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "No hex/rgba literal left in BookingsTable.tsx; ledger entry 86-04 removed; colour guard green"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
      - kind: unit
        ref: "tests/admin-theme-css.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cancellation modal uses surface, border, radius-lg, sheet-padding, shadow-sheet, scrim and heading font tokens"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx (cancellation flows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Typed-capital labels are sentence case in source; scanner exits 0"
    requirement: ADM-03
    verification:
      - kind: other
        ref: "node scripts/qa/admin-caps-scan.mjs components/admin/BookingsTable.tsx (exit 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual readability of bookings list, cards, detail rows and modal in both themes in a real browser"
    verification: []
    human_judgment: true
    rationale: "Admin sign-in is impossible on localhost (fail-closed limiter); owner UAT on production at phase closeout."

completed: 2026-11-02
---

# Phase 86 Plan 04: BookingsTable on theme tokens Summary

**All 45 colour literals in the 2,887-line `BookingsTable.tsx` now resolve to `--admin-*` / `--status-*` tokens, the cancellation modal is a token sheet, and typed-capital labels are sentence case in source with `text-transform: uppercase` keeping dark unchanged.**

## What was done

1. **Tracer (f172dcb8):** horizon segment active background `rgba(191,160,106,0.09)` -> `var(--admin-accent-tint)`; the two test assertions now check the token (RED confirmed first, then GREEN).
2. **Token conversion (5ff510f9):** mapping applied exactly per the plan:
   - `#4ade80` -> `--status-ok-fg`; `#f87171` -> `--status-danger-fg` (Saved / Error saving, inline errors, refund warnings)
   - `#60a5fa`, `#1a2a3a`, `rgba(59,130,246,0.08|0.25)` -> `--status-info-fg` / `-bg` / `-border` (GNet badge and callout)
   - `#f59e0b`, `rgba(245,158,11,0.06|0.09)` -> `--status-warn-fg` / `-bg` (unpaid chip and unpaid card)
   - `rgba(191,160,106,0.09)`, `rgba(184,115,51,0.09)` -> `--admin-accent-tint`
   - Manual badge `#2a2a1a` / `#E8B87A` / `rgba(184,115,51,0.25)` -> `--admin-accent-tint-strong` / `--admin-accent-text` / `--admin-accent-border`
   - `#36363B` -> `--admin-surface`; `#4E4E56` -> `--admin-border`; `rgba(0,0,0,0.6)` -> `--admin-scrim`
   - Cancellation modal panel: `--admin-surface`, `1px solid --admin-border`, `--admin-radius-lg`, `--admin-sheet-padding`, `--admin-shadow-sheet`; title `--admin-font-heading` / `--admin-fs-heading` / `--admin-fw-heading`.
   - No copper-filled element exists in the file, so no on-accent text change was needed.
   - Ledger `tests/fixtures/admin-color-pending/86-04.json` deleted.
3. **Sentence case (b6f39039):** all converted elements already carried `textTransform: 'uppercase'` (th header cell, `DetailField` label div, leg/source badges, refund `<p>`s), so no style additions were needed.

### Changed strings (before -> after)

| Where | Before -> After |
| --- | --- |
| Column headers | REF -> Ref, PICKUP -> Pickup, CLIENT -> Client, TYPE -> Type, VEHICLE -> Vehicle, AMOUNT -> Amount, STATUS -> Status |
| Source badge (table + mobile card) | MANUAL -> Manual |
| Leg badge (table + mobile card) | RETURN -> Return, OUTBOUND -> Outbound |
| GNet badge (table + mobile card) | GNET -> GNet |
| DetailField labels (mobile + desktop) | ORIGIN, DESTINATION, EMAIL, PHONE, FLIGHT, TERMINAL, REQUESTS, LANGUAGE, CHILD SEAT, MEET & GREET, EXTRA LUGGAGE, PAIRED OUTBOUND, DURATION, PASSENGERS, LUGGAGE, RETURN, NOTES, PAYMENT ID -> Origin, Destination, Email, Phone, Flight, Terminal, Requests, Language, Child seat, Meet & greet, Extra luggage, Paired outbound, Duration, Passengers, Luggage, Return, Notes, Payment ID |
| Edit-form address labels | PICKUP ADDRESS -> Pickup address, DESTINATION ADDRESS -> Destination address |
| Refund notices (T-86-12, words unchanged) | PARTIAL STRIPE REFUND WILL BE ISSUED FOR THIS LEG. -> Partial Stripe refund will be issued for this leg.; A FULL STRIPE REFUND WILL BE ISSUED. -> A full Stripe refund will be issued. |

Tests updated: `'RETURN'`, `'OUTBOUND'`, `'LANGUAGE'`, the partial-refund regex and the `GNET` badge text assertion now use the new text.

## Verification

- `npx vitest run tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-theme-css.test.ts`: 4 files, 98 tests passed (after task 2); first three re-run after task 3: 77 passed.
- `npx tsc --noEmit`: no errors in `components/admin/BookingsTable.tsx`.
- `node scripts/qa/admin-caps-scan.mjs components/admin/BookingsTable.tsx`: exit 0, nothing listed.
- Literal grep on BookingsTable.tsx (non-comment lines): 0 hex/rgba matches.

## Deviations from Plan

None - plan executed as written. No token was missing from `admin-theme.css` (not edited) and every literal had an exact mapped token.

## Known Limitations

- The two edit-form address labels are rendered by the shared `components/booking/AddressInput.tsx` (class `.label`, global `text-transform: uppercase`). That component is outside this plan's file list and also serves the public booking flow, so the labels stay uppercase in the light theme despite the sentence-case source. Worth a one-line follow-up if the owner wants them calm in light.
- Mixed-case emphasis in the paired-booking refund line ("will NOT be affected") is untouched (not flagged by the scanner, wording kept).

## Known Stubs

None.

## Threat Flags

None. T-86-12 mitigated: danger, warn and info cues use AA-checked status tokens; refund notice words unchanged (case only).

## Self-Check: PASSED

- components/admin/BookingsTable.tsx, tests/BookingsTable.test.tsx present; tests/fixtures/admin-color-pending/86-04.json absent.
- Commits f172dcb8, 5ff510f9, b6f39039 exist on the branch.
