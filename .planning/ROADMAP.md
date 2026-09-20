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
- [x] **Phase 71: Content Externalization — Marketing & SEO Pages** — Home long-form, 8 service pages, about/faq/contact/corporate/legal, 29–30 route-page bodies, blog → `content/blog/<locale>/`. Largest content restructure (may split 71a/71b). — CNT-01/02/03 (completed 2026-09-11)
- [x] **Phase 72: AI Translation Pipeline & Catalogs** — Build re-runnable `scripts/i18n-translate.mjs` (glossary + do-not-translate); generate RU/ES/FR catalogs + content; QA sampling. — TR-01/02 (completed 2026-09-17)
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

### Phase 71: Content Externalization — Marketing & SEO Pages

**Goal**: All long-form marketing and SEO page content across the public site — the Home page long-form sections, the 8 service pages, the about/faq/contact/corporate pages, the legal pages, the 29–30 route-page bodies (inclusions, day-trip configs, FAQ, hero copy), and the blog — is moved out of hardcoded JSX/inline literals into a locale-aware content model. UI-chrome-style strings continue to use the `messages/en.json` catalog under the Phase 69/70 namespace + key conventions, while long-form and structured page bodies move to a locale-aware content source: the route-page data model is made locale-aware, and the blog is relocated to `content/blog/<locale>/` with the listing and `[slug]` route rendering the active locale (falling back to English where a localized post does not yet exist). English output stays byte-for-byte unchanged (English is the source), and no translation of other locales happens yet (that is Phase 72); non-EN subpaths continue to render English content correctly. This is the largest content restructure of the milestone and may split into 71a/71b.

**Depends on**: Phase 68 (next-intl runtime, `app/[locale]/` routing, typed locale source), Phase 69 (`messages/en.json` catalog, namespace/key convention, `useTranslations`/`getTranslations` pattern, `createNavigation`/`Link` locale-aware navigation), Phase 70 (booking/account externalization patterns, Server-Action locale-threading, single-source label maps)
**Requirements**: CNT-01, CNT-02, CNT-03
**Success Criteria** (what must be TRUE):

  1. The 29–30 route-page bodies (inclusions, day-trip configs, FAQ, hero copy) are served from a locale-aware content model; no route-body copy remains hardcoded in a single-locale structure, and every existing route page renders identical English output at its current URL (indexable/noindex split preserved).
  2. Home long-form sections, the 8 service pages, about/faq/contact/corporate, and the legal pages render their content from the locale-aware source (catalog for chrome strings, content model for long-form structured bodies); no hardcoded user-facing body copy remains in those pages.
  3. The blog moves to per-locale content (`content/blog/<locale>/`), and the `/blog` listing plus `/blog/[slug]` render the active locale — falling back to English where a localized post does not yet exist — with existing English posts still served at their canonical `/blog/*` paths.
  4. The rendered English site is byte-for-byte unchanged (visual + existing tests green), and the sitemap, canonical URLs, FAQPage/AggregateRating structured data, and route SEO metadata are unaffected; non-EN locales still render English content (no translations added yet) served correctly under their subpath.

**UI hint**: yes

### Phase 72: AI Translation Pipeline & Catalogs

**Goal**: A re-runnable, AI-only translation pipeline (`scripts/i18n-translate.mjs`) exists that translates the English source — the `messages/en.json` catalog plus the Phase 71 locale-aware content model (route-page bodies and `content/blog/<locale>/`) — into target locales, governed by a locked brand glossary and a do-not-translate list (prices/numbers, "Prestigo", E-Class/S-Class/V-Class names, proper nouns) with a premium tone tuned per locale. English stays the single source of truth and re-runs are idempotent: an unchanged English source produces no output diff, and only added or changed source strings are re-translated. Using that pipeline, complete `ru`, `es`, and `fr` catalogs and localized content are generated and rendered under their subpaths, followed by a QA sampling pass. AR/HI/ZH generation and non-Latin/RTL rendering are out of scope here (deferred to Phase 73).

