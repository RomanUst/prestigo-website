# Phase 90: Dispatch Views - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

The operator sees and moves bookings visually in admin: a kanban board by status and a day/week/month calendar in Prague time, both opening the same booking detail panel as the list, and both refreshing on their own so driver steps appear without a reload. Covers DISP-01..DISP-05.

Not in scope: calendar by driver/vehicle (DISP-F1), Supabase Realtime (DISP-F2), any new status, any new money action. Phase 91's extra-charge action will later live in the panel extracted here.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap / prior phases, not re-asked)
- Every move goes through the Phase 87 status service (`advanceBookingStatus`, compare-and-set); only `UI_TRANSITIONS` are offered. A stale move (409) is rejected and the card returns to its column with the conflict message (existing `statusConflict.ts`).
- Money effects reuse the existing Phase 88/89 flows and dialogs: completing captures the hold; cancelling opens `CancelBookingDialog` (who cancelled, policy, fee); `no_show` opens `ConfirmNoShowModal` (contact note required). No new money path. GNet bookings still skip every money path.
- Auto-refresh is polling with `router.refresh()` or refetch; Realtime is DISP-F2, deferred.
- Light Notion-like admin theme and status tokens from Phase 86 (D-05, D-08..D-12, D-17); no new hex literals (D-04 test).
- All date math uses pickup instants in Prague time, DST-safe, tested across 2027-03-28 and 2027-10-31.
- `BookingDetailPanel` is extracted from `components/admin/BookingsTable.tsx` first, behaviour-preserving, so list, board and calendar share one panel.

