---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Site Internationalization (i18n)
current_phase: 75
current_phase_name: e2e verification & launch
status: planning
stopped_at: Phase 74 complete, ready to plan Phase 75
last_updated: "2026-09-24T17:13:16.814Z"
last_activity: 2026-09-24
last_activity_desc: Phase 74 complete, transitioned to Phase 75
state_head: 4ee5079f048d59a57c527ca8082851794d9d8e9b
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 49
  completed_plans: 49
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-20)

**Core value:** Every page must convert a visitor into a confirmed booking or qualified lead without friction
**Current focus:** Phase 74 — SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher

## Current Position

Phase: 75 — e2e verification & launch
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-24 — Phase 74 complete, transitioned to Phase 75

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3.0 (Phase 73): ar/hi/zh non-Latin + RTL infra shipped. Noto Sans Arabic/Devanagari/SC delivered per-locale via a single `localeFontClassName` ternary in SiteChrome (zero Noto bytes on en/ru/es/fr, no cross-family leak). Physical-direction Tailwind → logical properties; Arabic `dir="rtl"` with `.wordmark { direction: ltr }` to keep the PRESTIGO wordmark un-reversed. DNT price/phone/time tokens bidi-isolated via `interpolateBidi()`/`<bdi>` at the render site on all 30 route pages; FAQPage JSON-LD `acceptedAnswer.text` kept a plain `f.a` string (never a ReactNode) — guarded by strengthened CR-02 backstop. FONT-01 glyph-tofu independently browser-verified (0 tofu) 2026-09-20; security 16/16 threats closed.
- v3.0: ~~7 static pages render EN on every locale (WINDOWS #7)~~ — FIXED in Phase 74 (74-04, params-forwarded locale).
- v2.2 roadmap: 3 phases derived from DISP-* and DTRIP-* — Phase 65 (DISP-01..04, dispatch list defaults) is independent of the driver portal. Phase 66 (DTRIP-01,02,07,08 — permanent link + trip sheet) is the foundation the status-marking work builds on; Phase 67 (DTRIP-03,04,05,06 — status marking, note, admin visibility) depends on Phase 66's token/trip-sheet infrastructure. Execution order: (65 ∥ 66) → 67.
- v2.2 roadmap: DTRIP-04's constraint (trip-progress is a separate field, never mutates `booking.status`, no GNet push) is carried as an explicit success criterion in Phase 67, not left implicit — matches REQUIREMENTS.md Out of Scope guardrail.
- v2.1 roadmap: ABND (abandoned/unpaid capture) is the foundation phase (62) — persists a booking row at the payment step and reconciles it in place on payment success (no duplicate insert). AEDIT (63) and ANEW (64) both depend on Phase 62's shared admin bookings surface / status vocabulary; ANEW-04 additionally reuses the reconcile-in-place webhook pattern for payment-link payments.
- v2.1 (user decision): ABND captures the booking as soon as the client reaches the payment step (before payment completes) — not just on abandonment detection — then reconciles the same row to paid on `payment_intent.succeeded`. No separate "abandonment" event/timeout needed for v2.1 (that's FOLLOW-01, deferred to v2).
- v2.1 (user decision): AEDIT-05 client notification is operator-controlled via an explicit "notify client" toggle at save time — not automatic on every edit.
- v2.1 phase order: 62 (ABND foundation) → 63 (AEDIT) → 64 (ANEW). 63 and 64 are independent of each other, both depend only on 62.
- v2.0 (57-01): TEXT + CHECK used for customer_profiles.account_type (not Postgres ENUM) — stays alterable, matches existing bookings status/source pattern.
- v2.0 (57-01): No DELETE RLS policy on customer_profiles — row removal via ON DELETE CASCADE from auth.users only.
- v2.0 (57-01): Migration 045 adds no RLS to bookings — deferred to Phase 60 (auth-in-checkout).
- v2.0: Customer auth reuses Supabase Auth (GoTrue) — same stack as admin; add Google + Apple OAuth. No new auth library.
- v2.0: Bookings stay anonymous-capable; add nullable `user_id` FK so guest checkout never breaks.
- v2.0: Existing booking wizard is already structurally Blacklane-like (6 steps) — redesign is visual + behavioural, preserve store (`lib/booking-store.ts`) and pricing APIs.
- v2.0: Dense analytics wiring (GA4 + Meta Pixel/CAPI + server GA4 in Stripe webhook + sessionStorage price snapshot) must survive the rebuild — TRACK-* requirements are guardrails.
- v2.0 roadmap: Phase 59 (booking redesign) is independent of 57/58 and can run in parallel with auth UI; Phase 61 is a dedicated end-to-end analytics verification gate.
- v2.0 (57-02): safeReturnTo() open-redirect guard: relative-only, rejects absolute URLs and // — used in both app/login/actions.ts and app/auth/callback/route.ts.
- v2.0 (57-02): NextResponse.redirect in callback uses explicit { status: 302 } — Next.js defaults to 307 which breaks OAuth/email confirmation redirects.
- v2.0 (57-02): signUpWithPassword upserts customer_profiles whenever data.user exists (not conditional on session) — idempotent via ignoreDuplicates in callback.
- [Phase ?]: Wave-0 TDD: NAV-02 test uses role=button+name=/account/i to distinguish account trigger from burger button
- [Phase ?]: Wave-0 TDD: deletePassenger/updatePassenger ownership tested via dual eq() call tracking with separate mockEqDelete/mockEqUpdate instances
- [Phase ?]: v2.0 (58-02): saved_passengers includes DELETE RLS policy (deliberate contrast with customer_profiles) + partial unique index WHERE is_default=true for DB-enforced single-default
- [Phase ?]: v2.0 (58-04): D-01 enforced — /account/trips makes no bookings query; trip history deferred to Phase 60
- [Phase ?]: v2.0 (58-05): Server actions in separate app/account/actions.ts — account mutations isolated from login actions
- [Phase ?]: v2.0 (59-03): EntryBar return expander conditionally mounts DOM children (not just CSS hide) to avoid duplicate label text
- [Phase ?]: v2.0 (59-03): begin_checkout relocated from BookingWizard to StickyBookingPanel (plan 59-04) per Pitfall 5
- [Phase 62]: 62-02: SELECT-then-INSERT-or-UPDATE attempt-keyed capture (not ON CONFLICT) — matches single-tab/sequential checkout traffic and Supabase-js onConflict cannot target the partial unique index's WHERE predicate
- [Phase 62]: 62-02: buildBookingRows widened with bookingType param (default 'confirmed') so round-trip capture reuses the same builder for unpaid rows without touching the existing confirmed-insert call site
- [Phase 62]: 62-03: statusFilter is a separate chip dimension from tripType (own state, own query param); GET status filter whitelisted against KNOWN_STATUSES before threading as p_status
- [Phase 62]: 62-03: unpaid double-gated in both VALID_TRANSITIONS maps (route.ts server + lib/booking-transitions.ts UI source), unpaid: [confirmed, cancelled] only, never manually into unpaid
- [Phase 63]: Phase 63 Plan 01: approved researched-shape as-is for booking_edit_audit_log (8 columns, text old/new_value, ON DELETE CASCADE, no RLS, notification_flags key 'booking_changed')
- [Phase 63]: [Phase 63] 63-02: notification AND-gate (flags select + logEmail) resolved before the booking_edit_audit_log insert, not after, so the audit rows' notified column is set correctly in one insert (diverges from Plan 01's Wave-0 fixture call order)
- [Phase 63]: Audited vehicle_class/origin_address/destination_address/distance_km changes in addition to amount_czk (D-10 compliance, Rule 2)
- [Phase 63]: ADMIN_PRICE_TOLERANCE_CZK hoisted to a single top-level declaration reused by both POST and PATCH
- [Phase 63]: [Phase 63] 63-04: BookingChangeHistory groups audit rows by raw changed_at string equality (not a derived bucket); operator shown as raw operator_id UUID (no name/email join exists yet)
- [Phase 63]: 63-05: Notify-toggle scoped to price-review step only (not cheap-field saves) per UI-SPEC E4 classification
- [Phase 63]: 63-05: Both plan tasks committed as one commit (price-review step is a nested sub-panel of the same TripEditPanel component Task 1 introduces)
- [Phase 64]: 64-01: collect_payment drives a single status branch — true => unpaid (Phase 62 recovery queue), false/absent => operator's explicit status choice, default confirmed (D-02, was universal 'pending' pre-Phase-64)
- [Phase 64]: 64-01: checkout.session.completed reconciliation keys on session.metadata.bookingId, never PaymentIntent metadata (Payment Link metadata is not auto-copied to the resulting PaymentIntent)
- [Phase 64]: [Phase 64] 64-02: D-05 attach-later route sets status='unpaid' directly (bypasses VALID_TRANSITIONS); round-trip sibling detection keys on shared payment_intent_id, with return-leg amount_eur NULL fallback to sibling's combined total; webhook reconciles both legs with one combined confirmation
- [Phase 64]: [Phase 64] 64-03: create-flow modal swaps entire body (form -> result panel/error) on success, not layered alongside the form, per UI-SPEC single-focal-point rule; PaymentLinkSection defined once in BookingsTable.tsx and mounted in both desktop/mobile expanded views
- [Phase 65]: 65-01: TEXT+CHECK (not ENUM) for dispatch_default_horizon, matching customer_profiles.account_type precedent
- [Phase 65]: 65-01: p_sort adaptive CASE ORDER BY duplicated identically in both paged CTE and jsonb_agg sites (Pitfall 1) — never dynamic/concatenated SQL (T-65-01)
- [Phase 65]: 65-01: 059's DROP+CREATE produces a new function object receiving a default PUBLIC EXECUTE grant — added explicit REVOKE after every RPC signature-change migration (Rule 2 fix, commit 472e132)
- [Phase 65]: [Phase 65] 65-02: D-07 implemented as researched-corrected (manual startDate/endDate suppress the horizon branch entirely, sort stays created_desc) — diverges from RESEARCH Pattern 2's horizon-overrides-manual snippet per the plan's explicit research_correction
- [Phase 65]: [Phase 65] 65-02: BookingsTable horizon state shipped as a read-only useState (no setter) defaulting to 'future' — the switchable segmented control is deferred to Plan 65-04
- [Phase 65]: 65-03: PATCH .update() built field-by-field from parsed.data (only present keys) so a horizon-only or days-only PATCH never clobbers notification_flags — same discipline extended from the existing handler
- [Phase 65]: 65-03: DispatchDefault widget PATCHes only the single field that changed per interaction (not the full pair) so the non-clobber guarantee is exercised on every real save, not just in tests
- [Phase 65]: [Phase 65] 65-04: persisted default is represented purely by the incoming defaultHorizon/horizonDays props (never re-stored) — ephemeral override useState seeded from them once on mount, so a remount with the same prop re-seeds from the persisted default, not the last-used segment (D-04)
- [Phase 65]: [Phase 65] 65-04: 'last_n_days' displays as its nearest visible peer 'Future' in the segmented control (highlight only) — the real fetch param stays 'last_n_days' until the admin clicks a real segment
- [Phase 65]: [Phase 65] 65-04: D-07 grayed-segment styling reuses the existing inactive-chip style verbatim (isActive forced false for all three segments when a manual Date Range is active) rather than introducing a third visual state
- [Phase 65]: [Phase 65] 65-04: bookings/page.tsx's settings fetch is a third, independent useEffect — structurally decoupled from the two KPI fetches (D-05), not merged into the existing KPI-fetch effect
- [Phase 66]: 66-01: operator selected add-column (D-01) over sibling-table at the Task 2 checkpoint — matches locked D-01
- [Phase 66]: 66-01: TripSheetAssignmentRow/Booking/Driver interfaces cast around the untyped Supabase select-string join (bookings!inner(*) infers as array without a Database generic)
- [Phase 66]: trip_token kept required on Assignment interface; POST-fallback path sets it to '' and hides Copy Trip Link rather than making the field optional (SEC-18 discipline preserved)
- [Phase 66]: VIEW TRIP SHEET CTA placed as its own div below the ACCEPT/DECLINE button row, not inside it, keeping DTRIP-07's unchanged-DOM guarantee literal
- [Phase 68]: 68-01: next-intl@4.14.2 exact pin approved via blocking-human package-legitimacy checkpoint (amannn/next-intl, 5+ yr package, [SUS] too-new signal dispositioned as false positive on latest patch date)
- [Phase 68]: 68-01: useNonceCsp decided from the raw request pathname (not the locale-stripped decisionPathname) so /ru/admin can never acquire a nonce CSP (T-68-04 fix found during Task 2 TDD)
- [Phase 68]: 68-01: shared runCspAndAuthChain helper consolidates the CSP/Supabase branch logic for both non-localized and public middleware branches rather than duplicating the block
- [Phase 68]: [Phase 68] 68-02: stripLocalePrefix moved from middleware.ts to i18n/routing.ts (single-source I18N-04, avoids next/server import in plain unit tests)
- [Phase 68]: [Phase 68] 68-02: ACCEPTED DEVIATION T-68-06 — case-variant locale prefixes (/RU, /Ru) canonicalize via next-intl's own 307 redirect to the lowercase locale rather than hard-404ing; non-bypass and non-reflection invariants hold, human-approved at the Task 3 checkpoint
- [Phase 69]: 69-01: Task 1 convention approved as Option A (PascalCase component namespaces, camelCase semantic sub-keys, JSON arrays for ordered lists, named ICU args, 6 EN-copy stub files) — locked verbatim for reuse across Phases 69-71
- [Phase 69]: 69-01: Nav.tsx NAV_LINKS typed as ReadonlyArray<{href,isNew?}> rather than 'as const' to avoid a discriminated-union TS error when accessing .isNew
- [Phase 69]: [Phase 69] 69-02: Footer services li key uses href+index (not href alone) — 3 of 8 service items share href '/services' — avoids React duplicate-key collision
- [Phase 69]: [Phase 69] 69-02: FeatureStrip icons / HowItWorks step-number+photo-path stay in-code structural arrays zipped by index with translated catalog arrays — matches locked convention: structural config never moves into message JSON
- [Phase 69]: 69-03: HeroBackground's HERO_ALT moved from module scope to a local const inside the component body (useTranslations only callable inside the component); all 3 usage sites (2x getImageProps alt, 1x img alt) unchanged
- [Phase 69]: 69-03: t.rich('priceAnchor', { amount, price: (chunks) => <span>...</span> }) preserves Hero's inline copper price span; plain {amount} ICU arg coerces via String() (no locale number formatting), matching prior template-literal output byte-for-byte
- [Phase 69]: [Phase 69] 69-04: Fleet altTemplate interpolated via per-index t(`vehicles.${i}.altTemplate`, {model}) — next-intl dot-path array resolution, not manual .replace() string surgery
- [Phase 69]: 69-05: Testimonials + TestimonialsCarousel share the Testimonials namespace; nested components (StarBadge, Toggle) call useTranslations directly instead of threading a t prop
- [Phase 70]: [Phase 70] 70-01: Booking.validation seeded with shared 'required to continue' keys (originRequired/destinationRequired/dateRequired/timeRequired/returnDateRequired/returnTimeRequired/returnAfterPickup) reused across later step plans, not duplicated per-field
- [Phase 70]: [Phase 70] 70-01: Rule 1 auto-fix — any pre-existing test mounting an already-externalized component (not just its own test file) needs the renderWithIntl migration too; surfaced on BookingWizard.test.tsx mounting EntryBar
- [Phase 70]: 70-03: TripTypeTabs uses Nav-style array split (t.raw('items') index-paired); ProgressBar aria kept byte-identical 'of 5' to preserve BookingWizard WIZD-07
- [Phase 70]: 70-04: Booking.vehicleClasses is the single source of vehicle-class labels; VEHICLE_CLASS_KEY normalizes the snake_case enum to camelCase catalog keys — downstream plans reuse it, never re-add a local label map
- [Phase 70]: 70-05: Booking.extras is a read-only mirror of lib/extras.ts (email-coupled, untouched); UI reads label/description by key
- [Phase 70]: 70-05: vehicle-class labels in PriceSummary/BookingSummaryBlock/BookingWizard reuse Booking.vehicleClasses via VEHICLE_CLASS_KEY; GA4/Meta analytics identifiers unchanged
- [Phase 70]: 70-07: DayCard interpolated day aria collapses to named-ICU (single dayLabel 'Day {day}' + per-variant t('key',{day}))
- [Phase 70]: 70-07: Step3Auth (in-wizard auth, Auth.inWizard) reuses shared Auth.login + Errors keys via secondary hooks rather than duplicating byte-identical strings
- [Phase 70]: 70-08: account/auth-account surface externalized (getTranslations Server Components + useTranslations clients + Pattern E locale-threaded actions); Phase 70 gate green — STR-02 complete
- [Phase 72]: [Phase 72] 72-01: i18n/locales.ts extracted (dependency-free) so plain-Node scripts can import the locale list — i18n/routing.ts re-exports it unchanged; createNavigation() from next-intl/navigation is unresolvable outside Next's bundler
- [Phase 72]: [Phase 72] 72-01: hash-manifest (unitKey -> {enHash,lastTranslatedAt}) + injectable translator architecture proven end-to-end (one key, ru locale) via mocked-client TDD; empty/whitespace units excluded from translator calls but still recorded in the manifest to keep idempotency uniform
- [Phase 72]: 72-02: manifest advance deferred until every requested locale succeeds for a unit this run (not after the first locale) — the enHash entry carries no locale dimension, so per-locale-immediate writes would silently fall back to English for the second/third locale
- [Phase 72]: 72-02: translateCatalog()/translateContentJson() are pure/read-only (no file writes, no manifest mutation) — runFullTranslation() alone owns persistence so a translator or verification failure never partially commits state
- [Phase 72]: 72-02: a unit failing DNT/ICU/plural verification falls back to the EN value in the output and is excluded from the manifest — retried automatically next run, never silently shipped broken
- [Phase 72]: [Phase 72] 72-03: gray-matter's stringify(content, data) arg order is body-first, data-second - the inverse of 72-RESEARCH.md/72-PATTERNS.md's code snippets; buildTranslatedMdx() uses the confirmed-correct order
- [Phase 72]: [Phase 72] 72-03: translateMdxFile() only populates translatedByUnitKey for a body unit that passes verifyMdxStructure - a structurally-failed body never enters the accepted set, no downstream filter needed
- [Phase 72]: [Phase 72] 72-03: checkPipelineState() (--check mode) returns {ok, failures} instead of calling process.exit() itself, keeping the EN-mutation/completeness guard directly unit-testable
- [Phase 72]: [Phase 72] 72-03: QA report's no-English-leakage check is scoped to units the run actually processed (summary.accepted) and excludes DNT-only values so brand terms identical across locales are never false-flagged
- [Phase 72]: 72-04: Owner confirmed provisioning ANTHROPIC_API_KEY GitHub Actions repository secret (human-only, no agent GitHub-secret access)
- [Phase 72]: 72-04: i18n-translate.yml is the repo's first CI workflow — path-filtered push trigger + workflow_dispatch, least-privilege contents:write+pull-requests:write, EN-unchanged assertion before PR step, PR-only landing via peter-evans/create-pull-request@v8 (never a direct main commit, D-08)
- [Phase 73]: 73-01: SC font subset corrected from UI-SPEC's invalid 'chinese-simplified' to 'latin' (build-breaking Pitfall 2 fix)
- [Phase 73]: 73-01: --letter-spacing-nav/-wide/-logo theme tokens have no DOM consumer — reset at custom-property level under :lang(ar)/:lang(hi) rather than inventing non-existent bearing selectors
- [Phase 73]: 73-01: A1 resolved — PHASE_72_LOCALES extended to all six locales now (ru/es/fr/ar/hi/zh), closing a latent CI re-translation gap
- [Phase 73]: 73-01: Nav-inclusive byte-parity check moved to a new dedicated file (tests/nav-locale-render-parity.test.tsx) due to Vitest vi.mock hoisting conflict in tests/route-page-render.test.tsx
- [Phase 73]: 73-02: real ar/hi/zh catalogs+content generated (33 blog MDX, --check green, en/ru/es/fr untouched); ~10 hi heading DNT-fallbacks deferred (WINDOWS #6)
- [Phase 73]: [Phase 73] 73-03: CookieBanner toggle knob added rtl:-translate-x-5 alongside start-0.5 (Rule 1) so the checked-state slide mirrors instead of pushing the knob off-track under dir=rtl
- [Phase 73]: [Phase 73] 73-03: Hero scroll-cue centering pair (left-1/2 + -translate-x-1/2) left fully unconverted — partial conversion to start-1/2 would break centering under RTL since right:50%+translateX(-50%) is not equivalent
- [Phase 73]: 73-04: prague-vienna byte-parity snapshot regenerated after text-right→text-end swap; verified programmatically the only change is the token swap
- [Phase 73]: [Phase 73] 73-05: span->bdi conversion at the 4 existing price-emphasis JSX render boundaries only; phone/time/most-price DNT tokens embedded mid-sentence in data-array strings (comparison tables, FAQ answers) have no existing wrap boundary and were left as a documented scoped no-op per the plan's 'do not add a new parsing pass' instruction
- [Phase 73]: [Phase 73] 73-06: discovered (not fixed, Scope Boundary) a pre-existing getLocale()-without-params bug in 7 static pages (about/terms/corporate/privacy/faq/blog-index/contact) that renders EN content on every locale since Phase 71 — recorded to deferred-items.md and WINDOWS.md #7; does not block Phase 73's D-10-scoped gate
- [Phase 73]: 73-07: CR-01 fix removed the isRtl mirror addend entirely (not scaleX(-1)) — chevron path is horizontally symmetric and needs no mirror of any kind
- [Phase 73]: 73-07: Task 1/2 committed as two separate atomic commits despite touching the same file (Nav.tsx), by staging/reverting the WR-01 hunk between commits
- [Phase 73]: 73-08: interpolateBidi splits on the same {token} boundary as interpolate() and wraps only the substituted value in <bdi>; metadata/JSON-LD strings keep the plain-string interpolate()
- [Phase 73]: 73-08: bare price-token render sites (v.price, c.price, businessHourly) wrap the already-interpolated string directly in inline <bdi>, distinct from sentence-level fields which use interpolateBidi() at the render call
- [Phase 73]: 73-10: cta-text hover-zoom transform-origin set to centered (50% 50%) rather than a :dir(rtl)-conditional pair — direction-neutral fix per review's primary suggestion
- [Phase 73]: 73-10: Vienna blog CTA isolates both price (€455) and duration (3h 15min) in separate <bdi> tags per D-11 numeral-run scope; the two airport CTAs isolate only their price token
- [Phase 73]: [Phase 73] 73-11: shared Common namespace introduced for SiteChrome-level accessibility strings (skipToContent), distinct from per-component message namespaces
- [Phase 73]: [Phase 73] 73-11: kept 2 incidental ru/zh route-translation resyncs surfaced by the full-surface AI pipeline run rather than reverting them (Rule 1 - pre-existing EN/translation drift)
- [Phase 73]: [Phase 73] 73-09: mirrored the interpolateBidi()/inline <bdi> pattern from 73-08's prague-berlin reference across all 29 remaining route pages plus airport-transfer/services index, closing CR-02 project-wide; extended scope to also fix each page's copper 'Price from' highlight bare-render (same site 73-08 fixed on berlin as a Rule 2 deviation, since all 30 route content files carry a copper:true highlight)
- [Phase 73]: [Phase 73] 73-09: prague-vienna golden EN byte-parity snapshot regenerated (matches 73-04 precedent) since <bdi> renders identically regardless of locale; verified programmatically that stripping all <bdi> tags from the new snapshot reproduces the old one byte-for-byte
- [Phase 73]: 73-13: closed GAP-1 bidi-isolation defect (openingParagraphs/routeNarrative.paragraphs/faqs[].a switched to interpolateBidi()/aBidi at render, JSON-LD text: f.a carve-out preserved) across all 30 route pages
- [Phase 73]: [Phase 73]: 73-14: strengthened rtl-backstop.test.ts CR-02 block to per-field render-call-site assertions (openingParagraphs/routeNarrative.paragraphs interpolateBidi precomputes, faqs.aBidi + faq.aBidi render, JSON-LD text: f.a carve-out) across all 30 route pages, regression-proofed against the original GAP-1 defect; corrected 73-RTL-QA.md's Group 3 route-page row FAIL->PASS backed by a new prague-berlin /ar structural render re-check

### Brownfield phases (pre-GSD, completed)

- Phase 47: DB migration — vehicle map
- Phase 51: Admin UI badge
- Phase 52: Extended booking statuses
- Phase 53: Driver assignment UI

### v1.0 (shipped)

- Phases 54–56: SEO Blog — MDX pipeline, /blog UI, article migration + 301s

### v2.0 (shipped, Phases 57-61)

- Phase 57: Customer Auth Foundation — AUTH-01..07, ACCT-04
- Phase 58: Sign-in UI + Account Dashboard — NAV-01,02, ACCT-01,02,03
- Phase 59: Booking Flow Redesign (Blacklane) — BOOK-01..05, TRACK-01,02,03,05
- Phase 60: Auth-in-Checkout + Guest Path — BOOK-06,07,08, TRACK-04
- Phase 61: Analytics Preservation & E2E Verify — TRACK-01..05 (verification)
- Execution: 57 → (58 ∥ 59) → 60 → 61

### v2.1 roadmap (Phases 62-64, shipped)

- Phase 62: Abandoned & Unpaid Booking Capture — ABND-01..06
- Phase 63: Admin Booking Editing + Change Notification — AEDIT-01..07
- Phase 64: Admin-Created Bookings with Payment Link — ANEW-01..05
- Execution: 62 → (63 ∥ 64)

### v2.2 roadmap (Phases 65-67)

- Phase 65: Dispatch — Future-First Bookings List — DISP-01..04
- Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet — DTRIP-01, DTRIP-02, DTRIP-07, DTRIP-08
- Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility — DTRIP-03, DTRIP-04, DTRIP-05, DTRIP-06
- Execution: (65 ∥ 66) → 67

### v3.0 roadmap (Phases 68-75, planning)

- Milestone: Site Internationalization — EN at root (unchanged URLs), 6 locales under subpaths (RU/ES/FR/AR/HI/ZH), full-site scope, AI-only translation. Stack: next-intl + app/[locale] (`localePrefix: 'as-needed'`).
- Phase 68: i18n Foundation & Routing — I18N-01/02/03/04 (risk-first: middleware composition + route-tree move under [locale], EN unchanged)
- Phase 69: String Externalization — UI Chrome — STR-01
- Phase 70: String Externalization — Booking & Account — STR-02
- Phase 71: Content Externalization — Marketing & SEO Pages — CNT-01/02/03 (may split 71a/71b)
- Phase 72: AI Translation Pipeline & Catalogs — TR-01/02 (RU/ES/FR)
- Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) — RTL-01, FONT-01, TR-02
- Phase 74: SEO — hreflang/metadata/sitemap/JSON-LD/switcher — SEO-01/02/03/04, UX-01/02
- Phase 75: E2E Verification & Launch — VER-01
- Proposed execution: 68 → 69 → 70 → 71 → 72 → 73 → 74 → 75 (69∥70 after 68; 71/72 pipeline can overlap)

### Key i18n grounding (verify during /gsd-plan-phase 68)

- `middleware.ts` is a single default export doing CSP nonce (`buildCsp`) + Supabase `updateSession` + CSRF Origin-guard; broad matcher. next-intl locale-middleware must be COMPOSED into this chain, not replace it — highest-risk item.
- `lib/seo.ts::getAlternates()` already returns `{ canonical, languages }` and is designed to extend to N locales; `app/sitemap.ts` already emits `alternates.languages` (currently en/x-default only).
- Content is hardcoded prose inline in each `app/routes/<slug>/page.tsx` (inclusions, dayTripConfigurations, FAQ, hero, per-page generateMetadata). `lib/routes.ts` is the hub data-layer only. Blog = `content/blog/*.mdx` (10) + 3 legacy JSX.
- Fonts: next/font Fraunces + Inter (self-hosted); no `dir=` handling anywhere. RTL audit ≈ 42 files / ~50 physical-direction Tailwind class occurrences.
- Do NOT localize: `app/admin/*`, `app/api/*`, `app/auth/*`, `app/driver/*` — stay at root, off the [locale] tree.
- `next.config.ts` has a `/cs → /` redirect (CS not in v3.0 scope — leave it); ensure new locale prefixes are not caught by any catch-all.

### Pending Todos

None yet.

### Blockers/Concerns

- Apple Sign In via Supabase has fiddly setup (Service ID, key, return URLs) — confirm config during a future OAuth-config phase.
- Next migration number is **058** (057_security_rls_hardening.sql is the latest). Phase 66 will likely need a schema change for the permanent driver trip-link token — extend `driver_assignments` (or add a sibling table) rather than replace its existing single-use `token`/`token_expires_at` columns, since accept/decline (DTRIP-07) must keep working unchanged.
- Brownfield findings relevant to v2.2 (verify during `/gsd-plan-phase 65` and `/gsd-plan-phase 66`):
  - `GET /api/admin/bookings` → `admin_search_bookings` RPC currently defaults to an empty date range (shows all bookings). Phase 65 changes this client/server-side default to future-only; KPI counters already pass explicit date ranges so should be unaffected by the change, but must be re-verified once the default filter ships (DISP-04).
  - `driver_assignments` (booking_id, driver_id, status, token, token_expires_at) is a SINGLE-USE EXPIRING token today, created by `POST /api/admin/bookings/[id]/assign`; driver responds at `app/driver/response/page.tsx` → `POST /api/driver/respond`. Phase 66's permanent trip-link token is a distinct, longer-lived credential that must coexist with this token, not replace it.
  - Booking status machine lives in `lib/booking-transitions.ts` (`VALID_TRANSITIONS`) and GNet push in `lib/gnet-client.ts` (`pushGnetStatus`). Phase 67's trip-progress field must NOT hook into either — DTRIP-04 requires it to be a fully separate column with no transition validation and no GNet call.
- Anthropic API credit is empty (checked 2026-09-24). All 282 content locale files are genuinely translated (none identical to EN), so the old 73-11 gap is closed. The `i18n Translate` GitHub workflow is DISABLED (gh workflow disable) — new EN strings are translated in-session until credit is topped up; the translation manifest may be out of sync for hand-translated keys (a future pipeline run would re-translate them).
- [Phase 75 input] Known EN leaks on localized pages (found 2026-09-24, not yet translated): /book "How it works" steps (app/[locale]/book/page.tsx), /book/multi-day "Example itineraries" section (EXAMPLES const + headings), /services/airport-transfer booking block ("Book your chauffeur now", bullet list), CorporateForm notes placeholder, /book hero ("Your transfer, confirmed in seconds.", "Instant booking"). Phase 75 VER-01 "no EN leakage" needs a systematic hardcoded-EN audit, not just these.
- [Phase 75 input] Responsive overflow audit script (Playwright, 7 locales x 21 pages x 320/375/768/1024/1280) returned 0 issues on 2026-09-24 — reuse it as a Phase 75 regression check.
- [Phase 74] T-74-07 class: never add a blanket file-extension exclusion to the middleware matcher that can match protected prefixes (api/admin/driver/auth/account) — see tests/middleware-matcher.test.ts.

## Deferred Items

Items acknowledged and deferred at milestone v2.0 close on 2026-06-18:

| Category | Item | Status | Reason |
|----------|------|--------|--------|
| uat_gap | Phase 53: 53-HUMAN-UAT.md | passed (0 pending) | Pre-v2.0 phase, all tests passed |
| verification_gap | Phase 55: 55-VERIFICATION.md | human_needed | 5/5 truths verified; runtime checks (404, sitemap) require live env |
| verification_gap | Phase 56: 56-VERIFICATION.md | human_needed | 11/11 truths verified; Google Rich Results Test requires third-party tool |
| verification_gap | Phase 57: 57-VERIFICATION.md | human_needed | 8/8 truths verified; OAuth/OTP live round-trips require third-party auth |
| verification_gap | Phase 58: 58-VERIFICATION.md | human_needed | 9/9 truths verified; all requirements satisfied per UAT/SECURITY/VALIDATION |
| verification_gap | Phase 59: 59-VERIFICATION.md | human_needed | 9/9 truths verified; all requirements satisfied per UAT 7/7 |

v2.1 deferred to v2 (per REQUIREMENTS.md):

| Category | Item | Reason |
|----------|------|--------|
| v2 | FOLLOW-01: Automatic reminder email after N hours unpaid | Deferred — follow-up automation, not core payment recovery |
| v2 | FOLLOW-02: Audit log of admin edits per booking | Deferred — nice-to-have, not blocking operator workflow |

Items acknowledged and deferred at milestone v2.1 close on 2026-08-25 (8 newly acknowledged, 0 carried forward):

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| deferred_items | Phase 63: deferred-items.md — pre-existing tests/admin-bookings.test.ts mock failures | acknowledged | 2026-08-25 | v2.1 |
| uat_gaps | Phase 64: 64-UAT.md | partial (0 pending) | 2026-08-25 | v2.1 |
| uat_gaps | Phase 53: 53-HUMAN-UAT.md (archived v2.0) | passed | 2026-08-25 | v2.1 |
| verification_gaps | Phase 55: 55-VERIFICATION.md (archived v2.0) | human_needed | 2026-08-25 | v2.1 |
| verification_gaps | Phase 56: 56-VERIFICATION.md (archived v2.0) | human_needed | 2026-08-25 | v2.1 |
| verification_gaps | Phase 57: 57-VERIFICATION.md (archived v2.0) | human_needed | 2026-08-25 | v2.1 |
| verification_gaps | Phase 58: 58-VERIFICATION.md (archived v2.0) | human_needed | 2026-08-25 | v2.1 |
| verification_gaps | Phase 59: 59-VERIFICATION.md (archived v2.0) | human_needed | 2026-08-25 | v2.1 |

v2.1 carried-forward items now tracked as v2.2 Active requirements (per PROJECT.md/REQUIREMENTS.md): FOLLOW-01, CR-02 follow-up, Nyquist validation gap (62/63/64), red test baseline, AUTH-02/03 OAuth config, BOOK-06 — none scheduled into the v2.2 roadmap (Phases 65-67 cover only DISP-*/DTRIP-*); remain candidates for a future milestone.

## Session Continuity

Last session: 2026-09-21T15:54:34.823Z
Stopped at: Phase 74 complete, ready to plan Phase 75
Resume file: /Users/romanustyugov/Desktop/Prestigo/.planning/phases/74-seo-hreflang-localized-metadata-sitemap-structured-data-swit/74-UI-SPEC.md

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 57 P02 | 629 | 3 tasks | 9 files |
| Phase 58 P01 | 322 | 2 tasks | 4 files |
| Phase 58 P02 | 45min | 3 tasks | 3 files |
| Phase 58 P03 | 5min | 2 tasks | 1 file |
| Phase 58 P04 | 2min | 2 tasks | 3 files |
| Phase Phase 58 PP05 | 7min | 4 tasks | 4 files |
| Phase 59 P02 | 3min | 3 tasks | 4 files |
| Phase 59-booking-flow-redesign-blacklane P01 | 30min | 2 tasks | 13 files |
| Phase 59-booking-flow-redesign-blacklane P03 | 10min | 3 tasks | 6 files |
| Phase 59-booking-flow-redesign-blacklane P04 | 8min | 2 tasks | 3 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 62 P02 | 45min | 2 tasks | 8 files |
| Phase 62 P03 | 25min | 2 tasks | 7 files |
| Phase 63 P01 | 15min | 3 tasks | 4 files |
| Phase 63 P02 | 10min | 2 tasks | 3 files |
| Phase 63 P03 | 15min | 2 tasks | 2 files |
| Phase 63 P04 | 12min | 2 tasks | 2 files |
| Phase 63 P05 | ~15min | 2 tasks | 1 files |
| Phase 64 P01 | 30min | 2 tasks | 10 files |
| Phase 64 P02 | 20min | 2 tasks | 5 files |
| Phase 64 P03 | 15min | 2 tasks | 2 files |
| Phase 65 P01 | 52min | 3 tasks | 4 files |
| Phase 65 P02 | 7min | 2 tasks | 4 files |
| Phase 65 P03 | 4min | 2 tasks | 4 files |
| Phase 65 P04 | 15min | 2 tasks | 4 files |
| Phase 66 P01 | ~7min | 4 tasks | 6 files |
| Phase 66 P02 | 5min | 3 tasks | 6 files |
| Phase 68 P01 | 55min | 2 tasks | 118 files |
| Phase 68 P02 | ~19min | 3 tasks | 6 files |
| Phase 69 P01 | 15min | 3 tasks | 16 files |
| Phase 69 P02 | 11min | 2 tasks | 10 files |
| Phase 69 P03 | 22min | 2 tasks | 12 files |
| Phase 69 P04 | 25min | 2 tasks | 9 files |
| Phase 69 P05 | 20min | 2 tasks | 11 files |
| Phase 70 P01 | 5min | 3 tasks | 10 files |
| Phase 70 P03 | 22min | 3 tasks | 24 files |
| Phase 70 P04 | 4min | 3 tasks | 15 files |
| Phase 70 P05 | 6min | 3 tasks | 16 files |
| Phase 70 P07 | 20min | 3 tasks | 12 files |
| Phase 70 P08 | 15min | 3 tasks | 15 files |
| Phase 72 P01 | 55min | 3 tasks | 12 files |
| Phase 72 P02 | 20min | 2 tasks | 6 files |
| Phase 72 P03 | 16min | 3 tasks | 7 files |
| Phase 72 P04 | ~60min (Task1 55min + Task3 5min continuation) | 3 tasks | 2 files |
| Phase 73 P01 | 17min | 3 tasks | 10 files |
| Phase 73 P03 | 15min | 3 tasks | 5 files |
| Phase 73 P04 | 15min | 3 tasks | 31 files |
| Phase 73 P05 | ~10min | 2 tasks | 3 files |
| Phase 73 P06 | 45min | 3 tasks | 4 files |
| Phase 73 P07 | 10min | 3 tasks | 2 files |
| Phase 73 P08 | 25min | 3 tasks | 5 files |
| Phase 73 P10 | ~3min | 2 tasks | 4 files |
| Phase 73 P11 | 20min | 3 tasks | 11 files |
| Phase 73 P09 | ~15min | 2 tasks | 32 files |
| Phase 73 P13 | 30min | 2 tasks | 32 files |
| Phase 73 P14 | 20min | 2 tasks | 3 files |

## Operator Next Steps

- Phase 73 (all 14 plans) is complete; GAP-1/GAP-2/GAP-3 from the 2026-09-19 `73-VERIFICATION.md` `gaps_found` re-review are closed. Re-run phase 73 verification to confirm the score upgrades. The one remaining item is FONT-01's glyph-tofu visual sign-off, which is routed to independent human review (not a code gap) and does not block re-verification.
- Next phase to plan: /gsd-plan-phase 74 (SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher)
