# Phase 94: Driver Cabinet - Research

**Researched:** 2026-11-25
**Domain:** Passwordless driver sign-in (email OTP), per-driver data access, ride list / offers UI, reuse of the Phase 87 trip screen, web push + PWA, inside Next.js App Router (16.2.3) / Supabase / Resend / Vercel
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; Supabase Auth session limits and iOS push behaviour MEDIUM; two items need a live spike, see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (ROADMAP / Phase 87 — not re-asked)**
- **D-01:** Ride detail reuses the Phase 87 trip screen (`app/(internal)/driver/trip/[token]`: map, bottom sheet, slide-to-advance, confirm dialog, no-show request, help chat, Google Maps / Waze chooser). The Phase 87 header's reserved back slot now returns to the ride list. All status changes keep going through the Phase 87 status service (`lib/booking-status-service.ts`); the cabinet never writes `bookings` directly.
- **D-02:** Light theme always, mobile-first, Prestigo branding (Phase 87 D-19). The Blacklane driver app screenshots are a layout reference only: no names, assets or look-alike branding.
- **D-03:** Ride list row: time, pickup → drop-off, passenger first name, vehicle plate or "Pending", vehicle class; Upcoming / Past tabs, grouped by day (ROADMAP scope).
- **D-04:** Security-relevant phase: new driver authentication and per-driver data access; commits use the `security:` prefix. A driver can read only their own assignments and the bookings behind them.

**Sign-in and accounts**
- **D-05:** Sign-in is by **email one-time code** (6 digits), no passwords. The session lasts long on the phone (about 30 days, then a new code). — **Reversibility:** costly — the auth path, session handling and the invite flow depend on it.
- **D-06:** **Only the operator creates driver accounts**, in the admin (the existing drivers list): adding or inviting a driver lets that email sign in; there is no self-registration. **Disabling a driver removes access at once**, including sessions already open. The 4 existing drivers (all with an email) get invited, not re-created.
- **D-07:** Driver identity must not mix with customer or admin identity: a driver session never grants admin rights (`app_metadata.is_admin`), and the customer account pages do not treat a driver as a customer. Mechanism (Supabase Auth user linked to `drivers`, role claim, separate cookie scope) is Claude's call within this rule.

