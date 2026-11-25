# Phase 94: Driver Cabinet - Context

**Gathered:** 2026-11-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A driver signs in to a personal cabinet (mobile web, light theme, English) and sees all of their rides and new ride
offers in one place, instead of one email link per assignment. The cabinet has three areas: **Rides** (Upcoming / Past,
grouped by day), **Offers** (accept / decline what the operator assigned), and **You** (profile, help, sign out). Opening
a ride shows the existing Phase 87 trip screen (map, bottom sheet, slide-to-advance). The operator creates and disables
driver accounts in the admin. A new offer reaches the driver by email (linking into the cabinet) and by web push.

Out of this phase: driver ratings by clients, driver documents (licence, insurance), offering one ride to several
drivers at once, other cabinet languages, earnings payouts / invoicing.

Requirements: TBD in planning (ROADMAP §Phase 94 scope, owner 2026-11-03, plus the decisions below).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (ROADMAP / Phase 87 — not re-asked)
- **D-01:** Ride detail reuses the Phase 87 trip screen (`app/(internal)/driver/trip/[token]`: map, bottom sheet,
  slide-to-advance, confirm dialog, no-show request, help chat, Google Maps / Waze chooser). The Phase 87 header's
  reserved back slot now returns to the ride list. All status changes keep going through the Phase 87 status service
  (`lib/booking-status-service.ts`); the cabinet never writes `bookings` directly.
- **D-02:** Light theme always, mobile-first, Prestigo branding (Phase 87 D-19). The Blacklane driver app screenshots are
  a layout reference only: no names, assets or look-alike branding.
- **D-03:** Ride list row: time, pickup → drop-off, passenger first name, vehicle plate or "Pending", vehicle class;
  Upcoming / Past tabs, grouped by day (ROADMAP scope).
- **D-04:** Security-relevant phase: new driver authentication and per-driver data access; commits use the `security:`
  prefix. A driver can read only their own assignments and the bookings behind them.

### Sign-in and accounts
- **D-05:** Sign-in is by **email one-time code** (6 digits), no passwords. The session lasts long on the phone
  (about 30 days, then a new code). — **Reversibility:** costly — the auth path, session handling and the invite flow
  depend on it.
- **D-06:** **Only the operator creates driver accounts**, in the admin (the existing drivers list): adding or inviting a
  driver lets that email sign in; there is no self-registration. **Disabling a driver removes access at once**, including
  sessions already open. The 4 existing drivers (all with an email) get invited, not re-created.
- **D-07:** Driver identity must not mix with customer or admin identity: a driver session never grants admin rights
  (`app_metadata.is_admin`), and the customer account pages do not treat a driver as a customer. Mechanism (Supabase Auth
  user linked to `drivers`, role claim, separate cookie scope) is Claude's call within this rule.

### Offers
- **D-08:** An offer goes to **one driver at a time, as today**: the operator picks the driver in the admin; the offer
  appears in that driver's **Offers** tab; the driver accepts or declines; on decline the operator assigns someone else.
  Accept / decline keep today's effects (assignment status, the accepted-trip email, the decline notification to the
  operator).
- **D-09:** The driver learns about a new offer by **email and web push**. The email links into the cabinet's Offers tab
  (signing in first when needed). Web push works once the driver adds the cabinet to the phone home screen (PWA:
  Android, iOS 16.4+); the cabinet asks for permission and explains how to add it to the home screen. Push is a
  convenience; email always goes out. — **Reversibility:** reversible.
