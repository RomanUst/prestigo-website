# Phase 89: Cancellation Policy, Cash Guarantee & No-Show - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 34 (new and modified)
**Analogs found:** 33 / 34 (all analogs verified git-tracked)

CONTEXT D-21 and D-22 override RESEARCH where they differ:
- No automatic 24 h case or reminder for a cash booking without a driver confirmation. Admin only SHOWS "unconfirmed". So `cash_not_received` does NOT open a timed fee case; and the "charge saved card" action must work BEFORE the booking is `completed` (driver phones operator mid-trip).
- Operator can reverse a driver's cash confirmation with a note (`reopen_cash`, D-22). Ledger keeps both rows. This replaces the "optional" status in RESEARCH Pitfall 9.
- Admin cancel dialog asks "Cancelled by: client / Prestigo" (D-20). Prestigo is always free.
- D-23: fees recorded in ledger only, no stats change (leave `REVENUE_STATUSES` alone).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `lib/cancellation-policy.ts` (new) | utility (pure, client-safe) | transform | `lib/payments/timing.ts` | exact |
| `lib/cancellation-settings.ts` (new) | service (settings reader + snapshot) | request-response | `lib/payments/config.ts` | role-match |
| `lib/manage-link.ts` (new) | service (token) | CRUD | `lib/trip-token.ts` (+ `lib/payments/recovery-link.ts`) | role-match |
| `lib/payments/cancel.ts` (new) | service (orchestrator) | request-response | `app/api/admin/bookings/cancel/route.ts` | exact (extract) |
| `lib/payments/fee.ts` (new) | service | CRUD | `lib/payments/actions.ts` (`runPaymentAction`) | role-match |
| `lib/payments/settle.ts` (mod) | service | event-driven | itself (`opts.claimPatch`, `CLAIMABLE`) | self |
| `lib/payments/state.ts` (mod) | model/state machine | transform | itself (`TRANSITIONS`, `LEDGER_KINDS`) | self |
| `lib/payments/actions.ts` (mod) | service | request-response | itself | self |
| `lib/payments/hold.ts` (mod: `releaseHold`, `abandonHoldForClosedBooking`) | service | event-driven | itself | self |
| `lib/payments/tick.ts` (mod: step E, new step G) | service | batch | itself | self |
| `lib/payments/config.ts` (mod: `on` mode) | config | request-response | itself | self |
| `lib/payments/checkout.ts`, `lib/supabase.ts` `flowConflict` (mod: cash) | service | CRUD | itself (`createCardCheckoutIntent`) | self |
| `lib/payments/emails/render.ts`, `send.ts` (mod: fee/cancel kinds, manage button) | service | event-driven | itself | self |
| `lib/payments/alerts.ts` (mod: new alert kinds) | service | event-driven | itself (`OPERATOR_ALERT_KINDS`) | self |
| `lib/no-show.ts` (mod: `assertNoShowConfirmable`, WR-04) | service | request-response | itself (`confirmNoShow`, `noShowAvailableAtMs`) | self |
| `lib/driver-trip-step.ts` (mod: `confirm_cash`) | service | request-response | itself (`request_no_show`) | self |
| `app/api/admin/bookings/cancel/route.ts` (mod) | controller | request-response | itself | self |
| `app/api/admin/bookings/[id]/fee/route.ts` (new) | controller | request-response | `app/api/admin/bookings/[id]/payment/route.ts` | exact |
| `app/api/admin/bookings/route.ts` PATCH (mod: WR-02/04 gates) | controller | CRUD | itself (`use_cancel_route`) | self |
| `app/api/admin/settings/route.ts` (mod) | controller | CRUD | itself (`noshow_wait_*`) | self |
| `app/api/manage/cancel/route.ts` (new) | controller | request-response | `app/api/driver/trip/[token]/progress/route.ts` | role-match |
| `app/api/manage/change-request/route.ts` (new) | controller | request-response | same | role-match |
| `app/api/account/bookings/cancel/route.ts` (new) | controller | request-response | `app/api/admin/bookings/cancel/route.ts` + session client | partial |
| `app/api/driver/trip/[token]/progress/route.ts` (mod) | controller | request-response | itself | self |
| `app/[locale]/manage/[token]/page.tsx` (new) | component (SSR page) | request-response | `app/(internal)/driver/trip/[token]/page.tsx` + `app/[locale]/account/trips/page.tsx` | role-match |
| `app/[locale]/account/trips/page.tsx` (mod) | component | request-response | itself | self |
| `app/(internal)/driver/trip/[token]/{page,TripScreen,ConfirmStepDialog,TripCompleted}.tsx` (mod) | component | request-response | `NoShowBlock.tsx` | role-match |
| `components/admin/CancellationPolicySettings.tsx` (new) | component | CRUD | `components/admin/NoShowWaitSettings.tsx` | exact |
| `components/admin/CardFlowSettings.tsx` (mod: go-live tile) | component | CRUD | itself | self |
| `components/admin/FeeChargeModal / FeeWaiveModal / CashCardChargeModal / MarkCashModal` (new) | component | request-response | `components/admin/ConfirmNoShowModal.tsx` + `Modal.tsx` | role-match |
| `components/admin/BookingsTable.tsx`, `PaymentPanel.tsx`, `PaymentStateBadge.tsx` (mod) | component | CRUD | themselves | self |
| `supabase/migrations/087_cancellation_cash_fee.sql`, `088_erasure_payment_pii.sql` (new) | migration | CRUD | `085_payment_state_card_on_file.sql`, `086_payment_transition_status_gate.sql`, `075_erasure.sql` | exact |
| `next.config.ts`, `middleware.ts`, `lib/rate-limit.ts` (mod) | config | request-response | themselves | self |
| `components/SiteChrome` analytics set + `ChatLauncher` (mod: `isPrivateLinkPath`) | component | event-driven | `components/AnalyticsPageView.tsx:30` | role-match |
| tests: `tests/payments-cancel*.test.ts`, `payments-fee*.test.ts`, `manage-*.test.ts`, helpers | test | - | `tests/admin-bookings-cancel.test.ts`, `tests/payments-settle.test.ts`, `tests/helpers/fake-payments-db.ts`, `tests/helpers/fake-stripe.ts` | role-match |

