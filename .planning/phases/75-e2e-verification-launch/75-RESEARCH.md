# Phase 75: E2E Verification & Launch - Research

**Researched:** 2026-09-24
**Domain:** Cross-locale E2E verification (Playwright QA scripts), analytics locale-dimension wiring (GA4 + Meta), Stripe/Google Places locale plumbing, i18n content-leak remediation, milestone launch ops (GSC/Rich-Results/Metricool)
**Confidence:** HIGH for code-level findings (all read directly this session); MEDIUM for third-party API behavior (Stripe/Google/GA4 docs, WebSearch/WebFetch this session); LOW/ASSUMED flagged explicitly where noted

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Per-locale booking verification**
- **D-01:** Guest booking is driven through **all 6 wizard steps up to a rendered, localized Stripe payment form** in every one of the 7 locales. **No real payment** is submitted.
- **D-02:** Booking E2E runs against **production (rideprestigo.com)**. Reasons: i18n is already live there; Vercel Preview deploys always fail; local `.env.local` Stripe key is a dead placeholder.
- **D-03:** Test bookings carry an explicit marker (e.g. name `E2E TEST`, email `e2e+{locale}@rideprestigo.com`). ABND writes a row at the payment step, so after the run these marker rows are **deleted from Supabase by marker** (keeps the admin/dispatch list clean). Deletion must match the marker strictly — never a broad filter. — **Reversibility:** one-way — deleted rows are gone; the strict marker filter is the guardrail.
- **D-04:** Guest checkout in **all 7** locales; sign-in + account ("My trips") path in **RU and AR (RTL)** with a test account.
- **D-05:** Post-booking surfaces (confirmation page, client email language) are **recorded as-is**. If the client email is EN-only, that is logged as a deferred item (email localization is a new capability), not fixed here. Since no real payment is made, email/confirmation language is established from code/templates rather than a live send.

