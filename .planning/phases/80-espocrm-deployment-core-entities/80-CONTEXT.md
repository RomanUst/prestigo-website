# Phase 80: EspoCRM Deployment + Core Entities - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

EspoCRM (already running at `crm.rideprestigo.com` from Phase 76) is configured into Prestigo's B2B CRM:
Accounts (hotels, agencies/DMCs, corporates, embassies/event agencies) with Contacts linked to them, a Kanban
Opportunity pipeline with follow-up tasks and reminders, per-client negotiated rates, a read-only Booking entity
filled once from Supabase (full past history), the sales mailbox roman@ connected to EspoCRM only, and roles/ACL for
2–3 future operators in both EspoCRM and Chatwoot, documented in a runbook. Requirements: CRM-01..CRM-05.

Not in this phase: continuous booking/signup sync (Phase 82, SYNC-01/02), site lead capture (Phase 81), contact
de-dup across systems (Phase 82, SYNC-03), Chatwoot→CRM webhooks (Phase 83), stats (Phase 85), any CRM→site writes
(CRM-FUT-01).

</domain>

<decisions>
## Implementation Decisions

### Pipeline and account model (CRM-01, CRM-02)
- **D-01:** Opportunity stages (7, in order): New → First contact → Meeting/call → Rate sent → Trial ride → Partner (Won) / Lost. "Trial ride" is a real stage — hotels and concierges usually test one ride before committing. Stage labels in English in config; owner may rename in UI.
- **D-02:** Account `type` enum: Hotel, Travel agency / DMC, Corporate, Embassy / event agency, Other. The owner can add more values in Entity Manager; the config-as-code sync must **merge**, never overwrite or delete, enum values it did not create.
- **D-03:** Account commercial fields: commission/discount %, payment terms (card / invoice with terms / group Stripe link; billing details incl. VAT ID and reverse-charge flag), contract (date, validity, attached file), expected volume (rides per month).
- **D-04:** Negotiated prices differ per client → a child entity of Account (working name `PartnerRate`): route (free text, e.g. "PRG airport → city", "hourly", "Prague → Vienna"), vehicle class (E-Class / S-Class / V-Class), price EUR, valid from/to, note. Reference only in CRM — it does NOT drive site prices (site prices stay in `lib/route-prices.ts` / `lib/pricing-config.ts`). — **Reversibility:** costly — Phase 85 B2B stats and any future CRM→site pricing would build on this shape.
- **D-05:** Follow-ups are EspoCRM Tasks with due dates; reminders arrive in the CRM UI and by email via the existing Resend SMTP (Phase 76 D-18, `notifications@rideprestigo.com`) to the owner.

### Booking history (CRM-03)
- **D-06:** Phase 80 creates the read-only `Booking` entity AND runs a one-time, re-runnable backfill of all past bookings + their customers from Supabase. Continuous sync stays in Phase 82, which must update the same records (no second copy).
- **D-07:** Idempotency key = Supabase booking id stored on the EspoCRM Booking (unique). Re-running the backfill updates, never duplicates. Same for Contacts (keyed by normalized email). — **Reversibility:** costly — Phase 82 outbox and SYNC-04 rely on these keys.
- **D-08:** Scope: all bookings except abandoned/unpaid checkout attempts (paid, invoice/cash, admin-created, cancelled are included). Abandoned attempts become Leads in Phase 81 (LEAD-04).
- **D-09:** Booking fields: date/time, route (pickup → dropoff), vehicle class, status, amount EUR, link to the admin booking, **plus** passenger name, payment method (Stripe / invoice / cash), flight number and assigned driver, source (website / admin-created / GNet). Booking is read-only for all EspoCRM users (edits happen in the site admin).
- **D-10:** Booking → Contact by customer email; Contact → Account when the contact is linked to an Account, so the Account shows all its contacts' bookings. Hints for linking: corporate email domain and `customer_profiles.company_name`.

### Sales mailbox (CRM-04)
- **D-11:** Mailbox = **roman@rideprestigo.com** (reserved in Phase 77). Connected to EspoCRM only — never to Chatwoot, and no other app pulls it via IMAP/POP or forwarding (viewing in Hostinger webmail is fine). roman@ is never used as a Chatwoot agent email (Phase 77 runbook).
- **D-12:** Two-way: IMAP fetch of inbox + sent, and sending from EspoCRM through roman@'s Hostinger SMTP (mail lands in Sent). The owner enters the mailbox password in the EspoCRM UI personally; Claude never sees it.
- **D-13:** Mail from an unknown sender stays in the EspoCRM inbox without auto-creating a Contact or Lead; mail from known Contacts/Accounts auto-attaches to them and their open Opportunities.

