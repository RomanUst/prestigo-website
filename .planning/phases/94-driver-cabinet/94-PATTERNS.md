# Phase 94: Driver Cabinet - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 41 new/modified
**Analogs found:** 38 / 41 (all analog paths verified git-tracked; no mirror paths)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/100_driver_cabinet.sql` | migration | batch/DDL | `supabase/migrations/057_security_rls_hardening.sql` (RLS deny-all), `098/099_*.sql` | role-match |
| `lib/driver-cabinet/auth.ts` | service | request-response | `lib/supabase/server.ts` `getAdminUser()` (shape only; DB-backed, NO import from it) + `lib/admin-next.ts` | role-match |
| `lib/driver-cabinet/queries.ts` | service | CRUD (read) | `app/(internal)/driver/trip/[token]/page.tsx` TRIP_SELECT join + row interfaces | role-match |
| `lib/driver-cabinet/format.ts` | utility | transform | `lib/driver-trip-step.ts`, `lib/prague-calendar.ts` | role-match |
| `lib/driver-cabinet/push.ts` | service | event-driven | `lib/driver-accept-email.ts` (non-fatal send in `after()`) | partial |
| `lib/driver-offer.ts` | service | request-response | `app/api/driver/respond/route.ts` (extract) | exact |
| `lib/driver-trip-page.tsx` | component (server loader) | request-response | `app/(internal)/driver/trip/[token]/page.tsx` (extract) | exact |
| `lib/driver-cabinet/safe-next.ts` (`safeDriverNext`) | utility | transform | `lib/admin-next.ts` `safeAdminNext` | exact |
| `app/api/driver/cabinet/request-code/route.ts` | route | request-response | `app/api/driver/respond/route.ts` + `app/[locale]/login/actions.ts` | role-match |
| `app/api/driver/cabinet/verify/route.ts` | route | request-response | `app/api/driver/respond/route.ts` | role-match |
| `app/api/driver/cabinet/sign-out/route.ts` | route | request-response | `customerSignOut` in `app/[locale]/login/actions.ts:212-240` | role-match |
| `app/api/driver/cabinet/offers/[assignmentId]/respond/route.ts` | route | request-response | `app/api/driver/respond/route.ts` | exact |
| `app/api/driver/cabinet/push/route.ts` | route | CRUD | `app/api/driver/trip/[token]/help/route.ts` | role-match |
| `app/api/driver/cabinet/help/route.ts` | route | request-response | `app/api/driver/trip/[token]/help/route.ts` | exact |
| `app/api/admin/drivers/[id]/cabinet/route.ts` | route | request-response | `app/api/admin/drivers/[id]/route.ts` | exact |
| `app/api/admin/drivers/route.ts`, `[id]/route.ts` (modify: `vehicle_plate`) | route | CRUD | themselves | exact |
| `app/api/admin/bookings/[id]/assign/route.ts` (modify: cabinet email + push) | route | request-response | itself (lines 52, 176-197) | exact |
| `app/(internal)/driver/(cabinet)/layout.tsx` | layout | n/a | `app/(internal)/driver/trip/layout.tsx` | exact |
| `app/(internal)/driver/(cabinet)/(tabs)/{layout,rides/page,offers/page,you/page}.tsx` | page | request-response | `trip/[token]/page.tsx` + `TripScreen.tsx` header | role-match |
| `app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx` | page | request-response | `trip/[token]/page.tsx` | exact |
| `app/(internal)/driver/login/page.tsx` (+ client island) | page | request-response | `app/(internal)/driver/response/DriverResponseClient.tsx` | role-match |
| `app/(internal)/driver/page.tsx` | page | redirect | none trivial | partial |
| `components/driver/*` (CabinetTabBar, RideRow, OfferCard, dialogs) | component | event-driven | `trip/[token]/ConfirmStepDialog.tsx`, `TripScreen.tsx` | role-match |
| `app/(internal)/driver/trip/[token]/TripScreen.tsx`, `InvalidTripLinkView.tsx` (modify: `backHref`, `driverFee`) | component | request-response | themselves (TripScreen.tsx:~553) | exact |
| `app/(internal)/driver/manifest.webmanifest/route.ts` | route | request-response | none (no manifest exists) | none |
| `public/driver/sw.js`, `public/driver/icons/*` | config | event-driven | none | none |
| `lib/rate-limit.ts` (modify: 6 keys) | config | n/a | itself lines 26, 44-46, 54-56 | exact |
| `middleware.ts` (modify: CSRF lists, `worker-src`) | middleware | request-response | itself lines 10-50, 93, 180 | exact |
| `next.config.ts` (modify: `/driver/sw.js` header) | config | n/a | itself ~line 200 (`/driver/:path*`) | exact |
| `lib/email.ts` (modify: cabinet offer email, OTP email, invite email) | service | request-response | `sendDriverAssignmentEmail` lines 2241-2256 | exact |
| `components/admin/DriversTable.tsx`, `DriverForm.tsx` (modify) | component | CRUD | themselves | exact |
| `tests/driver-cabinet-*.test.ts`, `tests/driver-offer.test.ts`, `tests/admin-driver-cabinet.test.ts` | test | n/a | `tests/driver-help-route.test.ts` | exact |
| `tests/helpers/fake-driver-cabinet-db.ts` | test helper | n/a | `tests/helpers/fake-tours-db.ts` / `fake-payments-db.ts` | role-match |
| `tests/admin-no-hardcoded-colors.test.ts` (modify SCAN_ROOTS) | test | n/a | itself line 21 | exact |

## Pattern Assignments

### `lib/driver-offer.ts` (service, request-response) and `app/api/driver/respond/route.ts` (thin adapter)
**Analog:** `app/api/driver/respond/route.ts` (lines 1-100). Extract lines 36-93 into `respondToOffer`; the route keeps lines 1-34 (rate limit, JSON, zod) and calls it.

**Imports / guards** (lines 1-16):
```typescript
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendDriverDeclineNotification } from '@/lib/email'
import { sendDriverAcceptedTripEmail } from '@/lib/driver-accept-email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
const respondSchema = z.object({ token: z.string().uuid(), action: z.enum(['accepted', 'declined']) })
```
**Token caller guards to preserve byte-for-byte** (lines 49-70): uniform `invalid_token` on lookup failure / `token_used_at` / expiry; atomic update:
```typescript
.update({ status: action, token_used_at: new Date().toISOString() })
.eq('id', assignment.id)
.gt('token_expires_at', new Date().toISOString())
.is('token_used_at', null)
.select('id, status, token_used_at').single()
// updateError || !updated -> { error: 'used' } 400
```
**Effects** (lines 73-97), return as one closure the route runs in `after()`:
```typescript
after(() => sendDriverDeclineNotification({ bookingReference, pickupDate, pickupTime, originAddress, destinationAddress, driverName: driver.name }).catch(err => console.error('[driver-decline]:', err)))
after(() => sendDriverAcceptedTripEmail(assignment.id).catch(err => console.error('[driver-accept]:', err)))
```
Session caller: add `.eq('driver_id', driverId).eq('status','pending')`, newest-of-booking check, skip the `token_expires_at` guard, still set `token_used_at`. Existing tests `tests/admin-assignment.test.ts`, `tests/driver-accept-email.test.ts` must stay green.

---

### `app/api/driver/cabinet/*` routes (route, request-response)
**Analog:** `app/api/driver/respond/route.ts` for the shape; `app/api/driver/trip/[token]/help/route.ts` (lines 1-30) for `enforceMaxBody`, `dynamic`, and `readEnv`.

Order to copy: `enforceMaxBody` -> `checkRateLimit(key, getClientIp(request), { failClosed: true })` (auth routes) -> JSON parse (400) -> zod `safeParse` (400) -> `requireDriver()`-equivalent for session routes -> service-client work.
```typescript
export const dynamic = 'force-dynamic'
const { allowed } = await checkRateLimit('/api/driver/respond', getClientIp(request))
if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
```
Per-email limit: key on `sha256(email)` using the `'/api/custom-tour#ack'` precedent (`lib/rate-limit.ts:26`, window in `WINDOWS_MS` lines 54-56; long-window lookup at line 166 matches `${p}:` prefix). Email validation with `safeEmail` from `lib/request-guards`.

**Sign-out cw_ cookie cleanup** (copy from `app/[locale]/login/actions.ts:222-230`):
```typescript
const cookieStore = await cookies()
for (const cookie of cookieStore.getAll()) {
  if (cookie.name.startsWith('cw_')) cookieStore.delete({ name: cookie.name, path: '/' })
}
```
**Isolation rule (D-07):** nothing under `lib/driver-cabinet/` or `app/api/driver/cabinet/` imports `@/lib/supabase/server` (that is the Supabase-Auth cookie client). Use only `createSupabaseServiceClient` from `@/lib/supabase` (lib/supabase.ts:5-16).

---

### `lib/driver-cabinet/auth.ts` (service)
**Analog shape:** `lib/supabase/server.ts:5-10` (`getAdminUser` returns `{user, error:'401'|'403'}`) but DB-backed; `lib/admin-next.ts:20-50` for `safeDriverNext`.
```typescript
export async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  ...
}
```
Use RESEARCH Pattern 1 (cookie `prestigo_driver_session`, `sha256` at rest, `driver_sessions` join `drivers!inner(cabinet_enabled)` every request, `redirect('/driver/login?next=...')`). `safeDriverNext`: copy `safeAdminNext` logic (no `//`, no backslash, no control chars, no `..`, `new URL` origin check) replacing `/admin` with `/driver` and rejecting `/driver/login`.

---

### `lib/driver-trip-page.tsx` and `app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx`
**Analog:** `app/(internal)/driver/trip/[token]/page.tsx`. Move lines 1-150+ (imports, row interfaces `TripSheetBookingRow`, `TRIP_SELECT`, `coords`, `currentTimeMs`, token validation, join, `tripLinkViewState`) into `TripScreenForToken({ token, backHref?, showDriverFee? })`; the token page becomes a thin wrapper and keeps `metadata.robots`.

Key excerpts:
```typescript
const parsedToken = z.string().uuid().safeParse(token)
if (!parsedToken.success) return <InvalidTripLinkView />
const { data: rawAssignment, error } = await supabase
  .from('driver_assignments').select(TRIP_SELECT).eq('trip_token', parsedToken.data).single()
const assignment = rawAssignment as unknown as TripSheetAssignmentRow | null
```
`TRIP_SELECT` (lines 91-99) must NOT match `/amount_eur|price/i` for the token path (`tests/driver-trip.test.ts:337`); append `, driver_price_czk` only when `showDriverFee` (Pitfall 6). Cabinet detail page: `requireDriver()` -> select `trip_token` from `driver_assignments` where `id = assignmentId AND driver_id = driverId` -> missing => same `InvalidTripLinkView` (uniform) -> `<TripScreenForToken token={trip_token} backHref="/driver/rides" showDriverFee />`.

**TripScreen modification** (`TripScreen.tsx:553`): replace the comment `{/* D-18: Help only. No Back in Phase 87 (the back slot is reserved for the Phase 94 ride list). */}` with an optional Back `<Link>` in the header (header block at ~lines 540-552: `height: 56`, `padding: '0 24px'`, `justifyContent: 'space-between'`, `<span className="admin-wordmark">PRESTIGO</span>`). Add optional props `backHref?: string`, `driverFee?: string | null` (pre-formatted label via `formatCZK`, like the existing `cash` label).

---

### `app/(internal)/driver/(cabinet)/layout.tsx` (layout)
**Analog:** `app/(internal)/driver/trip/layout.tsx` (all 13 lines):
```tsx
import '@/app/(internal)/admin/admin-theme.css'
import './driver-trip.css'
export default function DriverTripLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell driver-shell" data-admin-theme="light">{children}</div>
}
```
Cabinet copy adds `driver-cabinet.css` (size-only, no colour literal), `export const metadata` with `manifest: '/driver/manifest.webmanifest'`, `appleWebApp`, `icons.apple`, `viewport.themeColor`. Note `driver-trip.css` lives at `app/(internal)/driver/trip/driver-trip.css`; import by absolute path. Colours only `var(--admin-*)` / `var(--status-*)`. Every page calls `requireDriver()` itself (Pitfall 4).

---

### `app/api/admin/drivers/[id]/cabinet/route.ts` (route, request-response)
**Analog:** `app/api/admin/drivers/[id]/route.ts` (lines 1-45), copy exactly:
```typescript
const tooBig = enforceMaxBody(request, 50_000); if (tooBig) return tooBig
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const { id } = await params  // Promise in Next 15+
if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
const parsed = schema.safeParse(await request.json())  // body: { action: z.enum(['invite','disable','enable']) }
if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
const supabase = createSupabaseServiceClient()
```
Here `getAdminUser` is allowed (admin side, outside the cabinet isolation gate). `disable`: update `drivers.cabinet_enabled=false` then delete from `driver_sessions`, `driver_login_codes`, `driver_push_subscriptions` by `driver_id`. Also extend `driverPatchSchema` (lines 6-11) with `vehicle_plate: safeString(200).optional().nullable()` and the `updateData` block (lines 35-39); same for `driverCreateSchema` in `app/api/admin/drivers/route.ts`.

---

### `app/api/admin/bookings/[id]/assign/route.ts` (modify)
Line 52: `.select('id, name, email')` -> add `cabinet_enabled`. Lines 176-197: the existing `after(() => sendDriverAssignmentEmail({...acceptUrl, declineUrl, tripUrl}).catch(err => console.error('[driver-assign]:', err)))`. Branch: if `driver.cabinet_enabled`, call the cabinet variant (single CTA `${siteUrl}/driver/offers`) plus `sendOfferPush(driver.id, ...)` inside the same `after()`; else the existing call unchanged (byte-identical for non-cabinet). Respect the existing `notification_flags.driver_assigned === false` suppression in that block. Imports to extend at lines 1-10 (`logEmail`, `sendDriverAssignmentEmail` from `@/lib/email`).

---

### `lib/email.ts` additions (OTP, invite, cabinet offer email)
**Analog:** `sendDriverAssignmentEmail` (lines 2241-2256) and `driverTripRow` / `driverTripDetailsRows` (lines ~2280-2318):
```typescript
export async function sendDriverAssignmentEmail(data): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [data.driverEmail], subject: `...`, html: buildDriverAssignmentHtml(data, route),
    })
    if (error) console.error('[driver-assign] assignment email error:', error)
  } catch (err) { console.error('[driver-assign] assignment email exception:', err) }  // non-fatal
}
```
Inline-style HTML, `escapeHtml` on every user value, `emailLogoImg(h)` for the logo (lines 22-26), fee via `formatCZK`. OTP email must NOT go through `logEmail` dedup (10 min suppress, `lib/email-log.ts`); but OTP send must throw/return status so the route can still answer generically. Cabinet offer email: fee row appears only when `driverPriceCzk != null` (copy line 2306-2308 pattern); no passenger last name / phone (D-12).

---

### `lib/rate-limit.ts` (modify)
Add next to line 44-46 (`'/api/driver/respond': 10`, `'/api/driver/trip/progress': 20`, `'/api/driver/trip/help': 10`) with the same trailing-comment style:
`'/api/driver/cabinet/request-code': 5`, `'/api/driver/cabinet/request-code#email': 3` (+ entry in `WINDOWS_MS` lines 54-56 of `10 * 60 * 1000`), `'/api/driver/cabinet/verify': 10`, `'/api/driver/cabinet/offers/respond': 20`, `'/api/driver/cabinet/push': 10`, `'/api/driver/cabinet/help': 10`. Auth callers pass `{ failClosed: true }` (`checkRateLimit(pathname, ip, options)` lines 207-232).

---

### `middleware.ts` (modify)
- `CSRF_PROTECTED_PREFIXES` (after `'/api/driver/trip'`, ~line 18): add `'/api/driver/cabinet'` with a `// Phase 94 (DCAB-13)` comment in the file's style.
- `CSRF_STRICT_ORIGIN_REQUIRED` (starts ~line 42): add `'/api/driver/cabinet'`.
- `buildCsp` (line 93) and `buildCspDriverHelp` (line 180): add `"worker-src 'self'"` in the same position in both; update `tests/middleware-i18n.test.ts` and `tests/middleware-tour-photos-csp.test.ts`. Do not touch the matcher (`tests/middleware-matcher.test.ts`).

