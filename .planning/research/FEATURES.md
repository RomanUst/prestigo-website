# Feature Research

**Domain:** Premium chauffeur booking platform — v1.3 Pricing & Booking Management
**Researched:** 2026-04-03
**Confidence:** HIGH (existing system) / MEDIUM (UX patterns from industry research)

---

## Context: What Is Already Built (v1.0–v1.2)

Do NOT rebuild any of the following. All v1.3 features are additive or corrective.

- 6-step booking wizard with Zustand + sessionStorage; fully responsive at 375px
- Server-side pricing engine (`lib/pricing.ts`) — now DB-driven via `pricing_config` table
- Coverage zone enforcement via Turf.js point-in-polygon; `quoteMode` when outside zones
- Stripe PaymentIntent + webhook source of truth; full payment at booking time
- Resend transactional emails (client confirmation + manager alert)
- Supabase `bookings` table (33 columns); `pricing_config` table; `coverage_zones` table
- Admin dashboard: auth gate, pricing editor (base rates/extras/airport/night/holiday), zone map editor, bookings table (read-only, paginated, filterable), stats dashboard
- Admin auth: Supabase Auth email+password, `is_admin` app_metadata gate, middleware redirect

**Carried-over context for v1.3 builders:**

- Zone logic currently requires pickup AND dropoff both inside an active zone for price to show. The fix (ZONES-06) is a logic inversion in the point-in-polygon check — low-complexity but high business impact.
- `pricing_config` table exists and holds night/holiday coefficients. Holiday date enforcement is missing — coefficients are present but nothing applies them automatically based on calendar dates.
- `bookings` table has no `status` column yet. Manual booking, status workflow, and cancellation all depend on adding this column cleanly via a migration.
- Admin UI is currently desktop-only — built with wide table layouts that break below ~768px.

---

## Feature Landscape

### Table Stakes (Operator Expects These)

