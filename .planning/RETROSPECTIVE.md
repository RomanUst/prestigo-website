# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v2.0 — Blacklane-style Booking + Customer Accounts

**Shipped:** 2026-06-18
**Phases:** 5 (57–61) + Phase 60 as single commit | **Plans:** 22 | **Sessions:** ~8

### What Was Built

- **Customer auth foundation** — Supabase Auth for customers (email magic-link + password, Google/Apple OAuth scaffolded), `customer_profiles` table with RLS, nullable `user_id` FK on bookings, admin session isolation maintained
- **Auth-aware header + account dashboard** — Sign in / account dropdown in Nav, /login + /account pages, "My trips" empty-state shell, full profile editing (contact, corporate fields, saved passengers)
- **Blacklane booking redesign** — Unified EntryBar (5-step from 6), 15-min AM/PM time-slot picker, inline flight number for airport routes, Google Maps JS route visualization with animated copper dot + time labels, VehicleCard with photo + "What's included" list, VehicleSlideshow auto-play (1.5s) with hover-pause
- **Auth-in-checkout + guest path** — user_id linking via Stripe metadata (server-side, never client-trusted), passenger pre-fill from customer_profiles, "Continue as guest" always available, real "My trips" history
- **Analytics preservation + E2E verification** — all GA4 funnel events confirmed, OAuth login GA4 event wired, Meta Pixel/CAPI code-verified; adversarial security review resolved 15+ SEC findings

### What Worked

- **Wave-0 TDD** — writing RED test scaffolds before implementation gave confidence during refactoring and caught integration issues early (e.g., `useBookingStore.getState()` vs stale closure)
- **Phase 59 independent of 57/58** — parallelizability enabled overlapping auth and booking work; no blocking dependency chains
- **Supabase MCP for live DB verification** — querying live schema, checking migration state, and confirming RLS rules eliminated "works on my machine" gaps during Phase 57
- **Security review as a dedicated session** — front-loading a full adversarial review (SEC-01..19) before shipping caught CSRF, IDOR, open-redirect, and webhook idempotency issues cleanly
- **Single-commit Phase 60** — keeping auth-in-checkout as one focused commit (`921a15b`) rather than a full 5-plan phase kept scope tight and avoided over-engineering

### What Was Inefficient

- **ENOSPC on temp filesystem** — `/private/tmp/claude-501/` filled up, blocking sed and other tools; needed workaround with Python file I/O and `CLAUDE_CODE_TMPDIR=/tmp`
- **SessionStorage step-injection for testing** — BookingWizard resets `currentStep` to 1 on mount, making preview testing of Step 3+ require UI click-through chains rather than direct state injection
- **Phase 60 no formal GSD directory** — delivered as a single commit without PLAN/SUMMARY files; required retroactive 60-01-SUMMARY.md creation for milestone close tool
- **Audit timing** — milestone audit ran on 2026-06-16 before Phase 59/60/61 were done, generating 9 open items that were mostly "not yet started" rather than real gaps; running audit after all phases would have been cleaner

### Patterns Established

- **`useBookingStore.getState()` for fresh reads inside `useEffect`** — stale closure issue in Zustand; always use `getState()` for non-reactive reads in effects
- **`vi.hoisted()` for mock hoisting in Vitest** — required for mocking modules that use ESM imports above the test scope
- **`authenticatedUserId` from server session only in payment intent creation** — never trust `userId` from client request body; strip and re-derive server-side
- **`safeReturnTo()` open-redirect guard** — relative-only check, rejects `//` and `http://` prefixes; use in all OAuth and email redirect paths
- **Nav uses `onAuthStateChange` subscription (client-only)** — marketing pages stay static; auth state only visible after hydration

### Key Lessons

