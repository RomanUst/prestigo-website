# Phase 75: E2E Verification & Launch - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 17 (new + modified)
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/qa/render_audit.py` | test (QA script) | request-response | `scripts/qa/overflow_audit.py` | exact |
| `scripts/qa/switcher_audit.py` | test (QA script) | request-response | `scripts/qa/overflow_audit.py` | exact |
| `scripts/qa/en_leak_static.py` | test (QA script) | transform | `scripts/qa/overflow_audit.py` (browser walk) + `tests/i18n-completeness.test.ts` (`checkNoEnglishLeakage`/DNT logic) | role-match |
| `scripts/qa/en_leak_rendered.py` | test (QA script) | transform | `scripts/qa/overflow_audit.py` + `i18n/glossary.json` DNT lists | role-match |
| `scripts/qa/hreflang_reciprocity.py` | test (QA script) | transform | `scripts/qa/overflow_audit.py` (script skeleton only; logic is net-new — sitemap XML parse) | partial |
| `scripts/qa/csp_regression.py` | test (QA script) | transform | `scripts/qa/overflow_audit.py` + `middleware.ts` CSP builder | partial |
| `scripts/qa/booking_e2e.py` | test (QA script) | event-driven | `scripts/qa/overflow_audit.py` (browser/consent setup only) | partial |
| `components/booking/steps/Step6Payment.tsx` (locale wiring) | component | request-response | itself, existing hardcode at line ~376; pattern source: `i18n/locales.ts`/`AppLocale` type | exact (same file, add mapping) |
| `components/booking/AddressInputNew.tsx` (language wiring) | component | request-response | itself, existing hardcode at line 99; pattern source: `useLocale()` usage elsewhere (e.g. `SiteChrome.tsx`) | exact (same file) |
| `app/[locale]/corporate/CorporateForm.tsx` (full externalization) | component | request-response | `components/ContactForm.tsx` (assumed externalized sibling form) or any `useTranslations`-based form component; test analog `tests/helpers/renderWithIntl.tsx` | role-match |
| `messages/en.json` (`Corporate.form.*` new namespace) | config (i18n content) | CRUD (content) | existing namespaces in `messages/en.json` (e.g. `ContactForm`/similar) | exact-shape |
| `messages/{ru,es,fr,ar,hi,zh}.json` (translated `Corporate.form.*`) | config (i18n content) | batch/transform | same files, other namespaces (in-session translation per D-08) | exact-shape |
| `app/[locale]/book/page.tsx` (hero + How-it-works externalization) | route/page (server component) | request-response | `components/HowItWorks`/`FeatureStrip` pattern (structural array kept in code, `title`/`body` from messages, per Phase 69 convention) | role-match |
| `app/[locale]/book/multi-day/page.tsx` (`EXAMPLES` const externalization) | route/page | request-response | same Phase 69 convention as book/page.tsx | role-match |
| `components/GoogleAnalytics.tsx` (add `site_locale` via `gtag('set', ...)`) | provider/component | event-driven | itself — existing `gtag('config', ...)` Consent Mode v2 block | exact (same file, extend) |
| `components/MetaPixel.tsx` / confirmation page CAPI call (add `site_locale`) | provider/component + route | event-driven | itself (`trackMetaEvent`) + `app/[locale]/book/confirmation/page.tsx` fetch to `/api/meta-capi` | exact (same files, extend) |
| `app/api/meta-capi/route.ts` (`customDataSchema` add `site_locale`) | route (API) | request-response | itself — existing `.strict()` zod schema | exact (same file, extend) |
| `lib/analytics-server.ts` (`Ga4PurchaseParams` add `siteLocale`) + 3 call sites in `app/api/webhooks/stripe/route.ts` | service + route | event-driven | itself — existing `sendGa4Purchase`/MP body builder | exact (same file, extend) |
| `app/api/create-payment-intent/route.ts` (`meta.locale`) | route (API) | request-response | itself — existing `.catchall(BOUNDED_STRING)` schema + `meta` builder | exact (same file, extend) |
| `lib/supabase.ts` (`buildBookingRow` optional `locale`) | model/service | CRUD | itself — existing `buildBookingRow()` field list | exact (same file, extend) |
| `supabase/migrations/062_bookings_locale.sql` (if column chosen) | migration | CRUD | `supabase/migrations/061_driver_assignments_trip_progress.sql` (latest, naming convention) | exact |
| `lib/content/metricool.ts` (`draft` override on `CreatePostInput`/`buildBody`) | service | request-response | itself — existing `buildBody()` hardcode | exact (same file, extend) |
| `tests/corporate-form.test.tsx` (new) | test | request-response | `tests/helpers/renderWithIntl.tsx` (wrapper) + any existing component test using it | exact |
| `tests/analytics-server.test.ts` or `tests/meta-capi.test.ts` (new/extended) | test | event-driven | pattern: zod `.safeParse` assertions, e.g. `app/api/meta-capi/route.ts`'s own schema shape | role-match |

## Pattern Assignments

### `scripts/qa/render_audit.py`, `switcher_audit.py`, `en_leak_rendered.py`, `hreflang_reciprocity.py`, `csp_regression.py`, `booking_e2e.py` (QA scripts)

**Analog:** `scripts/qa/overflow_audit.py` (48 lines, full file read)

**Script skeleton pattern** (whole file):
```python
import sys, json
from playwright.sync_api import sync_playwright
"""<One-line audit description>: every locale x key page at one viewport width.
Usage: python3 scripts/qa/<name>.py [base_url] [width]
Requires Python Playwright. Writes <name>_<width>.json to the cwd."""
B=sys.argv[1] if len(sys.argv)>1 else 'https://rideprestigo.com'
PAGES=['/','/about','/fleet', ...]   # reuse this exact list for coverage parity
LOCS=['en','ru','es','fr','ar','hi','zh']
```

**Consent + browser setup pattern (reuse verbatim)**:
```python
with sync_playwright() as p:
    br=p.chromium.launch()
    c=br.new_context(viewport={'width':W,'height':812}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US')
    c.add_init_script("localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}))")
    pg=c.new_page()
    for loc in LOCS:
        for path in PAGES:
            url=B+('' if loc=='en' else '/'+loc)+(path if path!='/' or loc=='en' else '')
            try:
                pg.goto(url, wait_until='load', timeout=240000); pg.wait_for_timeout(1200)
                r=pg.evaluate(JS, W)
            except Exception as e:
                r={'error':str(e)[:100]}
    br.close()
```

**Output pattern (JSON dump + stdout summary, reuse verbatim)**:
```python
json.dump(res,open(f'<name>_<width>.json','w'),ensure_ascii=False,indent=1)
for u,r in res.items():
    if 'error' in r: print('ERR',u,r['error']); continue
    print(u, ...)
print('pages with issues:',len(res))
```

**Note for `booking_e2e.py`:** it needs real form interaction (`page.fill`, `page.click`), which `overflow_audit.py` does not do — only the browser-context/consent-init/CLI-arg skeleton transfers; the wizard-step interaction logic is net-new (no existing Playwright interaction analog in this repo; use Playwright's standard `locator().fill()/click()` API directly).

**Note for `hreflang_reciprocity.py`:** the skeleton (CLI arg, `sys.argv[1]`) transfers, but the core logic is sitemap XML parsing (no Playwright needed) — see RESEARCH.md's Code Examples section for the concrete `xml.etree.ElementTree` pattern already drafted there; copy it directly.

**Note for `en_leak_rendered.py`:** DNT allowlist seeds from `i18n/glossary.json`'s `doNotTranslate.brand` / `doNotTranslate.vehicleClasses` arrays (see excerpt below); reuse the DNT-exclusion *shape* from `checkNoEnglishLeakage` in the Phase 72 QA report generator (search `tests/i18n-completeness.test.ts` for the exact function if a Wave-0 task wants to import it rather than reimplement).

---

### `i18n/glossary.json` DNT excerpt (source for allowlist seeding)

```json
{
  "doNotTranslate": {
    "brand": ["Prestigo", "PRESTIGO", "chelautotrans s.r.o."],
    "vehicleClasses": ["Mercedes-Benz", "E-Class", "S-Class", "V-Class"],
    "structural": {
      "domains": ["rideprestigo.com"]
    }
  }
}
```

---

### `components/booking/steps/Step6Payment.tsx` (Stripe locale wiring)

**Analog:** itself — existing hardcoded `options` `useMemo`

**Current (to replace)**:
```typescript
const options = useMemo(
  () =>
    clientSecret
      ? {
          clientSecret,
          appearance,
          locale: 'en' as const,
          paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
          wallets: { applePay: 'auto' as const, googlePay: 'auto' as const },
          fields: { billingDetails: { address: 'never' as const } },
        }
      : null,
  [clientSecret]
)
```

**Booking-data assembly pattern to extend with `locale`** (existing `fetchPaymentIntent` body):
```typescript
body: JSON.stringify({
  bookingData: {
    attemptId: currentAttemptId,
    tripType,
    vehicleClass: vehicleClass ?? '',
    // ... existing fields ...
    // NEW: locale,  (from useLocale())
  },
}),
```

**Target pattern** — see RESEARCH.md Pattern 2 (`STRIPE_LOCALE_MAP` with `hi: 'auto'` fallback) — copy verbatim from RESEARCH.md.

---

### `components/booking/AddressInputNew.tsx` (Google Places `language` wiring)

**Analog:** itself — existing hardcoded hook config

**Current (to replace)**:
```typescript
} = usePlacesAutocomplete({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    debounceMs: 300,
    language: 'en',
    includedRegionCodes: ['cz', 'at', 'de', 'sk', 'hu', 'pl'],
    sessionToken,
})
```
**Fix:** `language: locale` where `locale = useLocale()` (all 7 locales supported by Places, no fallback map needed — unlike Stripe).

---

### `app/[locale]/corporate/CorporateForm.tsx` (full i18n externalization)

**Analog:** `tests/helpers/renderWithIntl.tsx` (test wrapper) — no fully-externalized sibling form was located to copy verbatim; use this file's own structure and thread `useTranslations('Corporate.form')` the same way any Client Component in this codebase calls `useTranslations(namespace)`.

**Current error-string hardcodes (to externalize)**:
```typescript
if (res.status === 429) setErrorMessage('Too many requests, please try again in a minute')
else if (res.status === 400) setErrorMessage('Please check your input and try again')
else setErrorMessage('Something went wrong — please try again later')
```
```typescript
} catch {
  setErrorMessage('Something went wrong — please try again later')
  setState('error')
}
```

**Test wrapper pattern to use for `tests/corporate-form.test.tsx`**:
```typescript
import { renderWithIntl, screen } from '@/tests/helpers/renderWithIntl'
import CorporateForm from '@/app/[locale]/corporate/CorporateForm'