Features that premium chauffeur operators assume any booking management system provides. Missing these makes the admin feel like a prototype, not a production tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Zone logic: price shown if pickup OR dropoff is in zone | Current AND-logic surprises clients; standard in all chauffeur platforms is "if either endpoint is in our zone, we serve it" | LOW | Logic change in `/api/calculate-price` point-in-polygon check; no schema change |
| Booking status workflow (pending → confirmed → completed → cancelled) | Industry standard in every chauffeur platform (QuanticaLabs, Moovs, LimoAnywhere); operator needs ops visibility | MEDIUM | Add `status` column to `bookings` (migration); admin UI for status change; status-change email to client on confirm/cancel |
| Manual booking creation from admin | Phone orders are a primary revenue channel for premium chauffeur; the system must capture them in the same DB | MEDIUM | Admin form that POSTs to a new `/api/admin/bookings` endpoint; generates booking reference; no Stripe payment flow (offline cash/invoice) |
| Booking cancellation with optional Stripe refund | Premium clients expect instant refund on cancellation; operator must control whether to refund | MEDIUM | Call Stripe Refunds API server-side; admin chooses full/partial/no refund before confirming cancel; status set to `cancelled` |
| Operator notes on bookings | Dispatchers annotate every job (driver instructions, special access codes, client preferences); universal in dispatch software | LOW | `operator_notes` text column on `bookings`; inline edit in booking detail row; no client visibility |
| Holiday dates configuration | Night/holiday coefficients exist but are never auto-applied; operator needs a calendar to set holiday dates that trigger the coefficient | MEDIUM | `holiday_dates` table (date + label); admin UI to add/remove dates; `/api/calculate-price` checks if pickup date is in table |
| Minimum fare per vehicle class | Floor pricing is a basic financial protection; every chauffeur pricing guide mentions it; without it short trips produce uneconomical fares | LOW | Add `min_fare_czk` + `min_fare_eur` fields to `pricing_config` per vehicle class; apply in pricing engine after distance calculation |
| Mobile-responsive admin panel | Operators check bookings and update status from phones (confirmed by chauffeur dispatch UX research; 58% of web traffic is mobile) | MEDIUM | Tailwind responsive classes on admin layout, sidebar, bookings table, and forms; collapsible sidebar on mobile; table scrollable or card-view below 768px |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline and reflect Prestigo's premium positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Promo code system with server-side validation | Personalised codes for corporate clients or repeat customers; premium UX when the field is subtle ("Have a promo code?") and validates server-side before Stripe charge | HIGH | Full system: `promo_codes` table, admin CRUD, client entry in wizard step 5, server validation endpoint, PaymentIntent amount adjusted before charge; race-condition safe via atomic DB decrement |
| Status-change email to client on confirmation | Clients receiving a "Your booking is confirmed" email (distinct from the payment confirmation) feel handled professionally; not universal in smaller operators | LOW | Resend template triggered when operator changes status from `pending` → `confirmed`; reuses existing email infrastructure |
| Stripe refund in one click from admin | Operator does not need to leave admin panel and log into Stripe Dashboard to issue a refund; reduces errors and friction | MEDIUM | Calls `stripe.refunds.create` server-side from a new `/api/admin/bookings/[id]/refund` endpoint; shows refund amount inline |
| Minimum fare as visible config (not hardcoded) | Operator can adjust floor prices as market rates change without a code deploy; competitors often hardcode this | LOW | Already in `pricing_config` pattern; extends the existing editor UI |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Partial refund with custom amount input | Flexibility for disputes | Introduces ambiguity in accounting; requires operator judgment on correct partial amount; Stripe partial refunds cannot be undone | Offer full refund or no refund toggle; if custom amount is needed, operator goes to Stripe Dashboard directly |
| Promo code stacking (apply multiple codes) | Clients want to combine discounts | Race condition surface multiplied; accounting complexity; premium brand dilution | One active code per booking, enforced server-side; clear error "Only one promo code per booking" |
| Automatic status progression (confirmed after X hours) | Reduces manual steps | Auto-confirmed bookings with no driver assigned cause real-world failures; premium service requires human confirmation | Keep status changes manual; add a "pending bookings" count badge on admin sidebar so operator sees unconfirmed count at a glance |
| Bulk status update (confirm all pending) | Efficiency | Bulk confirms without per-booking review risk errors; premium service means every booking is manually reviewed | Single-booking status change only in v1.3 |
| Client-facing booking management portal (cancel own booking) | Reduces operator load | No client accounts exist; adding client auth is a large scope expansion; client self-service cancellation needs refund policy enforcement | Client cancels by emailing/calling operator; operator cancels + refunds from admin panel |
| SMS notifications on status change | Multi-channel communication | Adds Twilio/Vonage integration cost and complexity; Resend email already confirmed working; Prague luxury market clients are email-responsive | Email notifications only; SMS is v2 if operator reports clients missing emails |
| Promo code auto-expiry background job | Codes expire automatically | Vercel Hobby has no cron support (only via Vercel Cron, which has limits); background jobs are unreliable on serverless | Store `expires_at` on each code; check expiry at validation time (lazy expiry); no background job needed |

---

## Feature Dependencies

```
[booking status column in DB]
    └──required by──> [Status workflow UI in admin]
    └──required by──> [Cancellation flow]
                          └──requires──> [Stripe Refund API call]
    └──required by──> [Status-change email to client]
                          └──requires──> [Resend template for confirmation]

[promo_codes table in Supabase]
    └──required by──> [Admin promo code CRUD UI]
    └──required by──> [Client promo entry in wizard step 5]
                          └──requires──> [Server validation endpoint /api/validate-promo]
                          └──requires──> [PaymentIntent amount adjustment before Stripe charge]

[holiday_dates table in Supabase]
    └──required by──> [Admin holiday calendar UI]
    └──required by──> [/api/calculate-price applies holiday_coefficient on match]

[pricing_config min_fare fields]
    └──required by──> [Minimum fare logic in lib/pricing.ts]
    └──required by──> [Pricing editor UI (new min fare inputs per vehicle class)]

[zone OR-logic fix]
    └──no schema dependency — logic change only in /api/calculate-price
    └──unblocks──> [Correct price display for single-endpoint zone trips]

[operator_notes column in bookings]
    └──required by──> [Notes textarea in booking detail row]
    └──no other dependencies]

[manual booking form in admin]
    └──requires──> [booking status column] (manual bookings default to pending)
    └──requires──> [admin auth] (already exists)
```

### Dependency Notes

