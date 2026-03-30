# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-30
**Phases:** 6 | **Plans:** 25 | **Timeline:** 6 days

### What Was Built
- Full 6-step booking wizard at `/book` — trip type selection, route entry (Google Places), date/time picker, vehicle selection with live Stripe-destined pricing, extras, passenger details, Stripe payment
- Server-side pricing engine via Google Routes API — API key never reaches the browser
- Supabase persistence + Resend email notifications (client confirmation + manager alert) triggered by Stripe webhook
- BookingWidget on the homepage replacing the old LimoAnywhere iframe, with state carry-over into the wizard
- Complete mobile UX polish at 375px: safe-area-inset, scrollIntoView, 44px touch targets, keyboard navigation; 32/32 tests passing

### What Worked
- **Server-first secret handling** — routing Google Maps key and Stripe secret through API routes from the start avoided any late-stage refactoring
- **Webhook-as-source-of-truth** pattern (save/email only after confirmed payment) eliminated double-save and race condition risks
- **Phase-by-phase verification checkpoints** with human sign-off caught the Continue-button pointer-events bug (Phase 1) and the double-mobile-bar overlap (Phase 2) before they could compound
- **Zustand partialize + sessionStorage** gave free session persistence at every step with no extra complexity
- **Zod schema factory** for conditional required fields (flight number on airport rides) handled runtime branching cleanly

### What Was Inefficient
- ROADMAP.md tracking of plan completion status got out of sync with actual execution (Phase 1 and 3 checkboxes not updated), requiring manual reconciliation at milestone close
- Phase 4 "Plans: TBD" was left in the roadmap at write time, creating a gap in the progress table
- `vi.hoisted()` mock pattern took several iterations to discover — worth documenting earlier in test setup conventions
- Node version mismatch (v16 in shell, v22 required for Vitest) caused repeated friction; should be captured in `.nvmrc` or CI config

### Patterns Established
- **`vi.hoisted()` for ES class constructor mocks** — required when `new Stripe()` (or similar) is called at module load time
- **Non-fatal email wrapping** — individual try/catch blocks around each email send in route handlers (defense in depth beyond service-layer catching)
- **Dual mobile-bar pattern** — wizard shell bar hidden at Step 3; PriceSummary fixed bar serves as Step 3 mobile nav to prevent 56px + 72px stack
- **capturedOnSelect Map mock** — simulates Google Places address selection in tests without real API calls
- **`useRef` snapshot before Zustand `resetBooking`** — captures store state for confirmation page display before it clears
- **stepFadeUp separate @keyframes** — distinct from global `fadeUp` to allow different durations without conflicts

### Key Lessons
1. Keep ROADMAP.md plan checkboxes updated at each plan commit — drift requires manual audit at milestone close
2. Capture Node version requirement in `.nvmrc` immediately to avoid repeated shell friction
3. `vi.hoisted()` is the only reliable pattern for mocking ES class constructors invoked at module load — document this in test setup docs
4. Server-side-first for any API key: route everything through Next.js API routes from day 0, never retrofit

### Cost Observations
- Model mix: ~100% Sonnet 4.6
- Sessions: ~10 sessions across 6 days
- Notable: yolo mode with standard granularity kept plan execution fast; most plans ran in 3–8 min

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 6 | 25 | First milestone — baseline established |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.0 | 32 passing | 0 (used existing stack) |

### Top Lessons (Verified Across Milestones)

1. Webhook-as-source-of-truth eliminates double-save bugs in payment flows
2. Server-side-first for API keys prevents late-stage security refactoring
