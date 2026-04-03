# Deferred Items — Phase 21

## Pre-existing test failures (out of scope for 21-01)

Discovered during full suite run. NOT caused by 21-01 changes. Do not fix here.

### 1. tests/submit-quote.test.ts — 6 tests failing
- **Pattern:** Route returns 400/429 instead of 200; `buildBookingRow`, `withRetry`, `sendManagerAlert`, `sendEmergencyAlert` not called
- **Root cause:** Pre-existing test payload or route validation mismatch — unrelated to pricing changes
- **Action:** Investigate in a dedicated fix plan

### 2. tests/BookingWidget.test.tsx — 1 test failing
- **Test:** "renders a time input with step=900"
- **Failure:** `expected '300' to be '900'` — time input step attribute mismatch
- **Root cause:** Pre-existing UI component mismatch — unrelated to pricing changes
- **Action:** Fix in a dedicated UI fix plan
