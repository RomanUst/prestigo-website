---
phase: 62-abandoned-unpaid-booking-capture
plan: 01
subsystem: payments
tags: [stripe, supabase, postgres, webhooks, migration, unpaid-capture]

requires:
  - phase: 52-extended-booking-statuses
    provides: bookings_status_check DROP+RECREATE migration pattern (040), extended status enum
provides:
  - Migration 053 file — 'unpaid' status value + attempt_id column + partial unique index (attempt_id, leg) WHERE status='unpaid'
  - buildBookingRow('unpaid') branch and one-way reconcileBookingToConfirmed helper in lib/supabase.ts
  - create-payment-intent captures a best-effort unpaid bookings row at PaymentIntent creation (one-way path)
  - webhook one-way path reconciles unpaid→confirmed (status-gated UPDATE) instead of blind re-insert
affects: [62-02, 62-03, 62-04]

actuals:
  tokens: 41000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pre-payment capture: write an 'unpaid' row at PaymentIntent creation; webhook reconciles to 'confirmed'"
    - "Status-gated one-way UPDATE (reconcileBookingToConfirmed) as the webhook side-effect gate"

key-files:
  created:
    - supabase/migrations/053_unpaid_booking_status.sql
  modified:
    - lib/supabase.ts
    - app/api/create-payment-intent/route.ts
    - app/api/webhooks/stripe/route.ts
    - tests/create-payment-intent.test.ts
    - tests/webhooks-stripe.test.ts

key-decisions:
  - "Checkpoint (Task 1, blocking-human decision) resolved by operator: APPROVE migration 053 as specified (D-01/D-02/D-06)"
  - "Capture is best-effort (try/catch) so a DB stall never blocks the payment path; webhook defensive fallback covers a lost capture"
  - "Modernized 5 pre-existing promo tests to the current SEC-01 read-based validation contract (was rpc-based + date-rotted); test-only, no production behavior change"

patterns-established:
  - "buildBookingRow(meta, pi.id, 'unpaid') for the capture row; single shared meta map feeds both Stripe metadata and the capture row so they cannot drift"
  - "Webhook one-way gate: reconciled.length>0 || inserted.length>0 drives the four side-effects"

requirements-completed: [ABND-01, ABND-02, ABND-05, ABND-06]

coverage:
  - id: D1
    description: "Migration 053 adds 'unpaid' to bookings_status_check + attempt_id column + partial unique index (file on disk only)"
    requirement: "ABND-06"
    verification:
      - kind: manual_procedural
        ref: "supabase/migrations/053_unpaid_booking_status.sql — live apply verified in plan 62-04"
        status: unknown
    human_judgment: true
    rationale: "Live schema application is the blocking-human step in 62-04; file correctness is confirmed but production apply is deferred."
  - id: D2
    description: "create-payment-intent captures exactly one unpaid row (one-way) keyed to the PaymentIntent, with client name/email/phone and server-authoritative amounts"
    requirement: "ABND-01"
    verification:
      - kind: unit
        ref: "tests/create-payment-intent.test.ts — ABND-01/02/05 Phase 62 unpaid capture (one-way tracer)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Webhook one-way path reconciles unpaid→confirmed and fires the four side-effects exactly once; Stripe retries produce no duplicate side-effects"
    requirement: "ABND-02"
    verification:
      - kind: unit
        ref: "tests/webhooks-stripe.test.ts"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-20
status: complete
---

# Phase 62 · Plan 01: Unpaid Capture Tracer Summary

**Proved the whole Phase-62 architecture end-to-end on the thinnest path: a booking row is now written as `unpaid` at PaymentIntent creation and reconciled to `confirmed` by the Stripe webhook (one-way path).**

## Performance

- **Duration:** ~20 min (executor cut off by session limit; closed out by orchestrator recovery)
- **Completed:** 2026-08-20
- **Tasks:** 3 (Task 1 checkpoint = approve; Tasks 2–3 implementation)
- **Files modified:** 6 (1 created, 5 modified)
- **Commits:** 2 (`069ccf4`, `602333f`)

## Accomplishments
- Migration `053_unpaid_booking_status.sql` written (DROP+RECREATE `bookings_status_check` with the full 8-value enum incl. `unpaid`; `attempt_id uuid` column; partial unique index `(attempt_id, leg) WHERE status='unpaid'`). File only — live apply is the blocking step in 62-04.
- `lib/supabase.ts`: `buildBookingRow` union widened to `'unpaid'`; new one-way `reconcileBookingToConfirmed` helper (status-gated UPDATE).
- `create-payment-intent`: writes one best-effort `unpaid` row at PaymentIntent creation on the one-way path (try/catch — capture failure never blocks payment). A single shared `meta` map feeds both Stripe metadata and the capture row.
- `webhooks/stripe` one-way path: reconciles `unpaid→confirmed` first, then fires the four side-effects off the combined gate `reconciled.length>0 || inserted.length>0`; empty reconcile falls back to the existing defensive insert. SEC-10 processed-events ordering and emergency-alert-on-save-failure preserved. Round-trip path untouched (62-02).

## Deviations
- **Rule 3 (blocking-issue auto-fix), test-only.** The `create-payment-intent` test file had **pre-existing** failures on `main` (unrelated to Phase 62): every happy-path test used a hardcoded past `pickupDate: '2026-06-01'` → 422 (date-rot), and the 5 promo tests asserted `rpc('claim_promo_code')` behavior that the SEC-01 refactor had already moved to the webhook. Added a `futureDate()` helper and modernized the 5 promo tests to the current read-based (`from('promo_codes')…maybeSingle()`) validation contract. No production code changed for this.

## Verification
- `tests/create-payment-intent.test.ts` — 23 pass / 5 todo.
- `tests/webhooks-stripe.test.ts` — pass.
- `tsc --noEmit` clean for all 62-01 files (remaining tsc errors are pre-existing debt in unrelated test files: account-trips, gnet-farmin, nav-auth, passenger-actions).

## Recovery note
The Wave 1 executor completed the code in the working tree but was terminated by a session usage limit before committing. The orchestrator closed the plan out: removed an unrelated stale orphan worktree (`.claude/worktrees/sharp-ishizaka-4a6e0a`, Aug 2, already merged) that was polluting the vitest glob, finished the promo-test modernization, verified green, and committed the two atomic task commits above.

## Notes for downstream plans
- **62-02** wires `attempt_id` (client-generated, sessionStorage) through `create-payment-intent` for per-attempt dedup (UPDATE in place, incl. `payment_intent_id`) and adds round-trip capture (2 rows/leg) + round-trip webhook reconcile.
- **62-04** applies migrations 053 + 054 to the live DB (blocking-human) — until then the `unpaid` status and `attempt_id` column do not exist in production, so runtime capture writes would fail against the live schema.
