---
phase: 64-admin-created-bookings-with-payment-link
plan: 04
subsystem: ops
tags: [supabase, migration, stripe, webhook, live-verification]

requires:
  - phase: 64-admin-created-bookings-with-payment-link
    provides: "migration 056 file (Plan 01), checkout.session.completed webhook branch (Plan 01/02)"
provides:
  - "Live Supabase: bookings.payment_link_url + bookings.payment_link_id columns (text, nullable) applied via Supabase MCP apply_migration"
  - "Live Stripe: /api/webhooks/stripe endpoint confirmed subscribed to checkout.session.completed"
  - "Live E2E pay-link round-trip confirmed: operator booking -> link -> real payment -> same row unpaid->confirmed, no duplicate, one confirmation email"
affects: []

actuals:
  tokens: 0
  tasks: 2
  commits: 0
  note: "Operational plan — no repo files changed. Task 1 executed by orchestrator via Supabase MCP; Task 2 human-verified on production."

tech-stack:
  added: []
  patterns:
    - "Live migration applied through the Supabase MCP apply_migration tool (project enakcryrtxlnjvjutfpv), matching the 053/054 precedent from Phase 62 — not supabase db push in CI"
    - "Additive/idempotent DDL (ADD COLUMN IF NOT EXISTS) — safe to re-apply"

key-files:
  modified: []

key-decisions:
  - "Task 1 (apply migration 056) was run inline by the orchestrator because the gsd-executor subagent lacks Supabase MCP tools; the migration is a privileged live-infra action requiring the orchestrator-only connector"
  - "Supabase MCP connector token was invalidated at first attempt; user reconnected, after which apply_migration returned {\"success\":true} and a live information_schema probe confirmed both columns (text, nullable)"
  - "Task 2 is a blocking-human checkpoint — the Stripe subscription and live no-duplicate reconciliation cannot be automated (dead .env.local key, RESEARCH Pitfall 4); user confirmed the checkout.session.completed subscription and approved the live E2E round-trip on production"

patterns-established:
  - "Verification-blocking operational plans: apply live migration via Supabase MCP + probe information_schema, then gate the real payment reconciliation behind a human-verify checkpoint before marking the phase verified"

requirements-completed: [ANEW-02, ANEW-04, ANEW-05]
---

## What was built

Closed the two operational gaps that no code change can satisfy, making the Phase 64 payment-link feature actually work against live infrastructure.

### Task 1 — Migration 056 applied to live Supabase (BLOCKING) ✓
- Applied `056_bookings_payment_link` via Supabase MCP `apply_migration` (project `enakcryrtxlnjvjutfpv`) → `{"success":true}`.
- Verified against live `information_schema.columns`:
  | column | data_type | is_nullable |
  |---|---|---|
  | `payment_link_url` | text | YES |
  | `payment_link_id` | text | YES |
- Migration file intact — exactly two `ADD COLUMN IF NOT EXISTS` statements.
- Closes the documented false-positive verification state (build/tsc pass on generated types without the live columns).

### Task 2 — Stripe webhook subscription + live E2E (human-verify, blocking) ✓
- Operator confirmed the live `/api/webhooks/stripe` endpoint subscribes to `checkout.session.completed` (mitigates RESEARCH Pitfall 4 / T-64-10 silent non-reconciliation).
- Live E2E round-trip verified on production: operator created an admin booking with "collect payment" → paid via the generated Payment Link → the same booking flipped `unpaid → confirmed` with no duplicate row and exactly one confirmation email.

## Deployment note
Milestone v2.1 (Phases 62–64) plus the `b912228` Google-Routes-duration fix were merged and pushed to `origin/main` (`d1b18c9 → 748cfb8`, 82 commits) → Vercel production deploy verified live (homepage 200, `/admin` 307 to login) before the E2E test.

## Self-Check: PASSED
- [x] Migration 056 live; both columns present, text, nullable (probed).
- [x] Stripe endpoint forwards `checkout.session.completed` (operator-confirmed).
- [x] Real pay-link payment reconciles in place with no duplicate (operator-confirmed).
- [x] No repo files modified (operational plan).
