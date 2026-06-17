# Requirements — Milestone v2.0: Blacklane-style Booking + Customer Accounts

## Scope

Rebuild the booking experience to match Blacklane's polish (visual + behavioural) and introduce customer authentication and accounts (personal/corporate) on rideprestigo.com. Add a Sign in button to the header and optional sign-in inside the booking flow. Preserve every existing Google/Meta analytics signal and keep guest checkout always available.

The existing 6-step booking wizard (`components/booking/BookingWizard.tsx`), Zustand store (`lib/booking-store.ts`) and pricing APIs are already structurally Blacklane-like — this milestone refines them, it does not start from scratch. Customer auth reuses the admin Supabase Auth (GoTrue) stack; admin auth is untouched.

---

## AUTH — Customer Authentication

- [x] **AUTH-01**: Customer can sign in by email (magic-link or password) via Supabase Auth, separate from admin auth
- [x] **AUTH-02**: Customer can sign in with Google OAuth
- [x] **AUTH-03**: Customer can sign in with Apple OAuth
- [x] **AUTH-04**: Customer can register and choose account type — personal or corporate
- [x] **AUTH-05**: Customer session and admin session coexist without conflict; middleware gates customer account routes, never interfering with `/admin` gating
- [x] **AUTH-06**: Customer profile stored in new table (migration `044_customer_profiles.sql`) with `account_type` (personal/corporate) and FK to `auth.users`; RLS isolates each user's own row
- [x] **AUTH-07**: Customer can sign out from any account-aware surface

## NAV — Header

- [x] **NAV-01**: Header (desktop + mobile) has a **Sign in** button that routes to the customer login page, placed before the existing "Book now" CTA in `components/Nav.tsx`
- [x] **NAV-02**: When a customer is logged in, the header shows an account/sign-out affordance instead of "Sign in"

## ACCT — Account Dashboard

- [x] **ACCT-01**: "My trips" page exists and presents the booking-history surface for the logged-in customer with an appropriate empty state. _Phase 58 scope: UI shell + empty state only. Real history listing (bookings linked to `user_id`) is deferred to **Phase 60** per D-01 / migration `045` header comment._
- [x] **ACCT-02**: Customer can view and edit their profile (contact details, saved passenger info)
- [x] **ACCT-03**: Corporate account exposes and saves the core corporate fields — company name, IČO, DIČ/VAT — shown only when `account_type = corporate`. _Cost centre and the "book for a guest" option are deferred (cost centre → later B2B phase; "book for a guest" → **Phase 59** BOOK-06, a booking-time action) per D-04._
- [x] **ACCT-04**: New bookings made by a logged-in customer are linked to their `user_id` via a nullable FK on `bookings`; anonymous/guest bookings remain valid and unaffected

## BOOK — Booking Flow Redesign (Blacklane UI/UX)

- [x] **BOOK-01**: Unified route + date + time entry bar in Blacklane style (one consolidated entry surface rather than two separate steps)
- [x] **BOOK-02**: Pickup-time selection via a time-slot dropdown
- [x] **BOOK-03**: Inline "flight number" field surfaced for airport transfers
- [x] **BOOK-04**: Route map showing pickup time and drop-off time alongside vehicle selection ("Choose your experience")
- [x] **BOOK-05**: Vehicle class cards show "What's included" and capacity tabs (luggage / seating)
- [ ] **BOOK-06**: Booking-method step lets the user choose "Book for myself (account)" or "Book as guest"; corporate accounts also get "Book for a guest"
- [ ] **BOOK-07**: A logged-in customer's contact details are pre-filled in the passenger step
- [ ] **BOOK-08**: Guest checkout is available at every stage — sign-in is always optional, never blocking

## TRACK — Analytics Preservation (cross-cutting guardrails)

- [x] **TRACK-01**: All existing GA4 funnel events fire in the rebuilt flow with no loss (`form_start`, `checkout_progress`, `view_item_list`, `view_item`, `begin_checkout`, `add_payment_info`, `purchase`, `generate_lead`)
- [ ] **TRACK-02**: All Meta Pixel + CAPI events preserved (`InitiateCheckout`, `AddPaymentInfo`, `Purchase`), including `eventId` deduplication
- [x] **TRACK-03**: Price snapshot (sessionStorage, `lib/analytics-snapshot.ts`) and server-side GA4 Measurement Protocol in the Stripe webhook continue to fire `purchase`
- [ ] **TRACK-04**: GA4 `login` and `sign_up` events fire on customer sign-in and registration
- [x] **TRACK-05**: CSP nonce propagation and Consent Mode v2 gating are not broken by new scripts, routes, or the OAuth redirect flow

---

## Future Requirements (deferred)

- Corporate teams / multi-user accounts, seat management, role permissions — only a single corporate profile in v2.0
- Corporate invoicing, monthly billing, cost-centre reporting/exports — basic fields only for now
- Saved payment methods / stored cards — Stripe one-off payments only
- Facebook OAuth — Google + Apple only this milestone
- Multilingual account & auth UI (Czech, Russian) — English only

## Out of Scope

- Replacing Stripe or adding alternative payment rails
- Migrating admin auth or changing the admin session model
- Forcing account creation — guest checkout must always remain
- Rewriting the pricing engine or `/api/calculate-price` logic — reused as-is

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 57 | Complete |
| AUTH-02 | Phase 57 | Complete |
| AUTH-03 | Phase 57 | Complete |
| AUTH-04 | Phase 57 | Complete |
| AUTH-05 | Phase 57 | Complete |
| AUTH-06 | Phase 57 | Complete |
| AUTH-07 | Phase 57 | Complete |
| NAV-01 | Phase 58 | Complete |
| NAV-02 | Phase 58 | Complete |
| ACCT-01 | Phase 58 | Complete |
| ACCT-02 | Phase 58 | Complete |
| ACCT-03 | Phase 58 | Complete |
| ACCT-04 | Phase 57 | Complete |
| BOOK-01 | Phase 59 | Complete |
| BOOK-02 | Phase 59 | Complete |
| BOOK-03 | Phase 59 | Complete |
| BOOK-04 | Phase 59 | Complete |
| BOOK-05 | Phase 59 | Complete |
| BOOK-06 | Phase 60 | Pending |
| BOOK-07 | Phase 60 | Pending |
| BOOK-08 | Phase 60 | Pending |
| TRACK-01 | Phase 59 (verified Phase 61) | Complete |
| TRACK-02 | Phase 59 (verified Phase 61) | Pending |
| TRACK-03 | Phase 59 (verified Phase 61) | Complete |
| TRACK-04 | Phase 60 (verified Phase 61) | Pending |
| TRACK-05 | Phase 59 (verified Phase 61) | Complete |

**Coverage:** 26/26 v2.0 requirements mapped — no orphans, no duplicates. Each TRACK requirement has a primary owner phase; Phase 61 is end-to-end verification.

---

*Last updated: 2026-06-10 — Traceability filled by roadmapper. All 26 v2.0 requirements mapped to Phases 57-61.*
