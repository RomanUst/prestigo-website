# Phase 90: Dispatch Views - Research

**Researched:** 2026-11-09
**Domain:** Next.js 16 / React 19.2 admin UI: kanban board (drag-and-drop), Prague-time calendar, shared booking side panel, 30 s polling
**Confidence:** HIGH on the repo seams and Prague-time math (all read this session); MEDIUM on the DnD library behaviour (npm registry + official docs, not run in this repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (roadmap / prior phases, not re-asked)**
- Every move goes through the Phase 87 status service (`advanceBookingStatus`, compare-and-set); only `UI_TRANSITIONS` are offered. A stale move (409) is rejected and the card returns to its column with the conflict message (existing `statusConflict.ts`).
- Money effects reuse the existing Phase 88/89 flows and dialogs: completing captures the hold; cancelling opens `CancelBookingDialog` (who cancelled, policy, fee); `no_show` opens `ConfirmNoShowModal` (contact note required). No new money path. GNet bookings still skip every money path.
- Auto-refresh is polling with `router.refresh()` or refetch; Realtime is DISP-F2, deferred.
- Light Notion-like admin theme and status tokens from Phase 86 (D-05, D-08..D-12, D-17); no new hex literals (D-04 test).
- All date math uses pickup instants in Prague time, DST-safe, tested across 2027-03-28 and 2027-10-31.
- `BookingDetailPanel` is extracted from `components/admin/BookingsTable.tsx` first, behaviour-preserving, so list, board and calendar share one panel.

**Where the views live and the booking panel**
- **D-01:** Board and calendar are tabs on `/admin/bookings`: List / Board / Calendar. Shared filters (search, trip type) apply across tabs. No new sidebar entries.
- **D-02:** Clicking a card, a calendar event or a list row opens the booking in a right-hand side panel (Notion-style peek): the view stays visible on the left, Esc or a close button closes it.
- **D-03:** The list also switches to the side panel; the inline expanded row in `BookingsTable` goes away, including on mobile (mobile panel layout is Claude's call). One way to open a booking in all three views. — **Reversibility:** costly — every section of the expanded row (TripEditPanel, PaymentPanel, fee/cash/no-show banners, driver assignment, notes, change history) moves into the panel, and the 2,916-line table loses its expansion logic.
- **D-04:** The bookings page opens on the last view the operator chose, remembered in a cookie (same mechanism as `admin_theme`), and the view is also in the URL (`?view=list|board|calendar`) so a link opens the right tab. The existing `?search=` deep link keeps working.

**Kanban columns and cards**
- **D-05:** One column per status, in flow order: unpaid, pending, confirmed, assigned, en_route, on_location, on_board, completed, cancelled, no_show. The terminal columns (completed, cancelled, no_show) are narrow and collapsed with a count and expand on click. Aim: fits a wide screen without horizontal scroll.
- **D-06:** Each card always shows pickup time (Prague), booking reference and route. In addition: assigned driver (or "not assigned") and vehicle class; the payment badge (`PaymentStateBadge`, same as the list); attention flags: no-show requested, fee decision needed (Phase 89 red badge), cash not confirmed, GNet partner; client name and price.
- **D-07:** Default date range is today (Prague), with quick buttons Today / Tomorrow / 7 days and a custom range. Not tied to the list's DispatchDefault horizon.
- **D-08:** Cards inside a column are sorted by pickup time, earliest first. Flags do not change the order.

**Moving cards and money**
- **D-09:** Status changes by drag-and-drop and by a "…" menu on each card; the menu covers touch and keyboard. A DnD library may be added (e.g. dnd-kit); Claude picks the library.
- **D-10:** While a card is dragged, only the columns in `UI_TRANSITIONS[status]` are highlighted; the others are greyed out and do not accept a drop. A drop outside an allowed column returns the card.
- **D-11:** Dropping into "assigned" opens the driver picker (the same assignment block as in the panel, `DriverAssignmentSection`); the driver gets the usual offer. Closing the picker without choosing returns the card.
- **D-12:** Moves without a money effect (e.g. en_route → on_location) apply at once with a short toast, no confirmation. Moves with a money effect always confirm and state the effect (complete → capture; cancel → existing cancel dialog; no_show → existing no-show dialog). The card stays in its column until the move is confirmed and the server accepts it.

**Calendar and refresh**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Already deferred in REQUIREMENTS: DISP-F1 (calendar by driver/vehicle), DISP-F2 (Realtime instead of polling).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISP-01 | Kanban board by status for a chosen date range | New range endpoint over the existing `admin_search_bookings` RPC (filters on the Prague `pickup_date` text); columns from `BOOKING_STATUSES`; client sort by `pickupInstantMs` |
| DISP-02 | Move by drag-and-drop or menu; only allowed transitions; money moves confirm | `@dnd-kit/core` 6.3.1 + "Move to…" menu; one pure `planMove()` decides direct / confirm / cancel dialog / no-show modal / driver picker; all moves reuse PATCH with `expected_status` or the existing dialogs |
| DISP-03 | Calendar day/week/month in Prague time, coloured by status | Own grid (no library) on `Intl` + existing `pickupInstantMs`; DST-week fixtures for 2027-03-28 and 2027-10-31; duration from `estimateDurationMinutes` (moved to a pure module) |
| DISP-04 | Click a booking in board/calendar opens the same panel as the list | Extract `BookingDetailPanel` (two-step: extract in place, then flip list to side panel); one `selectedBooking` at workspace level |
| DISP-05 | Board and calendar refresh on their own | Client refetch every 30 s with pause rules (drag, dialog, dirty panel, hidden tab), visibilitychange refresh; not `router.refresh()` |
</phase_requirements>

## Summary

The phase is mostly a refactor plus two new read-only/interaction views built on data that already exists. Three facts shape the plan. First, `bookings.pickup_utc` is a `GENERATED ALWAYS` column derived from `pickup_date` + `pickup_time` in Prague time, and `admin_search_bookings` already filters on the Prague `pickup_date` text and returns `b.*` (which includes `driver_id`, `payment_*`, `fee_case_status`, `no_show_requested_at`, `distance_km`, `hours`). So the board and calendar need no migration and no new money code; they need one thin range endpoint (the existing GET caps at 100 rows per page and sorts by `created_at`) and a drivers-name map from the existing `/api/admin/drivers`. Second, `lib/prague-date.ts` already contains the DST-safe `pickupInstantMs()` and `getPragueTodayISO()`; calendar math needs only a few `Intl`-based additions, which makes a hand-rolled grid cheaper and safer than a calendar library. Third, the expanded row is duplicated JSX (desktop at about L2499-2823, mobile at about L2011-2350) wrapped around ~15 pieces of per-booking state held in the 2,916-line `BookingsTable`, and 83 tests in `tests/BookingsTable.test.tsx` pin it, so extraction must be two commits: move the code verbatim first (tests stay green), then flip the list to the side panel (tests re-pointed).

Move logic must not be spread over the board UI: one pure `planMove(booking, to)` plus one `useBookingMoves` hook (owning `statusUpdating`, `statusConflict`, `pendingCancel`, `noShowTarget`, the picker and the complete-confirm dialog) is shared by the panel's status control, the board's drag-and-drop and the card menu. There is no confirm dialog for completing today (the list applies it immediately), so exactly one new dialog is needed: complete-confirm stating the capture effect.

**Primary recommendation:** Add `@dnd-kit/core` (+ `@dnd-kit/utilities`) only; build the calendar grid in-house on `lib/prague-date.ts`; extract `BookingDetailPanel` + `useBookingMoves` first behind unchanged tests, then introduce a `BookingsWorkspace` client component (tabs, shared filters, selected booking, side panel) fed by a new `GET /api/admin/bookings/dispatch` range route; poll with a client refetch hook.

## Project Constraints (from CLAUDE.md)

- Type check `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only); lint `npx eslint --quiet <files>` (baseline: `<a>`→`<Link>` in both `not-found.tsx`); tests `npx vitest run [files]` (full ~90 s; `vitest related` crashes, grep `tests/` instead); quality gate = the `verify` skill; never `npm run dev` in Bash (use `preview_start` name `prestigo`). [VERIFIED: CLAUDE.md]
- No hard-coded `€` prices in `app/` or `components/`; amounts come from the row (`amount_czk`, `formatMinor`) — never type a number. Pre-commit enforces it.
- No secrets / `.env*` in commits; never read `.env.local`.
- `middleware.ts` matcher must exclude static extensions — not touched by this phase (no new static assets).
- New EN strings in `messages/en.json` need translations — **does not apply**: the admin is English-only and has no next-intl messages (all existing admin strings are inline literals). [VERIFIED: components/admin/BookingsTable.tsx is inline English]
- Security work (auth, CSRF, validation): run tests, commit with `security:` prefix. The new range route is admin-auth + input validation, so its commit carries the `security:` prefix.
- Admin colours: only `var(--admin-*)` / `var(--status-*)` tokens in `.ts/.tsx` under `components/admin` and `app/(internal)/admin`; `tests/admin-no-hardcoded-colors.test.ts` scans them (hex, `rgb()/hsl()/color-mix()`, bare colour keywords). [VERIFIED: tests/admin-no-hardcoded-colors.test.ts:1-60]
- Golden-HTML snapshot rule (`priceValidUntil`) does not apply (no public pages touched).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Remembered view (cookie + `?view=`) | Frontend Server (page reads `cookies()` + `searchParams`) | Browser (writes cookie, `history.replaceState`) | Same mechanism as `admin_theme`: server reads so the first paint is right; client writes on tab switch |
| Booking range query (board/calendar data) | API / Backend (new range route) | Database (`admin_search_bookings` RPC, existing) | Needs admin auth, date validation, paging over the 100-row RPC cap |
| Prague day/hour placement, overlap layout | Browser / Client (pure helpers) | — | Pure functions of `pickup_utc` + `Intl`; unit-testable in node; no server round trip |
| Status move rules (`UI_TRANSITIONS`) | Browser (offer) | API (`VALID_TRANSITIONS` + CAS enforce) | UI hides disallowed moves; server stays the authority (409 / 422) |
| Money effects of a move | API / Backend (existing PATCH / cancel / no-show routes + `settleBooking`) | Browser (confirm dialogs only) | Phase 88/89 engine is untouched; the UI only states the effect before calling |
| Auto-refresh | Browser (30 s refetch hook) | API (same range route) | Page is a client page fetching an API; `router.refresh()` would not re-run client fetches |
| Booking detail panel | Browser | API (existing per-booking routes) | Pure extraction; every section already fetches its own data |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | 6.3.1 | Drag-and-drop for kanban cards (sensors, `DragOverlay`, disabled droppables) | Stable line (last publish 2024-12-05, ~42M weekly downloads), `peerDependencies: react >=16.8.0` so it installs against React 19.2.3 without overrides [VERIFIED: npm registry `npm view @dnd-kit/core@6.3.1 peerDependencies`] |
| `@dnd-kit/utilities` | 3.2.2 | `CSS.Translate.toString` for the dragged card transform; also a dependency of core | Same maintainer; tiny [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^1.6.0 (installed) | Icons for the "…" menu, chevrons, calendar nav | Already used across admin |
| `@testing-library/react` + `user-event` | installed | Component tests | Existing conventions |

No calendar library, no date library, no state library are added. `zustand` is installed but is not needed: selected booking and view state live in the workspace component.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@dnd-kit/core` 6.3.1 | `@dnd-kit/react` 0.5.3 (new rewrite, published 2026-10-31) | Pre-1.0, ten days old; no reason to take API churn for a 10-column board [VERIFIED: npm registry] |
| `@dnd-kit/core` | `@hello-pangea/dnd` 18.0.1 | Good keyboard story but list-first API; per-drag "only allowed columns accept a drop" is clumsier than `useDroppable({disabled})`; custom overlay and touch tuning are harder |
| `@dnd-kit/core` | `@atlaskit/pragmatic-drag-and-drop` 4.0.0 | Headless, no built-in overlay/a11y; more wiring than the board is worth |
| Own calendar grid | FullCalendar / react-big-calendar | A named time zone needs a luxon/moment plugin in FullCalendar and react-big-calendar works in browser-local `Date`s, both fighting the "never the browser timezone" rule; display-only calendar with no drag needs ~250 lines [ASSUMED] |
| Client refetch | `router.refresh()` | The bookings page and its data are client-side (`fetch('/api/admin/bookings')`); a server refresh does not re-run them |

**Installation:**
```bash
npm install @dnd-kit/core@6.3.1 @dnd-kit/utilities@3.2.2
```
(Per project memory, `npm install` is blocked inside gsd-executor subagents; the orchestrator runs it.)

**Version verification:** `npm view @dnd-kit/core version` → 6.3.1 (modified 2024-12-05); `npm view @dnd-kit/utilities version` → 3.2.2 (2023-11-06); `@dnd-kit/core@6.3.1` dependencies: `tslib ^2.0.0`, `@dnd-kit/accessibility ^3.1.1`, `@dnd-kit/utilities ^3.2.2`. [VERIFIED: npm registry, this session]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@dnd-kit/core` | npm | published 2024-12-05 (project since 2020) | ~42.6M/wk | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/utilities` | npm | 2023-11-06 | ~42.5M/wk | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/accessibility` (transitive of core) | npm | 2024-11-23 | ~42.3M/wk | github.com/clauderic/dnd-kit | OK | Transitive, no action |

Source: `gsd-tools query package-legitimacy check --ecosystem npm ...` returned verdict `OK` for all four candidates checked (also `@dnd-kit/sortable`, `@hello-pangea/dnd`), `postinstall: null`, `deprecated: false`. The package names were first surfaced from training knowledge and then confirmed by the seam against the registry plus the official docs site (dndkit.com), so they carry `OK` from the legitimacy gate.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 operator opens /admin/bookings[?view=board]
        |
        v
 page.tsx (server): cookies() admin_bookings_view / admin_calendar_view + searchParams.view
        |  resolve: ?view (valid) > cookie > 'list'
        v
 BookingsWorkspace (client)
  |- tabs List | Board | Calendar  --(switch)--> write cookie + history.replaceState(?view=)
  |- shared filters: search, tripType
  |- selectedBooking (one) ------------------------------+
  |- useBookingMoves  (owns dialogs: cancel, no-show,     |
  |     complete-confirm, driver picker; status + 409)    |
  |                                                       v
  |  +-----------+  +------------------+  +----------------------+
  |  | List      |  | Board            |  | Calendar day/week/mo |
  |  | (existing |  | dnd-kit columns  |  | own grid, Prague time|
  |  |  paged    |  | card "..." menu  |  | blocks = pickup..    |
  |  |  fetch)   |  +--------+---------+  | +duration, tokens    |
  |  +-----+-----+           |            +----------+-----------+
  |        |   onOpen(booking)   onMove(booking,to)  | onOpen
  |        +---------------+------------------------+
  |                        v
  |           BookingDetailPanel (right sheet; Esc/close)
  |            notes, driver price, status control, DriverAssignment,
  |            PaymentPanel, PaymentLink, TripEdit, ChangeHistory, cancel
  |
  |  Board/Calendar data:
  |   useDispatchBookings(range, filters, paused)
  |      -- every 30 s (visible tab, not paused) + on visibilitychange -->
  |      GET /api/admin/bookings/dispatch?startDate&endDate&search&tripType
  |            auth -> validate -> loop admin_search_bookings (pickup_asc, 100/pg, cap 500)
  |      + GET /api/admin/drivers (once) -> driver_id -> name
  v
 move requested (drop on column | "..." menu | panel status control)
   planMove(booking,to):
     not in UI_TRANSITIONS[status]  -> rejected (never offered)
     to=assigned                    -> driver picker (DriverAssignmentSection) -> POST assign
     to=cancelled                   -> CancelBookingDialog -> POST /bookings/cancel
     to=no_show                     -> ConfirmNoShowModal -> POST /bookings/[id]/no-show
     to=completed & money effect    -> complete-confirm dialog -> PATCH status (+expected_status)
     else                           -> PATCH status (+expected_status) -> toast
   409 status_conflict -> card stays, conflict copy shown, refetch now
```

### Recommended Project Structure
```
components/admin/
├── BookingsWorkspace.tsx      # client: tabs, shared filters, selectedBooking, panel host, KPI + new-booking (moved from page.tsx)
├── BookingsTable.tsx          # list only (slimmer); props: filters, onOpenBooking
├── BookingDetailPanel.tsx     # extracted panel (sections below)
├── bookingTypes.ts            # AdminBooking (the Booking interface, exported) + PatchBody + PatchError + patchBooking()
├── TripEditPanel.tsx          # moved verbatim from BookingsTable
├── PaymentLinkSection.tsx     # moved verbatim
├── DetailField.tsx            # moved verbatim
├── useBookingMoves.ts(x)      # shared status/dialog logic + <MoveDialogs/>
├── bookingMoves.ts            # pure planMove(), completeEffect()
├── CompleteTripDialog.tsx     # the one new dialog (capture effect sentence)
├── dispatch/
│   ├── DispatchBoard.tsx      # DndContext, columns, collapsed terminal columns, range bar
│   ├── BoardCard.tsx          # card + "..." menu (+ draggable)
│   ├── DispatchCalendar.tsx   # day/week/month grid
│   ├── useDispatchBookings.ts # fetch + 30 s poll + pause + updatedAt
│   └── UpdatedAgo.tsx         # isolated 1 s ticker so cards do not re-render
lib/
├── prague-calendar.ts         # pragueDateOf, pragueMinuteOfDay, pragueDayStartMs, mondayOf, monthGrid, layoutDay
├── trip-duration.ts           # estimateDurationMinutes moved here; google-calendar.ts re-exports it
└── admin-shell-prefs.ts       # + bookings-view / calendar-view cookies
app/api/admin/bookings/dispatch/route.ts
app/(internal)/admin/(dashboard)/bookings/page.tsx   # becomes a server component
```

### Pattern 1: Two-step extraction seam (the safest one)
**What:** Step A moves code, not behaviour. Step B changes behaviour.
**Step A (tests untouched, proves parity):** create `bookingTypes.ts` (export `Booking` as `AdminBooking`, `PatchBody`, `PatchError`, a standalone `patchBooking`), move `DetailField`, `TripEditPanel`, `PaymentLinkSection` into their own files, then create `BookingDetailPanel` containing everything inside the expanded row, from `NoShowBanner` through the Cancel Booking button. Mount it in the existing desktop expanded `<td>` and in the mobile expanded block (replacing the duplicated JSX). Status control: keep the desktop `<select>` and the mobile button row where they are today (mobile buttons live on the card, not in the expanded block), but both call `useBookingMoves().requestMove`.
**Per-booking state that must move out of `BookingsTable` into the panel / hook** (today keyed by booking id, once the panel is single-booking they become plain state):
- panel: `localNotes`, `notesSaving`, `notesDebounceRef`, `flushNotes`, `handleNotesChange`, `handleNotesBlur`; `localDriverPrice`, `driverPriceSaving`, `saveDriverPrice`; `paymentRefreshKey` (bumped by `handleTripUpdated`, `bumpPayment`)
- `useBookingMoves`: `statusUpdating`, `statusConflict`, `handleStatusChange`, `requestStatusChange` (the `no_show` / `hasCancelMoney` branches), `noShowTarget`, `pendingCancel`, `handleNoShowConfirmed`, `handleNoShowCleared`, `handleCancelled`, `handleCancelRefundFailed`, `handleCancelledWithoutCase`, and the two dialog mounts (`ConfirmNoShowModal`, `CancelBookingDialog`)
- stays in the table: `bookings`, `total`, `page`, horizon/date range, `loading`, `fetchFailed`, `isMobile`, filter UI, TanStack table. Row mutations come back through an `onPatched(id, patch)` callback (replaces the inline `setBookings(prev => prev.map(...))` calls in `handleTripUpdated`, `handlePaymentState`, `handlePaymentLinkGenerated`, `onAssigned`, and the move outcomes).
**Step B (D-03):** delete `expanded`/`expandedCards`/`getExpandedRowModel`, make a row/card click call `onOpenBooking(booking)`, render the panel from the workspace. Re-point the ~12 tests that expand a row (helper `expandDesktop(ref)` at tests/BookingsTable.test.tsx:1474 is the model) to "click row, query inside the panel (`role="complementary"` or `data-testid="booking-panel"`)".
**Why this order:** the 83 existing tests (all green: 256 passed across the three bookings-related files this session) are the regression net for Step A; Step B is the only step that edits them.

### Pattern 2: One pure move planner
**What:** all callers (board drop, card menu, panel select/buttons) call `requestMove(booking, to)`; the planner decides, the hook executes.
**Example:**
```typescript
// components/admin/bookingMoves.ts  (pure, no React)
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import { isPartnerBooking } from '@/lib/booking-status'

export type MovePlan =
  | { kind: 'rejected' }                         // not in UI_TRANSITIONS[from]
  | { kind: 'direct' }                           // PATCH {status, expected_status}, toast
  | { kind: 'assign_picker' }                    // D-11
  | { kind: 'cancel_dialog' }                    // always the dialog on the board (see Open Question 2)
  | { kind: 'no_show_dialog' }                   // ConfirmNoShowModal; never a bare PATCH (route answers 422 use_no_show_route)
  | { kind: 'confirm_complete'; effect: CompleteEffect }

export function planMove(b: { status: string; booking_source?: string | null; payment_mode?: string | null; payment_state?: string | null }, to: string): MovePlan {
  if (!(UI_TRANSITIONS[b.status] ?? []).includes(to)) return { kind: 'rejected' }
  if (to === 'assigned') return { kind: 'assign_picker' }
  if (to === 'cancelled') return { kind: 'cancel_dialog' }
  if (to === 'no_show') return { kind: 'no_show_dialog' }
  if (to === 'completed') {
    const effect = completeEffect(b)
    return effect ? { kind: 'confirm_complete', effect } : { kind: 'direct' }
  }
  return { kind: 'direct' }
}
```
`completeEffect` returns `null` for GNet (`isPartnerBooking`) and pay-now bookings, `{kind:'capture', ...}` for `payment_mode === 'card_hold'`, `{kind:'cash'}` for `cash_guarantee`.

### Pattern 3: dnd-kit board wiring
**What:** one `DndContext`; each column `useDroppable({ id: status, disabled })`; each card `useDraggable({ id: booking.id })`; a permanently mounted `DragOverlay` renders the dragged card; **no optimistic move** (D-12: the card stays until the server accepts), so there is nothing to roll back on a stale move — the dragged card simply reappears in its column.
**Example:**
```tsx
// Source: https://dndkit.com/api-documentation/draggable/drag-overlay (keep DragOverlay mounted; render children conditionally)
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),   // keeps click-to-open working
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
)
<DndContext sensors={sensors} collisionDetection={pointerWithin}
  onDragStart={e => setDragging(byId[e.active.id as string] ?? null)}   // also pauses polling
  onDragCancel={() => setDragging(null)}
  onDragEnd={e => { const b = dragging; setDragging(null); if (b && e.over) moves.requestMove(b, String(e.over.id)) }}>
  {STATUS_COLUMNS.map(s => <Column key={s} status={s} allowed={!!dragging && (UI_TRANSITIONS[dragging.status] ?? []).includes(s)} dragging={!!dragging} />)}
  <DragOverlay>{dragging ? <CardView booking={dragging} /> : null}</DragOverlay>
</DndContext>
// Column: const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dragging && !allowed })
```
Keyboard and touch-without-long-press are served by the "…" "Move to…" menu (D-09), which lists exactly `UI_TRANSITIONS[status]`. Skip `KeyboardSensor`: its default coordinate getter moves 25 px per arrow press and is not column-aware, so the menu is the accessible path. [CITED: dndkit.com/api-documentation/sensors/keyboard]
Drop on the card's own column = no-op (`planMove` returns `rejected`; do not toast).

### Pattern 4: Prague-time calendar helpers (no browser timezone)
**What:** every date decision goes through `Intl` with `timeZone: 'Europe/Prague'` or the existing `pickupInstantMs`; never `getHours()`, `getDay()`, `new Date(y,m,d)` or `toISOString().split('T')[0]` on a local `Date` (the page's `getMonday`/`getSunday` do exactly that — do not copy).
**Existing building blocks** [VERIFIED: lib/prague-date.ts read this session]:
```
export function getPragueTodayISO(now: Date = new Date()): string {      // L13 — works for any instant: getPragueTodayISO(new Date(ms))
export function shiftIsoDate(iso: string, days: number): string {        // L23 — calendar-date math anchored at UTC midnight
export function pickupInstantMs(row: {                                   // L60 — pickup_utc, else Prague wall clock of pickup_date+pickup_time; null if neither parses
function pragueOffsetMs(utcMs: number): number {                         // L47 — NOT exported
```
`lib/prague-date.ts` is labelled "Server-only" in its header but imports nothing; it is safe in client bundles (it already is used by `lib/no-show.ts`). Update the header comment rather than duplicating the code.
**New helpers (`lib/prague-calendar.ts`):**
```typescript
import { getPragueTodayISO, shiftIsoDate, pickupInstantMs } from '@/lib/prague-date'
const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
export const pragueDateOf = (ms: number) => getPragueTodayISO(new Date(ms))
export function pragueMinuteOfDay(ms: number): number {            // wall-clock minutes since Prague midnight
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return Number(p.hour) * 60 + Number(p.minute)
}
export const pragueDayStartMs = (iso: string) =>                   // Prague midnight instant of a calendar date
  pickupInstantMs({ pickup_utc: null, pickup_date: iso, pickup_time: '00:00' })
export function mondayOf(iso: string): string {                    // ISO calendar-date weekday, no local Date
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay()             // 0=Sun
  return shiftIsoDate(iso, dow === 0 ? -6 : 1 - dow)
}
```
Placement rule: a block's day = `pragueDateOf(startMs)`; its top = `pragueMinuteOfDay(startMs)`; its bottom = `pragueMinuteOfDay(startMs + durMs)` if still the same Prague date, else 1440 (clip, mark "continues"). Axis rows are wall-clock hours 0-23 (the same convention calendar apps use on DST days: the 23 h day has an hour with no bookings; the 25 h day shows two real hours inside the 02:00 row).
**Verified instants** (run in Node 24.14.1 this session, `Intl` with `timeZone: 'Europe/Prague'`):
```
2027-03-27T22:59Z -> 27/03 23:59     2027-03-27T23:00Z -> 28/03 00:00
2027-03-28T00:59Z -> 28/03 01:59     2027-03-28T01:00Z -> 28/03 03:00   (02:00-02:59 does not exist)
2027-10-30T21:59Z -> 30/10 23:59     2027-10-30T22:00Z -> 31/10 00:00
2027-10-31T00:30Z -> 31/10 02:30     2027-10-31T01:30Z -> 31/10 02:30   (02:xx occurs twice)
2027-10-31T22:59Z -> 31/10 23:59     2027-10-31T23:00Z -> 01/11 00:00   (the day is 25 h long)
```
Both DST days (2027-03-28 and 2027-10-31) are Sundays, so each belongs to the Monday-first week 22-28 March / 25-31 October. [VERIFIED: node run this session]

### Pattern 5: Polling hook (client refetch)
**What:** copy the repo's own precedent (`app/embed/chatwoot-dashboard/PanelClient.tsx` ~L249-262 and `TripScreen.tsx` ~L225-240: `setInterval` + `visibilitychange` + AbortController), plus pause rules and a stale-response guard.
```typescript
// dispatch/useDispatchBookings.ts (sketch)
export function useDispatchBookings(q: { startDate: string; endDate: string; search: string; tripType: string }, opts: { enabled: boolean; paused: boolean }) {
  const [rows, setRows] = useState<AdminBooking[]>([]); const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const pausedRef = useRef(opts.paused); pausedRef.current = opts.paused
  const seq = useRef(0)
  const load = useCallback(async () => {
    const mine = ++seq.current; const ac = new AbortController()
    const res = await fetch(`/api/admin/bookings/dispatch?${new URLSearchParams(q)}`, { signal: ac.signal })
    if (!res.ok || mine !== seq.current) return            // a newer request (filter change) wins
    setRows((await res.json()).bookings); setUpdatedAt(Date.now())
  }, [q.startDate, q.endDate, q.search, q.tripType])
  useEffect(() => {
    if (!opts.enabled) return
    void load()                                              // range/filter change => immediate fetch
    const tick = () => { if (document.visibilityState === 'visible' && !pausedRef.current) void load() }
    const timer = setInterval(tick, 30_000)
    const onVis = () => { if (document.visibilityState === 'visible') void load() }   // D-16: refresh at once on return
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [opts.enabled, load])
  return { rows, updatedAt, refresh: load }
}
```
`paused` = `dragging !== null || moves.anyDialogOpen || panelDirty`. `panelDirty` is reported by the panel (`onDirtyChange`): notes textarea text differs from the last saved value, driver price input differs from saved, or `TripEditPanel.editOpen`. A poll must also bump the panel's `paymentRefreshKey` when the selected booking's `status` or `payment_state` changed (PaymentPanel has no polling of its own: "No polling: it refetches on mount, when `refreshKey` changes (a trip edit) and after any action" [VERIFIED: components/admin/PaymentPanel.tsx header comment]).
Render "updated N s ago" in an isolated `<UpdatedAgo at={updatedAt}/>` with its own 1 s interval so the board does not re-render every second. The existing list is not polled (D-16 names board and calendar only).

### Pattern 6: Remembered view (`admin_theme` precedent)
`lib/admin-shell-prefs.ts` already holds the pattern: strict-equality parsers, `Path=/admin; Max-Age=31536000; SameSite=Lax[; Secure]`, client `document.cookie = …` in a try/catch (`AdminShell.writeCookie`). [VERIFIED: lib/admin-shell-prefs.ts, components/admin/AdminShell.tsx]
- Add `ADMIN_BOOKINGS_VIEW_COOKIE = 'admin_bookings_view'` (`list|board|calendar`, default `list`) and `ADMIN_CALENDAR_VIEW_COOKIE = 'admin_calendar_view'` (`day|week|month`, default `week`), parsers by strict equality (mirror T-86-01: no trim/lowercase), and widen `serializePrefCookie`'s `value` type (it is currently `AdminTheme | AdminSidebarState`).
- Resolution order: valid `?view=` > cookie > `list`. A `?search=` deep link with no `?view=` opens the list (the deep link is about finding a row).
- Switching tabs: set state, write cookie, `window.history.replaceState(window.history.state, '', url)` (same call and comment as `clearBookingDeepLink` in BookingsTable.tsx:1197-1204 — keep `history.state`).
- `page.tsx` must become an async server component to read the cookie at first paint, so the current client page body moves to `BookingsWorkspace` (client). `tests/admin-bookings-kpi-decoupling.test.tsx` imports `@/app/(internal)/admin/(dashboard)/bookings/page` and renders `<BookingsPage />` synchronously in 4 places; retarget those imports to `BookingsWorkspace` (its mount-time fetch behaviour must stay byte-identical: the two KPI fetches end in `&limit=1` / `&limit=100`, so the new dispatch route must NOT use those URL shapes).

### Anti-Patterns to Avoid
- **Browser-local date helpers for the board/calendar range** (`getMonday`/`getSunday`/`toISOString` in `bookings/page.tsx`): shifts days around midnight and in DST weeks. Use `getPragueTodayISO` + `shiftIsoDate` + `mondayOf`.
- **Optimistic card moves:** D-12 says the card stays until the server accepts; optimistic reordering would need rollback logic for the 409 case and for dialogs closed without a choice.
- **Re-implementing `UI_TRANSITIONS` or money rules in the board:** use `planMove` + the existing dialogs/routes only.
- **Mounting `CancelBookingDialog` / `ConfirmNoShowModal` once per view:** mount them once in the workspace (via `useBookingMoves`), or a card menu and the panel can open two copies.
- **Calendar positions from `new Date(pickup_utc).getHours()`:** correct only when the browser is in Prague.
- **Cards showing `pickup_time` text while the calendar uses `pickup_utc`:** they agree except for a non-existent spring-forward time (`02:30` on 2027-03-28 is stored as 01:30Z = 03:30 CEST, per D-22 of Phase 88). Derive displayed Prague time from the instant (`pickupInstantMs` → `formatPragueFull`-style `Intl`) in both views so they cannot disagree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag gestures, touch long-press, drag preview, drop highlighting | Pointer-event code | `@dnd-kit/core` sensors + `DragOverlay` + `useDroppable({disabled})` | Edge cases: scroll containers, touch vs scroll, overlay positioning |
| Prague wall clock ↔ instant | UTC offset arithmetic | `pickupInstantMs`, `getPragueTodayISO`, `Intl.DateTimeFormat({timeZone:'Europe/Prague', hourCycle:'h23'})` | DST gaps/overlaps already handled and tested in the repo |
| Money effect of a move | New capture/refund calls | PATCH status (→ `advanceBookingStatus` → `emitBookingCompleted` → `settleBooking`), `CancelBookingDialog` → `/api/admin/bookings/cancel`, `ConfirmNoShowModal` → `/bookings/[id]/no-show` | Phase 88/89 engine; "no new money path" |
| 409 conflict copy | New wording | `statusConflictMessage()` + `STATUS_CONFLICT_STYLE` from `statusConflict.ts` | Locked copy, shared by table and modal |
| Status colours | Per-status colour map | `STATUS_FAMILY[status]` → `var(--status-${family}-fg/bg/border)` | Phase 86 tokens exist in both themes; the colour-literal test forbids new ones |
| Payment/attention badges on cards | New badge variants | `StatusBadge`, `PaymentStateBadge`, `FeeCaseBadge`, `NoShowChip`, `CashChip`, `hasPendingFeeCase`, `hasOpenNoShowRequest` | List parity (D-06) |
| Trip duration | New estimator | `estimateDurationMinutes` (hours → minutes, else distance ≈ 70 km/h + 15 min rounded to 15, min 60) moved to `lib/trip-duration.ts` | Same estimate as the operator's Google Calendar events (blocks match the ops calendar) |
| Driver name on a card | Join in the API | `bookings.driver_id` (already in list rows) + one `/api/admin/drivers` fetch | No migration |
| Modal shell | New overlay | `components/admin/Modal.tsx` (Esc, focus return, `role="dialog" aria-modal`) | Consistency |

**Key insight:** this phase adds views and one coordinating hook; every state change and every cent already has an owner. Anything that talks to Stripe or writes `bookings.status` outside the existing routes is a defect.

## Common Pitfalls

### Pitfall 1: Dropping a card onto a column performs a move the list never allowed
**What goes wrong:** `UI_TRANSITIONS` hides confirmed→completed and assigned→completed on purpose; `VALID_TRANSITIONS` (server) allows them.
**How to avoid:** board and menu read only `UI_TRANSITIONS` [VERIFIED: lib/booking-transitions.ts:31-35, quoted below]. Test: for every status, the set of enabled columns equals `UI_TRANSITIONS[status]`.
```
export const UI_TRANSITIONS: Record<string, string[]> = {
  ...VALID_TRANSITIONS,
  confirmed: ['assigned', 'cancelled'],
  assigned:  ['en_route', 'cancelled'],
}
```

### Pitfall 2: Treating a status PATCH as the move for `cancelled`, `no_show`, `assigned`
**What goes wrong:** `PATCH status:'no_show'` answers 422 `use_no_show_route`; `PATCH status:'cancelled'` on a booking with money answers 422 `use_cancel_route`; moving to `assigned` by PATCH skips the driver row and the offer email (assignment goes through `POST /api/admin/bookings/[id]/assign`, which writes `bookings.driver_id` and calls the status service with `profile: 'assign-route'`). [VERIFIED: app/api/admin/bookings/route.ts:344-369 and assign/route.ts:95-130]
**How to avoid:** `planMove` routes those three targets to their dialogs; only the remaining targets (confirmed, en_route, on_location, on_board, completed) are bare PATCHes. The cancel dialog always opens from the board, which also keeps the existing list behaviour (the "Cancel Booking" button always opens it).

### Pitfall 3: Completing has no confirmation today
**What goes wrong:** the list applies `completed` immediately. Completion triggers `emitBookingCompleted` → `settleBooking` (captures a `card_hold`) and sends the post-trip email, and it is terminal. D-12 requires an effect-stating confirm for money moves.
**How to avoid:** add `CompleteTripDialog` driven by `completeEffect(booking)`. Amount text comes from the row (`payment_amount_minor`, `payment_currency` through `formatMinor` from `@/lib/payments/money`); never type a number or a `€` literal (pre-commit price rule). Sentence by mode: `card_hold` → "Completing captures {amount} from the client's card"; `cash_guarantee` → "No card is charged. The driver collects cash; confirm it in the payment panel"; GNet / pay-now → no dialog. Source of the rule: `settleBooking` only acts on `card_hold` unless `opts.collect`, and `emitBookingCompleted` skips partner bookings [VERIFIED: lib/booking-events.ts header; lib/payments/settle.ts header].

### Pitfall 4: Stale state in the open panel after a poll
**What goes wrong:** `TripEditPanel` seeds `useState` from the booking once; `PaymentPanel` fetches on mount/`refreshKey` only; notes use `localNotes` seeded "for bookings that don't already have a local edit". A poll that replaces the row object will not refresh these children, and a naive replace could clobber typing.
**How to avoid:** merge by id and keep the panel's local state; bump `refreshKey` when the selected booking's `status`/`payment_state` changed between polls; pause polling while `panelDirty` (D-16). Test: change status in the polled data while the panel is open and assert the PaymentPanel refetches.

### Pitfall 5: Esc closes the panel while a dialog is open
**What goes wrong:** `Modal` listens for Escape on `document` (components/admin/Modal.tsx:24-27); the panel's own Esc handler fires too, closing the panel under a confirm dialog.
**How to avoid:** panel's Esc handler ignores the event when `moves.anyDialogOpen` or a `[role="dialog"][aria-modal="true"]` exists; add a test (open cancel dialog, press Esc, panel still open).

### Pitfall 6: `position: fixed` and transforms
**What goes wrong:** `admin-theme.css` forbids `transform`, `filter`, `will-change`, `contain` on the `.admin-shell` wrapper because it would become the containing block for fixed descendants (sidebar, modal overlays). [VERIFIED: app/(internal)/admin/admin-theme.css header]
**How to avoid:** dnd-kit applies transforms only to the dragged item / overlay, which is fine; do not add transforms to the workspace or panel wrapper. The side panel is `position: fixed; right: 0; top: 0; bottom: 0; width: min(560px, 100vw)` with `var(--admin-shadow-sheet)` and `var(--admin-surface)`; on phones it is a full-width sheet (CSS only, no JS width check).

### Pitfall 7: Range query semantics
**What goes wrong:** the RPC filters `b.pickup_date >= p_start_date AND <= p_end_date` on the Prague **text** date, and `p_sort='pickup_asc'` orders by `pickup_date` only, not time [VERIFIED: supabase/migrations/071_admin_search_bookings_email.sql:42-76]. Max 100 rows per call (`p_limit` capped at 100).
**How to avoid:** the date filter is already Prague-correct, so do not convert to UTC bounds. Always sort client-side with `pickupInstantMs` (earliest first, tie-break `booking_reference`). Loop pages in the route until `rows < 100` or the cap (500 rows), return `truncated: true` and show a notice. Month view range = Monday on/before the 1st through Sunday on/after the last day.

### Pitfall 8: Driver declines still show a name
**What goes wrong:** `bookings.driver_id` is written on assign and is not cleared by a decline; accept/decline state lives on `driver_assignments.status`. A card showing `driver_id`'s name for a declined offer would mislead.
**How to avoid:** accept this as the documented limit for the card ("Driver: name") and show the exact state in the panel (`DriverAssignmentSection` already does); if the planner wants accuracy on the card, add `driver_assignments` status to the range route (PostgREST embed or second query) — flagged as Open Question 4.

### Pitfall 9: Selection and view switching
**What goes wrong:** the selected booking object comes from one view's dataset; switching tabs, a poll, or a filter change can leave the panel showing a row that no longer exists in the active view.
**How to avoid:** panel state is `selectedBooking: AdminBooking | null` held by the workspace (a snapshot), refreshed from whichever dataset last returned that id, and kept (not cleared) when it falls out of the current range. Closing happens only by the user (Esc/close).

### Pitfall 10: jsdom cannot drive dnd-kit gestures reliably
**How to avoid:** test the decision logic (`planMove`, allowed-column computation, `onDragEnd` handler as an exported function) and the "…" menu with Testing Library; leave the pointer gesture to browser UAT. Do not build tests on synthetic `pointermove` sequences.

## Code Examples

### Overlap layout (day/week columns)
```typescript
// lib/prague-calendar.ts — greedy cluster packing; inputs already clipped to one Prague day, minutes 0..1440
export interface Placed<T> { item: T; startMin: number; endMin: number; col: number; cols: number }
export function layoutDay<T>(items: { item: T; startMin: number; endMin: number }[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out: Placed<T>[] = []; let cluster: Placed<T>[] = []; let clusterEnd = -1; let colEnds: number[] = []
  const flush = () => { for (const p of cluster) p.cols = colEnds.length; out.push(...cluster); cluster = []; colEnds = []; clusterEnd = -1 }
  for (const it of sorted) {
    if (it.startMin >= clusterEnd && cluster.length) flush()
    let col = colEnds.findIndex(e => e <= it.startMin); if (col === -1) { col = colEnds.length; colEnds.push(0) }
    colEnds[col] = Math.max(it.endMin, it.startMin + MIN_BLOCK_MIN); clusterEnd = Math.max(clusterEnd, colEnds[col])
    cluster.push({ ...it, col, cols: 1 })
  }
  flush(); return out
}
```
Minimum block height: use 30 minutes of vertical space (`MIN_BLOCK_MIN = 30`) so a 60-minute fallback and short trips stay clickable; show reference + time + route in the block.

### Board column model
```typescript
const ACTIVE_COLUMNS = ['unpaid','pending','confirmed','assigned','en_route','on_location','on_board'] as const
const TERMINAL_COLUMNS = ['completed','cancelled','no_show'] as const   // collapsed by default, count + expand (D-05)
// Column order comes from D-05 (flow order), NOT from BOOKING_STATUSES (which lists 'completed','cancelled' before 'assigned').
```
A collapsed terminal column is still a drop target when allowed (a collapsed rail with the count; highlight it during a drag), otherwise `on_board → completed` could not be dropped without expanding first.

### Calendar block colour
```tsx
// STATUS_FAMILY is exported from components/admin/StatusBadge.tsx (L19)
const fam = STATUS_FAMILY[b.status as BookingStatus] ?? 'neutral'
<button style={{ background: `var(--status-${fam}-bg)`, color: `var(--status-${fam}-fg)`, border: `1px solid var(--status-${fam}-border)`, opacity: faded ? 0.55 : 1 }} />
```
The block text states the time and the status label (colour is never the only signal; matches the repo's badge rule).

### DST test shape (node environment, run under three TZs)
```typescript
// @vitest-environment node
describe.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('prague-calendar under TZ=%s', (tz) => {
  beforeAll(() => { process.env.TZ = tz })   // verified in Node 24: assigning process.env.TZ changes Date behaviour at runtime
  it('midnight rows', () => {
    expect(pragueDateOf(Date.parse('2027-10-30T22:00:00Z'))).toBe('2027-10-31')
    expect(pragueDateOf(Date.parse('2027-10-31T23:00:00Z'))).toBe('2027-11-01')
    expect(pragueDateOf(Date.parse('2027-03-27T23:00:00Z'))).toBe('2027-03-28')
  })
  it('spring-forward: 01:00Z is 03:00 Prague', () => expect(pragueMinuteOfDay(Date.parse('2027-03-28T01:00:00Z'))).toBe(180))
  it('fall-back: both 02:30 occurrences land on the same day', () => { /* 00:30Z and 01:30Z => 150 min, date 2027-10-31 */ })
  it('weeks are Monday-first', () => { expect(mondayOf('2027-03-28')).toBe('2027-03-22'); expect(mondayOf('2027-10-31')).toBe('2027-10-25') })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-beautiful-dnd` | `@dnd-kit/core` (or `@hello-pangea/dnd` fork) | rbd archived 2024-2025 | Do not use rbd |
| `@dnd-kit/core` legacy | `@dnd-kit/react` / `@dnd-kit/dom` 0.x rewrite (2026) | pre-1.0, 0.5.3 on 2026-10-31 | Stay on core 6.3.1; revisit when the rewrite is 1.0 |
| `router.refresh()` polling (driver trip screen) | Client refetch for client-fetched pages | n/a | Right tool depends on where the data is fetched |

**Deprecated/outdated:** none relevant; the `admin_search_bookings` signature in migration 054 is superseded by 071 (8 parameters incl. `p_sort`) — the route already calls the 071 shape.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FullCalendar needs a luxon/moment plugin for named time zones and react-big-calendar works in browser-local Dates, so both fight the Prague rule | Standard Stack / Alternatives | Low: the own-grid recommendation also stands on size and token-theming grounds; if a library were chosen it would need its own TZ proof |
| A2 | `@dnd-kit/core` 6.3.1 behaves correctly under React 19.2 / StrictMode in this repo (registry peer range allows it; ecosystem packages pin it alongside React 19; not run here) | Standard Stack | Medium: if a runtime issue appears, fall back to `@hello-pangea/dnd` 18.0.1 (declares React 19 peer). Mitigation: a Wave 0 spike test mounting `DndContext` under React 19 in jsdom |
| A3 | PointerSensor distance 6 / TouchSensor delay 250 + tolerance 8 are good feel values | Pattern 3 | Low: tuning only |
| A4 | `daily` trips have `hours = null` and `distance_km` possibly null, so they fall back to a 60-minute block | Open Question 3 | Low-medium: a multi-day tour will look like a 1 h block |
| A5 | `GET /api/admin/drivers` returns `{ data: [{ id, name, active }] }` for every driver id that can appear in `bookings.driver_id` (inactive drivers included, `active !== false` filtering is applied client-side by DriverAssignmentSection) | Pattern / Pitfall 8 | Low: unknown id renders "Driver" |
| A6 | A 500-row cap per range request is enough for any board/week/month the operator opens | Pitfall 7 | Low: cap is shown via `truncated`; Prestigo volume is small |

## Open Questions

1. **Confirm completion when there is no money effect?**
   - Known: D-12 requires confirmation only for money effects; completing also sends the client a post-trip email and is terminal.
   - Unclear: whether an accidental drag onto Completed for a pay-now/GNet booking is acceptable without a prompt.
   - Recommendation: follow D-12 literally (toast, no prompt) but make the toast carry an explicit "Completed REF" line; if the owner wants a guard, extend `completeEffect` to return `{kind:'none'}` and show the dialog anyway. Cheap to flip.
2. **Cancelling a no-money booking from the board: dialog or direct PATCH?**
   - Known: the list's select cancels no-money bookings by bare PATCH but its "Cancel Booking" button always opens the dialog; D-12 says "cancel → existing cancel dialog".
   - Recommendation: always the dialog from the board and menu (also records who cancelled, handles GNet copy). The panel's select keeps its current branch (`hasCancelMoney`) to preserve existing tests in Step A.
3. **Block length for `daily` (multi-day) trips and long transfers.**
   - Known: `estimateDurationMinutes` uses `hours` or distance; no stored route duration column exists (CONTEXT assumed one might: grep of `supabase/migrations` and `types/booking.ts` shows only `distance_km` and `hours` on bookings). [VERIFIED: lib/google-calendar.ts:116-122]
   - Recommendation: use it as is (parity with the ops Google Calendar); clip to the start day with a "continues" marker; leave multi-day spans as a later refinement.
4. **Driver accept/decline on the card.** `bookings.driver_id` gives the name only. If the operator needs "offered, not yet accepted" on the card, the range route must also read `driver_assignments.status` (one extra select by booking ids). Recommendation: ship name-only, show state in the panel.
5. **Where do shared filters live?** Recommended: `BookingsWorkspace` renders one search box + trip-type chips and passes `search`/`tripType` down; `BookingsTable` keeps horizon, date range and the Unpaid chip. Only 5 tests use the table's search box (`Search client` placeholder); the trip-type chips are untested. The deep-link reader (`readBookingDeepLink`, with its strict reference/email regexes) moves with the search state.
6. **Mobile board.** Recommendation: below 768 px show one column at a time (status select + list of cards) with no DnD (the "…" menu moves cards). Mobile panel gains `DriverAssignmentSection` and driver price, which the current mobile expanded card lacks (only one `<DriverAssignmentSection` mount exists in BookingsTable.tsx, the desktop one) — a behaviour improvement from unifying the panel, to be mentioned in the plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/test | ✓ | v24.14.1 (engines >=24) | — |
| npm registry | installing `@dnd-kit/*` | ✓ | — | — |
| Supabase DB (existing RPC, no migration) | range route | ✓ (prod) | `admin_search_bookings` 071 shape | — |
| Browser admin session for drag UAT | verifying DnD gestures | ✗ on localhost | — | Per project memory the local admin login is blocked by the fail-closed Upstash limiter; do gesture UAT on production/staging with the owner, rely on unit tests + `planMove` tests locally |

**Missing dependencies with no fallback:** none for implementation.
**Missing dependencies with fallback:** localhost admin login (UAT done by the owner or on the deployed site).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + jsdom + @testing-library/react 16 + user-event 14 |
| Config file | `vitest.config.ts` (jsdom default; `// @vitest-environment node` per file for pure/API tests; `tests/setup.ts` mocks `matchMedia`, `scrollIntoView`) |
| Quick run command | `npx vitest run tests/<file>` (the three existing bookings-related files: 256 tests, ~13 s) |
| Full suite command | `npx vitest run` (~90 s) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | Range route: auth 401/403, date validation 400, loops pages, `truncated`, passes `p_query`/`p_trip_type` | unit (node) | `npx vitest run tests/admin-bookings-dispatch.test.ts` | ❌ Wave 0 |
| DISP-01 | Board: one column per status in D-05 order; cards sorted by Prague pickup; terminal columns collapsed with count; card shows driver/payment/flags | component | `npx vitest run tests/dispatch-board.test.tsx` | ❌ Wave 0 |
| DISP-01 | Default range = today in Prague (mock clock around 22:30Z / 23:30Z); Today/Tomorrow/7 days | unit | `npx vitest run tests/dispatch-range.test.ts` | ❌ Wave 0 |
| DISP-02 | `planMove` for every (status, target) pair: enabled set equals `UI_TRANSITIONS`; assigned/cancelled/no_show/completed routing; GNet and pay-now skip money dialog | unit (node) | `npx vitest run tests/booking-moves.test.ts` | ❌ Wave 0 |
| DISP-02 | "…" menu lists only allowed targets; direct move PATCHes `{status, expected_status}`; 409 keeps card + shows `statusConflictMessage` and refetches; dialog closed without choosing leaves the card | component | `npx vitest run tests/dispatch-board.test.tsx` | ❌ Wave 0 |
| DISP-02 | Complete-confirm states capture amount for card_hold; cash copy; none for GNet | component | `npx vitest run tests/complete-trip-dialog.test.tsx` | ❌ Wave 0 |
| DISP-03 | Prague placement under 3 TZs, both DST days, midnight edges, Monday-first week/month grid | unit (node) | `npx vitest run tests/prague-calendar.test.ts` | ❌ Wave 0 |
| DISP-03 | Overlap layout (cluster columns), min block, active-status filter + "Show all" faded | unit/component | `npx vitest run tests/prague-calendar.test.ts tests/dispatch-calendar.test.tsx` | ❌ Wave 0 |
| DISP-03 | Duration estimate parity after move to `lib/trip-duration.ts` | unit | `npx vitest run tests/google-calendar-sync.test.ts` | ✅ (re-export keeps it green) |
| DISP-04 | Row click / card click / event click open the same panel; Esc and close button close it; Esc ignored while a dialog is open | component | `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx` | ❌ Wave 0 / ✅ (rewritten in Step B) |
| DISP-04 | Step A parity: existing 83 table tests unchanged and green after extraction | regression | `npx vitest run tests/BookingsTable.test.tsx` | ✅ |
| DISP-05 | Poll hook: fires every 30 s (fake timers), not while paused (drag/dialog/dirty), not while hidden, immediate on visibility, drops stale responses; "updated N s ago" | unit (hook) | `npx vitest run tests/use-dispatch-bookings.test.tsx` | ❌ Wave 0 |
| D-04 | View cookie parsers (hostile values → defaults), `?view=` precedence, cookie write on tab switch, `?search=` still works, page server component passes `initialView` | unit/component | `npx vitest run tests/admin-shell-prefs.test.ts tests/bookings-workspace.test.tsx` | ✅ (extend) / ❌ Wave 0 |
| ADM-03 | No colour literals in new files | static | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ✅ (auto-scans `components/admin`, `app/(internal)/admin`) |
| KPI | KPI fetch URLs unchanged | regression | `npx vitest run tests/admin-bookings-kpi-decoupling.test.tsx` | ✅ (retarget import to `BookingsWorkspace`) |

### Sampling Rate
- **Per task commit:** the affected test files above (< 30 s) plus `npx tsc --noEmit` and `npx eslint --quiet <changed>` via the `verify` skill.
- **Per wave merge:** `npx vitest run tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/cancel-booking-dialog.test.tsx tests/no-show-banner.test.tsx tests/PaymentPanel.test.tsx tests/DriverAssignmentSection.test.tsx`.
- **Phase gate:** full `npx vitest run` green; browser UAT of drag, calendar in a non-Prague browser timezone, and live driver-step refresh on the deployed admin.

### Wave 0 Gaps
- [ ] `tests/prague-calendar.test.ts` — DISP-03 (TZ matrix, DST fixtures, overlap layout)
- [ ] `tests/booking-moves.test.ts` — DISP-02 (`planMove`, `completeEffect`)
- [ ] `tests/admin-bookings-dispatch.test.ts` — DISP-01 range route (model on `tests/admin-bookings.test.ts` mock style)
- [ ] `tests/use-dispatch-bookings.test.tsx` — DISP-05
- [ ] `tests/dispatch-board.test.tsx`, `tests/dispatch-calendar.test.tsx`, `tests/booking-detail-panel.test.tsx`, `tests/complete-trip-dialog.test.tsx`, `tests/bookings-workspace.test.tsx`
- [ ] Spike: mount `DndContext` + one draggable/droppable under React 19 in jsdom (A2) before building the board
- [ ] Framework install: `npm install @dnd-kit/core@6.3.1 @dnd-kit/utilities@3.2.2` (orchestrator runs it)

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so it applies. The phase adds one admin read route and client UI; it adds no money path.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Admin route starts with `getAdminUser()` → 401 / 403, same order as every admin route (`enforceMaxBody` → `getAdminUser` → parse → logic) |
| V3 Session Management | no change | Supabase session; polling re-uses it; a 401 during a poll must stop the poll and show a sign-in notice rather than loop |
| V4 Access Control | yes | New route admin-only; no client-supplied driver/booking scope; moves reuse existing routes whose server gates (`use_cancel_route`, `use_no_show_route`, CAS `expected_status`) remain authoritative; UI-hidden transitions are not a security boundary |
| V5 Input Validation | yes | `startDate`/`endDate` strict `^\d{4}-\d{2}-\d{2}$` + real-date check + max span (e.g. 62 days) → 400; `tripType` whitelist (`transfer|hourly|daily|round_trip`); `search` through `safeString`/`slice(0,100)` like the existing GET; `view` cookie/param parsed by strict equality to a union |
| V6 Cryptography | no | none |
| V8 Data Protection | yes | Rows contain client PII (name, email, phone): no PII in `console.log`, no PII in URLs beyond the existing `search` param pattern, no caching headers that allow shared caches (`Cache-Control: no-store` on the range route) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated read of the range route | Information Disclosure | `getAdminUser()` first; test 401/403 |
| Oversized range / unbounded loop (DoS on the RPC) | Denial of Service | span cap, page cap (5 × 100), `limit` fixed server-side |
| Stale move overwriting a driver's step | Tampering | `expected_status` on every PATCH (already how the list works); 409 handled |
| Money action reached through a drag (bypassing dialogs) | Tampering / Elevation | `planMove` is the single entry; server gates stay (`use_cancel_route`, `use_no_show_route`); test that `no_show`/`cancelled` never produce a bare PATCH |
| Cookie value injection (`admin_bookings_view`) | Tampering | strict-equality parser, default on anything else (mirror T-86-01) |
| `?search=` deep-link injection | Tampering | keep `readBookingDeepLink` regexes unchanged when moving the search state |
| Double submit from drag + menu | Repudiation / Tampering | per-booking `statusUpdating` guard in `useBookingMoves`; dialogs already guard in-flight |

Commit prefix: the range route and its tests are `security:` per CLAUDE.md.

## Sources

### Primary (HIGH confidence — read in this session)
- Repo files: `components/admin/BookingsTable.tsx` (L1-270, 1160-1760, 1780-2060, 2125-2345, 2440-2916), `app/(internal)/admin/(dashboard)/bookings/page.tsx`, `app/api/admin/bookings/route.ts` (GET L205-307, PATCH L309-387), `app/api/admin/bookings/[id]/assign/route.ts` (L60-175), `[id]/assignment/route.ts`, `lib/booking-transitions.ts`, `lib/booking-status.ts`, `lib/booking-status-service.ts` (L86-326), `lib/booking-events.ts`, `lib/payments/settle.ts` (header), `lib/prague-date.ts`, `lib/google-calendar.ts` (L85-170), `lib/travel-time.ts`, `lib/admin-shell-prefs.ts`, `components/admin/{AdminShell,StatusBadge,PaymentStateBadge,statusConflict,Modal,DriverAssignmentSection,CancelBookingDialog,ConfirmNoShowModal,PaymentPanel}.tsx`, `app/(internal)/admin/{layout.tsx,admin-theme.css}`, `app/(internal)/admin/(dashboard)/layout.tsx`, `supabase/migrations/054`, `071`, `084` (L160-175), `tests/BookingsTable.test.tsx`, `tests/admin-bookings-kpi-decoupling.test.tsx`, `tests/admin-no-hardcoded-colors.test.ts`, `tests/admin-shell-prefs.test.ts`, `tests/setup.ts`, `vitest.config.ts`, `.planning/phases/88-card-on-file-scheduled-holds/88-CONTEXT.md` (D-22: `pickup_utc` is `GENERATED ALWAYS AS prestigo_text_to_utc(pickup_date, pickup_time)`).
- npm registry via `npm view` and `gsd-tools query package-legitimacy check` (versions, peer ranges, publish dates, downloads).
- Node 24.14.1 runs: `Intl` Prague conversions at the DST boundaries; `process.env.TZ` runtime override.
- Test run: `npx vitest run tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/admin-no-hardcoded-colors.test.ts` → 256 passed (baseline green).

### Secondary (MEDIUM confidence — official docs fetched)
- https://dndkit.com/api-documentation/sensors/keyboard — default Space/Enter activation, 25 px steps, legacy `@dnd-kit/core` vs new `@dnd-kit/dom`
- https://dndkit.com/api-documentation/sensors/touch — delay/tolerance constraints are mutually exclusive with distance; `touch-action` recommendation
- https://dndkit.com/api-documentation/draggable/drag-overlay — keep `DragOverlay` mounted, conditional children, recommended for moving between containers

### Tertiary (LOW confidence)
- Web search snippets that downstream packages pin `@dnd-kit/core` 6.3.1 beside React 19 (ecosystem evidence, not a compatibility statement from the maintainer) — see A2.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — versions and peer ranges verified on the registry; runtime behaviour under React 19.2 not exercised here (A2, spike in Wave 0).
- Architecture: HIGH — every seam (panel state, move routes, RPC filter, pickup_utc, cookie pattern, test pins) read in source.
- Pitfalls: HIGH for repo-derived items (1-9); MEDIUM for jsdom/dnd-kit test advice (10).

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 for the repo findings (stable); re-check `@dnd-kit/react` status if the stack decision is reopened.
