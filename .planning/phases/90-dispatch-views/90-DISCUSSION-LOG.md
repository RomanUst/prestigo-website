# Phase 90: Dispatch Views - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 90-dispatch-views
**Areas discussed:** Where views live & panel, Kanban columns & cards, Moving cards & money, Calendar & refresh

Discussion held in Russian; options are translated here.

---

## Where views live & panel

| Question | Options | Selected |
|----------|---------|----------|
| Placement | Tabs on /admin/bookings / Separate pages in sidebar | Tabs |
| How a booking opens from board/calendar | Right side panel / Centered modal / Separate page /admin/bookings/[id] | Right side panel |
| The list's inline expanded row | Also open in the panel / Keep the row | Also open in the panel |
| View on opening Bookings | Last chosen (cookie + ?view=) / Always list / Always board | Last chosen |

## Kanban columns & cards

| Question | Options | Selected |
|----------|---------|----------|
| Columns | One per status, terminal collapsed / Grouped / Active only | One per status, terminal collapsed |
| Extra card content (multi) | Driver and vehicle class / Payment badge / Attention flags / Client name and price | All four |
| Default range | Today + quick buttons / Same as list horizon | Today + quick buttons |
| Order in column | By pickup time / Flagged first | By pickup time |

## Moving cards & money

| Question | Options | Selected |
|----------|---------|----------|
| How status changes | Drag-and-drop + menu / Menu only | Drag-and-drop + menu |
| Disallowed columns while dragging | Greyed out, no drop / All active, error after | Greyed out |
| Drop into "assigned" | Driver picker / Open panel | Driver picker |
| Confirmation for non-money moves | None / Confirm every move | None |

## Calendar & refresh

| Question | Options | Selected |
|----------|---------|----------|
| Event in day/week | Block for trip duration / Marker at pickup | Block for trip duration |
| Statuses shown | Active + "Show all" toggle / All, cancelled faded / Active only | Active + toggle |
| Default view | Week / Day / Month | Week |
| Poll interval | 30 s / 15 s / 60 s | 30 s |

## Claude's Discretion

DnD and calendar implementation, duration estimate source, panel width and mobile layout, cookie details, refresh mechanism, card layout.

## Deferred Ideas

None new.
