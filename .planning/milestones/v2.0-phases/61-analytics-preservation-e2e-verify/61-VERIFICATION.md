# Phase 61 — Analytics Preservation & E2E Verification

## Audit Date: 2026-06-17
## Audited by: code trace + static analysis

---

## SC-1: GA4 Funnel (guest path)

| Event | Trigger | File | Status |
|---|---|---|---|
| `form_start` | Step 1 mount | BookingWizard.tsx:168 | ✅ |
| `checkout_progress` (per step) | currentStep change | BookingWizard.tsx:158–165 | ✅ |
| `view_item_list` | Step 2 mount | BookingWizard.tsx:174 | ✅ |
| `view_item` | Vehicle selected on step 2 | BookingWizard.tsx:183 | ✅ |
| `begin_checkout` | SELECT clicked in StickyBookingPanel | StickyBookingPanel.tsx:120 | ✅ |
| `add_payment_info` | Step 6 mount | BookingWizard.tsx:199 | ✅ |
| `purchase` | Confirmation page — paid booking | confirmation/page.tsx:198 | ✅ |
| `generate_lead` | Confirmation page — quote mode | confirmation/page.tsx:190 | ✅ |

Guest path deduplication: `funnelFiredRef` (useRef Set) prevents double-firing in StrictMode.

---

## SC-2: GA4 Auth Events (account path)

| Event | Trigger | File | Status |
|---|---|---|---|
| `login` (method: email_otp) | OTP verify success | Step3Auth.tsx:181 | ✅ |
| `login` (method: password) | Password sign-in success | Step3Auth.tsx:202 | ✅ |
| `login` (method: oauth) | OAuth return → session found on mount | Step3Auth.tsx:133 + OAuthButtons.tsx:25 | ✅ |
| `sign_up` (method: email) | signUp() with immediate session | Step3Auth.tsx:232 | ✅ |

OAuth fix (Phase 61): OAuthButtons sets `oauth_login_pending=1` in sessionStorage before redirect. Step3Auth clears it and fires `login` event on OAuth return.

---

## SC-3: Meta Pixel + CAPI

| Event | Client (Pixel) | Server (CAPI) | eventId dedup |
|---|---|---|---|
| `InitiateCheckout` | StickyBookingPanel.tsx:123 | None (no CAPI counterpart) | N/A |
| `AddPaymentInfo` | BookingWizard.tsx:200 | None (no CAPI counterpart) | N/A |
| `Purchase` | confirmation/page.tsx:207 | confirmation/page.tsx:219 + /api/meta-capi | ✅ bookingRef |

Consent gating: `trackMetaEvent` checks `typeof window.fbq !== 'function'`. `window.fbq` is only defined when MetaPixel component loads, which requires `consented === true` (localStorage `prestigo_consent_v2.marketing`). Zero-code path for non-consenting users.

---

## SC-4: sessionStorage snapshot + server-side GA4

| Check | Location | Status |
|---|---|---|
| `writePurchaseSnapshot()` before `confirmPayment()` | Step6Payment.tsx:98 | ✅ |
| `consumePurchaseSnapshot()` on confirmation page | confirmation/page.tsx:138 | ✅ |
| `sendGa4Purchase()` in Stripe webhook (one-way) | webhooks/stripe/route.ts:204 | ✅ |
| `sendGa4Purchase()` in Stripe webhook (round-trip) | webhooks/stripe/route.ts:340 | ✅ |

Snapshot survives Stripe 3DS redirect and `window.location.href` reload (sessionStorage is tab-scoped, survives same-origin navigations).

---

## SC-5: CSP nonce + Consent Mode v2

### CSP strategy (middleware.ts:170–181):
- `/admin`, `/driver` → **nonce-based CSP** (strict-dynamic, no analytics)
- `/book`, `/login`, `/account`, `/auth`, `/api` → **static CSP** with `unsafe-inline`
- Marketing pages → same static CSP

**Rationale**: Analytics scripts live in root layout and run on `/book`. A per-request nonce on `/book` would require `headers()` in root layout → breaks edge caching site-wide. Intent documented in middleware.ts comments.

### GoogleAnalytics component:
- `gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' })` fires BEFORE `gtag('config', ...)` ✅
- CookieBanner fires `gtag('consent', 'update', { analytics_storage: 'granted', ... })` when user accepts ✅
- Scripts use `strategy="afterInteractive"` — no hydration mismatch ✅

### OAuth redirect path CSP:
- `/auth/callback` → `/book` redirect — both paths use static CSP ✅
- No nonce needed, GA scripts run unconditionally ✅

---

## Gap fixed in Phase 61

**Gap**: OAuth `login` GA4 event was missing. When user returns from Google/Apple OAuth,
Step3Auth detected the session and called `nextStep()` without firing any analytics event.

**Fix**: `OAuthButtons.tsx` sets `sessionStorage.setItem('oauth_login_pending', '1')` before
the OAuth redirect. `Step3Auth.tsx` checks and clears this flag on mount when a session is
found, then fires `window.gtag?.('event', 'login', { method: 'oauth' })`.

---

## Summary

All 5 success criteria are met. One code gap (OAuth login event) was identified and fixed.
All other events were already correctly wired from Phases 59–60.
