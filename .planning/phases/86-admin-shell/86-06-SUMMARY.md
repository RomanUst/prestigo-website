---
phase: 86-admin-shell
plan: 06
subsystem: ui
tags: [admin, theme, css-custom-properties, promo-codes, drivers, wcag, vitest]
status: complete

requires:
  - phase: 86-admin-shell
    provides: "86-01 token sheet (--admin-*, --status-*), colour guard with per-plan ledger, admin-caps-scan.mjs"
provides:
  - "promo codes screen (page, table, form, airport promo card) on theme tokens only"
  - "drivers screen (page, table, form) on theme tokens only"
  - "sentence-case source text for the three capital-typed promo/driver labels, with inline uppercase kept for dark"
  - "ledger tests/fixtures/admin-color-pending/86-06.json emptied and deleted"
affects: [86-08, 86-13]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: dce153a3f04b6f8d20dacf6511a92233f39df305

actuals:
  tokens: 4500   # chars/4 over the 8 files changed (small sed-level diffs)
  tasks: 3
  commits: 3     # measured: git rev-list --count 043b2d1b..HEAD, before this SUMMARY commit

tech-stack:
  added: []
  patterns:
    - "Usage-based Token Map swap: surfaces -> --admin-surface, fields -> --admin-input-bg + --admin-border-strong, rules -> --admin-border, copper fill text -> --admin-on-accent"
    - "Sentence-case source + inline textTransform uppercase, so dark keeps capitals and light shows sentence case"

key-files:
  created: []
  modified:
    - "app/(internal)/admin/(dashboard)/promo-codes/page.tsx"
    - components/admin/PromoCodesTable.tsx
    - components/admin/PromoCodeForm.tsx
    - components/admin/PromoCard.tsx
    - "app/(internal)/admin/(dashboard)/drivers/page.tsx"
    - components/admin/DriversTable.tsx
    - components/admin/DriverForm.tsx
  deleted:
    - tests/fixtures/admin-color-pending/86-06.json

key-decisions:
  - "Dimmed (inactive) promo rows use --admin-input-bg (inset well) instead of the retired #28282B: darker than the surface in dark, identical in light where the muted text already carries the dimmed cue"
  - "Active/inactive chip keeps its full-colour 1px border (now --status-ok-fg / --status-danger-fg) rather than adopting --status-*-border plus a tinted background, to stay a values-only swap (D-03)"
  - "PromoCard only had two colour literals; its existing var(--anthracite*)/var(--copper) references were left to the light legacy remap from 86-01"

patterns-established:
  - "A Confirm? delete prompt is displayed uppercase through textTransform, never by typing capitals in source"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "Promo codes screen (page, table, form, airport promo card) holds no hex/rgba literal; active/inactive and errors use status tokens and keep text labels"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
      - kind: unit
        ref: "tests/PromoCard.test.tsx"
        status: pass
      - kind: unit
        ref: "tests/admin-theme-css.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Drivers screen (page, table, form) holds no hex/rgba literal"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
      - kind: unit
        ref: "tests/admin-drivers.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "No capital-typed display string remains in the seven files"
    requirement: ADM-03
    verification:
      - kind: other
        ref: "node scripts/qa/admin-caps-scan.mjs <seven files> (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Promo codes and drivers screens read correctly in both themes in a real browser"
    verification: []
    human_judgment: true
    rationale: "Admin sign-in is impossible on localhost (fail-closed Upstash limiter), so the authenticated screens cannot be viewed locally. Owner UAT on production at phase closeout."

duration: 6min
completed: 2026-11-02
---

# Phase 86 Plan 06: Promo codes and drivers screens on theme tokens Summary

**The promo codes screen (including the airport promo card) and the drivers screen now render from `--admin-*` / `--status-*` tokens only, with the three capital-typed labels in sentence case plus inline uppercase, and the 86-06 pending ledger is gone.**

## Performance

- **Duration:** about 6 minutes
- **Started:** 2026-11-02T20:54Z
- **Completed:** 2026-11-02T21:01Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 7 source files, 1 ledger deleted

## Accomplishments

