---
phase: 16-admin-ui-pages
plan: "01"
subsystem: admin-ui
tags: [admin, components, navigation, ui-primitives, packages]
dependency_graph:
  requires: []
  provides:
    - StatusBadge component (4 variants)
    - KPICard component
    - AdminSidebar with active state
  affects:
    - prestigo/components/admin/AdminSidebar.tsx
    - Phase 16 plans 02-05 (consume StatusBadge, KPICard)
tech_stack:
  added:
    - "@vis.gl/react-google-maps@1.8.2"
    - "terra-draw@1.27.0"
    - "terra-draw-google-maps-adapter@1.3.1"
    - "recharts@3.8.1"
    - "@tanstack/react-table@8.21.3"
  patterns:
    - usePathname active detection for sidebar nav
    - Inline style-based design tokens (var(--copper) etc.)
    - Hover transition via onMouseEnter/onMouseLeave
key_files:
  created:
    - prestigo/components/admin/StatusBadge.tsx
    - prestigo/components/admin/KPICard.tsx
  modified:
    - prestigo/package.json (5 new dependencies)
    - prestigo/components/admin/AdminSidebar.tsx
decisions:
  - "Pre-existing build error in app/api/admin/pricing/route.ts (revalidateTag signature) confirmed out-of-scope — deferred to deferred-items.md"
  - "Active nav detection uses pathname.startsWith(item.href) — allows sub-routes to also highlight parent nav item"
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 16 Plan 01: Packages and Shared UI Primitives Summary

**One-liner:** Installed 5 Phase 16 packages (vis.gl, terra-draw, recharts, tanstack-table) and built StatusBadge/KPICard primitives plus upgraded AdminSidebar with copper active-state nav using usePathname.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Install packages + create StatusBadge + KPICard | e965854 | package.json, StatusBadge.tsx, KPICard.tsx |
| 2 | Upgrade AdminSidebar with next/link and active state | 92bbf12 | AdminSidebar.tsx |

## What Was Built

### StatusBadge (`prestigo/components/admin/StatusBadge.tsx`)
Reusable badge component with 4 semantic variants:
- `active` — green (#4ade80 on #1a3a2a)
- `inactive` — red (#f87171 on #2a1a1a)
- `pending` — orange (#fb923c on #3a2a1a)
- `quote` — blue (#60a5fa on #1a2a3a)

Each variant renders a colored dot + uppercase label in 11px Montserrat.

### KPICard (`prestigo/components/admin/KPICard.tsx`)
Metric card for dashboards. Label uses copper 11px Montserrat (0.4em tracking), value uses 32px Cormorant weight-300, optional sub-label in warmgrey. Hover border transitions to `var(--copper)` in 300ms.

### AdminSidebar (upgraded)
- Replaced `<a>` tags with `<Link>` (next/link) for prefetching
- Added `usePathname()` for active state detection
- Active items: `3px solid var(--copper)` left border, `paddingLeft: '17px'`, offwhite color
- Inactive items: transparent border, `paddingLeft: '20px'`, warmgrey color
- Typography consolidation: sign-out 12px→11px, Admin sublabel 10px→11px, marginTop 2px→4px
- Locked values preserved: nav `padding: '10px 20px'`, header `padding: '24px 20px'`

## Deviations from Plan

### Deferred Issues (Out of Scope)

**Pre-existing TypeScript build error in pricing route**
- **Found during:** Task 2 (build verification)
- **File:** `prestigo/app/api/admin/pricing/route.ts:80`
- **Error:** `revalidateTag('pricing-config')` — Expected 2 arguments (Next.js 16 API change)
- **Confirmed pre-existing:** Error exists before any Phase 16 changes (verified via git stash)
- **Action:** Documented in `.planning/phases/16-admin-ui-pages/deferred-items.md`

## Self-Check: PASSED
