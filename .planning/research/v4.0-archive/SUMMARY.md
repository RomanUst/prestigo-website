# Project Research Summary

**Project:** Prestigo v4.0 — Helpdesk + CRM
**Domain:** Self-hosted omnichannel helpdesk (Chatwoot) + CRM (EspoCRM) on a new Hostinger VPS, two-way linked to an existing production Next.js/Supabase/Stripe site
**Researched:** 2026-09-27
**Confidence:** MEDIUM

## Executive Summary

v4.0 bolts a self-hosted helpdesk (Chatwoot) and CRM (EspoCRM) onto the existing Prestigo stack, running on a new Hostinger VPS (Docker, KVM 4 recommended, 16GB/4vCPU) behind Caddy. Both tools are mature, free-tier-sufficient open-source products — Chatwoot unifies WhatsApp Cloud API, email, website widget, Telegram/Instagram/Facebook into one inbox; EspoCRM gives a no-code custom-entity CRM with a B2B Opportunity pipeline. Neither Enterprise/paid tier is needed for 1-3 operators. The only genuinely hard engineering is the sync layer: a Supabase `integration_outbox` table dispatched via QStash to Chatwoot/EspoCRM REST APIs, plus inbound HMAC-verified webhooks from both — built in-repo (no n8n, per locked decision) so the public site, booking and payment flow never depend on VPS uptime.