- **Status column is the most-depended-on schema change.** Status workflow, cancellation, refund flow, and manual booking creation all need it. Add the migration first; all other booking management features unlock after.
- **Promo code system spans three surfaces.** Admin CRUD (create/deactivate/delete), client wizard entry, and server-side payment validation must be built as a unit. Building only the admin UI without the validation endpoint leaves a non-functional system.
- **Promo validation must be atomic.** The race condition risk (two users using the same single-use code simultaneously) requires an atomic `UPDATE ... WHERE uses_remaining > 0 RETURNING *` pattern in Postgres — not a check-then-update pattern. This is a critical implementation constraint, not just a nice-to-have.
- **Holiday dates and min fare are independent.** Both only extend the `pricing_config` / add a new small table. No booking-management dependency. Can be built in any order relative to each other.
- **Zone OR-logic fix is self-contained.** Lowest-risk change; zero schema changes; high business value since it fixes incorrect price suppression for the most common trip patterns.
- **Mobile admin is purely presentational.** No API or schema changes. Can be done as a final phase without blocking any other work.

---

## MVP Definition for v1.3

### Must Ship (v1.3 Core)

- [ ] ZONES-06 — Zone OR-logic fix: price shown if pickup OR dropoff in any active zone
- [ ] PRICING-07 — Holiday dates table + admin UI + auto-apply coefficient at price calculation
- [ ] PRICING-08 — Minimum fare per vehicle class (min_fare fields in pricing_config + pricing engine enforcement)
- [ ] BOOKINGS-06 — Manual booking creation form in admin (phone orders)
- [ ] BOOKINGS-07 — Booking status workflow UI (pending → confirmed → completed → cancelled)
- [ ] BOOKINGS-08 — Cancellation + optional full Stripe refund from admin
- [ ] BOOKINGS-09 — Operator notes textarea on booking detail
- [ ] UX-01 — Mobile-responsive admin panel (375px+)

### Promo Code System (v1.3 Secondary — higher complexity)

- [ ] PROMO-01 — Admin creates promo codes (code string, discount %, expiry date, usage limit)
- [ ] PROMO-02 — Admin deactivates or deletes promo codes
- [ ] PROMO-03 — Client enters promo code in wizard step 5; valid code updates displayed price subtly
- [ ] PROMO-04 — Server-side atomic validation before Stripe charge; invalid codes rejected with specific error

### Defer to v2+

- [ ] Client self-service cancellation (requires client accounts)
- [ ] SMS notifications on status change (Twilio integration)
- [ ] Partial refund with custom amount
- [ ] Cron-based promo code auto-expiry
- [ ] Bulk booking status updates
- [ ] Promo code analytics (redemption rates, revenue impact)

---

## UX Behavior Specifications

Research-informed UX expectations for each feature in context of a premium service.

### Promo Code Entry in Wizard (PROMO-03/04)

**Pattern:** Collapsed by default; progressive disclosure. A subtle text link "Have a promo code?" appears near the price summary in step 5 (passenger details). Clicking expands an input + "Apply" button inline. This avoids making users without codes feel excluded — a noted premium checkout concern.

**Validation timing:** On "Apply" button click (not on blur/type). Call `/api/validate-promo` which returns `{ valid: true, discount_percent: 20, new_total_czk: X }` or `{ valid: false, error: "Code expired" | "Code not found" | "Usage limit reached" }`. Show error inline, adjacent to the field, with specific message — not a generic "invalid code" toast.

**Price update:** On valid code, the price breakdown updates in place (no page reload); the discount line appears as "Promo: -20% (CODE20)". The discounted amount is then passed as the PaymentIntent amount.

**Premium feel constraint:** No confetti, no large success banner. Small inline checkmark and updated price. Subtle signals confidence without feeling like a discount site.

**Security:** The promo code is re-validated server-side immediately before the Stripe PaymentIntent is created. A code that was valid at step 5 but reaches its usage limit before payment must be rejected at PaymentIntent creation time with a clear error. This prevents double-use from concurrent sessions.

### Admin Status Change Workflow (BOOKINGS-07)

**Expected statuses:** `pending` (default on creation) → `confirmed` → `completed` → `cancelled`. These are the four statuses standard across QuanticaLabs, Moovs, and LimoAnywhere.

