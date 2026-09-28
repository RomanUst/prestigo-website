# Phase 77: Chatwoot Deployment + Core Channels - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Chatwoot (already running at `chat.rideprestigo.com` from Phase 76) becomes the single inbox for:
- service email: info@ and booking@
- a consent-safe, CWV-safe website chat widget, with signed-in customers identified via HMAC
- a new Telegram bot

Chatwoot native reports cover volume, first-response and resolution time per channel. Chatwoot canned responses and automation replace the manual `send-*.mjs` ops scripts. Requirements: INBOX-01..06, OPS-01, OPS-02.

NOT in this phase:
- WhatsApp Cloud API (Phase 78)
- IG/FB (Phase 79)
- site↔Chatwoot↔CRM sync, contact dedup and backfill (Phase 82)
- conversation→lead webhooks (Phase 83)
- the bookings sidebar panel (Phase 84)
- stats pages (Phase 85)

</domain>

<decisions>
## Implementation Decisions

### Website chat button (INBOX-02/03/04)
- **D-01:** One **floating launcher button**, brand-styled. Clicking opens a small menu:
  - **"Chat on site"** (Chatwoot widget)
  - **WhatsApp** (existing `wa.me/420725986855` link)
  - **Telegram** (new bot link)

  Existing inline WhatsApp links (`components/HeroWhatsApp.tsx`, Footer) stay as they are. The launcher adds a unified entry point and does not replace them.
- **D-02:** The Chatwoot SDK/script, iframe and cookies load **only after the visitor clicks "Chat on site"**. That click is the consent, because it is an explicit request for a functional service, and no separate CookieBanner category is required. Before the click, the launcher is pure first-party markup/CSS with zero third-party requests. Opening the WhatsApp or Telegram menu items also loads nothing third-party. Whether the click writes a consent/audit record is Claude's discretion; at minimum it is documented for the Phase 82 privacy-policy update (GDPR-02).
- **D-03:** Show the launcher on **all public pages in all 7 locales, including /book and /account**. Exclude `/admin/**` and `/driver/**`. RTL-correct in Arabic: the launcher mirrors to the opposite corner, the menu uses logical properties, and the widget position follows `dir`.
- **D-04:** **Pre-chat form: email required, name optional.** Signed-in customers skip it because they are already identified. Goal from the owner: *never lose a lead*. An anonymous visitor who closes the tab still gets the reply by email.
- **D-05:** **Identity for signed-in customers (INBOX-03):**
  - Identifier: the Supabase `auth.users.id`.
  - Attributes passed: email, name, phone, current site locale.
  - `identifier_hash` is the HMAC-SHA256 computed **server-side** with the Chatwoot inbox HMAC secret, which lives in the Vercel env and is never shipped to the client.
  - No booking data is passed here; that is Phase 84.
- **D-06:** **Visit context goes into conversation custom attributes, after the click only:**
  - current page URL
  - locale
  - UTM params / referrer (first-touch where available)
  - the selected route/vehicle, if the visitor is inside `/book`

  Purpose: operator context now, and data for Phase 85 statistics. This follows the owner's goal to collect as much information as possible for analytics.
- **D-07:** **Always online, 24/7.** No business-hours offline mode. The widget shows an expected reply time ("we usually reply within N min"; Claude picks N with the owner at setup). Email capture (D-04) covers replies when the operator can't answer live.
- **D-08:** **Widget branded:**
  - navy `#0F1D2C` widget color with gold accents
  - Prestigo avatar/logo
  - greeting localized to the page locale, with the widget `locale` set from the site locale
  - launcher/facade in the same brand style (Fraunces/Inter)
- **D-09:** CSP additions (script/connect incl. `wss://chat.rideprestigo.com`, frame, img) go into `middleware.ts` + `scripts/qa/baselines/csp_baseline.json` as a **reviewed diff**. No LCP/INP regression on home, route and /book pages is an explicit UAT gate: measure before and after. The Phase 76 guard test (`tests/infra-vps-isolation-guard.test.ts`) must stay green. The widget is loaded client-side on click, never by server code.

