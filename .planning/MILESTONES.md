# Milestones

## v2.1 Admin Booking Management & Payment Recovery (Shipped: 2026-08-26)

**Phases completed:** 3 phases, 13 plans, 28 tasks

**Key accomplishments:**

- Proved the whole Phase-62 architecture end-to-end on the thinnest path: a booking row is now written as `unpaid` at PaymentIntent creation and reconciled to `confirmed` by the Stripe webhook (one-way path).
- Client-generated `attempt_id` now dedups every checkout retry to one unpaid row per (attempt, leg), and round-trip attempts capture and reconcile both legs atomically — the operator's unpaid follow-up queue stays clean for both one-way and round-trip checkouts.
- Unpaid bookings now get a distinct amber "Unpaid" badge and row tint in the admin list, a dedicated "Unpaid" filter chip independent of trip-type, and a double-gated unpaid→confirmed/unpaid→cancelled transition — turning the captured unpaid rows from 62-01/62-02 into a usable revenue-recovery queue.
- Closed the live-schema gap: migrations 053 + 054 are applied to the production `rideprestigo` project, so the live DB now matches the phase-62 code (unpaid status, attempt_id capture key, and the admin status filter).
- booking_edit_audit_log table (migration 055) applied to live Supabase, plus a branded changed-fields-only diff email (sendBookingChangedEmail/buildChangeEmailHtml) that reuses the existing status-email shell chrome.
- Cheap-field trip-edit PATCH branch (pickup date/time, contact fields, flight number) with per-field audit trail and a notify_client && booking_changed AND-gate, plus a new admin-guarded GET audit-log history route — the backend spine end-to-end from Plan 01's migration and email builder through to a readable change history.
- Server-authoritative price recompute (never trusting client amount_czk), tolerance-gated 422, explicit-override acceptance, and per-field audit trail for vehicle_class/route/distance_km changes — faithfully ported from the existing POST-handler recompute+override block into the PATCH trip-edit branch, with leg isolation, notification idempotency, and integer-CZK precision pinned by tests.
- Lazy-per-row-fetch `BookingChangeHistory` component (mirrors `FlightStatusBlock`'s fetch pattern) rendering the Plan 02 audit-log route's rows grouped by shared `changed_at`, newest-first, covering every UI-SPEC state (empty/loading/error+retry/populated) with inline-style-only navy/gold styling.
- Inline trip-edit mode in BookingsTable.tsx's expandable row — per-field save controls for date/time, name, email, phone, and flight number, plus a vehicle-class/route price-review step (AddressInput + /api/calculate-price + old->new diff + override + notify toggle + 422 handling) and BookingChangeHistory mounted in both mobile and desktop views.
- Stripe Payment Link generation with server-authoritative amount, persisted URL, branded payment-request email, and a `checkout.session.completed` webhook branch that reconciles the same `unpaid` booking row to `confirmed` with no duplicate insert.
- D-05 attach-later `[id]/payment-link` route (generate + resend, status set directly) plus round-trip payment-link support: shared-`payment_intent_id` sibling detection with combined-amount email framing, and a webhook branch that reconciles both legs of a round-trip pair with one combined confirmation.
- Wired the Plan 01/02 payment-link backend onto the operator UI: `ManualBookingForm.tsx` gained a "Collect payment via link" toggle with a no-link status choice and a post-create result panel (copy/resend/EUR), and `BookingsTable.tsx` gained a row-level "Generate Payment Link" action + the same result panel for existing unpaid/pending bookings — all in the established navy/gold inline-style admin idiom, no shadcn.

**Milestone audit:** passed — 19/19 requirements satisfied, cross-phase integration sound, all E2E flows complete (see milestones/v2.1-MILESTONE-AUDIT.md).

**Known verification overrides:** 8 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items). Closeout type: override_closeout. Notable non-blocking tech debt: CR-02 Stripe Payment Link deactivation follow-up, 12 pre-existing failing test files (baseline, not v2.1 regressions), Nyquist validation not run on 62/63/64.

---

## v2.0 Blacklane-style Booking + Customer Accounts (Shipped: 2026-06-18)

**Phases completed:** 8 phases, 22 plans, 24 tasks

**Key accomplishments:**

