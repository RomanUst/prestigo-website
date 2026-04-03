---
phase: 22-mobile-admin-promo-code-system
plan: "01"
subsystem: admin-promo-codes
tags: [promo-codes, admin, api, sql, ui]
dependency_graph:
  requires: []
  provides: [admin-promo-crud, claim-promo-function, PromoCodesTable, PromoCodeForm]
  affects: [plan-22-03-promo-wizard-integration]
tech_stack:
  added: []
  patterns: [Next.js route handlers, TDD vitest, inline CSS-in-JS, optimistic updates]
key_files:
  created:
    - supabase/migrations/022_promo_claim_function.sql
    - prestigo/app/api/admin/promo-codes/route.ts
    - prestigo/components/admin/PromoCodesTable.tsx
    - prestigo/components/admin/PromoCodeForm.tsx
    - prestigo/app/admin/(dashboard)/promo-codes/page.tsx
    - prestigo/tests/admin-promo-codes.test.ts
  modified: []
decisions:
  - "GET route accepts _request: Request param for TypeScript consistency with test signatures"
  - "PromoCodesTable uses useEffect to sync localCodes from parent props (prevents stale state)"
  - "Pre-existing TS errors in admin-pricing.test.ts and admin-zones.test.ts are out of scope — not caused by this plan"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
---

# Phase 22 Plan 01: Admin Promo Code System Summary

**One-liner:** Atomic `claim_promo_code` SQL function + admin CRUD API (GET/POST/PATCH/DELETE) + PromoCodesTable/PromoCodeForm UI components with optimistic updates and TDD-green tests.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration + Admin API route + tests (TDD) | aed5d93 | 022_promo_claim_function.sql, route.ts, admin-promo-codes.test.ts |
| 2 | Admin promo page + PromoCodesTable + PromoCodeForm UI | d9a3bd9 | page.tsx, PromoCodesTable.tsx, PromoCodeForm.tsx |

## What Was Built

### SQL Migration (022_promo_claim_function.sql)
Atomic `claim_promo_code(p_code TEXT)` PostgreSQL function that uses `UPDATE ... RETURNING` to atomically increment `current_uses` only when code is active, non-expired, and within usage limit. Used in Plan 03 for race-condition-safe promo redemption.

### Admin API Route (app/api/admin/promo-codes/route.ts)
Four handlers with `getAdminUser()` auth guard and Zod validation:
- **GET**: returns all promo codes ordered by created_at DESC
- **POST**: creates with promoCreateSchema (code auto-uppercased, 23505 duplicate detection)
- **PATCH**: toggles is_active via promoPatchSchema
- **DELETE**: deletes by id from query params

### PromoCodeForm
'use client' form with auto-uppercase code input, discount %, expiry date, usage limit. Copper "Add Code" CTA (44px), inline "Code already exists." error below CODE field.

### PromoCodesTable
'use client' table with CODE/DISCOUNT/EXPIRY/USES/STATUS/ACTIONS columns. Active/inactive badges (green/red inline border badges). Optimistic toggle via ToggleLeft/ToggleRight Lucide icons. Trash2 delete with 3-second "CONFIRM?" inline confirmation. Empty state with "Create Code" CTA that focuses the PromoCodeForm input.

### Admin Page (/admin/promo-codes/page.tsx)
Page with Cormorant 26px heading, subtitle, PromoCodeForm in card wrapper, PromoCodesTable. Optimistic prepend on create, re-fetch via onUpdate prop.

## Verification Results

1. `vitest run tests/admin-promo-codes.test.ts` — 7/7 tests pass
2. `tsc --noEmit` — 0 errors in new files (pre-existing errors in admin-pricing.test.ts and admin-zones.test.ts are out of scope)
3. Migration file exists with `claim_promo_code` function and `max_uses IS NULL OR current_uses < max_uses` guard
4. All 6 artifact files created and verified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Param] GET handler needs Request parameter for TypeScript**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** GET handler declared with no params but test passes a Request argument — TS error TS2554
- **Fix:** Changed `GET()` to `GET(_request: Request)` for TypeScript compatibility
- **Files modified:** `prestigo/app/api/admin/promo-codes/route.ts`
- **Commit:** d9a3bd9 (included in Task 2 commit)

**2. [Rule 1 - Bug] PromoCodesTable local state sync**
- **Found during:** Task 2 (code review)
- **Issue:** `localCodes` state used a direct reference comparison that would fail to sync when parent re-fetches; replaced with `useEffect` on `promoCodes` prop
- **Fix:** Added `useEffect(() => setLocalCodes(promoCodes), [promoCodes])`
- **Files modified:** `prestigo/components/admin/PromoCodesTable.tsx`
- **Commit:** d9a3bd9

### Deferred Items

Pre-existing TypeScript errors in `admin-pricing.test.ts` (lines 89, 99, 141) and `admin-zones.test.ts` (lines 102, 112, 124) — `GET()` called with arguments where function expects 0 params. Out of scope for this plan.

## Self-Check: PASSED

All files created:
- FOUND: supabase/migrations/022_promo_claim_function.sql
- FOUND: prestigo/app/api/admin/promo-codes/route.ts
- FOUND: prestigo/components/admin/PromoCodesTable.tsx
- FOUND: prestigo/components/admin/PromoCodeForm.tsx
- FOUND: prestigo/app/admin/(dashboard)/promo-codes/page.tsx
- FOUND: prestigo/tests/admin-promo-codes.test.ts

All commits exist:
- aed5d93: feat(22-01): migration + admin promo-codes API route + tests
- d9a3bd9: feat(22-01): admin promo UI components — PromoCodesTable, PromoCodeForm, page
