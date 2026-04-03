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

## Milestone: v1.2 — Operator Dashboard

**Shipped:** 2026-04-02
**Phases:** 8 (10–17) | **Plans:** 16 | **Timeline:** 2 days (2026-04-01 → 2026-04-02)

### What Was Built
- Supabase Auth-protected `/admin` area with email+password login, server-side double-guard, session middleware, sign-out
- `pricing_config` + `pricing_globals` + `coverage_zones` Supabase tables with RLS; DB-driven pricing replacing all hardcoded constants
- Admin pricing editor (react-hook-form + zod) — base rates per vehicle class + globals (airport fee, night/holiday coefficients, extras); changes live immediately
- Coverage zone editor — terra-draw polygon drawing on Google Maps (`@vis.gl/react-google-maps`), GeoJSON stored in Supabase, drives `quoteMode: true` in booking wizard when outside zones
- Bookings table — TanStack Table with paginated API, filter chips (date, trip type), debounced search, expandable rows, KPI cards
- Stats dashboard — 8-parallel Supabase aggregations, Recharts bar charts (12-month revenue + groupings), KPI cards
- Airport fee coordinate-based detection in `/api/calculate-price` — resilient to Google Places placeId mismatch

### What Worked
- **DB-first pricing schema design** — defining `pricing_globals` as a singleton row from the start kept the pricing API clean and backwards-compatible
- **terra-draw two-layer SSR bypass** — `ZoneMap ('use client')` wrapping `ZoneMapInner` via `next/dynamic(ssr:false)` solved SSR incompatibility without touching the page Server Component; discovered and documented once, no rework
- **Plan structure for Phase 16** — splitting 5 sub-plans (UI primitives → pricing → zones → bookings → stats) let each plan ship independently; stale priceBreakdown bug discovered and fixed in the same session
- **Gap closure phase pattern** — when v1.2 audit found PRICING-03/04 unimplemented, creating Phase 17 as an explicit gap closure phase kept the main execution clean and the gap addressable without re-opening earlier phases

### What Was Inefficient
- **Airport fee placeId fragility** — the initial implementation used `PRG_CONFIG.placeId` to detect airport rides; Google Places API returned a different placeId, so airport_fee never applied. Required two debug sessions and an architecture shift to coordinate-based detection
- **`unstable_cache` + `revalidateTag` mismatch** — Next.js 16 changed `revalidateTag` signature AND the `'max'` profile arg only clears `use cache` directive entries (not `unstable_cache`). Removed the cache entirely rather than fighting the new API
- **Stale `priceBreakdown` in sessionStorage** — `if (!priceBreakdown) { fetch() }` guard in Step3Vehicle caused pricing to show stale data across sessions. Should never cache computed pricing server results on the client
- **Phase 17 needed as gap closure** — PRICING-03/04 were listed as Phase 16 requirements but never actually wired; a more thorough Phase 14/16 integration test would have surfaced this during execution rather than at audit time
- **AddressInput first-character deletion** — `onClear()` triggered a useEffect that wiped the input text the user just typed; required a ref flag to distinguish typing-triggered clears from external clears

### Patterns Established
- **Coordinate-based airport detection** — use lat/lng proximity (~3km radius) instead of placeId comparison; placeIds are version-dependent and fragile
- **No client-side caching for computed prices** — never persist `priceBreakdown` in sessionStorage; always fetch fresh on Step 3 mount; pricing globals can change in admin at any time
- **`isTypingClearRef` pattern for AddressInput** — when `onClear()` is called from within `handleInputChange`, set a ref flag before calling it; the sync `useEffect` checks this flag before clearing input text
- **terra-draw div.id must be set programmatically before adapter init** — `mapDiv.id = 'tdmap-' + Date.now()` prevents `querySelector` null crash
- **Gap closure phases as first-class roadmap entries** — when an audit finds a gap, create a named phase (e.g., "Phase 17: Pricing Globals Integration (Gap Closure)") rather than reopening an existing phase
- **`drawRef.current` cross-boundary wiring** — for terra-draw with React: declare `drawRef` in outer component, pass to draw layer child, assign in `draw.on('ready')` callback