### `next.config.ts` (modify)
Next to the `source: "/driver/:path*"` entry (~line 204), add `/driver/sw.js` with `Cache-Control: no-cache, no-store, must-revalidate` and `Content-Type: application/javascript; charset=utf-8`; extend `tests/next-config-headers.test.ts`.

---

### `components/admin/DriversTable.tsx`, `DriverForm.tsx` (modify)
Existing: client component with `thStyle` / `cellStyle` objects using `var(--admin-*)` and `var(--font-montserrat)` (lines 1-25), props `{ drivers, onEdit, onDeleted }`, `lucide-react` icons. Add status chip via existing `StatusBadge` (`components/admin/StatusBadge.tsx`), Invite/Disable buttons calling `/api/admin/drivers/[id]/cabinet`, `vehicle_plate` field in `DriverForm` (extend the exported `Driver` type with `cabinet_enabled`, `cabinet_invited_at`, `vehicle_plate`).

---

### `supabase/migrations/100_driver_cabinet.sql`
**Analog:** `supabase/migrations/057_security_rls_hardening.sql` for RLS deny-all:
```sql
ALTER TABLE public.booking_edit_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(...) FROM PUBLIC, anon, authenticated;
```
Use RESEARCH "Migration 100 outline" and "Atomic code consumption" verbatim; end with `REVOKE ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role;` (memory: DROP+CREATE re-grants PUBLIC). Latest in repo is 099. Add a smoke SQL alongside (pattern `87-02-smoke.sql`). Orchestrator applies it live (executors have no Supabase MCP). Test with `tests/helpers/latest-migration.ts` (`loadMigration`, `latestFunctionBody`).

