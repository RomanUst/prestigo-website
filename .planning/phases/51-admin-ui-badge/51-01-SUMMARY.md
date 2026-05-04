---
phase: 51
plan: 01
subsystem: admin-ui
tags: [admin, ui, gnet, badge, booking-source]
dependency_graph:
  requires: []
  provides: [gnet-badge-desktop, gnet-badge-mobile, booking-source-gnet-type]
  affects: [components/admin/BookingsTable.tsx]
tech_stack:
  added: []
  patterns: [inline-styles, conditional-render, data-testid]
key_files:
  created: []
  modified:
    - components/admin/BookingsTable.tsx
decisions:
  - Inline styles used (matching existing file pattern — no Tailwind classes)
  - Badge placed after leg badge in render order (MANUAL → leg → GNET)
  - Mobile badge uses identical color scheme as desktop (UI-SPEC: same padding)
metrics:
  duration: ~10 minutes
  completed: "2026-04-27"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 1
---

# Phase 51 Plan 01: Admin UI — GNet Badge Summary

**One-liner:** Added GNET booking source badge (#1a2a3a/#60a5fa blue-on-dark) to desktop REF column and mobile card top row in BookingsTable.tsx with strict `=== 'gnet'` conditional render.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend Booking interface — add 'gnet' to booking_source union | 324e95c | components/admin/BookingsTable.tsx |
| 2 | Add GNET badge to desktop REF column cell | 138d8d7 | components/admin/BookingsTable.tsx |
| 3 | Add GNET badge to mobile card top row | c35a656 | components/admin/BookingsTable.tsx |

## What Was Built

- Extended `interface Booking` in `BookingsTable.tsx`: `booking_source: 'online' | 'manual' | 'gnet'`
- Desktop table: conditional `<span data-testid="gnet-badge-{id}">GNET</span>` after leg badge in REF column cell
- Mobile card: conditional `<span data-testid="gnet-badge-mobile-{id}">GNET</span>` after leg-badge-mobile in top row

## Badge Style (UI-SPEC Compliant)

| Property | Value |
|----------|-------|
| background | `#1a2a3a` |
| color | `#60a5fa` |
| border | `1px solid rgba(59,130,246,0.25)` |
| font-size | `11px` |
| font-weight | `500` |
| text-transform | `uppercase` |
| letter-spacing | `0.08em` |
| padding | `4px 8px` |
| border-radius | `2px` |
| margin-left | `8px` |

## Render Order

Booking reference text → MANUAL badge (if manual) → leg badge (if RETURN/OUTBOUND) → GNET badge (if gnet)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

- T-51-03 mitigated: Badge uses distinct blue color (`#60a5fa`) vs MANUAL amber (`#E8B87A`), strict `=== 'gnet'` equality ensures no false positives.

## Self-Check

- [x] components/admin/BookingsTable.tsx modified in worktree
- [x] `booking_source: 'online' | 'manual' | 'gnet'` — line 20
- [x] `gnet-badge-{id}` testid — desktop, line 352
- [x] `gnet-badge-mobile-{id}` testid — mobile, line 712
- [x] `>GNET<` text appears 2 times (desktop + mobile)
- [x] `booking_source === 'gnet'` conditions: 2
- [x] No Tailwind classes introduced
- [x] 3 individual commits: 324e95c, 138d8d7, c35a656

## Self-Check: PASSED