**UX in admin:** Status displayed as a badge in the bookings table row. Clicking the badge (or expanding the row) reveals a dropdown or button set to transition to allowed next statuses. Only valid transitions allowed (e.g., `completed` cannot revert to `pending`).

**Client notification:** When operator changes `pending` → `confirmed`, an email is sent to the client via Resend: "Your booking [REF] has been confirmed." When `cancelled`, a separate cancellation email is sent. No email for `completed` (internal ops state). This matches industry norm: clients receive confirmation and cancellation emails; completion is an internal marker.

**No notification for notes or manual internal changes.** Operator notes are strictly internal.

### Cancellation + Refund (BOOKINGS-08)

**Flow:** Operator clicks "Cancel booking" in expanded booking row → modal appears with two options: "Refund payment" (checked by default) and "Cancel without refund". If "Refund payment" is checked, the full Stripe charge amount is shown. Operator confirms → server calls `stripe.refunds.create({ payment_intent: '...' })` → status set to `cancelled` → cancellation email sent to client.

**Why full refund only (no partial in v1.3):** Partial refunds require operator judgment on correct amount, cannot be undone in Stripe, and create accounting ambiguity. Premium operators handling exceptional cases can use the Stripe Dashboard directly. Industry standard for v1 admin tools is full-or-nothing.

**Refund timing:** Stripe refunds post within 5–10 business days (card network dependent). The admin UI should show "Refund initiated" state, not "Refund completed" — do not imply instant credit to avoid client confusion.

### Manual Booking Creation (BOOKINGS-06)

**Use case:** Client calls, operator takes the booking by phone. Must enter the same data as the wizard collects (pickup, dropoff, date/time, vehicle class, client details, trip type) plus be able to skip payment (mark as "payment collected offline").

**Form location:** `/admin/bookings/new` — a full form, not an embedded modal. Booking is saved directly to `bookings` table with `status: 'confirmed'` (operator already confirmed on the phone) and a generated `booking_reference`.

**No Stripe payment flow.** Manual bookings bypass the payment step. The `payment_intent_id` column should be nullable to support this.

**Client email:** After manual booking creation, operator can choose to send the standard confirmation email to the client's entered email address. This should be opt-in (checkbox "Send confirmation email to client"), not automatic — operator may have already confirmed verbally.

### Operator Notes (BOOKINGS-09)

**Location:** Inside the expanded booking row in the bookings table. A small textarea labeled "Internal notes (not visible to client)". Auto-saves on blur via PATCH to `/api/admin/bookings/[id]`. No separate save button needed — inline auto-save matches dispatch software patterns.

**Not client-facing.** Notes never appear in client emails or on the confirmation page. The label should make this explicit.

### Mobile Admin (UX-01)

**Primary operator use case on mobile:** Check incoming bookings, change status (pending → confirmed), view booking details, add notes. Pricing editor and zone editor are secondary on mobile — acceptable to be functional but not optimized.

**Breakpoint strategy:** Single breakpoint at 768px. Below 768px: sidebar collapses to a hamburger menu; bookings table switches to card layout (one card per booking showing key fields: reference, client name, date, status, amount); action buttons (status change, cancel) remain accessible via card expand. Above 768px: current desktop layout unchanged.

**Touch targets:** 44px minimum (already enforced in wizard; apply same standard to admin buttons).

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Zone OR-logic fix (ZONES-06) | HIGH — fixes incorrect price suppression on real bookings | LOW — logic change, no schema | P1 |
| Status workflow (BOOKINGS-07) | HIGH — core ops visibility; unlocks cancel/refund | MEDIUM — migration + UI + email | P1 |
| Cancellation + Stripe refund (BOOKINGS-08) | HIGH — clients expect refunds; operator needs single-screen control | MEDIUM — Stripe API call + modal | P1 |
| Manual booking / phone orders (BOOKINGS-06) | HIGH — significant revenue channel | MEDIUM — admin form + nullable payment_intent | P1 |
| Operator notes (BOOKINGS-09) | MEDIUM — ops quality; prevents missed instructions | LOW — column + inline edit | P1 |
| Holiday dates config (PRICING-07) | MEDIUM — coefficients exist but are never applied automatically | MEDIUM — new table + admin UI + pricing engine check | P1 |
| Minimum fare (PRICING-08) | MEDIUM — financial protection; short trips otherwise uneconomical | LOW — extend pricing_config + pricing engine | P1 |
| Mobile admin (UX-01) | MEDIUM — operator uses phone in field | MEDIUM — responsive CSS + card layout | P1 |
| Promo codes - admin CRUD (PROMO-01/02) | MEDIUM — sales tool for corporate accounts | MEDIUM — new table + admin UI | P2 |
| Promo codes - client entry + validation (PROMO-03/04) | MEDIUM — client-facing; requires careful UX | HIGH — wizard integration + atomic validation + PaymentIntent amount | P2 |