- @next/mdx pipeline installed with createMDX()-wrapped next.config.ts, minimal mdx-components.tsx, and first real MDX article in content/blog/.
- BlogPost type + getAllPosts() aggregator merging MDX frontmatter and JSX_POSTS registry, plus minimal MDX render route proving @next/mdx pipeline end-to-end.
- Three RED test stubs for BlogCard rendering, BlogPosting JSON-LD schema, and sitemap /blog entries — gating Plans 02 and 03 via TDD contract.
- /blog listing page with 3-column card grid, full SEO metadata, and accessible BlogCard component wired to getAllPosts() newest-first.
- MDX article page with BlogPosting JSON-LD, Prestigo prose styling, full SEO metadata, and sitemap registration — two RED test suites turned GREEN.
- Three legacy JSX articles moved from app/guides/ and app/compare/ to app/blog/ via atomic git mv (history preserved for lastModFor()), all 30 URL occurrences rewritten via const CANONICAL_PATH, and sitemap test inverted to RED as TDD prerequisite for Plan 03.
- Task 1 commit
- Removed 5 legacy `/compare/*` and `/guides/*` sitemap entries; added 3 explicit `/blog/<slug>` entries for migrated JSX articles so sitemap.xml matches the new canonical paths.
- Deleted app/guides/page.tsx and app/compare/page.tsx — eliminating contradictory canonical signals; verified JSX_POSTS registry complete for all 3 migrated articles (MIG-06 pre-completed in phase 54)
- customer_profiles table with RLS isolation + nullable bookings.user_id FK + Wave-0 failing test scaffold for AUTH-01..07 + ACCT-04.
- Customer auth surface: middleware gating + email/OAuth server actions + /auth/callback with profile upsert + /login UI per UI-SPEC + gated /account with sign-out — Wave-0 tests turned GREEN.
- Migrations 044 + 045 applied to the live Supabase database after an RLS pre-check; live schema verified, types regenerated, full automated gate green, and the manual OAuth/email round-trips approved by the user.
- bf0ee43
- Migrations 047 (customer_profiles profile + corporate fields) and 048 (saved_passengers with own-row RLS, partial unique is_default index, and updated_at trigger) applied to live Supabase DB; TypeScript types regenerated
- Client-side `onAuthStateChange` subscription in Nav renders guest "Sign in" button (desktop + mobile) and signed-in account dropdown (My trips / Profile / Sign out) without any server-side auth call — marketing pages remain statically rendered (D-09).
- Force-dynamic auth-gated /account overview (heading, email, two nav cards) and /account/trips empty-state shell ("No trips yet" + Book a transfer CTA) with zero DB query per D-01.
- Full profile-editing surface — server actions (updateProfile/addPassenger/updatePassenger/deletePassenger) with IDOR guard, ProfileForm client component (contact/corporate/passenger editor), and force-dynamic server component loading customer_profiles + saved_passengers via Promise.all.
- Wikimedia Commons photos committed as placeholder vehicle images (12 JPEGs in /public/vehicles/) with VEHICLE_CONFIG repointed from legacy e-class-photo.png paths to new exterior JPGs — unblocking VehicleCard and VehicleSlideshow components.
- tests/EntryBar.test.tsx
- Unified EntryBar (15-min AM/PM combobox, conditional flight field, hideMultiDay tabs) replaces Step1TripType + Step2DateTime; BookingWizard renumbered from 6 to 5 steps with begin_checkout relocated and all booking tests green.
- Animated Google Maps route with copper dot + time labels (BOOK-04) and sticky desktop booking panel with relocated begin_checkout/InitiateCheckout analytics (TRACK-02).
- Blacklane two-column vehicle step: VehicleSlideshow auto-play, VehicleCard 3/2 photo + What's included (D-16), Step3Vehicle with StickyBookingPanel right panel

---

## ✅ v1.0 — SEO Blog (shipped 2026-05-15)

Scalable MDX-powered blog at `/blog` to capture organic search traffic, with 3 legacy articles migrated into one canonical hub.

- Phase 54: MDX Infrastructure (`@next/mdx` pipeline, `lib/blog.ts` aggregator, `content/blog/`)
- Phase 55: Blog UI — `/blog` listing card grid + `/blog/[slug]` MDX article renderer with full SEO
- Phase 56: Article migration + SEO wiring — 3 JSX articles `git mv`'d to `/blog/*`, 5 permanent 301s, sitemap reconciled

## 🚧 v2.0 — Blacklane-style Booking + Customer Accounts (in progress, started 2026-06-10)

Rebuild the booking experience Blacklane-style (visual + behavioural), add customer authentication (email + Google + Apple) and accounts (personal/corporate), preserve all analytics, keep guest checkout always available.

- Phase 57: Customer Auth Foundation
- Phase 58: Sign-in UI + Account Dashboard
- Phase 59: Booking Flow Redesign (Blacklane)
- Phase 60: Auth-in-Checkout + Guest Path
- Phase 61: Analytics Preservation & E2E Verify
