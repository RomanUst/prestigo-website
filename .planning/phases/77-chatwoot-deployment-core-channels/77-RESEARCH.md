# Phase 77: Chatwoot Deployment + Core Channels - Research

**Researched:** 2026-09-28
**Domain:** Chatwoot CE self-hosted channel configuration (email/IMAP, website widget SDK + HMAC identity, Telegram, canned responses/macros, automation rules, native reports) on top of an already-deployed Chatwoot v4.18.0-ce instance
**Confidence:** MEDIUM-HIGH (Chatwoot public API/SDK behavior is well documented via official docs; two load-bearing items — the `bookings@`/`booking@` address mismatch and Hindi widget-UI coverage — are `[ASSUMED]`/flagged for confirmation)

> **RESOLVED 2026-09-28 (owner):** the real, existing mailbox is `bookings@rideprestigo.com` (plural). Planning docs corrected. No `checkpoint:human-verify` needed for Pitfall 1 / A1 / Open Question 1 — D-10/D-11/D-12/D-14 target `bookings@`, D-11 still switches the customer-facing `replyTo` sites that use `roman@` to `bookings@rideprestigo.com`.


## Summary

Chatwoot CE v4.18.0-ce is already live at `chat.rideprestigo.com` (Phase 76). This phase is pure **channel configuration + integration code**, not infrastructure: connect two IMAP/SMTP mailboxes, add a Website Widget inbox with HMAC identity validation, add a Telegram inbox, and version canned responses/labels/automation rules as config-as-code synced via Chatwoot's REST API. The website widget is the only piece requiring site code changes (a click-to-load launcher, a server-side HMAC endpoint, and CSP additions); everything else is Chatwoot dashboard/API configuration plus one Node sync script and one audit of `lib/email.ts`'s `replyTo` fields.

Two facts materially change the plan's shape and must be resolved before or during Wave 0:

1. **`lib/email.ts` sends from `bookings@rideprestigo.com` (plural), but every planning document (REQUIREMENTS.md, ROADMAP.md, PROJECT.md, 77-CONTEXT.md, the Phase 76 isolation-guard test) says `booking@rideprestigo.com` (singular).** This is either a real mailbox-naming inconsistency the owner must resolve before D-11's `replyTo` change and D-10's inbox connection, or a documentation typo. Either way it is unverifiable from this environment (mailbox provisioning lives at Hostinger, outside any tool available here) and **must be a `checkpoint:human-verify` before Task 1 of the email-channel plan.**
2. **Chatwoot's native `reply_time` inbox field is a fixed 3-value enum** (`in_a_few_minutes` / `in_a_few_hours` / `in_a_day` → rendered as "Typically replies in a few minutes/hours/a day"), **not free text.** D-07's "we usually reply within N min" copy cannot be expressed as an arbitrary number through this field. The nearest native fit is `in_a_few_minutes`; an exact "N min" claim would require overriding the widget's own copy (pre-chat/greeting message), which is a different mechanism with different CSP/localization implications.

**Primary recommendation:** Treat this phase as three independent integration tracks (email, widget, Telegram) plus one shared config-as-code track (canned responses/labels/automation), all built against Chatwoot's stable, well-documented Application API and Public API — no new npm dependencies, no custom bot/relay code, no hand-rolled HMAC beyond Node's built-in `crypto`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email inbox ingestion/sending (IMAP/SMTP) | VPS / Chatwoot (Standard SMTP + IMAP channel) | — | Chatwoot's own Rails app polls IMAP and sends via each mailbox's SMTP; no site code involved (INBOX-01) |
| Website chat launcher (button, menu, click gate) | Browser / Client | Frontend Server (SSR shell only) | Must render with zero third-party requests before click (D-02); pure first-party React component mounted in `SiteChrome` |
| Chatwoot widget SDK load + render | Browser / Client (async, click-triggered) | — | `chatwootSDK.run()` injected only after click; iframe served by Chatwoot itself — never proxied through Next.js |
| HMAC `identifier_hash` computation | API / Backend (Next.js server) | — | Must never ship the HMAC secret to the client; a Next.js Route Handler reads the Supabase session and computes the hash server-side (D-05) |
| Visit-context custom attributes (URL, locale, UTM, /book selection) | Browser / Client | — | Read from `window.location`, `next-intl` locale, and the existing `lib/booking-store.ts` Zustand store; pushed via `$chatwoot.setConversationCustomAttributes()` after click only (D-06) |
| Telegram bot ↔ Chatwoot | VPS / Chatwoot (Telegram channel, auto webhook registration) | — | Owner pastes bot token into Chatwoot's inbox settings UI; Chatwoot registers the Telegram webhook itself — no site code, no new `app/api/telegram` route (D-15; the *existing* `app/api/telegram` route is the unrelated content-approval bot and must not be touched) |
| Canned responses / labels / automation rules | VPS / Chatwoot (Application API) | Config-as-code in repo (`infra/chatwoot/`) | Versioned JSON + an idempotent Node sync script run manually by Claude/owner (D-18); never called from the live site |
| Reports (volume, first-response, resolution time) | VPS / Chatwoot (native `/reports`/`/summary_reports` UI) | — | No custom stats code this phase (D-22); Phase 85 owns `/admin/stats` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chatwoot CE | v4.18.0-ce (pinned, already deployed) `[VERIFIED: infra/vps/chatwoot/compose.yml:6]` — `chatwoot/chatwoot:v4.18.0-ce` | Omnichannel inbox platform | Already the locked project decision (Phase 76); this phase only configures channels within it |
| Node `crypto` (built-in) | Node >=24 `[VERIFIED: package.json:6]` — `"node": ">=24.0.0"` | Server-side HMAC-SHA256 `identifier_hash` computation | Zero-dependency, matches CLAUDE.md's "no SDKs, thin fetch wrappers" convention (`lib/qstash.ts` precedent) |
| Native `fetch` (built-in, Node >=24) | — | Calling Chatwoot's Application API from the sync script and from the HMAC/identity route | No HTTP client dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Chatwoot Website Widget SDK (`sdk.js`, served by Chatwoot itself) | matches v4.18.0-ce | Client-side chat bubble, `window.chatwootSDK.run()`, `window.$chatwoot.setUser/setConversationCustomAttributes/setLocale` | Loaded via a `<script>` tag injected on click — never via `next/script` at page load (that would violate D-02/INBOX-02) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node `crypto.createHmac` | A signing npm package | Unnecessary dependency for a one-line `crypto.createHmac('sha256', secret).update(identifier).digest('hex')` call — rejected |
| Node script for template sync | A bash script calling `curl` | The existing `infra/vps/scripts/*.sh` convention is bash, but the sync script needs JSON construction/diffing against versioned files — a `.mjs` script (matching the root `generate-login-link.mjs`/`send-*.mjs` one-off-script convention, using built-in `fetch`) is a better fit and stays dependency-free |

