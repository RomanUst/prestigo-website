# Deferred Items — Phase 16

## Pre-existing Build Error (Out of Scope)

**File:** prestigo/app/api/admin/pricing/route.ts:80
**Error:** `revalidateTag('pricing-config')` — Type error: Expected 2 arguments, but got 1.
**Discovered during:** Phase 16, Plan 01, Task 2 (build verification)
**Pre-existing:** Confirmed — error exists in commit e965854 (before AdminSidebar changes)
**Impact:** Build fails at TypeScript check. Next.js 16 changed `revalidateTag` signature.
**Action needed:** Update `revalidateTag('pricing-config')` to match new API signature in Next.js 16.