**Offers**
- **D-08:** An offer goes to **one driver at a time, as today**: the operator picks the driver in the admin; the offer appears in that driver's **Offers** tab; the driver accepts or declines; on decline the operator assigns someone else. Accept / decline keep today's effects (assignment status, the accepted-trip email, the decline notification to the operator).
- **D-09:** The driver learns about a new offer by **email and web push**. The email links into the cabinet's Offers tab (signing in first when needed). Web push works once the driver adds the cabinet to the phone home screen (PWA: Android, iOS 16.4+); the cabinet asks for permission and explains how to add it to the home screen. Push is a convenience; email always goes out. — **Reversibility:** reversible.
- **D-10:** An offer the driver has not answered stays in Offers until the operator reassigns or cancels it (no automatic expiry is introduced unless today's `token_expires_at` already applies; planner keeps the existing expiry behaviour).

**What the driver sees**
- **D-11:** The driver sees **their own fee** (`bookings.driver_price_czk`, CZK) in the offer before accepting, on the ride, and a monthly total on Past. The client's price, payments and deposits are never shown. Only 5 of the last 78 bookings have a driver fee set: when it is empty, nothing is shown (no "0 CZK").
- **D-12:** Passenger data follows the Phase 87 trip screen (name and phone on the ride the driver accepted); an offer that is not accepted yet shows only first name, time, route, class and fee.
- **D-13:** Profile ("You"): name, phone, email, vehicle (`drivers.vehicle_info`); simple stats (rides completed, share of offers accepted); Help (the same Chatwoot chat as the trip screen); Sign out. **No rating, no documents** in this phase.

**Language and old links**
- **D-14:** Cabinet in **English only**, like the trip screen.
- **D-15:** **Both ways stay**: the per-assignment email links (`/driver/response` accept / decline and `/driver/trip/[token]`) keep working permanently as a fallback (for example a one-off driver without an account), alongside the cabinet. Emails to drivers with an account lead into the cabinet; the token links keep their own rules (expiry, terminal statuses).

### Claude's Discretion
- Auth mechanism (Supabase Auth email OTP vs a driver-only OTP table), session cookie scope and the "revoke on disable" mechanism, as long as D-05..D-07 hold.
- Web push stack (VAPID keys, service worker, subscription table, sending library) and the PWA manifest/icons.
- Where the cabinet lives (`/driver` routes inside `app/(internal)`), navigation (bottom tabs Rides / Offers / You), empty and loading states, how Past paginates.
- How "vehicle plate" is derived from `drivers.vehicle_info` (free text today) or whether a plate field is added.
- How the accept / decline action in the cabinet and in the token route share one code path.
- Rate limiting of the code request and code verification.

### Deferred Ideas (OUT OF SCOPE)
- Driver rating by clients after the trip (new client-facing feature).
- Driver documents with expiry dates and reminders.
- Offering one ride to several drivers, first to accept wins.
- Cabinet in Russian / Czech.
</user_constraints>

<phase_requirements>
## Phase Requirements

The roadmap lists "Requirements: TBD". These IDs are PROPOSED here (prefix `DCAB`) from CONTEXT D-01..D-15 so plans can map to them; the orchestrator should add them to `.planning/REQUIREMENTS.md` (no `DCAB` id exists today, verified by grep of REQUIREMENTS.md / STATE.md / PROJECT.md).

| ID | Description | Decisions | Research Support |
|----|-------------|-----------|------------------|
| DCAB-01 | A driver requests a 6-digit email code and signs in with it; unknown / not-invited / disabled emails get the same generic answer and no email; code is single-use, 10 min, max 5 wrong tries, rate limited | D-05, D-06 | Custom OTP + opaque session (Standard Stack, Pattern 1), `consume_driver_login_code` RPC, rate-limit keys |
| DCAB-02 | Session lasts 30 days in an httpOnly cookie, survives phone restarts, sign-out ends it everywhere on that device | D-05 | `driver_sessions` table, cookie spec (Pattern 1) |
| DCAB-03 | Operator invites / disables a driver in the admin drivers list; disable ends open sessions on the very next request and removes push subscriptions; existing 4 drivers are invited, not re-created | D-06 | `drivers.cabinet_enabled`, admin route `/api/admin/drivers/[id]/cabinet`, request-time gate (Pitfall 2) |
| DCAB-04 | Driver identity is isolated: no Supabase Auth session is created, no `is_admin`, `/admin` and `/account` never read the driver cookie; a driver who is also a customer/admin keeps both | D-07 | Custom cookie name, no `auth.users` row (Pattern 1, Pitfall 1) |
| DCAB-05 | Every cabinet read/write is filtered by the session driver id; another driver's assignment id returns the same uniform 404; selects never name client price / payment / email columns | D-04, D-11, D-12 | Data-access layer `lib/driver-cabinet/`, grep-gate tests (Pattern 2) |
| DCAB-06 | Rides tab: Upcoming / Past, grouped by Prague day, row = time, pickup → drop-off, first name, plate or "Pending", class; Past paginated by month with the month's fee total | D-03, D-11 | Query + partition rules (Pattern 3), `vehicle_plate` column |
| DCAB-07 | Offers tab lists the driver's pending offers that are still the newest assignment of a live booking, showing first name, time, route, class, fee (omitted when null); accept / decline | D-08, D-10, D-11, D-12 | Offer predicate (Pitfall 3) |
| DCAB-08 | Cabinet accept/decline and `/api/driver/respond` share one function with the same effects (status, accepted-trip email, decline notice to operator); cabinet accept burns the email token | D-08, D-15 | `lib/driver-offer.ts` extraction (Pattern 4) |
| DCAB-09 | Ride detail at `/driver/rides/[assignmentId]` renders the Phase 87 trip screen with a Back link to the list and the driver fee row; all steps still go through the token-gated progress route and the status service | D-01, D-02, D-11, D-14 | Shared trip loader (Pattern 5), fee guard (Pitfall 6) |
| DCAB-10 | You tab: name, phone, email, vehicle, rides completed, offers accepted share, Help chat, push toggle + home-screen hint, Sign out | D-13 | Session help route (Pattern 6) |
| DCAB-11 | Offer email to a cabinet driver leads into `/driver/offers`; drivers without a cabinet keep today's Accept / Decline / trip links unchanged | D-09, D-15 | Email branch (Pattern 4) |
| DCAB-12 | Web push: VAPID keys, `driver_push_subscriptions`, send on assignment creation (non-fatal, 404/410 pruned), PWA manifest + `/driver/sw.js`, iOS home-screen explanation | D-09 | Pattern 7, Pitfalls 8-10 |
| DCAB-13 | Hardening: new CSRF prefix (strict Origin), rate limits (fail-closed on auth), `enforceMaxBody`, RLS deny-all on every new table, `worker-src 'self'`, no-store on cabinet pages, `security:` commits | D-04 | Security Domain |
</phase_requirements>

## Summary

The cabinet is mostly new UI over data that already exists. The hard, risky part is the authentication layer; everything else (lists, offers, trip detail reuse, push) is composition of existing patterns. Three codebase facts shape the design: (1) every driver surface today is unauthenticated and token-gated and uses the **service-role** client with explicit filters (there is no RLS-based access anywhere for drivers), (2) the admin and customer sessions are Supabase Auth cookies refreshed in `lib/supabase/middleware.ts`, and (3) `drivers` and `driver_assignments` have no "active" or "account" concept, no `auth.users` link and `drivers.email` is `UNIQUE`.

**Recommended auth mechanism: a driver-only OTP table plus an opaque server-side session table, NOT Supabase Auth.** Reasons, each tied to a locked decision: D-05 wants an *absolute* ~30-day session, but Supabase refresh tokens never expire and "time-box" / "inactivity timeout" are Pro-plan only [CITED: supabase.com/docs/guides/auth/sessions]; D-06 wants disable to cut open sessions *at once*, but a Supabase JWT stays valid until its `exp` (up to 1 h) after revocation, so a per-request DB gate would be needed anyway; D-07 is structurally guaranteed when a driver has **no `auth.users` row at all** (cannot collide with the customer/admin identity of the same email, cannot carry `is_admin`, cannot reach `/account`); and Supabase's email template for OTP is the shared Magic Link template, so showing `{{ .Token }}` would change every customer magic-link email [CITED: supabase.com/docs/guides/auth/auth-email-passwordless]. The custom path is ~4 small modules (code issue, code verify RPC, session create/lookup, sign-out), uses `node:crypto` only, and sends the code through the existing Resend pipeline. The Supabase-Auth alternative is documented under Alternatives with its concrete gaps; the owner/planner should confirm the pick because D-05 is marked "costly" to reverse.

Per-driver access (D-04) is enforced the way the whole driver surface already works: service-role reads inside one data-access module that takes the **session's driver id** as a mandatory argument, with grep-gate tests and RLS deny-all on all new tables. RLS-by-`auth.uid()` is not available (and not wanted) without a Supabase identity.

Ride detail reuses the trip screen by having the session-authenticated page resolve `assignmentId` + session driver id → `trip_token` server-side and render the **same** trip-screen loader with `token={trip_token}`; the browser then keeps calling the unchanged token-gated, CSRF-protected `/api/driver/trip/[token]/*` routes. No second write path, no duplicated screen. Web push uses the `web-push` library (pin 3.6.7, see legitimacy audit), a static service worker at `/driver/sw.js` (scope limited to `/driver/`, so the public site is untouched), a driver-scoped manifest, and an explicit `worker-src 'self'` in the nonce CSP.

**Primary recommendation:** Build the cabinet as `app/(internal)/driver/(cabinet)/…` with a custom OTP + `driver_sessions` auth module and a single `requireDriver()` data-access gate called by every page and route; extract the offer-response logic into `lib/driver-offer.ts` shared by the token route and the cabinet; extract the trip page body into a shared loader reused by `/driver/rides/[assignmentId]`; add `web-push@3.6.7` for push; migration 100 adds the columns/tables below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OTP issue / verify, session creation | API / Backend (route handlers, service role) | Database (atomic RPC) | Secrets, hashing and rate limits must be server-side; the single-use + attempt-cap check must be atomic in one SQL statement |
| Session validation + revoke-on-disable | API / Backend (`requireDriver()` on every request) | Database (`driver_sessions`, `drivers.cabinet_enabled`) | A DB gate per request is the only way disable is immediate (no JWT lifetime) |
| Per-driver data filtering | API / Backend (data-access module) | Database (RLS deny-all as backstop) | Whole driver surface uses service role; the filter lives in one module, the backstop blocks anon-key PostgREST access |
| Rides / Offers / You pages | Frontend Server (SSR server components) | Browser (small client islands: tabs refresh, accept/decline buttons, push toggle) | Data is private and per-request; no static caching; client only for interaction |
| Accept / decline | API / Backend (shared `lib/driver-offer.ts`) | — | One code path for token and session callers |
| Trip steps | API / Backend (existing token-gated progress route + status service) | Browser (existing TripScreen) | Unchanged; cabinet never writes `bookings` |
| Web push send | API / Backend (`after()` in assign route) | External push service (FCM / Mozilla / `*.push.apple.com`) | VAPID private key only on the server |
| Push subscribe, notification display | Browser (service worker + Push API) | API (store subscription) | Browser owns permission and subscription |
| PWA manifest, service worker | CDN / Static (`public/driver/sw.js`) + route handler (manifest) | — | Scope `/driver/` keeps public site unaffected |
| Invite / disable driver | API / Backend (`/api/admin/drivers/[id]/cabinet`, admin-guarded) | Browser (admin drivers page buttons) | Existing admin CRUD pattern |

## Standard Stack

### Core (no new runtime dependency except web-push)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (built-in) | Node 24 (`.nvmrc`=24, local 24.14.1) | `randomInt` 6-digit code, `randomBytes` session token, `createHash('sha256')`, `timingSafeEqual` | No dependency; correct primitives for OTP/session |
| `@supabase/supabase-js` service client via `createSupabaseServiceClient()` | lockfile 2.103.0 | All cabinet DB access | Existing convention for every driver route [VERIFIED: lib/supabase.ts:5-16] |
| `resend` via existing `getResend()` in `lib/email.ts` | ^6.9.4 | OTP email, invite email | Existing pipeline, from `PRESTIGO Bookings <bookings@rideprestigo.com>` |
| `zod` | 4.3.6 | Request schemas (uuid, email, push subscription) | Existing convention |
| `web-push` | **3.6.7 (exact pin)** | VAPID Web Push payload encryption + send | Standard library named by the Next.js PWA guide [CITED: nextjs.org/docs/app/guides/progressive-web-apps]; do not hand-roll aes128gcm |
| `next` | 16.2.3 | `after()`, route handlers, metadata | Existing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^1.6.0 | Tab icons (CalendarDays, Inbox, User) | Bottom tab bar, same set as TripScreen |
| `lib/prague-date.ts` / `lib/prague-calendar.ts` | in-repo | Prague day grouping, `pickupInstantMs`, `pragueDateOf` | Group rides by Prague day; month boundaries (DST-safe) |
| `lib/rate-limit.ts` | in-repo | Fixed keys + `failClosed` | Code request / verify / respond limits |
| `lib/request-guards.ts` (`enforceMaxBody`, `safeEmail`, `safeString`) | in-repo | Body size, email validation | Every new POST route |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom OTP + `driver_sessions` | Supabase Auth email OTP (`signInWithOtp` + `verifyOtp`, session cookie via `@supabase/ssr` with `cookieOptions.name`) | Gets battle-tested OTP generation and refresh handling, but: (a) no absolute 30-day timebox without the Pro plan [CITED: supabase.com/docs/guides/auth/sessions]; (b) JWT outlives revoke up to 1 h, so a per-request `drivers` gate is needed anyway; (c) the OTP email is the shared Magic Link template, editing it affects customers [CITED: supabase.com/docs/guides/auth/auth-email-passwordless] (workaround: `auth.admin.generateLink({type:'magiclink'})` returns `email_otp` without sending, then send via Resend [CITED: supabase-js auth-js types `GenerateLinkProperties`], untested on the live project); (d) driver and customer/admin share one `auth.users` row per email, so isolation needs a second cookie name AND a second `createServerClient` + refresh in `lib/supabase/middleware.ts`; (e) `last_sign_in_at`-based absolute expiry is unverified. Choose only if the owner wants "no custom auth code" over the five points above. |
| `web-push` 3.6.7 | `web-push` 4.0.0 | 4.0.0 (ESM migration, published 2026-11-06) is flagged SUS "too-new" by the legitimacy seam; 3.6.7 is CJS, 22 months old, same API. Revisit 4.0.0 after it ages. |
| `web-push` | Hand-rolled Web Push (RFC 8291 aes128gcm + VAPID JWT) | Never; encryption/ECDH details are error-prone |
| Static `public/driver/sw.js` | Serwist / next-pwa | Overkill: only `push` + `notificationclick` handlers are needed, no offline caching |

**Installation:**
```bash
npm install --save-exact web-push@3.6.7
npm install --save-dev --save-exact @types/web-push@3.6.4
```

**Version verification (this session):**
```text
npm view web-push version            -> 4.0.0 (time: 2026-11-06T11:44:33.493Z; previous 3.6.7 on 2024-01-16)
npm view web-push@3.6.7 dependencies -> jws ^4.0.0, asn1.js ^5.3.0, http_ece 1.2.0, minimist ^1.2.5, https-proxy-agent ^7.0.0
npm view @types/web-push version     -> 3.6.4
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `web-push` (latest 4.0.0) | npm | first release years old; latest published 2026-11-06 | ~14.0M/wk | github.com/web-push-libs/web-push | SUS (`too-new`, seam run this session) | Do NOT install 4.0.0 |
| `web-push@3.6.7` (pinned) | npm | 2024-01-16 | same package | github.com/web-push-libs/web-push | not separately scored by the seam (it scores latest); no `postinstall` script; named in official Next.js PWA guide | Approved with a `checkpoint:human-verify` before install because the seam verdict for the package is SUS |
| `@types/web-push` 3.6.4 | npm | DefinitelyTyped | — | DefinitelyTyped | not run through the seam | Planner: run `gsd_run query package-legitimacy check --ecosystem npm @types/web-push` in the install task |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `web-push` (version 4.0.0 only; reason `too-new`). The planner inserts a `checkpoint:human-verify` before the install task and pins `3.6.7`.

## Architecture Patterns

### System Architecture Diagram

```
 Operator (admin)                          Driver phone (PWA / browser)
   |                                          |
   | Invite / Disable                         | 1 email -> POST /api/driver/cabinet/request-code
   v                                          |      -> rate limit (IP + hashed email, fail-closed)
 /api/admin/drivers/[id]/cabinet              |      -> drivers row? cabinet_enabled? else generic 200
   |  sets drivers.cabinet_enabled            |      -> insert driver_login_codes (hash) -> Resend code email
   |  disable: delete driver_sessions,        | 2 code  -> POST /api/driver/cabinet/verify
   |           delete push subscriptions      |      -> RPC consume_driver_login_code (atomic, 5 tries)
   |                                          |      -> insert driver_sessions(token_hash) -> Set-Cookie (30 d)
   | Assign driver to booking                 v
   v                                    /driver/(cabinet)/*  server components
 POST /api/admin/bookings/[id]/assign         |  requireDriver(): cookie -> hash -> driver_sessions JOIN drivers
   |  insert driver_assignments               |      (expires_at, revoked, cabinet_enabled checked EVERY request)
   |  status service (unchanged)              |  lib/driver-cabinet/queries.ts (service role, driver_id mandatory)
   |  after():                                |
   |   - email: cabinet driver -> link to     +--> Rides (Upcoming/Past by Prague day, Past by month)
   |            /driver/offers ; else old     +--> Offers (pending, newest-of-booking) --accept/decline-->
   |            Accept/Decline/trip links     |        POST /api/driver/cabinet/offers/[id]/respond
   |   - push: web-push to each               |            -> lib/driver-offer.ts respondToOffer()  <--+
   |            driver_push_subscriptions     |                                                        |
   |            (404/410 -> delete)           +--> You (profile, stats, Help, push toggle, sign out)   |
   v                                          +--> /driver/rides/[assignmentId]                        |
 Push service (FCM / Mozilla / Apple)               -> resolve trip_token server-side                  |
   |                                                -> shared trip loader -> <TripScreen token backHref>|
   v                                                -> browser calls EXISTING /api/driver/trip/[token]/*|
 /driver/sw.js  (push -> showNotification;          (token-gated, CSRF, status service)               |
  click -> openWindow('/driver/offers'))                                                              |
                                                                                                      |
 Old email links (fallback, D-15):  /driver/response?token=..  -> POST /api/driver/respond -------------+
                                    /driver/trip/[trip_token]  -> unchanged page
```

### Recommended Project Structure
```
app/(internal)/driver/
├── (cabinet)/                      # NEW route group: light theme + auth-gated tabs
│   ├── layout.tsx                  # imports admin-theme.css + driver-trip.css, data-admin-theme="light", metadata.manifest
│   ├── (tabs)/
│   │   ├── layout.tsx              # bottom tab bar + offers badge (no auth logic only)
│   │   ├── rides/page.tsx          # Upcoming / Past
│   │   ├── offers/page.tsx
│   │   └── you/page.tsx
│   └── rides/[assignmentId]/page.tsx   # ride detail = shared trip loader (no tab bar, full-screen like trip)
├── page.tsx                        # /driver -> redirect('/driver/rides') (no /driver page exists today)
├── login/page.tsx                  # public: email -> code (client island), NOT inside the gated group
├── response/                       # existing, untouched look (D-15)
├── trip/                           # existing, TripScreen gets optional backHref + driverFee props
└── manifest.webmanifest/route.ts   # driver-scoped manifest
app/api/driver/cabinet/
├── request-code/route.ts
├── verify/route.ts
├── sign-out/route.ts
├── offers/[assignmentId]/respond/route.ts
├── push/route.ts                   # POST subscribe / DELETE unsubscribe
└── help/route.ts                   # session-gated Chatwoot identity (You tab)
app/api/admin/drivers/[id]/cabinet/route.ts   # POST {action:'invite'|'disable'|'enable'}
lib/driver-cabinet/
├── auth.ts                         # issueCode, verifyCode, createSession, requireDriver, getDriverSession, destroy
├── queries.ts                      # listRides, listOffers, getRideForDriver, stats (driverId mandatory)
├── push.ts                         # sendOfferPush(driverId, payload), pruneDead
└── format.ts                       # row view-model (first name, plate or "Pending", fee label)
lib/driver-offer.ts                 # respondToOffer({assignmentId, action, caller}) shared with /api/driver/respond
lib/driver-trip-page.tsx            # shared server loader extracted from trip/[token]/page.tsx
public/driver/sw.js                 # service worker (push + notificationclick only)
public/driver/icons/                # 192, 512, maskable, apple-touch-icon
supabase/migrations/100_driver_cabinet.sql
```

Route-group note: a bare `/driver` page must exist (redirect to `/driver/rides`); today `/driver` has no page. Static segments `login`, `rides`, `offers`, `you` do not collide with `trip` and `response`.

### Pattern 1: Driver auth module (custom OTP + opaque session)
**What:** `request-code` issues a code only for `drivers` rows with `cabinet_enabled = true`, always answers the same 200. `verify` calls one atomic RPC; on success it creates a session row and sets the cookie. `requireDriver()` is the only way pages and routes obtain a driver id.
**Cookie:** name `prestigo_driver_session`; value = 32 random bytes base64url; DB stores only `sha256(value)`; `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'` (NOT strict: the email deep link to `/driver/offers` is a cross-site top-level navigation and a strict cookie would not be sent), `path: '/'`, `maxAge: 30 days`; `expires_at` stored server-side = absolute 30 days (no sliding, matches D-05 "then a new code").
**Code:** `String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')`; stored as `sha256(`${codeRowId}:${code}`)`; valid 10 min; max 5 wrong attempts; consumed once.
**Request-time gate (immediate revoke, D-06):**
```typescript
// lib/driver-cabinet/auth.ts  (server-only) — shape, not final code
export async function getDriverSession(): Promise<{ driverId: string; sessionId: string } | null> {
  const raw = (await cookies()).get(DRIVER_SESSION_COOKIE)?.value
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('driver_sessions')
    .select('id, driver_id, expires_at, revoked_at, drivers!inner(cabinet_enabled)')
    .eq('token_hash', sha256Hex(raw))
    .maybeSingle()
  // reject: no row, revoked_at set, expires_at <= now, drivers.cabinet_enabled = false
  ...
}
export async function requireDriver(next?: string): Promise<{ driverId: string }> {
  const s = await getDriverSession()
  if (!s) redirect(`/driver/login${safeDriverNext(next)}`)
  return s
}
```
**When to use:** every page, every route handler of the cabinet. Never rely on a layout alone (Pitfall 4).
**Source:** pattern follows `getAdminUser()` [VERIFIED: lib/supabase/server.ts:5-10] but is DB-backed.

### Pattern 2: Per-driver data-access module (D-04, D-11, D-12)
**What:** `lib/driver-cabinet/queries.ts` exports functions whose first parameter is `driverId: string` (from `requireDriver()`), and every query contains `.eq('driver_id', driverId)` on `driver_assignments`. Selects are explicit column lists that never contain `amount_eur`, `amount_czk`, `payment_*`, `client_email`, `client_phone` (phone only in the accepted-ride detail, which goes through the trip loader, not these queries). Unknown / other-driver `assignmentId` → the same `notFound()` view as a missing one.
**Columns safe for lists:** `driver_assignments(id, status, created_at, booking_id)` + `bookings!inner(id, booking_reference, status, driver_id, pickup_utc, pickup_date, pickup_time, origin_address, destination_address, client_first_name, vehicle_class, driver_price_czk)` + `drivers(vehicle_plate)`.
**Volume:** live data is 4 drivers, 51 assignments total [CITED: 94-CONTEXT.md code_context]; fetch the driver's assignments with `.limit(500)` and partition in memory. No SQL pagination machinery needed; Past is paged by month (below).
**Backstop:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` with no policy on all new tables (precedent: migration 057 `booking_edit_audit_log`) [VERIFIED: supabase/migrations/057_security_rls_hardening.sql:10-11 "ALTER TABLE public.booking_edit_audit_log ENABLE ROW LEVEL SECURITY;"]. RLS state of `drivers` / `driver_assignments` today is not recorded in the repo (tables were created outside `supabase/migrations`); migration 100 should enable RLS on both idempotently (no policy = deny-all for anon/authenticated; service role bypasses) [ASSUMED current state].

### Pattern 3: Ride list rules
- **Upcoming:** assignments of this driver where `driver_assignments.status = 'accepted'` AND the assignment is the newest for its booking AND booking status is not terminal (`completed|cancelled|no_show`, [VERIFIED: lib/booking-status.ts:35-39 `TERMINAL_BOOKING_STATUSES` = completed, cancelled, no_show]), sorted ascending by `pickupInstantMs`. Include a `pending` assignment whose booking has already moved to `en_route|on_location|on_board` (the driver started via the old trip link without accepting; otherwise the ride vanishes from every tab).
- **Past:** accepted assignments whose booking status is terminal; `cancelled` shown with a "Cancelled" badge (the driver must learn it was cancelled); month selector (Prague month), newest first; **month total = sum of `driver_price_czk` over `completed` rides in that Prague month** (use `pragueDateOf` / month prefix of `pickup_date`); no total line when the sum has no priced ride (no "0 CZK", D-11).
- **Grouping:** by Prague date (`pickup_date`), day header like "Today / Tomorrow / Fri 27 Nov"; time = `pickup_time` (Prague wall clock already).
- **Plate:** add `drivers.vehicle_plate text` (admin form field, migration 100); row shows the plate, else the literal "Pending". Do not parse `vehicle_info` free text.
- **Class:** `formatVehicleLabel(vehicle_class)` from `lib/email.ts` (already used by the trip page).
- **Fee:** `formatCZK(driver_price_czk)` from `lib/currency.ts` [VERIFIED: lib/currency.ts:5 `formatCZK(amount: number): string { return \`${amount.toLocaleString('cs-CZ')} Kč\` }`] only when `driver_price_czk` is a positive integer; never `formatEUR`; no `€` literal in `app/` or `components/` (CLAUDE.md hard rule).

### Pattern 4: One accept/decline code path (D-08, D-15, DCAB-08, DCAB-11)
**Today** [VERIFIED: app/api/driver/respond/route.ts:36-81]: look up by `token`; reject when `token_used_at` set or `token_expires_at` past; atomic `update({ status: action, token_used_at: now }).eq('id').gt('token_expires_at', now).is('token_used_at', null)`; on `declined` → `sendDriverDeclineNotification` in `after()`; on `accepted` → `sendDriverAcceptedTripEmail(assignment.id)` in `after()`.
**Extract** `lib/driver-offer.ts`:
```typescript
export type OfferCaller =
  | { kind: 'token'; token: string }                 // email link: keeps expiry + single use
  | { kind: 'session'; driverId: string }            // cabinet: ownership + newest-of-booking
export async function respondToOffer(
  supabase: ServiceClient, input: { assignmentId?: string; action: 'accepted'|'declined'; caller: OfferCaller },
): Promise<{ ok: true; assignmentId: string; afterEffects: () => Promise<void> } | { ok: false; error: 'invalid_token'|'not_found'|'not_pending'|'superseded'|'used' }>
```
- Token caller: identical guards to today (uniform `invalid_token` / `used` errors preserved, anti-enumeration).
- Session caller: assignment must belong to `driverId`, be `pending`, be the newest assignment of its booking, booking not terminal; **ignore `token_expires_at`** (D-10: the cabinet offer stays until reassigned/cancelled; see Open Question 1) but **set `token_used_at = now`** so the emailed link reads "used" afterwards.
- Both: the write is `update({status, token_used_at}).eq('id').eq('status','pending')` plus the caller-specific guards; effects (decline notice, accepted-trip email) are returned as one closure the route runs in `after()`.
- `/api/driver/respond` becomes a thin adapter; its tests (`tests/admin-assignment.test.ts`, `tests/driver-accept-email.test.ts`) must stay green unchanged.
**Email branch (DCAB-11):** in `app/api/admin/bookings/[id]/assign/route.ts` the existing `after(() => sendDriverAssignmentEmail({...acceptUrl, declineUrl, tripUrl}))` gets a cabinet variant when the driver row has `cabinet_enabled`: single CTA to `${siteUrl}/driver/offers`, no Accept/Decline buttons (assumption, Open Question 2); the email also fires the push. The assign route must read `cabinet_enabled` in its existing driver select (`'id, name, email'` today [VERIFIED: app/api/admin/bookings/[id]/assign/route.ts:52]).

### Pattern 5: Trip screen reuse (D-01, DCAB-09)
1. Extract the body of `app/(internal)/driver/trip/[token]/page.tsx` (token validation → one join → `tripLinkViewState` → `buildTripView` / `getNoShowView` / stops / thresholds → `<TripScreen/>`) into `lib/driver-trip-page.tsx` as `async function TripScreenForToken({ token, backHref?, showDriverFee? })`. The token page calls it with no options (rendering and its existing tests unchanged).
2. New page `/driver/rides/[assignmentId]`: `requireDriver()` → read `driver_assignments` where `id = assignmentId AND driver_id = driverId` selecting `trip_token` → if none, the uniform not-found view → `return <TripScreenForToken token={trip_token} backHref="/driver/rides" showDriverFee />`.
3. `TripScreen` gets two optional props: `backHref?: string` (renders a Back link in the header slot reserved by the comment `D-18: Help only. No Back in Phase 87 (the back slot is reserved for the Phase 94 ride list).` [VERIFIED: TripScreen.tsx:553]) and `driverFee?: string | null` (a pre-formatted label, like the existing `cash` label pattern, never a number).
4. All writes stay on `POST /api/driver/trip/${token}/progress` (CSRF prefix `/api/driver/trip`, rate limit key `/api/driver/trip/progress`, status service). The `trip_token` reaches the browser exactly as it does on the token page today; the cabinet address does not contain it.
5. `InvalidTripLinkView` for the cabinet detail should link back to the list (small optional prop).
**Do not** add session auth to the progress route; keeping it token-only means zero change to the Phase 87 security gates (`tests/driver-trip*.test.ts`, `tests/status-writers-gate.test.ts`).

### Pattern 6: You tab and Help
Help from the You tab has no booking, but `buildDriverWidgetConfig` requires a non-empty `bookingReference` (`if (!tripRef) return { enabled: false }` [VERIFIED: lib/chatwoot-identity.ts:107-108]). Add `POST /api/driver/cabinet/help` (session-gated, rate-limited like `/api/driver/trip/help`) that reuses the same env/inbox selection as the trip help route and passes a fixed reference such as `DRIVER-CABINET`. Extract the inbox-selection block (CHATWOOT_DRIVER_WEBSITE_TOKEN / CHATWOOT_DRIVER_WIDGET_HMAC_SECRET fallback to the Website pair) into a helper used by both routes. The tokenless page `/driver/trip/help` and `saveDriverHelpConfig` / `openDriverHelpPage` stay as they are. On sign-out also delete `cw_*` cookies (same shared-device rule as `customerSignOut`, T-77-20).
Stats (D-13): rides completed = accepted assignments whose booking is `completed`; offers accepted share = accepted / (accepted + declined) over this driver's answered assignments (pending excluded); show "—" when the denominator is 0.

### Pattern 7: Web push + PWA (D-09, DCAB-12)
- **Table** `driver_push_subscriptions(id uuid pk, driver_id uuid fk drivers on delete cascade, endpoint text unique not null, p256dh text not null, auth text not null, user_agent text, created_at, last_success_at, last_failure_at)`. Subscribe route upserts by `endpoint` and sets `driver_id` to the session driver (a phone handed to another driver follows the signed-in driver).
- **Send** `lib/driver-cabinet/push.ts` `sendOfferPush(driverId, {title, body, url})`: `webpush.setVapidDetails(subject, publicKey, privateKey)` per call from `readEnv`; `Promise.allSettled` over subscriptions; payload is time + route + class only (no passenger name, no fee: lock-screen exposure); options `{ TTL: 3600, urgency: 'high' }`; on `err.statusCode` 404 or 410 delete the row; any other error is logged without endpoint/keys; never throws into the assign response (call inside the existing `after()`).
- **Env (owner action):** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` form), plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for the browser. Generate with `npx web-push generate-vapid-keys` in the owner's terminal script (memory rule: secret-needing commands run in the owner's Terminal; Vercel secret writes need the owner). Push is skipped silently when the vars are absent (email still goes out), so the phase ships and tests without keys.
- **Service worker** `public/driver/sw.js` (static, no `importScripts`): `push` handler ALWAYS calls `showNotification` (user-visible requirement); `notificationclick` focuses an existing `/driver/*` window or `clients.openWindow(data.url)` restricted to same-origin `/driver/` paths. Register from the You/Offers client island with `navigator.serviceWorker.register('/driver/sw.js', { scope: '/driver/', updateViaCache: 'none' })`. Default scope of a worker at `/driver/sw.js` is `/driver/`, so the public site and `/admin` are untouched.
- **Manifest** via route handler `app/(internal)/driver/manifest.webmanifest/route.ts` (the root `app/manifest.ts` convention is site-wide, not wanted): `name: 'Prestigo Driver'`, `short_name: 'Prestigo'`, `start_url: '/driver/rides'`, `scope: '/driver/'`, `display: 'standalone'`, `background_color`/`theme_color` from the light palette tokens, icons 192/512 + maskable. Link it only from the cabinet layout metadata (`manifest`, `appleWebApp`, `icons.apple`) so public pages do not advertise it. Home-screen installation requires manifest + HTTPS [CITED: nextjs.org/docs/app/guides/progressive-web-apps].
- **iOS:** push works only for the web app added to the Home Screen, iOS/iPadOS 16.4+, manifest `display` standalone/fullscreen, permission requested from a direct tap, endpoints on `*.push.apple.com` [CITED: webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/]. The cabinet shows an "Add to Home Screen" hint (Share, then Add to Home Screen) before the enable button on iOS Safari (detect `standalone` via `matchMedia('(display-mode: standalone)')`; hide the push toggle until installed on iOS) and never auto-prompts.
- **CSP:** add `worker-src 'self'` to the nonce CSP of `/driver` (Pitfall 8). Push delivery itself is performed by the browser's push subsystem and needs no `connect-src` entry.

### Pattern 8: Admin invite / disable (D-06, DCAB-03)
`POST /api/admin/drivers/[id]/cabinet` body `{ action: 'invite' | 'disable' | 'enable' }`, guarded like the sibling routes (`enforceMaxBody`, `getAdminUser()`, uuid check) and automatically CSRF-protected by the `/api/admin` prefix with strict Origin.
- `invite`: requires `drivers.email`; sets `cabinet_enabled = true`, `cabinet_invited_at = now()`; sends a welcome email via Resend (link to `/driver/login`, "add to home screen" tip, no code yet).
- `disable`: `cabinet_enabled = false`; delete the driver's `driver_sessions`, `driver_login_codes` and `driver_push_subscriptions` rows. Effect on an open phone is immediate because `requireDriver()` joins `drivers.cabinet_enabled` on every request.
- Admin UI: `DriversTable` gets a status chip (Not invited / Invited / Disabled) and Invite / Disable buttons; `DriverForm` gets a `vehicle_plate` field; `driverPatchSchema` / `driverCreateSchema` in the two existing routes get the optional field. Existing `GET` uses `select('*')` so new columns flow through.
- Disabling does not stop the operator assigning the driver nor the token links (D-15). See Open Question 3.

### Anti-Patterns to Avoid
- **Layout-only auth gate:** App Router layouts do not re-run on client-side navigation between their children; every page and route must call `requireDriver()` itself.
- **Creating a Supabase Auth user for drivers** (or reusing `getAdminUser()` style checks): reintroduces the D-07 collision (same email as customer/admin).
- **Putting `driver_assignments.token` or `trip_token` in a URL the cabinet exposes or in logs/push payloads.** The cabinet address is `/driver/rides/<assignmentId>`; the push payload has no tokens.
- **A second write path for steps or accept/decline.** Steps stay token-gated through the status service; accept/decline goes through `respondToOffer` only.
- **Showing the client price / payment fields by widening a select.** Grep-gate the cabinet modules like `tests/driver-trip.test.ts:337`.
- **`logEmail` dedup for the OTP email:** it suppresses same-type sends for 10 minutes [VERIFIED: lib/email-log.ts "gte('sent_at', new Date(Date.now() - 10 * 60 * 1000)"], which would block a legitimate "resend code"; use the rate limiter instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Push encryption + VAPID JWT | aes128gcm / ECDH / ES256 code | `web-push` 3.6.7 | Cryptographic details, push-service quirks |
| Random code / token | `Math.random`, uuid as secret | `crypto.randomInt`, `crypto.randomBytes(32)` | CSPRNG required |
| Constant-time compare of secrets | `===` on hashes | `crypto.timingSafeEqual` on equal-length buffers (or compare inside the RPC) | Timing side channel |
| Atomic attempt counting / single use | read-then-write in JS | one SQL function (`consume_driver_login_code`) | Concurrent verify requests would both pass a JS check |
| Rate limiting | in-memory counters | `lib/rate-limit.ts` (Upstash, `failClosed: true`) | Serverless instances do not share memory |
| Prague day / month math | manual UTC offsets | `lib/prague-date.ts`, `lib/prague-calendar.ts` | DST-safe, already tested |
| Trip screen / steps | a second screen or a session-auth progress route | shared loader + existing token routes | Keeps Phase 87 security gates valid |
| Origin / CSRF check | per-route Origin parsing | `CSRF_PROTECTED_PREFIXES` in `middleware.ts` | One place, already tested |
| Email HTML | new layout system | the inline-style pattern + `emailLogoImg` in `lib/email.ts` | Brand consistency |

**Key insight:** the only genuinely new security-critical code is OTP verification and session lookup. Keep it to a handful of small, heavily tested functions and push the atomicity into SQL.

## Runtime State Inventory

> Not a rename/refactor phase. The one migration-like step is inviting the 4 existing drivers.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 4 existing `drivers` rows (all with email), 51 `driver_assignments` [CITED: 94-CONTEXT.md] | Data migration: operator clicks Invite per driver after deploy; `vehicle_plate` backfilled by hand in the admin form. Not a code edit. |
| Live service config | Vercel env: none of `VAPID_*` exist; Resend sender already configured | Owner adds 4 env vars (see Environment Availability). No Supabase Auth dashboard change is needed (custom path). |
| OS-registered state | None | None, verified: no new cron or scheduled task is needed |
| Secrets/env vars | New: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Owner-run terminal script generates and sets them |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Same-email identity collision (D-07)
**What goes wrong:** A driver whose email also belongs to a customer (or to the admin, e.g. the owner testing) signs in through Supabase Auth and replaces or merges that session.
**Why:** `auth.users` is one row per email. **How to avoid:** the custom path creates no `auth.users` row; cookie `prestigo_driver_session` is separate from `sb-<ref>-auth-token`; admin/customer code never reads it. Test: a request carrying only a driver cookie gets 401/redirect on `/admin` (`getAdminUser()` untouched) and `/account/trips`; a request with both cookies keeps both identities.
**Warning signs:** any import of `lib/supabase/server` inside `lib/driver-cabinet/`.

### Pitfall 2: Revoke lag
**What goes wrong:** Disabling a driver leaves the phone working until the session or JWT expires.
**How to avoid:** `requireDriver()` queries `driver_sessions` joined to `drivers.cabinet_enabled` on **every** request (one indexed query), and `disable` also deletes the session rows. The accept/decline, progress... note: the **trip progress route is token-gated, not session-gated**, so a disabled driver with a still-valid trip link can still advance an already-assigned trip. That is D-15 behaviour (token links keep working) and is documented in Open Question 3.
**Test:** disable between two requests with the same cookie, second request redirected/401.

### Pitfall 3: Offer visibility predicate (stale and superseded offers)
**What goes wrong:** Reassigning a booking creates a NEW `driver_assignments` row; the previous driver's row stays `pending` forever, and `bookings.driver_id` is **not** updated at all when the booking status is not `assigned` / not transition-eligible (see the code comment "status not in valid transition AND not 'assigned' (e.g. pending) — driver_assignments row is still created; bookings.status untouched" [VERIFIED: app/api/admin/bookings/[id]/assign/route.ts:~141-144]). A predicate "booking.driver_id = me" would hide valid offers; "status = pending" alone would show withdrawn ones.
**How to avoid:** an offer is shown iff `status='pending'`, `driver_id = me`, the booking is not terminal, and no assignment for the same `booking_id` has a later `created_at`. The same newest-of-booking check is used at accept time (`respondToOffer`).
**Also:** `driver_assignments.booking_id` is nullable (`ON DELETE SET NULL`) [CITED: 82-LIVE-SCHEMA.md "driver_assignments_booking_id_fkey ... ON DELETE SET NULL"], so always use `bookings!inner` and skip null.

### Pitfall 4: Layout auth bypass on soft navigation
**What:** Next.js layouts are not re-rendered on client navigation between sibling pages. **Avoid:** call `requireDriver()` in every page component and route handler (data-access layer), not only in `(cabinet)/layout.tsx`. A test asserts every file under `app/(internal)/driver/(cabinet)` and `app/api/driver/cabinet` references `requireDriver` / `getDriverSession` (except login, request-code, verify).

### Pitfall 5: Email deep link and cookies
A `SameSite=Strict` session cookie is not sent on the first navigation from the mail app, so the driver would see the login page despite a valid session. Use `Lax` and a `next` parameter: `/driver/login?next=/driver/offers`, validated by a `safeDriverNext()` that accepts only paths starting with `/driver/` (same idea as `safeAdminNext` [VERIFIED: lib/admin-next.ts:20 `export function safeAdminNext(raw: unknown): string | null`]), never `//`, never `/driver/login`.

### Pitfall 6: Showing the driver fee collides with Phase 87/91 gates
`tests/driver-trip.test.ts` asserts the trip page select does not match `/amount_eur|price/i` [VERIFIED: tests/driver-trip.test.ts:337 `expect(cols).not.toMatch(/amount_eur|price/i)`] and the rendered text contains no `CZK|fee|price` [VERIFIED: tests/driver-trip.test.ts:471]. `driver_price_czk` matches `price`. **Avoid:** the shared loader selects `driver_price_czk` only when `showDriverFee` is true (cabinet detail only); the token page never passes it, so those tests stay green. Add new tests for the cabinet path that assert the fee label appears and that `amount_*` / `payment_amount_minor` do not leak (the cash label stays governed by the Phase 89 rules).

### Pitfall 7: OTP abuse
Per-IP limits alone allow one attacker to hammer one driver's mailbox (email bombing) or brute-force a code across IPs. **Avoid:** (1) per-hashed-email request limit with a long window (3 per 10 minutes, window via `WINDOWS_MS`, keyed on `sha256(email)` exactly like `/api/custom-tour#ack`), (2) per-IP limit, (3) max 5 attempts per code **inside the RPC**, (4) a new request invalidates earlier unconsumed codes, (5) `failClosed: true` on request-code and verify [VERIFIED: rate-limit option `failClosed` documented in lib/rate-limit.ts:~70-80; `/admin/login` and password sign-in use it]. Always answer request-code with the identical body/status and comparable latency whether or not the email exists.

### Pitfall 8: CSP blocks the service worker
`buildCsp()` (used for `/admin` and `/driver`) has `script-src 'nonce-…' 'strict-dynamic' https:` and no `worker-src`. Worker creation falls back through `child-src` to `script-src`, and nonces / `strict-dynamic` do not clearly authorize a worker script [ASSUMED from CSP3 fallback rules; the search this session did not confirm]. **Avoid:** add `"worker-src 'self'"` to `buildCsp` and `buildCspDriverHelp` together (the test `tests/middleware-i18n.test.ts` asserts the help CSP equals `buildCsp` plus only the chat tokens, so both change in the same position and that test is updated). `tests/infra-vps-isolation-guard.test.ts` already knows the `worker-src` directive name. The static CSP for `/book` etc. is unaffected. The middleware also puts the nonce CSP on `/driver/sw.js` itself; harmless as long as the worker uses no `importScripts` / `eval`.

### Pitfall 9: Service worker file and matcher
`public/driver/sw.js` is a `.js` file; the matcher only excludes images/txt/xml/webmanifest extensions and does NOT exempt anything under `driver/` anyway [VERIFIED: middleware.ts matcher `(?!(?:api|admin|driver|auth|embed)/|(?:[a-z]{2}/)?account/).*\\.(?:svg|png|…|webmanifest)$`], so `/driver/sw.js`, `/driver/manifest.webmanifest` and `/driver/icons/*.png` all run middleware and pass through (non-localized branch). Do not add `driver/` to the extension exclusion (T-74-07 class, `tests/middleware-matcher.test.ts`). Add a `next.config.ts` header entry for `/driver/sw.js` with `Cache-Control: no-cache, no-store, must-revalidate` and `Content-Type: application/javascript; charset=utf-8` [CITED: nextjs.org PWA guide]; extend `tests/next-config-headers.test.ts`. The existing `/driver/:path*` `Referrer-Policy: no-referrer` entry already covers the cabinet.

### Pitfall 10: Push delivery edge cases
iOS drops subscriptions when a push does not show a notification and the subscription can be silently invalid; some pushes will fail with 404/410: prune them, never fail the assign request, never treat push as the only channel (email always sends). `web-push` runs on the Node runtime only: keep `export const runtime` default on the assign route (do not set `edge`). Push payload limit is about 4 KB: keep the body to one line.

### Pitfall 11: Past-tab money
Sum only `completed` bookings with a non-null `driver_price_czk`; a `no_show` or `cancelled` ride contributes nothing; month boundary uses the Prague date of `pickup_date` (a ride at 00:30 on the 1st belongs to the new month in Prague, not UTC).

## Code Examples

### Atomic code consumption (migration 100, shape)
```sql
-- Source: project pattern for SECURITY DEFINER RPCs (memory: Function PUBLIC EXECUTE grant gotcha)
CREATE OR REPLACE FUNCTION public.consume_driver_login_code(p_driver_id uuid, p_code_hash text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH target AS (
    SELECT id FROM public.driver_login_codes
     WHERE driver_id = p_driver_id AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE
  ), bumped AS (
    UPDATE public.driver_login_codes c
       SET attempts = c.attempts + 1,
           consumed_at = CASE WHEN c.code_hash = p_code_hash THEN now() END
      FROM target WHERE c.id = target.id
    RETURNING c.consumed_at IS NOT NULL AS ok
  )
  SELECT COALESCE((SELECT ok FROM bumped), false);
$$;
REVOKE EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_driver_login_code(uuid, text) TO service_role;
```
Because the hash is salted with the code row id (`sha256(id:code)`), the RPC takes the verifying code hash computed from the latest row id: simpler is to look up the latest active row id in JS (service role), compute `sha256(`${row.id}:${code}`)`, then call the RPC with `(p_code_id, p_code_hash)`. Either shape is fine; the planner picks one and tests it. Re-REVOKE after any DROP+CREATE (the DROP+CREATE re-grants PUBLIC EXECUTE, memory gotcha).

### Migration 100 outline
```sql
-- 100_driver_cabinet.sql  (next free number is 100; latest in repo is 099_quote_send_tbc.sql)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cabinet_enabled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cabinet_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS vehicle_plate      text;

CREATE TABLE IF NOT EXISTS public.driver_login_codes (
  id uuid PRIMARY KEY, driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.driver_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, user_agent text);
CREATE TABLE IF NOT EXISTS public.driver_push_subscriptions (...);   -- see Pattern 7
CREATE INDEX IF NOT EXISTS driver_assignments_driver_created_idx  ON public.driver_assignments (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS driver_assignments_booking_created_idx ON public.driver_assignments (booking_id, created_at DESC);
ALTER TABLE public.driver_login_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers                   ENABLE ROW LEVEL SECURITY;  -- idempotent, no policy
ALTER TABLE public.driver_assignments        ENABLE ROW LEVEL SECURITY;  -- idempotent, no policy
-- + consume_driver_login_code() and its REVOKE/GRANT
```
Applied live by the orchestrator (gsd-executors have no Supabase MCP, memory: GSD execute-phase mechanics); a smoke SQL file like `87-02-smoke.sql` should accompany it. The repo test helper `tests/helpers/latest-migration.ts` (`latestFunctionBody`) is the pattern for asserting the RPC text and the REVOKE.

### Service worker (static)
```javascript
// public/driver/sw.js  — Source: Next.js PWA guide shape [CITED: nextjs.org/docs/app/guides/progressive-web-apps], reduced
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  event.waitUntil(self.registration.showNotification(data.title || 'Prestigo Driver', {
    body: data.body || 'You have a new ride offer.',
    icon: '/driver/icons/icon-192.png', badge: '/driver/icons/badge-72.png',
    data: { url: typeof data.url === 'string' && data.url.startsWith('/driver/') ? data.url : '/driver/offers' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/driver/offers'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.includes('/driver/') && 'focus' in c) { c.navigate(url); return c.focus() }
    return clients.openWindow(url)
  }))
})
```

### Rate-limit keys to add (lib/rate-limit.ts)
Existing keys, verbatim: `'/admin/login': 5`, `'/login': 5`, `'/api/driver/respond': 10`, `'/api/driver/trip/progress': 20`, `'/api/driver/trip/help': 10` [VERIFIED: lib/rate-limit.ts:40-46]; per-recipient window precedent `WINDOWS_MS = { '/api/custom-tour#ack': 24 * 60 * 60 * 1000 }` [VERIFIED: lib/rate-limit.ts:54-56]. Proposed (values are recommendations, [ASSUMED]): `'/api/driver/cabinet/request-code': 5` (per IP / min), `'/api/driver/cabinet/request-code#email': 3` with a 10-minute window, `'/api/driver/cabinet/verify': 10` (per IP / min), `'/api/driver/cabinet/offers/respond': 20`, `'/api/driver/cabinet/push': 10`, `'/api/driver/cabinet/help': 10`. Auth ones call `checkRateLimit(key, id, { failClosed: true })`.

### Middleware changes (middleware.ts)
Add to `CSRF_PROTECTED_PREFIXES` (currently ends the driver block with `'/api/driver/respond'`, `'/api/driver/trip'` [VERIFIED: middleware.ts:17-18]) the prefix `'/api/driver/cabinet'`, and to `CSRF_STRICT_ORIGIN_REQUIRED` (starts at middleware.ts:42) the same prefix: cookie-authenticated, browser-only callers, so a missing Origin is rejected like `/api/admin`. `NON_LOCALIZED_PREFIXES = ['/admin', '/api', '/auth', '/driver', '/embed']` [VERIFIED: middleware.ts:326] already routes all new `/driver/*` pages around next-intl and into the nonce CSP; no `lib/supabase/middleware.ts` change is required for the custom path (the driver cookie is validated in server code, not middleware).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One email link per assignment, no login | Authenticated cabinet + offers inbox | This phase | Links stay as fallback (D-15) |
| Web Push only on desktop/Android | iOS 16.4+ Home-Screen web apps | iOS 16.4 | Requires PWA install; push toggle hidden until installed on iOS |
| `web-push` 3.x (CJS) | 4.0.0 (ESM migration) | 2026-11-06 | Too new; pin 3.6.7 for now |

**Deprecated/outdated:** none of the existing driver code is removed in this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Custom OTP + opaque session is preferred over Supabase Auth (owner has not chosen; CONTEXT leaves it to Claude) | Summary / Alternatives | D-05 is costly to reverse; if the owner insists on Supabase Auth the auth plans change (second cookie name, middleware refresh, generateLink spike) |
| A2 | `worker-src 'self'` is needed because nonce + `strict-dynamic` do not authorize a worker script | Pitfall 8 | If wrong the directive is merely redundant (harmless) but two CSP-pinned tests need the same edit |
| A3 | Current RLS state of `drivers` / `driver_assignments` is unknown; enabling RLS with no policy is safe because all access is service-role | Pattern 2 | If some code path uses the anon key on these tables it would break; grep found none (all driver routes use `createSupabaseServiceClient`) |
| A4 | For cabinet-enabled drivers the offer email drops the Accept/Decline buttons and shows one cabinet CTA | Pattern 4 | Owner may prefer keeping both in the email; trivial to keep (flag Open Question 2) |
| A5 | Cabinet offers ignore `token_expires_at` (48 h default) while the email link keeps expiring | Pattern 4 | Conflicts with D-10 if "existing expiry" was meant to apply to the cabinet too (Open Question 1) |
| A6 | Rate-limit numbers (5/min IP, 3 per 10 min per email, 10/min verify, 5 attempts per code, 10 min code life) | Pitfall 7 | Too strict annoys drivers, too loose weakens brute-force resistance; 6 digits is 1e6 space so the 5-try cap is the real control |
| A7 | Salted SHA-256 of the 6-digit code is sufficient at rest (10-minute life, attempt cap, DB access already equals service-role) | Pattern 1 | A DB leak exposes live codes within their 10 minutes only |
| A8 | Push for iOS requires every push to display a notification or the subscription may be revoked | Pitfall 10 | If wrong, still harmless: the handler always shows one |
| A9 | `web-push` 3.6.7 works unchanged on Next 16 / Node 24 route handlers | Standard Stack | Low: library is plain Node; verify in Wave 0 with a mocked send test |
| A10 | Offers badge count and lists refresh by `router.refresh()` every ~30 s like TripScreen's `REFRESH_MS` | Pattern 3 | UI stale between refreshes; acceptable |

## Open Questions

1. **Does D-10 mean the cabinet offer outlives the 48 h `token_expires_at`?**
   - Known: live default is `token_expires_at = now() + 48 h` [VERIFIED: .planning/milestones/v4.0-phases/82-site-crm-chatwoot-sync-foundation/82-LIVE-SCHEMA.md:94 "driver_assignments | token_expires_at | timestamp with time zone | NO | (now() + '48:00:00'::interval)"], and the email says links are valid for 48 hours.
   - Unclear: D-10 says "stays in Offers until the operator reassigns or cancels it ... planner keeps the existing expiry behaviour".
   - Recommendation: cabinet ignores the token expiry (the offer stays), the email link keeps its 48 h life. Confirm with the owner.
2. **Should the cabinet-driver offer email still carry Accept / Decline buttons?** Recommendation: one cabinet CTA only; token links remain valid for old emails and non-cabinet drivers (D-15 says "lead into the cabinet").
3. **Disable scope.** `drivers.cabinet_enabled=false` ends cabinet access, sessions and push, but does not block assignment or existing trip/accept links. Recommendation: keep (D-15), and note the operator should not assign a departed driver. Confirm.
4. **Is the Supabase project on Pro?** Only relevant if the owner overrides A1 (time-box sessions). The research could not query the dashboard (no Supabase MCP in this session; live schema was taken from `82-LIVE-SCHEMA.md`, dated v4.0, so `drivers` / `driver_assignments` columns should be re-confirmed live by the orchestrator before migration 100).
5. **Do Past totals include `no_show` rides with a driver fee?** Recommendation: completed only.
6. **Spike (only if A1 is overridden):** `auth.admin.generateLink({type:'magiclink'})` returns `properties.email_otp` and `verifyOtp({email, token, type:'email'})` accepts it, on the live project, without sending a Supabase email. Unverified here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build / tests | yes | v24.14.1 (`.nvmrc` 24) | — |
| npm registry | installing `web-push` | yes | npm 11.11.0 | — |
| Supabase MCP / live DB access | applying migration 100, smoke, live schema recheck | no (not available to the researcher; executors also have none) | — | Orchestrator applies the migration and runs the smoke SQL (project convention) |
| Resend (`RESEND_API_KEY`, sender `bookings@rideprestigo.com`) | OTP + invite email | yes in production (existing sends) | — | — |
| Upstash Redis (`UPSTASH_REDIS_REST_*`) | rate limits | yes in production; in-memory fallback locally | — | `failClosed` routes return 429 when Upstash is down: acceptable for auth |
| VAPID keys + Vercel env | web push | no (do not exist yet) | — | Push is skipped silently when env is absent; email still sends. Owner generates keys in a terminal script and sets Vercel env (4 vars) |
| Phone for live proof (Android + iOS 16.4+ home-screen) | DCAB-12 UAT | owner device | — | Mark as human UAT item |
| Chrome headless / dev server | UI verification | per project rules: `preview_start` name `prestigo`, never `npm run dev` in Bash | — | — |

**Missing dependencies with no fallback:** none blocking code work.
**Missing dependencies with fallback:** VAPID env (push dormant until set); live DB for migration (orchestrator applies).

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (file contains only `workflow._auto_chain_active` and `use_worktrees`), so the section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 + @testing-library/react ^16.3.2 (jsdom default; `// @vitest-environment node` for source-reading gates) |
| Config file | `vitest.config.ts` (alias `@` → repo root, setup `tests/setup.ts`) |
| Quick run command | `npx vitest run tests/driver-cabinet-*.test.ts tests/driver-offer.test.ts` |
| Full suite command | `npx vitest run` (~90 s); `vitest related` crashes here — grep `tests/` instead |
| Type check / lint | `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only); `npx eslint --quiet <files>` |
| Mock pattern | `vi.hoisted` stubs for `@/lib/supabase`, `@/lib/rate-limit`, `next/headers`; chainable `.from().select().eq()` stubs as in `tests/driver-help-route.test.ts`; migration-text assertions via `tests/helpers/latest-migration.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DCAB-01 | request-code: unknown / not-invited / disabled email → identical 200, no email, no row; invited → code row (hash only) + email; rate limits (IP, per-email) fail-closed; verify: wrong code increments, 6th try locked, expired/consumed rejected, success returns cookie | unit (route + auth module, Supabase/Resend/rate-limit mocked) | `npx vitest run tests/driver-cabinet-auth.test.ts` | ❌ Wave 0 |
| DCAB-01 | RPC `consume_driver_login_code` exists, SECURITY DEFINER, `attempts < 5`, REVOKE FROM PUBLIC, anon, authenticated, GRANT service_role | migration text | `npx vitest run tests/driver-cabinet-migration.test.ts` | ❌ Wave 0 |
| DCAB-02 | cookie attrs (httpOnly, sameSite lax, maxAge 30 d, path /), DB holds only hash, expired row rejected, sign-out deletes row + clears cookie | unit | `npx vitest run tests/driver-cabinet-session.test.ts` | ❌ Wave 0 |
| DCAB-03 | admin invite/disable route: 401/403 guards, uuid, sets flag, disable deletes sessions + codes + subscriptions; `requireDriver` rejects right after disable with the same cookie | unit | `npx vitest run tests/admin-driver-cabinet.test.ts` | ❌ Wave 0 |
| DCAB-04 | `lib/driver-cabinet/**` and cabinet routes import nothing from `@/lib/supabase/server`; `getAdminUser`/customer pages ignore the driver cookie (driver cookie only → 401/redirect); `/account` unchanged | source gate + unit | `npx vitest run tests/driver-cabinet-isolation.test.ts` | ❌ Wave 0 |
| DCAB-05 | every query function requires `driverId` and applies `.eq('driver_id', …)`; foreign `assignmentId` → uniform not-found; select strings contain none of `amount_eur|amount_czk|payment_|client_email|client_phone` (list queries) | unit + source gate | `npx vitest run tests/driver-cabinet-queries.test.ts` | ❌ Wave 0 |
| DCAB-06 | Upcoming/Past partition, Prague day grouping across DST (2026-10-25 and 2027-03-28 boundaries), month totals only from completed priced rides, no "0 CZK", plate or "Pending", cancelled badge in Past | unit (pure view-model in `lib/driver-cabinet/format.ts`) | `npx vitest run tests/driver-cabinet-rides.test.ts` | ❌ Wave 0 |
| DCAB-07 | offers predicate: pending + newest-of-booking + non-terminal; superseded and cancelled hidden; first name only (no last name/phone); fee omitted when null | unit | `npx vitest run tests/driver-cabinet-offers.test.ts` | ❌ Wave 0 |
| DCAB-08 | `respondToOffer` token caller keeps today's outcomes (`invalid_token`, `used`, expiry); session caller ignores expiry, burns `token_used_at`, rejects foreign/superseded/non-pending; both fire the same effects; existing respond tests still pass | unit | `npx vitest run tests/driver-offer.test.ts tests/admin-assignment.test.ts tests/driver-accept-email.test.ts` | ❌ Wave 0 (new) + ✅ existing |
| DCAB-09 | `/driver/rides/[assignmentId]` renders TripScreen for own assignment, uniform not-found for others, Back link, fee label shown; token page unchanged (existing `tests/driver-trip.test.ts`, `tests/driver-trip-progress.test.ts`, `tests/status-writers-gate.test.ts` stay green); no `bookings` write in cabinet files | unit/RTL + source gate | `npx vitest run tests/driver-cabinet-ride-detail.test.tsx tests/driver-trip.test.ts tests/status-writers-gate.test.ts` | ❌ Wave 0 + ✅ existing |
| DCAB-10 | stats math (denominator 0 → "—"), help route session-gated and passes fixed reference, sign-out clears `cw_*` cookies | unit | `npx vitest run tests/driver-cabinet-you.test.ts` | ❌ Wave 0 |
| DCAB-11 | assign route: cabinet driver → cabinet CTA email + push; non-cabinet → byte-identical old email; `notification_flags.driver_assigned === false` suppresses both | unit | `npx vitest run tests/admin-assignment.test.ts tests/driver-cabinet-assign-email.test.ts` | ✅ existing + ❌ Wave 0 |
| DCAB-12 | `sendOfferPush`: no env → no-op; 404/410 prune; other error logged without endpoint/keys; payload has no passenger name/fee/token; subscribe route validates endpoint (https) + keys, upserts by endpoint, session-gated; `public/driver/sw.js` always calls `showNotification`, never `importScripts`; manifest JSON scope `/driver/`, display standalone | unit + file gate | `npx vitest run tests/driver-cabinet-push.test.ts tests/driver-cabinet-pwa.test.ts` | ❌ Wave 0 |
| DCAB-13 | `/api/driver/cabinet` in both CSRF lists (evil Origin 403, missing Origin 403, same-origin pass); rate-limit keys exist; `worker-src 'self'` in `buildCsp` and help CSP; `/driver/sw.js` header entry; matcher test still green | unit | `npx vitest run tests/middleware-csrf-forms.test.ts tests/middleware-i18n.test.ts tests/next-config-headers.test.ts tests/middleware-matcher.test.ts tests/driver-cabinet-security.test.ts` | ✅ existing (extend) + ❌ Wave 0 |

Manual-only (human UAT, cannot be automated here): real Android Chrome and iOS 16.4+ Home-Screen push receipt; email deep link opens `/driver/offers` and survives a login; light-theme visual check on a phone-sized viewport (use the preview tools, not manual asks to the user, per the self-verify rule); one production sign-in by the owner after invite.

### Sampling Rate
- **Per task commit:** the single new/changed test file via `npx vitest run <file>` plus `npx tsc --noEmit`
- **Per wave merge:** all `tests/driver-*.test.ts`, `tests/admin-assignment.test.ts`, `tests/admin-drivers.test.ts`, `tests/middleware-*.test.ts`, `tests/next-config-headers.test.ts`, `tests/status-writers-gate.test.ts`
- **Phase gate:** full `npx vitest run` green (baseline tsc errors unchanged), then the `verify` skill

### Wave 0 Gaps
- [ ] `tests/driver-cabinet-*.test.ts` / `tests/driver-offer.test.ts` / `tests/admin-driver-cabinet.test.ts` — files listed above (all new)
- [ ] `tests/helpers/fake-driver-cabinet-db.ts` — small in-memory fake for `drivers`, `driver_login_codes`, `driver_sessions`, `driver_assignments`, `bookings` (pattern: `tests/helpers/fake-payments-db.ts`, `fake-tours-db.ts`) so auth/queries tests exercise real filtering instead of chained mocks
- [ ] Extend `tests/driver-trip.test.ts` mock helpers only if the shared loader changes call counts (the select is still one call)
- [ ] Update `tests/middleware-i18n.test.ts` / `tests/middleware-tour-photos-csp.test.ts` for `worker-src 'self'`
- [ ] Framework install: none (vitest present). Package install: `web-push@3.6.7` behind a human-verify checkpoint
- Golden rule from CLAUDE.md: snapshot/JSON-LD tests must normalize `priceValidUntil`; not touched by this phase.

## Security Domain

> `security_enforcement` is not set to false in config; section included. All commits touching auth, CSRF, validation, rate limits use the `security:` prefix (CLAUDE.md, D-04).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Email OTP: CSPRNG 6-digit code, hashed at rest, 10 min, single use, 5 attempts in-RPC, per-IP and per-email rate limits fail-closed, identical responses for unknown / disabled emails |
| V3 Session Management | yes | Opaque 256-bit token, SHA-256 at rest, httpOnly + Secure + SameSite=Lax cookie, 30-day absolute expiry, server-side revocation checked per request, sign-out deletes the row |
| V4 Access Control | yes | `requireDriver()` + driver-id-filtered data-access module; uniform not-found for foreign ids; RLS deny-all on all new tables; admin invite route behind `getAdminUser()` |
| V5 Input Validation | yes | zod (uuid ids, email via `safeEmail`, code `^\d{6}$`, push subscription: https endpoint, base64url keys with max lengths), `enforceMaxBody` on every POST |
| V6 Cryptography | yes | `node:crypto` only (`randomInt`, `randomBytes`, `createHash`, `timingSafeEqual`); `web-push` for VAPID/aes128gcm; never hand-rolled |
| V8 Data Protection | yes | Offers show first name only until accepted (D-12); push payload carries no passenger name, fee or token; client price / payment / email never selected |
| V13 API | yes | CSRF prefix `/api/driver/cabinet` with strict Origin; no-store on cabinet pages; Referrer-Policy no-referrer already applies to `/driver/*` |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OTP brute force (1e6 space) | Spoofing | 5 attempts per code inside the RPC, new request invalidates old codes, per-IP + per-email limits, fail-closed |
| Email bombing of a driver mailbox | DoS | per-hashed-email limit (3 / 10 min), generic response |
| Account/email enumeration | Info disclosure | identical response + comparable latency for any email |
| Session theft / fixation | Spoofing | rotate: always mint a new token at verify; httpOnly; token hashed; sign-out + disable delete rows |
| Stale access after disable | Elevation | per-request DB gate on `drivers.cabinet_enabled`, session rows deleted on disable |
| IDOR on `/driver/rides/[assignmentId]` and offers respond | Info disclosure / Tampering | every lookup keyed by `(id, driver_id = session driver)`; uniform 404 |
| CSRF on cookie-authenticated POSTs | Tampering | strict Origin prefix + SameSite=Lax cookie |
| Open redirect via `next` param | Tampering | `safeDriverNext` allow-list of `/driver/...` paths |
| Cross-identity confusion (driver = admin/customer email) | Elevation | no `auth.users` row, separate cookie, no shared helpers (isolation test) |
| Push endpoint / key leakage in logs | Info disclosure | never log endpoint, keys or payload; prune on 404/410 |
| Stored XSS via free text (addresses, notes) in lists | Tampering | React escaping only, no `dangerouslySetInnerHTML`; same as trip screen |
| Service worker scope escalation | Elevation | worker at `/driver/sw.js`, scope `/driver/`, no `Service-Worker-Allowed` header, notification URL allow-list `/driver/` only |

## Sources

### Primary (HIGH confidence)
- Codebase files read this session: `middleware.ts`, `lib/supabase/middleware.ts`, `lib/supabase/server.ts`, `lib/supabase.ts`, `lib/rate-limit.ts`, `lib/trip-token.ts`, `lib/booking-status.ts`, `lib/driver-trip-step.ts`, `lib/driver-accept-email.ts`, `lib/driver-help-contract.ts`, `lib/chatwoot-identity.ts`, `lib/email-log.ts`, `app/api/driver/respond/route.ts`, `app/api/driver/trip/[token]/{progress,help}/route.ts`, `app/api/admin/bookings/[id]/{assign,assignment}/route.ts`, `app/api/admin/drivers/**`, `app/(internal)/driver/**`, `app/[locale]/login/actions.ts`, `app/auth/callback/route.ts`, `next.config.ts`, `package.json`, `vitest.config.ts`, migrations 041, 049, 057, 060, 061, existing tests listed in Validation Architecture
- `.planning/milestones/v4.0-phases/82-site-crm-chatwoot-sync-foundation/82-LIVE-SCHEMA.md` — live `drivers` / `driver_assignments` columns and constraints (v4.0 snapshot)
- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — manifest, web-push, sw.js headers, iOS 16.4
- [Supabase: Sessions](https://supabase.com/docs/guides/auth/sessions) — refresh tokens never expire; time-box / inactivity / single-session are Pro; JWT expiry range
- [Supabase: Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless) — OTP shares the Magic Link template; `{{ .Token }}`; 1 h default expiry; 60 s resend
- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) — Home Screen only, standalone manifest, user gesture, 16.4, `*.push.apple.com`
- npm registry via `npm view` (web-push, @types/web-push, @supabase/ssr) and `gsd_run query package-legitimacy check` (web-push: SUS too-new)

### Secondary (MEDIUM confidence)
- [supabase/ssr source (GitHub)](https://github.com/supabase/ssr) — `cookieOptions.name` becomes the auth `storageKey`; server client forces `autoRefreshToken: false`; default cookie `maxAge` 400 days (relevant only to the Supabase-Auth alternative)
- supabase-js auth-js types — `GenerateLinkProperties { action_link, email_otp, hashed_token, redirect_to, verification_type }` (relevant only to the alternative)
- [web-push GitHub releases](https://github.com/web-push-libs/web-push/releases) — 4.0.0 = ESM migration and dependency refresh; no stated breaking API

### Tertiary (LOW confidence — needs validation)
- CSP3 fallback for worker creation and the effect of `strict-dynamic` on workers (general knowledge; web search did not confirm) — mitigated by the explicit `worker-src 'self'`
- iOS "must show a notification for every push" behaviour (not stated in the WebKit article fetched) — mitigated by always showing one

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for in-repo pieces; MEDIUM for `web-push` (SUS on latest, pinned older version, not installed or run here)
- Architecture: HIGH for data access, offer path and trip reuse (all read in source); MEDIUM for auth choice (judgement among options the CONTEXT leaves open) and CSP/worker behaviour
- Pitfalls: HIGH for codebase-derived ones (offer predicate, fee gate, matcher, CSP tests); MEDIUM for iOS/push edge cases

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (re-check `web-push` 4.0.0 age and Supabase session settings if A1 is overridden; live schema of `drivers` / `driver_assignments` must be re-read before migration 100)
