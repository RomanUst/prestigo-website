# Phase 75: E2E Verification & Launch - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

i18n (7 locales: EN root + `/ru /es /fr /ar /hi /zh`) is **already live in production** on rideprestigo.com (verified 2026-09-24: `/ru`, `/ar`, `/zh/book` → 200, `<html lang="ru">`, full hreflang cluster incl. `zh-Hans` + `x-default`). This phase therefore **verifies** the live multilingual site end-to-end (VER-01), **closes the gaps found** (EN leaks, missing locale analytics dimension, red test baseline), and **closes milestone v3.0** ("launch" = GSC + validation + milestone close + announcement drafts, not a deploy).

Known gaps going in:
- Analytics carries **no locale** today (no `locale` reference in GA4/Meta code) — must be built, not only verified.
- Known EN leaks (STATE.md, 2026-09-24): `/book` hero ("Your transfer, confirmed in seconds.", "Instant booking") + "How it works" steps (`app/[locale]/book/page.tsx`); `/book/multi-day` "Example itineraries" (EXAMPLES const + headings); `/services/airport-transfer` booking block ("Book your chauffeur now", bullet list); `CorporateForm` notes placeholder. Needs a systematic audit, not just these.

</domain>

<decisions>
## Implementation Decisions

### Per-locale booking verification
- **D-01:** Guest booking is driven through **all 6 wizard steps up to a rendered, localized Stripe payment form** in every one of the 7 locales. **No real payment** is submitted.
- **D-02:** Booking E2E runs against **production (rideprestigo.com)**. Reasons: i18n is already live there; Vercel Preview deploys always fail; local `.env.local` Stripe key is a dead placeholder.
- **D-03:** Test bookings carry an explicit marker (e.g. name `E2E TEST`, email `e2e+{locale}@rideprestigo.com`). ABND writes a row at the payment step, so after the run these marker rows are **deleted from Supabase by marker** (keeps the admin/dispatch list clean). Deletion must match the marker strictly — never a broad filter. — **Reversibility:** one-way — deleted rows are gone; the strict marker filter is the guardrail.
- **D-04:** Guest checkout in **all 7** locales; sign-in + account ("My trips") path in **RU and AR (RTL)** with a test account.
- **D-05:** Post-booking surfaces (confirmation page, client email language) are **recorded as-is**. If the client email is EN-only, that is logged as a deferred item (email localization is a new capability), not fixed here. Since no real payment is made, email/confirmation language is established from code/templates rather than a live send.

