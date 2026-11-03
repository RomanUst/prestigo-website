# Phase 87: Status Service & Driver Step Flow - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 24 (new/modified)
**Analogs found:** 22 / 24
All analog paths verified tracked (`git ls-files` for lib files; app/tests/migrations are normal tracked source).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/084_booking_statuses_status_log.sql` | migration | CRUD/DDL | `053_unpaid_booking_status.sql` + `055_booking_edit_audit_log.sql` + `080_panel_bookings.sql` (REVOKE/GRANT) | exact |
| `lib/booking-status.ts` (vocab, nextStepFor, isPartnerBooking) | utility | transform | `lib/booking-transitions.ts`, `lib/trip-token.ts` | role |
| `lib/booking-transitions.ts` (MOD) | utility | transform | itself | exact |
| `lib/trip-token.ts` (MOD, TERMINAL += no_show) | utility | transform | itself | exact |
| `lib/booking-status-service.ts` | service | request-response + event | `app/api/admin/bookings/route.ts:342-517` (verbatim extraction source) | exact |
| `lib/gnet-push.ts` | service | event-driven (after()) | PATCH:454-514 and `[id]/assign/route.ts:~120-150` | exact |
| `lib/booking-events.ts` (emitBookingCompleted) | service | event | `lib/outbox.ts` (`.rpc` use) | partial |
| `lib/driver-trip-step.ts`, `lib/start-gate.ts` | service/utility | request-response | `app/api/driver/trip/[token]/progress/route.ts` lookup+validity; `lib/panel-bookings.ts` `pickupInstantMs`, `lib/geo-distance.ts` | role |
| `app/api/driver/trip/[token]/progress/route.ts` (REWRITE) | route | request-response | itself (keep guards, swap write for service call) | exact |
| `app/api/admin/bookings/route.ts` (MOD, PATCH -> service, KNOWN_STATUSES) | route | request-response | itself | exact |
| `app/api/admin/bookings/cancel/route.ts`, `[id]/assign/route.ts` (MOD) | route | request-response | itself | exact |
| `app/api/admin/bookings/[id]/no-show/route.ts` | route | request-response | `[id]/assignment/route.ts` / PATCH guard order | role |
| `app/(internal)/driver/trip/[token]/{page,TripScreen,SlideToAdvance,ConfirmStepDialog,TripCompleted}.tsx` | page/components | request-response | existing `page.tsx` + `TripProgressClient.tsx`; `components/booking/RouteMap.tsx` | role |
| `lib/lead-mapping.ts`, `lib/customer-mapping.ts`, `lib/chatwoot-mapping.ts`, `infra/espocrm/lib/booking-map.mjs`, `infra/espocrm/fields.json` (MOD) | utility | transform | themselves (grep `'on_location'`) | exact |
| `components/admin/StatusBadge.tsx`, `BookingsTable.tsx`, `app/embed/chatwoot-dashboard/BookingCard.tsx`, `lib/google-calendar.ts`, `lib/panel-bookings.ts`, `lib/admin-stats.ts` (MOD) | component/util | transform | themselves | exact |
| Tests: `tests/booking-status-service.test.ts`, `booking-status-parity.test.ts`, `booking-status-log-migration.test.ts`, `driver-trip-step.test.ts`; rewrite `driver-trip-progress.test.ts`, `driver-trip.test.ts` gates; update `espocrm-booking-map.test.ts:331`, `customer-mapping-parity.test.ts:79` | test | - | `panel-bookings-migration.test.ts`, `customer-mapping-parity.test.ts`, `driver-trip-progress.test.ts`, `gnet-status-push.test.ts` | exact |

## Pattern Assignments

### Migration 084 (migration, DDL)
**Analog 1:** `supabase/migrations/053_unpaid_booking_status.sql:14-37` (CHECK DROP+RECREATE, whole list must be restated):
```sql
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('unpaid','pending','confirmed','completed','cancelled','assigned','en_route','on_location'));  -- 084 adds 'on_board','no_show'
```
**Analog 2:** `055_booking_edit_audit_log.sql:23-37` (log table shape; `booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE`, `CREATE INDEX IF NOT EXISTS ... (booking_id, changed_at DESC)`). Header-comment style: "Schema FILE only — live application is orchestrator step" (executors have no Supabase MCP).
**Analog 3 (SECURITY DEFINER + grants):** `080_panel_bookings.sql:36-48, 246-247`:
```sql
CREATE OR REPLACE FUNCTION public.panel_bookings(...) ... SECURITY DEFINER SET search_path = ''
...
REVOKE EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) TO service_role;
```
Apply the same to `advance_booking_status(...)` (RESEARCH Pattern 1 skeleton) and to EVERY function 084 redefines (`booking_lead_status()` per D-10; stats RPCs 081-083 if no_show handling changes: copy their latest definitions, then re-REVOKE/GRANT). RLS enable + `REVOKE ALL ... FROM anon, authenticated` on `booking_status_log`. Trigger `AFTER UPDATE OF status` + partial unique index for one `completed` event per RESEARCH Pattern 2. Next migration number: 084 (latest on disk is 083).

### `lib/booking-status-service.ts` (service)
**Analog:** `app/api/admin/bookings/route.ts:342-517` — move verbatim in Plan A. Key excerpts to preserve (same call order and strings):
- Read: `.from('bookings').select('*').eq('id', ...).single()` -> 404 `'Booking not found'` (L347-356)
- Validation: `VALID_TRANSITIONS[previousStatus] ?? []`, 422 `Cannot transition from '${previousStatus}' to '${status}'` (L358-365)
- Stale-link CR-02 (L367-396): clear `payment_link_url/id` on confirmed/cancelled, `after(() => deactivateBookingPaymentLink(id).catch(...))`
- DB error -> 500 `'DB update failed'`
- Email gate (L399-446): `pricing_globals.notification_flags` (null = all enabled), `statusToFlagKey`, `logEmail` BEFORE send, sends inside `after()`
- QStash on confirmed (L449-453): `after(() => scheduleQStashReminder(current.id, new Date(current.pickup_utc).getTime()))`
- GNet push (L455-514) -> lift into `lib/gnet-push.ts`, keep `console.error('[gnet-status-push] ...')` tags, `last_push_status/last_push_error/last_pushed_at` audit update on success AND failure (existing test STATUS-03 asserts that). New: add idempotency guard `last_push_status = X AND last_push_error IS NULL`; skip push for statuses where `prestigoToGnetStatus` is null (`on_board`, `no_show`); do not echo GNet-originated cancel.
- Plan B swaps `.update().eq('id')` for the RPC CAS: `.rpc('advance_booking_status', {...})` (pattern `lib/outbox.ts:206`); `applied=false` -> 409 with `current_status`.
Cancel route (`cancel/route.ts:~104-116`) and assign route (`assign/route.ts:~82-100`, `update({driver_id, status:'assigned'})`, reassign branch driver_id only) route their status writes through the service; keep the reassign (no status change) path as plain driver_id update.

### `app/api/admin/bookings/[id]/no-show/route.ts` and admin route guard order
**Analog:** PATCH `app/api/admin/bookings/route.ts:319-337` (guard order):
```typescript
const tooBig = enforceMaxBody(request, 5_000)
if (tooBig) return tooBig
const { user, error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const body = await request.json()   // NOTE: unguarded; new route should wrap in try/catch -> 400 'Invalid JSON'
const parsed = schema.safeParse(body)  // 400 'Invalid payload'; 422 only for semantic errors (state-based)
```
Imports (L1-18): `getAdminUser` from `@/lib/supabase/server`, `createSupabaseServiceClient` from `@/lib/supabase`, `NextResponse, after` from `next/server`, `enforceMaxBody` from `@/lib/request-guards`. Middleware already covers `/api/admin` CSRF (`middleware.ts:10,32`). "Confirm no-show" calls `advanceBookingStatus(on_location -> no_show, actor admin)`.

### `app/api/driver/trip/[token]/progress/route.ts` (REWRITE, token-gated write)
**Analog:** itself, lines 1-120. Keep exactly: `enforceMaxBody(request, 10000)` -> `checkRateLimit('/api/driver/trip/progress', getClientIp(request))` (429) -> `z.string().uuid()` token (400 `invalid_token`) -> `request.json()` try/catch (400 `Invalid JSON`) -> zod safeParse (400 `Invalid payload`) -> lookup:
```typescript
.from('driver_assignments').select('id, driver_id, bookings!inner(driver_id, status)').eq('trip_token', parsedToken.data).single()
...
isTripLinkValid({ assignmentDriverId, bookingDriverId, bookingStatus })  // else 400 invalid_token (uniform)
```
Change: `TRIP_PROGRESS_VALUES` becomes strict step schema (`.strict()`, no amount field, steps en_route|on_location|on_board|completed + request_no_show + note); select more booking fields (pickup_date/time, origin type, id); replace the `driver_assignments.update(trip_progress...)` with `driverTripStep()` -> `advanceBookingStatus`. Route file must contain no `.from('bookings')`. Notes (DTRIP-06) remain a plain `driver_assignments.update({trip_note})`. Responses: 200 replay, 409 `{currentStatus,nextStep}` stale/skipped, 409 `too_early` + `unlocksAt`. `trip_progress` mirror written only after CAS wins. CSRF prefix `/api/driver/trip` stays (`middleware.ts:18`), so keep the path.

### `lib/trip-token.ts` / `lib/booking-transitions.ts` / `lib/booking-status.ts`
`trip-token.ts:15`: `export const TERMINAL_STATUSES: Set<string> = new Set(['completed', 'cancelled'])` -> add `'no_show'` (derive from `lib/booking-status.ts`). Note D-17: completed/no_show/cancelled page shows "Trip completed" screen while write route stays invalid (split identity-valid vs write-allowed).
`booking-transitions.ts:11-20` map to extend: `on_location: ['on_board','no_show','completed','cancelled']`, `on_board: ['completed','cancelled']`, `no_show: []`; update `UI_TRANSITIONS` comment. `lib/booking-status.ts` is the single TS vocabulary (D-02); `trip-token.ts` comment says terminal set mirrors the empty arrays of VALID_TRANSITIONS, add a parity assertion.

### GNet mapping (`lib/gnet-client.ts:119-129`)
`PRESTIGO_TO_GNET_STATUS` stays unchanged (D-22): no entries for `on_board`/`no_show` -> `prestigoToGnetStatus` returns null -> "caller MUST exit silently on null".

### Driver page (`app/(internal)/driver/trip/[token]/`)
**Analog:** current `page.tsx:1-50` (metadata `robots: {index:false}`, `createSupabaseServiceClient`, `isTripLinkValid`, explicit row interfaces cast from the join, `RouteMap` from `components/booking/RouteMap`, client island `TripProgressClient.tsx`). Never create Supabase client at module/render level beyond the server component request scope. English-only hard-coded strings (no `messages/*`). Light theme tokens from Phase 86 admin light palette (check `app/(internal)/admin` theme CSS vars; branch feat/86-admin-shell). No amounts/PII on the completed screen. No new slider dependency.

### Fan-out of status lists (MOD, grep `'on_location'`)
Files containing the literal list today: `lib/chatwoot-mapping.ts`, `lib/google-calendar.ts`, `lib/panel-bookings.ts`, `lib/customer-mapping.ts`, `infra/espocrm/lib/booking-map.mjs`, `components/admin/StatusBadge.tsx`, `components/admin/BookingsTable.tsx`, `app/embed/chatwoot-dashboard/BookingCard.tsx`, `app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx`, `app/api/admin/bookings/route.ts:24-33` (`KNOWN_STATUSES` GET whitelist), plus `lib/lead-mapping.ts`, `lib/admin-stats.ts`, `infra/espocrm/fields.json`, and SQL (`booking_lead_status()`, stats RPCs 081-083). `customer-mapping.ts`/`booking-map.mjs` throw `unknown_status` on unknown values, so these are mandatory.

## Test Patterns

**Mocks (vi.hoisted)** — `tests/driver-trip-progress.test.ts:1-30`:
```typescript
const { stubSupabaseFrom, mockCheckRateLimit, mockGetClientIp } = vi.hoisted(() => ({ stubSupabaseFrom: vi.fn(), mockCheckRateLimit: vi.fn(), mockGetClientIp: vi.fn(() => '127.0.0.1') }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn(() => ({ from: stubSupabaseFrom })) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit, getClientIp: mockGetClientIp }))
```
Call routes directly: `POST(new Request(...), { params: Promise.resolve({ token }) })`; chain mocks like `mockSelectSingle` (L53-80). For the CAS the supabase mock needs an `rpc: vi.fn()` alongside `from`.
**Parity net for Plan A (must pass unmodified):** `tests/admin-bookings.test.ts` (PATCH tests ~488-680), `tests/gnet-status-push.test.ts`, `tests/admin-assignment.test.ts`.
**Migration text tests:** `tests/panel-bookings-migration.test.ts:3-11, 71-96` — `readFileSync(join(process.cwd(),'supabase','migrations',name),'utf8')` then `toMatch(/SECURITY DEFINER/)`, `toMatch(/SET search_path = ''/)`, `toMatch(/REVOKE EXECUTE ON FUNCTION .* FROM PUBLIC, anon, authenticated;/)`, `toMatch(/GRANT EXECUTE ... TO service_role;/)`. Copy for `booking-status-log-migration.test.ts`.
**SQL-vs-TS parity:** `tests/espocrm-booking-map.test.ts:329-337` currently pins to migration 053:
```typescript
const sql = read('supabase/migrations/053_unpaid_booking_status.sql')
const block = sql.match(/bookings_status_check\s+CHECK \(status IN \(([\s\S]*?)\)\)/)
const values = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
expect(map.BOOKING_STATUS_VALUES).toEqual(values)
```
Repoint to 084 (latest definition). Same for `tests/customer-mapping-parity.test.ts:79` (hard-coded 8-status list -> import from `lib/booking-status.ts`) and the 053/080/081 text pins noted in RESEARCH. New parity test: TS `BOOKING_STATUSES` equals the latest `bookings_status_check` in migrations.
**Grep-gate rewrite (D-07):** in `tests/driver-trip-progress.test.ts` / `driver-trip.test.ts` (DTRIP-04 gates) replace "imports nothing but ..." assertions with: route source imports `@/lib/booking-status-service` (or `driver-trip-step`) and does not match `/\.from\(['"]bookings['"]\)/`.

## Shared Patterns
- **Guard order (admin):** size guard -> `getAdminUser` 401/403 -> parse (400) -> semantic (422 / CAS 409).
- **Token route:** size guard -> rate limit -> uuid -> JSON -> zod -> live lookup -> uniform `invalid_token` 400.
- **Side effects:** only inside `after()`, with service client re-created inside; failures logged, never block the response.
- **Email dedup:** `logEmail({bookingId, emailType, recipient})` before send.
- **SECURITY DEFINER:** `SET search_path = ''`, fully-qualified `public.` names, then REVOKE FROM PUBLIC, anon, authenticated; GRANT service_role.
- **Security commit prefix:** `security:` (D-07).

## No Analog Found
| File | Role | Reason |
|---|---|---|
| `SlideToAdvance.tsx` / `ConfirmStepDialog.tsx` | component | No slide/gesture control exists; hand-roll with pointer events + tap/keyboard fallback |
| `lib/booking-events.ts` (`emitBookingCompleted`) | service | No completion-event seam yet; Phase 88 consumes `completed_at`/log row (outbox row in `lib/outbox.ts` is the nearest idea) |

## Metadata
**Analog search scope:** supabase/migrations, app/api/{admin,driver}, app/(internal)/driver, lib, tests
**Pattern extraction date:** 2026-11-03