renderWithIntl(<CorporateForm />)   // defaults to 'en' + messages/en.json
// then assert no raw hardcoded string remains, and labels resolve via t()
```

---

### `app/[locale]/book/page.tsx` / `app/[locale]/book/multi-day/page.tsx` (static-chrome externalization)

**Analog:** no single file excerpt captured this session, but RESEARCH.md's Pitfall 6 explicitly names the established convention: **structural config (array length/order/step numbers) stays in code; only `title`/`body` strings move into `messages/*.json`**, mirroring `HowItWorks`/`FeatureStrip` components elsewhere in the codebase. Follow that exact split — do not move the `.map()` array itself into JSON, only the translatable leaf strings, referenced by index/key (e.g. `t(\`Book.howItWorks.steps.${i}.title\`)`).

---

### `components/GoogleAnalytics.tsx` (`site_locale` via `gtag('set', ...)`)

**Analog:** itself — existing Consent Mode v2 inline script block

**Current shape (Consent Mode v2 ordering discipline to preserve)**:
```typescript
export default function GoogleAnalytics() {
  if (!GA_ID) return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      {/* consent default MUST be set before gtag('config', ...) */}
    </>
  )
}
```
**Fix pattern** — add a `locale` prop (threaded from `SiteChrome.tsx`'s `getLocale()`) and insert `gtag('set', { 'site_locale': '${locale}' })` **before** the existing `gtag('config', ...)` call, per RESEARCH.md Pattern 1 (copy that code block verbatim — it is already fully drafted there with correct ordering).

---

### `components/MetaPixel.tsx` (`trackMetaEvent`) + confirmation-page CAPI fetch (`site_locale` in `custom_data`)

**Analog:** itself — existing `trackMetaEvent` signature

**Current signature (unchanged, just pass `site_locale` inside `params`)**:
```typescript
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  if (eventId) {
    window.fbq('track', eventName, params ?? {}, { eventID: eventId })
  } else {
    window.fbq('track', eventName, params ?? {})
  }
}
```
Per RESEARCH.md Pitfall 4: the matching CAPI call lives in `app/[locale]/book/confirmation/page.tsx`'s `fetch('/api/meta-capi', ...)` (NOT the Stripe webhook) — add `site_locale` to both the Pixel call's `params` and the CAPI `fetch`'s `custom_data` body, using the **same key name and value** so eventId dedup is unaffected.

---

### `app/api/meta-capi/route.ts` (`customDataSchema` extension)

**Analog:** itself — existing `.strict()` schema (lines ~95-101, full file read)

**Current schema (to extend, never relax `.strict()`)**:
```typescript
// SEC-07: allow-list custom_data fields to prevent analytics poisoning
if (body.custom_data && typeof body.custom_data === 'object') {
  const customDataSchema = z.object({
    value: z.number().optional(),
    currency: z.string().max(3).optional(),
    content_name: z.string().max(200).optional(),
    content_category: z.string().max(200).optional(),
    num_items: z.number().optional(),
  }).strict()
  const parsed = customDataSchema.safeParse(body.custom_data)
  if (parsed.success) {
    event['custom_data'] = parsed.data
  }
}
```
**Fix:** add `site_locale: z.string().max(10).optional(),` to the object literal — keep `.strict()`. Silent-drop-on-mismatch behavior (Pitfall 2) means a unit test asserting `customDataSchema.safeParse({..., site_locale:'ru'}).data.site_locale === 'ru'` is required to catch a schema/client mismatch (no runtime error otherwise).

---

### `lib/analytics-server.ts` (`Ga4PurchaseParams` + `sendGa4Purchase` body) and `app/api/webhooks/stripe/route.ts` (3 call sites)

**Analog:** itself — existing interface + MP body builder (full file read)

**Current interface (to extend)**:
```typescript
export interface Ga4PurchaseParams {
  transactionId: string
  valueEur: number
  currency?: string // defaults to 'EUR'
  items: Ga4PurchaseItem[]
  clientId?: string
}
```
**Current MP body construction (site_locale param slots into `events[0].params`)**:
```typescript
const body = {
  client_id: clientId,
  non_personalized_ads: false,
  events: [{
    name: 'purchase',
    params: {
      transaction_id: params.transactionId,
      value: params.valueEur,
      currency: params.currency ?? 'EUR',
      affiliation: 'PRESTIGO',
      engagement_time_msec: 100,
      // NEW: site_locale: params.siteLocale,
    },
  }],
}
```
**Critical:** RESEARCH.md Pitfall 3 — there are exactly 3 call sites of `sendGa4Purchase(...)` in `app/api/webhooks/stripe/route.ts` (`handleOneWaySucceeded`, `handleRoundTripSucceeded`, and a reconciliation handler ~line 391). All three read from a `meta: Record<string,string>` object that already carries `meta.locale` (once `create-payment-intent` writes it) — thread `siteLocale: meta.locale` into all three calls in the same commit, or a round-trip-specific gap will silently persist.

---

### `app/api/create-payment-intent/route.ts` (`meta.locale`) and `components/booking/steps/Step6Payment.tsx` (send `locale` in `bookingData`)

**Analog:** itself — existing `.catchall(BOUNDED_STRING)` schema means **no schema edit needed** (RESEARCH.md Pattern 3, copy verbatim):
```typescript
// Step6Payment.tsx — inside existing bookingData object literal
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
// create-payment-intent/route.ts — inside the existing `meta` map builder
const meta: Record<string, string> = {
  bookingReference,
  // ...
  locale: bookingData.locale ?? 'en', // NEW
}
```

---

### `supabase/migrations/062_*.sql` (if `bookings.locale` column chosen — Claude's discretion, D-11)

**Analog:** `supabase/migrations/061_driver_assignments_trip_progress.sql` (latest; confirms next number is `062`)

**Naming convention observed from migration list**: `NNN_snake_case_description.sql` — sequential 3-digit prefix, no gaps (`057_security_rls_hardening.sql`, `058_pricing_globals_dispatch_horizon.sql`, `059_admin_search_bookings_sort.sql`, `060_driver_assignments_trip_token.sql`, `061_driver_assignments_trip_progress.sql`). A `062_bookings_locale.sql` would follow this exactly — additive `ALTER TABLE bookings ADD COLUMN locale text` only (no `DROP COLUMN` in this codebase's migration history per RESEARCH.md Open Question 2).

---

### `lib/content/metricool.ts` (`draft` override — must ship before any announcement task)

**Analog:** itself — existing `buildBody()` hardcode (full file read)

**Current (the bug to fix)**:
```typescript
export type CreatePostInput = {
  channel: MetricoolChannel;
  text: string;
  mediaUrl: string;
  mediaKind: "image" | "video";
  format?: MetricoolFormat;
  dueAt?: string;
  // NO draft field today
};