### EN-leak audit
- **D-06:** Two-layer audit: (1) **static** scan for hardcoded English strings in JSX/props under `app/[locale]/**` and `components/**`; (2) **rendered** scan of production pages — Latin-script detection on `ru/ar/hi/zh` with a DNT allowlist (PRESTIGO, Mercedes, E-Class/S-Class/V-Class, brand/place names, glossary DNT terms from `i18n/glossary.json`), and diff-against-EN-version for `es/fr`.
- **D-07:** Scope of "no EN leakage" covers **all four surfaces**: visible page text (marketing, booking, account, login); form validation errors, toasts, placeholders, `aria-label`, `alt`, user-visible API error messages; metadata/OG/JSON-LD (regression check of Phase 74 work); **Stripe Elements `locale`** and **Google Places autocomplete `language`** following the site locale.
- **D-08:** Fixes: strings externalized into `messages/*.json` (or the content model), translated **in-session** into all 6 locales (Anthropic API credit is empty; `i18n Translate` GH workflow is disabled), and the **translation manifest hashes are updated/frozen** for those keys so a future pipeline run neither overwrites nor re-spends tokens on them. Never run `i18n-translate --dry-run` on the repo tree (it writes `[AR]` stubs over real content).
- **D-09:** Intentional EN-fallback is an **explicit allowlist, not a leak**: untranslated blog posts and the 3 EN-only `JSX_POSTS` (already self-canonical → EN and excluded from hreflang per 71 D-07/D-08, 74 D-07). The ~10 `hi` headings with DNT-fallback (WINDOWS #6) **are fixed** in this phase.

### Locale analytics dimension
- **D-10:** GA4: every event carries a **`site_locale`** param (set via gtag config so page_view, begin_checkout, purchase etc. all get it), registered as an **event-scoped custom dimension** in GA4 (via Admin API if access allows, otherwise the user registers it manually — surface as a checkpoint). Built-in `language` is browser language, not site locale — not used.
- **D-11:** Server-side: locale is **persisted with the booking** (Stripe PaymentIntent metadata and/or a `bookings` column — Claude's discretion) and the Stripe webhook forwards it into the **server GA4 purchase** and **Meta CAPI** events. Makes revenue splittable by language and shows booking language in admin. — **Reversibility:** one-way if a DB column is added — requires a migration (next number after `061_…`); PaymentIntent metadata alone is reversible.
- **D-12:** Meta: `custom_data.site_locale` on all `trackMetaEvent` events, **identical on Pixel and CAPI** so eventId deduplication is not broken.

### E2E format & launch
- **D-13:** E2E is a set of **repeatable QA scripts in `scripts/qa/`** in the same style as `overflow_audit.py` (Python Playwright, base-URL argument): render, switcher, EN-leak, hreflang reciprocity, CSP, booking. Results written into `75-VERIFICATION.md`. **Not wired into CI** (Preview deploys fail anyway). Re-run the existing overflow audit as a regression check (was 0 issues on 2026-09-24).
- **D-14:** "Launch" includes: **GSC** sitemap resubmit + indexing request for key locale pages + a per-locale indexing baseline recorded; **Rich Results Test** on sampled locale URLs + **hreflang reciprocity validator** across clusters; **milestone v3.0 close** (audit-milestone → complete-milestone, tag v3.0); **announcement** for the 7-language site as **Metricool drafts only** (never publish; analytics-picked slots; no prices; no Uber comparisons; plain pain-point copy).
- **D-15:** Red baseline: vitest must be **green for all files touched by v3.0 (Phases 68–75)** — fix or justifiably remove failing tests there. Pre-existing unrelated failures (e.g. `tests/admin-bookings.test.ts` mock failures from v2.1) are **listed, not fixed**.

### Claude's Discretion
- Script structure/naming in `scripts/qa/`, shared helpers, output JSON format.
- Static-scan heuristics (JSX text nodes, string props like `placeholder`/`aria-label`/`alt`/`title`) and allowlist format.
- Where locale is persisted for the booking (PaymentIntent metadata vs new `bookings.locale` column vs both).
- How `site_locale` is injected (gtag `config` default params vs per-event), as long as every event has it.
- Plan/wave breakdown; order of audit → fix → re-verify.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 75: E2E Verification & Launch" — goal + 7 success criteria (detail section added 2026-09-24).
- `.planning/REQUIREMENTS.md` — VER-01.
- `.planning/STATE.md` — "[Phase 75 input]" notes (known EN leaks, overflow audit reuse), Anthropic-credit/translation-workflow blocker note.

### Prior i18n decisions (LOCKED)
- `.planning/phases/71-content-externalization-marketing-seo-pages/71-CONTEXT.md` — content model, EN-fallback loaders, blog D-07/D-08 (EN-fallback allowlist source).
- `.planning/phases/72-ai-translation-pipeline-catalogs/72-CONTEXT.md` — translation pipeline, glossary/DNT, manifest semantics.
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-CONTEXT.md` — RTL, Noto fonts, `interpolateBidi()`/`<bdi>`, FAQ JSON-LD plain-string rule.
- `.planning/phases/74-seo-hreflang-localized-metadata-sitemap-structured-data-swit/74-CONTEXT.md` — hreflang index-/translation-aware rules (D-06/D-07), switcher (D-01..03), banner/no-redirect (D-04/D-05/D-05a).
- `.planning/WINDOWS.md` — #6 (hi DNT-fallback headings), #7 (fixed in 74).
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md`, `.planning/phases/74-*/deferred-items.md`.

### Code
- `scripts/qa/overflow_audit.py` — style template for new QA scripts (Python Playwright, consent pre-set in localStorage).
- `i18n/routing.ts`, `i18n/locales.ts`, `i18n/glossary.json`, `i18n/translation-manifest.json`, `scripts/i18n-translate.mjs`, `messages/*.json`.
- `app/[locale]/book/page.tsx`, `app/[locale]/book/multi-day/`, `app/[locale]/services/airport-transfer/`, `CorporateForm` component — known leak sites.
- Analytics: `components/GoogleAnalytics.tsx`, `components/AnalyticsPageView.tsx`, `components/MetaPixel.tsx` (`trackMetaEvent`), `app/api/meta-capi/route.ts`, `lib/analytics-server.ts`, `lib/analytics-snapshot.ts`, `app/api/webhooks/stripe/`, `components/booking/BookingWizard.tsx`.
- `middleware.ts` (CSP nonce + next-intl composition); `tests/middleware-matcher.test.ts`.
- `supabase/migrations/` — latest `061_driver_assignments_trip_progress.sql`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/qa/overflow_audit.py`: 7 locales × 21 key pages page list + consent init script — reuse the PAGES/LOCS lists and browser setup.
- `i18n/glossary.json` DNT terms: seed for the EN-leak Latin allowlist.
- Phase 72 QA report no-English-leakage check (scoped to processed units, excludes DNT-only values) — prior art for the rendered scan.
- `lib/analytics-snapshot.ts` sessionStorage price snapshot + server GA4 in Stripe webhook — the path to carry `site_locale` server-side.

### Established Patterns
- next-intl Server/Client translation + `@/i18n/routing` navigation (70-PATTERNS.md).
- Meta Pixel ↔ CAPI dedup via shared `eventId` — `site_locale` must be added symmetrically.
- Byte-parity snapshot tests normalize `priceValidUntil` (date drift).
- Supabase via MCP for verification + test-row cleanup; `.env.local` is unreadable in the sandbox.

### Integration Points
- gtag `config` call in `GoogleAnalytics.tsx` (locale from `<html lang>` / next-intl).
- Booking creation at payment step (ABND) → PaymentIntent metadata → Stripe webhook → server GA4 + CAPI.
- Stripe Elements `locale` option and Google Places loader `language` option in the booking wizard.

</code_context>

<specifics>
## Specific Ideas

- Test marker: `E2E TEST` name, `e2e+{locale}@rideprestigo.com` email.
- Account path locales: RU + AR.
- Announcement copy rules: plain words, lead with traveller pain points, no prices, no Uber comparison, Metricool drafts only.

</specifics>

<deferred>
## Deferred Ideas

- Localized client emails (confirmation/receipt in the booking locale) — new capability; record current state in this phase, implement in a later phase if emails are EN-only.
- Playwright E2E in CI (`@playwright/test` + GitHub Actions) — needs working Preview deploys first.
- Translating all untranslated blog posts / the 3 EN-only JSX posts — content work, not verification.
- Czech/German/Japanese/Korean locales — v2 requirements (LOC-*).

</deferred>

---

*Phase: 75-e2e-verification-launch*
*Context gathered: 2026-09-24*
