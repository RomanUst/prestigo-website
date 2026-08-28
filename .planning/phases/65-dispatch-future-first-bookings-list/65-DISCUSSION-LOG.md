# Phase 65: Dispatch — Future-First Bookings List - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 65-dispatch-future-first-bookings-list
**Areas discussed:** Future cutoff semantics, List sort order, Persistent setting, In-session filter control

---

## Future cutoff semantics (DISP-01)

| Option | Description | Selected |
|--------|-------------|----------|
| By day (today and later) | `pickup_date >= today`; today's trips visible until midnight, incl. in-progress; matches current RPC (pickup_date only) | ✓ |
| By moment (date+time ≥ now) | Already-departed trips drop off default; needs pickup_time in RPC | |

**User's choice:** By day (today and later).
**Notes:** "Today" server-computed in Europe/Prague TZ. Dispatcher keeps an active/just-started trip visible; simpler predicate.

---

## List sort order (DISP-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest at top (adaptive) | Future: pickup ASC; Past/All: pickup DESC. Needs a sort param (RPC is created_at DESC now) | ✓ |
| Always pickup ASC | Nearest date first in all modes; Past shows oldest at top | |
| Keep created_at DESC | Minimal change; "future-first" would be by creation date, not trip date | |

**User's choice:** Nearest at top (adaptive).
**Notes:** RPC change (signature/body) required — flagged as costly/live-migration in CONTEXT.

---

## Persistent default-horizon setting (DISP-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Future only; N editable (default 7) | Ships as Future only; options Future only / Last N days / All, N admin-editable; stored in pricing_globals | ✓ |
| Future only; N fixed = 7 | Simpler UI: Future / Last 7 days / All, no N input | |
| Only Future / All | Drops "Last N days" — but DISP-02 explicitly requires it | |

**User's choice:** Future only; N editable (default 7).
**Notes:** Global storage (single shared admin session). Column-vs-JSONB shape left to planning.

---

## In-session filter control (DISP-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented control, ephemeral state | Future/Past/All at top of list; React state, resets to saved default on reload; never mutates setting | ✓ |
| URL query param | ?horizon=past/all; survives reload, shareable; slightly more code | |

**User's choice:** Segmented control, ephemeral state.
**Notes:** Matches "in-session" lifetime exactly; guaranteed not to touch persisted default.

---

## Claude's Discretion

- Storage mechanism for persisted horizon (new column vs JSONB key in `pricing_globals`).
- RPC parameter names for future-cutoff and sort direction.
- Settings-page UI widget layout and migration number.

## Deferred Ideas

None — discussion stayed within phase scope. Optional extra areas (list empty-state,
horizon × status-chip interaction) were offered but the user chose not to expand scope.
Driver trip portal work remains in Phases 66–67.