---

### Tests
**Analog:** `tests/driver-help-route.test.ts` (lines 1-40) for the hoisted-mock pattern:
```typescript
const { stubSupabaseFrom, mockCheckRateLimit, mockGetClientIp, mockCreateClient } = vi.hoisted(() => ({ ... }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: mockCreateClient }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit, getClientIp: mockGetClientIp }))
```
Source-gate tests use `// @vitest-environment node` + `fs`/`path` (see `tests/admin-no-hardcoded-colors.test.ts` header). Extend `SCAN_ROOTS` at line 21 (`['components/admin', 'app/(internal)/admin', 'app/(internal)/driver/trip']`) with `app/(internal)/driver/(cabinet)`, `app/(internal)/driver/login`, `components/driver`. Fake DB: copy structure of `tests/helpers/fake-tours-db.ts` / `fake-payments-db.ts`.

## Shared Patterns

### Service-role reads, never render-time client creation
**Source:** `lib/supabase.ts:5-16` (`createSupabaseServiceClient`, `persistSession:false`). **Apply to:** every cabinet page, route, query. Explicit column lists; every `driver_assignments` query has `.eq('driver_id', driverId)`; use `bookings!inner(...)` and cast through explicit row interfaces (as `TripSheetAssignmentRow`) because the client is untyped.

