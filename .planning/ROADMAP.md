# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- ✅ **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (shipped 2026-09-02)
- 🚧 **v3.0 Site Internationalization (i18n)** — Phases 68-75 (planning, started 2026-09-03)

## Phases

<details open>
<summary>🚧 v3.0 Site Internationalization (Phases 68-75) — IN PLANNING</summary>

**Milestone Goal:** Make the whole public site multilingual — English stays the default at root (existing URLs unchanged, zero ranking risk), and six locales (RU, ES, FR, AR, HI, ZH) are served under subpaths with full SEO wiring. UI chrome, booking flow, account, and the complete SEO content set are translated by an AI-only, re-runnable pipeline. Arabic ships RTL; Hindi and Chinese ship with Noto Devanagari/SC fonts.

**Locales:** `en` (root, default) · `/ru/` · `/es/` · `/fr/` · `/ar/` (RTL) · `/hi/` · `/zh/`

- [x] **Phase 68: i18n Foundation & Routing** — next-intl + `app/[locale]/` (`localePrefix: as-needed`, EN at root), 7-locale config, locale-middleware composed into existing CSP/Supabase/CSRF chain, dynamic `<html lang>`/`dir`, per-locale not-found. Public routes move under `[locale]` rendering EN only (no translation yet). Risk-first. — I18N-01/02/03/04 (completed 2026-09-03)
- [x] **Phase 69: String Externalization — UI Chrome** — Nav, Footer, Hero, Services, Fleet, HowItWorks, Testimonials, CookieBanner, FeatureStrip → `messages/en.json` + `useTranslations`; namespace conventions established. — STR-01 (completed 2026-09-04)
- [x] **Phase 70: String Externalization — Booking & Account** — Booking wizard/EntryBar/vehicle cards, forms, validation/error/toast, account + auth pages. — STR-02 (completed 2026-09-05)
- [ ] **Phase 71: Content Externalization — Marketing & SEO Pages** — Home long-form, 8 service pages, about/faq/contact/corporate/legal, 29–30 route-page bodies, blog → `content/blog/<locale>/`. Largest content restructure (may split 71a/71b). — CNT-01/02/03
- [ ] **Phase 72: AI Translation Pipeline & Catalogs** — Build re-runnable `scripts/i18n-translate.mjs` (glossary + do-not-translate); generate RU/ES/FR catalogs + content; QA sampling. — TR-01/02
- [ ] **Phase 73: Non-Latin & RTL Infra (AR, HI, ZH)** — `dir="rtl"` for AR, logical-property audit + fixes (~42 files), Noto Arabic/Devanagari/SC via next/font, generate + render AR/HI/ZH, RTL visual QA. — RTL-01, FONT-01, TR-02
- [ ] **Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher** — `getAlternates`→6+`x-default`, locale-aware `generateMetadata`, sitemap all-locale URLs + alternates, JSON-LD `inLanguage`, language switcher + `NEXT_LOCALE` cookie, Accept-Language detection. — SEO-01/02/03/04, UX-01/02
- [ ] **Phase 75: E2E Verification & Launch** — Cross-locale E2E (render, switcher, per-locale booking incl. RTL, analytics locale dimension, no EN leakage, hreflang validator, Rich Results, no CSP regression, guest checkout intact); clear red baseline in touched files. — VER-01

**Proposed execution order:** 68 → 69 → 70 → 71 → 72 → 73 → 74 → 75 (69 and 70 may run in parallel after 68; 71 and 72 pipeline can overlap once the content model from 71 is stable).

### Phase 68: i18n Foundation & Routing