**Priority key:**
- P1: Must ship in v1.3
- P2: Ship in v1.3 but can be a later phase within the milestone
- P3: Defer to v2

---

## Competitor Feature Analysis

| Feature | QuanticaLabs (WordPress plugin) | Moovs / LimoAnywhere (SaaS) | Prestigo v1.3 Approach |
|---------|---------------------------------|-----------------------------|------------------------|
| Booking status workflow | pending / confirmed / cancelled / completed | Same + in-progress, en-route | Same four statuses; manual transitions only; no auto-progression |
| Manual booking entry | Full form with driver assignment | Same + affiliate bookings | Admin form at /admin/bookings/new; no driver assignment (solo operator) |
| Refund on cancel | Admin-initiated; Stripe Dashboard link | Integrated Stripe refund in UI | Integrated full refund toggle in cancel modal; no partial refund in v1.3 |
| Promo codes | Admin creates codes, client enters in checkout, server validates | Same + percentage + flat amount | Percentage discount only in v1.3; atomic usage decrement prevents double-use |
| Status change notifications | Email on confirm; SMS optional | Email + SMS | Email only (Resend); SMS deferred to v2 |
| Holiday pricing | Operator sets holiday multiplier, applies manually or via date rules | Date range rules with coefficient | Explicit `holiday_dates` table; auto-applies `holiday_coefficient` at price calculation |
| Minimum fare | Per-vehicle-class min fare field in pricing config | Same | Same pattern; added to existing `pricing_config` table |
| Mobile admin | Responsive (plugin uses WP admin responsive) | Native mobile app | Tailwind responsive CSS; card layout below 768px |
| Operator notes | Notes field on booking | Same | Notes textarea inline in booking row; auto-saves on blur |

---

## Sources

- [Voucherify — Coupon UX Best Practices](https://www.voucherify.io/blog/coupon-promotions-ui-ux-best-practices-inspirations) — MEDIUM confidence (UX authority)
- [Econsultancy — Promotions and Discounts UX](https://econsultancy.com/promotions-discounts-ux-ecommerce/) — MEDIUM confidence
- [Stripe Refunds Documentation](https://docs.stripe.com/refunds) — HIGH confidence (official)
- [QuanticaLabs Custom Notifications Add-on](https://codecanyon.net/item/custom-notifications-addon-chauffeur-taxi-booking-system/56731397) — MEDIUM confidence (industry reference)
- [QuanticaLabs Chauffeur Booking System](https://quanticalabs.com/wordpress-plugins/chauffeur-taxi-booking-system-for-wordpress/) — MEDIUM confidence (competitor feature reference)
- [Moovs Transportation Software](https://www.moovsapp.com/) — MEDIUM confidence (competitor reference)
- [GitHub Security Advisory — Race Condition in Promo Codes (alf.io)](https://github.com/alfio-event/alf.io/security/advisories/GHSA-67jg-m6f3-473g) — HIGH confidence (documented real vulnerability)
- [HackerOne — Race Condition in Redeeming Coupons (Instacart)](https://hackerone.com/reports/157996) — HIGH confidence (documented real exploit)
- [Gitnux — Top Chauffeur Software 2026](https://gitnux.org/best/chauffeur-software/) — LOW confidence (aggregator, use for market context only)
- [TransferVista — Chauffeur Booking Software Guide](https://transfervista.com/chauffeur-booking-software/) — MEDIUM confidence
- Codebase analysis: `lib/pricing.ts`, `app/api/calculate-price/route.ts`, `app/admin/` directory, `supabase/migrations/` — HIGH confidence (source of truth for existing system)

---

*Feature research for: PRESTIGO v1.3 Pricing & Booking Management*
*Researched: 2026-04-03*
