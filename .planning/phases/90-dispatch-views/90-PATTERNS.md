# Phase 90: Dispatch Views - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 22 new/modified source files (+ 10 test files)
**Analogs found:** 20 / 22 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `components/admin/BookingDetailPanel.tsx` | component | CRUD | expanded row in `components/admin/BookingsTable.tsx` (desktop ~L2499-2823, mobile ~L2011-2350) | exact (extraction) |
| `components/admin/bookingTypes.ts` | model/utility | request-response | `Booking` interface, `PatchBody`, `PatchError`, `patchBooking` in `BookingsTable.tsx` (L36+) | exact (extraction) |
| `components/admin/TripEditPanel.tsx`, `PaymentLinkSection.tsx`, `DetailField.tsx` | component | CRUD | same names inside `BookingsTable.tsx` | exact (verbatim move) |
| `components/admin/useBookingMoves.ts(x)` | hook | request-response | `handleStatusChange` + `requestStatusChange` + dialog mounts in `BookingsTable.tsx` L1320-1360, L2897-2913 | exact (extraction) |
| `components/admin/bookingMoves.ts` | utility | transform | `requestStatusChange` branches; `UI_TRANSITIONS` in `lib/booking-transitions.ts` | role-match |
| `components/admin/CompleteTripDialog.tsx` | component | request-response | `components/admin/ConfirmNoShowModal.tsx` | exact |
| `components/admin/BookingsWorkspace.tsx` | component | request-response | client body of `app/(internal)/admin/(dashboard)/bookings/page.tsx` | exact (move) |
| `app/(internal)/admin/(dashboard)/bookings/page.tsx` | route (server) | request-response | admin layout cookie read (`app/(internal)/admin/layout.tsx`, reads `admin_theme`) | role-match |
| `components/admin/BookingsTable.tsx` (modify) | component | CRUD | itself (Step A then Step B) | n/a |
| `components/admin/dispatch/DispatchBoard.tsx`, `BoardCard.tsx` | component | event-driven (DnD) | `StatusBadge`/`PaymentStateBadge` + table row badges; no DnD analog | partial |
| `components/admin/dispatch/DispatchCalendar.tsx` | component | transform | no calendar analog | none |
| `components/admin/dispatch/useDispatchBookings.ts` | hook | polling | `app/embed/chatwoot-dashboard/PanelClient.tsx` L244-263 | exact |
| `components/admin/dispatch/UpdatedAgo.tsx` | component | event-driven | none (trivial 1 s ticker) | none |
| `lib/prague-calendar.ts` | utility | transform | `lib/prague-date.ts` | exact |
| `lib/trip-duration.ts` | utility | transform | `estimateDurationMinutes` in `lib/google-calendar.ts` L115-122 | exact (move + re-export) |
| `lib/admin-shell-prefs.ts` (modify) | config | transform | itself | exact |
| `app/api/admin/bookings/dispatch/route.ts` | route | request-response (paged read) | `GET` in `app/api/admin/bookings/route.ts` L205-307 | exact |
| tests: `prague-calendar`, `booking-moves`, `admin-bookings-dispatch`, `use-dispatch-bookings`, `dispatch-board`, `dispatch-calendar`, `booking-detail-panel`, `complete-trip-dialog`, `bookings-workspace` | test | n/a | `tests/admin-bookings.test.ts`, `tests/prague-date.test.ts`, `tests/admin-shell-prefs.test.ts`, `tests/BookingsTable.test.tsx` (`expandDesktop` L1474) | role-match |

## Pattern Assignments

### `app/api/admin/bookings/dispatch/route.ts` (route, paged read)

**Analog:** `app/api/admin/bookings/route.ts`

**Imports and auth guard** (L1-2, L205-208):
```typescript
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**Whitelist + bounded search** (L216-224, L282):
```typescript
const startDate = searchParams.get('startDate')
const tripType = searchParams.get('tripType')
const rawStatusFilter = searchParams.get('status')
const statusFilter = rawStatusFilter && KNOWN_STATUSES.has(rawStatusFilter) ? rawStatusFilter : null
const boundedSearch = search ? search.trim().slice(0, 100) : null
```
For dispatch: add strict `^\d{4}-\d{2}-\d{2}$` + real-date check + max span (62 days) -> 400; tripType whitelist `transfer|hourly|daily|round_trip`.

**Core RPC call (loop pages, 100/pg, cap 5 pages)** (L284-306):
```typescript
const { data, error: dbError } = await supabase.rpc('admin_search_bookings', {
  p_query: boundedSearch, p_start_date: resolvedStartDate, p_end_date: resolvedEndDate,
  p_trip_type: tripType ?? null, p_status: statusFilter, p_sort: sort,
  p_offset: page * limit, p_limit: limit,
})
if (dbError) { console.error('[admin/bookings.GET] RPC failed:', dbError.message)
  return NextResponse.json({ error: 'DB read failed' }, { status: 500 }) }
