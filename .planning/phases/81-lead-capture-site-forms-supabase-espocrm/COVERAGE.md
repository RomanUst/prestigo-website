# Phase 81 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: EspoCRM 10.0.8 REST API from the site (new site-side client, `prestigo-sync` API key) and from the config-as-code tooling (Phase 80 tools, extended), Upstash QStash (publish + signature verification), Supabase (new tables, RPCs, triggers, pg_net, Vault, MCP for migrations/smokes), Vercel Cron.

## EspoCRM — site-side client (lib/espocrm-client.ts, lib/lead-sync.ts)

| capability | decision | reason |
|---|---|---|
| API-key authentication (`X-Api-Key`) | INTEGRATE | Sync writer identity from Vercel env (81-07) |
| HMAC API authentication | OPT-OUT | not needed: one host over TLS, API key already chosen in Phase 80 research |
| Password/token identity from the site | OPT-OUT | the site never holds an admin identity; metadata work stays in infra/espocrm (Phase 80 D-17) |
| Lead list with `where` equals filter (lookup by cSupabaseRef) | INTEGRATE | idempotent upsert key (81-07) |
| Lead create (POST) with `X-Skip-Duplicate-Check: true` | INTEGRATE | D-10 one Lead per submission (81-07) |
| Lead update (PUT, sync-owned attributes only) | INTEGRATE | D-06 status follows booking, references, admin link (81-07/09) |
| Lead delete | INTEGRATE | D-15/D-20 90-day purge of abandoned online checkouts (81-10) |
| Contact read with `where` equals on emailAddress | INTEGRATE | D-11 existing-customer mark (81-07) |
| Contact / Account / CBooking create or update | OPT-OUT | explicitly out of scope: D-09/D-12 (Phase 82 continuous sync owns Contacts/Bookings) |
| Lead conversion action (`/Lead/action/convert`) | OPT-OUT | explicitly out of scope: D-09 (Phase 82 links without conversion duplicates) |
| Mass update / mass delete | OPT-OUT | not needed: per-record idempotent writes are safer for mirrored data |
| Duplicate-check endpoint / 409 duplicate bodies | OPT-OUT | not needed: idempotency is cSupabaseRef, not email (D-10); 409 bodies hold PII and are never parsed |
| Stream posts / notes on Leads | OPT-OUT | not needed: D-04 no notification/Task for leads |
| Tasks / reminders for Leads | OPT-OUT | explicitly out of scope: D-04 |
| Assignment (`assignedUserId` on create) | INTEGRATE | D-13 all Leads to the owner (81-07) |
| Webhooks from EspoCRM | OPT-OUT | explicitly out of scope: Phase 83 (HOOK-01..04) |
| Attachments / documents on Leads | OPT-OUT | not needed: form inquiries carry no files |
| Data Privacy erase endpoint | OPT-OUT | explicitly out of scope: GDPR-01, Phase 82 |

## EspoCRM — config-as-code and probes (infra/espocrm, Phase 80 tools)

| capability | decision | reason |
|---|---|---|
| FieldManager create (Lead custom fields) | INTEGRATE | cSupabaseRef, cBookingReference, cReturnBookingReference, cAdminLink, cExistingCustomer (81-03) |
| FieldManager update of stock enum (Lead.source merge) | INTEGRATE | D-08 sources (81-06) |
| EntityManager createLink (Lead -> Contact) | INTEGRATE | D-11 existing-contact pointer (81-06) |
| Layout read / append (Lead detail, list) | INTEGRATE | owner sees site references (81-06) |
| Role update (Lead ACL) | INTEGRATE | D-22 (81-03) |
| Settings read / partial update | INTEGRATE | D-04 assignment-email check, change only if Lead emails are on (81-03) |
| User read (owner user id) | INTEGRATE | D-13 assignee id (81-03 inspect user-id) |
| Metadata read (links) | INTEGRATE | RESEARCH A4 verification (81-03/06) |
| Metadata overlay + `POST /Admin/rebuild` (Lead unique index) | INTEGRATE | defence in depth for D-05/D-10 idempotency (81-08) |
| Notification read | INTEGRATE | RESEARCH A6 observation at go-live, best effort (81-11) |
| Entity removal / field deletion / role deletion | OPT-OUT | not needed: the sync never deletes structure (Phase 80 rule) |

## Upstash QStash

| capability | decision | reason |
|---|---|---|
| `publishJSON` to the dispatcher URL | INTEGRATE | lib/outbox.ts publishOutboxDispatch (81-01) |
| `delay` (scheduled delivery) | INTEGRATE | backoff, deferrals, settle window (81-07/09) |
| `deduplicationId` | INTEGRATE | per-attempt / per-day dedup suffixes (81-01/07/10) |
| `Receiver.verify` (signature over raw body, with URL) | INTEGRATE | dispatcher authentication (81-07) |
| Built-in retries (`retries`) | OPT-OUT | not needed: the outbox row is the source of truth and the dispatcher schedules its own backoff; the route returns 200 for business outcomes |
| Dead-letter queue | OPT-OUT | not needed: failed rows stay in integration_outbox (status failed, code); DLQ keeps messages only 3 days on the free plan |
| Schedules (cron in QStash) | OPT-OUT | not needed yet: a daily Vercel cron is the safety net; a 10-minute QStash schedule is a possible follow-up if faster recovery is wanted (RESEARCH Open Question 7) |
| Flow control / rate limiting | OPT-OUT | not needed: lead volume is tiny and the sweep caps at 200 keys per run |
| Topics / URL groups / queues API | OPT-OUT | not needed: one endpoint |
| Callbacks / failure callbacks | OPT-OUT | not needed: outcomes are recorded in the outbox by the dispatcher itself |

## Supabase

| capability | decision | reason |
|---|---|---|
| New tables with RLS deny-all (integration_outbox, integration_config, inquiries) | INTEGRATE | 81-01 |
| SECURITY DEFINER RPCs (enqueue, claim, complete, reschedule, sweep functions) | INTEGRATE | 81-01, 81-10 |
| AFTER triggers (inquiries insert, bookings insert/status update) | INTEGRATE | 81-01, 81-09 |
| pg_net outbound HTTP (kick) | INTEGRATE | 81-09 |
| Vault secrets (kick URL + secret) | INTEGRATE | 81-09/81-11 |
| MCP apply_migration / execute_sql / list_tables / get_advisors | INTEGRATE | blocking schema pushes and rolled-back smokes (81-01/04/09/10/11) |
| Realtime / Database Webhooks product | OPT-OUT | not needed: triggers + outbox + pg_net cover delivery durably |
| Edge Functions | OPT-OUT | not needed: dispatcher runs as a Vercel route next to the existing QStash routes |
| Generated TypeScript types | OPT-OUT | not needed: repo uses untyped supabase-js |

## Vercel

| capability | decision | reason |
|---|---|---|
| Cron job (daily outbox sweep) | INTEGRATE | 81-10 |
| Production environment variables | INTEGRATE | owner sets ESPOCRM_* and OUTBOX_KICK_SECRET (81-11) |
| `after()` post-response work | INTEGRATE | publish after the form response (81-01) |
| Preview deployments for verification | OPT-OUT | not needed: Preview deploys always fail in this project (missing Supabase env); production + MCP are the verification surfaces |