- Tracer: promo-codes page, `PromoCodesTable`, `PromoCodeForm` and `PromoCard` converted (36 literal lines removed across the four files, including the two `#ff6b6b` error reds in `PromoCard`). Tracer verify (`PromoCard`, colour guard, theme css tests) ran green before expanding.
- Drivers page, `DriversTable` and `DriverForm` converted with the same usage-based mapping. Ledger file `86-06.json` deleted; colour guard, `admin-theme-css` and `admin-drivers` tests green (60 tests).
- Mapping applied: modal and panel surfaces to `--admin-surface`; text inputs to `--admin-input-bg` with `1px solid var(--admin-border-strong)`; dividers and row rules to `--admin-border`; `#F5F2EE` to `--admin-text`; `#CFC9C2` to `--admin-text-muted`; copper fills to `--admin-accent` with `--admin-on-accent` text (4 buttons across the two screens, all previously plain off-white on copper); the drivers screen accounts for the other 34 literal lines; `#4ade80` to `--status-ok-fg`; every red to `--status-danger-fg`.
- D-17 / T-86-14: the active/inactive promo chip and the toggle icon keep their `Active` / `Inactive` text labels and now use the AA-checked status tokens in both themes.

## Task Commits

1. **Task 1 (tracer): promo codes screen on tokens** - `9ee9398f` (feat)
2. **Task 2: drivers screen on tokens** - `a4831902` (feat)
3. **Task 3: sentence-case labels (D-10)** - `dce153a3` (feat)

## Changed strings (D-10, before -> after)

| File | Before | After | Inline uppercase |
|------|--------|-------|------------------|
| `components/admin/PromoCard.tsx:65` | `AIRPORT PROMO` | `Airport promo` | already present via `headerLabelStyle` |
| `components/admin/PromoCodesTable.tsx:216` | `ACTIVE` / `INACTIVE` | `Active` / `Inactive` | added `textTransform: 'uppercase'` to the chip |
| `components/admin/PromoCodesTable.tsx:262` | `CONFIRM?` | `Confirm?` | added `textTransform: 'uppercase'` |
| `components/admin/DriversTable.tsx:210` | `CONFIRM?` | `Confirm?` | added `textTransform: 'uppercase'` |

No `caps-ok` markers were needed. `tests/PromoCard.test.tsx` queries only `/airport promo saved/i`, `/promo price must not exceed/i`, the switch role, price labels and the Save button, so it needed no change. Column headers, form labels (`thStyle`, `labelStyle`) were already uppercase through an inline `textTransform` and use title-case source text.

## Verification Results

- `npx vitest run tests/PromoCard.test.tsx tests/admin-drivers.test.ts tests/admin-no-hardcoded-colors.test.ts tests/admin-theme-css.test.ts`: 4 files, 66 tests passed.
- Literal grep over the seven files (comment lines excluded): 0 for both promo and driver groups.
- `node scripts/qa/admin-caps-scan.mjs <seven files>`: exit 0.
- `npx tsc --noEmit --pretty false` filtered to the promo/driver paths: no errors. `eslint --quiet` on the three files edited in Task 3: clean.
- `tests/fixtures/admin-color-pending/86-06.json` no longer exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Gap] Scanner blind spot for `CONFIRM?`**
- **Found during:** Task 3 (D-10 pass)
- **Issue:** `scripts/qa/admin-caps-scan.mjs` does not include `?` in its capital character class, so the own-line `CONFIRM?` delete prompts in `PromoCodesTable` and `DriversTable` were not reported although they are capital-typed display strings (plan: "rewrite every displayed string typed in capitals").
- **Fix:** Converted both to `Confirm?` with inline `textTransform: 'uppercase'`. The scanner itself belongs to 86-01 and was not edited.
- **Files modified:** `components/admin/PromoCodesTable.tsx`, `components/admin/DriversTable.tsx`
- **Committed in:** `dce153a3`

---

**Total deviations:** 1 auto-fixed (1 gap in scanner coverage)
**Impact on plan:** No scope creep; same D-10 rule applied to two strings the scanner could not see. Worth considering adding `?` to `CAP_CHARS` in a later cleanup so other admin files with `CONFIRM?` are caught.

## Issues Encountered

- The sandbox refused composite shell commands (git plus a runtime variable in `sed`); resolved by running plain, separate commands with literal paths.
- The per-plan commit ledger in the git dir was not used for the same reason; the spawn-time base `043b2d1b` (asserted at start) was used for the measured commit count.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or schema changes; case-only and colour-only edits. T-86-SC: no package installs were run.

## Next Phase Readiness

The remaining literals in the other Wave 2 plans' ledgers are untouched. Plan 86-08 owns the light safety-net rules for inline uppercase; once those ship, the three labels above render in sentence case in the light theme and capitals in dark. Owner UAT of both themes on these screens is deferred to production.

## Self-Check: PASSED

- All seven source files present; `86-06.json` absent as required.
- Commits `9ee9398f`, `a4831902`, `dce153a3` exist in `git log 043b2d1b..HEAD`.
- STATE.md and ROADMAP.md not modified.
