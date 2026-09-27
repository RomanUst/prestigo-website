# Requirements: Prestigo — rideprestigo.com

**Defined:** 2026-09-27
**Milestone:** v4.0 Helpdesk + CRM
**Core Value:** Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

Milestone goal: every conversation from every channel lands in one Chatwoot inbox, every inquiry and every customer who ever booked is retained in EspoCRM (B2B pipeline + repeat-sales base), both self-hosted on a Hostinger VPS and linked two-way with production. Supabase stays the source of truth for bookings/customers; the public site never depends on VPS uptime.

## v1 Requirements

### Infrastructure (INFRA)

- [ ] **INFRA-01**: Owner can reach Chatwoot at `chat.rideprestigo.com` and EspoCRM at `crm.rideprestigo.com` over valid auto-renewing HTTPS (Hostinger KVM 2 — upgrade to KVM 4 on documented trigger — Docker Compose, Caddy, EU region)
- [ ] **INFRA-02**: Chatwoot and EspoCRM databases and attachment storage are backed up nightly, encrypted, to offsite storage, and a restore drill onto a clean host has been performed successfully
- [ ] **INFRA-03**: Owner receives an alert on a channel independent of the VPS when Chatwoot or EspoCRM is down or a nightly backup did not run
- [ ] **INFRA-04**: VPS receives unattended security OS updates; Chatwoot/EspoCRM versions are pinned and upgraded only via a documented runbook (backup → upgrade → smoke check)
- [ ] **INFRA-05**: With the VPS fully offline, the public site, booking wizard, Stripe payment and all emails keep working, and no lead or booking event is lost (delivered once the VPS is back — isolation verified in Phase 76, delivery-after-recovery verified in Phases 81/82)

### Helpdesk Channels (INBOX)

- [ ] **INBOX-01**: Emails to the service mailboxes (info@ / booking@) arrive as Chatwoot conversations and operator replies are sent from that same address; these mailboxes are connected to Chatwoot only
- [ ] **INBOX-02**: Visitor sees a lightweight chat button on the site (all 7 locales, RTL-correct) that loads no third-party script or cookie until clicked; clicking opens the Chatwoot widget and starts a conversation
- [ ] **INBOX-03**: Signed-in customers open the widget already identified (HMAC identity validation), so their conversation attaches to their existing contact
- [ ] **INBOX-04**: Adding the widget causes no CSP violations (CSP in `middleware.ts` + `csp_baseline.json` updated as a reviewed diff) and no measurable LCP/INP regression on home, route and /book pages
- [ ] **INBOX-05**: Messages to the Prestigo Telegram bot arrive as Chatwoot conversations and can be answered from Chatwoot
- [ ] **INBOX-06**: Owner can see reports of conversation volume, first-response time and resolution time per channel in Chatwoot

### WhatsApp (WA)

- [ ] **WA-01**: WhatsApp messages to +420 725 986 855 arrive in Chatwoot and can be answered from Chatwoot, while the WhatsApp Business app on the phone keeps working with the same number and history (Coexistence onboarding; Meta Business verified)
- [ ] **WA-02**: Operator can message a customer outside the 24-hour window using pre-approved WhatsApp templates (booking change, payment help, review request, trip reminder)
- [ ] **WA-03**: A documented runbook covers WhatsApp channel recovery, current per-message pricing and the rule that inboxes are never deleted without a fresh backup

### Social Channels (SOC)

- [ ] **SOC-01**: Instagram direct messages to the Prestigo account arrive in Chatwoot and can be answered from Chatwoot
- [ ] **SOC-02**: Facebook Page messages arrive in Chatwoot and can be answered from Chatwoot

### CRM (CRM)

- [ ] **CRM-01**: Owner can manage Accounts (hotels, agencies, corporates) and Contacts in EspoCRM, with each Contact linked to its Account
- [ ] **CRM-02**: Owner can move B2B Opportunities through a Kanban pipeline with Prestigo-specific stages and set follow-up tasks/reminders
- [ ] **CRM-03**: Each Contact/Account in EspoCRM shows its full booking history (read-only Booking entity synced from Supabase: date, route, vehicle, status, amount, link to admin booking)
- [ ] **CRM-04**: Sales mail (sales@ or roman@) is connected to EspoCRM only; sent and received emails attach to the matching Account/Contact/Opportunity
- [ ] **CRM-05**: Roles and permissions for 2–3 future operators exist in both Chatwoot (agent/admin, team assignment) and EspoCRM (role-based ACL), documented in a runbook