### Admin guard (admin routes only)
**Source:** `app/api/admin/drivers/[id]/route.ts:15-21`. **Apply to:** `/api/admin/drivers/[id]/cabinet`. Never to cabinet routes.

### Uniform not-found / anti-enumeration
**Source:** `app/api/driver/respond/route.ts:46-60` (single `invalid_token` for missing/used/expired) and `InvalidTripLinkView`. **Apply to:** foreign `assignmentId`, unknown email on request-code (identical 200 body).

### Non-fatal side effects in `after()`
**Source:** respond route lines 73-97 and assign route 176-197 (`.catch(err => console.error('[tag]:', err))`). **Apply to:** push, cabinet email, accept/decline effects. Never log endpoint/keys/tokens.

### Light theme tokens
**Source:** `app/(internal)/driver/trip/layout.tsx` + `admin-theme.css`. **Apply to:** all cabinet TSX; no hex/rgb literals (guard test). Manifest route and `lib/email.ts` are outside the guard.

### Money
`formatCZK` from `lib/currency.ts:5`; only when `driver_price_czk` is a positive integer; never `€`, never client price. `formatVehicleLabel` from `lib/email.ts:110`; Prague dates via `lib/prague-date.ts` (`pickupInstantMs`, `pragueDateOf`) and `lib/prague-calendar.ts`.