**Installation:** No new `npm install` is required for this phase — HMAC uses Node's built-in `crypto`, the sync script uses built-in `fetch`, and the widget SDK is loaded from Chatwoot's own asset paths, not an npm package.

**Version verification:** N/A — no new packages recommended.

## Package Legitimacy Audit

**No external packages are introduced by this phase.** HMAC computation uses Node's built-in `crypto` module; API calls use built-in `fetch`; the widget loader is a `<script>` tag pointing at Chatwoot's own `chat.rideprestigo.com` asset paths (`/packs`, `/vite/assets`) `[CITED: developers.chatwoot.com/self-hosted/restricted-instances]`, not an npm-installed SDK. If the planner later decides to add a typed API-client wrapper, it should follow the existing zero-dependency `lib/qstash.ts` pattern rather than pull in a Chatwoot API client package (none of the community "chatwoot-api" npm packages are official; treat any such package as `[ASSUMED]`/`[SUS]` and route through this same gate before adding it).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Hostinger mail (existing, outside this repo) ───────────────────────────┐
│  info@rideprestigo.com  ──IMAP poll──┐                                                              │
│  booking@ or bookings@? ──IMAP poll──┤   (D-14: audit no other client/forward is wired to these)     │
└───────────────────────────────────────┼──────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────── VPS: chat.rideprestigo.com (Chatwoot v4.18.0-ce, Phase 76) ─────────────┐
│                                                                                                       │
│   Email inbox #1 (info@) ◄──IMAP/SMTP──►  ┐                                                          │
│   Email inbox #2 (booking@) ◄──IMAP/SMTP──┤                                                          │
│   Website Widget inbox (HMAC mandatory)   ├──►  Unified Chatwoot Inbox  ──► Automation rules         │
│   Telegram inbox (owner-created bot,      │        (agent: owner)            (label by channel/topic,│
│     webhook auto-registered by Chatwoot) ─┘                                   auto-assign to Bookings │
│                                                                                 or B2B team)           │
│                                                                                     │                 │
│                                                                                     ▼                 │
│                                                            Canned responses (7 locales × 5 topics)    │
│                                                            synced from infra/chatwoot/*.json          │
│                                                                                     │                 │
│                                                            Native Reports (/summary_reports/inbox)    │
│                                                            → volume, first-response, resolution time  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                    ▲                                    ▲
        │ SMTP replies (per-mailbox)         │ HTTPS widget script + REST calls   │ Telegram Bot API
        │                                    │ (async, click-triggered only)      │ webhook (Chatwoot→Telegram)
        │                                    │                                    │
┌───────┴────────────────────────────────────┴────────────────────────────────────┴───────────────────┐
│                              Vercel: rideprestigo.com (Next.js, this repo)                            │
│                                                                                                         │
│  lib/email.ts ──sends via Resend──► customer, replyTo: booking@ (D-11, 2 of 7 replyTo sites changed)  │
│                                                                                                         │
│  SiteChrome ──mounts──► ChatLauncher (pure first-party, 0 req)                                        │
│       │ click "Chat on site"                                                                          │
│       ▼                                                                                                │
│  1. inject <script src="https://chat.rideprestigo.com/packs/js/sdk.js">                               │
│  2. window.chatwootSDK.run({ websiteToken, baseUrl })                                                 │
│  3. GET /api/chatwoot/identity (Next.js Route Handler, server-side)                                   │
│         reads Supabase session → HMAC-SHA256(auth.users.id, secret) [never sent to client raw]         │
│  4. window.$chatwoot.setUser(userId, { email, name, phone, identifier_hash })  [signed-in only]        │
│  5. window.$chatwoot.setConversationCustomAttributes({ page_url, locale, utm_*, route, vehicle })      │
│                                                                                                         │
│  middleware.ts CSP: + script/connect/frame/img for chat.rideprestigo.com (reviewed diff,               │
│                       csp_baseline.json)                                                               │
│  tests/infra-vps-isolation-guard.test.ts: new VPS_ASYNC_ALLOWLIST entries for the click-triggered      │
│                       loader component and the identity route's CHATWOOT_ env var reference            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── api/
│   └── chatwoot/
│       └── identity/
│           └── route.ts        # GET, server-side HMAC identifier_hash (signed-in users only)
components/
├── ChatLauncher.tsx             # floating button + menu (Chat on site / WhatsApp / Telegram), RTL-aware
├── ChatWidgetLoader.tsx         # client component: injects sdk.js + calls setUser/setConversationCustomAttributes on click
infra/
└── chatwoot/
    ├── canned-responses/
    │   ├── time-change.json     # { en: "...", ru: "...", ... } per topic, no prices
    │   ├── vehicle-change.json
    │   ├── payment-help.json
    │   ├── post-trip-review.json
    │   └── login-help.json
    ├── labels.json               # ch-email, ch-web, ch-telegram, booking-new, booking-change, payment, b2b, complaint, lost-item, review, other
    ├── automation-rules.json     # channel-label + topic-keyword rules (D-20)
    ├── teams.json                # Bookings, B2B (D-21)
    └── sync.mjs                  # idempotent upsert script — reads CHATWOOT_API_TOKEN from env, never commits it
tests/
└── infra-vps-isolation-guard.test.ts   # extended VPS_ASYNC_ALLOWLIST (2 new entries)
```

### Pattern 1: Click-to-load third-party widget (INBOX-02, D-02)
**What:** Zero third-party script/cookie before an explicit click; the click IS the consent record.
**When to use:** Any third-party embed gated by GDPR/CWV concerns (this repo already has the analogous pattern in `CookieBanner.tsx`'s `prestigo:consent-granted` CustomEvent for Meta Pixel).
**Example:**
```typescript
// components/ChatWidgetLoader.tsx (client component)
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
// that runs on mount, and never via next/script (which would load at
// hydration regardless of strategy="lazyOnload" timing guarantees).
```
Source pattern confirmed via `[CITED: developers.chatwoot.com/self-hosted/restricted-instances]` (asset paths `/packs`, `/vite/assets`, `/brand-assets`, `/rails/active_storage` must all be publicly reachable — already true since Chatwoot is public per Phase 76 D-17).

### Pattern 2: Server-side HMAC identity (INBOX-03, D-05)
**What:** `identifier_hash` MUST be computed server-side with a secret never shipped to the client.
**When to use:** Any signed-in-customer widget identification.
**Example:**
```typescript
// app/api/chatwoot/identity/route.ts
import { createHmac } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ identified: false })

  const secret = process.env.CHATWOOT_WIDGET_HMAC_SECRET
  if (!secret) return NextResponse.json({ identified: false }) // fail closed, never throw a secret-shaped error to the client

  const identifierHash = createHmac('sha256', secret).update(user.id).digest('hex')
  return NextResponse.json({
    identified: true,
    identifier: user.id,
    identifierHash,
    email: user.email,
    // name/phone from customer_profiles, fetched in the same request
  })
}
```
`[CITED: developers.chatwoot.com — HMAC Verification and Identity Validation; hmac_token is retrieved from Inboxes → Settings → Configuration → Identity Validation after the Website inbox is created, and is "only exposed to admin users via API representations"]`. Store the retrieved token as `CHATWOOT_WIDGET_HMAC_SECRET` in Vercel env (server-only, **not** `NEXT_PUBLIC_`).

### Pattern 3: Config-as-code canned responses (D-18)
**What:** Canned responses versioned in git, upserted via API, never hand-typed into the dashboard as the source of truth.
**Example (create canned response):**
```bash
curl --request POST \
  --url https://chat.rideprestigo.com/api/v1/accounts/{account_id}/canned_responses \
  --header 'Content-Type: application/json' \
  --header 'api_access_token: <api-key>' \
  --data '{ "content": "Dobrý den, potvrzujeme změnu času vyzvednutí...", "short_code": "time-change-cs" }'
```
`[CITED: developers.chatwoot.com/api-reference/canned-responses/add-a-new-canned-response]`. `short_code` supports `{{contact.name}}`-style merge fields.

### Pattern 4: Automation rules for channel/topic labeling (D-20, OPS-02)
**Example (add a label by content keyword on `message_created`):**
```json
{
  "name": "Label payment-help topic (multilingual)",
  "event_name": "message_created",
  "active": true,
  "conditions": [
    { "attribute_key": "content", "filter_operator": "contains", "query_operator": "OR",
      "values": ["payment", "platba", "oplata", "paiement", "دفع", "भुगतान", "付款"] }
  ],
  "actions": [ { "action_name": "add_label", "action_params": ["payment"] } ]
}
```
`[CITED: developers.chatwoot.com/api-reference/automation-rule/add-a-new-automation-rule]`. Channel labels (`ch-email`/`ch-web`/`ch-telegram`) are better set via a rule on `conversation_created` keyed on `inbox_id` (or, more simply, each inbox can carry its channel label as a default via automation rather than keyword matching — verify the exact `conversation_created` condition set against the live account during planning, since the doc excerpt retrieved here covers `message_created` only).

### Anti-Patterns to Avoid
- **Loading `sdk.js` via `next/script` with any `strategy` at page load:** violates D-02/INBOX-02 even with `lazyOnload`, because the script still fetches before an explicit click.
- **Computing `identifier_hash` client-side or exposing the HMAC secret via `NEXT_PUBLIC_*`:** defeats the entire purpose of identity validation — an attacker could impersonate any `auth.users.id`.
- **Reusing the existing `app/api/telegram` route or `lib/content/telegram.ts` bot for the new customer-facing Telegram inbox:** explicitly forbidden by D-15 — different bot, different purpose, Chatwoot manages its own webhook.
- **Hand-typing canned responses into the Chatwoot dashboard as the source of truth:** violates D-18 (git is the source of truth; a restore from git must reproduce them).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram webhook registration | A custom Express/Next.js webhook route + Telegram Bot API polling code | Chatwoot's built-in Telegram channel — it registers `/webhooks/telegram/:bot_token` itself on inbox creation | `[CITED: developers.chatwoot.com/contributing-guide/telegram-channel-setup`; confirmed via search: "Chatwoot automatically registers a webhook callback URL in Telegram for your Bot"] — zero site code needed, matches D-15's "owner pastes token into Chatwoot UI" |
| Conversation volume / first-response / resolution-time stats | A custom `/admin/stats` panel querying Chatwoot's DB directly | Chatwoot's native `GET /api/v2/accounts/{id}/summary_reports/inbox` + dashboard Reports UI | `[CITED: developers.chatwoot.com/api-reference/reports/get-conversation-statistics-grouped-by-inbox]` — returns exactly `conversations_count`, `avg_resolution_time`, `avg_first_response_time` per inbox, matching INBOX-06/D-22 verbatim; Phase 85 will read this same API for `/admin/stats`, this phase just needs the owner-facing dashboard view |
| HMAC signature generation | A hand-rolled hex/base64 signer or an npm HMAC package | Node's built-in `crypto.createHmac('sha256', secret)` | One-liner, zero dependency, zero supply-chain surface |
| Email inbound/outbound plumbing for info@/booking@ | A custom IMAP poller / SMTP relay in this repo | Chatwoot's native "Standard SMTP + IMAP" email channel type | `[CITED: developers.chatwoot.com/self-hosted/configuration/features/email-channel/introduction]` — built for exactly this (custom-domain mailbox, username/password auth); Chatwoot's own Rails app handles polling and delivery, matching D-10 |

**Key insight:** Every core requirement in this phase (INBOX-01 through INBOX-06, OPS-01/02) maps to a Chatwoot-native feature already shipped in v4.18.0-ce. The only genuinely new code is the click-gated widget loader, the HMAC identity route, and the config-as-code sync script — everything else is dashboard/API configuration.

## Runtime State Inventory

Not applicable — this is a greenfield channel-configuration phase, not a rename/refactor/migration. (D-12's "remove info@/booking@ from phone Mail apps" is an owner-operational task, not a code/data migration, and is tracked below under Open Questions / Environment Availability rather than as a formal Runtime State Inventory.)

## Common Pitfalls

### Pitfall 1: `bookings@` vs `booking@` mailbox mismatch
**What goes wrong:** D-11 instructs changing `lib/email.ts`'s customer-facing `replyTo` to `booking@rideprestigo.com`, and D-10 instructs connecting `booking@rideprestigo.com` to Chatwoot — but the entire existing codebase sends FROM `bookings@rideprestigo.com` (plural), confirmed at 7 call sites across `lib/email.ts` and all 5 root `send-*.mjs` scripts `[VERIFIED: lib/email.ts:291,334,368,401,703,774; grep across send-*.mjs]`.
**Why it happens:** Planning documents (written before this research pass) consistently use the singular form; the actual production sender address is plural. One of the two is wrong, or two distinct real mailboxes exist.
**How to avoid:** **Do not silently pick one.** Surface this to the owner as a `checkpoint:human-verify` at the start of the email-channel plan: confirm the actual Hostinger mailbox name(s), which the current site already sends from (`bookings@`), and which one D-10/D-11 should target. If `booking@` (singular) does not exist as a real mailbox, either provision it or correct all planning docs + `replyTo` targets to `bookings@`.
**Warning signs:** A Chatwoot email inbox connected to a mailbox that never receives the site's own outbound mail's replies (silent conversation gap that looks like "no one ever replies").

### Pitfall 2: `reply_time` is an enum, not free text
**What goes wrong:** Building a custom "we usually reply within N min" string and trying to pass it as `reply_time` in the inbox API fails silently or is coerced to the nearest enum value.
**Why it happens:** D-07 was written assuming Chatwoot supports an arbitrary number; the actual field only accepts `in_a_few_minutes` / `in_a_few_hours` / `in_a_day` `[CITED: developers.chatwoot.com/api-reference/inboxes/update-inbox`; GitHub issue #11991 confirms this is a known, still-open feature request to make the text editable]`.
**How to avoid:** Use `reply_time: "in_a_few_minutes"` for the native "Typically replies in a few minutes" copy. If the owner insists on an exact number, that requires overriding the widget's greeting/pre-chat copy instead (a separate mechanism, different localization work) — flag this at the Claude's-Discretion checkpoint rather than assuming the N-minute literal will render.
**Warning signs:** API call to set `reply_time` to a custom string returns a validation error or is silently dropped.

### Pitfall 3: Hindi widget-chrome coverage is unverified
**What goes wrong:** D-08 requires the widget `locale` set from the site locale across all 7 locales (en/ru/es/fr/ar/hi/zh). Chatwoot's documented UI-translation language list `[CITED: chatwoot.com/hc/user-guide/articles/1677695546-languages-supported-in-chatwoot`, cross-checked via WebSearch]` explicitly enumerates ar, es, fr, ru, zh-CN/zh-TW — **Hindi (hi) was not present in the retrieved list.** If true, calling `setLocale('hi')` would leave Chatwoot's own chrome (Send button, "Type a message" placeholder, etc.) in English while admin-authored content (greeting, canned responses) can still be fully Hindi.
**Why it happens:** Chatwoot's widget i18n is community-translated (Crowdin) and coverage varies by release; the site's locale set (73/74/75) was chosen independently of Chatwoot's translation coverage.
**How to avoid:** Verify against the live v4.18.0-ce instance during planning/execution (`setLocale('hi')` in a test session, inspect rendered chrome strings) rather than trusting the doc list alone — the list may be stale relative to v4.18.0-ce. If Hindi chrome is genuinely unsupported, document it as an accepted gap (matches the project's existing accepted "hi is an accepted Stripe-locale exception" precedent from Phase 75).
**Warning signs:** English "Send"/placeholder text visible on the `/hi` site with `dir` and greeting correctly in Hindi.

### Pitfall 4: CSP `strict-dynamic` + Chatwoot's injected script
**What goes wrong:** The site's dynamic-route CSP uses `script-src 'nonce-{nonce}' 'strict-dynamic' https:` (`middleware.ts`). A `<script>` tag injected via `document.createElement` at click time, with no `nonce` attribute set, will be blocked under a nonce+strict-dynamic CSP unless it inherits trust from an already-nonce'd script that injected it.
**Why it happens:** `strict-dynamic` allows a script to load further scripts it injects, but only if the injecting script itself carried a valid nonce. The launcher component's own bundle chunk is loaded by Next.js's own nonce'd script tree, so scripts it injects via DOM APIs **do** inherit trust — but this must be verified empirically (not assumed) because React's hydration script injection semantics under `strict-dynamic` have known edge cases across browsers.
**How to avoid:** After implementing the loader, verify in a real browser (not just curl-based CSP header diffing) that the injected `sdk.js` actually executes with no CSP console violation, on both the nonce'd (`/admin`, `/driver` — not relevant here, launcher excludes these) and the `unsafe-inline` static/`/book` CSP variants. D-09 already calls for this as an explicit UAT gate — this pitfall explains *why* it's non-trivial, not just a formality.
**Warning signs:** Browser console CSP violation naming `script-src-elem` when clicking "Chat on site".

### Pitfall 5: Isolation guard test needs deliberate new allowlist entries
**What goes wrong:** `tests/infra-vps-isolation-guard.test.ts` fails the build if `chat.rideprestigo.com` or a `CHATWOOT_`-prefixed env var appears anywhere under `app/`, `components/`, `lib/`, `i18n/`, or `middleware.ts` — which this phase's widget loader and HMAC route both necessarily do.
**Why it happens:** The guard is intentionally strict by default; Phase 76's own header comment says "later phases (77 widget, 81/82 outbox) add entries deliberately, never as a blanket exemption" `[VERIFIED: tests/infra-vps-isolation-guard.test.ts:1-16, 55-56]` — quoting the doc comment verbatim: *"An entry is permitted only when the file never runs on a synchronous user request path... Its reason must name the async mechanism that makes it safe (e.g. 'QStash-invoked outbox worker route', 'click-to-load consent-gated client widget loader')."*
**How to avoid:** Add exactly two `VPS_ASYNC_ALLOWLIST` entries: (1) the widget loader/launcher component, reason "click-to-load consent-gated client widget loader — never runs on page render"; (2) `app/api/chatwoot/identity/route.ts`, reason "on-demand identity endpoint invoked only after widget click by an already-authenticated user session, not a synchronous page-render path." Do **not** widen the allowlist beyond these two files.
**Warning signs:** `npx vitest run tests/infra-vps-isolation-guard.test.ts` fails after adding the widget/HMAC code with no allowlist update.

### Pitfall 6: Outbound SMTP from Hostinger mailboxes needs no VPS firewall change, but IMAP/SMTP credentials are a new secret class
**What goes wrong:** Assuming the VPS's `ufw` rules (22/80/443 only, per Phase 76 D-14) block Chatwoot's *outbound* IMAP/SMTP polling to Hostinger's mail servers.
**Why it happens:** `ufw` inbound rules do not restrict outbound connections initiated from inside the VPS by default; Chatwoot's Rails container reaches out to Hostinger's IMAP (993) and SMTP (587/465) as a client, which is unaffected by the inbound-only firewall policy.
**How to avoid:** No VPS firewall change is needed for INBOX-01. The real new-secret-handling work is storing the mailbox IMAP/SMTP credentials (a new secret class, distinct from `SECRET_KEY_BASE`/`POSTGRES_PASSWORD`/etc. already in `infra/vps/env/chatwoot.env.example`) — these are entered via the Chatwoot inbox-creation UI/API, not committed to git, consistent with the existing `.env*` secret-scan convention.
**Warning signs:** None expected; flagged only to prevent an unnecessary `ufw allow` change.

## Code Examples

### Widget locale + branding settings (D-08)
```javascript
// Set BEFORE injecting sdk.js — chatwootSettings must exist when sdk.js executes.
window.chatwootSettings = {
  position: isRtl ? 'left' : 'right',   // D-03 RTL mirroring
  locale: siteLocale,                    // 'en' | 'ru' | 'es' | 'fr' | 'ar' | 'hi' | 'zh'
  useBrowserLanguage: false,             // D-08: always follow the PAGE locale, not the browser
  type: 'standard',
  darkMode: 'auto', // optional — matches navy brand background if desired
}
```
`[CITED: chatwoot.com widget-customization docs — window.chatwootSettings supports position, locale, useBrowserLanguage, type, darkMode]`

### Reports API for INBOX-06/D-22 verification
```bash
curl --request GET \
  --url 'https://chat.rideprestigo.com/api/v2/accounts/{account_id}/summary_reports/inbox?since=2026-09-01&until=2026-09-28' \
  --header 'api_access_token: <api-key>'
# Response: [{ id, conversations_count, resolved_conversations_count,
#              avg_resolution_time, avg_first_response_time, avg_reply_time }, ...]
```
`[CITED: developers.chatwoot.com/api-reference/reports/get-conversation-statistics-grouped-by-inbox]`

### Contact identity attach via Public API (fallback path / verification)
```bash
curl --request POST \
  --url https://chat.rideprestigo.com/public/api/v1/inboxes/{inbox_identifier}/contacts \
  --header 'Content-Type: application/json' \
  --data '{ "identifier": "<auth.users.id>", "identifier_hash": "<server-computed HMAC>", "email": "...", "name": "..." }'
```
`[CITED: developers.chatwoot.com/api-reference/contacts-api/create-a-contact]` — useful for a Wave 0 smoke test of the HMAC computation independent of the widget SDK itself.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Widget assets served only from `/packs` (Webpack) | Widget UI bundles served from `/vite/assets`; `/packs` still serves the SDK loader (`sdk.js`) | Chatwoot's Webpack→Vite migration (pre-v4.x) | If any older tutorial/blog post is consulted during execution, its CSP allowlist advice covering only `/packs` is incomplete — the CSP `connect-src`/`script-src`/`img-src`/`frame-src` diff must account for both paths plus `/brand-assets` and `/rails/active_storage` `[CITED: developers.chatwoot.com/self-hosted/restricted-instances]` |
| Manual UptimeRobot v2 API calls (used in Phase 76) | UptimeRobot v3 API for monitor creation (v2 free tier now gates creation) | Discovered live during Phase 76 (2026-09-28) `[VERIFIED: STATE.md Phase 76 entries]` | Not directly relevant to Phase 77's scope, but the same "verify against the live API, not training data" discipline applies to Chatwoot's own API — this research used Context7-sourced docs current as of the query date, not memorized training data |

**Deprecated/outdated:** None identified specific to the channel features this phase touches (email/widget/Telegram/canned-responses/automation/reports are all stable, non-deprecated Chatwoot CE features).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The real Hostinger mailbox for the second service inbox is `booking@rideprestigo.com` (singular, matching REQUIREMENTS.md/CONTEXT.md) rather than `bookings@rideprestigo.com` (plural, matching every current `lib/email.ts`/`send-*.mjs` call site) | Pitfall 1 / Email channel plan | Connecting the wrong mailbox to Chatwoot means customer replies to real transactional emails never reach Chatwoot — the core INBOX-01 success criterion silently fails despite the inbox showing "connected" |
| A2 | Chatwoot v4.18.0-ce's widget UI translation includes Hindi (`hi`) chrome strings | Pitfall 3 | D-08's "greeting localized to the page locale" partially fails for `/hi` visitors (English Send button, Hindi greeting) — cosmetic but visible; low severity, does not block the phase |
| A3 | The launcher's injected `<script>` tag inherits CSP trust under the site's `nonce + strict-dynamic` policy on dynamic routes without needing its own nonce | Pitfall 4 | If false, the widget fails to load specifically on `/book`, `/login`, `/account` etc. (any `isDynamicPath` route) even though it works on static marketing pages — must be empirically verified per D-09's own UAT gate, not assumed from this research |
| A4 | `reply_time: "in_a_few_minutes"` is an acceptable substitute for D-07's "N min" copy, absent a custom text override | Pitfall 2 | If the owner insists on exact wording, the plan under-scopes the greeting-message override work needed |

**If this table is empty:** N/A — see rows above; all four require explicit confirmation (A1 as a blocking `checkpoint:human-verify`, A2–A4 as UAT-gate verifications already implied by D-08/D-09/D-07's Claude's-Discretion wording).

## Open Questions

1. **Is the real target mailbox `booking@` or `bookings@`?**
   - What we know: every planning doc says `booking@`; every line of shipped code sends from `bookings@`.
   - What's unclear: which is the actual Hostinger-provisioned mailbox (or whether both exist).
   - Recommendation: `checkpoint:human-verify` as Task 1 of the email-channel plan, before touching `lib/email.ts`'s `replyTo` values or connecting any inbox in Chatwoot.

2. **Does Chatwoot v4.18.0-ce's widget render acceptable Hindi chrome?**
   - What we know: the public language-support doc list (possibly stale) does not include `hi`.
   - What's unclear: whether the currently-deployed version has since added it, or whether English fallback chrome is acceptable to the owner as a known gap.
   - Recommendation: a 5-minute manual check (`setLocale('hi')` against the live `chat.rideprestigo.com` instance) during Wave 0, documented either way.

3. **Exact `conversation_created`-event condition set for per-inbox channel labeling (D-20).**
   - What we know: `message_created` automation rules with `content`-`contains` conditions are fully documented and confirmed.
   - What's unclear: the retrieved documentation excerpt did not surface the exact attribute_key options available on `conversation_created` (e.g., `inbox_id` equality) — needed to auto-label every new conversation by channel without keyword matching.
   - Recommendation: pull the automation-rule condition reference for `conversation_created` specifically during plan execution (one more Context7/docs query), or verify empirically by creating one rule per inbox and observing available condition fields in the Chatwoot dashboard's rule builder.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chatwoot instance at `chat.rideprestigo.com` | All of INBOX-01..06, OPS-01/02 | ✓ | v4.18.0-ce | — (Phase 76 dependency, already met) |
| Chatwoot Application API token (`api_access_token`) | Sync script, HMAC secret retrieval, reports verification | Unknown — must be generated by the owner logging into Chatwoot (agent profile → API access token) | — | Owner action required before Wave 0 of the config-as-code track; not obtainable from this session |
| Hostinger IMAP/SMTP credentials for info@ and the disputed booking(s)@ mailbox | INBOX-01 | Unknown — owner-held, mailbox may need an app-specific password generated in Hostinger's mail panel | — | Owner action required; also resolves Open Question 1 |
| Telegram bot token (new bot, via @BotFather) | INBOX-05 | Not yet created (per D-15, owner creates it) | — | Owner action; Claude prepares name/avatar/description text only |
| `CHATWOOT_WIDGET_HMAC_SECRET` (Vercel env, server-only) | INBOX-03 | Not yet provisioned — generated by Chatwoot itself after the Website inbox is created (Settings → Configuration → Identity Validation) | — | Sequencing dependency: Website inbox must exist in Chatwoot before this secret can be set in Vercel |

**Missing dependencies with no fallback:**
- Owner-held credentials (Chatwoot API token, Hostinger mail credentials, Telegram bot token) — none of these can be obtained or worked around from this environment; they gate the start of each channel's implementation track.

**Missing dependencies with fallback:**
- None — all four items above are hard blockers for their respective tracks, but the tracks (email / widget / Telegram / canned-responses) are independent of each other, so a delay in one owner-provided credential does not block starting the others.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `[VERIFIED: .claude/skills/verify/SKILL.md]` |
| Config file | existing repo-root Vitest config (unchanged by this phase) |
| Quick run command | `npx vitest run <changed test files>` |
| Full suite command | `npx vitest run` (~90s baseline, all pass) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INBOX-01 | 2 of 7 `replyTo` sites in `lib/email.ts` changed to the customer-facing mailbox; 5 untouched (internal/visitor's-own) | unit | `npx vitest run tests/email.test.ts` (extend existing suite with replyTo assertions) | ❌ Wave 0 — add assertions to whatever existing email test file covers `sendClientConfirmation`/`sendRoundTripClientConfirmation` |
| INBOX-02/INBOX-04 | Launcher renders with zero third-party network requests pre-click; CSP diff reviewed | integration (Playwright/manual network-tab) + CSP baseline diff | `node scripts/qa/csp-baseline-check.mjs` (existing baseline tool, if present) + manual network panel check | ❌ Wave 0 — confirm whether `scripts/qa/baselines/csp_baseline.json` has a companion checker script; if not, add one entry-diff assertion |
| INBOX-03 | HMAC `identifier_hash` computed server-side matches Chatwoot's expected value for a known secret/identifier pair | unit | `npx vitest run tests/chatwoot-identity.test.ts` | ❌ Wave 0 — new file, test `createHmac('sha256', secret).update(id).digest('hex')` against a fixed known-good vector |
| INBOX-05 | Isolation guard still green after adding the two allowlist entries | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ existing, extend `VPS_ASYNC_ALLOWLIST` |
| OPS-01/OPS-02 | Canned-response/label/automation JSON files are valid and the sync script is idempotent (dry-run diff produces zero changes on a second run) | integration (manual, against live Chatwoot API) | `node infra/chatwoot/sync.mjs --dry-run` (new script; must support a dry-run/diff mode per D-18 "idempotent") | ❌ Wave 0 — new script, no automated CI coverage possible without live Chatwoot credentials; treat as `manual-only` with justification: requires a live Chatwoot Application API token not available in CI |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run` on touched test files
- **Per wave merge:** full suite `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`; plus a live browser check of the widget click flow on home/route/`/book` (CWV/CSP gate, D-09) since that cannot be captured by Vitest

### Wave 0 Gaps
- [ ] `tests/chatwoot-identity.test.ts` — HMAC computation unit test (INBOX-03)
- [ ] Extend the existing `lib/email.ts` test coverage with `replyTo` assertions for the 2 changed + 5 unchanged sites (INBOX-01/D-11)
- [ ] Determine whether a CSP-baseline-diff script already exists under `scripts/qa/` before assuming one must be written from scratch — grep for `csp_baseline` consumers during planning
- [ ] `infra/chatwoot/sync.mjs --dry-run` mode — needed before the first live run so the config-as-code track has a safety check

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes (indirectly) | HMAC identity relies on the existing Supabase session (`getUser()`); no new auth mechanism introduced |
| V3 Session Management | no | No new session/cookie introduced by this phase |
| V4 Access Control | yes | `/api/chatwoot/identity` must only return identity data for the currently-authenticated session's own user — never accept a client-supplied `user_id` parameter |
| V5 Input Validation | yes | Visit-context custom attributes (UTM params, referrer, page URL) come from client-controlled `window.location`/query string — sanitize/length-cap before sending to `setConversationCustomAttributes` to prevent injection of oversized or malformed values into Chatwoot's conversation record |
| V6 Cryptography | yes | HMAC-SHA256 via Node's built-in `crypto.createHmac` — never hand-roll; secret stored server-side only (`CHATWOOT_WIDGET_HMAC_SECRET`, not `NEXT_PUBLIC_*`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client-side HMAC secret leakage (secret shipped via `NEXT_PUBLIC_*` or inlined in a client bundle) | Spoofing | Compute `identifier_hash` only in a Route Handler (`app/api/chatwoot/identity/route.ts`), never in a client component; verify via bundle inspection that the secret string never appears in any `_next/static` chunk |
| Identity endpoint accepting an arbitrary `user_id` to compute a hash for (impersonation) | Spoofing / Elevation of Privilege | The Route Handler must derive the identity exclusively from the Supabase session (`supabase.auth.getUser()`), ignoring any client-supplied identifier |
| CSP relaxation for `chat.rideprestigo.com` widening the attack surface (e.g. adding `*.rideprestigo.com` instead of the exact subdomain) | Tampering | Add only the exact `chat.rideprestigo.com` origin to each CSP directive (`script-src`, `connect-src` incl. `wss://`, `frame-src`, `img-src`) — never a wildcard subdomain — and keep the reviewed diff scoped per D-09 |
| Visit-context custom attributes used as an unbounded free-text injection point into Chatwoot conversation records | Tampering | Cap length and strip control characters on UTM/referrer/page-URL values before sending; Chatwoot itself stores these as JSON custom attributes (not executed), so this is a data-hygiene concern rather than XSS, but still worth bounding |
| Isolation-guard allowlist creep (widening beyond the 2 deliberate entries) | Tampering / repo-integrity | Code review must reject any allowlist addition beyond the widget loader and identity route without an equally explicit "async mechanism" justification, per the guard's own doc comment |

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/developers_chatwoot` — email channel configuration (SMTP/IMAP, ingress providers, getmail6 IMAP retrieval), widget asset paths, inbox creation API (`hmac_mandatory`, `reply_time`), contacts API (`identifier_hash`), automation rules API, canned responses API, reports API (`/summary_reports/inbox`, `/reports/summary`)
- `infra/vps/chatwoot/compose.yml` — pinned Chatwoot version `v4.18.0-ce`, network/volume layout
- `infra/vps/env/chatwoot.env.example` — confirmed `FRONTEND_URL=https://chat.rideprestigo.com`, system mail via Resend SMTP (unrelated to customer-facing channels)
- `tests/infra-vps-isolation-guard.test.ts` — full guard logic and allowlist doc-comment requirements read directly
- `middleware.ts`, `lib/email.ts`, `components/CookieBanner.tsx`, `components/HeroWhatsApp.tsx` — read directly for CSP structure, replyTo sites, consent pattern, WhatsApp link pattern

### Secondary (MEDIUM confidence)
- WebSearch cross-checked against chatwoot.com/hc/user-guide and developers.chatwoot.com for: `setUser`/HMAC flow narrative, `window.chatwootSettings` options, RTL/language support list, Telegram webhook auto-registration, `reply_time` enum confirmation (cross-referenced against a live GitHub issue #11991 confirming it is still a fixed enum as of the issue's filing)

### Tertiary (LOW confidence)
- The Hindi widget-locale-support claim (Pitfall 3 / A2) rests on a possibly-stale public doc list, not a live test against `chat.rideprestigo.com` — flagged for verification, not treated as fact

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, Chatwoot API/SDK behavior directly documented via Context7 official-docs source
- Architecture: HIGH — every integration point traced to either a read source file in this repo or an official Chatwoot doc page
- Pitfalls: MEDIUM-HIGH — Pitfalls 1, 2, 4, 5, 6 are grounded in directly-read repo code or directly-cited docs; Pitfall 3 (Hindi) is explicitly flagged LOW/unverified

**Research date:** 2026-09-28
**Valid until:** ~30 days (Chatwoot CE is a stable, slow-moving API surface at the version already pinned; re-verify if the pinned tag changes before this phase executes)