**Depends on**: Phase 68 (next-intl locale routing + typed locale config), Phase 69 (`messages/en.json` source catalog + namespace/key conventions), Phase 70 (booking/account catalog externalization), Phase 71 (locale-aware content model — route-page data model made locale-aware and `content/blog/<locale>/` relocation)
**Requirements**: TR-01, TR-02
**Success Criteria** (what must be TRUE):

  1. `scripts/i18n-translate.mjs` is a re-runnable AI translation pipeline that reads `messages/en.json` and the locale-aware content sources and writes target-locale catalogs and content; re-running against an unchanged English source is idempotent (no spurious diffs), and only added/changed source keys are re-translated on subsequent runs.
  2. The pipeline enforces a locked brand glossary and a do-not-translate list — prices/numbers, "Prestigo", E-Class/S-Class/V-Class names, and proper nouns are preserved verbatim in every locale — and applies a premium, locale-appropriate tone.
  3. Complete `ru`, `es`, `fr` catalogs (`messages/ru.json`, `messages/es.json`, `messages/fr.json`) exist with every key present in `messages/en.json` (no missing keys, no untranslated English values left in translated surfaces), and the corresponding localized content (route-page bodies and `content/blog/<locale>/`) is generated.
  4. `/ru/`, `/es/`, `/fr/` subpaths render fully translated chrome and content with no English leakage in translated surfaces, the English root output stays byte-for-byte unchanged, and a QA sampling pass across the three locales is recorded; `ar`, `hi`, `zh` continue to render English (their generation deferred to Phase 73).

**UI hint**: no

