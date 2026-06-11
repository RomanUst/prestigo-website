# Roadmap: Prestigo

## Overview

Living roadmap across milestones. v1.0 delivered an MDX-powered SEO blog at `/blog`. v2.0 rebuilds the booking experience Blacklane-style (visual + behavioural) and introduces customer authentication and accounts (personal/corporate) — while preserving every existing GA4 + Meta Pixel/CAPI analytics signal and keeping guest checkout always available.

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- 🚧 **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (in progress)

## Phases

### ✅ v1.0 SEO Blog (Shipped)

**Milestone Goal:** Scalable MDX blog at `/blog` with full SEO wiring, unified listing, and migrated legacy articles accessible at canonical `/blog/*` paths.

- [ ] **Phase 54: MDX Infrastructure** - Install @next/mdx pipeline, create lib/blog.ts aggregator and content/blog/ directory
- [x] **Phase 55: Blog UI — Listing + Article Pages** - Build /blog listing card grid and /blog/[slug] MDX article renderer with full SEO metadata (completed 2026-05-13)
- [x] **Phase 56: Article Migration + SEO Wiring** - git mv 3 JSX articles to /blog/*, update all 9 canonical URL locations, add 301 redirects, reconcile sitemap (completed 2026-05-15)

### 🚧 v2.0 Blacklane-style Booking + Customer Accounts (In Progress)

**Milestone Goal:** Customers can sign in (email + Google + Apple), manage a personal or corporate account with a "My trips" dashboard, and complete a redesigned Blacklane-style booking flow — with optional in-checkout sign-in, bookings linked to `user_id`, guest checkout always available, and zero analytics regression.

- [ ] **Phase 57: Customer Auth Foundation** - Supabase Auth for customers (email + Google + Apple OAuth), migration 044_customer_profiles.sql, nullable user_id FK on bookings, customer/admin session split
- [ ] **Phase 58: Sign-in UI + Account Dashboard** - Auth-aware Sign in button in Nav, login/signup pages, "My trips" dashboard, profile editing, personal/corporate fields
- [ ] **Phase 59: Booking Flow Redesign (Blacklane)** - Unified entry bar, time-slot dropdown, inline flight number, route map with pickup/drop-off times, vehicle cards with "What's included" + capacity tabs — store, pricing APIs, and analytics preserved
- [ ] **Phase 60: Auth-in-Checkout + Guest Path** - Booking-method step (myself / guest / corporate book-for-a-guest), pre-fill for logged-in customers, link booking to user_id, guest always available
- [ ] **Phase 61: Analytics Preservation & E2E Verify** - End-to-end verification every GA4/Meta/CAPI event fires across the rebuilt flow on both guest and account paths, incl. login/sign_up, nonce, consent

## Phase Details

### Phase 54: MDX Infrastructure
**Goal**: The MDX compilation pipeline is installed and proven end-to-end; `lib/blog.ts` aggregates both MDX frontmatter and JSX article metadata into a single sorted `BlogPost[]`
**Depends on**: Nothing (first phase of this milestone; builds on existing Next.js 16 codebase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. `next build` succeeds with `@next/mdx` installed, `createMDX()` wrapper in `next.config.ts`, and `mdx-components.tsx` present at repo root
  2. A test MDX file in `content/blog/` with valid frontmatter (title, description, date, coverImage, category, author) renders at a route without build errors
  3. `getAllPosts()` from `lib/blog.ts` returns a merged, newest-first array containing both MDX-sourced posts (via gray-matter) and the hardcoded `JSX_POSTS` registry entries
  4. TypeScript compilation passes with the `BlogPost` type enforcing all required frontmatter fields including `author` typed as `AuthorSlug`
**Plans**: 2 plans
  - [ ] 54-01-PLAN.md — Install @next/mdx pipeline, wrap next.config.ts, create mdx-components.tsx + test MDX article
  - [ ] 54-02-PLAN.md — Implement lib/blog.ts (BlogPost type + getAllPosts + JSX_POSTS) and minimal app/blog/[slug]/page.tsx render route
**UI hint**: no

### Phase 55: Blog UI — Listing + Article Pages
**Goal**: Visitors can browse all blog posts on `/blog` and read any MDX article at `/blog/[slug]` with correct SEO metadata, Schema.org `BlogPosting`, and Prestigo design system styling
**Depends on**: Phase 54
**Requirements**: LIST-01, LIST-02, LIST-03, ART-01, ART-02, ART-03, ART-04, ART-05
**Success Criteria** (what must be TRUE):
  1. `/blog` renders a card grid sorted newest-first; each card shows coverImage, copper category label, title, description, and formatted date; cards link to `/blog/[slug]`
  2. `/blog` has correct `<title>`, `<meta name="description">`, canonical `/blog`, and OG tags; the page appears in `sitemap.xml` with a valid `lastmod`
  3. `/blog/[slug]` for a valid MDX article renders the hero image, `ArticleByline`, full MDX body, and a bottom CTA — all within the Prestigo dark-theme design system
  4. Each MDX article page has unique `og:title`, `og:description`, `og:image` (= coverImage), canonical `/blog/[slug]`, and a `Schema.org BlogPosting` JSON-LD block with author via `personSchemaFor()`
  5. `/blog/non-existent-slug` returns HTTP 404 (`dynamicParams = false` confirmed); JSX article slugs are absent from `generateStaticParams()` output
**Plans**: TBD
**UI hint**: yes

### Phase 56: Article Migration + SEO Wiring
**Goal**: Three legacy JSX articles are permanently accessible at `/blog/*` canonical URLs; old `/guides/*` and `/compare/*` paths 301-redirect to the new locations; sitemap reflects only the new paths; no contradictory canonical signals remain
**Depends on**: Phase 55
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06
**Success Criteria** (what must be TRUE):
  1. All 3 JSX articles are moved via `git mv` in their own atomic commit and render correctly at `/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, and `/blog/prague-vienna-transfer-vs-train`
  2. `grep -rn "guides\|/compare" app/blog/` returns zero hits — all 9 URL locations per file (canonical, hreflang x2, OG url, 5 Schema.org @id/url fields) reference `/blog/*` via `const CANONICAL_PATH`
  3. `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` shows a single 301 hop to `/blog/prague-airport-to-city-center` with no redirect chain; same verified for all 5 redirect rules
  4. `sitemap.xml` contains `/blog`, `/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, `/blog/prague-vienna-transfer-vs-train` and contains no `/guides/*` or `/compare/*` entries
  5. `lastModFor()` returns a real date for each moved file (git history at new path is intact from the `git mv` commit)
**Plans**: 4 plans
  - [x] 56-01-PLAN.md — Invert sitemap test (TDD RED), git mv 3 JSX articles, rewrite 30 URL occurrences via const CANONICAL_PATH (MIG-01, MIG-02)
  - [x] 56-02-PLAN.md — Append 5 permanent 301 redirects to next.config.ts redirects() array (MIG-03)
  - [x] 56-03-PLAN.md — Update app/sitemap.ts: remove 5 legacy entries, add 3 /blog/* entries; tests turn GREEN (MIG-04)
  - [x] 56-04-PLAN.md — Delete app/guides/page.tsx and app/compare/page.tsx hub pages; verify JSX_POSTS (MIG-05, MIG-06)
**UI hint**: no

### Phase 57: Customer Auth Foundation
**Goal**: A customer can authenticate via Supabase Auth (email magic-link/password + Google + Apple OAuth) entirely separate from admin auth, with their profile and account type persisted under row-level security and bookings ready to be linked to a `user_id`
**Depends on**: Nothing in v2.0 (builds on existing Supabase/GoTrue + bookings schema)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, ACCT-04
**Success Criteria** (what must be TRUE):
  1. A customer can complete sign-in by email (magic-link or password), by Google OAuth, and by Apple OAuth, and lands back on the site authenticated as a customer (not an admin)
  2. Registering a new customer creates a row in the `customer_profiles` table (migration `044_customer_profiles.sql`) with the chosen `account_type` (personal or corporate) and an FK to `auth.users`; RLS prevents any customer from reading or writing another customer's row
  3. A customer session and an admin session can both exist without interfering; customer-account routes are gated by middleware while `/admin` gating is unchanged and still works
  4. The `bookings` table has a nullable `user_id` FK to `auth.users`; existing anonymous bookings still insert and read successfully with `user_id` null
  5. A customer can sign out from an account-aware surface and the session is fully cleared (protected routes redirect to login afterward)
**Plans**: 3 plans
  - [x] 57-01-PLAN.md — Migrations 044 (customer_profiles + RLS) & 045 (nullable bookings.user_id FK) + Wave-0 auth test scaffolds (AUTH-06, ACCT-04)
  - [ ] 57-02-PLAN.md — Middleware gating, email + OAuth server actions, /auth/callback, /login UI, /account + sign-out (AUTH-01..05, AUTH-07)
  - [ ] 57-03-PLAN.md — [BLOCKING] apply migrations to live DB, regenerate types, verification gate + manual OAuth/email round-trip (AUTH-06, ACCT-04)
**UI hint**: yes

### Phase 58: Sign-in UI + Account Dashboard
**Goal**: A customer can reach login from the header on any device, sign in/register through dedicated pages, and manage their account — viewing their trip history and editing their profile (with corporate-specific fields when applicable)
**Depends on**: Phase 57
**Requirements**: NAV-01, NAV-02, ACCT-01, ACCT-02, ACCT-03
**Success Criteria** (what must be TRUE):
  1. The header on both desktop and mobile shows a **Sign in** button (placed before "Book now") for logged-out visitors, and replaces it with an account/sign-out affordance when the customer is logged in
  2. Dedicated login and signup pages let a customer authenticate by email and by Google/Apple, and choose personal vs corporate during registration
  3. The "My trips" page lists the logged-in customer's booking history (bookings linked to their `user_id`), and shows an appropriate empty state when there are none
  4. A customer can view and edit their profile (contact details, saved passenger info) and changes persist across sessions
  5. A corporate account exposes and saves the extra fields (company name, IČO/VAT, cost centre) and surfaces a "book for a guest" option that personal accounts do not see
**Plans**: TBD
**UI hint**: yes

### Phase 59: Booking Flow Redesign (Blacklane)
**Goal**: The booking wizard is visually and behaviourally rebuilt in Blacklane style — unified entry, time-slot picker, inline flight number, route map with times, and richer vehicle cards — while the Zustand store, pricing APIs, and every existing analytics event remain intact
**Depends on**: Nothing in v2.0 (independent of 57/58; can run in parallel with auth UI work)
**Requirements**: BOOK-01, BOOK-02, BOOK-03, BOOK-04, BOOK-05, TRACK-01, TRACK-02, TRACK-03, TRACK-05
**Success Criteria** (what must be TRUE):
  1. The flow opens with a unified route + date + time entry bar (consolidated rather than two separate steps), with pickup time chosen via a time-slot dropdown
  2. For airport transfers an inline "flight number" field is surfaced in the entry experience; it does not appear for non-airport routes
  3. The vehicle-selection screen shows a route map with pickup time and drop-off time, and vehicle class cards display "What's included" plus capacity tabs for luggage and seating
  4. Across the rebuilt flow every existing GA4 event still fires (`form_start`, `checkout_progress`, `view_item_list`, `view_item`, `begin_checkout`, `add_payment_info`, `purchase`, `generate_lead`) and every Meta Pixel + CAPI event (`InitiateCheckout`, `AddPaymentInfo`, `Purchase`) fires with `eventId` deduplication preserved
  5. The sessionStorage price snapshot (`lib/analytics-snapshot.ts`) and server-side GA4 Measurement Protocol `purchase` in the Stripe webhook still fire, and CSP nonce + Consent Mode v2 gating remain unbroken on the redesigned routes
**Plans**: TBD
**UI hint**: yes

### Phase 60: Auth-in-Checkout + Guest Path
**Goal**: The redesigned flow offers optional sign-in at checkout — a booking-method step that pre-fills logged-in customers and links their booking to `user_id` — while guest checkout remains available at every stage and never blocks
**Depends on**: Phase 57, Phase 59
**Requirements**: BOOK-06, BOOK-07, BOOK-08, ACCT-04, TRACK-04
**Success Criteria** (what must be TRUE):
  1. The flow includes a booking-method step where a logged-out user can "Book for myself (account)" or "Book as guest", and a corporate account additionally sees "Book for a guest"
  2. A logged-in customer's contact details are pre-filled in the passenger step, and editing them does not break submission
  3. Guest checkout works end-to-end at every stage without ever requiring sign-in; a guest booking completes with `user_id` null
  4. A booking completed by a logged-in customer is persisted with their `user_id` FK and subsequently appears in their "My trips" history
  5. GA4 `login` and `sign_up` events fire when a customer signs in or registers from within the checkout path
**Plans**: TBD
**UI hint**: yes

### Phase 61: Analytics Preservation & E2E Verify
**Goal**: End-to-end verification across the fully rebuilt flow (both guest and account paths) confirms zero analytics regression — every funnel, conversion, and auth event fires with consent, nonce, and dedup intact
**Depends on**: Phase 59, Phase 60
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05 (end-to-end verification)
**Success Criteria** (what must be TRUE):
  1. A full guest booking run fires the complete GA4 funnel (`form_start` → `checkout_progress` → `view_item_list` → `view_item` → `begin_checkout` → `add_payment_info` → `purchase`/`generate_lead`) with no missing or duplicated events
  2. A full account (logged-in) booking run fires the same GA4 funnel plus `login`/`sign_up`, with the booking linked to `user_id`
  3. All Meta Pixel + CAPI events (`InitiateCheckout`, `AddPaymentInfo`, `Purchase`) fire on both paths with `eventId` deduplication confirmed between browser and server
  4. The sessionStorage price snapshot and the server-side GA4 Measurement Protocol `purchase` in the Stripe webhook are confirmed firing after the rebuild
  5. CSP nonce propagation and Consent Mode v2 gating verified unbroken across all new/redesigned routes including the OAuth redirect flow
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** 54 → 55 → 56 → 57 → (58 ∥ 59) → 60 → 61

v2.0 dependency notes: 57 → 58; 57 → 60; 59 → 60; (59, 60) → 61. Phase 59 is independent of 57/58 and may run in parallel with the auth UI work.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 54. MDX Infrastructure | 0/? | Not started | - |
| 55. Blog UI — Listing + Article Pages | 3/3 | Complete    | 2026-05-14 |
| 56. Article Migration + SEO Wiring | 4/4 | Complete    | 2026-05-15 |
| 57. Customer Auth Foundation | 1/3 | In Progress | - |
| 58. Sign-in UI + Account Dashboard | 0/? | Not started | - |
| 59. Booking Flow Redesign (Blacklane) | 0/? | Not started | - |
| 60. Auth-in-Checkout + Guest Path | 0/? | Not started | - |
| 61. Analytics Preservation & E2E Verify | 0/? | Not started | - |
