# Phase 52: extended-booking-statuses - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 52-extended-booking-statuses
**Mode:** Retroactive — phase already complete, CONTEXT.md generated from plans/summaries/verification

---

## Note

This discussion log was generated retroactively. Phase 52 was fully executed and verified
(9/9 must-haves, status: passed) before CONTEXT.md was created. All decisions below are
extracted from 52-01-PLAN.md, 52-02-PLAN.md, 52-01-SUMMARY.md, 52-02-SUMMARY.md, and
52-VERIFICATION.md rather than from interactive discussion.

---

## DB Migration Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| DROP+RECREATE | Drop existing CHECK constraint, recreate with 7 values — same as migration 039 | ✓ |
| ALTER CHECK | Direct ALTER to modify constraint | |

**Decision:** DROP+RECREATE (mirrors 039_gnet_bookings.sql pattern exactly)

---

## Status Transition Graph

| Option | Description | Selected |
|--------|-------------|----------|
| Linear with cancel escape | Each new status allows `cancelled` abort path | ✓ |
| Linear strict | No cancellation from in-progress states | |

**Decision:** Linear with cancel — `assigned/en_route/on_location` each allow `cancelled`

---

## Email Notifications for New Statuses

| Option | Description | Selected |
|--------|-------------|----------|
| No emails | flagKey returns undefined, branch short-circuits | ✓ |
| New email templates | Add driver assignment/en-route notification emails | |

**Decision:** No emails — out of scope for this phase

---

## VALID_TRANSITIONS Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Double-gate (server + client) | Both API route and BookingsTable.tsx maintain identical maps | ✓ |
| Server-only | Only API enforces transitions, client shows all options | |

**Decision:** Double-gate — client mirrors server for better UX (no invalid options shown)

---

## Claude's Discretion

- Migration file numbering (040 follows 039 sequence)
- Constraint name verification via pg_constraint query
- Test fixture structure (Wave 0 TDD)

## Deferred Ideas

- Cancel button for assigned/en_route/on_location states in admin UI (WR-02 from code review)
- Test fixture `amount_eur` field fix to eliminate NaN in GNet push tests (WR-03 from code review)