**EN-leak audit**
- **D-06:** Two-layer audit: (1) **static** scan for hardcoded English strings in JSX/props under `app/[locale]/**` and `components/**`; (2) **rendered** scan of production pages — Latin-script detection on `ru/ar/hi/zh` with a DNT allowlist (PRESTIGO, Mercedes, E-Class/S-Class/V-Class, brand/place names, glossary DNT terms from `i18n/glossary.json`), and diff-against-EN-version for `es/fr`.
- **D-07:** Scope of "no EN leakage" covers **all four surfaces**: visible page text (marketing, booking, account, login); form validation errors, toasts, placeholders, `aria-label`, `alt`, user-visible API error messages; metadata/OG/JSON-LD (regression check of Phase 74 work); **Stripe Elements `locale`** and **Google Places autocomplete `language`** following the site locale.
- **D-08:** Fixes: strings externalized into `messages/*.json` (or the content model), translated **in-session** into all 6 locales (Anthropic API credit is empty; `i18n Translate` GH workflow is disabled), and the **translation manifest hashes are updated/frozen** for those keys so a future pipeline run neither overwrites nor re-spends tokens on them. Never run `i18n-translate --dry-run` on the repo tree (it writes `[AR]` stubs over real content).
- **D-09:** Intentional EN-fallback is an **explicit allowlist, not a leak**: untranslated blog posts and the 3 EN-only `JSX_POSTS` (already self-canonical → EN and excluded from hreflang per 71 D-07/D-08, 74 D-07). The ~10 `hi` headings with DNT-fallback (WINDOWS #6) **are fixed** in this phase.

**Locale analytics dimension**
- **D-10:** GA4: every event carries a **`site_locale`** param (set via gtag config so page_view, begin_checkout, purchase etc. all get it), registered as an **event-scoped custom dimension** in GA4 (via Admin API if access allows, otherwise the user registers it manually — surface as a checkpoint). Built-in `language` is browser language, not site locale — not used.
- **D-11:** Server-side: locale is **persisted with the booking** (Stripe PaymentIntent metadata and/or a `bookings` column — Claude's discretion) and the Stripe webhook forwards it into the **server GA4 purchase** and **Meta CAPI** events. Makes revenue splittable by language and shows booking language in admin. — **Reversibility:** one-way if a DB column is added — requires a migration (next number after `061_…`); PaymentIntent metadata alone is reversible.
- **D-12:** Meta: `custom_data.site_locale` on all `trackMetaEvent` events, **identical on Pixel and CAPI** so eventId deduplication is not broken.

**E2E format & launch**
- **D-13:** E2E is a set of **repeatable QA scripts in `scripts/qa/`** in the same style as `overflow_audit.py` (Python Playwright, base-URL argument): render, switcher, EN-leak, hreflang reciprocity, CSP, booking. Results written into `75-VERIFICATION.md`. **Not wired into CI** (Preview deploys fail anyway). Re-run the existing overflow audit as a regression check (was 0 issues on 2026-09-24).
- **D-14:** "Launch" includes: **GSC** sitemap resubmit + indexing request for key locale pages + a per-locale indexing baseline recorded; **Rich Results Test** on sampled locale URLs + **hreflang reciprocity validator** across clusters; **milestone v3.0 close** (audit-milestone → complete-milestone, tag v3.0); **announcement** for the 7-language site as **Metricool drafts only** (never publish; analytics-picked slots; no prices; no Uber comparisons; plain pain-point copy).
- **D-15:** Red baseline: vitest must be **green for all files touched by v3.0 (Phases 68–75)** — fix or justifiably remove failing tests there. Pre-existing unrelated failures (e.g. `tests/admin-bookings.test.ts` mock failures from v2.1) are **listed, not fixed**.

### Claude's Discretion
- Script structure/naming in `scripts/qa/`, shared helpers, output JSON format.
- Static-scan heuristics (JSX text nodes, string props like `placeholder`/`aria-label`/`alt`/`title`) and allowlist format.
- Where locale is persisted for the booking (PaymentIntent metadata vs new `bookings.locale` column vs both).
- How `site_locale` is injected (gtag `config` default params vs per-event), as long as every event has it.
- Plan/wave breakdown; order of audit → fix → re-verify.

### Deferred Ideas (OUT OF SCOPE)
- Localized client emails (confirmation/receipt in the booking locale) — new capability; record current state in this phase, implement in a later phase if emails are EN-only.
- Playwright E2E in CI (`@playwright/test` + GitHub Actions) — needs working Preview deploys first.
- Translating all untranslated blog posts / the 3 EN-only JSX posts — content work, not verification.
- Czech/German/Japanese/Korean locales — v2 requirements (LOC-*).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | Cross-locale E2E green — every locale renders, switcher works, booking completes per-locale (incl. RTL), guest checkout intact, GA4/Meta analytics carry a locale dimension, no CSP regression, no EN leakage | See Architecture Patterns (QA script suite + analytics wiring), Common Pitfalls (exact hardcode sites found), Validation Architecture (test map), Code Examples |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists at the repo root or in `.claude/` `[VERIFIED: ls/cat CLAUDE.md returned nothing this session]`. No project-level directive file to enforce beyond the conventions already recorded in `.planning/STATE.md` and the user's memory (Russian-language user-facing replies, no-secrets-in-commits, self-verify via MCPs, always-commit-security-fixes, always-state-next-step).

## Summary

Phase 75 has **no new libraries to adopt** — it is a verification-and-close-gaps phase over an already-shipped multilingual site. The real work is threading one new cross-cutting value (`site_locale`) through five already-existing integration points (GA4 client config, GA4 server Measurement Protocol, Meta Pixel, Meta CAPI, Stripe/Places locale options), fixing a small, now-precisely-located set of hardcoded-English sites, and running/authoring a `scripts/qa/*.py` Playwright suite against production. Three genuinely new, concrete code defects were found this session (not just the "known gaps" already listed in STATE.md) that materially change plan scope:

1. **`components/booking/steps/Step6Payment.tsx:376`** hardcodes Stripe Elements `locale: 'en' as const` — every non-English booking today renders Stripe's payment form in English. Stripe does **not** support Hindi (`hi` is absent from Stripe's official supported-locale list `[CITED: docs.stripe.com/js/appendix/supported_locales]`), so `hi` needs an explicit fallback (`'auto'`, not `'en'`), while `ru/es/fr/ar/zh` map 1:1.
2. **`components/booking/AddressInputNew.tsx:99`** hardcodes Google Places Autocomplete `language: 'en'` — the same fix pattern, but Google Places supports all 7 target locales including `hi` and `zh` `[CITED: developers.google.com/maps/documentation/places/web-service/place-autocomplete]`, so no fallback is needed there.
3. **`app/[locale]/corporate/CorporateForm.tsx`** is a **fully unexternalized** client component (zero `useTranslations`, no `Corporate` namespace exists in `messages/en.json` at all `[VERIFIED: messages/en.json has no top-level "Corporate" key]`) — every label, placeholder, button, success message and error string is hardcoded English. This is materially larger than STATE.md's "CorporateForm notes placeholder" note suggested.

A fourth defect blocks D-14's Metricool-drafts requirement outright: **`lib/content/metricool.ts`'s `buildBody()` hardcodes `autoPublish: true, draft: false`** with no `draft` field on `CreatePostInput` at all `[VERIFIED: lib/content/metricool.ts:67-94]` — calling `createMetricoolPost` today would **publish live**, directly violating the locked project rule (never publish, drafts only). This must be fixed (add an optional `draft` param, default `false`, pass `draft: true / autoPublish: false` for the announcement) before the announcement step runs.

One important **correction to a stale STATE.md claim**: the vitest suite was run in full this session (`npx vitest run`) and is **currently 100% green** — 607/607 test suites passed, 1697/1846 tests passed (10 skipped, 139 todo, 0 failed) `[VERIFIED: ran `npx vitest run` this session]`, including every test in `tests/admin-bookings.test.ts` (the file STATE.md's Blockers/Concerns section says has "mock failures from v2.1"). D-15's "red baseline" premise appears to already be resolved — the plan should **re-verify at execution time** (baseline drifts) rather than assume failures exist, and should not spend a task "fixing" a file that already passes.

**Primary recommendation:** Treat this phase as five independent, mostly-parallel workstreams — (1) EN-leak fix pass (book hero+HowItWorks, multi-day EXAMPLES, CorporateForm full externalization, airport-transfer block, ~10 hi DNT headings), (2) Stripe/Places locale wiring + booking-locale persistence, (3) GA4/Meta site_locale wiring (client `gtag('set', ...)`, server MP, Meta Pixel+CAPI symmetric), (4) `scripts/qa/*.py` suite authored against the `overflow_audit.py` template and run against production, (5) launch ops (GSC/Rich-Results/hreflang validator/Metricool-draft-fix/milestone close) — then a final full-suite QA run recorded into `75-VERIFICATION.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locale-aware page render / switcher / hreflang verification | Browser / Client (QA script drives it) | Frontend Server (SSR) | next-intl resolves locale server-side per request; Playwright drives the rendered DOM, the source of truth for "does it actually work" |
| EN-leak detection & fix (static scan) | Frontend Server (SSR) / Browser | — | Strings live in JSX/message catalogs consumed at render time (Server Components via `getTranslations`, Client Components via `useTranslations`) |
| Guest booking → Stripe payment form (incl. locale) | Browser / Client | API / Backend | `Elements options.locale` is a client-side Stripe.js config; the PaymentIntent + its metadata are created server-side (`/api/create-payment-intent`) |
| Google Places Autocomplete language | Browser / Client | — | `usePlacesAutocomplete` runs entirely client-side against `places.googleapis.com` |
| `site_locale` on GA4 client events | Browser / Client | — | `gtag()` calls (`GoogleAnalytics.tsx`, `pushGA4Event` call sites) are all client-side |
| `site_locale` on GA4 server purchase (Measurement Protocol) | API / Backend | Database / Storage | `lib/analytics-server.ts::sendGa4Purchase` runs inside the Stripe webhook handler (`app/api/webhooks/stripe/route.ts`), reading from `meta`/DB rows |
| `site_locale` on Meta Pixel + CAPI | Browser / Client | API / Backend | Pixel fires client-side (`trackMetaEvent`); CAPI is a client-triggered `fetch('/api/meta-capi')` that runs server-side hashing — **not** currently invoked from the Stripe webhook (see Pitfall 6) |
| Booking-locale persistence | API / Backend | Database / Storage | `/api/create-payment-intent` builds `meta` (PaymentIntent metadata) and optionally `buildBookingRow()` (DB row) — both server-side |
| GA4 event-scoped custom dimension registration | API / Backend (Admin API) or manual (GA4 UI) | — | One-time config action via `analyticsadmin.googleapis.com`, not app runtime code |
| GSC sitemap resubmit / indexing baseline | External service (manual/API hybrid) | — | Existing OAuth token is **read-only** (see Pitfall 7) — indexing status can be read via API, resubmission/force-recrawl needs the GSC UI |
| CSP no-regression check | Frontend Server (SSR) | — | `middleware.ts` sets CSP headers per request; none of this phase's changes touch CSP allowlists (see Pitfall 8) |
| Metricool announcement drafts | API / Backend (Metricool REST) | — | `lib/content/metricool.ts::createMetricoolPost` — currently missing the `draft` override needed by this phase (see Pitfall 9) |

## Standard Stack

No new external packages are required for this phase. Every tool needed is already installed and already used by an existing script or dependency in this exact style.

### Core (already installed, already in use)
| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------------------------|
| Playwright (Python) | 1.58.0 `[VERIFIED: pip3 show playwright]` | Drives the `scripts/qa/*.py` suite (render, switcher, EN-leak, hreflang, CSP, booking) | Already the project's QA-script tool (`scripts/qa/overflow_audit.py`); D-13 explicitly locks this style |
| `next-intl` | 4.14.2 (exact pin) `[VERIFIED: package.json]` | `useLocale()`/`getLocale()` needed at every new locale-threading site (Step6Payment, AddressInputNew, GoogleAnalytics/SiteChrome, MetaPixel, confirmation page) | Already the site's i18n library (Phase 68 D-01 pin) |
| `@stripe/stripe-js` / `@stripe/react-stripe-js` | ^9.0.0 / ^6.0.0 `[VERIFIED: package.json]` | `Elements options.locale` (`StripeElementLocale` type) | Already the booking payment stack |
| `places-autocomplete-hook` | ^1.1.1 `[VERIFIED: package.json]` | `language` config key | Already the booking address-input stack |
| `google-api-python-client` | 2.194.0 `[VERIFIED: pip3 show]` | GSC `urlInspection`/`sitemaps` calls, and a candidate for a GA4 Admin API dimension-registration script | Already used by `~/Desktop/founder prestigo/gsc_now.py` and friends — same auth pattern reusable |
| `google-auth-oauthlib` | 1.3.0 `[VERIFIED: pip3 show]` | OAuth token refresh for the above | Same as above |
| `zod` | (repo-pinned) `[VERIFIED: app/api/create-payment-intent/route.ts:3, app/api/meta-capi/route.ts:3]` | Extending the `custom_data` allowlist schema in `/api/meta-capi/route.ts` to admit `site_locale` | Already the project's server-side validation library — never hand-write validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Python Playwright QA scripts | `@playwright/test` (Node, CI-integrated) | Explicitly deferred (D-13/Deferred Ideas) — Preview deploys fail today, so CI integration has no environment to run against; revisit once Preview is fixed |
| Manual GSC UI resubmit | GA4/GSC Admin API automation end-to-end | The existing OAuth token is `webmasters.readonly`-scoped (see Pitfall 7) — full API automation needs a **new** OAuth grant with write scope, which is a manual one-time human action either way; the manual UI path is faster for a single one-time resubmit |

**Installation:** none — no `npm install` / `pip install` needed for this phase's own code. (If the operator wants a fresh GA4 Admin API OAuth grant with `analytics.edit` scope, that is a manual browser-based OAuth consent flow, not a package install.)

## Package Legitimacy Audit

**Not applicable** — this phase introduces zero new external packages (npm or pip). All required tooling (Playwright 1.58.0, `google-api-python-client` 2.194.0, `google-auth-oauthlib` 1.3.0, `next-intl` 4.14.2, `@stripe/stripe-js`, `places-autocomplete-hook`, `zod`) is already installed and already exercised by existing project code `[VERIFIED: pip3 show / package.json this session]`. If the planner decides to write a Node-based GA4 Admin API script instead of Python, `googleapis` (npm) would be a **new** dependency and must go through the full Package Legitimacy Gate at that time — the Python `google-api-python-client` path avoids this entirely by reusing an already-vetted, already-installed library.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │         scripts/qa/*.py  (Playwright)        │
                    │  render / switcher / EN-leak / hreflang /    │
                    │  CSP / booking  — driven against PRODUCTION  │
                    └───────────────┬───────────────────────────────┘
                                    │ HTTP(S) requests + DOM assertions
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  middleware.ts                                             │
        │  next-intl locale routing → CSP header (nonce/static) →    │
        │  Supabase updateSession → CSRF Origin guard                │
        └───────────────┬───────────────────────────┬───────────────┘
                         │                           │
             locale-prefixed page                /api/create-payment-intent
                         │                           │ (zod .catchall — 'locale' key
                         ▼                           │  passes through with no schema
        ┌────────────────────────────┐               │  change needed)
        │ app/[locale]/**             │               ▼
        │  Server Components:         │   ┌─────────────────────────────┐
        │   getTranslations()/        │   │ meta = {..., locale}         │
        │   getAlternates() (hreflang)│   │  → Stripe PaymentIntent       │
        │  Client Components:         │   │    .metadata                  │
        │   useTranslations()/        │   │  → buildBookingRow() (optional│
        │   useLocale()               │   │    bookings.locale column)    │
        └───────────┬─────────────────┘   └───────────────┬───────────────┘
                    │                                       │ webhook fires later
                    │ booking wizard reaches Step6Payment    ▼
                    ▼                          ┌─────────────────────────────┐
        ┌────────────────────────────┐         │ app/api/webhooks/stripe/     │
        │ Step6Payment.tsx            │         │  route.ts                   │
        │  Elements options.locale =  │         │   meta.locale available →    │
        │  STRIPE_LOCALE_MAP[locale]  │         │   sendGa4Purchase({..,       │
        │  (hi → 'auto' fallback)     │         │     site_locale}) — MP call  │
        │ AddressInputNew.tsx         │         └─────────────────────────────┘
        │  language = locale (all 7   │
        │  supported by Places)       │         ┌─────────────────────────────┐
        └────────────────────────────┘         │ book/confirmation/page.tsx   │
                                                 │  pushGA4Event('purchase',…)  │
        ┌────────────────────────────┐          │  trackMetaEvent('Purchase',  │
        │ SiteChrome.tsx (server)     │          │    {..,site_locale}, ref)    │
        │  getLocale() → passed as    │          │  fetch('/api/meta-capi', {   │
        │  prop to:                   │          │    custom_data:{..,          │
        │   GoogleAnalytics (locale)  │          │      site_locale} })         │
        │   MetaPixel (locale)        │          └───────────────┬─────────────┘
        └───────────┬────────────────┘                          │
                    │ gtag('set',{site_locale})                  ▼
                    │ before gtag('config', GA_ID, …)   ┌─────────────────────┐
                    ▼                                    │ /api/meta-capi/      │
        ┌────────────────────────────┐                   │  route.ts            │
        │ Every subsequent gtag       │                   │  customDataSchema    │
        │ event (page_view, the 3     │                   │  .strict() — MUST    │
        │ pushGA4Event call sites)    │                   │  add site_locale:    │
        │ inherits site_locale        │                   │  z.string().max(5)   │
        │ automatically — no per-     │                   │  or it is silently   │
        │ call-site edits needed      │                   │  stripped            │
        └────────────────────────────┘                   └─────────────────────┘
```

### Recommended Project Structure
```
scripts/qa/
├── overflow_audit.py       # existing — reuse as regression check (D-13)
├── render_audit.py         # NEW — 7 locales × key pages → 200, <html lang/dir> correct
├── switcher_audit.py       # NEW — LocaleSwitcher navigates same-page, NEXT_LOCALE cookie set
├── en_leak_static.py       # NEW — grep-style scan of app/[locale]/**, components/** for
│                           #        hardcoded JSX text / placeholder / aria-label / alt / title
├── en_leak_rendered.py     # NEW — Playwright: Latin-script detection (ru/ar/hi/zh) + DNT allowlist,
│                           #        diff-against-EN (es/fr)
├── hreflang_reciprocity.py # NEW — fetch /sitemap.xml, cross-check every <xhtml:link> pair is reciprocal
├── csp_regression.py       # NEW — capture CSP header per route class, diff against a golden snapshot
└── booking_e2e.py          # NEW — guest checkout ×7 to Stripe payment form; account path RU/AR;
                            #        writes booking refs consumed by a marker-delete step (Supabase)
```

### Pattern 1: Locale threading via `gtag('set', ...)` for cross-event persistence
**What:** Google's own Tag Platform docs distinguish three gtag.js parameter scopes: `event` (single call), `config` (that target's calls), and `set` (persists across **all** subsequent `config`/`event` calls on the page) `[CITED: developers.google.com/tag-platform/gtagjs/reference/parameters]`.
**When to use:** Any value (like `site_locale`) that must appear on `page_view` *and* every later custom event (`begin_checkout`, `purchase`, etc.) fired via the three independently-duplicated `pushGA4Event()` implementations in this repo, without editing all three call sites.
**Example:**
```typescript
// components/GoogleAnalytics.tsx — add a `locale` prop threaded from SiteChrome's getLocale()
<Script id="ga-init" strategy="afterInteractive">
  {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('set', { 'site_locale': '${locale}' });   // persists across every subsequent event
    gtag('js', new Date());
    if (!window.location.pathname.startsWith('/admin')) {
      gtag('config', '${GA_ID}', { send_page_view: false });
    }
  `}
</Script>
```
This requires **zero changes** to `app/[locale]/book/confirmation/page.tsx`, `components/ContactForm.tsx`, or `components/booking/StickyBookingPanel.tsx` — their local `pushGA4Event()` → `gtag('event', ...)` calls automatically inherit `site_locale`.

### Pattern 2: Stripe Elements locale with an explicit unsupported-locale fallback
**What:** Map the app's `AppLocale` to Stripe's `StripeElementLocale`, explicitly handling the one unsupported case (`hi`) rather than passing an invalid code through.
**When to use:** `components/booking/steps/Step6Payment.tsx`'s `options` `useMemo` (currently hardcodes `locale: 'en' as const` at line 376).
**Example:**
```typescript
// Source: docs.stripe.com/js/appendix/supported_locales (CITED — verified this session)
import { useLocale } from 'next-intl'
import type { StripeElementLocale } from '@stripe/stripe-js'

const STRIPE_LOCALE_MAP: Record<AppLocale, StripeElementLocale> = {
  en: 'en', ru: 'ru', es: 'es', fr: 'fr', ar: 'ar', zh: 'zh',
  hi: 'auto', // Stripe Elements has no Hindi locale — 'auto' lets Stripe
              // detect the browser instead of forcing mismatched English UI.
}

// inside Step6Payment component:
const locale = useLocale() as AppLocale
// ...
const options = useMemo(
  () => clientSecret ? { clientSecret, appearance, locale: STRIPE_LOCALE_MAP[locale], /* ... */ } : null,
  [clientSecret, locale]
)
```

### Pattern 3: Booking-locale flows through the existing zod `.catchall` — no schema change needed
**What:** `app/api/create-payment-intent/route.ts`'s `createPaymentIntentSchema.bookingData` ends in `.catchall(BOUNDED_STRING)` `[VERIFIED: app/api/create-payment-intent/route.ts:76]` — any extra string key (≤2000 chars) the client sends is already accepted without touching the zod schema.
**When to use:** Adding `locale` to the booking payload.
**Example:**
```typescript
// components/booking/steps/Step6Payment.tsx:317 — inside the existing bookingData object literal
body: JSON.stringify({
  bookingData: {
    attemptId: currentAttemptId,
    tripType,
    // ...
    locale, // NEW — from useLocale(), catchall accepts it with no schema change
  },
}),
```
```typescript
// app/api/create-payment-intent/route.ts — inside the `meta` map builder (~line 296-330)
const meta: Record<string, string> = {
  bookingReference,
  // ...
  locale: bookingData.locale ?? 'en', // NEW
}
```
```typescript
// lib/supabase.ts — buildBookingRow() (line 62-112), IF a DB column is chosen (D-11 discretion)
return {
  // ...
  locale: meta.locale || null, // NEW — requires a migration adding bookings.locale
}
```

### Anti-Patterns to Avoid
- **Hand-rolling the Latin-script/DNT leak detector from scratch:** Phase 72 already built one — `checkNoEnglishLeakage` in the i18n pipeline's QA-report generator `[VERIFIED: tests/i18n-completeness.test.ts has a passing test "does NOT flag a DNT-only unit whose value is identical across locales (zh)"]`. Reuse its DNT-exclusion logic/shape for the new rendered-page scanner rather than reinventing the allowlist format.
- **Editing `pushGA4Event()` in three separate files** to add `site_locale` per-call: use the `gtag('set', ...)` persistent-parameter mechanism (Pattern 1) instead — one edit point (`GoogleAnalytics.tsx`), not three.
- **Assuming `custom_data` on `/api/meta-capi` passes through untouched:** it does not — `customDataSchema` is `.strict()` `[VERIFIED: app/api/meta-capi/route.ts:95-101]`; any key not explicitly listed (including a newly-added `site_locale`) is silently dropped by `safeParse`, not rejected — the request still returns 200, making this failure mode invisible without a script that inspects the actual outbound Graph API payload or a unit test asserting the parsed schema retains the key.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Latin-script / EN-leak detection with a DNT allowlist | A new regex-based leak scanner from zero | Adapt the shape of `checkNoEnglishLeakage` (Phase 72's i18n QA-report generator) and `i18n/glossary.json`'s `doNotTranslate` lists | Already handles the DNT-exclusion edge case (brand terms identical across locales are not false positives) — re-deriving this logic risks reintroducing the exact bug it was built to avoid |
| Stripe locale → app locale mapping | Ad-hoc `if/else` per call site | A single `STRIPE_LOCALE_MAP` constant (Pattern 2) | Centralizes the one non-trivial fallback (`hi` → `'auto'`); if Stripe adds Hindi support later, one line changes |
| GA4 custom-dimension registration | Manual trial-and-error against the GA4 UI with no record of what was done | `analyticsadmin.googleapis.com/v1beta/{property}/customDimensions` (`properties.customDimensions.create`, scope `analytics.edit`) `[CITED: developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions/create]`, scripted the same way `gsc_now.py` scripts GSC, with a documented manual-UI fallback if OAuth scope isn't available | Reproducible, and the fallback path (GA4 UI → Admin → Custom definitions → Create custom dimension) is already the documented escape hatch in D-10 |
| hreflang reciprocity checking | A bespoke crawler | Fetch `/sitemap.xml` (already reachable + correct per 74-VERIFICATION.md 16/17) and cross-check `<xhtml:link rel="alternate" hreflang>` pairs for reciprocity — `getAlternates()` is the single source feeding both metadata and sitemap `[VERIFIED: lib/seo.ts:1-30 doc comment + Phase 74 verification]`, so a structural bug is unlikely, but per-page HTML output should still be spot-checked live | Building a second hreflang-generation mental model risks papering over a real per-page rendering divergence the sitemap-level check can't see |

**Key insight:** Nearly everything this phase needs to check or fix already has a first-class, tested precedent somewhere in the Phase 68-74 codebase (translation QA report, `getAlternates()`, `overflow_audit.py`, `renderWithIntl` test helper). The main net-new risk is in the analytics/payment locale-threading, where no precedent exists yet and three separate integration surfaces (GA4 client, GA4 server MP, Meta Pixel+CAPI) must all carry the identical value or dedup/attribution silently breaks.

## Common Pitfalls

### Pitfall 1: Stripe Elements does not support Hindi
**What goes wrong:** Mapping `hi` → `'hi'` in the `Elements` `locale` option throws or silently falls back to something unexpected.
**Why it happens:** Stripe's officially supported locale list `[CITED: docs.stripe.com/js/appendix/supported_locales]` has no `hi` entry — `ar/es/fr/ru/zh` are all present, `hi` is not.
**How to avoid:** Explicit fallback map (Pattern 2) — `hi: 'auto'` (Stripe auto-detects the browser locale, which is Stripe's own documented "don't know" value) rather than forcing `'en'` (which is what today's hardcode already does, and is the exact defect being fixed).
**Warning signs:** A booking_e2e QA script step for `hi` that asserts the Stripe form language equals a specific locale string will fail — assert `locale !== 'en-forced'` / "not English" is the wrong bar for `hi`; the plan should record this as an accepted exception, not a bug to keep chasing.

### Pitfall 2: `/api/meta-capi`'s custom_data schema is `.strict()` — new fields are silently dropped, not rejected
**What goes wrong:** Adding `site_locale` to the client's `custom_data` payload (in `book/confirmation/page.tsx`'s CAPI `fetch`) with no matching schema change results in a 200 response and an apparently-successful call — but the field never reaches Meta.
**Why it happens:** `z.object({...}).strict()` in `app/api/meta-capi/route.ts:95-101` `[VERIFIED]` throws on unknown keys only in `.parse()`; here it's `.safeParse()`, whose `.success === false` path is handled by simply omitting `custom_data` from the outbound event entirely (`if (parsed.success) { event['custom_data'] = parsed.data }`) — no error surfaces anywhere.
**How to avoid:** Add `site_locale: z.string().max(10).optional()` to `customDataSchema` in the same commit that adds it to the client payload; write a unit test asserting `customDataSchema.safeParse({..., site_locale: 'ru'}).data.site_locale === 'ru'`.
**Warning signs:** Manually inspecting the Meta Events Manager test tool (or the CAPI response's `events_received` count, which will still be non-zero) will not reveal the missing field — only a payload-level assertion (unit test or a script capturing the actual `fetch` body/response) catches this.

### Pitfall 3: `sendGa4Purchase` has no `locale` field on `Ga4PurchaseParams` and is called from 3 separate webhook handlers
**What goes wrong:** Adding `site_locale` to the GA4 Measurement Protocol event requires editing `lib/analytics-server.ts`'s interface **and** all three call sites in `app/api/webhooks/stripe/route.ts` (`handleOneWaySucceeded`, `handleRoundTripSucceeded`, and the reconciliation handler around line 391) `[VERIFIED: grep found exactly 3 call sites]` — missing one leaves a locale gap for one booking type (e.g. round-trips) while one-way bookings report correctly, which is easy to miss in ad-hoc manual testing.
**Why it happens:** The three handlers were extracted separately (per STATE.md Phase 64 history) and each builds its own `sendGa4Purchase({...})` call rather than sharing one.
**How to avoid:** Add `siteLocale?: string` to `Ga4PurchaseParams`, thread `meta.locale` (available in `meta: Record<string,string>` in every handler) into all three call sites in the same commit, and add it to the MP `body.events[0].params` object.
**Warning signs:** A booking_e2e QA script only exercising one-way transfers will not catch a round-trip-specific gap — the plan should explicitly test at least one round-trip leg if round-trip GA4 events are in scope, or explicitly descope round-trip GA4 locale verification with a documented reason.

### Pitfall 4: Meta CAPI is fired client-side from the confirmation page, NOT from the Stripe webhook
**What goes wrong:** D-11's phrasing ("the Stripe webhook forwards it into the server GA4 purchase and Meta CAPI events") is only half accurate as written — `sendGa4Purchase` genuinely runs inside the webhook, but the CAPI `fetch('/api/meta-capi', ...)` call is triggered from **`app/[locale]/book/confirmation/page.tsx`** (client-side, on page load) `[VERIFIED: app/[locale]/book/confirmation/page.tsx:220-234 — the only fetch('/api/meta-capi' call site in the repo; grep for 'meta-capi'/'CAPI' in app/api/webhooks/stripe/route.ts returned zero matches]`.
**Why it happens:** The webhook cannot itself call `/api/meta-capi` for hashed-PII reasons that predate this phase; CAPI needs `passengerDetails` (email/phone/name) which the webhook doesn't have easy access to in the same shape, whereas the confirmation page already has it from the (client-persisted) booking-store snapshot.
**How to avoid:** Since the confirmation page is a locale-aware route (`app/[locale]/book/confirmation/`), `useLocale()` is trivially available there — add `site_locale` to the `custom_data` object at that call site (not inside the webhook). No webhook change is needed for the Meta half of D-11/D-12; the webhook change is GA4-only (Pitfall 3).
**Warning signs:** If a plan task tries to add `site_locale` to Meta CAPI *inside* the Stripe webhook file, it will find no existing CAPI call there to modify — treat that as a signal the task is targeting the wrong file, not a signal to add a brand-new server-side CAPI call (out of scope unless explicitly re-decided).

### Pitfall 5: `CorporateForm.tsx` externalization is bigger than STATE.md's note suggests
**What goes wrong:** Scoping the CorporateForm fix as "the notes placeholder" (per STATE.md's Phase 75 input note) undercounts the work — the entire component (2 labels, 2 more labels, 1 select + 4 option values + a `{v} trips/month` template, 1 textarea placeholder, submit/sending button text, a full success-state block with heading/body/link text, and 3 distinct error messages) is hardcoded English with **zero** `useTranslations` import and **no** `Corporate` namespace anywhere in `messages/en.json` `[VERIFIED: read full file app/[locale]/corporate/CorporateForm.tsx this session; python3 check confirmed messages/en.json has no "Corporate" key]`.
**Why it happens:** STATE.md's note was written from a partial grep pass, not a full file read.
**How to avoid:** Budget this as a full externalization task (new `Corporate.form.*` namespace, ~20 keys, all 6 non-EN locales translated in-session per D-08), not a one-line placeholder fix.
**Warning signs:** A plan task estimated at "fix one placeholder string" that touches this file will discover the true scope mid-task — size it correctly up front.

### Pitfall 6: `app/[locale]/book/page.tsx`'s hero + "How booking works" section has zero i18n wiring
**What goes wrong:** `BookPage` is a plain `export default function BookPage()` (Server Component) with no `getTranslations`/`useTranslations` import at all `[VERIFIED: read full relevant section, lines 85-140]` — the hero label ("Instant Booking"), h1 ("Your transfer," / "confirmed in seconds."), subhead ("Fixed price. Instant confirmation. No callbacks."), the "How booking works" label, h2 ("Four steps, sixty seconds."), and all 4 step title/body pairs are hardcoded literals in a `.map()` array.
**Why it happens:** This page was apparently missed during Phase 69/70's STR-01/STR-02 externalization pass (the `BookingWizard` component itself IS externalized — only this page's static chrome around it was missed).
**How to avoid:** Add a `Book.hero`/`Book.howItWorks` (or similar) namespace; the 4-step array's `step` numbers are structural (keep in code, per the established Phase 69 "structural config stays in code, zip by index" convention already used for `HowItWorks`/`FeatureStrip`) while `title`/`body` move to translated arrays.
**Warning signs:** grepping only for the exact strings named in STATE.md's note (`"Your transfer, confirmed in seconds."` as one string) will miss this — the actual JSX splits it across a `<br />` (`Your transfer, <br /><span>confirmed in seconds.</span>`), so a naive exact-string grep under-reports; the static-scan QA script (D-06) should walk JSX text nodes, not grep for literal known-bad strings.

### Pitfall 7: GSC OAuth token is read-only — sitemap resubmit and forced reindexing need a manual UI step
**What goes wrong:** `~/.config/google-ads/gsc_token.json` (used by `gsc_now.py` and friends) is scoped to `https://www.googleapis.com/auth/webmasters.readonly` only `[VERIFIED: read scopes field from the token file this session]`. `urlInspection().index().inspect()` (a read operation reporting indexing status) works fine with this scope and is already used by `gsc_request_indexing.py` `[VERIFIED: read that script's full source]` — but that same script's own trailing `print()` explicitly tells the operator "for reindexing use the Search Console UI" because true resubmission requires write scope (`webmasters`, not `webmasters.readonly`) or the separate Indexing API (`~/.config/google-ads/indexing_token.json`, scope `auth/indexing`, generated by a **different** script, `gsc_indexing_auth.py`, which exists but there is no evidence its token has been generated/used).
**Why it happens:** The read-only token was provisioned for reporting (`gsc_now.py`'s original purpose), not for administrative actions.
**How to avoid:** Plan D-14's "GSC sitemap resubmit" as: (a) **automatable** — use `urlInspection().index().inspect()` with the existing read-only token to record a **before/after indexing-status baseline** per locale-key-page (this is genuinely scriptable today); (b) **manual, human checkpoint** — the actual sitemap resubmit (Search Console → Sitemaps → paste `/sitemap.xml` → Submit) and any explicit "Request Indexing" clicks, done via the GSC web UI by the operator, since scripting them would require a fresh OAuth consent with write scope.
**Warning signs:** A plan task that assumes `sitemaps().submit()` "just works" with the existing token will get a 403 the first time it's actually run — check for this before writing the task as fully-automated.

### Pitfall 8: This phase's changes do not require CSP allowlist changes — the "no CSP regression" check should be a snapshot/diff, not a rewrite
**What goes wrong:** Assuming `site_locale`/Stripe-locale/Places-language changes need `middleware.ts` CSP updates, and spending a task modifying `buildCsp()`/`buildCspStatic()`.
**Why it happens:** These functions were recently touched (Phase 74's `T-74-07` matcher fix) so it's a reasonable but incorrect assumption that more locale work touches them too.
**How to avoid:** `gtag('set', ...)`, Stripe's `locale` option, and Places' `language` option are all same-origin/already-allowlisted domains (`*.googletagmanager.com`, `*.google-analytics.com`, `js.stripe.com`/`api.stripe.com`, `places.googleapis.com`/`maps.googleapis.com` — all already present in `connect-src`/`img-src`/`frame-src` `[VERIFIED: middleware.ts:57-67]`). The CSP QA script (D-13) should capture the current CSP header per route class as a golden baseline and diff after the phase's changes — it should stay byte-identical.
**Warning signs:** If the CSP diff shows ANY change after this phase's other work lands, that is itself the signal something unexpected happened (e.g., a new third-party script was introduced) — treat it as a regression to investigate, not something to "fix" by loosening the policy.

### Pitfall 9: Metricool client would publish live, not draft, if called as-is
**What goes wrong:** `lib/content/metricool.ts::buildBody()` hardcodes `autoPublish: true, draft: false` `[VERIFIED: lib/content/metricool.ts:84-94]`, and `CreatePostInput` (the public type) has no `draft`/`autoPublish` field to override this. Calling `createMetricoolPost()` for the v3.0 announcement today would **publish immediately**, directly violating the locked project rule (Metricool posts must always be created as drafts, never published) and D-14's explicit "drafts only" requirement.
**Why it happens:** This client was built for the existing auto-publish blog/social workflow (`project_content_publish_workflow.md` memory: createMetricoolPost is normally used for scheduled auto-publish posts), which is a different use case from a one-off milestone announcement that needs human review before going live.
**How to avoid:** Add an optional `draft?: boolean` field to `CreatePostInput`; when `true`, set `body.draft = true` and `body.autoPublish = false` in `buildBody()`. This is a small, additive change (no existing call site passes `draft`, so behavior is unchanged for the existing blog/social pipeline) — but it must ship **before** the announcement task runs, not be worked around by calling the Metricool REST API directly and bypassing the shared client.
**Warning signs:** Any plan task that calls `createMetricoolPost`/`createMetricoolPosts` directly for the announcement without first checking whether a `draft` override exists will publish live content — this is a genuinely destructive, hard-to-fully-undo mistake (a live post can be deleted after the fact, but it will have been publicly visible) and should be flagged as a `checkpoint:human-verify` gate before the announcement task, not just a code review item.

### Pitfall 10: `npm test` does not exist
**What goes wrong:** A plan step or verification script assuming `npm test` runs the suite will fail immediately.
**Why it happens:** `package.json`'s `scripts` block has `dev`/`build`/`start`/`lint`/`prepare` only — no `test` entry `[VERIFIED: grep '"test"' package.json returned no match; full scripts block read]`.
**How to avoid:** Use `npx vitest run` (full suite) / `npx vitest related <file>` or `npx vitest run <pattern>` (quick loop) directly — this is what was used to establish the green baseline this session.

## Code Examples

### GA4 event-scoped custom dimension registration (Admin API, with manual fallback)
```python
# Source: developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions/create
# (CITED — confirmed this session via WebSearch of the official REST reference)
# Requires OAuth scope 'https://www.googleapis.com/auth/analytics.edit' — the existing
# gsc_token.json/webmasters.readonly token CANNOT be reused for this; a new token must be
# minted the same way gsc_indexing_auth.py mints one for the Indexing API scope.
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

def register_site_locale_dimension(property_id: str, creds: Credentials):
    svc = build("analyticsadmin", "v1beta", credentials=creds)
    body = {
        "parameterName": "site_locale",
        "displayName": "Site Locale",
        "description": "Locale segment of the URL the event occurred on (en/ru/es/fr/ar/hi/zh)",
        "scope": "EVENT",
    }
    return svc.properties().customDimensions().create(
        parent=f"properties/{property_id}", body=body
    ).execute()
# Fallback if OAuth/property access is unavailable in this session:
# GA4 UI → Admin → (Property column) Custom definitions → Create custom dimension →
#   Dimension name: Site Locale, Scope: Event, Event parameter: site_locale
```

### hreflang reciprocity check against the live sitemap
```python
# NEW — scripts/qa/hreflang_reciprocity.py pattern
import sys, xml.etree.ElementTree as ET
from urllib.request import urlopen

NS = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'xhtml': 'http://www.w3.org/1999/xhtml'}
base = sys.argv[1] if len(sys.argv) > 1 else 'https://rideprestigo.com'
xml_bytes = urlopen(f'{base}/sitemap.xml').read()
root = ET.fromstring(xml_bytes)

# Build url -> {hreflang: alternate_url} for every <url> entry
clusters = {}
for url_el in root.findall('ns:url', NS):
    loc = url_el.find('ns:loc', NS).text
    alts = {link.get('hreflang'): link.get('href')
            for link in url_el.findall('xhtml:link', NS)}
    clusters[loc] = alts

errors = []
for loc, alts in clusters.items():
    for hreflang, target in alts.items():
        if hreflang == 'x-default':
            continue
        target_cluster = clusters.get(target)
        if target_cluster is None:
            errors.append(f'{loc} -> {hreflang}={target}: target URL not in sitemap at all')
            continue
        # target must list `loc` back under SOME hreflang key
        if loc not in target_cluster.values():
            errors.append(f'{loc} -> {hreflang}={target}: NOT reciprocal (target does not list {loc} back)')

print(f'{len(clusters)} URLs checked, {len(errors)} reciprocity errors')
for e in errors[:50]:
    print('  ', e)
```

### EN-leak rendered scan skeleton (Latin-script + DNT allowlist, ru/ar/hi/zh)
```python
# NEW — scripts/qa/en_leak_rendered.py pattern, modeled on overflow_audit.py's
# browser-setup + consent-init-script pattern (D-06/D-13)
import json, re, sys
from playwright.sync_api import sync_playwright

# Seed the allowlist from i18n/glossary.json's doNotTranslate lists (Don't Hand-Roll)
glossary = json.load(open('i18n/glossary.json'))
DNT = set(glossary['doNotTranslate']['brand']) | set(glossary['doNotTranslate']['vehicleClasses'])

LATIN_WORD = re.compile(r'\b[A-Za-z]{3,}\b')  # 3+ letter Latin runs — tune threshold during Wave 0

def flag_latin_leak(text: str) -> list[str]:
    words = LATIN_WORD.findall(text)
    return [w for w in words if w not in DNT]
# ... Playwright page setup identical to overflow_audit.py's consent init-script pattern,
# then for each ru/ar/hi/zh page, walk visible text nodes + placeholder/aria-label/alt/title
# attributes, run flag_latin_leak(), and separately diff es/fr page text against the EN
# equivalent (structural diff, not Latin-script detection, since es/fr are Latin-script too).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hardcoded `'en'` for Stripe/Places locale | Locale-derived mapping via `useLocale()` | This phase | Every non-EN booking currently sees an English Stripe payment form and English Places suggestions — this phase is the first to fix it |
| No `site_locale` anywhere in analytics | `gtag('set', {site_locale})` + PaymentIntent metadata + Meta custom_data | This phase | First time revenue/events become splittable by language site-wide |

**Deprecated/outdated:** None — this phase does not deprecate anything; it completes wiring that Phases 68-74 left as an explicit gap (VER-01 was the only incomplete v1 requirement going into this phase).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `hi` should fall back to Stripe's `'auto'` locale value rather than `'en'` or another substitute | Pitfall 1 / Pattern 2 | Low — `'auto'` is Stripe's own documented fallback semantics (detect browser locale), a defensible default; if the team prefers a different explicit fallback (e.g. `'en'` with a known caveat), it's a one-line change to `STRIPE_LOCALE_MAP` |
| A2 | GA4's Admin API property ID and an `analytics.edit`-scoped OAuth credential are not currently available in this environment (no such script/token found on Desktop or in the repo) | Standard Stack / Code Examples | Low-Medium — if credentials DO exist somewhere not searched, the planner should still route dimension registration through a `checkpoint:human-verify` task per D-10's own "otherwise the user registers it manually" fallback, so the plan is safe either way |
| A3 | `hi`'s Google Places `language` support (confirmed via WebFetch of Google's own docs page listing it in a language dropdown) is accurate and current | Summary / Common Pitfalls | Low — Google's docs page was fetched live this session; if wrong, the symptom (Hindi suggestions rendering in English) would surface immediately in the booking_e2e QA script and is a one-line config value to correct |
| A4 | The `bookings` table currently has no `locale`-equivalent column (inferred from `buildBookingRow()`'s full field list containing no locale/language field) | Architecture Patterns Pattern 3 | Low — `buildBookingRow()` was read in full this session; if a column were added elsewhere without updating this function, the function itself would already be broken for that column, independent of this phase |

**If this table is empty:** N/A — see above; all high-confidence findings are tagged `[VERIFIED]`/`[CITED]` inline in their sections; this table isolates only the handful of genuinely judgment-based fallback choices.

## Open Questions

1. **Does D-11's "Meta CAPI" language require a NEW server-side CAPI call inside the Stripe webhook, or does it refer to the existing client-triggered CAPI call on the confirmation page?**
   - What we know: No CAPI call exists in `app/api/webhooks/stripe/route.ts` today (verified via grep); the only CAPI call site is client-triggered from `book/confirmation/page.tsx`, which already has easy access to `useLocale()`.
   - What's unclear: Whether the discuss-phase intent was "the webhook's server GA4 call, AND [separately, already-existing] the confirmation page's Meta CAPI call" (my reading, see Pitfall 4) or literally "add a new CAPI call inside the webhook."
   - Recommendation: Plan for the confirmation-page CAPI fix only (lower risk, reuses existing architecture); explicitly flag in the plan's assumptions that a genuinely-new webhook-triggered CAPI call is out of scope unless the user confirms otherwise at plan review.

2. **Is a `bookings.locale` DB column worth a new migration (062) for this phase, or is PaymentIntent metadata alone sufficient?**
   - What we know: D-11 leaves this to Claude's discretion; metadata-only is reversible, a column requires the next migration number (`062_...`, confirmed via `ls supabase/migrations` — latest is `061_driver_assignments_trip_progress.sql`) and is one-way (per the project's "no DROP COLUMN in this codebase's migration history" pattern).
   - What's unclear: Whether "shows booking language in admin" (D-11's stated benefit) is actually required by any of the phase's 7 numbered success criteria, or is just a nice-to-have mentioned in the decision's rationale.
   - Recommendation: Default to metadata-only (simpler, reversible, satisfies the explicit GA4/CAPI-forwarding requirement) unless the admin-visibility benefit is confirmed as an actual success-criterion requirement at plan time; a column can be added in a later phase without re-doing this phase's work.

3. **What GA4 property ID and OAuth credentials are available for the Admin API custom-dimension registration?**
   - What we know: No such script/token exists in the repo or on Desktop today (checked `~/Desktop`, repo grep) — only the read-only `gsc_token.json` (Search Console, different API entirely) exists.
   - What's unclear: Whether the operator has GA4 Admin-level access ready to hand, or whether this should be a pure `checkpoint:human-verify` manual-UI task from the start.
   - Recommendation: Plan the manual-UI path as the default (D-10 explicitly allows it); attempt the scripted path opportunistically only if the operator confirms GA4 Admin API credentials are available at execution time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright (Python) | `scripts/qa/*.py` suite | ✓ | 1.58.0 | — |
| `google-api-python-client` + `google-auth-oauthlib` | GSC indexing-status baseline, candidate GA4 Admin API script | ✓ | 2.194.0 / 1.3.0 | — |
| GSC OAuth token (`gsc_token.json`) | Reading indexing status per URL | ✓, but **read-only scope** (`webmasters.readonly`) | — | Manual GSC UI for sitemap resubmit / force-reindex requests (Pitfall 7) |
| GA4 Admin API OAuth (analytics.edit scope) | Scripted custom-dimension registration | ✗ — no such token found this session | — | Manual GA4 UI registration (D-10's own documented fallback) |
| Production site access (rideprestigo.com) | Booking E2E, render/switcher/leak/hreflang/CSP audits | ✓ — live, i18n already shipped | — | — |
| Vercel Preview deploys | N/A for this phase (D-02 locks env to production) | ✗ (known pre-existing failure, non-blocking per project memory) | — | Already worked around by D-02's production-only decision |
| Live Stripe key | Booking E2E through to the payment form | ✓ — production uses its own live key (not the dead `.env.local` placeholder), since D-02 runs against production | — | — |
| Supabase (production) | Reading/deleting `E2E TEST`-marker booking rows post-run | ✓ (service-role access pattern already established in `lib/supabase.ts`) | — | — |
| `.env.local` (local sandbox) | N/A this session (agent sandbox restricts read) | ✗ (by design, unrelated to this phase's env needs) | — | Not needed — D-02 runs everything against production |

**Missing dependencies with no fallback:** None — every gap has a documented fallback above.

**Missing dependencies with fallback:**
- GA4 Admin API write-scope OAuth → manual GA4 UI custom-dimension registration (D-10's own fallback).
- GSC write-scope OAuth for automated sitemap resubmit → manual GSC UI resubmit (one-time action, low cost to do manually).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (jsdom environment) `[VERIFIED: npx vitest run this session prints "RUN v4.1.5"]` |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest related <changed-file>` or `npx vitest run <pattern>` |
| Full suite command | `npx vitest run` — **NOTE: there is no `npm test` script** (Pitfall 10) |

**Current baseline (established this session, 2026-09-24):** 607/607 test suites passed, 1697 passed / 10 skipped / 139 todo tests, **0 failed** `[VERIFIED: full run output captured this session]`. This contradicts STATE.md's Blockers/Concerns note about `tests/admin-bookings.test.ts` mock failures — that file's tests all passed in this run. **Re-run at plan-execution time** to confirm the baseline hasn't drifted before treating D-15 as already-satisfied.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VER-01 (render) | Every locale renders 200, correct `<html lang/dir>` | QA script (Playwright, not vitest) | `python3 scripts/qa/render_audit.py https://rideprestigo.com` | ❌ Wave 0 — new script |
| VER-01 (switcher) | LocaleSwitcher navigates same-page, sets `NEXT_LOCALE` | QA script | `python3 scripts/qa/switcher_audit.py` | ❌ Wave 0 — new script |
| VER-01 (booking) | Guest checkout ×7 to Stripe payment form; account path RU/AR | QA script (manual-assist for real browser confirmation of Stripe iframe content) | `python3 scripts/qa/booking_e2e.py` | ❌ Wave 0 — new script |
| VER-01 (EN-leak, static) | No hardcoded EN in JSX/props | unit test (component-level, `renderWithIntl`) + QA script | `npx vitest run tests/corporate-form.test.tsx` (new) + `python3 scripts/qa/en_leak_static.py` | ❌ Wave 0 — both new |
| VER-01 (EN-leak, rendered) | No Latin leak on ru/ar/hi/zh; es/fr match EN structurally | QA script | `python3 scripts/qa/en_leak_rendered.py` | ❌ Wave 0 — new script |
| VER-01 (GA4/Meta site_locale) | `site_locale` present on client GA4 events, server MP, Pixel, CAPI | unit test (`sendGa4Purchase` params, `customDataSchema` parse) + QA script (network capture) | `npx vitest run tests/analytics-server.test.ts` (extend existing pattern) | Partial — `lib/analytics-server.ts` likely has no existing test file; check before Wave 0 |
| VER-01 (CSP) | CSP header unchanged after phase's changes | QA script (snapshot diff) | `python3 scripts/qa/csp_regression.py` | ❌ Wave 0 — new script |
| VER-01 (hreflang) | Reciprocal alternates across sitemap clusters | QA script | `python3 scripts/qa/hreflang_reciprocity.py` | ❌ Wave 0 — new script |
| D-15 (vitest baseline) | Full suite green for v3.0-touched files | full suite | `npx vitest run` | ✓ — already green this session, re-verify at execution |

### Sampling Rate
- **Per task commit:** `npx vitest related <touched files>` for any code-level change (Stripe locale, Places language, GA4/Meta wiring, CorporateForm/book-page externalization).
- **Per wave merge:** `npx vitest run` (full suite) + the relevant `scripts/qa/*.py` script(s) for that wave's surface.
- **Phase gate:** Full `npx vitest run` green + full `scripts/qa/*.py` suite run against production, results recorded in `75-VERIFICATION.md`, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/qa/render_audit.py`, `switcher_audit.py`, `en_leak_static.py`, `en_leak_rendered.py`, `hreflang_reciprocity.py`, `csp_regression.py`, `booking_e2e.py` — all net-new, modeled on `overflow_audit.py`'s Playwright + consent-init-script pattern.
- [ ] A component test for the fixed `CorporateForm.tsx` (`tests/corporate-form.test.tsx`, using the existing `renderWithIntl` helper per Phase 70 convention) asserting no hardcoded English string remains and every field's label/placeholder resolves from the new `Corporate.form` namespace.
- [ ] Check whether `lib/analytics-server.ts` (`sendGa4Purchase`) has an existing unit test file before assuming Wave 0 needs to create one from scratch — not found in this session's exploration but worth a targeted `find tests -iname "*analytics-server*"` at plan time.
- [ ] Extend `app/api/meta-capi/route.ts`'s existing test coverage (if any — not confirmed this session) to assert `site_locale` survives the `customDataSchema.strict()` parse (Pitfall 2's regression guard).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Partial | No changes to auth this phase; the RU/AR account-path booking test (D-04) reuses existing Supabase Auth (GoTrue) session flow, unchanged |
| V3 Session Management | No | Not touched |
| V4 Access Control | No | Not touched — no new endpoints, no new admin surfaces |
| V5 Input Validation | Yes | `zod` — extending `customDataSchema` in `/api/meta-capi/route.ts` (Pitfall 2) must stay `.strict()` with an explicit new field, never relaxed to a passthrough `.object({}).passthrough()`, per SEC-07's existing "allow-list custom_data fields to prevent analytics poisoning" comment `[VERIFIED: app/api/meta-capi/route.ts:94 comment]` |
| V6 Cryptography | No | No new secrets/hashing — CAPI's existing `sha256()` PII hashing (`app/api/meta-capi/route.ts:10-12`) is unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Analytics event poisoning via an over-permissive `custom_data` schema | Tampering | Keep `customDataSchema.strict()` (existing SEC-07 control) — add `site_locale` as an explicit, length-bounded (`z.string().max(10)`) optional field, never widen to accept arbitrary keys |
| E2E test-booking rows leaking into production dispatch/admin views if the marker-delete step is skipped or the filter is too broad | Tampering / Repudiation | D-03's own guardrail: delete strictly by the `e2e+{locale}@rideprestigo.com` email pattern (and ideally AND on `client_first_name = 'E2E TEST'` as defense-in-depth), never a broad date-range or status filter; verify row count deleted matches expected count (7 guest + up to 2 account bookings) before considering cleanup complete |
| Metricool announcement accidentally going live (Pitfall 9) | Tampering (of public brand presence) / accidental disclosure timing | Fix `CreatePostInput`/`buildBody()` to support `draft: true` BEFORE any announcement call; gate the actual `createMetricoolPost` call for the announcement behind a `checkpoint:human-verify` task, not just a code review |
| CSRF on any new endpoint this phase might add (e.g. a GA4-dimension-registration API route, if built as a Next.js route instead of a standalone script) | Tampering | If any new mutating `/api/*` route is introduced, it MUST be added to `middleware.ts`'s `CSRF_PROTECTED_PREFIXES` (and `CSRF_STRICT_ORIGIN_REQUIRED` if admin-only) — per existing T-74-07-class discipline; strongly prefer a standalone script (no new route) for one-time admin actions like dimension registration |

## Sources

### Primary (HIGH confidence — read directly this session)
- `middleware.ts` — full file read; CSP allowlists, locale-routing composition, matcher regex
- `app/api/create-payment-intent/route.ts` — zod schema (`.catchall`), `meta` builder, PaymentIntent creation
- `lib/supabase.ts` — `buildBookingRow()` full field list
- `lib/analytics-server.ts` — full file; `sendGa4Purchase`/`Ga4PurchaseParams`, GA4 MP body shape
- `app/api/webhooks/stripe/route.ts` — 3 `sendGa4Purchase` call sites; confirmed no CAPI call exists here
- `app/api/meta-capi/route.ts` — `customDataSchema.strict()`, SEC-07 comment
- `components/GoogleAnalytics.tsx`, `components/MetaPixel.tsx` — full files; no locale param present today
- `components/booking/steps/Step6Payment.tsx` — `locale: 'en' as const` hardcode (line 376), request-body assembly (lines 300-349)
- `components/booking/AddressInputNew.tsx` — `language: 'en'` hardcode (line 99)
- `app/[locale]/corporate/CorporateForm.tsx` — full file; zero i18n wiring
- `app/[locale]/book/page.tsx` — hero + "How booking works" section (lines 85-140)
- `app/[locale]/book/multi-day/page.tsx` — `EXAMPLES` const (lines 60-104+)
- `lib/content/metricool.ts` — full file; `draft: false`/`autoPublish: true` hardcode, no override field
- `i18n/locales.ts`, `i18n/routing.ts` — locale list, `BCP47_TAG`, routing config
- `i18n/glossary.json` — `doNotTranslate` structure
- `scripts/qa/overflow_audit.py` — full file; QA script style template
- `~/Desktop/founder prestigo/gsc_now.py`, `gsc_request_indexing.py`, `gsc_indexing_auth.py` — GSC OAuth/API usage patterns, confirmed read-only scope
- `~/.config/google-ads/gsc_token.json` — confirmed `scopes: ['...webmasters.readonly']`
- `package.json` — dependency versions, confirmed no `test` script
- `tests/middleware-matcher.test.ts` — matcher regression-test pattern
- `.planning/phases/74-*/74-VERIFICATION.md` — confirmed hreflang/sitemap infra status (16/17, sitemap gap since fixed)
- `npx vitest run` (executed this session) — 607/607 suites, 0 failed

### Secondary (MEDIUM confidence — official docs fetched/searched this session)
- `docs.stripe.com/js/appendix/supported_locales` — full supported-locale table (WebFetch, this session)
- `developers.google.com/maps/documentation/places/web-service/place-autocomplete` — `languageCode` support incl. Hindi (WebFetch, this session)
- `developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions/create` — Admin API create-dimension shape (WebSearch, this session)
- `developers.google.com/tag-platform/gtagjs/reference/parameters` — gtag `set`/`config`/`event` parameter scoping (WebSearch, this session)

### Tertiary (LOW confidence — none used without a Secondary/Primary cross-check in this document)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every version/tool confirmed installed this session
- Architecture: HIGH — every integration point (GA4/Meta/Stripe/Places/booking-locale) traced through actual source files this session, not inferred
- Pitfalls: HIGH for code-level pitfalls (all read directly); MEDIUM for third-party API behavior (Stripe/Google docs fetched this session but subject to future changes)

**Research date:** 2026-09-24
**Valid until:** ~14 days for the code-level findings (re-verify if other work lands on `main` first, since this touches many shared files); ~30 days for third-party API/locale-support facts (Stripe/Google locale support lists change infrequently)