const row = Array.isArray(data) && data.length > 0 ? data[0] : null
const bookings = row?.rows ?? []
const total = row?.total_count != null ? Number(row.total_count) : 0
```
Use `p_sort: 'pickup_asc'`, return `{ bookings, truncated }` with `Cache-Control: no-store`. Do not log PII. Commit with `security:` prefix. Test model: `tests/admin-bookings.test.ts` L1-40 (`vi.hoisted` supabaseAuthStub / supabaseServiceStub with `rpc: vi.fn()`).

---

### `components/admin/dispatch/useDispatchBookings.ts` (hook, polling)

**Analog:** `app/embed/chatwoot-dashboard/PanelClient.tsx` L244-263
```typescript
useEffect(() => {
  const refreshIfIdle = () => { if (!loadingRef.current) setReloadTick((n) => n + 1) }
  const onVisibility = () => { if (document.visibilityState === 'visible') refreshIfIdle() }
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshIfIdle()
  }, AUTO_REFRESH_MS)
  document.addEventListener('visibilitychange', onVisibility)
  return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
}, [token, conversationId])
```
Add (per RESEARCH Pattern 5): `pausedRef` check in the tick, stale-response `seq` guard, AbortController, stop polling on 401. Interval 30_000.

---

### `lib/prague-calendar.ts` (utility, transform)

**Analog:** `lib/prague-date.ts` (imports nothing; safe for client; update its "Server-only" header comment)

**Reusable exports** (L13-27, plus `pickupInstantMs` L60):
```typescript
export function getPragueTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
```
`pragueParts` Intl formatter is at L35 (`hourCycle: 'h23'`); `pragueOffsetMs` (L47) is NOT exported. Build `pragueDateOf`, `pragueMinuteOfDay`, `pragueDayStartMs`, `mondayOf`, `monthGrid`, `layoutDay` exactly as in RESEARCH Pattern 4 / Code Examples. Never use `getHours()`, `new Date(y,m,d)`, or the page's `getMonday`/`getSunday`. Test model: `tests/prague-date.test.ts` plus `describe.each` over three TZs (RESEARCH DST test shape).

---

### `lib/trip-duration.ts` (utility)

**Analog:** `lib/google-calendar.ts` L115-122 (move verbatim; keep `export { estimateDurationMinutes } from '@/lib/trip-duration'` in google-calendar so `tests/google-calendar-sync.test.ts` stays green):
```typescript
export function estimateDurationMinutes(b: Pick<CalendarBooking, 'hours' | 'distance_km'>): number {
  if (b.hours && b.hours > 0) return b.hours * 60
  if (b.distance_km && b.distance_km > 0) {
    return Math.max(60, Math.round(((b.distance_km / 70) * 60 + 15) / 15) * 15)
  }
  return 60
}
```
Change the param type to a local `{ hours?: number|null; distance_km?: number|null }`.

---

### `lib/admin-shell-prefs.ts` (config, add two cookies)

**Analog:** itself (L12-41). Copy this shape:
```typescript
export const ADMIN_THEME_COOKIE = 'admin_theme'
export function parseAdminTheme(v: string | null | undefined): AdminTheme {
  return v === 'dark' ? 'dark' : 'light'        // strict equality, no trim/lowercase (T-86-01)
}
function serializePrefCookie(name: string, value: AdminTheme | AdminSidebarState, secure: boolean): string {
  return `${name}=${value}; Path=/admin; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`
}
```
Add `ADMIN_BOOKINGS_VIEW_COOKIE='admin_bookings_view'` (list|board|calendar, default list), `ADMIN_CALENDAR_VIEW_COOKIE='admin_calendar_view'` (day|week|month, default week), parsers, and widen the `value` type to `string`. Client write helper to copy: `components/admin/AdminShell.tsx` L38-44 (`try { document.cookie = value } catch {}`) with `serializeXCookie(next, location.protocol === 'https:')` (L64). Test model: `tests/admin-shell-prefs.test.ts` (hostile values -> defaults).

---

### `components/admin/useBookingMoves.ts(x)` + `bookingMoves.ts` (hook + pure planner)

**Analog:** `components/admin/BookingsTable.tsx` L1320-1360 (extract verbatim, make single-booking where possible):
```typescript
const handleStatusChange = useCallback(async (bookingId, newStatus, fromStatus) => {
  setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
  ...
  try {
    await patchBooking({ id: bookingId, status: newStatus, expected_status: fromStatus })
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
  } catch (err) {
    if (err instanceof PatchError && err.status === 409 && err.message === 'status_conflict') {
      setStatusConflict(prev => ({ ...prev, [bookingId]: statusConflictMessage(err.currentStatus) }))
    } else { alert(err instanceof Error ? err.message : 'Status update failed') }
  } finally { setStatusUpdating(prev => ({ ...prev, [bookingId]: false })) }
}, [patchBooking])