1. **Run milestone audit AFTER all phases are done** — auditing mid-milestone creates noise from "not yet started" items vs real gaps
2. **Phase 60 as single commit is a valid pattern** — for small focused features, skip the GSD plan scaffolding and document in a SUMMARY.md only
3. **OAuth "code complete" ≠ "live"** — Google/Apple OAuth requires Supabase Dashboard credential config separate from code; track this explicitly in REQUIREMENTS.md
4. **Analytics blocked by third-party = deferred, not failed** — live OTP/OAuth/payment event verification can't be automated; mark as `blocked_by: third-party` in UAT and close the phase
5. **Guest checkout must be continuously tested** — adding auth in checkout risks accidentally gating guests; the "Continue as guest" button in Step3Auth is the guard

### Cost Observations

- Model mix: primarily Sonnet 4.6 throughout
- Sessions: ~8 development sessions across 8 weeks
- Notable: security review + adversarial audit caught 19 issues that would have shipped without dedicated session

---

## Milestone: v2.1 — Admin Booking Management & Payment Recovery

**Shipped:** 2026-08-26
**Phases:** 3 (62-64) | **Plans:** 13 | **Tasks:** 28

### What Was Built
Abandoned/unpaid checkout capture with a no-duplicate webhook reconcile and an admin revenue-recovery queue (62); full admin booking editing across schedule/vehicle/route/passenger with server-authoritative price recompute, a per-field edit audit log, and optional branded change-notification email (63); admin-originated bookings with an optional Stripe Payment Link + client email that reconciles the same booking row on `checkout.session.completed` incl. round-trip both legs, plus a no-link cash/invoice path (64).

### What Worked
- **One webhook, two reconcile paths** — Phase 64's payment-link reconcile deliberately reused Phase 62's status-gated "update existing row, no duplicate" pattern; the integration checker confirmed both branches coexist cleanly in a single handler.
- **Server-authoritative money** — price and payment-link amounts are always recomputed server-side; the code-review found no client-trust gaps in the core reconcile logic.
- **Tracer-first phase shape** — 64-01 proved the entire create→link→pay→reconcile path end-to-end before expanding to attach-later and round-trip, keeping later plans low-risk.

### What Was Inefficient
- **Payment-link lifecycle blind spots** — the code review surfaced 2 blockers (round-trip sibling double-link; stale link after price edit / manual confirm) that the plans missed; caught and fixed post-hoc rather than designed in.
- **Live-infra gating** — the final phase (64-04) was pure operational work (apply migration, confirm Stripe webhook, live E2E) that stalled twice on a disconnected Supabase connector and a deferred prod test.

### Patterns Established
- Operational "close the live gap" plans (`files_modified: []`) applying migrations via Supabase MCP + information_schema probe, then gating the real payment on a blocking-human checkpoint.
- Code-review `--fix` on money logic run conservatively: prefer application-level guards + loud alerts over speculative external-API calls, defer the deeper fix.

### Key Lessons
- Design the *lifecycle* of a payment artifact (create/edit/cancel/expire), not just its happy-path creation — most blockers lived in the "what happens to the link afterwards" gap.
- A green unit suite (mocks) is not evidence a payment feature works live; the migration + webhook subscription + a real payment are separate, verification-blocking facts.

### Cost Observations
- Model mix: Opus orchestration + Sonnet executors/reviewers/fixers.
- Notable: one code-review pass caught 2 money-logic blockers that unit tests (all green) never would have.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Standout Pattern |
|-----------|--------|-------|-----------------|
| v1.0 SEO Blog | 3 (54-56) | 9 | MDX hybrid model (static JSX + dynamic MDX route) |
| v2.0 Booking + Auth | 5 (57-61) | 22 | Wave-0 TDD + Supabase MCP live verification |
| v2.1 Admin Booking + Payment | 3 (62-64) | 13 | Tracer-first phases + one webhook, two reconcile paths |

### Recurring Issues

- **Live environment testing** — OAuth, OTP, and payment flows always block automated UAT; accept `blocked_by: third-party` pattern and move on
- **Temp filesystem space** — ENOSPC recurred; keep `CLAUDE_CODE_TMPDIR=/tmp` in muscle memory

### Improving Each Milestone

- v1.0 → v2.0: Added Wave-0 TDD, security review gate, Supabase MCP verification
- v2.0 → v2.1: Plan: run milestone audit after all phases, create Phase 60-style single-commit docs for small scoped fixes
