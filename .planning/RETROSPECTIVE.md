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

## Milestone: v1.1 — Go Live

**Shipped:** 2026-04-01
**Phases:** 3 (7–9) | **Plans:** 7 | **Timeline:** 2 days (2026-03-30 → 2026-04-01)

### What Was Built
- Supabase bookings table live in production — 33-column SQL migration at `supabase/migrations/0001_create_bookings.sql`; all 8 env vars documented in `.env.example` and set in Vercel Production scope
- `/api/health` endpoint with per-service probes for Supabase, Stripe, and Resend — 6 unit tests passing; serves as single integration health gate
- Stripe live-mode webhook registered at `rideprestigo.com/api/webhooks/stripe`; `STRIPE_WEBHOOK_SECRET` scoped to Production only; Stripe fetch client fix for Vercel Hobby
- Google Maps two-key pattern verified — server key unrestricted (Vercel sends no Referer), client key restricted to production domain
- Resend domain `rideprestigo.com` verified (SPF + DKIM); domain typo (`rideprestige.com`) fixed across all 6 occurrences in `lib/email.ts`; both transactional emails confirmed inbox delivery

### What Worked
- **Health endpoint as integration gate** — having `/api/health` probe all three services in one call provided a single verification step after each Vercel deployment rather than testing each service separately
- **Phase 9 summary captured blockers resolved mid-execution** — Stripe SDK connectivity issue and wrong webhook endpoint were discovered during email testing but documented in Plan 02 summary, maintaining a clean audit trail
- **`printf` over `echo` for CLI secret injection** — discovered via trailing `\n` bug; prevented webhook signature failures that would have been hard to diagnose in production
- **Production domain correction** — catching `rideprestige.com` vs `rideprestigo.com` in Phase 8 prevented silent failures in email delivery and Stripe webhook registration

### What Was Inefficient
- REQUIREMENTS.md EMAIL-01 through EMAIL-04 were not updated to `[x]` after Phase 9 completed — required manual note at milestone close
- Stripe env vars were re-set multiple times due to trailing newline issue — could be avoided by documenting the `printf` pattern upfront in env var setup instructions
- Stripe webhook was initially created pointing to wrong domain — happened because PLAN.md contained `rideprestige.com` typo carried forward from before domain correction in Phase 8

### Patterns Established
- **`printf` for Vercel CLI secret injection** — `printf "value" | vercel env add KEY production` (no trailing newline); `echo` silently corrupts secrets
- **Stripe fetch client on Vercel Hobby** — `Stripe.createFetchHttpClient()` + `maxNetworkRetries: 0` required; Node http module incompatible with Vercel Hobby serverless runtime
- **Resend constructor mock (function keyword)** — `vi.mock('resend', () => ({ Resend: vi.fn(function() { return stub }) }))` — arrow functions cannot be called with `new`; requires `vi.clearAllMocks()` + re-implementing in `beforeEach`
- **Google Maps key separation rule** — server key must have Application restrictions = None (Vercel serverless sends no Referer); client key restricted to `https://production-domain/*` with explicit scheme prefix

### Key Lessons
1. Capture production domain name definitively at project start — a typo that exists in plans and config silently propagates across external service registrations (Stripe, Resend, Vercel) and is expensive to unwind
2. Always use `printf` (not `echo`) when piping secrets into Vercel CLI — trailing newlines cause webhook signature verification failures that manifest as mysterious 400 errors
3. `/api/health` with per-service probes pays for itself immediately — single curl confirms the entire integration stack after deploy without navigating three separate dashboards
4. Stripe on Vercel Hobby requires `createFetchHttpClient()` — document this constraint in the tech stack notes to avoid re-discovering it

### Cost Observations
- Model mix: ~100% Sonnet 4.6
- Sessions: ~5 sessions across 2 days
- Notable: majority of v1.1 work was human dashboard configuration (Stripe, Vercel, Resend, Google Cloud Console) with Claude providing task scaffolding and code fixes; fast turnaround

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 6 | 25 | First milestone — baseline established |
| v1.1 Go Live | 3 | 7 | Primarily external dashboard config; health endpoint as integration gate |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.0 | 32 passing | 0 (used existing stack) |
| v1.1 | 32 passing (+6 health tests) | 0 (same stack) |

### Top Lessons (Verified Across Milestones)

1. Webhook-as-source-of-truth eliminates double-save bugs in payment flows
2. Server-side-first for API keys prevents late-stage security refactoring
3. Production domain must be pinned definitively at project start — typos in plans propagate to external service registrations
4. Use `printf` not `echo` when injecting secrets via CLI — trailing newlines cause signature verification failures