### Where the views live and the booking panel
- **D-01:** Board and calendar are tabs on `/admin/bookings`: List / Board / Calendar. Shared filters (search, trip type) apply across tabs. No new sidebar entries.
- **D-02:** Clicking a card, a calendar event or a list row opens the booking in a right-hand side panel (Notion-style peek): the view stays visible on the left, Esc or a close button closes it.
- **D-03:** The list also switches to the side panel; the inline expanded row in `BookingsTable` goes away, including on mobile (mobile panel layout is Claude's call). One way to open a booking in all three views. — **Reversibility:** costly — every section of the expanded row (TripEditPanel, PaymentPanel, fee/cash/no-show banners, driver assignment, notes, change history) moves into the panel, and the 2,916-line table loses its expansion logic.
- **D-04:** The bookings page opens on the last view the operator chose, remembered in a cookie (same mechanism as `admin_theme`), and the view is also in the URL (`?view=list|board|calendar`) so a link opens the right tab. The existing `?search=` deep link keeps working.

### Kanban columns and cards
- **D-05:** One column per status, in flow order: unpaid, pending, confirmed, assigned, en_route, on_location, on_board, completed, cancelled, no_show. The terminal columns (completed, cancelled, no_show) are narrow and collapsed with a count and expand on click. Aim: fits a wide screen without horizontal scroll.
- **D-06:** Each card always shows pickup time (Prague), booking reference and route. In addition: assigned driver (or "not assigned") and vehicle class; the payment badge (`PaymentStateBadge`, same as the list); attention flags: no-show requested, fee decision needed (Phase 89 red badge), cash not confirmed, GNet partner; client name and price.
- **D-07:** Default date range is today (Prague), with quick buttons Today / Tomorrow / 7 days and a custom range. Not tied to the list's DispatchDefault horizon.
- **D-08:** Cards inside a column are sorted by pickup time, earliest first. Flags do not change the order.

### Moving cards and money
- **D-09:** Status changes by drag-and-drop and by a "…" menu on each card; the menu covers touch and keyboard. A DnD library may be added (e.g. dnd-kit); Claude picks the library.
- **D-10:** While a card is dragged, only the columns in `UI_TRANSITIONS[status]` are highlighted; the others are greyed out and do not accept a drop. A drop outside an allowed column returns the card.
- **D-11:** Dropping into "assigned" opens the driver picker (the same assignment block as in the panel, `DriverAssignmentSection`); the driver gets the usual offer. Closing the picker without choosing returns the card.
- **D-12:** Moves without a money effect (e.g. en_route → on_location) apply at once with a short toast, no confirmation. Moves with a money effect always confirm and state the effect (complete → capture; cancel → existing cancel dialog; no_show → existing no-show dialog). The card stays in its column until the move is confirmed and the server accepts it.

### Calendar and refresh
- **D-13:** In day and week views a booking is a block starting at the pickup time and lasting the estimated trip duration (route duration estimate; for hourly bookings the booked hours). Overlaps are visible. Month view shows a few bookings per day with "+N". Coloured by status through the Phase 86 status tokens.
- **D-14:** Calendar shows `CALENDAR_ACTIVE_STATUSES` by default (cancelled, unpaid and pending hidden); a "Show all" toggle adds them, faded.
- **D-15:** Default calendar view is the week (Monday first) with today highlighted; the last chosen calendar view is remembered.
- **D-16:** Board and calendar poll every 30 seconds and show "updated N s ago". Polling pauses while a card is being dragged, while a dialog or the side panel has unsaved input, and while the browser tab is hidden; it refreshes at once when the tab becomes visible again.

### Claude's Discretion
- DnD library choice and calendar implementation (own grid vs a library), as long as Prague-time placement is computed from `pickup_utc` and not the browser timezone.
- Where the trip duration estimate comes from (stored route duration if present, otherwise a fallback from distance) and the minimum block height.
- Side panel width, mobile layout of the panel and the board (e.g. one column at a time on mobile), and focus handling.
- Cookie name and attributes for the remembered view; whether polling uses `router.refresh()` or a client refetch.
- Exact card layout and how many attention flags fit before collapsing into an icon row.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 90 — goal, success criteria, planning notes (panel extraction first, UI_TRANSITIONS only, polling)
- `.planning/REQUIREMENTS.md` — DISP-01..DISP-05; DISP-F1 and DISP-F2 are deferred

### Prior phase decisions
- `.planning/phases/86-admin-shell/86-CONTEXT.md` — D-01 cookie pattern, D-04 no hex literals, D-05/D-08..D-12/D-17 light Notion look and status chips
- `.planning/phases/87-status-service-driver-step-flow/87-CONTEXT.md` — D-01 status service and 409 on a lost race, D-08/D-09 status set, D-16 no-show request and operator confirmation
- `.planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-CONTEXT.md` — D-05, D-13..D-15, D-20 (cancel dialog, no-show charge, red decision badge)

No external specs: requirements are captured in the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/admin/BookingsTable.tsx` (2,916 lines) — source of the panel: `TripEditPanel`, `PaymentLinkSection`, `DetailField`, status menu at ~L2012 and ~L2626, conflict state, cancel/no-show dialog wiring
- `components/admin/PaymentPanel.tsx`, `PaymentStateBadge.tsx`, `FeeCaseBadge.tsx`, `FeeDecisionBanner.tsx`, `NoShowBanner.tsx`, `DriverAssignmentSection.tsx`, `BookingChangeHistory.tsx`, `StatusBadge.tsx`
- `components/admin/CancelBookingDialog.tsx`, `ConfirmNoShowModal.tsx`, `Modal.tsx`, `statusConflict.ts`
- `lib/booking-transitions.ts` — `VALID_TRANSITIONS`, `UI_TRANSITIONS`
- `lib/booking-status.ts` — `BOOKING_STATUSES`, `BOOKING_STATUS_LABELS`, `CALENDAR_ACTIVE_STATUSES`, `TERMINAL_BOOKING_STATUSES`
- `lib/booking-status-service.ts` — `advanceBookingStatus`
- `formatPragueFull` (exported from `PaymentPanel.tsx`) for Prague formatting

### Established Patterns
- `/admin/bookings/page.tsx` is a client page that fetches `/api/admin/bookings` with `startDate`/`endDate`; note its `getMonday`/`toISOString` helpers use browser/UTC dates, not Prague — do not copy them for the board or calendar.
- Admin preferences live in cookies read server-side (`admin_theme`, `admin_sidebar`).
- Bookings carry `pickup_utc`; hourly bookings carry `hours`.

### Integration Points
- `app/api/admin/bookings/route.ts` (list + PATCH status) and `app/api/admin/bookings/cancel/route.ts`
- Driver steps write through the same status service, so polling picks them up with no extra wiring.

</code_context>

<specifics>
## Specific Ideas

- Side panel should feel like a Notion page peek on the right (matches the Phase 86 light look).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Already deferred in REQUIREMENTS: DISP-F1 (calendar by driver/vehicle), DISP-F2 (Realtime instead of polling).

</deferred>

---

*Phase: 90-dispatch-views*
*Context gathered: 2026-11-09*