The recommended approach: stand up the VPS infrastructure first (Docker, Caddy, backups, Uptime Kuma) as its own phase, then Chatwoot channels (WhatsApp Coexistence is the critical, highest-business-risk step — must not disconnect the existing +420 number), then EspoCRM entities/pipeline, then the outbox/webhook sync layer (idempotency, identity resolution, echo-loop prevention, GDPR erasure propagation all belong in this phase's initial design, not bolted on later), and only then the Dashboard App (booking data in the Chatwoot sidebar) once Chatwoot/EspoCRM are stable and any known CVEs are confirmed patched.

Key risks: (1) WhatsApp migration — must use Coexistence, not a hard cutover, or the live +420 number's history/app access is destroyed; (2) Meta Business/App-Review friction for WhatsApp/IG/FB, which is a lead-time risk, not a code risk, and should start in parallel with VPS setup; (3) webhook security — Chatwoot's webhook-secret/HMAC mismatch (GitHub #13809) means signature verification must be validated against the actual deployed version, not assumed; (4) CSP/CWV regressions from the chat widget on conversion-critical pages, which Prestigo has already been burned by twice (middleware matcher incidents); (5) GDPR erasure/DSR propagation across three systems (Supabase/Chatwoot/EspoCRM) must be designed into the outbox schema from day one, not retrofitted.

## Key Findings

### Recommended Stack

New infra only — the existing Next.js/Supabase/Stripe/Resend/QStash stack is untouched. Hostinger VPS **KVM 4** (16GB/4vCPU) runs Chatwoot (Rails + Sidekiq + Postgres 16/pgvector + Redis 7, Community Edition) and EspoCRM (PHP 8.3+/MariaDB 10.3+, Community, v10.0.3) as separate Docker Compose stacks behind **Caddy** (auto-TLS, minimal ops for a static 2-subdomain box) on `chat.rideprestigo.com` / `crm.rideprestigo.com`. Backups: `pg_dump`/`mysqldump` nightly -> **restic -> Backblaze B2**, plus Hostinger's weekly snapshot as a coarse safety net, with a dead-man's-switch ping to **Uptime Kuma** (also used for uptime/health monitoring). OS patched via `unattended-upgrades` (security-repo only, Docker packages blacklisted); app images upgraded manually/deliberately. SMTP: Hostinger-hosted mailboxes (not Resend, which is send-only) for info@/booking@ (Chatwoot) and sales@/roman@ (EspoCRM) — strictly separate, per locked decision.

**Core technologies:**
- Chatwoot CE v4.18.x on Docker — omnichannel inbox (WhatsApp/email/widget/Telegram/IG/FB), Application API + webhooks
- EspoCRM CE v10.0.3 on Docker — Contact/Account/Lead/Opportunity/Case + custom "Booking" entity, REST API (API Key/HMAC) + webhooks
- Caddy 2.x — reverse proxy + automatic TLS for the two subdomains
- restic + Backblaze B2 — encrypted offsite backups; Uptime Kuma — monitoring + backup dead-man's-switch
- No new Node client packages — hand-written `fetch` wrappers (`lib/chatwoot.ts`, `lib/espocrm.ts`), matching existing repo convention (Stripe/Resend, no unofficial SDKs)
- Reuse existing QStash (`lib/qstash.ts`) for outbox dispatch — no new queue library

### Expected Features

**Must have (table stakes):**
- Chatwoot inboxes: WhatsApp Cloud API (Coexistence mode, existing +420 number), email IMAP/SMTP (info@/booking@), consent-gated website widget with identity validation, Telegram, Instagram, Facebook
- Canned responses + macros directly replacing the current ad-hoc `send-*.mjs` scripts
- Automation rules, agent/team assignment, labels, reports (CSAT, first-response-time, conversation volume)
- Chatwoot Application API + webhooks; Dashboard App (read-only bookings in the conversation sidebar)
- EspoCRM Account/Contact/Lead/Opportunity/Case, custom "Booking" entity (read-model, never a second source of truth), B2B Opportunity pipeline (Kanban)
- EspoCRM REST API + Roles/ACL (set up correctly from day one, even with 1 operator)
- Persisting currently-lost inquiries: contact form, corporate form, multi-day quote form -> Supabase `inquiries` table -> EspoCRM Lead

**Should have (differentiators):**
- Supabase outbox + QStash sync (the actual hard engineering; guarantees no lost lead/booking if VPS is down)
- Dashboard App showing booking history in the Chatwoot sidebar (biggest named "convenient work" win)
- Statistics: leads->bookings conversion, repeat-customer rate (requires a join across CRM + Supabase, not out-of-the-box)

**Defer (v2+ of this milestone / backlog):**
- Chatwoot Enterprise / EspoCRM Advanced Pack (SLA, SSO, BPM, pivot reports) — not needed for 1-3 operators
- EspoCRM webhooks feeding CRM-side changes back into the outbox — only if a real workflow needs it
- Client<->driver messaging 24h before trip via Chatwoot — explicitly named as future, not v4.0 scope
- Automation-rule tuning, 2nd/3rd agent onboarding — after real data exists

### Architecture Approach

The delta is entirely additive: a durable `integration_outbox` table (Supabase) that every booking/inquiry/customer write path inserts into in the same request, dispatched near-real-time via QStash to a single `app/api/integrations/dispatch` route that fans out to Chatwoot/EspoCRM based on `event_type`, with a `crm_identity_map` table resolving identity (normalized email/phone) before every outbound write. Inbound direction mirrors this: HMAC-verified webhook receivers (`app/api/webhooks/chatwoot`, `app/api/webhooks/espocrm`) write only to CRM-side tables, never to `bookings`/`customer_profiles` (Supabase stays sole source of truth, enforced structurally by which modules the webhook routes are allowed to import — same "isolation by omission" pattern already used for the driver trip-progress route).

**Major components:**
1. `integration_outbox` + `lib/outbox.ts` — durable, idempotent event log; single insert call site for every producer
2. `app/api/integrations/dispatch` (QStash-invoked) — the only code path allowed to call `lib/chatwoot-client.ts` / `lib/espocrm-client.ts` for outbound writes
3. `crm_identity_map` + `lib/identity.ts` — email/phone normalization and dedup before any Chatwoot/EspoCRM contact is created
4. Webhook receivers (`app/api/webhooks/{chatwoot,espocrm}`) — HMAC-verified inbound sync, structurally barred from touching booking/customer core tables
5. `app/embed/chatwoot-dashboard` — Dashboard App iframe page, no admin session cookie, identity via Chatwoot's own `postMessage` handshake + `frame-ancestors` CSP, read-only booking-summary RPC only

### Critical Pitfalls

1. **WhatsApp hard-cutover migration destroys the existing +420 number's history/app access** — use Embedded Signup Coexistence mode, verify the number isn't already claimed by another BSP, test both directions before declaring done.
2. **Webhook signature verification trusted on a known-buggy field** — Chatwoot's API-exposed `secret` field can mismatch the real `hmac_token` (issue #13809); verify against a real test delivery, add IP-allowlist/shared-secret as compensating control if unverifiable for the installed version.
3. **Bidirectional sync infinite echo loop** — tag every outbound write with an origin marker/fingerprint; inbound webhooks must skip processing anything matching a recent outbound write, since Supabase is the locked sole source of truth.
4. **Chat widget tanks LCP/INP on conversion-critical pages** — defer load past `load`/facade pattern, gate behind consent (also closes the GDPR pre-consent-cookie gap), measure before/after CWV as an explicit UAT gate given Prestigo's SEO/CWV history is already load-bearing.
5. **GDPR erasure request only deletes the Supabase row**, leaving the person live in Chatwoot conversations and EspoCRM contacts — design an `erasure_requested` outbox event type from day one, not after a real DSR arrives.

## Implications for Roadmap

Based on research, suggested phase structure (phases start at 76 per milestone numbering):

### Phase 1: VPS Infrastructure
**Rationale:** Everything else (Chatwoot, EspoCRM, sync) needs the VPS, TLS, backups, and monitoring to exist first; also the phase where the "VPS must never be a silent SPOF" constraint and backup/restore integrity need to be proven before any real data flows through.
**Delivers:** Hostinger VPS provisioned (KVM 4), Docker + Compose, Caddy with TLS on `chat.*`/`crm.*`, `unattended-upgrades` configured (Docker packages blacklisted), restic->B2 backup pipeline with a tested restore drill, Uptime Kuma monitoring + dead-man's-switch alerting on a channel independent of the VPS.
**Addresses:** Foundation for all target features.
**Avoids:** Pitfall 13 (VPS SPOF/no alerting), Pitfall 14 (backup/restore integrity — DB dump + attachment storage out of sync).

### Phase 2: Chatwoot Deployment + Core Channels (Email, Widget, Telegram)
**Rationale:** Get Chatwoot live and low-risk channels connected before the highest-business-risk step (WhatsApp) and before Meta-gated channels (IG/FB).
**Delivers:** Chatwoot CE running on the VPS; email channel (info@/booking@ IMAP/SMTP, audited for no dual-mailbox access first); consent-gated, CWV-safe website widget with CSP additions + `csp_baseline.json` update; Telegram inbox.
**Addresses:** Table-stakes Chatwoot inboxes (partial), canned responses/macros scaffolding.
**Avoids:** Pitfall 6 (CWV regression), Pitfall 7 (CSP breakage), Pitfall 8 (pre-consent cookie/GDPR), Pitfall 17 (dual mailbox access).

### Phase 3: WhatsApp Cloud API Channel (Coexistence)
**Rationale:** Isolated as its own phase because it's the single highest-business-risk step (can kill the live +420 number) and has external lead-time dependencies (Meta Business verification, template approval) that should run in parallel with other build work, not block it.
**Delivers:** WhatsApp Coexistence onboarding, Meta Business verification + display-name approval, pre-approved outbound templates replacing every current `send-*.mjs` use case (payment reminder, time-change, vehicle-change, review request, invoice), 24h-window UI/automation awareness.
**Addresses:** WhatsApp Cloud API inbox target feature; retiring manual ops scripts.
**Avoids:** Pitfall 1 (migration cutover), Pitfall 2 (Meta verification rejection), Pitfall 4 (24h window/template gap), Pitfall 5 (pricing model changes Oct 2026), Pitfall 15 (inbox deletion cascade — runbook).

### Phase 4: Instagram + Facebook Channels
**Rationale:** Sequenced after WhatsApp/email/widget are stable, per pitfalls research, to reduce blast radius if Meta App Review stalls; scope-mixing bugs mean these should go through separate app-review submissions.
**Delivers:** IG + FB inboxes via separate, scope-minimal Meta App Review submissions.
**Addresses:** Remaining Chatwoot channel target features.
**Avoids:** Pitfall 3 (Instagram scope-mixing rejection loop).

### Phase 5: EspoCRM Deployment + Core Entities
**Rationale:** Independent of Chatwoot channel work; can run in parallel with Phase 3/4 once Phase 1 infra exists. Establishes the CRM data model the sync layer will target.
**Delivers:** EspoCRM live; Account/Contact/Lead/Opportunity/Case configured; custom "Booking" entity (read-model only); B2B Opportunity pipeline (Kanban, hotel/agency/corporate stages); Roles/ACL set up for future 2-3 operators; sales@/roman@ Group Email Account (audited for no dual mailbox access first).
**Addresses:** EspoCRM table-stakes target features.
**Avoids:** Pitfall 17 (dual mailbox access, applied to sales@/roman@).

### Phase 6: Site -> Sync Foundation (Outbox, Identity, Inquiries)
**Rationale:** This is the hard engineering and the true dependency root for every "leads never lost" and "two-way sync" goal — must exist before any inbound webhook or Dashboard App work, and its schema (including erasure events) shapes everything downstream.
**Delivers:** `integration_outbox`, `crm_identity_map`, `inquiries` Supabase migrations; `lib/outbox.ts`, `lib/identity.ts` (with `libphonenumber-js` added); contact/corporate/multi-day-quote forms modified to persist into `inquiries`; `app/api/integrations/dispatch` route wired to QStash, pushing `booking.created/paid/status_changed/edited`, `lead.created`, `customer.signed_up` events to Chatwoot/EspoCRM; `outbox-sweep` cron.
**Uses:** QStash (`lib/qstash.ts`), Supabase, `lib/chatwoot-client.ts`/`lib/espocrm-client.ts` thin fetch wrappers.
**Implements:** Outbox pattern, idempotency-key pattern, identity resolution pattern (Architecture Patterns 1-3).
**Avoids:** Pitfall 9 (erasure propagation — build the event type now), Pitfall 12 (duplicate contacts — normalization at the single matching point).

### Phase 7: CRM/Chatwoot -> Site Sync (Webhooks + Echo Prevention)
**Rationale:** Depends on Phase 6's identity/outbox infrastructure; the inbound direction is architecturally riskier (webhook auth, echo loops) so it's kept as its own reviewable, security-flagged phase.
**Delivers:** `app/api/webhooks/chatwoot` and `app/api/webhooks/espocrm` routes, HMAC-verified over raw body with replay protection and delivery-ID dedup; origin-tagging/fingerprint mechanism to prevent bidirectional echo loops; conversation-derived contact/lead create-update flowing into EspoCRM; erasure-propagation end-to-end tested.
**Addresses:** "Chatwoot -> CRM: conversations create/update contacts & leads" target feature.
**Avoids:** Pitfall 10 (unverified/spoofable webhooks), Pitfall 11 (echo loop) — commit with `security:` prefix per CLAUDE.md.

### Phase 8: Chatwoot Dashboard App (Bookings in Sidebar)
**Rationale:** Sequenced last, after core Chatwoot/EspoCRM sync is stable and the Chatwoot version is confirmed to have patched CVE-2025-12245 — this is explicitly the phase pitfalls research flags as needing a security-first build, not a quick iframe wire-up.
**Delivers:** `app/embed/chatwoot-dashboard` page, `app/api/chatwoot/dashboard-app` read-only RPC, origin-validated `postMessage` handshake, no cookie-based auth.
**Addresses:** Explicit v4.0 target feature (biggest named "convenient work" win).
**Avoids:** Pitfall 16 (iframe/postMessage CVE-class vulnerability) — commit with `security:` prefix.

### Phase Ordering Rationale

- VPS infra must exist before anything is deployed onto it (Phase 1 first, universally blocking).
- WhatsApp is isolated as its own phase, not bundled with other channels, because it's the highest-risk step (can break a live customer-facing number) and has external Meta approval lead time that benefits from starting early and running in parallel with other build work.
- IG/FB deliberately come after WhatsApp/email/widget are stable, per the pitfalls research's explicit sequencing recommendation (reduces blast radius from Meta review stalls, avoids scope-mixing rejection loops).
- The sync layer (outbox -> dispatch -> identity) must exist before any inbound webhook work, since webhooks need `crm_identity_map` and the origin-tagging mechanism the outbox establishes.
- The Dashboard App is deliberately last among the build phases — it depends on both Chatwoot and EspoCRM being live and stable, and it's flagged as needing the most security hardening (CVE-2025-12245), so it shouldn't be the first thing built on a fresh, unverified Chatwoot install.
- GDPR/compliance work (privacy policy, RoPA, erasure propagation) is folded into Phase 6 rather than deferred, per pitfalls research's explicit warning that this is easy to skip under deadline pressure and hard to retrofit.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (WhatsApp Coexistence):** Meta's onboarding flow, current pricing model (changed twice in 15 months, Oct 2026 service-message billing change), and the exact state of the +420 number's current BSP connection all need verification at plan time, not assumed from this research.
- **Phase 6 (Outbox/Identity foundation):** idempotency-key design and the email-OR-phone permissive-matching trade-off are flagged MEDIUM-confidence design choices in ARCHITECTURE.md that should be confirmed with the owner during planning.
- **Phase 7 (Webhooks):** must confirm the exact Chatwoot/EspoCRM version deployed and whether the HMAC signing bug (#13809) and EspoCRM's header rename (`X-Signature`->`Signature` at v9+) apply to the installed versions before finalizing verification code.
- **Phase 8 (Dashboard App):** must confirm CVE-2025-12245 is patched in the deployed Chatwoot version before building.

Phases with standard patterns (skip research-phase):
- **Phase 1 (VPS infra):** Docker Compose + Caddy + restic/B2 + Uptime Kuma are all well-documented, standard self-hosting patterns.
- **Phase 2 (Chatwoot core channels), Phase 5 (EspoCRM core entities):** both follow official vendor documentation closely; low ambiguity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Web-search cross-checked across 2-3 sources per claim; no official Context7 docs for Chatwoot/EspoCRM/Caddy; Hostinger pricing figures are directional only |
| Features | MEDIUM | Official docs + GitHub discussions cross-checked via web search; no direct API testing against a live instance; automation-rule tier gating and Enterprise feature lists should be re-verified at install time |
| Architecture | HIGH (integration points) / MEDIUM (Chatwoot/EspoCRM webhook & Dashboard App mechanics) | Integration points verified against the actual `main` branch codebase (2026-09-27); external mechanics (webhooks, iframe) verified via docs search only, not yet exercised against a live self-hosted instance |
| Pitfalls | MEDIUM | Cross-checked across official docs, GitHub issues/discussions, CVE databases, GDPR sources; a few findings (e.g. "5 production failures" blog) are single-source but corroborated elsewhere |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Exact Chatwoot/EspoCRM patch versions at deploy time** — webhook HMAC behavior (issue #13809), CVE-2025-12245 patch status, and EspoCRM's webhook header name (`X-Signature` vs `Signature`) all depend on the specific version installed; verify against a real test webhook delivery during Phase 7/8 planning, not assumed from this research.
- **Current WhatsApp Business Platform pricing** (changed materially in 2025-2026, another change Oct 1 2026) — re-verify against Meta's live pricing docs immediately before Phase 3 launch, not from this document.
- **+420 number's current BSP connection status** — confirm it's still only on the WhatsApp Business App (not already claimed by a competing BSP) before starting Coexistence onboarding.
- **Email-OR-phone permissive identity matching** — flagged MEDIUM-confidence in ARCHITECTURE.md; confirm with the owner whether false-positive merges (e.g. shared corporate booking-desk phone) are acceptable before Phase 6 implementation.
- **Automation-rule gating on self-hosted vs Chatwoot Cloud plan names** — some sources suggest richer automation may be Business/Enterprise-gated on Cloud; verify actual self-hosted CE gating at Phase 2 setup time.
- **GDPR/legal review of the Hostinger VPS's physical hosting region and sub-processor documentation** — this research recommends an EU region and privacy-policy updates but does not substitute for actual legal review.

## Sources

### Primary (HIGH confidence)
- Codebase read directly from `main` branch (2026-09-27): `app/api/webhooks/stripe/route.ts`, `lib/qstash.ts`, `lib/rate-limit.ts`, `middleware.ts`, `lib/supabase/server.ts`, `components/CookieBanner.tsx`, `components/MetaPixel.tsx`, migrations 038/044/055
- `.planning/PROJECT.md` — locked v4.0 decisions, target features, constraints

### Secondary (MEDIUM confidence)
- Chatwoot official docs (developers.chatwoot.com) — deployment requirements, webhooks, email/Instagram/WhatsApp channel setup, Dashboard Apps, Enterprise Edition scope
- EspoCRM official docs (docs.espocrm.com) — Entity Manager, API, webhooks, roles, Docker deployment
- GitHub issues: chatwoot/chatwoot #13809 (webhook HMAC mismatch), #8434 and #13860 (Instagram scope-mixing)
- GitHub Advisory GHSA-hgg8-54gw-8v33 (CVE-2025-12245, Dashboard App/widget iframe origin validation)
- Meta for Developers — WhatsApp Coexistence, pricing docs
- GDPR sources: gdpr-info.eu Art. 17

### Tertiary (LOW confidence)
- dev.to "Self-Hosted Chatwoot: 5 Failures the Docs Don't Warn You About" — single-source, corroborated on storage/backup points by official docs
- GitHub Discussion #5878 (Dashboard App security) — community discussion, not authoritative spec
- Various 2026 Caddy/Traefik/nginx comparison blog posts — cross-checked for consistency across multiple posts

---
*Research completed: 2026-09-27*
*Ready for roadmap: yes*