## Pattern Assignments

### `lib/cancellation-policy.ts` (utility, transform)

**Analog:** `lib/payments/timing.ts` (lines 1-26). Pure, integer-ms, no server imports so checkout and the manage page show the same answer the server computes. Policy and outcome types are already sketched in RESEARCH "Code Examples"; copy their structure.

```typescript
// Pure hold-timing rules ... Everything here is integer-millisecond arithmetic on instants ...
// Client-safe: no server imports, so the checkout UI can show the same hold date the server computes.
import { getPragueTodayISO, pickupInstantMs, shiftIsoDate } from '@/lib/prague-date'
const HOUR_MS = 3_600_000
export const MIN_BOOKING_LEAD_MS = 12 * HOUR_MS
```

Rules: `freeHoursFor` hourly -> hourly setting (D-06); unknown km -> stricter long window; `nowMs >= pickupMs` -> `too_late`. Legacy snapshot NULL -> legacy rule (RESEARCH Pitfall 13).

---

### `lib/payments/cancel.ts` (service orchestrator, request-response)

**Analog:** `app/api/admin/bookings/cancel/route.ts` (extract; the route becomes a thin caller). Keep this order exactly.

**Pre-CAS busy guard** (lines 120-131):
```typescript
const isHold = booking.payment_mode === 'card_hold'
const refundsPayNow = !isHold && Boolean(booking.payment_intent_id)
if (
  isHold &&
  (booking.payment_state === 'capturing' || (booking.payment_state === 'placing_hold' && !leaseLapsed(booking)))
) {
  return NextResponse.json({ error: 'payment_busy' }, { status: 409 })
}
```
Extend `isHold` to `card_hold || cash_guarantee`.

**Status CAS FIRST** (lines 169-188). Client cancel uses actor `{ type: 'system', id: 'client_token' }` and `source: 'client_cancel'` (matches `^[a-z_]{1,40}$`):
```typescript
const cancelled = await advanceBookingStatus({
  bookingId: parsed.data.id,
  to: 'cancelled',
  actor: { type: 'admin', id: user?.id ?? null },
  source: 'admin_cancel',
  profile: 'cancel-route',
  current: booking,
  expectedFrom: booking.status as string,
})
if (!cancelled.ok) {
  if (cancelled.code === 'conflict') {
    return NextResponse.json({ error: 'status_conflict', currentStatus: cancelled.currentStatus }, { status: 409 })
  }
  return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
}
```

