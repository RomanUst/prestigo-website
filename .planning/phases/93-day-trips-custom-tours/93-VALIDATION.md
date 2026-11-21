---
phase: "93"
slug: "day-trips-custom-tours"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-18"
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --exclude '.claude/**' <changed test files>` |
| **Full suite command** | `npx vitest run --exclude '.claude/**'` |
| **Estimated runtime** | ~93 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --exclude '.claude/**' <changed test files>`
- **After every plan wave:** Run `npx vitest run --exclude '.claude/**'`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 93 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 93-01-01 | 01 | 1 | TRIP-03, TRIP-04, TRIP-05 | T-93-01..04 | confirm the tour data model and the 'tour' booking value (one-way door, D-08) | decision | — (owner decision) | n/a | ⬜ pending |
| 93-01-02 | 01 | 1 | TRIP-03, TRIP-04, TRIP-05 | T-93-01..04 | 092 creates the tour tables, settings row, bookings columns and photo bucket, pinned by... | static | `npx vitest run --exclude '.claude/**' tests/migration-092.test.ts tests/migration-091.test.ts` | ❌ W0 | ⬜ pending |
| 93-01-03 | 01 | 1 | TRIP-03, TRIP-04, TRIP-05 | T-93-01..04 | the orchestrator applies 092 through the Supabase MCP and runs a rolled-back smoke | orchestrator/owner + static | `npx vitest run --exclude '.claude/**' tests/migration-092.test.ts` | ✅ (from 93-01-02) | ⬜ pending |
| 93-02-01 | 02 | 1 | TRIP-01, TRIP-02, TRIP-04, TRIP-06 | T-93-05..06 | EN Tours/TourEmails namespaces and ru, guarded by tests/tours-copy-i18n.test.ts | unit | `npx vitest run --exclude '.claude/**' tests/tours-copy-i18n.test.ts tests/i18n-completeness.test.ts` | ❌ W0 | ⬜ pending |
| 93-02-02 | 02 | 1 | TRIP-01, TRIP-02, TRIP-04, TRIP-06 | T-93-05..06 | es and fr translations of Tours and TourEmails | unit | `npx vitest run --exclude '.claude/**' tests/tours-copy-i18n.test.ts tests/i18n-completeness.test.ts` | ✅ (from 93-02-01) | ⬜ pending |
| 93-02-03 | 02 | 1 | TRIP-01, TRIP-02, TRIP-04, TRIP-06 | T-93-05..06 | ar, hi and zh translations, zh-hant generated, PENDING emptied | unit | `npx vitest run --exclude '.claude/**' tests/tours-copy-i18n.test.ts tests/i18n-completeness.test.ts tests/i18n-catalog-array-types.test.ts` | ✅ (from 93-02-01) | ⬜ pending |
| 93-03-01 | 03 | 1 | TRIP-04 | T-93-07..08 | move CardForm, PaymentChoiceTiles and the Elements block into CardPaymentStage; Step6Ca... | component | `npx vitest run --exclude '.claude/**' tests/Step6CardOnFile.test.tsx tests/Step6Payment.test.tsx tests/cancellation-policy-note.test.tsx` | ✅ | ⬜ pending |
| 93-03-02 | 03 | 1 | TRIP-04 | T-93-07..08 | CardPaymentStage works with injected callbacks and no wizard store | component | `npx vitest run --exclude '.claude/**' tests/card-payment-stage.test.tsx tests/Step6CardOnFile.test.tsx` | ❌ W0 | ⬜ pending |
| 93-04-01 | 04 | 1 | TRIP-02 | T-93-09..10 | licence script + one Český Krumlov entry accepted by the manifest guard | unit | `npx vitest run --exclude '.claude/**' tests/tour-photos-manifest.test.ts` | ❌ W0 | ⬜ pending |
| 93-04-02 | 04 | 1 | TRIP-02 | T-93-09..10 | complete manifest for all 6 tours; the guard requires all 6 | unit | `npx vitest run --exclude '.claude/**' tests/tour-photos-manifest.test.ts` | ✅ (from 93-04-01) | ⬜ pending |
| 93-05-01 | 05 | 2 | TRIP-01, TRIP-02, TRIP-03, TRIP-04 | T-93-11..14 | published tour read through the guarded store is priced by tourFare | unit | `npx vitest run --exclude '.claude/**' tests/tour-store.test.ts tests/tour-pricing.test.ts` | ❌ W0 | ⬜ pending |
| 93-05-02 | 05 | 2 | TRIP-01, TRIP-02, TRIP-03, TRIP-04 | T-93-11..14 | locale completeness with leak guard and the publish checklist | unit | `npx vitest run --exclude '.claude/**' tests/tour-completeness.test.ts` | ❌ W0 | ⬜ pending |
| 93-05-03 | 05 | 2 | TRIP-01, TRIP-02, TRIP-03, TRIP-04 | T-93-11..14 | tour cancellation snapshot (24 h, 100 %) and the Prague pickup-area check | unit | `npx vitest run --exclude '.claude/**' tests/tour-policy.test.ts tests/tour-pickup-area.test.ts tests/cancellation-policy.test.ts tests/cancellation-wording.test.ts tests/payments-cancel.test.ts` | ❌ W0 | ⬜ pending |
| 93-06-01 | 06 | 2 | TRIP-04 | T-93-15..16 | a tour booking row maps to a CBooking draft with tripType 'tour' | unit | `npx vitest run --exclude '.claude/**' tests/customer-mapping-parity.test.ts tests/espocrm-model.test.ts tests/espocrm-booking-map.test.ts tests/lead-sync-booking.test.ts` | ✅ | ⬜ pending |
| 93-06-02 | 06 | 2 | TRIP-04 | T-93-15..16 | dispatch filter accepts 'tour'; admin PATCH never re-prices a tour booking | unit | `npx vitest run --exclude '.claude/**' tests/admin-bookings-tour.test.ts tests/admin-bookings.test.ts tests/admin-bookings-dispatch.test.ts tests/admin-bookings-edit-payment.test.ts` | ❌ W0 | ⬜ pending |
| 93-07-01 | 07 | 3 | TRIP-03, TRIP-05 | T-93-17..20 | create a draft, save English content, read back is_complete from the server | unit | `npx vitest run --exclude '.claude/**' tests/admin-tours-route.test.ts` | ❌ W0 | ⬜ pending |
| 93-07-02 | 07 | 3 | TRIP-03, TRIP-05 | T-93-17..20 | basics bounds, slug lock, reorder and zh-Hant fill | unit | `npx vitest run --exclude '.claude/**' tests/admin-tours-route.test.ts` | ✅ (from 93-07-01) | ⬜ pending |
| 93-07-03 | 07 | 3 | TRIP-03, TRIP-05 | T-93-17..20 | tour settings API (extra-hour prices, free-cancellation hours, pickup radius) | unit | `npx vitest run --exclude '.claude/**' tests/admin-tour-settings-route.test.ts tests/admin-tours-route.test.ts` | ❌ W0 | ⬜ pending |
| 93-08-01 | 08 | 4 | TRIP-05, TRIP-02 | T-93-21..24 | signed upload, register-after-verify, first photo is the cover | unit | `npx vitest run --exclude '.claude/**' tests/admin-tour-photos.test.ts` | ❌ W0 | ⬜ pending |
| 93-08-02 | 08 | 4 | TRIP-05, TRIP-02 | T-93-21..24 | photo edits, delete rules and publish / unpublish with the checklist | unit | `npx vitest run --exclude '.claude/**' tests/admin-tour-photos.test.ts tests/admin-tour-publish.test.ts` | ❌ W0 | ⬜ pending |
| 93-08-03 | 08 | 4 | TRIP-05, TRIP-02 | T-93-21..24 | Supabase image host in CSP img-src (public, static, admin) and next/image remotePatterns | unit | `npx vitest run --exclude '.claude/**' tests/middleware-tour-photos-csp.test.ts tests/middleware-i18n.test.ts tests/middleware-embed.test.ts tests/middleware-matcher.test.ts tests/middleware-csrf-forms.test.ts` | ❌ W0 | ⬜ pending |
| 93-09-01 | 09 | 4 | TRIP-03, TRIP-05 | T-93-25..26 | tours list page reads the API and New tour creates a draft that opens its editor | component | `npx vitest run --exclude '.claude/**' tests/admin-tours-list.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-09-02 | 09 | 4 | TRIP-03, TRIP-05 | T-93-25..26 | Tour settings card and immediate reorder with rollback | component | `npx vitest run --exclude '.claude/**' tests/admin-tour-settings-card.test.tsx tests/admin-tours-list.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-10-01 | 10 | 5 | TRIP-05, TRIP-03 | T-93-27..28 | editor page loads a draft, saves basics, the checklist updates and Publish works when i... | component | `npx vitest run --exclude '.claude/**' tests/admin-tour-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-10-02 | 10 | 5 | TRIP-05, TRIP-03 | T-93-27..28 | content by language — eight tabs, list editors, server completeness, zh-Hant fill | component | `npx vitest run --exclude '.claude/**' tests/admin-tour-content-tabs.test.tsx tests/admin-tour-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-10-03 | 10 | 5 | TRIP-05, TRIP-03 | T-93-27..28 | photo manager — upload with progress, credits, cover, order, delete | component | `npx vitest run --exclude '.claude/**' tests/admin-tour-photo-manager.test.tsx tests/admin-tour-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-11-01 | 11 | 3 | TRIP-01, TRIP-02 | T-93-29..32 | [slug] resolves landing or published tour, redirects an incomplete locale, renders titl... | component | `npx vitest run --exclude '.claude/**' tests/tour-pages.test.tsx tests/seo-volume-pages.test.ts tests/fleet-vehicle-pages.test.tsx` | ❌ W0 | ⬜ pending |
| 93-11-02 | 11 | 3 | TRIP-01, TRIP-02 | T-93-29..32 | TouristTrip JSON-LD with live Offers, safeJsonLd, and hreflang for complete locales only | component | `npx vitest run --exclude '.claude/**' tests/tour-jsonld.test.ts tests/seo.test.ts tests/jsonld.test.ts tests/route-metadata-seo.test.ts tests/tour-pages.test.tsx` | ❌ W0 | ⬜ pending |
| 93-11-03 | 11 | 3 | TRIP-01, TRIP-02 | T-93-29..32 | render contract checks — no English leak, no price text in markup copy, no scarcity, RT... | component | `npx vitest run --exclude '.claude/**' tests/tour-pages.test.tsx tests/seo-snippets-no-prices.test.ts` | ✅ (from 93-11-01) | ⬜ pending |
| 93-12-01 | 12 | 3 | TRIP-04, TRIP-03 | T-93-33..34 | date, start time, passengers and car lead to /book/tour with the six query values | component | `npx vitest run --exclude '.claude/**' tests/tour-booking-box.test.tsx tests/tour-checkout-query.test.ts` | ❌ W0 | ⬜ pending |
| 93-12-02 | 12 | 3 | TRIP-04, TRIP-03 | T-93-33..34 | extra time 0..12, total per car, inline errors with focus, custom-tour links, class fil... | component | `npx vitest run --exclude '.claude/**' tests/tour-booking-box.test.tsx` | ✅ (from 93-12-01) | ⬜ pending |
| 93-12-03 | 12 | 3 | TRIP-04, TRIP-03 | T-93-33..34 | mobile sticky bar and the chat launcher rule on tour pages | component | `npx vitest run --exclude '.claude/**' tests/tour-sticky-bar.test.tsx tests/chat-launcher-i18n.test.ts tests/tour-booking-box.test.tsx` | ❌ W0 | ⬜ pending |
| 93-13-01 | 13 | 4 | TRIP-02, TRIP-04 | T-93-35..36 | gallery layouts and the booking area placed on the tour page | component | `npx vitest run --exclude '.claude/**' tests/tour-gallery.test.tsx tests/tour-pages.test.tsx` | ❌ W0 | ⬜ pending |
| 93-13-02 | 13 | 4 | TRIP-02, TRIP-04 | T-93-35..36 | lightbox dialog and the photo credits disclosure | component | `npx vitest run --exclude '.claude/**' tests/tour-gallery.test.tsx tests/tour-pages.test.tsx` | ✅ (from 93-13-01) | ⬜ pending |
| 93-13-03 | 13 | 4 | TRIP-02, TRIP-04 | T-93-35..36 | restore the box from sessionStorage and sticky-aside behaviour | component | `npx vitest run --exclude '.claude/**' tests/tour-gallery.test.tsx tests/tour-booking-box.test.tsx tests/tour-pages.test.tsx` | ✅ (from 93-13-01) | ⬜ pending |
| 93-14-01 | 14 | 5 | TRIP-01 | T-93-37..38 | hub shows the published tours of the locale as cards linking to their pages | component | `npx vitest run --exclude '.claude/**' tests/tour-catalogue.test.tsx tests/landing-change.test.ts tests/seo-volume-pages.test.ts` | ❌ W0 | ⬜ pending |
| 93-14-02 | 14 | 5 | TRIP-01 | T-93-37..38 | custom-tour block (compact and band) and "You might also like" on tour pages | component | `npx vitest run --exclude '.claude/**' tests/tour-catalogue.test.tsx tests/tour-pages.test.tsx` | ✅ (from 93-14-01) | ⬜ pending |
| 93-14-03 | 14 | 5 | TRIP-01 | T-93-37..38 | services index "also popular" lists the hub and the published tours | component | `npx vitest run --exclude '.claude/**' tests/tour-catalogue.test.tsx tests/seo-volume-pages.test.ts` | ✅ (from 93-14-01) | ⬜ pending |
| 93-15-01 | 15 | 6 | TRIP-01 | T-93-39..40 | async sitemap lists published tours per complete locale | unit | `npx vitest run --exclude '.claude/**' tests/sitemap.test.ts tests/tour-sitemap.test.ts` | ❌ W0 | ⬜ pending |
| 93-15-02 | 15 | 6 | TRIP-01 | T-93-39..40 | route pages link to their day trip (no keyword overlap) | component | `npx vitest run --exclude '.claude/**' tests/tour-route-links.test.tsx tests/routes-a.test.ts tests/routes-b.test.ts tests/routes-c.test.ts tests/route-metadata-seo.test.ts` | ❌ W0 | ⬜ pending |
| 93-15-03 | 15 | 6 | TRIP-01 | T-93-39..40 | delete the 32 retired day-trip landing JSON files | component | `npx vitest run --exclude '.claude/**' tests/seo-volume-pages.test.ts tests/tour-pages.test.tsx tests/i18n-freeze-manifest.test.ts tests/i18n-completeness.test.ts tests/sitemap.test.ts` | ✅ (from 93-11-01) | ⬜ pending |
| 93-16-01 | 16 | 3 | TRIP-04 | T-93-41..44 | a valid tour body validates and is priced by the server with tourFare | unit | `npx vitest run --exclude '.claude/**' tests/checkout-compute-tour.test.ts tests/checkout-compute.test.ts tests/checkout-stops.test.ts tests/checkout-landing.test.ts` | ❌ W0 | ⬜ pending |
| 93-16-02 | 16 | 3 | TRIP-04 | T-93-41..44 | every tour refusal code (unpublished, airport, out of area, stops, landing, return, pro... | unit | `npx vitest run --exclude '.claude/**' tests/checkout-compute-tour.test.ts tests/checkout-compute.test.ts tests/card-checkout-init.test.ts tests/card-checkout-intent.test.ts` | ✅ (from 93-16-01) | ⬜ pending |
| 93-17-01 | 17 | 4 | TRIP-04 | T-93-45..48 | an intent for a tour stores a 'tour' booking with the tour columns and a 'tour-' policy... | unit | `npx vitest run --exclude '.claude/**' tests/card-checkout-tour.test.ts tests/card-checkout-intent.test.ts tests/card-checkout-cash.test.ts tests/checkout-stops-persist.test.ts` | ❌ W0 | ⬜ pending |
| 93-17-02 | 17 | 4 | TRIP-04 | T-93-45..48 | init policy preview and reason codes, price-changed 409, operator extra charge on a tou... | unit | `npx vitest run --exclude '.claude/**' tests/card-checkout-tour.test.ts tests/card-checkout-init.test.ts tests/admin-extra-route.test.ts tests/cancellation-policy.test.ts` | ✅ (from 93-17-01) | ⬜ pending |
| 93-18-01 | 18 | 5 | TRIP-04 | T-93-49..52 | valid query, Prague pickup and details lead to init and a mounted payment stage | component | `npx vitest run --exclude '.claude/**' tests/tour-checkout.test.tsx` | ❌ W0 | ⬜ pending |
| 93-18-02 | 18 | 5 | TRIP-04 | T-93-49..52 | pickup refusal panel and every checkout state | component | `npx vitest run --exclude '.claude/**' tests/tour-checkout.test.tsx` | ✅ (from 93-18-01) | ⬜ pending |
| 93-18-03 | 18 | 5 | TRIP-04 | T-93-49..52 | confirmation snapshot and the way back to the tour page | component | `npx vitest run --exclude '.claude/**' tests/tour-checkout.test.tsx tests/card-payment-stage.test.tsx` | ✅ (from 93-18-01) | ⬜ pending |
| 93-19-01 | 19 | 6 | TRIP-04 | T-93-53..54 | the confirmation page renders the tour variant from the snapshot | component | `npx vitest run --exclude '.claude/**' tests/confirmation-tour.test.tsx tests/confirmation-page.test.tsx tests/confirmation-page-i18n.test.tsx tests/ics.test.ts` | ❌ W0 | ⬜ pending |
| 93-19-02 | 19 | 6 | TRIP-04 | T-93-53..54 | tour rows in client confirmation, reminder and operator emails | unit | `npx vitest run --exclude '.claude/**' tests/email-tour-rows.test.ts tests/email.test.ts tests/email-policy-block.test.ts tests/payments-emails.test.ts tests/email-trip-route.test.ts` | ❌ W0 | ⬜ pending |
| 93-19-03 | 19 | 6 | TRIP-04 | T-93-53..54 | Google Calendar ops event and the client manage page for tours | component | `npx vitest run --exclude '.claude/**' tests/google-calendar-sync.test.ts tests/manage-page.test.tsx tests/email-tour-rows.test.ts` | ✅ (from 93-19-02) | ⬜ pending |
| 93-20-01 | 20 | 3 | TRIP-04 | T-93-55..56 | tour bookings read as day trips in admin, dispatch and the driver screen; Tour filter chip | component | `npx vitest run --exclude '.claude/**' tests/admin-booking-tour-display.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-20-02 | 20 | 3 | TRIP-04 | T-93-55..56 | read-only tour price in the edit panel and the extra-hour hint in the extra-charge modal | component | `npx vitest run --exclude '.claude/**' tests/admin-booking-tour-display.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-bookings-edit-payment.test.ts` | ✅ (from 93-20-01) | ⬜ pending |
| 93-21-01 | 21 | 3 | TRIP-01, TRIP-02 | T-93-57..59 | seed library + Dresden EN content pass the content rules and become a complete en row | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed.test.ts tests/tour-seed-content.test.ts` | ❌ W0 | ⬜ pending |
| 93-21-02 | 21 | 3 | TRIP-01, TRIP-02 | T-93-57..59 | English content for the other five tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-21-03 | 21 | 3 | TRIP-01, TRIP-02 | T-93-57..59 | seed runner with price proposal, hub and terms in English | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed.test.ts tests/tour-seed-content.test.ts tests/seo-snippets-no-prices.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-22-01 | 22 | 4 | TRIP-01, TRIP-02 | T-93-60 | Russian content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-22-02 | 22 | 4 | TRIP-01, TRIP-02 | T-93-60 | ru hub copy and day-trip terms clause | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-23-01 | 23 | 4 | TRIP-01, TRIP-02 | T-93-82 | Spanish content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-23-02 | 23 | 4 | TRIP-01, TRIP-02 | T-93-82 | es hub copy and day-trip terms clause | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-24-01 | 24 | 4 | TRIP-01, TRIP-02 | T-93-83 | French content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-24-02 | 24 | 4 | TRIP-01, TRIP-02 | T-93-83 | fr hub copy and day-trip terms clause | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-25-01 | 25 | 4 | TRIP-01, TRIP-02 | T-93-61 | Arabic content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-25-02 | 25 | 4 | TRIP-01, TRIP-02 | T-93-61 | ar hub copy and day-trip terms clause | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-26-01 | 26 | 4 | TRIP-01, TRIP-02 | T-93-84 | Hindi content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-26-02 | 26 | 4 | TRIP-01, TRIP-02 | T-93-84 | hi hub copy and day-trip terms clause | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-27-01 | 27 | 5 | TRIP-01, TRIP-02 | T-93-85 | Simplified Chinese content for the six tours | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-27-02 | 27 | 5 | TRIP-01, TRIP-02 | T-93-85 | zh hub and terms, zh-hant pages regenerated | unit | `npx vitest run --exclude '.claude/**' tests/i18n-completeness.test.ts tests/landing-change.test.ts tests/tour-seed-content.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-27-03 | 27 | 5 | TRIP-01, TRIP-02 | T-93-85 | 6 x 8 completeness proof over the whole seed tree | unit | `npx vitest run --exclude '.claude/**' tests/tour-seed.test.ts tests/tour-seed-content.test.ts` | ✅ (from 93-21-01) | ⬜ pending |
| 93-28-01 | 28 | 7 | TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05 | T-93-62..64 | end-to-end tour test and the full quality gate | unit | `npx vitest run --exclude '.claude/**' tests/phase93-tours-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 93-28-02 | 28 | 7 | TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05 | T-93-62..64 | owner approves the initial tour price table (D-21) | decision | — (owner decision) | n/a | ⬜ pending |
| 93-28-03 | 28 | 7 | TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05 | T-93-62..64 | seed and publish, EspoCRM sync, PR 1 merge, live proofs | orchestrator/owner + static | `npx vitest run --exclude '.claude/**' tests/phase93-tours-e2e.test.ts` | ✅ (from 93-28-01) | ⬜ pending |
| 93-29-01 | 29 | 8 | TRIP-06 | T-93-65..67 | 093 accepts kind custom_tour and the inquiry maps to a 'Custom tour' Lead | static | `npx vitest run --exclude '.claude/**' tests/migration-093.test.ts tests/outbox-migrations.test.ts tests/lead-mapping.test.ts tests/lead-sync.test.ts` | ❌ W0 | ⬜ pending |
| 93-29-02 | 29 | 8 | TRIP-06 | T-93-65..67 | EspoCRM Lead source enum and the stats source form_custom_tour | static | `npx vitest run --exclude '.claude/**' tests/espocrm-enums.test.ts tests/stats-migration.test.ts tests/stats-conversion-083-migration.test.ts tests/admin-stats-period.test.ts tests/migration-093.test.ts` | ✅ (from 93-29-01) | ⬜ pending |
| 93-29-03 | 29 | 8 | TRIP-06 | T-93-65..67 | the orchestrator applies 093 through the Supabase MCP and runs a rolled-back smoke | orchestrator/owner + static | `npx vitest run --exclude '.claude/**' tests/migration-093.test.ts` | ✅ (from 93-29-01) | ⬜ pending |
| 93-30-01 | 30 | 9 | TRIP-06 | T-93-68..69 | alert.custom_tour row delivers a private ops note with the admin link only | unit | `npx vitest run --exclude '.claude/**' tests/custom-tour-chatwoot.test.ts tests/outbox.test.ts tests/lead-sync.test.ts` | ❌ W0 | ⬜ pending |
| 93-30-02 | 30 | 9 | TRIP-06 | T-93-68..69 | outbox admin label and the retry / breaker behaviour | unit | `npx vitest run --exclude '.claude/**' tests/custom-tour-chatwoot.test.ts tests/outbox-admin.test.ts tests/outbox-backoff.test.ts` | ✅ (from 93-30-01) | ⬜ pending |
| 93-31-01 | 31 | 9 | TRIP-07 | T-93-70..71 | a quote created from a request is linked to it | unit | `npx vitest run --exclude '.claude/**' tests/admin-quotes-route.test.ts tests/admin-quotes-lifecycle.test.ts tests/quotes-status.test.ts` | ✅ | ⬜ pending |
| 93-31-02 | 31 | 9 | TRIP-07 | T-93-70..71 | custom-tour requests list and detail API with quote status | unit | `npx vitest run --exclude '.claude/**' tests/admin-custom-tours-route.test.ts tests/admin-quotes-route.test.ts` | ❌ W0 | ⬜ pending |
| 93-32-01 | 32 | 10 | TRIP-06 | T-93-72..75 | POST /api/custom-tour stores the request and queues CRM and Chatwoot | unit | `npx vitest run --exclude '.claude/**' tests/custom-tour-route.test.ts tests/middleware-csrf-forms.test.ts tests/submit-multiday-quote.test.ts tests/inquiry-routes.test.ts` | ❌ W0 | ⬜ pending |
| 93-32-02 | 32 | 10 | TRIP-06 | T-93-72..75 | operator alert (English) and localized client acknowledgement | unit | `npx vitest run --exclude '.claude/**' tests/custom-tour-emails.test.ts tests/custom-tour-route.test.ts tests/email.test.ts` | ❌ W0 | ⬜ pending |
| 93-33-01 | 33 | 10 | TRIP-07 | T-93-76..77 | request detail page creates a linked quote and opens the builder | component | `npx vitest run --exclude '.claude/**' tests/admin-custom-tours-pages.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| 93-33-02 | 33 | 10 | TRIP-07 | T-93-76..77 | requests list with filters, paging and the sidebar entry | component | `npx vitest run --exclude '.claude/**' tests/admin-custom-tours-pages.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (from 93-33-01) | ⬜ pending |
| 93-33-03 | 33 | 10 | TRIP-07 | T-93-76..77 | request card and first-line prefill in the quote builder | component | `npx vitest run --exclude '.claude/**' tests/quote-builder.test.tsx tests/quote-line-editor.test.tsx tests/admin-custom-tours-pages.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (from 93-33-01) | ⬜ pending |
| 93-34-01 | 34 | 9 | TRIP-06 | T-93-78..79 | request page with tour prefill submits to /api/custom-tour and shows the success panel | component | `npx vitest run --exclude '.claude/**' tests/custom-tour-form.test.tsx` | ❌ W0 | ⬜ pending |
| 93-34-02 | 34 | 9 | TRIP-06 | T-93-78..79 | error states and the live switch for every entry point | component | `npx vitest run --exclude '.claude/**' tests/custom-tour-form.test.tsx tests/tour-pickup-area.test.ts tests/tour-policy.test.ts tests/tour-catalogue.test.tsx tests/tour-booking-box.test.tsx tests/tour-checkout.test.tsx` | ✅ (from 93-34-01) | ⬜ pending |
| 93-35-01 | 35 | 11 | TRIP-06, TRIP-07 | T-93-80..81 | end-to-end custom-tour test and the full quality gate | unit | `npx vitest run --exclude '.claude/**' tests/phase93-custom-tour-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 93-35-02 | 35 | 11 | TRIP-06, TRIP-07 | T-93-80..81 | EspoCRM sync, PR 2 merge and the live custom-tour proof | orchestrator/owner + static | `npx vitest run --exclude '.claude/**' tests/phase93-custom-tour-e2e.test.ts` | ✅ (from 93-35-01) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. "❌ W0" = the task's own TDD step writes the test file first (in-plan Wave 0); "✅ (from …)" = created by an earlier task.*

---

## Wave 0 Requirements

Framework, config and helpers already exist (vitest 4, jsdom, `tests/helpers/latest-migration.ts`, `tests/helpers/fake-payments-db.ts`); no install. Each plan's first task writes its test file before the code (TDD), so Wave 0 is in-plan. Items:

- [ ] Live `pg_constraint` read for `public.bookings` + `SELECT DISTINCT trip_type` (orchestrator, Supabase MCP) — 93-01 Task 1, before 092 is written
- [ ] `tests/migration-092.test.ts` (93-01), `tests/migration-093.test.ts` (93-29)
- [ ] `tests/tours-copy-i18n.test.ts` (93-02)
- [ ] `tests/card-payment-stage.test.tsx` (93-03)
- [ ] `tests/tour-photos-manifest.test.ts` (93-04)
- [ ] `tests/tour-store.test.ts`, `tests/tour-pricing.test.ts`, `tests/tour-completeness.test.ts`, `tests/tour-policy.test.ts`, `tests/tour-pickup-area.test.ts` (93-05)
- [ ] `tests/admin-bookings-tour.test.ts` (93-06)
- [ ] `tests/admin-tours-route.test.ts`, `tests/admin-tour-settings-route.test.ts` (93-07)
- [ ] `tests/admin-tour-photos.test.ts`, `tests/admin-tour-publish.test.ts`, `tests/middleware-tour-photos-csp.test.ts` (93-08)
- [ ] `tests/admin-tours-list.test.tsx`, `tests/admin-tour-settings-card.test.tsx` (93-09)
- [ ] `tests/admin-tour-editor.test.tsx`, `tests/admin-tour-content-tabs.test.tsx`, `tests/admin-tour-photo-manager.test.tsx` (93-10)
- [ ] `tests/tour-pages.test.tsx`, `tests/tour-jsonld.test.ts` (93-11)
- [ ] `tests/tour-booking-box.test.tsx`, `tests/tour-checkout-query.test.ts`, `tests/tour-sticky-bar.test.tsx` (93-12)
- [ ] `tests/tour-gallery.test.tsx` (93-13), `tests/tour-catalogue.test.tsx` (93-14)
- [ ] `tests/tour-sitemap.test.ts`, `tests/tour-route-links.test.tsx`; `tests/sitemap.test.ts` rewritten to `await sitemap()` (93-15)
- [ ] `tests/checkout-compute-tour.test.ts` (93-16); `tests/card-checkout-tour.test.ts` + tour columns in `tests/helpers/fake-payments-db.ts` (93-17)
- [ ] `tests/tour-checkout.test.tsx` (93-18); `tests/confirmation-tour.test.tsx`, `tests/email-tour-rows.test.ts` (93-19)
- [ ] `tests/admin-booking-tour-display.test.tsx` (93-20)
- [ ] `tests/tour-seed.test.ts`, `tests/tour-seed-content.test.ts` + seed content `content/tours-seed/**` (93-21; one plan per locale 93-22..93-27; 6 x 8 proof in 93-27)
- [ ] `tests/phase93-tours-e2e.test.ts` (93-28), `tests/phase93-custom-tour-e2e.test.ts` (93-35)
- [ ] `tests/custom-tour-chatwoot.test.ts` (93-30); `tests/admin-custom-tours-route.test.ts` (93-31); `tests/custom-tour-route.test.ts`, `tests/custom-tour-emails.test.ts` (93-32); `tests/admin-custom-tours-pages.test.tsx` (93-33); `tests/custom-tour-form.test.tsx` (93-34)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live apply + rolled-back smoke of 092 / 093 | TRIP-03..06 | executors have no Supabase MCP | 93-01 Task 3, 93-29 Task 3 (orchestrator) |
| Owner approves initial price table (D-21) | TRIP-03 | business decision | 93-28 Task 2 (`npx tsx scripts/seed-tours.ts --dry-run` table) |
| Seed apply + publish, EspoCRM sync, PR merges, live canary bookings (card hold, cash) | TRIP-01..05 | production, owner card, VPS access | 93-28 Task 3 |
| EspoCRM 'Custom tour' sync, live request -> Lead / Chatwoot note / ack / quote, erasure cleanup | TRIP-06, TRIP-07 | production, VPS, owner mailbox | 93-35 Task 2 |
| Broken-image tile keeps its box (UI E2, backstop) | TRIP-02 | real browser | 93-13 Task 3 human-check |
| Long text ru / hi at 360px (UI E4, backstop) | TRIP-01 | real browser | 93-11 Task 3 human-check |
| Sticky bar at 320px in ru / fr / hi (UI E8, backstop) | TRIP-04 | real browser | 93-12 Task 3 human-check |
| Places script failure on the tour checkout (UI E12, unresolved — planner assumption: existing AddressInputNew behaviour) | TRIP-04 | third-party script | 93-18 Task 3 human-check |
| Admin AR / HI / ZH inputs without tofu on macOS + Windows (UI E21, backstop) | TRIP-05 | OS fonts | 93-10 Task 2 human-check, 93-28 Task 3 step 7 |
| 1000-character request in admin list / detail (UI E23, backstop) | TRIP-07 | real browser | 93-33 Task 3 human-check |
| ar tour confirmation / reminder email in Gmail, Outlook, Apple Mail (UI E24, unresolved) | TRIP-04 | real mail clients | 93-19 Task 3 human-check, 93-28 Task 3 step 7 |
| Chatwoot ops note appears after PR 2 go-live (UI E24, unresolved) | TRIP-06 | live Chatwoot | 93-35 Task 2 step 4 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the two `checkpoint:decision` tasks 93-01-01 and 93-28-02 are owner decisions with no code)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (every ❌ W0 file is written first by its own task)
- [x] No watch-mode flags (`vitest run` everywhere)
- [x] Feedback latency < 93s (per-task commands are scoped file lists; full suite only in 93-28 / 93-35)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
