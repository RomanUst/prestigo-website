# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- ✅ **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (shipped 2026-09-02)
- ✅ **v3.0 Site Internationalization (i18n)** — Phases 68-75 (shipped 2026-09-27)

## Phases

<details>
<summary>✅ v3.0 Site Internationalization (Phases 68-75) — SHIPPED 2026-09-27</summary>

- [x] Phase 68: i18n Foundation & Routing (2/2 plans) — completed 2026-09-03
- [x] Phase 69: String Externalization — UI Chrome (5/5 plans) — completed 2026-09-04
- [x] Phase 70: String Externalization — Booking & Account (8/8 plans) — completed 2026-09-05
- [x] Phase 71: Content Externalization — Marketing & SEO Pages (9/9 plans) — completed 2026-09-11
- [x] Phase 72: AI Translation Pipeline & Catalogs (5/5 plans) — completed 2026-09-17
- [x] Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) (14/14 plans) — completed 2026-09-20
- [x] Phase 74: SEO — hreflang, Metadata, Sitemap, Switcher (6/6 plans) — completed 2026-09-24
- [x] Phase 75: E2E Verification & Launch (36/36 plans) — completed 2026-09-27

See [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v1.0 SEO Blog (Phases 54-56) — SHIPPED 2026-05-15</summary>

**Milestone Goal:** Scalable MDX blog at `/blog` with full SEO wiring, unified listing, and migrated legacy articles accessible at canonical `/blog/*` paths.

- [x] **Phase 54: MDX Infrastructure** — @next/mdx pipeline, lib/blog.ts aggregator, content/blog/ (2/2 plans, completed 2026-05-14)
- [x] **Phase 55: Blog UI — Listing + Article Pages** — /blog card grid + /blog/[slug] MDX renderer, full SEO (3/3 plans, completed 2026-05-14)
- [x] **Phase 56: Article Migration + SEO Wiring** — git mv 3 JSX articles, 301 redirects, sitemap reconciliation (4/4 plans, completed 2026-05-15)

See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.0 Blacklane-style Booking + Customer Accounts (Phases 57-61) — SHIPPED 2026-06-18</summary>

**Milestone Goal:** Customers can sign in (email + Google + Apple), manage a personal or corporate account with a "My trips" dashboard, and complete a redesigned Blacklane-style booking flow — with optional in-checkout sign-in, bookings linked to `user_id`, guest checkout always available, and zero analytics regression.

- [x] **Phase 57: Customer Auth Foundation** — Supabase Auth (email + Google + Apple), customer_profiles, nullable user_id FK, session split (3/3 plans, completed 2026-06-11)
- [x] **Phase 58: Sign-in UI + Account Dashboard** — Auth-aware Nav, login/signup pages, My trips shell, profile editing, corporate fields (5/5 plans, completed 2026-06-12)
- [x] **Phase 59: Booking Flow Redesign (Blacklane)** — Unified EntryBar, time-slot picker, inline flight field, RouteMap, VehicleCard + VehicleSlideshow, analytics preserved (5/5 plans, completed 2026-06-17)
- [x] **Phase 60: Auth-in-Checkout + Guest Path** — user_id linking, passenger pre-fill, guest checkout always available (1/1 plan, completed 2026-06-17)
- [x] **Phase 61: Analytics Preservation & E2E Verify** — E2E verification of GA4/Meta/CAPI events across guest + account paths (1/1 plan, completed 2026-06-17)

**Known deferred items:** BOOK-06 (corporate "book for a guest" step) deferred to v2.1. AUTH-02/03 (Google/Apple OAuth) code-complete — awaiting Supabase Dashboard credential config.

See [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.1 Admin Booking Management & Payment Recovery (Phases 62-64) — SHIPPED 2026-08-26</summary>

**Milestone Goal:** Give the operator full control of the booking lifecycle inside the admin panel — edit bookings with automatic client notification, capture abandoned/unpaid bookings for follow-up, and create bookings with an attachable payment link and client email.

- [x] **Phase 62: Abandoned & Unpaid Booking Capture** — Checkout attempts persisted before payment completes, surfaced as a followable unpaid queue in admin, reconciled without duplicates on payment success (4/4 plans, completed 2026-08-20)
- [x] **Phase 63: Admin Booking Editing + Change Notification** — Operator edits schedule/vehicle/route/passenger, server-authoritative price-change review, optional branded change-notification email, per-field edit audit log (5/5 plans, completed 2026-08-21)
- [x] **Phase 64: Admin-Created Bookings with Payment Link** — Admin-originated bookings with optional Stripe payment link + client email, auto no-duplicate reconcile (incl. round-trip both legs), or no-link cash/invoice save (4/4 plans, completed 2026-08-25)

**Audit:** passed — 19/19 requirements satisfied, cross-phase integration sound, all E2E flows complete. See [milestones/v2.1-MILESTONE-AUDIT.md](milestones/v2.1-MILESTONE-AUDIT.md).

See [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.2 Dispatch & Driver Trip Portal (Phases 65-67) — SHIPPED 2026-09-02</summary>

**Milestone Goal:** Speed up dispatcher work with a future-first admin bookings list (persistent default + in-session filters), and give each driver a permanent working link to their trip — a trip sheet they can show to police control, with live status marking and an optional note that stay separate from the client-facing booking status.

- [x] **Phase 65: Dispatch — Future-First Bookings List** — Future-first admin bookings list with a persistent default-horizon setting + in-session past/all filters; KPI counters stay accurate (4/4 plans, completed 2026-08-31)
- [x] **Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet** — Permanent, unguessable per-assignment link to a noindex trip sheet, coexisting with the existing accept/decline flow (2/2 plans, completed 2026-09-01)
- [x] **Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility** — Driver marks live trip-progress and leaves an optional note; admin sees it in the bookings admin, with no effect on `booking.status` or GNet (2/2 plans, completed 2026-09-02)

**Audit:** passed — 12/12 requirements satisfied, cross-phase integration INTEGRATED, all E2E flows wired. See [milestones/v2.2-MILESTONE-AUDIT.md](milestones/v2.2-MILESTONE-AUDIT.md).

See [milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md) for full phase details.

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 54. MDX Infrastructure | v1.0 | 2/2 | Complete | 2026-05-14 |
| 55. Blog UI — Listing + Article Pages | v1.0 | 3/3 | Complete | 2026-05-14 |
| 56. Article Migration + SEO Wiring | v1.0 | 4/4 | Complete | 2026-05-15 |
| 57. Customer Auth Foundation | v2.0 | 3/3 | Complete | 2026-06-11 |
| 58. Sign-in UI + Account Dashboard | v2.0 | 5/5 | Complete | 2026-06-12 |
| 59. Booking Flow Redesign (Blacklane) | v2.0 | 5/5 | Complete | 2026-06-17 |
| 60. Auth-in-Checkout + Guest Path | v2.0 | 1/1 | Complete | 2026-06-17 |
| 61. Analytics Preservation & E2E Verify | v2.0 | 1/1 | Complete | 2026-06-17 |
| 62. Abandoned & Unpaid Booking Capture | v2.1 | 4/4 | Complete | 2026-08-20 |
| 63. Admin Booking Editing + Change Notification | v2.1 | 5/5 | Complete | 2026-08-21 |
| 64. Admin-Created Bookings with Payment Link | v2.1 | 4/4 | Complete | 2026-08-25 |
| 65. Dispatch — Future-First Bookings List | v2.2 | 4/4 | Complete | 2026-08-31 |
| 66. Driver Trip Portal — Permanent Link & Trip Sheet | v2.2 | 2/2 | Complete | 2026-09-01 |
| 67. Driver Trip Portal — Status Marking, Notes & Admin Visibility | v2.2 | 2/2 | Complete | 2026-09-02 |
| 68. i18n Foundation & Routing | v3.0 | 2/2 | Complete    | 2026-09-03 |
| 69. String Externalization — UI Chrome | v3.0 | 5/5 | Complete    | 2026-09-04 |
| 70. String Externalization — Booking & Account | v3.0 | 8/8 | Complete    | 2026-09-05 |
| 71. Content Externalization — Marketing & SEO Pages | v3.0 | 9/9 | Complete    | 2026-09-11 |
| 72. AI Translation Pipeline & Catalogs | v3.0 | 5/5 | Complete    | 2026-09-17 |
| 73. Non-Latin & RTL Infra (AR, HI, ZH) | v3.0 | 14/14 | Complete    | 2026-09-20 |
| 74. SEO — hreflang, Metadata, Sitemap, Switcher | v3.0 | 6/6 | Complete    | 2026-09-24 |
| 75. E2E Verification & Launch | v3.0 | 36/36 | Complete    | 2026-09-27 |

## Backlog

v3.0 tech debt, deferred by owner decision 2026-09-27 until Anthropic API credits are topped up. Source: milestones/v3.0-MILESTONE-AUDIT.md, milestones/v3.0-phases/75-*/deferred-items.md, .planning/WINDOWS.md.

- [ ] **999.1 Re-enable AI translation** — top up Anthropic API credit, re-enable the i18n Translate GH workflow; translate + publish the parked `_deferred-blog/prague-to-budapest-private-transfer.mdx` in 6 locales
- [ ] **999.2 Localized client emails + confirmation page** — thread booking locale into `lib/email*.ts` (16 templates) and localize `app/[locale]/book/confirmation/page.tsx` (WINDOWS #21, D-05)
- [ ] **999.3 Remaining translation content** — `/routes` hub per-route blurbs (WINDOWS #16); ArticleByline "By/Published/Updated" + locale-aware byline/blog-card dates; catalog residual (293 leaf findings on unscanned pages — triage via `scripts/qa/en_leak_catalog.py`); `/ru/fleet` 768px overflow
- [ ] **999.4 Content-rule fix** — remove the Uber comparison from `/services/airport-transfer` FAQ (EN + 6 locales) and review airport blog posts (no Uber, no prices)
- [ ] **999.5 RU/AR signed-in booking E2E** — owner creates test account + `scripts/qa/.e2e-account.json`, run `booking_e2e.py --locales "" --account ru,ar` (WINDOWS #25, VER-01 override)
- [ ] **999.6 SEO/share polish** — og:locale on openGraph overrides, mirror custom og:image to twitter:image, page-specific share titles; IN-01 MDX locale double-prefix guard; IN-02 per-field `t.has`; GSC hreflang report check
- [ ] **999.7 Meta/CAPI robustness** — WR-06 warn-once on malformed pixel ID/CAPI token; IN-03 encode CAPI token via `URL.searchParams`
- [ ] **999.8 Test/QA infra** — fix worktree `next-intl/server` relative-path import in 5 test files (WINDOWS #17–19); QA-script fixes (share_meta asymmetric check, en_leak icon-child skip, IN-04 route.abort); close stale WINDOWS #8; Nyquist `/gsd-validate-phase` for 68–75; Playwright E2E in CI once Vercel Preview works. IN-05 (raw 404 without `lang`) = Next.js framework behaviour, won't-fix