**Goal**: The public site is served through next-intl locale routing with English at the root (existing English URLs unchanged, `localePrefix: 'as-needed'`), all seven locales configured as a single typed source, the locale middleware composed non-destructively into the existing CSP/Supabase/CSRF chain, and per-locale `<html lang>`/`dir` plus not-found handling in place — with public routes rendering under `app/[locale]/` in English only (no translations yet).
**Depends on**: Nothing (first phase of v3.0; continues from Phase 67)
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04
**Success Criteria** (what must be TRUE):

  1. Existing English URLs resolve unchanged at the root with no `/en` prefix (`localePrefix: 'as-needed'`), and public routes now render from `app/[locale]/`.
  2. The composed `middleware.ts` preserves the per-request CSP nonce, Supabase `updateSession`, and CSRF Origin-guard behavior byte-for-byte, with locale detection added; admin/api/auth/driver routes stay non-localized at root.
  3. `<html lang>` and `dir` are emitted dynamically per locale (`dir="rtl"` for `ar`), and each locale resolves a per-locale not-found page.
  4. Locale config is typed and single-source for `en, ru, es, fr, ar, hi, zh`; visiting a configured non-EN subpath (e.g. `/ru/...`) renders the page in English (no translation yet) without a 404.

**UI hint**: yes

### Phase 69: String Externalization — UI Chrome

**Goal**: All hardcoded UI-chrome strings across the shared site components (Nav, Footer, Hero and its sub-parts, Services, Fleet, HowItWorks, Testimonials, CookieBanner, FeatureStrip) are moved into a `messages/en.json` catalog under stable namespaces and rendered via next-intl `useTranslations`/`getTranslations`, with the namespace and key conventions established as the pattern for later phases. Locale-aware navigation is in place so links rendered from a non-EN subpath keep their locale prefix (next-intl `createNavigation` / `Link`), closing the Phase 68 IN-01 gap. English output stays byte-for-byte unchanged (English is the source catalog) and no translation of other locales happens yet.

**Depends on**: Phase 68 (next-intl runtime, `app/[locale]/` routing, `i18n/routing.ts` typed locale source, request config)
**Requirements**: STR-01
**Success Criteria** (what must be TRUE):

  1. `messages/en.json` exists as the source catalog, organized into per-component namespaces, and `i18n/request.ts` loads it; a documented namespace + key naming convention is recorded for reuse in Phases 70–71.
  2. Nav, Footer, Hero (incl. HeroTypewriter/HeroRating/HeroWhatsApp), Services, Fleet, HowItWorks, Testimonials(+Carousel), CookieBanner, and FeatureStrip render every visible string through `useTranslations`/`getTranslations` — no hardcoded user-facing copy remains in those components.
  3. Locale-aware navigation is wired via next-intl (`createNavigation`/`Link` from `i18n/routing.ts`), so internal links clicked from `/ru/...` (any configured locale) preserve the locale prefix instead of dropping to root EN.
  4. The rendered English site is byte-for-byte unchanged (visual + existing tests green); non-EN locales still render English chrome (no translations added yet), served correctly under their subpath.

**Plans:** 5/5 plans complete
**Wave 1**

- [x] 69-01-PLAN.md — Pipeline tracer: convention lock (checkpoint), catalog loader + provider + createNavigation + 6 stubs + test harness, Nav externalized end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 69-02-PLAN.md — Footer (full raw-anchor→Link sweep) + FeatureStrip + HowItWorks

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 69-03-PLAN.md — Hero cluster (Hero, HeroTypewriter, HeroRating, HeroWhatsApp, HeroBackground) under one Hero namespace

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 69-04-PLAN.md — Services + Fleet (price interpolation, proper-noun model names, Link swaps)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 69-05-PLAN.md — Testimonials (+Carousel) + CookieBanner (t.rich Privacy/Legal links) — closes STR-01

**UI hint**: yes

### Phase 70: String Externalization — Booking & Account

**Goal**: All hardcoded user-facing strings across the booking flow (EntryBar, the booking wizard steps, time-slot picker, inline flight field, RouteMap labels, VehicleCard/VehicleSlideshow, and the passenger/contact/checkout forms), the customer account area (auth-aware sign-in UI, login/signup pages, "My trips" dashboard, profile editing including corporate fields), and all shared form validation / error / toast messages are moved into the `messages/en.json` source catalog under the namespace + key conventions established in Phase 69 and rendered via next-intl `useTranslations`/`getTranslations`. Client-side validation, error, and toast copy is externalized (including interpolated and pluralized values). English output stays byte-for-byte unchanged (English is the source catalog) and no translation of other locales happens yet; non-EN subpaths continue to render English booking/account copy correctly.