**Money failure after cancel** (lines 192-229): keep `moneyFailed` verbatim (ledger `refund_failed:<id>:<legKey>` + `sendPaymentOperatorAlert('refund_failed', ...)` + 502 `{ cancelled: true }`). Reuse for fee-waive refund failures.

**Fresh payment read after CAS** (lines 236-247): the payment snapshot predates the CAS; re-select `PAYMENT_COLUMNS` and merge before `releaseHold`.

**Refund of collected money** (lines 252-266), key `stripeKeys.refund(String(booking.id), legKey)` -- reuse for FREE cancel of captured/balance_due.

**Release** (lines 268-282): `releaseHold(current, { actor, reason: 'cancel' })`; `'busy'` -> throw -> `moneyFailed`.

**Change for Phase 89:**
- FREE path (initiator Prestigo, or policy outcome `free`): current behaviour above.
- LATE path (client + `late`): do NOT call `releaseHold`. Open fee case (idempotent on `booking_id`) in the same request BEFORE any early return, set `bookings.fee_case_status='pending'`, retire recovery link (`lib/payments/recovery-link.ts`). Pay-now late: keep money (D-07).
- No money step ever reads `payment_state` as proof; `assertMoneyEligible` stops partner rows (see Shared Patterns).
- `scheduleCancelRouteEmail(booking, previousStatus, 'refund' | 'no_charge' | null)` stays the email hook; add a `'fee_pending'` variant and a driver-notice email (new `sendDriverCancelledEmail`, `after()`).

---

### `app/api/admin/bookings/[id]/fee/route.ts` (controller, request-response)

**Analog:** `app/api/admin/bookings/[id]/payment/route.ts` lines 1-40 (guard order and strict schema). This route is THE deliberate exception to "no function takes an amount" (D-14); say so in the header comment as the analog does.

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { appendPaymentEvent } from '@/lib/payments/state'