**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 72-01-PLAN.md — Tracer: one key/one locale end-to-end + glossary/manifest foundations (@anthropic-ai/sdk, D-04/05/06/07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 72-02-PLAN.md — Expand to all catalog + content-JSON surfaces (ru/es/fr) + DNT/ICU/RU-plural verifier (D-01/06)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 72-03-PLAN.md — MDX-aware blog branch + QA-report generator + stray blog file relocation (D-09/10)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 72-04-PLAN.md — CI workflow (path-filter + PR flow) + ANTHROPIC_API_KEY secret + request.ts comment (D-02/03/08)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 72-05-PLAN.md — First full-catalog live run -> complete ru/es/fr + recorded QA sampling pass (D-05/08/09, TR-02)

### Phase 73: Non-Latin & RTL Infra (AR, HI, ZH)

**Goal**: The three non-Latin locales — Arabic (`ar`), Hindi (`hi`), and Chinese (`zh`) — render correctly with real translations, proper non-Latin fonts, and (for Arabic) a correct right-to-left layout. The Phase 72 translation pipeline is re-run to generate complete `ar`, `hi`, `zh` catalogs and localized content. Noto Sans Arabic / Devanagari / SC are loaded per locale via `next/font`. The site's physical-direction Tailwind classes are audited across the layout (~42 files) and converted to logical properties so the Arabic layout mirrors without breakage. English stays the single source of truth and `ru`/`es`/`fr` output is unaffected.

**Depends on**: Phase 72 (AI translation pipeline + glossary/manifest + locale-aware content model)
**Requirements**: RTL-01, FONT-01, TR-02
**Success Criteria** (what must be TRUE):

  1. Complete `ar`, `hi`, `zh` catalogs (`messages/{ar,hi,zh}.json`) and localized content (route pages, `content/pages/<locale>/`, `content/blog/<locale>/`) are generated by re-running `scripts/i18n-translate.mjs`, with every key present vs `messages/en.json` (0 missing, value-type parity), governed by the locked glossary/DNT rules and a premium per-locale tone.
  2. `/ar/` renders right-to-left: physical-direction Tailwind classes across the layout (~42 files) are audited and converted to logical properties (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start`/`end`), `<html dir="rtl">` (or equivalent) is set for `ar`, and there is no mirrored-layout breakage (RTL-01).
  3. Noto Sans Arabic / Devanagari / SC are loaded per locale via `next/font` so `ar`/`hi`/`zh` glyphs render correctly rather than as tofu/fallback (FONT-01).
  4. `ru`/`es`/`fr` and the English root output are unaffected (byte-for-byte unchanged), a QA sampling pass across `ar`/`hi`/`zh` is recorded, and RTL visual QA on `/ar/` passes.

**UI hint**: yes

**Plans:** 14 plans (6 original + 6 gap-closure cycle 1 + 2 gap-closure cycle 2 from 73-VERIFICATION re-review gaps_found)

**Wave 1** — tracer

- [x] 73-01-PLAN.md — Tracer: `/ar/` end-to-end (Noto fonts SC-corrected + conditional className + `:lang` tracking + Nav logical conversion + chevron mirror) + translation config (glossary ar/hi/zh, PHASE_72_LOCALES→6, CI 6-locale) + Wave-0 test scaffolds

**Wave 2** *(blocked on Wave 1 — parallel, disjoint files)*

- [x] 73-02-PLAN.md — Translation generation: manifest reset → `--locales ar,hi,zh` real run → completeness + byte-parity + QA sampling (TR-02)
- [x] 73-03-PLAN.md — RTL components: CookieBanner/Hero/HowItWorks/FeatureStrip/TestimonialsCarousel logical conversion + directional-icon `rtl:` mirror + `<bdi>` DNT isolation
- [x] 73-04-PLAN.md — RTL route + service pages: 30 route pages + city-rides `text-left/right`→`text-start/end` (mechanical, byte-parity gated)
- [x] 73-05-PLAN.md — RTL blog pages: 3 blog pages pull-quote `border-s/ps`/text swap + `<bdi>` price/phone/flight/time isolation

**Wave 3** *(blocked on Wave 2 — phase gate)*

- [x] 73-06-PLAN.md — Phase gate: full suite + `--check` + phase-wide byte-parity (D-12) + FONT-01 weight-budget + D-10 5-page RTL visual QA / D-11 mixed-content (human-check at end-of-phase)

**Gap closure** *(from 73-VERIFICATION.md gaps_found — 4/6 must-haves; CR-01/CR-02/WR-01..05 + D-10/D-11 QA)*

Wave 1 *(parallel, disjoint files)*

- [x] 73-07-PLAN.md — Nav account-menu RTL: chevron inversion (CR-01) + logical dropdown inset (WR-01) + carousel arrow-key direction (WR-03)
- [x] 73-08-PLAN.md — DNT price bidi helper `interpolateBidi` + prague-berlin/city-rides isolation (CR-02 core) + render backstop
- [x] 73-10-PLAN.md — RTL residuals: globals.css logical props (WR-02) + blog CTA `<bdi>` narrowing (WR-05)
- [x] 73-11-PLAN.md — Skip-link i18n (WR-04): `Common.skipToContent` across 7 catalogs (pipeline) + SiteChrome wiring (RTL-01, TR-02)

Wave 2 *(blocked on 73-08)*

- [x] 73-09-PLAN.md — DNT price bidi sweep (CR-02 remainder): 29 route pages + airport-transfer + services index

Wave 3 *(blocked on 73-07..73-11 — QA gate)*

- [x] 73-12-PLAN.md — D-10/D-11 RTL visual QA walkthrough + FONT-01 tofu confirmation (human-verify checkpoint) → 73-RTL-QA.md (RTL-01, FONT-01)

**Gap closure — cycle 2** *(from 73-VERIFICATION.md re-review gaps_found — WR-01 residual bidi in route prose: openingParagraphs/routeNarrative/faqs unprotected)*

Wave 1 *(code fix)*

- [x] 73-13-PLAN.md — GAP-1: switch openingParagraphs/routeNarrative.paragraphs/faqs[].a render sites to `interpolateBidi()` across all 30 route pages (FAQPage JSON-LD `text` kept plain via carve-out) + render-test proof + EN snapshot regen (RTL-01, D-11)

Wave 2 *(blocked on 73-13)*

- [ ] 73-14-PLAN.md — GAP-2: strengthen `rtl-backstop.test.ts` CR-02 to per-field render-call-site assertions; GAP-3: re-run D-10/D-11 Group 3 structural bidi check + correct 73-RTL-QA.md route-page row (RTL-01; FONT-01 tofu = non-gating human note)

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
| 73. Non-Latin & RTL Infra (AR, HI, ZH) | v3.0 | 13/14 | In Progress|  |
| 74. SEO — hreflang, Metadata, Sitemap, Switcher | v3.0 | 0/? | Pending | — |
| 75. E2E Verification & Launch | v3.0 | 0/? | Pending | — |