### Seed data and roles (CRM-05)
- **D-14:** Initial Accounts via assisted auto-pick: a script scans bookings for corporate email domains and `company_name` values (e.g. TravelExpress, TLTGO, Traveltime), shows the owner a candidate list; the owner confirms which to create and their type. Nothing is created without that confirmation.
- **D-15:** Roles: **Dispatcher** — Contacts + Booking history (read), own Tasks; no Opportunities, no PartnerRate, no commission/contract fields. **Sales manager** — Accounts, Contacts, Opportunities, PartnerRate, Tasks, emails. **Admin** — owner only. Chatwoot mirror: agents in teams `bookings` (dispatcher) and `b2b` (sales); admin = owner.
- **D-16:** Money visibility: booking amounts visible to every role; negotiated rates, commission and contract terms only to Sales manager and Admin (field-level ACL).

### Claude's Discretion
- Config-as-code layout for EspoCRM (mirroring `infra/chatwoot/sync.mjs` + JSON: idempotent, `create=0 update=0` on second run), API auth method (API user with key/HMAC), entity/field naming, layouts, list views, Kanban setup.
- Backfill implementation (run from repo with service credentials read inside the script; batch size; dry-run that prints counts without writing to EspoCRM).
- How the dedicated "Other" type text and VAT/reverse-charge fields are modelled.
- EspoCRM UI language/currency defaults (EUR, English UI unless owner asks otherwise).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/ROADMAP.md` §"Phase 80: EspoCRM Deployment + Core Entities" — goal and success criteria
- `.planning/REQUIREMENTS.md` — CRM-01..05; SYNC-01..05 and LEAD-04/06 (boundaries with Phases 81/82); out-of-scope table (no Advanced Pack, no mailbox in both systems)
- `.planning/PROJECT.md` §Constraints ("v4.0 VPS independence", "Secrets") and §Key Decisions (EspoCRM choice, separate mailboxes)

### Prior phase decisions
- `.planning/phases/76-vps-infrastructure/76-CONTEXT.md` — D-06 backups, D-16 pinned image tags + upgrade runbook, D-17 public reachability/admin hardening, D-18 Resend SMTP for system mail
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md` — roman@ reserved for EspoCRM, D-14 one mailbox one system, teams/labels
- `infra/vps/runbooks/chatwoot-channels.md` — agent-email loop rule, roman@ exclusion

### Infrastructure
- `infra/vps/espocrm/compose.yml` — EspoCRM 10.0.8 + MariaDB 11.4.13 stack, volume layout (data, custom, client/custom)
- `infra/vps/env/espocrm.env.example`, `infra/vps/env/smtp.env.example` — env contract
- `infra/vps/runbooks/app-deploy.md`, `infra/vps/runbooks/upgrade.md`, `infra/vps/runbooks/backup-restore.md`

### Config-as-code pattern to mirror
- `infra/chatwoot/sync.mjs`, `infra/chatwoot/lib/client.mjs`, `infra/chatwoot/teams.json`, `infra/chatwoot/inspect.mjs`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `infra/chatwoot/sync.mjs` + JSON specs: idempotent declarative sync with create/update counts — template for an `infra/espocrm/sync.mjs`.
- `infra/chatwoot/lib/client.mjs`: API client pattern that reads credentials from `~/.config/prestigo/*.env` and never prints secrets.
- Supabase `customer_profiles.company_name` (migration 044) and billing address (migration 050) — linking/seed hints.
- `supabase/migrations/061_driver_assignments_trip_progress.sql` — driver assignment data for the Booking "driver" field.

### Established Patterns
- Secrets live in `~/.config/prestigo/*.env` (mode 600), read inside scripts; `.env.local` is never read directly.
- Supabase stays the source of truth; VPS apps are downstream and the site must not depend on them at runtime.
- Runbooks in `infra/vps/runbooks/*.md`, often guarded by a vitest test.

### Integration Points
- EspoCRM REST API on `crm.rideprestigo.com` (publicly reachable per Phase 76 D-17).
- Supabase (service role, read-only queries) for the backfill.
- Chatwoot teams/agents for the role mirror (`infra/chatwoot/teams.json`).

</code_context>

<specifics>
## Specific Ideas

- Known partners to expect in the auto-pick list: TravelExpress (group bookings), TLTGO (invoices), Traveltime (Maxime) — from the ops scripts at repo root.
- Admin booking link format should open the booking in the site admin bookings table.
- Trial ride is a deliberate pipeline stage for hotel concierges.

</specifics>

<deferred>
## Deferred Ideas

- Using PartnerRate to drive actual site/admin pricing for B2B clients — would be CRM→site write path (CRM-FUT-01), future milestone.
- Privacy-policy wording for EspoCRM processing — GDPR-02 (later phase of v4.0).

</deferred>

---

*Phase: 80-espocrm-deployment-core-entities*