**Depends on**: Phase 68 (next-intl runtime, `app/[locale]/` routing, typed locale source), Phase 69 (`messages/en.json` catalog, namespace/key convention, `useTranslations`/`getTranslations` pattern, `createNavigation`/`Link` locale-aware navigation)
**Requirements**: STR-02
**Success Criteria** (what must be TRUE):

  1. The booking flow — EntryBar, every wizard step, time-slot picker, inline flight field, RouteMap labels, VehicleCard/VehicleSlideshow, and the passenger/contact/checkout forms — renders every visible string through `useTranslations`/`getTranslations`; no hardcoded user-facing copy remains in those components.
  2. The account and auth surfaces — auth-aware sign-in UI, login/signup pages, the "My trips" dashboard, and profile editing (including corporate fields) — render all visible strings from the catalog; no hardcoded user-facing copy remains.
  3. Form validation, error, and toast messages (including interpolated and pluralized values) are externalized under the established namespace convention, reusing shared keys where the same message appears in more than one place.
  4. The rendered English site is byte-for-byte unchanged (visual + existing tests green), booking analytics (GA4/Meta/CAPI) and guest checkout are unaffected, and non-EN locales still render English booking/account copy (no translations added yet) served correctly under their subpath.

**Plans:** 8/8 plans complete

**Wave 1** — tracer

- [x] 70-01-PLAN.md — Tracer: EntryBar externalized end-to-end (Booking.entryBar + seed Booking.validation + test migration + stub re-sync)

**Wave 2** *(blocked on Wave 1)*

- [x] 70-02-PLAN.md — Auth surface + Server-Action locale-threading (Pattern E de-risk): shared Errors namespace, Auth.login/oauth, login/actions.ts `.bind(null, locale)`, new tests/login-actions.test.ts

**Wave 3** *(blocked on Wave 2)*

- [x] 70-03-PLAN.md — Booking input primitives: TripTypeTabs (array split), AddressInput(+New) shared namespace, DurationSelector, StopList, StopItem, RouteMap, ProgressBar, Stepper (named-ICU aria)

**Wave 4** *(blocked on Wave 3)*

- [x] 70-04-PLAN.md — Vehicle cluster: single-source `Booking.vehicleClasses` label map + VehicleCard, VehicleSlideshow, StickyBookingPanel, Step3Vehicle, types/booking.ts

**Wave 5** *(blocked on Wave 4)*

- [x] 70-05-PLAN.md — Pricing/extras single-source + widget/wizard shell: PriceSummary, BookingSummaryBlock, Step4Extras (Booking.extras, lib/extras.ts untouched), BookingWidget, BookingWizard

**Wave 6** *(blocked on Wave 5)*

- [x] 70-06-PLAN.md — Wizard steps: Step1TripType, Step2DateTime (t.rich lead-time notice), Step5Passenger (zod messages), Step6Payment (Stripe locale untouched)

**Wave 7** *(blocked on Wave 6)*

- [x] 70-07-PLAN.md — Multi-day flow + in-wizard auth: MultiDayForm, DayCard, Step3Auth (Auth.inWizard); teaser headlines deferred to Phase 71

**Wave 8** *(blocked on Wave 7 — phase gate)*

- [x] 70-08-PLAN.md — Account surface: dashboard/trips/profile Server Components, ProfileForm + account/actions.ts (reuse Errors), reset-password; runs full suite + 7-locale build + single-source grep gate — closes STR-02

**UI hint**: yes

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
| 71. Content Externalization — Marketing & SEO Pages | v3.0 | 0/? | Pending | — |
| 72. AI Translation Pipeline & Catalogs | v3.0 | 0/? | Pending | — |
| 73. Non-Latin & RTL Infra (AR, HI, ZH) | v3.0 | 0/? | Pending | — |
| 74. SEO — hreflang, Metadata, Sitemap, Switcher | v3.0 | 0/? | Pending | — |
| 75. E2E Verification & Launch | v3.0 | 0/? | Pending | — |