const requestStatusChange = useCallback((booking: Booking, newStatus: string) => {
  if (newStatus === 'no_show') { setNoShowTarget({ id: booking.id, reference: booking.booking_reference }); return }
  if (newStatus === 'cancelled' && hasCancelMoney(booking)) { setPendingCancel(booking); return }
  handleStatusChange(booking.id, newStatus, booking.status)
}, [handleStatusChange])
```
The `setBookings` optimistic line becomes an `onPatched(id, patch)` callback; the board must NOT update optimistically before server accept (D-12). Dialog mounts to move into one `<MoveDialogs/>` in the workspace (L2897-2913):
```tsx
<ConfirmNoShowModal isOpen={noShowTarget !== null} bookingId={noShowTarget?.id ?? ''}
  bookingReference={noShowTarget?.reference ?? ''} onClose={() => setNoShowTarget(null)}
  onConfirmed={() => { if (noShowTarget) handleNoShowConfirmed(noShowTarget.id) }} />
<CancelBookingDialog booking={pendingCancel} onClose={() => setPendingCancel(null)}
  onCancelled={handleCancelled} onRefundFailed={handleCancelRefundFailed}
  onCancelledWithoutCase={handleCancelledWithoutCase} />
```
`planMove` gate: `UI_TRANSITIONS[b.status].includes(to)` from `lib/booking-transitions.ts` L31-35 (never `VALID_TRANSITIONS`). Full planner body is in RESEARCH Pattern 2. 409 copy: `components/admin/statusConflict.ts` (`statusConflictMessage`, `STATUS_CONFLICT_STYLE`).

---

### `components/admin/CompleteTripDialog.tsx` (component, request-response)

**Analog:** `components/admin/ConfirmNoShowModal.tsx` (140 lines)

**Shell + in-flight guard** (L1-4, L35-61):
```tsx
'use client'
import { Modal } from './Modal'
import { STATUS_CONFLICT_STYLE, statusConflictMessage } from './statusConflict'
const BUTTON_BASE = { minHeight: '44px', padding: '0 24px', borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-body)', fontWeight: 'var(--admin-fw-strong)' } as const
const inFlight = useRef(false)
useEffect(() => { if (!isOpen) { setPending(false); setError(null); inFlight.current = false } }, [isOpen])
```
Request shape uses `expected_status`. Amount from row via `formatMinor` (`@/lib/payments/money`); never type a number or a euro literal.

---

### `components/admin/dispatch/BoardCard.tsx` / `DispatchCalendar.tsx` (status colour, badges)

**Analog:** `components/admin/StatusBadge.tsx` L19-35 (`STATUS_FAMILY` exported). Colour via tokens only:
```tsx
const fam = STATUS_FAMILY[b.status as BookingStatus] ?? 'neutral'   // note: STATUS_FAMILY has no 'neutral' family; fall back to 'info' or guard
style={{ background: `var(--status-${fam}-bg)`, color: `var(--status-${fam}-fg)`, border: `1px solid var(--status-${fam}-border)` }}
```
Reuse `StatusBadge`, `PaymentStateBadge`, `FeeCaseBadge`, `NoShowChip`, `CashChip`, `hasPendingFeeCase`, `hasOpenNoShowRequest` as the list does (D-06). `tests/admin-no-hardcoded-colors.test.ts` auto-scans `components/admin` and `app/(internal)/admin`. Side panel: `position: fixed`, `var(--admin-shadow-sheet)`, `var(--admin-surface)`; no transforms on wrappers (admin-theme.css rule).

---

### Side panel Esc handling (`BookingDetailPanel.tsx`)

**Analog:** `components/admin/Modal.tsx` L23-30 (Esc on `document`) and L41-44 (`role="dialog" aria-modal="true"`):
```typescript
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
document.addEventListener('keydown', onKey)
```
Panel's own handler must ignore Esc when `moves.anyDialogOpen` or `document.querySelector('[role="dialog"][aria-modal="true"]')` exists.

---

### `app/(internal)/admin/(dashboard)/bookings/page.tsx` + `BookingsWorkspace.tsx`

**Analog:** current page (client, L1-40: KPI fetches, `defaultHorizon` gate, `<BookingsTable>`, `<ManualBookingForm>`). Move body verbatim to `BookingsWorkspace` (client); page becomes an async server component reading `cookies()` + `searchParams.view`, resolving `?view` > cookie > `list`, passing `initialView`. Keep KPI fetch URLs byte-identical (`&limit=1` / `&limit=100`); retarget imports in `tests/admin-bookings-kpi-decoupling.test.tsx`. Do not copy `getMonday`/`getSunday` (L7-23, browser-local dates). URL sync copy `clearBookingDeepLink` in `BookingsTable.tsx` L1197-1204 (`history.replaceState(window.history.state, '', url)`).

## Shared Patterns

### Admin API route order
**Source:** `app/api/admin/bookings/route.ts` L205-208. `getAdminUser()` first, then parse/validate, then service client. Mutating routes add `enforceMaxBody` (L11). Apply to the dispatch route.

### Status/transition truth
**Source:** `lib/booking-transitions.ts` (`UI_TRANSITIONS`, offered) vs `VALID_TRANSITIONS` (server). Board, card menu and panel offer only `UI_TRANSITIONS`. Targets `assigned`, `cancelled`, `no_show` never use a bare PATCH (422 `use_cancel_route` / `use_no_show_route`); assign goes through `POST /api/admin/bookings/[id]/assign`.

### Conflict handling
**Source:** `components/admin/statusConflict.ts` L7-19. Use `statusConflictMessage(err.currentStatus)` and `STATUS_CONFLICT_STYLE` for every 409; the card stays put and the view refetches.

### Prague time
**Source:** `lib/prague-date.ts`. Derive displayed Prague time from `pickupInstantMs(row)` in both board and calendar so they cannot disagree; sort client-side by `pickupInstantMs`, tie-break `booking_reference` (RPC `pickup_asc` sorts by date only).

### Colours
**Source:** `app/(internal)/admin/admin-theme.css` tokens. Only `var(--admin-*)` / `var(--status-*)`; no hex/rgb/hsl/colour keywords (D-04 test). No hard-coded euro prices in `app/` or `components/`.

### i18n
Admin is English-only with inline literals; no `messages/*.json` changes needed.

### Test conventions
- `vi.hoisted` stubs + `// @vitest-environment node` for API/pure tests (`tests/admin-bookings.test.ts`).
- Step A of the panel extraction must leave `tests/BookingsTable.test.tsx` (83 tests) untouched and green; Step B re-points ~12 expand tests (helper `expandDesktop` at L1474 is the model) to "click row, query inside panel (`data-testid="booking-panel"`)".
- Do not drive dnd-kit pointer gestures in jsdom; test `planMove`, allowed-column set, `onDragEnd` handler and the "..." menu.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `components/admin/dispatch/DispatchBoard.tsx` | component | DnD event-driven | No drag-and-drop in repo; use RESEARCH Pattern 3 (`@dnd-kit/core` 6.3.1, `useDroppable({disabled})`, permanent `DragOverlay`, `PointerSensor distance 6`, `TouchSensor delay 250`). Wave 0 spike for React 19 (A2). |
| `components/admin/dispatch/DispatchCalendar.tsx` | component | transform | No calendar exists; own grid on `lib/prague-calendar.ts` (RESEARCH Code Examples: `layoutDay`, `MIN_BLOCK_MIN = 30`). |
| `components/admin/dispatch/UpdatedAgo.tsx` | component | ticker | Trivial isolated 1 s `setInterval` component so cards do not re-render. |

## Metadata

**Analog search scope:** `app/api/admin/bookings`, `components/admin`, `lib/`, `app/embed/chatwoot-dashboard`, `tests/`
**Files scanned:** ~20 read or grepped; all named analogs confirmed via `git ls-files` (BookingsTable.tsx, ConfirmNoShowModal.tsx, CancelBookingDialog.tsx, PanelClient.tsx, AdminShell.tsx confirmed present; line numbers taken from the RESEARCH plus spot reads)
**Pattern extraction date:** 2026-11-09