### Key Lessons
1. Never use a Google Places `placeId` for business logic — it can change between API versions. Use coordinates instead
2. Never persist computed/derived data (like `priceBreakdown`) in sessionStorage — only persist user inputs; derived state must always be computed fresh
3. When an effect clears state based on a prop going null, always distinguish between "user action caused it" vs "external clear" using a ref flag
4. Test the full admin→booking-wizard data flow (e.g., change airport_fee → check price in wizard) before marking pricing requirements complete — integration gaps only surface end-to-end
5. `unstable_cache` in Next.js 16 is not reliably busted by `revalidateTag` with the `'max'` profile — for admin-controlled data that must update immediately, use plain async functions with no caching

### Cost Observations
- Model mix: ~100% Sonnet 4.6
- Sessions: ~6 sessions across 2 days
- Notable: most complex milestone so far (8 phases, 16 plans, 14,012 insertions); terra-draw SSR and pricing bug required the most back-and-forth; gap closure phase added same-day

---

## Milestone: v1.3 — Pricing & Booking Management

**Shipped:** 2026-04-03
**Phases:** 5 (18–22) | **Plans:** 13 | **Timeline:** 1 day (2026-04-03)
**Files changed:** 52 | **Insertions:** 10,198

### What Was Built
- `lib/zones.ts` `isInAnyZone` helper — OR-logic zone pricing fix with 4-case TDD test matrix
- V1.3 schema foundation — `bookings.status` FSM column, `operator_notes`, `booking_source`; `promo_codes` table; `holiday_dates` JSONB on `pricing_globals`
- Booking lifecycle FSM — server-side PATCH with FSM validation; optimistic status UI; 800ms debounced operator notes auto-save
- Manual booking creation (phone orders) + cancel endpoint with Stripe-first refund; `CancellationModal` with refund-warning and manual-only variants
- Holiday date coefficient (O(1) Set lookup) + per-class minimum fare floor; admin `PricingForm` extended with MIN FARE column and HOLIDAY DATES card
- End-to-end promo code system — admin CRUD + atomic `claim_promo_code` Supabase RPC + `PromoInput` in Step6Payment; server recomputes discount independently
- Admin panel mobilized at 375px — hamburger sidebar with overlay, 44px touch targets, `BookingsTable` card layout below 768px

### What Worked
- **TDD-first for the zone logic fix** — writing the 4-case test matrix (both-in, outside-all, OR-logic, empty-array) before touching production code confirmed the bug and the fix with zero ambiguity
- **FSM as module-level Record constant** — defining the transition map once as `const VALID_TRANSITIONS: Record<string, string[]>` and importing it on both server (PATCH endpoint) and client (dropdown options) gave a single source of truth with no duplication
- **Cancel-before-DB pattern** — issuing the Stripe refund first, updating DB only on success, made the failure mode explicit (orphaned refund logged with ID) and recoverable rather than silent
- **Soft validate + atomic RPC split** — separating the public `GET /api/validate-promo` (UX feedback, no side effects) from the atomic `claim_promo_code` RPC in `create-payment-intent` made both concerns clean; no locking on the client path
- **All 5 phases shipped in one calendar day** — evidence that the research → plan → execute → verify pipeline is now well-oiled for this codebase
- **Visual verification catching the hamburger bug** — the inline `display: flex` vs Tailwind `md:hidden` conflict was a zero-test bug; the preview screenshot step caught it before commit

### What Was Inefficient
- **Partial verification on Phase 20** — no Stripe-paid bookings in dev at verification time; cancel + `charge.refunded` webhook path tested only by unit tests; this is a known gap documented in the SUMMARY but remains unconfirmed end-to-end in prod
- **ROADMAP.md plan checkboxes** — Phase 19, 21, 22 plan checkboxes were still `[ ]` in ROADMAP.md at milestone close (tools archive the live ROADMAP which had stale state); required manual fix in archive

