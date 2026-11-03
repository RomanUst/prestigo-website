# Phase 77: Chatwoot Deployment + Core Channels - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 12 new/modified
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `components/ChatLauncher.tsx` | component | event-driven | `components/HeroWhatsApp.tsx` | role-match |
| `components/ChatWidgetLoader.tsx` | component | event-driven (click-to-load 3rd party) | `components/CookieBanner.tsx` (consent-gated load pattern) + `components/MetaPixel.tsx` (consent-event listener) | exact (pattern composite) |
| `app/api/chatwoot/identity/route.ts` | route (API) | request-response | `app/api/driver/respond/route.ts` (session/token-guarded POST) — for structure; `lib/supabase/server.ts` for session read | role-match |
| `middleware.ts` (CSP additions) | config | transform (per-request header) | itself — existing `buildCsp`/`buildCspStatic` functions | exact (same file, extend) |
| `scripts/qa/baselines/csp_baseline.json` | config | transform | itself | exact |
| `tests/infra-vps-isolation-guard.test.ts` (allowlist entries) | test | transform | itself, `VPS_ASYNC_ALLOWLIST` array | exact |
| `tests/chatwoot-identity.test.ts` | test | CRUD/unit | `tests/email.test.ts` (unit test structure for lib functions) | role-match |
| `lib/email.ts` (2 `replyTo` sites changed) | service | CRUD | itself — existing `sendClientConfirmation`/`sendRoundTripClientConfirmation` | exact |
| `infra/chatwoot/sync.mjs` | utility (script) | batch / event-driven (idempotent upsert via REST) | `infra/vps/scripts/provision-monitors.sh` (idempotent SaaS-API provisioning script convention) | role-match |
| `infra/chatwoot/canned-responses/*.json`, `labels.json`, `automation-rules.json`, `teams.json` | config | batch (config-as-code) | `infra/vps/monitoring/monitors.json` (versioned JSON config consumed by a provisioning script) | exact |
| `infra/vps/runbooks/upgrade.md` / `monitoring.md` (extended) | config (docs) | — | themselves — existing runbook structure | exact |
| `messages/*.json` (`ChatLauncher` namespace, 7 locales) | config (i18n) | transform | `messages/en.json` `"CookieBanner"` key block | exact |

## Pattern Assignments

### `components/ChatLauncher.tsx` (component, event-driven)

**Analog:** `components/HeroWhatsApp.tsx` (full file, 17 lines)

**Imports pattern:**
```typescript
'use client'

import { useTranslations } from 'next-intl'
import { trackMetaEvent } from '@/components/MetaPixel'
```

**Core pattern — CTA + analytics on click:**
```typescript
<a
  href="https://wa.me/420725986855?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer."
  target="_blank"
  rel="noopener noreferrer"
  className="cta-text"
  onClick={() => trackMetaEvent('Contact', { content_name: 'WhatsApp Hero' })}
>
  {t('bookViaWhatsapp')}
</a>
```
Apply this exact `trackMetaEvent('Contact', { content_name: '<channel>' })` call to all three menu items (Chat on site / WhatsApp / Telegram) per the Copywriting Contract's "interaction contract" row (77-UI-SPEC.md line 59). WhatsApp menu item reuses the same `wa.me/420725986855` href as `HeroWhatsApp.tsx` — do not invent a new WhatsApp link.

**RTL / logical-property pattern** — from `components/Nav.tsx:124` (`start-0 end-0`) and `components/CookieBanner.tsx:421` (`start-0.5`, `rtl:-translate-x-5`): use `start-*`/`end-*`/`inset-inline-*`, never `left-`/`right-`, for the launcher's corner offset and the menu's open direction.

**Z-index:** new value `z-40`, strictly between `Nav.tsx`'s `z-50` and `CookieBanner.tsx`'s `z-[400]` (see `components/Nav.tsx:124`, `components/CookieBanner.tsx:157`).

---

### `components/ChatWidgetLoader.tsx` (component, click-to-load 3rd party)

**Analog 1 — consent-gated event pattern:** `components/CookieBanner.tsx` (read lines 1-80, full consent model)