### Status writes
Cabinet never writes `bookings`; steps stay on `/api/driver/trip/[token]/progress` via `lib/booking-status-service.ts` (`tests/status-writers-gate.test.ts` must stay green). Terminal statuses: `TERMINAL_BOOKING_STATUSES` from `lib/booking-status.ts:35-39`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `public/driver/sw.js` | config | event-driven | No service worker exists; use RESEARCH "Service worker (static)" |
| `app/(internal)/driver/manifest.webmanifest/route.ts` | route | request-response | No manifest in repo; literals `#EFE8DA` allowed only here (UI-SPEC) |
| `lib/driver-cabinet/push.ts` | service | event-driven | No web-push usage; use `web-push@3.6.7` per RESEARCH Pattern 7 (behind human-verify checkpoint). Only the non-fatal `after()` error style is copyable |
| `app/(internal)/driver/page.tsx` | page | redirect | `/driver` has no page today; `redirect('/driver/rides')` |

## Metadata

**Analog search scope:** `app/(internal)/driver`, `app/api/driver`, `app/api/admin/drivers`, `app/api/admin/bookings/[id]/assign`, `lib/` (supabase, rate-limit, email, admin-next), `middleware.ts`, `next.config.ts`, `components/admin`, `supabase/migrations`, `tests/` and `tests/helpers`
**Pattern extraction date:** 2026-11-25
**Not extracted line-by-line (read UI-SPEC directly):** visual contract for tab bar, offer card, dialogs, You screen (94-UI-SPEC.md); `ConfirmStepDialog` gains two modes per UI-SPEC.