### Lead Capture (LEAD)

- [ ] **LEAD-01**: Every contact-form submission is stored in Supabase (`inquiries`) in addition to the existing email, and appears as a Lead in EspoCRM
- [ ] **LEAD-02**: Every corporate-form submission is stored and appears as a Lead (with company) in EspoCRM
- [ ] **LEAD-03**: Every multi-day quote request is stored and appears as a Lead in EspoCRM with its itinerary details
- [ ] **LEAD-04**: Other lead signals are captured as Leads: abandoned/unpaid checkouts and calculator email captures (with consent-appropriate retention)
- [ ] **LEAD-06**: Every booking made on the site (paid or not, incl. round-trip and multi-day) also creates/updates a Lead in EspoCRM with source "Website booking"; the Lead status follows the booking (paid → Converted, cancelled/abandoned → Dead)
- [ ] **LEAD-05**: If inquiry storage fails, the customer submission still succeeds and the existing email path still fires (no regression of today's behaviour)

### Site → CRM/Chatwoot Sync (SYNC)

- [ ] **SYNC-01**: Every booking create, payment, status change and admin edit is reflected in EspoCRM (Contact + Booking) and on the Chatwoot contact within minutes, delivered via a durable Supabase outbox + QStash with retries and idempotency (no duplicates on retry)
- [ ] **SYNC-02**: Every customer account signup creates/updates the matching Contact in EspoCRM and Chatwoot
- [ ] **SYNC-03**: Contacts are de-duplicated across site, Chatwoot and EspoCRM by normalized email OR E.164 phone; shared phones (hotel/office desks) are flagged and excluded from auto-merge, and an admin can split a wrong merge
- [ ] **SYNC-04**: A one-time backfill imports every past customer and booking from Supabase into EspoCRM and Chatwoot, so no customer who ever booked is missing
- [ ] **SYNC-05**: Admin can see outbox health (pending / failed events, last error) and retry failed events

### Chatwoot → CRM (HOOK)

- [ ] **HOOK-01**: A new Chatwoot conversation from an unknown person creates/updates a Contact and Lead in EspoCRM (with channel as lead source)
- [ ] **HOOK-02**: When a conversation is resolved, its summary/transcript link is written to the Contact's history in EspoCRM
- [ ] **HOOK-03**: Inbound webhooks (Chatwoot, EspoCRM) are verified (HMAC signature over raw body, timestamp replay window, delivery dedup) and structurally cannot write to `bookings` / `customer_profiles`
- [ ] **HOOK-04**: Site → CRM → webhook → site echo loops cannot occur (origin tagging / fingerprinting on outbound writes)

### Dashboard App (PANEL)

- [ ] **PANEL-01**: Inside a Chatwoot conversation the operator sees the customer's bookings from the site (upcoming + past, status, payment, link into /admin) in the sidebar
- [ ] **PANEL-02**: The panel is read-only, only renders when embedded in Prestigo's Chatwoot (frame-ancestors + origin-validated postMessage), never uses the admin session cookie, and runs on a Chatwoot version patched for CVE-2025-12245

### Operations (OPS)

- [ ] **OPS-01**: Operator can send each message currently sent by root `send-*.mjs` scripts (time change, vehicle change, payment help, post-trip review, login help) as Chatwoot canned responses/macros, multilingual where relevant
- [ ] **OPS-02**: Chatwoot automation assigns and labels new conversations by channel/topic (e.g. booking, B2B, complaint)

### Statistics (STAT)

- [ ] **STAT-01**: `/admin/stats` shows inquiries → bookings conversion by source/channel for a chosen period
- [ ] **STAT-02**: `/admin/stats` shows repeat-customer rate and a list of top repeat customers
- [ ] **STAT-03**: `/admin/stats` shows B2B revenue and bookings per Account (hotel/agency/corporate)

### Privacy (GDPR)

- [ ] **GDPR-01**: A single erasure request removes/anonymises the person in Supabase, Chatwoot and EspoCRM (erasure event through the outbox), with an audit record
- [ ] **GDPR-02**: Privacy policy (all locales) names Chatwoot/EspoCRM processing, the VPS host/region, channels, retention periods and the chat widget

## v2 Requirements

Deferred — tracked, not in this roadmap.

- **DRV-01**: Customer ↔ driver messaging via Chatwoot in the 24 h before a trip
- **CRM-FUT-01**: EspoCRM pipeline changes reflected back on the site (CRM → site write path)
- **OPS-FUT-01**: Marketing automations / segmented campaigns to past customers
- **INBOX-FUT-01**: Chatwoot AI assistant / auto-translation
- **AUTO-FUT-01**: Automatic unpaid-reminder emails (FOLLOW-01)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Chatwoot Enterprise / EspoCRM Advanced Pack | Not needed for 1–3 operators; automation lives in repo code |
| n8n / Zapier / Make middleware | Locked decision: integration logic in repo (tested, versioned) |
| One mailbox connected to both Chatwoot and EspoCRM | Duplicates, double replies, broken reply-time stats |
| CRM or Chatwoot writing bookings/customers | Supabase is the single source of truth |
| Reusing `quote_leads` for inquiries | Has 30-day purge + deny-all RLS for ephemeral captures |
| Hard WhatsApp number migration | Would strand the live +420 number and history; Coexistence only |
| Loading the Chatwoot widget script on page load | CWV/SEO and consent risk; facade button instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 76 | Pending |
| INFRA-02 | Phase 76 | Pending |
| INFRA-03 | Phase 76 | Pending |
| INFRA-04 | Phase 76 | Pending |
| INFRA-05 | Phase 76 | Pending |
| INBOX-01 | Phase 77 | Pending |
| INBOX-02 | Phase 77 | Pending |
| INBOX-03 | Phase 77 | Pending |
| INBOX-04 | Phase 77 | Pending |
| INBOX-05 | Phase 77 | Pending |
| INBOX-06 | Phase 77 | Pending |
| WA-01 | Phase 78 | Pending |
| WA-02 | Phase 78 | Pending |
| WA-03 | Phase 78 | Pending |
| SOC-01 | Phase 79 | Pending |
| SOC-02 | Phase 79 | Pending |
| CRM-01 | Phase 80 | Pending |
| CRM-02 | Phase 80 | Pending |
| CRM-03 | Phase 80 | Pending |
| CRM-04 | Phase 80 | Pending |
| CRM-05 | Phase 80 | Pending |
| LEAD-01 | Phase 81 | Pending |
| LEAD-02 | Phase 81 | Pending |
| LEAD-03 | Phase 81 | Pending |
| LEAD-04 | Phase 81 | Pending |
| LEAD-05 | Phase 81 | Pending |
| LEAD-06 | Phase 81 | Pending |
| SYNC-01 | Phase 82 | Pending |
| SYNC-02 | Phase 82 | Pending |
| SYNC-03 | Phase 82 | Pending |
| SYNC-04 | Phase 82 | Pending |
| SYNC-05 | Phase 82 | Pending |
| HOOK-01 | Phase 83 | Pending |
| HOOK-02 | Phase 83 | Pending |
| HOOK-03 | Phase 83 | Pending |
| HOOK-04 | Phase 83 | Pending |
| PANEL-01 | Phase 84 | Pending |
| PANEL-02 | Phase 84 | Pending |
| OPS-01 | Phase 77 | Pending |
| OPS-02 | Phase 77 | Pending |
| STAT-01 | Phase 85 | Pending |
| STAT-02 | Phase 85 | Pending |
| STAT-03 | Phase 85 | Pending |
| GDPR-01 | Phase 82 | Pending |
| GDPR-02 | Phase 82 | Pending |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-27*
*Last updated: 2026-09-27 after ROADMAP.md creation — all 45 v1 requirements mapped to Phases 76-85*