**Analog 2 — consent-event listener pattern:** `components/MetaPixel.tsx:87-88`
```typescript
window.addEventListener('prestigo:consent-granted', handler)
return () => window.removeEventListener('prestigo:consent-granted', handler)
```
D-02 makes the "Chat on site" click itself the consent trigger — so `ChatWidgetLoader` does NOT listen for `prestigo:consent-granted` (that event is reserved for the CookieBanner's marketing-category grant). Instead it mirrors the *shape* of MetaPixel's pattern: a client component that does nothing on mount and only injects a third-party script/iframe in response to one explicit trigger — here the trigger is the launcher's onClick handler, not a CustomEvent.

**Core click-to-load pattern (from 77-RESEARCH.md, confirmed against `CITED: developers.chatwoot.com/self-hosted/restricted-instances`):**
```typescript
'use client'
export function loadChatwootWidget(websiteToken: string, baseUrl: string) {
  if (typeof window === 'undefined' || (window as any).$chatwoot) return
  const script = document.createElement('script')
  script.src = `${baseUrl}/packs/js/sdk.js`
  script.async = true
  script.defer = true
  document.body.appendChild(script)
  script.onload = () => {
    (window as any).chatwootSDK.run({ websiteToken, baseUrl })
  }
}
// Called only from the launcher's onClick handler — never in a useEffect
// that runs on mount, and never via next/script.
```
Set `window.chatwootSettings` (position/locale/useBrowserLanguage/type) BEFORE this script runs, per 77-UI-SPEC.md "Widget Branding Settings" table.

**CSP inheritance caveat (Pitfall 4, 77-RESEARCH.md):** verify empirically in-browser that this `document.createElement('script')` call, with no `nonce` attribute, still executes under `middleware.ts`'s `nonce + strict-dynamic` policy on dynamic routes (`/book`, `/login`, `/account`) — do not assume from static CSP-header diffing alone.

---

### `app/api/chatwoot/identity/route.ts` (API route, request-response)

**Analog:** `app/api/driver/respond/route.ts` (structure only — token/session-guarded POST with rate limiting) and `lib/supabase/server.ts` for the session-read call.

**Structural pattern to copy (imports + guard-first shape):**
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHmac } from 'node:crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ identified: false })

  const secret = process.env.CHATWOOT_WIDGET_HMAC_SECRET
  if (!secret) return NextResponse.json({ identified: false }) // fail closed

  const identifierHash = createHmac('sha256', secret).update(user.id).digest('hex')
  return NextResponse.json({
    identified: true,
    identifier: user.id,
    identifierHash,
    email: user.email,
  })
}
```
**Auth pattern:** derive identity exclusively from `supabase.auth.getUser()` — never accept a client-supplied `user_id`/identifier param (matches the ASVS V4 note in 77-RESEARCH.md and the "guard-first" shape every `app/api/admin/**/route.ts` file uses, e.g. checking auth before touching any body).

**Error handling pattern:** fail closed with `{ identified: false }` rather than throwing — never leak a "secret missing"-shaped error to the client (this diverges from `driver/respond/route.ts`'s 400/429 JSON-error convention deliberately, because this endpoint must never reveal *why* identification failed).

---

### `middleware.ts` (CSP additions, D-09)

**Analog:** the file's own `buildCsp`/`buildCspStatic` functions (lines ~45-95).

**Pattern — exact-origin CSP directive extension (not a wildcard):**
```typescript
"frame-src https://js.stripe.com https://hooks.stripe.com https://chat.rideprestigo.com",
"connect-src 'self' ... https://chat.rideprestigo.com wss://chat.rideprestigo.com",
"img-src 'self' data: blob: ... https://chat.rideprestigo.com",
```
Add the exact `chat.rideprestigo.com` origin to `script-src`(-elem inheritance via strict-dynamic, no separate entry needed if Pitfall 4 confirms inheritance)/`connect-src`/`frame-src`/`img-src` in BOTH `buildCsp` (nonce, dynamic routes) and `buildCspStatic` (marketing pages) — the widget can load from `/book`, `/login`, `/account` and from static pages alike (D-03: all public pages). Never use a wildcard subdomain (`*.rideprestigo.com`) per the Security Domain table in 77-RESEARCH.md.

**Companion file:** `scripts/qa/baselines/csp_baseline.json` — update as a reviewed diff, same structure as the two `buildCsp*` functions above (grep the file for its own diff-checker consumer before writing a new one, per RESEARCH.md's Wave-0-gap note).

---

### `tests/infra-vps-isolation-guard.test.ts` (allowlist extension)

**Analog:** the file's own `VPS_ASYNC_ALLOWLIST` array and its doc-comment contract (lines 49-56).

**Pattern — exactly two new entries, each with an explicit async-mechanism reason:**
```typescript
const VPS_ASYNC_ALLOWLIST: AllowlistEntry[] = [
  {
    path: 'components/ChatWidgetLoader.tsx',
    reason: 'click-to-load consent-gated client widget loader — never runs on page render',
  },
  {
    path: 'app/api/chatwoot/identity/route.ts',
    reason: 'on-demand identity endpoint invoked only after widget click by an already-authenticated user session, not a synchronous page-render path',
  },
]
```
Do not widen this allowlist beyond these two files (Pitfall 5, 77-RESEARCH.md). `components/ChatLauncher.tsx` itself does NOT need an entry if it contains no `chat.rideprestigo.com` literal / `CHATWOOT_` env reference — only files that actually match `VPS_HOST_RE`/`VPS_ENV_RE`/`VPS_PKG_RE` need listing.

---

### `tests/chatwoot-identity.test.ts` (unit test)

**Analog:** `tests/email.test.ts` (structure — unit-testing a `lib/*` pure function with fixed input/output vectors; grep its imports/describe-block shape before writing).

**Core pattern:** test `createHmac('sha256', secret).update(id).digest('hex')` against a fixed known-good vector (no live Chatwoot call, no network) — pure unit test of the HMAC computation extracted into a testable function (do not inline the crypto call only inside the route handler; export a small `computeIdentifierHash(secret, userId)` helper from `lib/` or the route file so it's importable by the test).

---

### `lib/email.ts` (2 `replyTo` sites → `bookings@rideprestigo.com`)

**Analog:** the file itself. All 7 `replyTo` sites found:

| Line | Current value | Classification (D-11) | Action |
|---|---|---|---|
| 293 (`sendClientConfirmation`) | `'roman@rideprestigo.com'` | customer-facing (booking confirmation) | → `bookings@rideprestigo.com` (owner-resolved singular/plural, per 77-RESEARCH.md's resolved footnote) |
| 336 | `'roman@rideprestigo.com'` | audit — read surrounding function name at execution time | likely customer-facing → same change |
| 370 | `data.email` | contact-form reply to visitor's own address | **untouched** (D-11 exception) |
| 403 | `process.env.MANAGER_EMAIL!` | internal/manager notification | **untouched** |
| 705 (`sendRoundTripClientConfirmation`) | `'roman@rideprestigo.com'` | customer-facing | → `bookings@rideprestigo.com` |
| 776 | `'roman@rideprestigo.com'` | audit — read surrounding function name at execution time | likely customer-facing → same change |
| 973 | `data.email` | visitor's own address | **untouched** |

**Pattern to copy:** the existing `sendClientConfirmation`/`sendRoundTripClientConfirmation` function shape (imports, Resend call, `replyTo` field placement) — only the string value changes at the customer-facing sites; no structural change. Cover with `tests/email.test.ts` assertions for the 2 changed + 5 unchanged sites (Wave-0 gap noted in RESEARCH.md).

---

### `infra/chatwoot/sync.mjs` (idempotent config-as-code sync script)

**Analog:** `infra/vps/scripts/provision-monitors.sh` (idempotent SaaS-API provisioning convention — read in full for the idempotency/match-by-name pattern, lines 1-50+).

**Pattern to copy (idempotency discipline, adapted from bash to `.mjs`/`fetch` per RESEARCH.md's stated tradeoff):**
```javascript
// infra/chatwoot/sync.mjs
// Reads CHATWOOT_API_TOKEN from env only, for the lifetime of this one
// invocation — never written to disk, never logged. Run by Claude/owner
// manually; never called from the live site (D-18).
// Idempotent: GET existing canned_responses/labels/automation_rules by
// short_code/name, POST only if absent, PATCH if content differs, matching
// provision-monitors.sh's "matched by friendly_name, never re-created" rule.
// Supports --dry-run (prints the diff, makes zero API calls) per the
// Wave-0 gap in 77-RESEARCH.md.
```
**Core config-as-code pattern:** `infra/vps/monitoring/monitors.json` is the analog for how `infra/chatwoot/labels.json`/`teams.json`/`automation-rules.json`/`canned-responses/*.json` should be shaped — flat, versioned JSON consumed by exactly one script, never hand-edited via a dashboard as the source of truth.

**No prices guard:** canned-response JSON source files fall under the same CLAUDE.md pre-commit price guard as `app/`/`components/` — verify the guard's file-glob covers `infra/chatwoot/**` or add an equivalent manual check, since D-18 explicitly requires "no prices" in templates.

---

### `messages/*.json` (`ChatLauncher` namespace)

**Analog:** `messages/en.json` `"CookieBanner"` key block (line 666+) — PascalCase top-level component-namespace convention.

**Pattern:**
```json
"ChatLauncher": {
  "openAria": "Open chat",
  "closeAria": "Close chat menu",
  "chatOnSite": "Chat on site",
  "whatsapp": "WhatsApp",
  "telegram": "Telegram",
  "replyTimeHint": "We usually reply within a few minutes",
  "widgetError": "Live chat is unavailable right now — try WhatsApp or Telegram instead."
}
```
(Exact shape locked in 77-UI-SPEC.md.) Add real, non-stub translations to `ru.json`, `es.json`, `fr.json`, `ar.json`, `hi.json`, `zh.json` in-session — never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.

---

## Shared Patterns

### Consent-gated third-party loading
**Source:** `components/CookieBanner.tsx` (consent model) + `components/MetaPixel.tsx:87-88` (event-listener shape)
**Apply to:** `components/ChatWidgetLoader.tsx`
The click on "Chat on site" (D-02) is a *new*, third consent-trigger mechanism alongside CookieBanner's stored consent and MetaPixel's `prestigo:consent-granted` event — document this as a third pattern in the privacy-policy update (GDPR-02, deferred to Phase 82), not a reuse of the existing CustomEvent.

### Analytics on channel-select click
**Source:** `components/HeroWhatsApp.tsx` — `trackMetaEvent('Contact', { content_name: '...' })`
**Apply to:** all three `ChatLauncher` menu items, with `content_name` set per channel (e.g. `'Chat on site'`, `'WhatsApp Launcher'`, `'Telegram Launcher'`).

### RTL / logical properties
**Source:** `components/Nav.tsx:124`, `components/CookieBanner.tsx:421`
**Apply to:** `ChatLauncher.tsx` corner offset, menu open direction, `chatwootSettings.position` (`'left'` under `dir="rtl"`).

### CSP exact-origin extension, never wildcard
**Source:** `middleware.ts` `buildCsp`/`buildCspStatic`
**Apply to:** all four CSP directives touched by this phase (`script-src` via strict-dynamic inheritance, `connect-src` incl. `wss://`, `frame-src`, `img-src`) — always the exact `chat.rideprestigo.com` origin.

### Guard-first server route shape
**Source:** `app/api/driver/respond/route.ts`, and every `app/api/admin/**/route.ts`
**Apply to:** `app/api/chatwoot/identity/route.ts` — check the auth/session state before touching anything else, fail closed with a generic response rather than a descriptive error.

### Idempotent external-API sync
**Source:** `infra/vps/scripts/provision-monitors.sh`
**Apply to:** `infra/chatwoot/sync.mjs` — match-by-name/short_code, update-not-duplicate, `--dry-run`/`--status` mode, secrets read from env only for the invocation's lifetime.

## No Analog Found

None — every file in this phase's scope has at least a role-match analog in the existing codebase or in Phase 76's `infra/vps/` tree.

## Metadata

**Analog search scope:** `components/`, `app/api/`, `lib/`, `middleware.ts`, `tests/`, `infra/vps/`, `messages/en.json`
**Files scanned:** ~15 read directly (CookieBanner.tsx, HeroWhatsApp.tsx, MetaPixel.tsx excerpt, middleware.ts excerpt, lib/email.ts replyTo sites, driver/respond/route.ts, telegram/webhook/route.ts, infra-vps-isolation-guard.test.ts, provision-monitors.sh, chatwoot/compose.yml, infra/vps directory listing, messages/en.json excerpt)
**Pattern extraction date:** 2026-09-28
**All analog paths verified git-tracked** via `git ls-files` (see command output above); no gitignored mirror paths used.