function buildBody(input: CreatePostInput, timezone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: input.text,
    media: [input.mediaUrl],
    mediaAltText: [],
    providers: [{ network: input.channel }],
    autoPublish: true,   // <-- hardcoded, always publishes live
    draft: false,        // <-- hardcoded, never a draft
    shortener: false,
    smartLinkData: { ids: [] },
    publicationDate: { dateTime, timezone },
  };
  // ...
}
```
**Fix:** add `draft?: boolean` to `CreatePostInput`; in `buildBody()`, when `input.draft === true`, set `body.draft = true; body.autoPublish = false;` — additive, no existing call site passes `draft` so current blog/social auto-publish behavior is unchanged. Gate the actual announcement call behind a `checkpoint:human-verify` task (per RESEARCH.md Pitfall 9 / Security Domain table).

---

## Shared Patterns

### QA script skeleton (Playwright, consent init, CLI base-URL arg, JSON output)
**Source:** `scripts/qa/overflow_audit.py` (full file, 48 lines)
**Apply to:** all six new `scripts/qa/*.py` files (`render_audit.py`, `switcher_audit.py`, `en_leak_static.py`, `en_leak_rendered.py`, `hreflang_reciprocity.py` (skeleton only), `csp_regression.py`, `booking_e2e.py`)
```python
B=sys.argv[1] if len(sys.argv)>1 else 'https://rideprestigo.com'
LOCS=['en','ru','es','fr','ar','hi','zh']
c.add_init_script("localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}))")
```

### `useLocale()` for client-side locale threading
**Source:** `next-intl` package, already the pinned i18n library (4.14.2); used identically at every net-new site: `Step6Payment.tsx`, `AddressInputNew.tsx`, `GoogleAnalytics.tsx` (via a `locale` prop from `SiteChrome.tsx`'s server-side `getLocale()`), `MetaPixel.tsx`/confirmation page.
**Apply to:** all component-level `site_locale`/Stripe-locale/Places-language wiring tasks.

### `renderWithIntl` test wrapper
**Source:** `tests/helpers/renderWithIntl.tsx` (full file, 40 lines)
**Apply to:** `tests/corporate-form.test.tsx` (new) and any other component-level i18n regression test this phase adds.
```typescript
export function renderWithIntl(ui, { locale = 'en', messages = enMessages, ...options } = {}) {
  return render(ui, { wrapper: ({children}) => (
    <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
  ), ...options })
}
```

### zod `.strict()` allow-list extension discipline
**Source:** `app/api/meta-capi/route.ts` (`customDataSchema`, SEC-07 comment)
**Apply to:** any schema (`customDataSchema`, `createPaymentIntentSchema`) touched to admit `site_locale`/`locale` — always add the field explicitly with a length bound (`z.string().max(N)`); never switch to `.passthrough()`.

### Sequential migration numbering
**Source:** `supabase/migrations/061_driver_assignments_trip_progress.sql` (latest)
**Apply to:** `062_bookings_locale.sql` if the DB-column path is chosen for D-11.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/qa/booking_e2e.py` (form-fill/click interaction logic) | test | event-driven | No existing Playwright *interaction* script in this repo — `overflow_audit.py` only reads/measures DOM, never fills forms. Use Playwright's own `locator().fill()/.click()` API directly (standard library usage, not a project pattern to copy) |
| `scripts/qa/hreflang_reciprocity.py` (sitemap XML parse/reciprocity logic) | test | transform | No existing sitemap-parsing script in the repo; RESEARCH.md already drafted the full concrete implementation (Code Examples section) — use that directly rather than searching further |
| GA4 Admin API custom-dimension registration script | config/one-off script | request-response | No prior GA4 Admin API usage in this codebase (only GSC scripts exist under `~/Desktop/founder prestigo/`, a different Google API); RESEARCH.md's Code Examples section has a full drafted implementation modeled on the GSC scripts' OAuth pattern — use that as the template instead of a codebase analog |

## Metadata

**Analog search scope:** `scripts/qa/`, `components/`, `app/[locale]/`, `app/api/`, `lib/`, `messages/`, `supabase/migrations/`, `tests/`, `i18n/`
**Files scanned (read in full or targeted excerpt):** `scripts/qa/overflow_audit.py`, `tests/helpers/renderWithIntl.tsx`, `i18n/glossary.json`, `components/GoogleAnalytics.tsx`, `components/MetaPixel.tsx`, `app/api/meta-capi/route.ts`, `lib/analytics-server.ts`, `components/booking/steps/Step6Payment.tsx`, `components/booking/AddressInputNew.tsx`, `app/[locale]/corporate/CorporateForm.tsx`, `lib/content/metricool.ts`, `supabase/migrations/` listing
**Pattern extraction date:** 2026-09-25