### Patterns Established
- **`isInAnyZone` helper in `lib/zones.ts`** — all zone containment checks import from this single module; prevents duplicated Turf.js logic across routes and tests
- **FSM transition map pattern** — `const VALID_TRANSITIONS: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], ... }` at module level; replicated client-side for dropdown rendering (O(1) lookup)
- **Cancel-before-DB for Stripe refunds** — refund API call first; DB update only on success; log `refund_id` on DB failure for manual recovery; never update DB before confirming Stripe accepted the refund
- **Soft validate + atomic claim split for promo codes** — `GET /api/validate-promo` (public, no side effects, UX-only) + `claim_promo_code` RPC inside `create-payment-intent` (atomic UPDATE with usage limit guard); server ignores client-provided discount amount
- **Promo state not in sessionStorage** — `promoCode`/`promoDiscount` in Zustand store without `partialize`; cleared on page close; prevents stale discount leakage across booking sessions
- **Fixed sidebar requires body offset** — `position: fixed` sidebar requires `md:ml-[280px]` on `<main>`; never use `flex` layout to push content with a fixed element
- **Inline style wins over Tailwind** — when using conditional inline styles alongside Tailwind responsive classes (`md:hidden`), inline style always wins at runtime; use class-only approach or ensure inline style is removed before the responsive breakpoint

### Key Lessons
1. TDD the fix before touching production for any logic bug — 4 test cases written first confirmed the zone OR-logic bug definitively
2. FSM transition tables as a module-level constant eliminate duplication between server validation and client UX (dropdown options); import once, use everywhere
3. Stripe refund sequencing must be "refund first, then DB" — reversing this creates an unrecoverable state where the booking is marked cancelled but the client still paid
4. Atomic DB operations (UPDATE … WHERE current_uses < max_uses RETURNING id) are the correct primitive for race-safe claim patterns; application-level locks are fragile
5. Visual preview steps catch CSS specificity bugs that have zero test coverage — inline styles silently override Tailwind responsive utilities
6. Phase 20 partial verification is a known gap — Stripe-paid cancel and `charge.refunded` webhook need staging/production validation with a real payment before marking fully verified

### Cost Observations
- Model mix: ~100% Sonnet 4.6
- Sessions: ~5 sessions (all on 2026-04-03)
- Notable: 13 plans across 5 phases in one day — fastest milestone yet; pattern is established enough that research sessions are shorter and execution is more direct

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 6 | 25 | First milestone — baseline established |
| v1.1 Go Live | 3 | 7 | Primarily external dashboard config; health endpoint as integration gate |
| v1.2 Operator Dashboard | 8 | 16 | First full-stack admin; Gap closure phase pattern introduced; coordinate-based airport detection |
| v1.3 Pricing & Booking Mgmt | 5 | 13 | All 5 phases in 1 day; TDD-first for bug fix; FSM + atomic RPC patterns established |

### Cumulative Quality

| Milestone | Tests | Notable Additions |
|-----------|-------|-------------------|
| v1.0 | 32 passing | Baseline |
| v1.1 | 32 passing (+6 health tests) | No new packages |
| v1.2 | 25 passing (vitest) | 5 packages: recharts, tanstack-table, terra-draw, vis.gl/react-google-maps, @supabase/ssr |
| v1.3 | 46+ passing (+21 in Phase 22 alone) | No new packages; atomic Supabase RPC pattern |

### Top Lessons (Verified Across Milestones)

1. Webhook-as-source-of-truth eliminates double-save bugs in payment flows
2. Server-side-first for API keys prevents late-stage security refactoring
3. Production domain must be pinned definitively at project start — typos in plans propagate to external service registrations
4. Use `printf` not `echo` when injecting secrets via CLI — trailing newlines cause signature verification failures
5. Never use external IDs (placeIds, object references) for business logic — use stable identifiers like coordinates
6. Never persist computed state in sessionStorage — only user inputs; derived data must always be recomputed fresh
7. TDD the fix before touching production for any logic bug — test matrix written first confirms the bug AND the fix
8. Stripe refund sequencing: refund first, DB update on success — reversing creates unrecoverable state
9. Atomic DB operations (`UPDATE … WHERE guard RETURNING id`) are the correct primitive for race-safe claim patterns
10. Visual preview steps catch CSS specificity bugs with zero test coverage — inline styles silently override Tailwind responsive utilities