### Email channel (INBOX-01)
- **D-10:** **Two separate Chatwoot email inboxes**, one for info@ and one for booking@ (IMAP in, SMTP out through each mailbox's own Hostinger SMTP). A reply always leaves from the address the customer wrote to. Reports are per inbox.
- **D-11:** **Customer-facing transactional emails get `replyTo: booking@rideprestigo.com`**, so customer replies land in Chatwoot. Today `lib/email.ts` sets `roman@` on several calls.
  - Covered: booking confirmation, payment, reminders and other emails sent to customers.
  - Untouched: internal/manager notifications, and the contact-form email whose `replyTo` is the visitor's own address.
  - `roman@` stays the sales mailbox, reserved for EspoCRM (Phase 80).
  - Planner audits all 7 `replyTo` sites and classifies each as customer-facing or internal.
- **D-12:** **Chatwoot is the only working client for info@/booking@.** Remove the mailboxes from phone Mail/other apps; the operator uses the Chatwoot web/mobile app. **Hostinger webmail stays as an emergency-only fallback.** Runbook rule:
  - Never reply or delete from webmail in normal operation.
  - Webmail is used only while the VPS/Chatwoot is down (the Phase 76 alert fires).
  - Rationale: a webmail reply is invisible in the Chatwoot thread, which causes double replies and broken reply-time stats. Deleting before Chatwoot polls loses the mail.
- **D-13:** **No history import.** Chatwoot picks up mail from the connection date forward. Old mail stays in the mailbox archive. Past customers reach contacts via the Phase 82 backfill.
- **D-14:** Before connecting, audit that info@/booking@ are not wired to anything else: forwards, other IMAP clients, the future EspoCRM. The rule is one mailbox, one system.

### Telegram (INBOX-05)
- **D-15:** A **new dedicated customer-facing Telegram bot** for Chatwoot.
  - The owner creates it in @BotFather and enters the token directly into Chatwoot's inbox settings. The token is never committed and never pasted in chat.
  - Claude prepares the name, username suggestion, description, avatar and localized /start text in brand voice.
  - Do NOT reuse the content-approval bot (`lib/content/telegram.ts`) or the Phase 76 alert bot.
- **D-16:** The Telegram link is exposed only in the floating launcher menu (D-01) for now. It does not go in the footer or emails in this phase.

### Canned responses, labels, automation (OPS-01/02)
- **D-17:** Canned responses in **all 7 site locales** (en/ru/es/fr/ar/hi/zh). Naming: `<topic>-<locale>`, e.g. `time-change-ru`, so `/` search in the composer finds them. Topics come from the root scripts:
  - time change
  - vehicle change
  - payment help
  - post-trip review request
  - login help

  One-off customer-specific scripts (`send-invoice-tltgo.mjs`, `send-maxime-traveltime-reply.mjs`) are generalized only if a reusable template emerges. Translations are done in-session (i18n GH workflow disabled), native-quality, not stubs.
- **D-18:** **Templates are versioned in the repo** (e.g. under `infra/chatwoot/`), with an idempotent sync script that upserts them into Chatwoot via its API. The script is run by Claude/owner, not by the site at runtime.
  - Templates contain **no prices**: placeholders only, and the existing price guard applies to the template source.
  - Brand voice follows the copy rules: plain words, no Uber comparisons.
  - They survive a restore from git.
- **D-19:** **Links in templates are inserted by the operator.**
  - Login help points to the site's "forgot password" flow.
  - Payment help has a placeholder where the operator pastes the payment link from `/admin`.
  - No site endpoint or Chatwoot→site call in this phase. One-click link generation from Chatwoot belongs to Phase 84.
- **D-20:** **Labels:**
  - Channel: `ch-email`, `ch-web`, `ch-telegram` (extend with `ch-whatsapp` etc. in Phases 78/79).
  - Topic: `booking-new`, `booking-change`, `payment`, `b2b`, `complaint`, `lost-item`, `review`, `other`.

  Chatwoot automation sets the channel label on conversation creation and a topic label by keyword rules (multilingual keywords where practical). The operator can correct the topic manually. Label and automation definitions are also versioned and synced like D-18.
- **D-21:** **Assignment:** every new conversation auto-assigns to the owner, who is the single operator today. **Teams `Bookings` and `B2B` are created now**, with `b2b`-labelled conversations routed to the B2B team, so onboarding a 2nd operator is a membership change, not a reconfiguration. Full roles/ACL runbook stays CRM-05 (Phase 80).

### Reports (INBOX-06)
- **D-22:** Use Chatwoot's native reports: per-inbox/per-channel volume, first-response time and resolution time. No custom stats in this phase (Phase 85). Verification: the owner sees the per-channel numbers for real test conversations on each channel.

### Claude's Discretion
- Launcher visual details (icon, exact corner offsets, animation, mobile size), within the navy/gold brand and without an LCP/CLS impact.
- Whether the chat-open click also writes a consent log entry.
- Expected reply time "N min" copy (confirm the number with the owner at setup).
- Exact keyword rules for topic auto-labelling.
- Directory layout for the Chatwoot config-as-code (`infra/chatwoot/` or under `infra/vps/chatwoot/`) and sync-script design.
- How to measure CWV before and after (lab Lighthouse vs field data), as long as home, route and /book are covered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §"Phase 77: Chatwoot Deployment + Core Channels": goal and 6 success criteria
- `.planning/REQUIREMENTS.md`: INBOX-01..06, OPS-01, OPS-02, and the Out of Scope table (no dual mailbox, no widget script on page load, CRM/Chatwoot never write bookings)
- `.planning/PROJECT.md`: v4.0 constraints (VPS independence, CSP/consent, secrets) and Key Decisions (separate mailboxes, Supabase source of truth)

### Prior phase (infrastructure this builds on)
- `.planning/phases/76-vps-infrastructure/76-CONTEXT.md`: D-16 pinned Chatwoot version, D-17 signup disabled/2FA, D-18 system mail via Resend SMTP (customer replies use the mailbox SMTP), D-19 VPS isolation guard
- `infra/vps/chatwoot/compose.yml`: deployed Chatwoot stack (version, env)
- `infra/vps/runbooks/upgrade.md`, `infra/vps/runbooks/monitoring.md`: runbooks to extend (webmail emergency rule, template sync)
- `tests/infra-vps-isolation-guard.test.ts`: must stay green; no synchronous site code path may call chat.rideprestigo.com

### Research
- `.planning/research/SUMMARY.md`: widget CWV/consent pitfall (#4), Chatwoot version notes
- `.planning/research/PITFALLS.md`: widget/CSP/email dual-access pitfalls
- `.planning/research/STACK.md`, `.planning/research/FEATURES.md`: Chatwoot channel capabilities

### Site code touched
- `middleware.ts`: CSP builder (nonce + strict-dynamic) and matcher
- `scripts/qa/baselines/csp_baseline.json`: CSP baseline, updated as a reviewed diff
- `components/CookieBanner.tsx`: consent storage (`prestigo_consent_v2`) and `prestigo:consent-granted` event, for consistency and the privacy record
- `components/SiteChrome.tsx`: global chrome and the per-locale font/dir, where the launcher mounts
- `components/HeroWhatsApp.tsx`, `components/Footer.tsx`: existing WhatsApp entry points (keep)
- `lib/email.ts`: 7 `replyTo` sites to audit (D-11)
- `send-time-change-email.mjs`, `send-vehicle-change-email.mjs`, `send-payment-help-email.mjs`, `send-young-posttrip-review.mjs`, `generate-login-link.mjs` (repo root, untracked): source texts for canned responses
- `messages/*.json`: launcher/menu strings need real translations in all 7 locales

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/CookieBanner.tsx` consent model plus `prestigo:consent-granted` CustomEvent: the pattern for consent-aware third-party loading (MetaPixel listens to it).
- `components/HeroWhatsApp.tsx`: WhatsApp deep link and `trackMetaEvent('Contact', …)`. The launcher menu should fire the same analytics events per channel.
- Supabase server client (`lib/supabase/server.ts`): read the signed-in user to compute the HMAC identity server-side.
- `interpolateBidi()` / `<bdi>`, and logical-property Tailwind from Phase 73: RTL-safe launcher UI.

### Established Patterns
- CSP is a nonce + `strict-dynamic` per-request header in `middleware.ts`, and every change is diffed against `csp_baseline.json`.
- Middleware matcher must exclude static/metadata extensions (project memory: next-intl 404s).
- New EN strings need real translations in all locales. Never run `i18n-translate --dry-run` on the tree.
- No hard-coded `€` in `app/` or `components/` (pre-commit enforces this). No prices in templates either.
- Secrets only in env (Vercel + VPS). The pre-commit secret scan applies.

### Integration Points
- The launcher mounts globally via SiteChrome (public layout only; not admin/driver layouts).
- A server-side HMAC endpoint or server component provides `identifier_hash` for signed-in users. The secret is in the Vercel env.
- `/book` wizard state (`lib/booking-store.ts`, Zustand) is read on chat open for route/vehicle custom attributes.
- `lib/email.ts` replyTo changes affect production customer emails, so cover them with tests.

</code_context>

<specifics>
## Specific Ideas

- Owner's integration priorities, recorded for Phases 82–84:
  - never lose a single lead
  - collect as much information as possible for later analytics
  - improve the customer experience
  - see the client's bookings right in the chat (84)
  - every chat becomes a CRM lead automatically (83)
  - one customer, one card everywhere (82)
- Launcher menu order: Chat on site → WhatsApp → Telegram.
- Webmail stays available as an emergency channel, with a written runbook rule.

</specifics>

<deferred>
## Deferred Ideas

- **Create/modify bookings from the chat.** The owner wants this, but it conflicts with the locked v4.0 rule that Supabase is the single source of truth and CRM/Chatwoot never write bookings (REQUIREMENTS Out of Scope). It needs its own phase/decision (e.g. a Chatwoot dashboard-app action that calls a guarded site admin API). Candidate for the ROADMAP backlog after Phase 84.
- **One-click login/payment link generation from Chatwoot:** Phase 84 (Dashboard App).
- **Telegram link in the footer, /contact and booking emails:** later, once the channel is proven.
- **Chatwoot AI assistant / auto-translation:** INBOX-FUT-01 (future).

</deferred>

---

*Phase: 77-chatwoot-deployment-core-channels*
*Context gathered: 2026-09-28*
