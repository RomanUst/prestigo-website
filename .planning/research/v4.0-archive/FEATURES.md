# Feature Research

**Domain:** Self-hosted helpdesk (Chatwoot) + CRM (EspoCRM) for a small premium chauffeur business
**Researched:** 2026-09-27
**Confidence:** MEDIUM (official docs/hc pages + GitHub discussions cross-checked via web search; no direct API testing against a live instance yet — verify exact automation-rule tier gating and current Enterprise feature list at install time, both products ship fast)

## Feature Landscape

### Table Stakes (Owner Expects These — v4.0 Goal Requires Them)

Both tools are Community/free edition unless marked otherwise. "Complexity" is integration effort for Prestigo, not the tool's own build effort.

| Feature | Why Expected | Edition | Complexity | Notes |
|---------|--------------|---------|------------|-------|
| Chatwoot WhatsApp Cloud API inbox | Core goal: WhatsApp is the #1 customer channel (wa.me links today) | Community | MEDIUM | Coexistence mode (QR-code Embedded Signup) connects the **existing** +420 WhatsApp Business App number without losing it from the phone — requires Meta Tech Provider status (or Chatwoot-hosted onboarding) + Meta app config. Manual/API fallback needs phone number ID, WABA ID, access token, webhook. |
| Chatwoot Email inbox (IMAP/SMTP) for info@/booking@ | Service mail must land in the same inbox as chat/WhatsApp | Community | LOW–MEDIUM | Google Workspace/Microsoft 365/custom SMTP+IMAP all supported; Microsoft path needs per-user OAuth license (relevant if service mail is on M365 vs a generic SMTP provider). |
| Chatwoot website widget, consent-gated | Owner goal: one inbox incl. website chat; existing site has a CookieBanner consent pattern | Community | MEDIUM | Widget script + CSP additions (script/connect/frame-src, possibly wss for real-time) must be gated behind existing consent modal, mirroring `CookieBanner.tsx` consumers. Identity validation (HMAC-SHA256 `identifier_hash` from `setUser()`) should be turned on immediately for any logged-in customer_profiles user to prevent conversation-history spoofing/impersonation. |
| Chatwoot Telegram inbox | Owner goal: Telegram channel | Community | LOW | ~2-minute setup: create bot via @BotFather, paste token into Chatwoot. No Meta review process. |
| Chatwoot Instagram + Facebook inboxes | Owner goal: IG/FB channels | Community | MEDIUM–HIGH | Both route through a Meta (Facebook) Developer app; Instagram requires a Business IG account linked to a Facebook Page. Self-hosted installs must register/verify their own Meta app (unlike Chatwoot Cloud, which has one pre-approved). Expect Meta App Review friction (messaging permissions) — budget lead time here, not code time. |
| Contact custom attributes | Needed to store booking-linked identifiers (customer_profiles id, VIP flag, language) on the Chatwoot contact for the Dashboard App and CRM sync | Community | LOW | Typed fields (text/number/currency/list/date/checkbox/link) on Contact, Conversation, and Company (Company object doubles as a lightweight "Account" inside Chatwoot). |
| Canned responses | Owner explicitly wants to retire the one-off `send-*.mjs` scripts (payment help, vehicle/time change, invoice) | Community | LOW | Account-wide reusable snippets agents adapt per reply. Direct 1:1 replacement for several `send-*.mjs` templates (payment-help, time-change, vehicle-change email bodies become canned responses instead of scripts). |
| Macros | Same "retire manual ops scripts" goal, for multi-step actions (e.g., reply + label + resolve) | Community | LOW | One-click bundles; good fit for "send post-trip review request + label 'review-sent' + resolve." |
| Automation rules | Owner goal: no lost inquiries — auto-assign/auto-label by channel or keyword | Community (basic rule CRUD is core; some sources list richer automation as Business/Enterprise-gated on Chatwoot Cloud — **verify current self-hosted gating at setup**, since Cloud plan names don't map 1:1 to self-hosted tiers) | LOW–MEDIUM | Triggers: conversation created/updated/opened, new message. Conditions: label, priority, inbox, language, country, custom attribute. Actions: assign agent/team, add label, reply, resolve, snooze, email team. |
| Agent/team assignment | 1 operator now, 2–3 later — assignment rules must exist before headcount grows | Community | LOW | "Assign to agent" = ownership; "assign to team" = pool routing. With 1 operator this is trivial; becomes load-bearing at 2–3 agents. |
| Labels | Segmentation for reporting and for CRM sync mapping (e.g., `lead`, `b2b`, `existing-customer`) | Community | LOW | Also drives automation-rule conditions. |
| Reports (conversation volume, first response time, CSAT) | Owner goal: statistics (response time, leads→bookings) | Community | LOW | Built-in dashboards; first-response-time and CSAT are the two numbers most directly tied to the owner's "convenient work" and quality goals. CSAT survey is sent automatically on resolve if enabled. |
| Chatwoot Application API + webhooks | Required for the whole Site↔Chatwoot↔CRM sync architecture | Community | MEDIUM | `api_access_token` header (agent or agent-bot token) for Application API; outbound webhooks POST conversation/message/contact lifecycle events to a Next.js API route. This is the mechanism for "Chatwoot → CRM: conversations create/update contacts & leads." |
| Chatwoot Dashboard App (iframe) | Explicit v4.0 target feature: show the customer's bookings inside the conversation sidebar | Community | MEDIUM | Register a URL (a new Next.js route, e.g. `/internal/chatwoot-app`), Chatwoot iframes it beside the conversation and posts `{conversation, contact}` context via `window.postMessage`; app can pull fresh context on demand via `chatwoot-dashboard-app:fetch-info`. **Must be a separate authenticated internal route**, not the public site — needs its own auth (shared secret or session check) since it will read Supabase booking data. |
| EspoCRM Contact / Account / Lead / Opportunity / Case | Standard CRM core; matches "hotels, agencies, corporates" (Account), "repeat customer" (Contact), inbound inquiry (Lead), B2B deal (Opportunity), and any post-booking service issue (Case) | Community | LOW | Lead converts into Contact/Account/Opportunity — this is EspoCRM's built-in "inquiry → pipeline" flow and maps directly to the owner's "inquiry → lead → booking" goal. |
| EspoCRM custom "Booking" entity | v4.0 explicitly needs booking data visible/queryable in CRM without duplicating Supabase as source of truth | Community | LOW–MEDIUM | Entity Manager (no-code) creates the entity, fields, and relationships to Contact/Account. Populated by the Supabase→CRM sync (read-model, not a second source of truth) — CRM never writes bookings back. |
| EspoCRM Opportunity pipeline (Kanban, custom stages) | Explicit v4.0 target: B2B pipeline for hotels/agencies/corporates | Community | LOW | Kanban on by default; stages + win-probability % configured per business workflow in Entity Manager. Multiple pipelines possible (e.g., separate stage sets for "hotel partnership" vs "corporate account") via Kanban ignored-groups. |
| EspoCRM REST API (API Key or HMAC) + Webhooks | Required for Site↔CRM sync in both directions | Community | LOW–MEDIUM | API Key auth is simplest (create an API User, assign a Role scoping which entities it can touch); HMAC is the documented "most secure" option — worth using for the VPS-facing integration user given it's an internet-facing secret. Webhooks let EspoCRM notify the outbox pipeline of CRM-side changes (e.g., Opportunity won) if any human edits are meant to flow back — confirm whether v4.0 needs that direction at all, since Supabase is locked as sole source of truth for bookings. |
| EspoCRM Group Email Account (sales@/roman@) | Locked decision: sales mail lives in EspoCRM only, never dual-connected | Community | LOW | Admin-only setup; a role's "Group Email Account" permission (None/Team/All) scopes who can send from the shared address — enforces the "no mailbox connected to both systems" rule at the permissions layer, not just by convention. |
| EspoCRM Roles/ACL | Needed the moment there's more than the owner using either system (2–3 agents later; separating sales vs service staff) | Community | LOW | 4 access levels (No/Own/Team/All) per entity/action; multiple roles merge to the more permissive. Set this up correctly from day one even with 1 operator — retrofitting ACL after data exists is more error-prone than defining it upfront. |

### Differentiators (Where This Setup Beats "Just Use wa.me Links + Spreadsheets")

| Feature | Value Proposition | Edition | Complexity | Notes |
|---------|-------------------|---------|------------|-------|
| Outbox-pattern sync (Supabase → QStash → Chatwoot/CRM) | Guarantees no lost lead/booking even if the VPS is down — directly satisfies the "public site must never depend on VPS uptime" constraint | N/A (custom, in Next.js repo) | HIGH | This is the actual hard engineering in v4.0 — idempotent, retried, event-sourced from a Supabase outbox table. Neither Chatwoot nor EspoCRM provide this; it's bespoke glue code per the locked decision "no n8n." |
| Contact form / corporate form / multi-day quote form → persisted + CRM Lead | Today these are email-only and never stored — first-ever retention of these inquiries | N/A (Supabase + EspoCRM Lead) | MEDIUM | Directly satisfies "no lost inquiries" and "every customer who ever booked retained." Requires new Supabase tables/migrations plus the outbox trigger — not just a CRM feature. |
| Dashboard App showing bookings in the Chatwoot sidebar | Operator sees booking history while replying — no tab-switching, no CRM lookup mid-chat | Community | MEDIUM | Biggest single "convenient work" win named in the milestone goal. Read-only view is enough for v1; write-back (editing a booking from the sidebar) is explicitly not needed and would add scope. |
| Canned responses + macros replacing `send-*.mjs` scripts | Removes the current workflow's ad-hoc Node scripts entirely (payment help, vehicle/time change, invoice send, custom replies, post-trip review request) | Community | LOW–MEDIUM | This is a straight migration, not new functionality — map each existing script to a canned response or macro. Invoice-with-PDF-attachment scripts may need a macro + email-attachment step or stay as a script triggered from a Dashboard App button, since Chatwoot canned responses are text, not file-generation. |
| EspoCRM Opportunity → repeat-sales / renewal visibility for B2B accounts | Owner goal: "repeat sales" — EspoCRM's Account/Opportunity model natively supports tracking a hotel/agency relationship over multiple deals, which a flat bookings table does not | Community | LOW | This is exactly what a CRM is for vs. a booking database; low build cost because it's using EspoCRM as designed. |
| Statistics: leads → bookings conversion, repeat-customer rate | Owner goal: statistics | Custom (EspoCRM reports for pipeline-side numbers; Supabase/CRM join for booking-side conversion) | MEDIUM | Native EspoCRM reports cover Lead/Opportunity funnel numbers; "leads → bookings" requires joining CRM lead records with Supabase booking outcomes — likely a small internal dashboard or scheduled report, not out-of-the-box from either tool. |
| Future: client↔driver messaging 24h before trip via Chatwoot | Explicitly named as a future idea, not v4.0 scope | Community (conceptually — Chatwoot API-channel or WhatsApp template message) | HIGH (future) | Flag only — do not build in v4.0. Would likely use a Chatwoot API inbox or template-based WhatsApp outbound message triggered by the outbox pipeline near trip time. Needs its own consent/opt-in design later. |

### Anti-Features (Skip for a 1–3 Operator Chauffeur Business)

| Feature | Why It Looks Appealing | Why Problematic Here | Alternative |
|---------|------------------------|----------------------|-------------|
| Chatwoot Enterprise tier (SLA policies, audit logs, agent capacity/scheduling, SSO/SAML, 2FA enforcement, whitelabel, IP allowlisting) | "Enterprise" sounds like the safe/complete choice; SLA policies sound useful for response-time discipline | \$19–99/agent/month self-hosted, and every one of these targets multi-team, multi-tenant, or compliance-driven orgs — none apply to 1–3 agents on one VPS. SSO/2FA-enforcement/audit logs solve problems Prestigo doesn't have yet | Stay on Community; revisit only if headcount grows well past 2–3 agents or a client contractually requires SLA reporting/SSO |
| EspoCRM Advanced Pack (paid: full Reports module, Workflows, BPM flowcharts) | "More automation in the CRM" feels like less code to write | The locked architecture decision already puts all automation/sync logic in the Next.js repo (Supabase outbox + QStash) specifically so it's tested, versioned, and works when the VPS is down — duplicating that logic as in-CRM BPM flowcharts creates two automation systems to maintain and a second place bugs can hide | Community EspoCRM's basic reports/exports are enough for CRM-side numbers; keep all business logic in the repo per the locked decision |
| Connecting one mailbox (e.g. info@) to both Chatwoot and EspoCRM | Seems convenient — one address, see it everywhere | Explicitly identified and rejected in Key Decisions: causes duplicate messages, double replies from two agents/systems, and broken response-time stats in both tools | Keep the locked split: service mail only in Chatwoot, sales mail only in EspoCRM; conversation summaries flow into CRM contact history via sync, not via a shared inbox |
| n8n or another workflow-automation tool for the sync layer | Visual workflow builders are fast to prototype and often the default choice for "connect system A to system B" | Already rejected in Key Decisions — an external workflow tool adds a fourth system to keep up (plus the VPS, Chatwoot, EspoCRM), is harder to unit-test, and doesn't naturally support the idempotent-outbox/retry pattern the VPS-independence constraint requires | Keep sync logic in the Next.js repo as typed, tested, versioned code |
| Building a second "leads" table independent of EspoCRM Lead entity | Feels safer to "own the data" fully in Supabase | Creates exactly the two-source-of-truth problem the architecture is designed to avoid on the CRM side (Supabase stays authoritative for bookings/customers; EspoCRM should be authoritative for pipeline/lead state, not duplicated) | Persist inbound form submissions to a lightweight Supabase table only as an outbox/audit trail, with EspoCRM Lead as the working record; don't build parallel pipeline-stage tracking in Supabase |
| Real-time driver GPS / push notifications via Chatwoot | Feels like a natural extension once a messaging platform exists | Explicitly out of scope (DTRIP-FUT-01/02/03 backlog items) and unrelated to helpdesk/CRM — conflates driver-ops tooling with customer messaging | Keep as backlog; if built later it's a separate driver-portal feature, not a Chatwoot channel |
| Full BPM/case-status automation inside EspoCRM Case entity | Case entity supports rich support-ticket workflows (SLA on cases, escalation) | Service-side ticketing already lives in Chatwoot (conversations, labels, CSAT); duplicating a full case-workflow in EspoCRM Case creates two "where do I look for an open issue" systems | Use EspoCRM Case only for B2B-relevant account issues that need Account/Opportunity context (e.g., a corporate billing dispute), not for routine customer service — that stays in Chatwoot |

## Feature Dependencies

```
Existing: WhatsApp Business App (+420 number, wa.me links)
    └──required-by──> Chatwoot WhatsApp Cloud API inbox (Coexistence mode)
                           └──requires──> Meta Tech Provider / Meta app review
                           └──requires──> CSP/webhook endpoint reachable from Meta

Existing: contact form / corporate form / multi-day quote form (email-only, not stored)
    └──requires-new──> Supabase tables to persist submissions
                           └──feeds──> Supabase outbox
                                           └──feeds──> EspoCRM Lead (via REST API + webhook)
                                           └──feeds──> Chatwoot Contact (optional, if inquiry becomes a conversation)

Supabase outbox + QStash (bespoke, HIGH complexity)
    └──required-by──> Chatwoot → CRM sync (conversations create/update contacts & leads)
    └──required-by──> Site → CRM/Chatwoot sync (bookings, payments, status, signups, leads)
    └──required-by──> VPS-independence constraint (public site keeps working if VPS is down)

EspoCRM Entity Manager: custom "Booking" entity
    └──requires──> EspoCRM Account/Contact entities (relationship target)
    └──requires──> Supabase → CRM sync pipeline (Booking entity is a read-model, populated by sync)

Chatwoot Application API access token + Contact custom attributes
    └──required-by──> Chatwoot Dashboard App (needs a stable link from Chatwoot contact → Supabase customer_profiles id)
                           └──requires──> new internal authenticated Next.js route (iframe target)
                                              └──requires──> Supabase booking read access from that route

Chatwoot canned responses / macros
    └──replaces──> send-*.mjs scripts (payment help, vehicle/time change, invoice, custom replies, post-trip review)
    └──conflicts-partially-with──> invoice PDF-attachment scripts (canned responses are text-only; keep those as scripts or macro-triggered actions)

EspoCRM Group Email Account (sales@/roman@) ──conflicts──> connecting the same mailbox in Chatwoot
Chatwoot service mail (info@/booking@) ──conflicts──> connecting the same mailbox in EspoCRM

EspoCRM Roles/ACL + Chatwoot agent/team assignment
    └──enhances──> future 2–3 operator scale-up (must exist before headcount grows, cheap to set up now)
```

### Dependency Notes

- **WhatsApp Cloud API inbox requires Meta Tech Provider / app review before Coexistence works** — this is a Meta-side approval process, not a code task, and should be started early since it can take days, independent of when the VPS/Docker stack is ready.
- **Every "persist a lead" feature requires new Supabase schema first** — contact form, corporate form, and multi-day quote form currently write nothing to the database; the outbox pattern needs a source table to read from before any CRM/Chatwoot sync can exist.
- **The Dashboard App depends on a stable identifier linking a Chatwoot contact to a Supabase `customer_profiles`/booking record** — this link (likely a custom attribute holding the Supabase user id or email match) must be established by the Site→CRM/Chatwoot sync before the sidebar app has anything reliable to query.
- **The two "single mailbox, two systems" anti-features are structural conflicts, not preferences** — Chatwoot and EspoCRM should be configured so it is not merely convention but enforced (e.g., only creating each mailbox in one tool's admin panel) to prevent an operator from accidentally double-connecting one later.
- **EspoCRM's Booking entity is a read-model, not a second source of truth** — it must never accept writes that flow back into Supabase; this constrains the sync direction (Site → CRM one-way for booking data) even though EspoCRM technically has a two-way-capable REST API.

## MVP Definition

### Launch With (v4.0 core, matches stated milestone target features)

- [ ] VPS (Docker) running Chatwoot + EspoCRM on subdomains, TLS, backups, monitoring — foundation everything else depends on
- [ ] Chatwoot inboxes: WhatsApp Cloud API (Coexistence), email (info@/booking@ IMAP/SMTP), website widget (consent-gated, identity-validated), Telegram, Instagram, Facebook
- [ ] Supabase tables + outbox for contact form / corporate form / multi-day quote form (persist what's lost today)
- [ ] Site → CRM/Chatwoot sync via Supabase outbox + QStash (idempotent, retried) for bookings/payments/status/signups/leads
- [ ] Chatwoot → CRM sync: conversation-derived contact/lead create-update + conversation summary into CRM history
- [ ] Chatwoot Dashboard App: read-only customer bookings in the conversation sidebar
- [ ] EspoCRM Account/Contact/Lead/Opportunity + custom Booking entity + B2B Opportunity pipeline (hotels, agencies, corporates)
- [ ] EspoCRM Group Email Account for sales@/roman@ (EspoCRM-only, per locked decision)
- [ ] Canned responses + macros replacing the current `send-*.mjs` manual-ops scripts
- [ ] Reports/stats: Chatwoot conversation volume + first response time + CSAT; EspoCRM pipeline/lead→won numbers; a simple leads→bookings and repeat-customer view

### Add After Validation (v4.x)

- [ ] Automation rules tuned by real conversation volume/labels once there's enough data to see patterns (start with a small manual rule set, expand once 1 operator sees repeat routing needs)
- [ ] Second/third agent onboarding — exercise the Roles/ACL and assignment setup for real with 2–3 people
- [ ] EspoCRM webhooks feeding back CRM-side changes into the outbox (only if a real workflow needs it — not assumed necessary for v4.0)
- [ ] Richer B2B reporting (e.g., dedicated hotel/agency renewal dashboard) once the pipeline has enough Opportunity history

### Future Consideration (v2+ of this milestone track)

- [ ] Client↔driver messaging 24h before trip via Chatwoot (owner's stated future idea) — needs its own consent/opt-in and channel design, deliberately excluded from v4.0
- [ ] Chatwoot/EspoCRM Enterprise or Advanced Pack features — only if headcount or compliance needs actually appear
- [ ] Driver GPS/push notifications through the messaging stack — unrelated concern, stays in the driver-portal backlog

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Supabase outbox + QStash sync pipeline | HIGH | HIGH | P1 |
| Persist contact/corporate/multi-day-quote forms | HIGH | MEDIUM | P1 |
| Chatwoot WhatsApp Cloud API (Coexistence) | HIGH | MEDIUM (+ Meta approval lead time) | P1 |
| Chatwoot email + website widget inboxes | HIGH | LOW–MEDIUM | P1 |
| Chatwoot Telegram/Instagram/Facebook inboxes | MEDIUM | MEDIUM–HIGH | P1 (Telegram) / P2 (IG/FB, gated by Meta review) |
| EspoCRM Account/Contact/Lead/Opportunity + Booking entity | HIGH | LOW–MEDIUM | P1 |
| Chatwoot Dashboard App (bookings in sidebar) | HIGH | MEDIUM | P1 |
| Canned responses/macros replacing send-*.mjs | MEDIUM | LOW–MEDIUM | P1 |
| EspoCRM sales mailbox isolation | MEDIUM | LOW | P1 |
| Reports/stats (CSAT, response time, leads→bookings) | MEDIUM | MEDIUM | P2 |
| Automation rules beyond a basic set | MEDIUM | LOW–MEDIUM | P2 |
| Roles/ACL for future 2–3 agents | LOW now / HIGH later | LOW | P2 (cheap to do now, avoids retrofit pain) |
| Chatwoot/EspoCRM Enterprise/Advanced Pack | LOW | HIGH (cost + complexity) | P3 (avoid) |
| Client↔driver messaging | MEDIUM (future) | HIGH | P3 (explicitly future) |

**Priority key:**
- P1: Must have — matches explicit v4.0 target features in PROJECT.md
- P2: Should have, add once P1 is live and generating real data
- P3: Nice to have or explicitly future/out-of-scope for v4.0

## Competitor / Reference Pattern Analysis

Not a market-competitor comparison (this is internal tooling), but a comparison of the two viable "one inbox + CRM" approaches considered:

| Concern | Chatwoot + EspoCRM (chosen) | SaaS alternative (Intercom/HubSpot-style) | Our Approach |
|---------|------------------------------|--------------------------------------------|--------------|
| Data ownership / VPS-independence | Self-hosted, full control, but requires the outbox pattern to survive VPS downtime | Vendor-hosted, always up, but Supabase would no longer be sole source of truth and per-seat SaaS cost scales with agents | Self-hosted on Hostinger VPS; async outbox ensures booking/payment flow never blocks on VPS |
| Channel coverage (WhatsApp/Telegram/IG/FB/email/widget) | All supported, but each Meta channel needs its own app review on self-hosted (no shared pre-approved app like Chatwoot Cloud) | Usually broader out-of-box channel support with less setup friction | Accept the Meta app-review lead time as a one-time setup cost |
| Custom entities (Booking) & B2B pipeline | EspoCRM Entity Manager: no-code, free | Most SaaS CRMs also support custom objects but often gate them behind higher-priced tiers | EspoCRM Community is sufficient — no paid tier needed |
| Automation/BPM | Available (Advanced Pack, paid) but deliberately not used — logic lives in the repo instead | Often the SaaS's core selling point, drives lock-in | Keep automation in Next.js code per locked architecture decision |

## Sources

- [Chatwoot: WhatsApp Business App Coexistence onboarding (GitHub issue #15695)](https://github.com/chatwoot/chatwoot/issues/15695)
- [Chatwoot: WhatsApp Embedded Signup — Developer Docs](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)
- [Chatwoot: How to setup a WhatsApp channel (Manual flow) — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1756799850-how-to-setup-a-whats_app-channel-manual-flow)
- [Chatwoot: Managing Enterprise Edition Features — Developer Docs](https://developers.chatwoot.com/self-hosted/enterprise-edition)
- [Chatwoot: Self-Hosted Pricing](https://www.chatwoot.com/pricing/self-hosted-plans)
- [Chatwoot: Enterprise Edition — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677776492-enterprise-edition)
- [Chatwoot: How to enable identity validation — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677587479-how-to-enable-identity-validation-in-chatwoot)
- [Chatwoot: HMAC Verification and Identity Validation — DeepWiki](https://deepwiki.com/chatwoot/chatwoot/11.4-hmac-verification-and-identity-validation)
- [Chatwoot: How to use Dashboard Apps — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677691702-how-to-use-dashboard-apps)
- [Chatwoot: IFrame Communication and Events — DeepWiki](https://deepwiki.com/chatwoot/chatwoot/6.2-widget-application)
- [Chatwoot: Platform APIs — Developer Docs](https://developers.chatwoot.com/contributing-guide/chatwoot-platform-apis)
- [Chatwoot: Building on Top of Chatwoot: Platform APIs — Wiki](https://github.com/chatwoot/chatwoot/wiki/Building-on-Top-of-Chatwoot:-Platform-APIs)
- [Chatwoot: API Layer — DeepWiki](https://deepwiki.com/chatwoot/chatwoot/4-api-layer)
- [Chatwoot: Automations feature page](https://www.chatwoot.com/features/automations)
- [Chatwoot: Customer Support Automation & Routing](https://www.chatwoot.com/use-cases/automation-routing)
- [Chatwoot: Chatwoot Glossary — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677141565-chatwoot-glossary)
- [Chatwoot: How to setup an Instagram channel — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677829420-how-to-setup-an-instagram-channel)
- [Chatwoot: How to setup an Email channel — User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677843043-how-to-setup-an-email-channel)
- [Chatwoot: Email Channel Configuration — Developer Docs](https://developers.chatwoot.com/self-hosted/configuration/features/email-channel/introduction)
- [EspoCRM: Entity Manager — Documentation](https://docs.espocrm.com/administration/entity-manager/)
- [EspoCRM: Sales management — Documentation](https://docs.espocrm.com/user-guide/sales-management/)
- [EspoCRM: Opportunities feature page](https://www.espocrm.com/features/opportunities/)
- [EspoCRM: API overview — Documentation](https://docs.espocrm.com/development/api/)
- [EspoCRM: Webhooks — Documentation](https://docs.espocrm.com/administration/webhooks/)
- [EspoCRM: Using HMAC to connect to API using Python3 — Forum](https://forum.espocrm.com/forum/developer-help/46378-using-hmac-to-connect-to-api-using-python3)
- [EspoCRM: Advanced Pack — product page](https://www.espocrm.com/extensions/advanced-pack/)
- [EspoCRM: Advanced Pack Overview — Documentation](https://docs.espocrm.com/extensions/advanced-pack/overview/)
- [EspoCRM: Email administration — Documentation](https://docs.espocrm.com/administration/emails/)
- [EspoCRM: Roles — Documentation](https://docs.espocrm.com/administration/roles-management/)
- [Prestigo PROJECT.md — v4.0 milestone target features, constraints, and Key Decisions](/Users/romanustyugov/Desktop/Prestigo/.planning/PROJECT.md)

---
*Feature research for: self-hosted helpdesk (Chatwoot) + CRM (EspoCRM) integration, Prestigo v4.0*
*Researched: 2026-09-27*
