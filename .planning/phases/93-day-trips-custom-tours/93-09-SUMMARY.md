---
phase: 93-day-trips-custom-tours
plan: 09
subsystem: admin-tours-list
tags: [tours, admin-ui, settings, reorder]
status: complete
requires: ["93-07"]
provides:
  - "/admin/tours page: tours table, New tour dialog, Tour settings card, immediate reorder with rollback"
  - "components/admin/tours/ToursTable.tsx (export TourListRow), NewTourModal.tsx, TourSettingsCard.tsx (default export)"
  - "Tours (Route icon) sidebar entry right after Quotes"
affects: [93-10]
requirements: [TRIP-03, TRIP-05]
tech-stack:
  added: []
  patterns:
    - "CancellationPolicySettings recipe (optimistic save on blur, per-field feedback) for the global tour settings"
    - "Reorder swaps two rows locally, POSTs the full id list, restores the previous array on failure"
key-files:
  created:
    - app/(internal)/admin/(dashboard)/tours/page.tsx
    - components/admin/tours/ToursTable.tsx
    - components/admin/tours/NewTourModal.tsx
    - components/admin/tours/TourSettingsCard.tsx
    - tests/admin-tours-list.test.tsx
    - tests/admin-tour-settings-card.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - tests/AdminSidebar.test.tsx
decisions:
  - "TourSettingsCard loads its own values from GET /api/admin/tour-settings (the route answers the bare row) instead of receiving props, so the page needs no second fetch and the card has its own load-error / Retry state."
  - "Prices from the list are EUR numbers; they are shown through the admin money() formatter (Math.round(x*100) minor units), never typed."
  - "Below 768px the table stacks into cards through a small scoped <style> block (tokens only) inside ToursTable, since admin-theme.css is outside this plan's files."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 15500
  tasks: 2
  commits: 2
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 69ff59a4512923fd779dbb6e25a9f6f3f1bb74b9
---

# Phase 93 Plan 09: Admin tours list Summary

The operator's tours overview at /admin/tours: list with order buttons, cover, EN title and address, Published / Draft badge, eight language chips (text plus icon), E / S / V prices and hours; a New tour dialog that creates a draft and opens its editor; and the global Tour settings card (extra-hour prices, free-cancellation hours, pickup radius) with optimistic save on blur.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | List page reads the API; New tour creates a draft and opens its editor; Tours sidebar entry | 3e7cb91e |
| 2 | Tour settings card and immediate reorder with rollback | 69ff59a4 |

## Verification

- `npx vitest run --exclude '.claude/**' tests/admin-tour-settings-card.test.tsx tests/admin-tours-list.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 53 passed. `tests/AdminSidebar.test.tsx` also green (34).
- `npx tsc --noEmit`: only the 8 baseline errors in tests/; none in the new files.
- `npx eslint --quiet` on components/admin/tours, the page, AdminSidebar and both new tests: clean.
- No colour literal and no `€` in any new file; no secrets.
- Tracer gate: the tracer task has no `gate` attribute and its `<verify>` is automated; re-run green before Task 2.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/AdminSidebar.test.tsx pins the full nav order**
- **Found during:** Task 1 verification (the new Tours entry made "renders all 12 items in order" fail).
- **Fix:** added `['Tours', '/admin/tours']` after Quotes in its NAV list and renamed the test to 13 items. File was not in the plan's `files_modified`. If another wave-4 plan also adds a sidebar entry (UI-SPEC lists "Custom tours" after Tours), the NAV list in this test will need that item too; expect a trivial merge conflict on this array and on the `navItems` array.

No other deviations.

## Notes for the orchestrator

- The browser check (preview) was not run: the worktree has no dev server and the admin pages need a logged-in admin session. Behaviour is covered by the component tests with fetch mocks; the routes are 93-07's. A live look at /admin/tours after merge is worthwhile (stacked-card layout below 768px in particular).
- "View" opens `/services/<slug>` (English, default locale without prefix under `localePrefix: 'as-needed'`).
- The editor link `/admin/tours/<id>` (Edit, and after Create draft) points to the page built by another plan (93-10).

## Threat model

T-93-25: the page sits under the (dashboard) layout gate and every API re-checks admin (93-07). T-93-26: client bounds mirror tourSettingsSchema (price > 0 and <= 100000 with two decimals, hours 0..72, radius 1..50 step 0.5); the server rejects out-of-range values and a rejected save restores the last saved value. No new threat surface.

## Known Stubs

None.

## Self-Check: PASSED

All six created files and the two modified files exist; commits 3e7cb91e and 69ff59a4 exist on the branch.
