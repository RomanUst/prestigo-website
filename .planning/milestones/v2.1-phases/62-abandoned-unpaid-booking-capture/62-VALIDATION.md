---
phase: 62
slug: abandoned-unpaid-booking-capture
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-19
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 62-RESEARCH.md §Validation Architecture. Refine during planning / validate-phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 (jsdom, `tests/setup.ts`, `@`→repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/<file>.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~depends; full suite |

> NOTE: `package.json` has **no** `"test"` script — invoke `npx vitest run` directly, never `npm test`.
> Mock pattern for `@/lib/supabase`, `@/lib/email`, `@/lib/qstash` is `vi.hoisted` (see `tests/webhooks-stripe.test.ts:1-33`).

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/<changed-file>.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds (single test file)

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| ABND-01 | Unpaid row inserted on first `create-payment-intent` POST (one-way) | integration | `npx vitest run tests/create-payment-intent.test.ts` | ✅ extend | ⬜ pending |
| ABND-01 | Two unpaid rows inserted for a round-trip attempt (per leg) | integration | `npx vitest run tests/create-payment-intent.test.ts` | ✅ extend | ⬜ pending |
| ABND-02 | DB CHECK accepts `status='unpaid'`; migration applied | migration | Supabase MCP `execute_sql` post-migration (manual) | ❌ W0 | ⬜ pending |
| ABND-05 | Passenger step (Step5) blocks progress without valid name/email/phone → contact present at payment | unit | `npx vitest run tests/` (Step5Passenger — confirm existing) | ➖ pre-existing (v2.0 Phase 59/60 Step5Passenger Zod) | ➖ out-of-scope |
| ABND-06 dedup | Retry / currency toggle with same `attempt_id` UPDATEs the same row in place (no 2nd row); overwrites full mutable field set incl. new `payment_intent_id` + `booking_reference` | unit | `npx vitest run tests/create-payment-intent.test.ts` | ✅ extend | ⬜ pending |
| ABND-06 reconcile | `payment_intent.succeeded` on an `unpaid` row flips it to `confirmed` AND fires exactly the 4 side-effects once (client email, manager alert, GA4 purchase, QStash reminder) | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ extend | ⬜ pending |
| ABND-06 idempotency | Duplicate Stripe delivery for an already-`confirmed` row fires zero side-effects | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ extend | ⬜ pending |
| ABND-06 round-trip | Both legs reconcile; side-effects fire once for the pair | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ extend | ⬜ pending |
| ABND-03 | `StatusBadge` renders `unpaid` variant with distinct amber/red styling | unit | `npx vitest run tests/` (StatusBadge/BookingsTable) | ❓ locate | ⬜ pending |
| ABND-04 | GET `/api/admin/bookings?status=unpaid` threads `p_status` to the RPC | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |
| ABND-04 | Admin PATCH accepts `unpaid→confirmed` / `unpaid→cancelled`, rejects others | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Locate or create a `StatusBadge` / `BookingsTable` test covering the `unpaid` variant rendering (ABND-03).
- [x] Step5Passenger name/email/phone validation (ABND-05 upstream guarantee) is PRE-EXISTING from v2.0 (Phase 59/60 passenger step Zod). Out of scope for Phase 62 — Phase 62 only asserts the captured row STORES those fields (covered by 62-01's create-payment-intent.test.ts). Executor may confirm the existing Step5 test but need not add one.
- [ ] New `vi.hoisted` mocks for whatever reconciliation helper replaces the `saveBooking`-based path (webhook UPDATE-to-confirmed), following `tests/webhooks-stripe.test.ts` pattern.
- [ ] `create-payment-intent.test.ts` + `webhooks-stripe.test.ts` + `admin-bookings.test.ts` already exist — extend, do not recreate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applied: CHECK accepts `unpaid`, `attempt_id` column + index present | ABND-02 | No live-DB migration harness in repo; live `admin_search_bookings` body only in DB | Via Supabase MCP: `SELECT pg_get_functiondef('admin_search_bookings'::regproc)` before editing; after migration `execute_sql` to insert an `unpaid` row and assert CHECK passes |
| End-to-end unpaid→paid reconciliation on live Stripe test flow | ABND-06 | `.env.local` Stripe key is a dead placeholder (project memory); live keys run via user-run scripts | Operator runs a real checkout to payment step, confirms unpaid row, completes payment, confirms single confirmed row + confirmation email |
| Admin follow-up queue visual (badge + row tint + Unpaid chip) | ABND-03/04 | Visual; admin auth | Log into admin, verify chip filter + distinguished rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