- **D-10:** An offer the driver has not answered stays in Offers until the operator reassigns or cancels it (no automatic
  expiry is introduced unless today's `token_expires_at` already applies; planner keeps the existing expiry behaviour).

### What the driver sees
- **D-11:** The driver sees **their own fee** (`bookings.driver_price_czk`, CZK) in the offer before accepting, on the
  ride, and a monthly total on Past. The client's price, payments and deposits are never shown. Only 5 of the last 78
  bookings have a driver fee set: when it is empty, nothing is shown (no "0 CZK").
- **D-12:** Passenger data follows the Phase 87 trip screen (name and phone on the ride the driver accepted); an offer that
  is not accepted yet shows only first name, time, route, class and fee.
- **D-13:** Profile ("You"): name, phone, email, vehicle (`drivers.vehicle_info`); simple stats (rides completed, share of
  offers accepted); Help (the same Chatwoot chat as the trip screen); Sign out. **No rating, no documents** in this
  phase.

### Language and old links
- **D-14:** Cabinet in **English only**, like the trip screen.
- **D-15:** **Both ways stay**: the per-assignment email links (`/driver/response` accept / decline and
  `/driver/trip/[token]`) keep working permanently as a fallback (for example a one-off driver without an account),
  alongside the cabinet. Emails to drivers with an account lead into the cabinet; the token links keep their own rules
  (expiry, terminal statuses). — **Reversibility:** reversible.

### Claude's Discretion
- Auth mechanism (Supabase Auth email OTP vs a driver-only OTP table), session cookie scope and the "revoke on disable"
  mechanism, as long as D-05..D-07 hold.
- Web push stack (VAPID keys, service worker, subscription table, sending library) and the PWA manifest/icons.
- Where the cabinet lives (`/driver` routes inside `app/(internal)`), navigation (bottom tabs Rides / Offers / You), empty
  and loading states, how Past paginates.
- How "vehicle plate" is derived from `drivers.vehicle_info` (free text today) or whether a plate field is added.
- How the accept / decline action in the cabinet and in the token route share one code path.
- Rate limiting of the code request and code verification.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §Phase 94 — goal, owner scope 2026-11-03, security note
- `.planning/phases/87-status-service-driver-step-flow/87-CONTEXT.md` — trip screen decisions D-12..D-21 (steps, start
  gate, no-show request, help chat, light theme, English, `/driver/response` kept)

### Prior decisions that apply
- `.planning/phases/86-admin-shell/86-CONTEXT.md` — light palette and tokens reused by the driver pages
- `CLAUDE.md` — security work commits with `security:` prefix; no secrets; new EN strings (the cabinet is EN-only, so no
  locale catalogue work unless strings land in `messages/`)

No external specs beyond these.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(internal)/driver/trip/[token]/*` — the Phase 87 trip screen (TripScreen, TripMap, SlideToAdvance,
  ConfirmStepDialog, NoShowBlock, NavigateChooser, TripCompleted) and `app/(internal)/driver/trip/help` (Chatwoot help
  chat); reached today by `driver_assignments.trip_token`.
- `app/(internal)/driver/response` + `app/api/driver/respond/route.ts` — accept / decline by `driver_assignments.token`
  (single use, `token_expires_at`), sends `sendDriverAcceptedTripEmail` / `sendDriverDeclineNotification`.
- `app/api/admin/drivers/route.ts` — admin drivers CRUD (`name, email, phone, vehicle_info`).
- `lib/supabase/server.ts` — `createClient()` (cookie session) and `getAdminUser()` (`app_metadata.is_admin`).
- `app/[locale]/login/actions.ts` — customer email OTP via `supabase.auth.signInWithOtp` (pattern for the code request).
- `lib/booking-status-service.ts` — the only writer of booking status (Phase 87).

### Established Patterns
- Tables: `drivers(id, name, email, phone, vehicle_info, created_at)`; `driver_assignments(id, booking_id, driver_id,
  status pending|accepted|declined, token, token_expires_at, token_used_at, trip_token, trip_progress, trip_note, …)`.
  Live data: 4 drivers, 51 assignments (25 in the last 30 days).
- Driver write routes are CSRF-protected and rate-limited (Phase 87 D-07); keep that for the cabinet.
- Service-role reads in server code; never create a Supabase client during render (Vercel preview lesson).

### Integration Points
- Admin assign flow (where `driver_assignments` rows and the driver email are created) → email links into the cabinet
  and fires web push.
- Admin drivers page → invite / disable driver accounts.
- Trip screen → back to the ride list; reachable both by session (cabinet) and by `trip_token` (fallback).

</code_context>

<specifics>
## Specific Ideas

- Layout like the Blacklane driver app shared 2026-11-03 (ride list grouped by day, Offers tab, "You" tab), Prestigo look.
- Driver fee is shown before accepting so the driver can judge the offer.

</specifics>

<deferred>
## Deferred Ideas

- Driver rating by clients after the trip (new client-facing feature).
- Driver documents with expiry dates and reminders.
- Offering one ride to several drivers, first to accept wins.
- Cabinet in Russian / Czech.

</deferred>

---

*Phase: 94-driver-cabinet*
*Context gathered: 2026-11-25*
