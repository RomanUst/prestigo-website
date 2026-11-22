# Phase 93: Day Trips & Custom Tours - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 31 (new/modified)
**Analogs found:** 29 / 31 (all analog paths verified git-tracked: app/sitemap.ts, lib/seo.ts, lib/inquiries.ts, lib/lead-mapping.ts, lib/quotes/store.ts, lib/noshow-alert.ts, quotes admin page; the rest are normal source dirs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/092_tours.sql` | migration | CRUD | `065_inquiries.sql` (RLS deny-all), `044_content_media_bucket.sql` (bucket) | exact |
| `lib/tours/types.ts` | model | transform | `lib/route-prices.ts` (Row -> view) | role |
| `lib/tours/store.ts` | service (guarded readers) | CRUD read | `lib/route-prices.ts` `getRoutePrice` | exact |
| `lib/tours/pricing.ts` | utility | transform | `lib/server-pricing.ts` | role |
| `lib/tours/policy.ts` | utility | transform | `lib/cancellation-policy.ts` (DEFAULT_POLICY, QUOTE_ prefix) | exact |
| `lib/tours/completeness.ts`, `jsonld.ts` | utility | transform | `lib/jsonld.ts` `buildRouteJsonLd` | role |
| `lib/tours/admin-schemas.ts` | utility (zod) | request-response | `lib/quotes/schemas.ts` | exact |
| `app/[locale]/services/[slug]/page.tsx` (modify) | page (ISR) | request-response | itself (current file) | exact |
| `app/[locale]/book/tour/page.tsx` | page (client checkout) | request-response | `app/[locale]/book/multi-day/page.tsx` + `Step6CardOnFile.tsx` | role |
| `app/[locale]/book/custom-tour/page.tsx` | page | request-response | `app/[locale]/book/multi-day/page.tsx` | exact |
| `components/tours/*` (Gallery, BookingBox, StickyBar, TourCard, CustomTourForm, CardForm extract) | component | request-response | `components/booking/MultiDayForm.tsx`, `Step6CardOnFile.tsx` | role |
| `app/api/custom-tour/route.ts` | route | request-response | `app/api/submit-multiday-quote/route.ts` | exact |
| `app/api/admin/tours/**`, `tour-settings`, `custom-tours` | route | CRUD | `app/api/admin/route-prices/[slug]/route.ts` | exact |
| `app/(internal)/admin/(dashboard)/tours/**`, `custom-tours/page.tsx` | page | CRUD | `quotes/page.tsx` | exact |
| `components/admin/TourSettings.tsx` | component | CRUD | `CancellationPolicySettings.tsx` | exact |
| `components/admin/AdminSidebar.tsx` (modify) | config | - | itself `navItems` | exact |
| `lib/checkout/compute.ts`, `lib/payments/config.ts`, `lib/cancellation-policy.ts` (modify) | service | request-response | themselves | exact |
| `lib/inquiries.ts`, `lib/lead-mapping.ts`, `lib/outbox.ts`, `lib/lead-sync.ts` (modify) | service | event-driven | `alert.no_show` + `multiday_quote` | exact |
| `lib/quotes/store.ts`, `schemas.ts` (modify) | service | CRUD | themselves | exact |
| `lib/seo.ts`, `app/sitemap.ts` (modify) | utility | transform | themselves | exact |
| `infra/espocrm/{enums,fields}.json`, `booking-map.mjs`, `lib/customer-mapping.ts` | config | - | existing trip-type lists | exact |
| `scripts/seed-tours.mjs` | script | batch | `scripts/zh-hant-sync.mjs` | role |
| tests (policy round-trip, no-price seed, sitemap await, admin PATCH guard) | test | - | existing `tests/` files named in RESEARCH | role |

## Pattern Assignments

### `supabase/migrations/092_tours.sql` (migration)
**Analog:** `supabase/migrations/065_inquiries.sql` lines 13-40 (RLS), `044_content_media_bucket.sql` lines 8-19 (bucket).
```sql
CREATE TABLE IF NOT EXISTS public.inquiries ( ... kind text NOT NULL CHECK (kind IN ('contact','corporate','multiday_quote')), ...);
REVOKE ALL ON public.inquiries FROM anon, authenticated;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY inquiries_no_public_read ON public.inquiries FOR SELECT USING (false);
```
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('content-media','content-media',true,104857600, ARRAY['video/mp4','image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
```
Apply to all 4 tables (REVOKE + RLS + deny-all). Widen `inquiries.kind` CHECK to add `custom_tour` (drop + re-add constraint). Wave 0: read live `pg_constraint` for `bookings` before adding `trip_type='tour'`. Gotcha (memory): any DROP+CREATE of SECURITY DEFINER function must re-REVOKE from PUBLIC, anon, authenticated. Executors have no Supabase MCP; orchestrator applies migration.

### `lib/tours/store.ts` (guarded readers)
**Analog:** `lib/route-prices.ts` lines 88-103.
```ts
export async function getRoutePrice(slug: string, ...) {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase.from('route_prices').select(SELECT_COLS).eq('slug', slug).single()
    if (error || !data) return null
    ...
  } catch { return null }
}
```
Client is built inside try; return null / [] without env; never throw at build/render (Vercel Preview).

### `lib/tours/policy.ts` (cancellation snapshot)
**Analog:** `lib/cancellation-policy.ts` lines 41-76 (`POLICY_BOUNDS`, `QUOTE_POLICY_VERSION_PREFIX = 'quote-'`, `DEFAULT_POLICY`, `LEGACY_POLICY`). Copy RESEARCH "Tour policy snapshot" (`{...DEFAULT_POLICY, version:'tour-…', freeHours* = h, feePercent:100}`) and `buildPolicySnapshot` from `lib/cancellation-settings.ts`. Cap admin hours at `POLICY_BOUNDS.hours.max` (72). Test: round-trip through `policyFromSnapshot`, assert `!== LEGACY_POLICY` (Pitfall 3). Add tour branch in `freeHoursFor` (lines ~73-77).

### `lib/checkout/compute.ts` / `lib/payments/config.ts` (modify)
**Analog:** themselves. Edits at `compute.ts:44` (`TRIP_TYPES`), `:60` (`tripType: z.enum([...])`), schema uses `.catchall(BOUNDED_STRING)` so `tourSlug`/`extraHours` ride as strings; `config.ts:30` `CARD_FLOW_TRIP_TYPES = ['transfer','hourly'] as const` add `'tour'`. Add tour block in `validateCheckoutBooking` and `priceCheckout` (RESEARCH Pattern 2). Server recomputes amounts; client amount only cross-checked (409 PRICE_CHANGED). Also init/intent routes: swap `getCancellationPolicy()` for tour policy when `tripType==='tour'`.

### `app/api/custom-tour/route.ts`
**Analog:** `app/api/submit-multiday-quote/route.ts`.
Imports (1-14): `checkRateLimit, getClientIp`, `normalizePhone`, `enforceMaxBody, safeEmail, safeString`, `storeInquiry`, `dispatchAfterResponse, inquiryOutboxKey`, email helpers.
Guard order (116-189):
```ts
const tooBig = enforceMaxBody(req, 50_000); if (tooBig) return tooBig        // use 10_000
const { allowed, remaining, limit } = await checkRateLimit('/api/submit-multiday-quote', getClientIp(req))
if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60', ... } })
const parsed = schema.safeParse(await req.json())   // z.object(...).strict(); 400 with flatten()
const phoneE164 = normalizePhone(phone); if (!phoneE164) return NextResponse.json({ error: '...', code: 'INVALID_PHONE' }, { status: 422 })
const stored = storeInquiry('multiday_quote', { email, name, phone: phoneE164, company: null, payload: {...} })
await Promise.all([sendMultidayOperatorAlert(d), sendMultidayClientAck(d)])
const inquiryId = await stored; if (inquiryId) dispatchAfterResponse(inquiryOutboxKey(inquiryId))
```
Changes: kind `custom_tour`, add honeypot (`website`, as `/api/contact`), localized client ack, add `/api/custom-tour` to `CSRF_PROTECTED_PREFIXES` (middleware.ts:10-33) and `LIMITS` in `lib/rate-limit.ts`. Use `safeString` for single-line fields.

### Lead pipeline modifications
- `lib/inquiries.ts:8` `export type InquiryKind = 'contact' | 'corporate' | 'multiday_quote'` -> add `'custom_tour'`. `storeInquiry` never throws, 3 s timeout, logs code only; keep.
- `lib/outbox.ts:9-23` `OutboxEventType` add `'alert.custom_tour'`; key regex modelled on `ALERT_NO_SHOW_KEY` (line 41) and `INQUIRY_KEY`.
- `lib/lead-sync.ts:203-211` (D-19 Chatwoot private note, ids only, no PII):
```ts
if (row.event_type === 'alert.no_show') {
  if (!d.chatwootConfig || !d.chatwoot) return breaker(row, 'chatwoot_unconfigured', d)
  try { return await deliverNoShowAlert(row, d, d.noShowAlert) } catch (err) { return handleFailure(row, err, d) }
}
```
Copy for `alert.custom_tour` with a new `lib/custom-tour-alert.ts` modelled on `lib/noshow-alert.ts` (uses `loadChatwootOpsConversationId` from `lib/chatwoot-client.ts`).
- `lib/lead-mapping.ts`: `InquiryRow.kind`, `leadSourceForInquiry`, `buildLeadFromInquiry`, `LEAD_SOURCE` add `'Custom tour'`; `infra/espocrm/enums.json` + `tests/espocrm-enums.test.ts:271`; owner runs `infra/espocrm/sync.mjs` first.

### `app/api/admin/tours/**`, `tour-settings`, `custom-tours` (admin routes)
**Analog:** `app/api/admin/route-prices/[slug]/route.ts` (full file).
```ts
async function getAdminUser() { const supabase = await createClient(); const { data:{user}, error } = await supabase.auth.getUser()
  if (error || !user) return { user:null, error:'401' as const }
  if (!user.app_metadata?.is_admin) return { user:null, error:'403' as const }; return { user, error:null } }
const tooBig = enforceMaxBody(request, 5_000); if (tooBig) return tooBig
// 401/403 -> body.parse (400 'Invalid payload') -> createSupabaseServiceClient() update -> 404 if none
revalidatePath('/[locale]', 'layout')
```
Use `z.strictObject`. Server computes `is_complete` per translation (never from client). Photo upload: admin-gated signed-URL mint (`createSignedUploadUrl`), server generated path, ext allow-list; register row after verifying object exists.

### `app/[locale]/services/[slug]/page.tsx` (modify)
**Analog:** itself, lines 11-52. Change `dynamicParams=false` -> `true`; `generateStaticParams` = landing slugs + published tour slugs (empty on missing env); resolve `findLandingPage` first, else `getPublishedTour`, else `notFound()`. Keep `setRequestLocale(locale)` (never `getLocale()`). Incomplete locale: `redirect()` 307 to EN URL (D-23). Metadata:
```ts
const alternates = getAlternates(`/services/${slug}`, { indexable: true, content: { kind: 'page', key }, locale })
```
-> pass new `availableLocales` option (lib/seo.ts `hasLocaleContent` is fs-based at lines 84-95; add explicit-locales override, keep `en` always).

### `lib/tours/jsonld.ts`
**Analog:** `lib/jsonld.ts` ~lines 80-130: `futureIsoDate(365)`, `businessNode(...)`, `@graph` with `Offer { price: String(...), priceCurrency:'EUR', availability, priceValidUntil }`, `provider: { '@id': `${BASE_URL}/#business` }`. Node type `TouristTrip` + 3 Offers + FAQPage + BreadcrumbList (copy builders from `components/LandingView.tsx`). Use `safeJsonLd()` (escape `<`), NOT the raw `JSON.stringify` at LandingView.tsx:108. Golden tests normalize `priceValidUntil`.

### `app/(internal)/admin/(dashboard)/tours/**`, `custom-tours/page.tsx`
**Analog:** `app/(internal)/admin/(dashboard)/quotes/page.tsx` ('use client', loads `/api/admin/...`, debounce search, `COPY_*` constants, 401/403 -> session text, `errorStyle, focusRingHandlers, inputBaseStyle, labelStyle` from `components/admin/adminFieldStyles`, `outlineButtonStyle` from `paymentShared`). Table recipe: `components/admin/quotes/QuotesTable.tsx`. No colour literals (`tests/admin-no-hardcoded-colors.test.ts`; use `--admin-*`). "Create quote" -> POST `/api/admin/quotes` with new `source_inquiry_id`, `locale`.

### `components/admin/TourSettings.tsx`
**Analog:** `components/admin/CancellationPolicySettings.tsx` lines 1-70: `FIELDS` record with `min/max/fallback/error`, `parseField` whole-number check, optimistic save on blur, server authoritative. Fields: extra-hour E/S/V, free-cancel hours (max 72), pickup radius.

### `lib/quotes/store.ts` + `schemas.ts` (modify)
`schemas.ts:156-160`: `quoteCreateSchema = z.strictObject({ client, lead_channel, currency })` -> add optional `source_inquiry_id: z.string().uuid()`, `locale`. `store.ts:341-351` `createQuoteDraft` insert currently picks `latestBookingLocale(email)`; use provided locale, write `source_inquiry_id`, verify inquiry exists with `kind='custom_tour'`; `lead_channel: 'other'`.

### `components/admin/AdminSidebar.tsx`
Add after Quotes in `navItems` (lines 35-47): `{ href:'/admin/tours', label:'Tours', icon: Route }`, `{ href:'/admin/custom-tours', label:'Custom tours', icon: MessageCircle }`.

### `app/[locale]/book/custom-tour/page.tsx` + custom-tour form component
**Analog:** `app/[locale]/book/multi-day/page.tsx` (metadata from `getPageContent`, `getAlternates`, `businessNodeDoc`, `MetaViewContent`) and `components/booking/MultiDayForm.tsx` (`useTranslations`, `DayPicker` + `calendarStyles` dark overrides, `isValidIntlPhone/normalizePhone/PHONE_PLACEHOLDER`, `Link` from `@/i18n/routing`). Prefill from `?tour=<slug>`.

### `app/[locale]/book/tour/page.tsx` (checkout)
**Analog:** `components/booking/steps/Step6CardOnFile.tsx` (store-coupled at ~349/374/387: `useBookingStore.getState()`, `goToStep(5)`). Extract store-agnostic `CardForm` (props: `buildBody(attemptId)`, endpoints, `onInvalidPhone`); keep Step6 as thin wrapper (regression: `tests/Step6CardOnFile.test.tsx`). Confirmation page `app/[locale]/book/confirmation/page.tsx` reads wizard store: add tour variant fed by `writeConfirmationNotice`-style snapshot. Bookings come in via `/api/card-checkout/init|intent`.

### `lib/seo.ts` / `app/sitemap.ts`
Make `sitemap()` async (`tests/sitemap.test.ts:5-6` must `await`); replace day-trip `landingEntries` rows with `getPublishedTourLocales()` rows using `tours.updated_at` for lastmod; no tour rows without env.

### trip_type list updates (all exact edits, see RESEARCH audit table)
`lib/customer-mapping.ts:66`, `infra/espocrm/lib/booking-map.mjs:31`, `infra/espocrm/fields.json`, `app/api/admin/bookings/dispatch/route.ts:18`, `app/api/admin/bookings/route.ts:559` (guard: tour PATCH requires `override_price`), `BookingsTable.tsx:405`/`BookingsWorkspace.tsx:54` chips, `lib/email.ts:280,289`, `lib/google-calendar.ts:97,187`. Wizard `TripType` and quote line CHECK stay unchanged.

## Shared Patterns
- **Admin auth guard:** `getAdminUser()` above; every admin API re-checks; (dashboard) layout gates pages.
- **Public API guard order:** maxBody -> rate limit (+LIMITS entry) -> zod strict (400) -> business rules (422) -> best-effort store -> response; add CSRF prefix in middleware.
- **Revalidate:** `revalidatePath('/[locale]','layout')` after every admin write; page `revalidate = 3600`.
- **No typed prices/€:** prices are props (`formatEUR`/`formatMinor`); seed-content test rejects currency amounts and "15 min" model text.
- **Locale:** `params.locale` + `setRequestLocale`; real translations for 8 locales (zh-hant via opencc `Converter({from:'cn',to:'twp'})`); new `Tours.*` namespace in `messages/*`.
- **Supabase client:** never at render/module level; wrap in try/catch.
- **Payment state:** only via `createCardCheckoutIntent` (`tests/payment-state-writers-gate.test.ts`).

## No Analog Found
| File | Role | Reason |
|---|---|---|
| Photo gallery with "+N" lightbox, photo reorder (up/down) UI | component | no existing gallery or reorder UI; `@dnd-kit/sortable` absent; use RESEARCH up/down buttons |
| Signed-upload photo flow (`photos/sign` route) | route | only server-side upload exists (`/api/content/upload-media`); follow RESEARCH Storage `createSignedUploadUrl` |
| Admin inquiries list (`custom-tours`) | page | no inquiries admin page exists; use quotes list as shell |

## Metadata
**Analog search scope:** app/api, app/[locale], app/(internal)/admin, components/admin, components/booking, lib, supabase/migrations.
**Pattern extraction date:** 2026-11-18