const MAX_BODY_BYTES = 2_048
const idSchema = z.string().uuid()
// Strict objects: { action } is the whole body, an extra field (an amount in particular) is a 400.
const actionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('capture') }),
  ...
])
```
Guard order (from the analog header): `enforceMaxBody` -> `getAdminUser` (401/403) -> `await params` -> uuid 400 -> JSON 400 -> strict schema 400 -> booking 404 -> business rules 422 -> engine 409.

New union: `charge {amount_minor, reason?, contact_note?}` | `waive {reason}` | `cash_settled` | `reopen_cash {reason}` (D-22) | `charge_saved_card {note}` (D-21: allowed for cash booking BEFORE completion). Cap = `payment_amount_minor` from the row; currency from the row; amount locked on the case row at first click (RESEARCH Pattern 4 idempotency).

**Audit row first** (copy from `lib/payments/actions.ts:147-152`):
```typescript
await appendPaymentEvent(bookingId, {
  key: `admin:${action}:${bookingId}:${Date.now()}`,
  kind: 'admin_action',
  actor,
})
```
Free text (reason, note) goes to the case row, never the ledger.

---

### `lib/payments/actions.ts` (mod)

Keep header invariant for `/payment` route (no amount). Edit points:
- `allowedPaymentActions` line 63: `if (booking.payment_mode !== 'card_hold') return []` -> accept `cash_guarantee` (cash: `release`, `mark_cash_settled`, `charge_saved_card`, `reopen_cash` when `cash_settled`).
- line 70: `if (CLOSED_STATUSES.has(...)) return RELEASE_STATES... ['release']` -> when a pending fee case exists, return fee actions instead of `release`.
- `fromSettle` (lines 118-133) `skipped` -> NOT_ALLOWED stays.
- Add the new `PaymentAction` members to the union at line 23 and to the discriminated union in the payment route only if they carry no amount.

---

### `lib/payments/settle.ts` (mod: `opts.fee`)

Target lines: 425-426 gates; `CLAIMABLE` line 73; claim at ~436:
```typescript
if (loaded.payment_mode !== 'card_hold') return { outcome: 'skipped', code: 'not_card_hold' }
if (!isCompleted(loaded)) return { outcome: 'skipped', code: 'not_completed' }
...
const claim = await applyTransition({
  bookingId, from: CLAIMABLE, to: 'capturing',
  patch: { ...(opts.claimPatch ?? {}), payment_lease_until: new Date(nowMs + LEASE_SECONDS * 1000).toISOString() },
  event: { key: `capture_started:${attemptsOf(loaded)}:${nowMs}`, kind: 'capture_started', actor },
})
```
Bypass the two gates only when `opts.fee` is present; `assertMoneyEligible` (lines 416-424) stays first. Fee keys: `fee:<caseId>:<n>`, `feecap:<caseId>:<n>` added to `stripeKeys` in `lib/payments/stripe.ts` (existing `cap:`, `chg:`, `diff:` are attempt-only).

---

### `lib/payments/state.ts` + migration 087 (state machine)

**Analog:** `state.ts` `TRANSITIONS` (lines ~103-117) and `LEDGER_KINDS` (lines ~36-60). Add `cash_settled` to `PAYMENT_STATES` and:
```typescript
card_saved: ['card_saved', 'placing_hold', 'capturing', 'released', 'cash_settled'],
cash_settled: ['card_saved'],   // D-22 reopen, admin-only
```
`LEDGER_KINDS` += `'fee_opened'`, `'cash_settled'`, `'cash_reopened'`. Also keep in lock-step: `FAKE_PAYMENT_VOCABULARY` in `tests/helpers/fake-payments-db.ts`, `PaymentStateBadge.tsx`, `payments-state.test.ts`.

---

### `supabase/migrations/087_cancellation_cash_fee.sql` (migration)

**Analog:** `085_payment_state_card_on_file.sql` (deny-all table block lines 183-198) and `086_payment_transition_status_gate.sql` (full-function replacement: `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE` + re-REVOKE/GRANT; header documents ordering "apply BEFORE the code").

Deny-all table pattern for `booking_fee_cases` and `booking_manage_tokens`:
```sql
REVOKE ALL ON public.booking_payment_events FROM anon, authenticated;
ALTER TABLE public.booking_payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_payment_events_no_public_read ON public.booking_payment_events;
CREATE POLICY booking_payment_events_no_public_read ON public.booking_payment_events FOR SELECT USING (false);
DROP POLICY IF EXISTS booking_payment_events_no_public_insert ON public.booking_payment_events;
CREATE POLICY booking_payment_events_no_public_insert ON public.booking_payment_events FOR INSERT WITH CHECK (false);
```
Other 087 contents (all additive/default-safe): widen `card_flow_mode` CHECK (085:250-252) to include `on`; widen `booking_payment_consents.mode` CHECK (085:209) with `cash_setup`; widen `bookings_payment_state_check` and `booking_payment_events_kind_check`; copy the 086 `apply_payment_transition` body verbatim plus `cash_settled` in the `v_states` array (keep the `p_require_status` gate text; `tests/payments-migration-086.test.ts` reads the LAST definition); `pricing_globals` columns `cancel_free_km_threshold`, `cancel_free_hours_short|long|hourly`, `cancel_fee_percent` with BETWEEN CHECKs (analog `payment_hold_lead_hours BETWEEN 6 AND 96`); `bookings.cancel_policy_version`, `cancel_policy jsonb`, `fee_case_status`. File header: "Schema FILE only; applied by the orchestrator via Supabase MCP". Tokens/notes/evidence never on `bookings` (049 `bookings_select_own`). Next free number is 087 (088 for erasure).

**088:** full copy of `erasure_anonymise_person` from `075_erasure.sql:306-` plus consent `ip`/`user_agent` null, token delete, fee-case scrub; then re-REVOKE `FROM PUBLIC, anon, authenticated` (project memory: DROP+CREATE re-grants PUBLIC).

---

### `lib/manage-link.ts` + `app/[locale]/manage/[token]/page.tsx` (token service and SSR page)

**Analog:** `lib/trip-token.ts` (pure validity/view-state; anti-enumeration: unknown, ended and reassigned render the same view) and `app/(internal)/driver/trip/[token]/{page.tsx,InvalidTripLinkView.tsx}`.

```typescript
export type TripLinkViewState = 'active' | 'completed' | 'ended'
export function tripLinkViewState(input: TripLinkValidityInput): TripLinkViewState {
  if (!isCurrentDriver(input)) return 'ended'
  if (input.bookingStatus === 'completed') return 'completed'
  if (TERMINAL_STATUSES.has(input.bookingStatus)) return 'ended'
  return 'active'
}
```
Manage page differs: localized route `app/[locale]/manage/[token]/` (NOT under `(internal)`, which hard-codes `lang="en"`), `export const dynamic = 'force-dynamic'`, `setRequestLocale(params.locale)` (not bare `getLocale()`), `metadata.robots = { index:false, follow:false }` (copy from `book/confirmation/layout.tsx`). Token = `randomBytes(32).toString('base64url')` in `booking_manage_tokens`; zod regex `^[A-Za-z0-9_-]{43}$` first. Page is read-only GET; cancel is POST (mail-scanner prefetch safety).

**Headers** (copy shape from `next.config.ts:173-179`, add after it):
```typescript
{ source: "/driver/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
// add: { source: "/manage/:path*", ... } and { source: "/:locale(ru|es|fr|ar|hi|zh)/manage/:path*", ... }
```

**Third-party suppression:** `components/AnalyticsPageView.tsx:30` `if (pathname.startsWith('/admin')) return` and `components/GoogleAnalytics.tsx:79` `if (!window.location.pathname.startsWith('/admin'))`. Replace with one shared client-safe `isPrivateLinkPath(pathname)` (`/admin`, `/driver`, `/manage`, optional locale prefix) in all six chrome components and `ChatLauncher` (the `/driver` case is also a latent leak).

---

### `app/api/manage/cancel/route.ts`, `change-request/route.ts` (controller)

**Analog:** `app/api/driver/trip/[token]/progress/route.ts` lines 1-70 (unauthenticated token-gated POST).

```typescript
const tooBig = enforceMaxBody(request, 10000)
if (tooBig) return tooBig
const { allowed } = await checkRateLimit('/api/driver/trip/progress', getClientIp(request))
if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
const { token } = await params
const parsedToken = z.string().uuid().safeParse(token)
if (!parsedToken.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
let body: unknown
try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
const parsed = driverTripRequestSchema.safeParse(body)
if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
```
Manage variant: token in body (`{ token, acknowledge: 'free'|'late' }`), regex not uuid. Server recomputes the outcome; mismatch with `acknowledge` -> 409 `POLICY_CHANGED`, cancel nothing. Repeat of a successful cancel -> 200 with current state. Refuse `on_board` for clients.

**Wiring (must add, otherwise unprotected):**
- `middleware.ts` lines 8-47: add `'/api/manage'` to BOTH `CSRF_PROTECTED_PREFIXES` and `CSRF_STRICT_ORIGIN_REQUIRED` (as `'/api/card-checkout'` is).
- `lib/rate-limit.ts` `LIMITS` (line ~35 style: `'/api/driver/trip/progress': 20`): add `'/api/manage/cancel'` and `'/api/manage/change-request'`. Unknown key is UNLIMITED (`rate-limit.ts:187-188`); add a test that every new public route has a key.

---

### `lib/driver-trip-step.ts` + progress route (mod: `confirm_cash`, D-11)

**Analog:** `driverTripRequestSchema` lines 30-35 and route dispatch lines 66-72.
```typescript
export const driverTripRequestSchema = z.union([
  z.object({ step: z.enum(DRIVER_STEPS) }).strict(),
  z.object({ note: z.string().max(2000) }).strict(),
  z.object({ action: z.literal('request_no_show') }).strict(),
])
```
Add `z.object({ action: z.literal('confirm_cash') }).strict()` (no amount field; the existing `{ step, amount }` -> 400 test stays). The route currently maps ANY `'action' in data` to `requestNoShowForDriver`; change to a switch on `data.action`. Handler: `hasTripIdentity`, `assertMoneyEligible`, `status === 'completed'`, `payment_mode === 'cash_guarantee'`, `applyTransition({ from:['card_saved'], to:'cash_settled', event:{ key:`cash_settled:${bookingId}`, kind:'cash_settled', actor:{ type:'system', id:'driver_trip' } } })`. Per D-21 no `cash_not_received` fee case and no timed reminder: the driver only calls the operator; admin shows "unconfirmed".

Driver page: `TRIP_SELECT` in `page.tsx` must stay amount-free for non-cash; build a pre-formatted label (`formatMinor`, `lib/payments/money.ts`) server-side only when `payment_mode==='cash_guarantee' && payment_state==='card_saved'`. Update `tests/driver-trip.test.ts:294-314` and `tests/driver-trip-screen.test.tsx:211,409` to "no amount unless cash".

---

### `lib/no-show.ts` (mod: WR-04) and admin PATCH (mod: WR-02)

**Analog:** itself.
```typescript
export async function confirmNoShow(input: { bookingId: string; actor: Extract<StatusActor,{type:'admin'}>; expectedFrom?: string }) {
  return advanceBookingStatus({ bookingId: input.bookingId, to: 'no_show', expectedFrom: input.expectedFrom,
    actor: input.actor, source: 'admin_no_show', profile: 'full' })
}
```
Add `assertNoShowConfirmable(booking, nowMs)` (status `on_location`, `no_show_requested_at` non-null, `nowMs >= noShowAvailableAtMs(...)` with live thresholds; `no-show.ts:81-89`) called by `confirmNoShow`. In `app/api/admin/bookings/route.ts` PATCH: `status:'no_show'` -> 422 `use_no_show_route` (copy the `use_cancel_route` guard at ~line 341; extend that guard to `cash_guarantee` and paid pay-now); trip-edit gate at line 392 `current.status === 'completed' || 'cancelled'` add `no_show`; assign route: gate on `TERMINAL_BOOKING_STATUSES` before the `driver_assignments` insert (RESEARCH marks this ASSUMED: confirm when fixing). Evidence snapshot into `booking_fee_cases.evidence` at confirm.

---

### `components/admin/CancellationPolicySettings.tsx` + `app/api/admin/settings/route.ts` (mod)

**Analog:** `components/admin/NoShowWaitSettings.tsx` (optimistic save, `parseWait` digits-only regex, `SETTINGS_KEY` map, server zod stays authoritative) and settings route lines 14-15, 28-29, 45, 56-57, 96-100.
```typescript
noshow_wait_city_min: z.number().int().min(1).max(240).optional(),
...
.select('..., noshow_wait_city_min, noshow_wait_airport_min, payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails')
...
if (parsed.data.noshow_wait_city_min !== undefined) { updates.noshow_wait_city_min = parsed.data.noshow_wait_city_min }
```
Four touch points per new column: zod field, `refine` any-field list, GET select + response, PATCH `updates` copy. Add the WR-06 cross-check (`airport >= city`) while in the file. `CardFlowSettings.tsx`: add `on` to the mode control (D-17, owner flips).

---

### Admin fee/cash modals (component)

**Analog:** `components/admin/ConfirmNoShowModal.tsx` + `Modal.tsx`; styles from `adminFieldStyles.ts` (`errorStyle`, `focusRingHandlers`, `inputBaseStyle`). Render amounts with `formatMinor`, never typed `€` (CLAUDE.md pre-commit). Layout per `89-UI-SPEC.md` Surfaces 3-5. `BookingsTable.tsx` cancel modal (~2967-3015) gets the "Cancelled by" radio (default Prestigo); update `tests/admin-bookings-cancel.test.ts`.

---

### Checkout / cash mode (mod)

`lib/payments/checkout.ts` lines 148/160/163 (`payment_mode:'card_hold'`, `captureUnpaidBooking(row, attemptId, 'outbound', 'card_hold')`, `existing.payment_mode !== 'card_hold'`) -> `cash_guarantee` branch, always SetupIntent, `hold_at: null`. `lib/supabase.ts` `flowConflict` / `captureUnpaidBooking` flow union: make symmetric across `pay_now | card_hold | cash_guarantee`. `lib/stripe-webhook/card-confirm.ts` `applySetupSucceeded`: skip `hold_scheduled` for cash; `card_saved:cash` email variant. `claim_due_payment_work` (085:476 `WHERE b.payment_mode = 'card_hold'`) stays untouched: that is the DB guarantee of no hold on cash. Consent: bump `CARD_CONSENT_VERSION` (`lib/payments/consent-text.ts:21`, now `2026-11-draft-1`) + digest pin in `tests/payments-consent.test.ts`; add `consentCash` text covering D-10/D-21 charging the saved card.

---

## Shared Patterns

### Admin auth + body guards
**Source:** `app/api/admin/bookings/cancel/route.ts:80-99`
**Apply to:** `fee`, cancel, settings routes.
```typescript
const { user, error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const tooBig = enforceMaxBody(request, 10_000)
if (tooBig) return tooBig
```

### Partner/GNet money gate
**Source:** `lib/payments/settle.ts:416-424`
**Apply to:** orchestrator, fee route, driver cash action, manage-token creation (RESEARCH Pitfall 15), plus a table-driven test over all entry points.
```typescript
try { assertMoneyEligible({ booking_source: typeof loaded.booking_source === 'string' ? loaded.booking_source : null }) }
catch (err) { if (err instanceof PartnerBookingMoneyError) return { outcome: 'skipped', code: 'partner_booking' }; throw err }
```

### Single writer of `payment_state` / ledger
**Source:** `lib/payments/state.ts` (`applyTransition`, `appendPaymentEvent`). `tests/payment-state-writers-gate.test.ts` fails if any other file names the RPCs or writes `payment_state`. `booking_fee_cases` writes go through `lib/payments/fee.ts` only.

### Exactly-once client email and operator alert
**Source:** `lib/payments/emails/send.ts` (`sendPaymentEmail`, `deliverOnce`), `lib/payments/alerts.ts` (`OPERATOR_ALERT_KINDS`, `sendPaymentOperatorAlert(kind, booking, { eventKey, code, amountMinor, note })`). New alert kinds (`fee_pending_24h`, `cash_unconfirmed` is NOT alerted per D-21, `change_request`) get an entry in `OPERATOR_ALERT_KINDS` and `TITLES`. Keys: `alert:<kind>:<bookingId>[:<n>]`. Copy files in booking language via the `PaymentEmails` catalog (7 locales).

### Status writes
**Source:** `lib/booking-status-service.ts` `advanceBookingStatus` with `profile: 'cancel-route'` (no side effects inside). Never `.update({ status })`.

### Stripe key / error helpers
**Source:** `lib/payments/stripe.ts` (`getPaymentsStripe`, `stripeErrorCode`, `stripeKeys`). Refund key `stripeKeys.refund(id, legKey)`; add fee keys derived from `caseId`.

### i18n and pricing rules
Real translations for ru, es, fr, ar, hi, zh with every new `messages/en.json` key (CLAUDE.md; translate in-session; never `i18n-translate.mjs --dry-run`). Public wording inventory with files and pinning tests: RESEARCH Pattern 8 (terms, faq, book, routes, contact, services, llms-content, blog, admin modal). Pages use `params.locale` + `setRequestLocale`.

### Test scaffolding
**Source:** `tests/helpers/fake-payments-db.ts` (`FAKE_PAYMENT_VOCABULARY`), `tests/helpers/fake-stripe.ts` (models partial capture and partial refunds), `tests/admin-bookings-cancel.test.ts`, `tests/payments-settle.test.ts`, `tests/payments-migration-08{5,6}.test.ts`. Use `vi.hoisted` per project testing memory. Tests that encode old rules and must be changed on purpose: RESEARCH Pitfall 8 list.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/api/account/bookings/cancel/route.ts` | controller | request-response | No signed-in-client mutation route exists; only read-only `account/trips`. Combine session client from `app/[locale]/account/trips/page.tsx` (`createClient`, `supabase.auth.getUser()`, `eq('user_id', user.id)`) with the orchestrator; mint token with the service client after the ownership check. |
| `lib/payments/emails` fee wording | service | event-driven | `lib/payments/emails/render.ts` header and `tests/payments-copy-i18n.test.ts` FORBID fee wording today (Phase 88 guard): replace with a positive allow-list, do not delete. |

## Metadata

**Analog search scope:** `lib/`, `lib/payments/`, `app/api/admin/`, `app/api/driver/`, `app/(internal)/driver/`, `app/[locale]/account/`, `components/admin/`, `supabase/migrations/`, `tests/`, `middleware.ts`, `next.config.ts`
**Files read this pass:** CONTEXT, RESEARCH (lines 1-456 of 676; later sections are code examples/open questions), cancel route, `actions.ts`, `timing.ts`, `trip-token.ts`, payment route, `NoShowWaitSettings.tsx`, `driver-trip-step.ts` (schema), progress route, migrations 085/086 excerpts, `state.ts`, settings route greps. UI-SPEC headings only (surfaces 1-8); planner must read it for layout.
**Tracked-source check:** all analog paths confirmed via `git ls-files` (lib/trip-token.ts, settle.ts, no-show.ts, settings route, account trips page, emails/send.ts, CardFlowSettings.tsx, test helpers).
**Pattern extraction date:** 2026-11-06
