# Phase 80 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: EspoCRM 10.0.8 REST API + native CRM features (crm.rideprestigo.com), Supabase (read-only SQL export via MCP), Hostinger mail (roman@ IMAP/SMTP inside EspoCRM), Chatwoot CE (role/team mirror, documentation only), Resend (existing system SMTP for reminders), site admin bookings table (deep link).

## EspoCRM

| capability | decision | reason |
|---|---|---|
| API-key authentication (`X-Api-Key`, API user `prestigo-sync`) | INTEGRATE | D-17 data identity (plans 80-01, 80-07, 80-09, 80-12, 80-13) |
| Password-to-token exchange (`GET /App/user`, then token header) | INTEGRATE | D-17 config identity `prestigo-config` (plan 80-01) |
| HMAC API authentication | OPT-OUT | not needed: tiny call set over TLS to one host; API key chosen in research |
| Two-factor header (`Espo-Authorization-Code`) for scripts | OPT-OUT | D-17: config identity has no 2FA; owner admin keeps TOTP for the UI only |
| EntityManager createEntity / createLink | INTEGRATE | CBooking, CPartnerRate and their links (plans 80-04, 80-06) |
| EntityManager updateEntity / removeEntity / removeLink | OPT-OUT | sync never edits or deletes structure; removal is a manual owner action |
| FieldManager create / update | INTEGRATE | Account commercial fields, CBooking, CPartnerRate fields, enum merge (plans 80-04..80-06) |
| FieldManager delete field | OPT-OUT | sync never deletes fields (owner-made fields are untouchable) |
| Metadata read (`/Metadata/action/get`) | INTEGRATE | read-then-diff existence checks (all sync plans) |
| Layout read / update | INTEGRATE | CBooking/CPartnerRate list and detail layouts, Contact/Account relationship panels (plans 80-04, 80-06) |
| I18n read (enum labels) | INTEGRATE | merge-safe labels for D-01/D-02/D-20 (plan 80-05) |
| Settings read / partial update | INTEGRATE | EUR, Europe/Prague, b2cMode off (plan 80-01) |
| Admin rebuild (`POST /Admin/rebuild`) | INTEGRATE | applies the D-19 unique-index overlay (plan 80-08) |
| Custom metadata file overlay (VPS volume) | INTEGRATE | D-19 unique index on supabaseBookingId (plan 80-08) |
| Role create / update | INTEGRATE | Dispatcher, Sales manager, Sync writer (plan 80-07) |
| Role delete | OPT-OUT | sync never deletes roles (the restore-drill canary role and owner roles stay) |
| User create / update / delete | INTEGRATE | temporary ACL probe users (plan 80-07), Sync writer assignment (80-07), owner email for the personal mailbox (80-10) |
| Record CRUD: Contact, Account, CBooking, CPartnerRate | INTEGRATE | backfill, seeding, relink, ACL probes (plans 80-07, 80-09, 80-12, 80-13) |
| Duplicate check on Contact create (409) | INTEGRATE | treated as "existing" by the backfill (plan 80-09) |
| Mass update / mass delete endpoints | OPT-OUT | not needed: per-record idempotent writes; mass delete is never wanted on mirrored data |
| Built-in CSV Import tool | OPT-OUT | not keyed by Supabase id, so not idempotent; the REST backfill is re-runnable (D-07) |
| Kanban view for Opportunity | INTEGRATE | CRM-02 / D-01 (native, verified in plan 80-05) |
| Multi-pipeline (Pipeline / PipelineStage, 10.0) | OPT-OUT | one pipeline; enabling it makes the stage field read-only (research) |
| Tasks with due dates + reminders (Popup, Email) | INTEGRATE | D-05 (plan 80-10) |
| Meetings / Calls | OPT-OUT | not requested by D-05; stock entities stay available to the owner untouched |
| Personal Email Account (IMAP + SMTP) | INTEGRATE | D-11/D-12 roman@ (plan 80-10, owner enters the password) |
| Group Email Account / Inbound Email | OPT-OUT | D-11/D-13: adds case creation, auto-reply and shared visibility |
| Email Folders + personal Email Filter | INTEGRATE | keep system reminder mail out of the sales inbox (plan 80-10) |
| Email Templates | OPT-OUT | not requested in this phase |
| Mass Email / Campaigns / Target Lists | OPT-OUT | marketing outreach is not in CRM-01..05 |
| Email formula auto-attach to open Opportunity | OPT-OUT | D-24: explicitly out of scope; native threading + documented practice |
| Scheduled jobs CheckEmailAccounts / SendEmailReminders | INTEGRATE | verified active (plan 80-10) |
| Outbound webhooks | OPT-OUT | Phase 83 (HOOK-01..04) |
| Leads | OPT-OUT | Phase 81 (LEAD-01..06) |
| Cases / Knowledge Base / Portal | OPT-OUT | B2B pipeline does not use support cases or a customer portal |
| Documents module | OPT-OUT | D-03 contract file is a file field on Account; the canary Document stays untouched |
| Data Privacy marking (`isPersonalData`) | INTEGRATE | keeps GDPR erasure possible later (plan 80-04) |
| Data Privacy erase tool | OPT-OUT | GDPR-01, Phase 82 |
| Websocket live push | OPT-OUT | RAM budget (Phase 76); polling and popups suffice |
| Export / mass-update role permissions | INTEGRATE | set to "no" for human roles (plan 80-07) |
| Advanced Pack (BPM, reports, workflows) | OPT-OUT | out of scope per REQUIREMENTS |
| Dashlets / sales reports | OPT-OUT | Phase 85 (STAT-01..03) |
| Multi-currency rates | OPT-OUT | EUR only (Claude's discretion in CONTEXT) |
| Stream / audit on CBooking | OPT-OUT | read-only mirror; stream would only log sync writes |
| Extensions install | OPT-OUT | no extension needed; avoids upgrade-runbook coupling |

## Supabase

| capability | decision | reason |
|---|---|---|
| Read-only SQL export via MCP `execute_sql` | INTEGRATE | D-06 one-time backfill input; no service key on disk (plan 80-09) |
| Writes to Supabase | OPT-OUT | Supabase stays the source of truth; CRM-FUT-01 (no CRM to site writes) |
| Service-role direct read from scripts | OPT-OUT | no service key on disk; the MCP export (or the owner's SQL-editor copy) replaces it |
| Realtime / continuous sync | OPT-OUT | Phase 82 (SYNC-01/02) |

## Hostinger mail (roman@rideprestigo.com)

| capability | decision | reason |
|---|---|---|
| IMAP fetch (INBOX + Sent) | INTEGRATE | D-12 (plan 80-10) |
| SMTP send with Sent storage | INTEGRATE | D-12 (plan 80-10) |
| Forwarders / POP / second IMAP client | OPT-OUT | D-11 one mailbox, one system |
| Webmail viewing | INTEGRATE | D-11 allows it (documented in the runbook, plan 80-11) |

## Chatwoot CE

| capability | decision | reason |
|---|---|---|
| Built-in roles agent / administrator | INTEGRATE | CRM-05 / D-23 documented in the runbook (plan 80-11) |
| Teams Bookings / B2B + inbox membership | INTEGRATE | D-15/D-23 role mirror, documented (plan 80-11); teams already exist from Phase 77 |
| Agent creation via API | OPT-OUT | D-23: no hires yet; runbook gives the steps |
| Custom roles | OPT-OUT | paid/Enterprise feature, out of scope |
| roman@ as agent email or inbox | OPT-OUT | D-11 (verified absent in plan 80-10) |

## Resend (system SMTP from Phase 76)

| capability | decision | reason |
|---|---|---|
| Reminder emails from notifications@ | INTEGRATE | D-05, existing configuration reused unchanged (plan 80-10) |
| Changing SMTP settings | OPT-OUT | Phase 76 owns them; settings sync never sends SMTP keys |

## Site admin

| capability | decision | reason |
|---|---|---|
| `?search=` deep link with horizon all | INTEGRATE | D-18 (plan 80-02) |
| Any CRM to site write path | OPT-OUT | CRM-FUT-01 (deferred) |
