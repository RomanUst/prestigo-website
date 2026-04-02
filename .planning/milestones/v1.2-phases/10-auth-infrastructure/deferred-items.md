# Deferred Items — Phase 10 Auth Infrastructure

## Pre-existing Issues (Out of Scope)

### 1. TypeScript Error in tests/health.test.ts

**File:** `prestigo/tests/health.test.ts` line 95
**Error:** `Type 'Mock<() => { limit: Mock<() => Promise<{ error: { message: string; }; }>>; }>' is not assignable to type 'Mock<() => { limit: Mock<() => Promise<{ error: null; }>>; }>'`
**Status:** Pre-existing before Phase 10 — verified by checking git stash
**Impact:** `npx tsc --noEmit` exits with code 2, but the error is in a test mock, not production code. The production build (next build) succeeds and all vitest tests pass.
**Recommendation:** Fix the Mock type annotation in `tests/health.test.ts` to use a union type or `as unknown as` cast to satisfy TypeScript strict mode.
**Priority:** Low — does not affect build or test runtime, only strict type checking.
