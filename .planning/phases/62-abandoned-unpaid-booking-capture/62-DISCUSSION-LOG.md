# Phase 62: Abandoned & Unpaid Booking Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 62-abandoned-unpaid-booking-capture
**Areas discussed:** Status vocabulary, Capture trigger & dedup, Admin queue presentation, Unpaid lifecycle

---

## Status Vocabulary — value

| Option | Description | Selected |
|--------|-------------|----------|
| New status `unpaid` | Dedicated explicit value; DROP+RECREATE CHECK migration (like 040); own badge; new unpaid→confirmed transition | ✓ |
| Reuse `pending` | Already in enum, unused in prod — no migration, less code; but vague name may confuse | |
| Separate `payment_status` column | Keep `status`, add unpaid/paid column; flexible but doubles status dimension, more UI work | |

**User's choice:** New status `unpaid`
**Notes:** Clearer for the operator; worth the migration.

## Status Vocabulary — badge

| Option | Description | Selected |
|--------|-------------|----------|
| "Unpaid", amber/red | Warning color, stands out among confirmed as "needs attention" | ✓ |
| "Unconfirmed", neutral grey | Emphasis on not-confirmed rather than money; less visual noise but weaker follow-up trigger | |
| You decide | Leave exact text/hex to planner/UI-spec | |

**User's choice:** "Unpaid", amber/red

## Status Vocabulary — transitions

| Option | Description | Selected |
|--------|-------------|----------|
| unpaid → confirmed / cancelled | confirmed auto via webhook; cancelled manual (operator marks lost) — lets operator clean the queue | ✓ |
| Only unpaid → confirmed | Simpler; single path (payment). But no manual cleanup — queue accumulates noise | |
| You decide | Leave transition graph to planner | |

**User's choice:** unpaid → confirmed / cancelled

---

## Capture Trigger & Dedup — where

| Option | Description | Selected |
|--------|-------------|----------|
| In create-payment-intent (server) | Insert row where the PI is created — all data, server user_id, computed amount already there; same payment_intent_id for reconciliation | ✓ |
| Separate endpoint | New /api/capture-booking called on payment-step mount; more decoupled but duplicates validation/pricing and complicates reconciliation | |
| You decide | Leave capture point to planner | |

**User's choice:** In create-payment-intent (server)

## Capture Trigger & Dedup — dedup strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One row per attempt | Stable attempt_id (booking store/sessionStorage) passed to route; on retry/currency change UPDATE the same unpaid row (and its payment_intent_id) instead of inserting; clean queue | ✓ |
| One row per PaymentIntent | Simplest; each PI = own row; currency toggle/retry → several unpaid rows per person; operator cleans manually | |
| You decide | Leave dedup strategy to planner | |

**User's choice:** One row per attempt

---

## Admin Queue Presentation — filter

| Option | Description | Selected |
|--------|-------------|----------|
| Chip "Unpaid" next to type chips | Add to filterChips (All/Transfer/Hourly/Daily); familiar, one click; needs RPC (p_status); mixes type vs status dimension | ✓ |
| Separate status filter | Dedicated status control apart from trip type; cleaner semantics, scales to other statuses; more UI | |
| Separate tab | Dedicated "Unpaid" section; most expressive queue but more work, splits from main list | |

**User's choice:** Chip "Unpaid" next to type chips

## Admin Queue Presentation — default visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with distinction | In "All", unpaid shown with confirmed, distinguished (amber badge + light row tint); operator won't miss them | ✓ |
| No, only via chip | "All" = confirmed/working only; unpaid visible only on Unpaid chip; cleaner main list but easy to forget | |
| You decide | Leave to UI-spec/planner | |

**User's choice:** Yes, with distinction

---

## Unpaid Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Manual only | Lives in queue until paid (→confirmed) or operator marks cancelled; no automation | ✓ |
| Auto-expire after N hours | Cron flips/hides stale unpaid rows; close to deferred FOLLOW-01 — scope creep risk | |
| You decide | Leave to planner | |

**User's choice:** Manual only

---

## Claude's Discretion

- Exact `unpaid` badge hex + micro-copy (as long as it reads "not paid" and differs from the 7 existing variants).
- `attempt_id` generation/storage mechanics and the keying column/index for update-in-place dedup.
- Row-tint styling for the "All" view distinction.
- Whether capture reuses `buildBookingRow` (status arg) or a dedicated builder.

## Deferred Ideas

- Automatic reminder email to unpaid clients after N hours — FOLLOW-01, deferred to v2. Auto-expire/cron cleanup of stale unpaid rows is in the same bucket.
- Audit log of admin edits per booking — FOLLOW-02, deferred to v2.
