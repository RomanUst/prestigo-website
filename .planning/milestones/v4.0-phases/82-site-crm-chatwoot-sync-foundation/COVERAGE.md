# Phase 82 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: Chatwoot v4.18.0-ce REST API (new site-side client, contacts), EspoCRM 10.0.8 REST API (site-side Sync writer client, extended from Phase 81), Upstash QStash (reused), Supabase (tables, RPCs, triggers, pg_net, auth admin API, MCP), Resend (owner digest), Vercel (env, existing cron).

## Chatwoot — site-side client (lib/chatwoot-client.ts, lib/chatwoot-sync.ts, lib/erasure.ts)

| capability | decision | reason |
|---|---|---|
| contacts filter (exact equal_to on email, phone_number, identifier) | INTEGRATE | find step of the contact sync (82-10), shape confirmed by the live probe |
| contact show (GET /contacts/:id) | INTEGRATE | cached chatwoot_contact_id check (82-10) |
| contact create | INTEGRATE | D-01 contact for every customer (82-10) |
| contact update incl. custom_attributes | INTEGRATE | D-02 attributes, D-03 fill-only-when-empty (82-10) |
| contact merge action | INTEGRATE | two-candidate auto-merge through the admin client (82-10) |
| contact delete | INTEGRATE | D-09 erasure with the admin client (82-12) |
| contacts list meta count | INTEGRATE | post-backfill verification via inspect --contacts-count (82-09) |
| custom attribute definitions (config-as-code) | INTEGRATE | D-02 attribute catalogue (82-03, applied 82-14) |
| contacts search (partial ILIKE) | OPT-OUT | not needed: filter is exact and search is rate-limited to 100/min |
| contact inboxes / contact_inboxes create | OPT-OUT | not needed: D-01 needs only the contact; the widget identify links the inbox when the customer writes |
| conversations / messages | OPT-OUT | explicitly out of scope: the site never messages customers; per-booking history is Phase 84 |
| contact notes | OPT-OUT | not needed: D-02 is delivered through attributes |
| contact labels | OPT-OUT | not needed yet |
| contacts CSV import | OPT-OUT | not needed: the backfill replays the live handlers (RESEARCH backfill design) |
| agents / account management | OPT-OUT | not needed: the owner creates the sync users by hand (82-14) |
| webhooks from Chatwoot | OPT-OUT | explicitly out of scope: Phase 83 |
| reports API | OPT-OUT | not needed |

## EspoCRM — site-side Sync writer client (lib/crm-sync.ts, lib/erasure.ts)

| capability | decision | reason |
|---|---|---|
| Contact list with where equals emailAddress | INTEGRATE | find-or-create person Contact (82-07), erasure lookup (82-12) |
| Contact read by id | INTEGRATE | cached espo_contact_id (82-07) |
| Contact create with X-Skip-Duplicate-Check | INTEGRATE | identity table already decided it is a new person (82-07) |
| Contact update (emailAddressData merge/split, phoneNumber only when empty) | INTEGRATE | field ownership matrix, D-04/D-06 (82-07) |
| Contact scrub + delete | INTEGRATE | D-09 erasure (82-12) |
| CBooking list with where in (fallback equals) | INTEGRATE | per-person booking upsert (82-07) |
| CBooking create / update | INTEGRATE | SYNC-01, D-08 anonymised blanking (82-07) |
| Lead lookup by emailAddress / cSupabaseRef, scrub + delete | INTEGRATE | D-09 erasure (82-12) |
| Lead create / update (Phase 81 lead capture) | INTEGRATE | unchanged from Phase 81 |
| Role update (config-as-code, Sync writer Contact delete) | INTEGRATE | 82-12, applied 82-14 |
| CBooking delete | OPT-OUT | explicitly out of scope: D-08 keeps bookings anonymised for accounting |
| Account write | OPT-OUT | explicitly out of scope: carried-forward field ownership (sync never writes Accounts) |
| Lead convert action | OPT-OUT | explicitly out of scope: Phase 81 D-09 |
| DataPrivacy erase action | OPT-OUT | not needed: unverified on 10.0.8 (RESEARCH A2); scrub-then-delete covers soft and hard delete |
| Email / Task / stream records of a Contact | OPT-OUT | not needed yet: Sync writer has no access; manual checklist in the runbook (RESEARCH Open Question 6) |
| Settings cleanupDeletedRecordsPeriod | OPT-OUT | not needed: personal fields are blanked before the soft delete |
| Mass update / mass delete | OPT-OUT | not needed: per-record convergent writes |
| Webhooks from EspoCRM | OPT-OUT | explicitly out of scope: Phase 83 |

## Upstash QStash

| capability | decision | reason |
|---|---|---|
| publishJSON with delay and deduplicationId | INTEGRATE | fan-out, retries, admin retry, split and erasure publishes (reused lib/outbox.ts) |
| Receiver.verify | INTEGRATE | dispatcher authentication (reused) |
| built-in retries | OPT-OUT | not needed: the outbox row is the source of truth (Phase 81) |
| dead-letter queue | OPT-OUT | not needed: failed rows stay in integration_outbox and on /admin/outbox |
| schedules | OPT-OUT | not needed yet: daily Vercel sweep is the safety net (RESEARCH Pitfall 9) |
| flow control / topics / callbacks | OPT-OUT | not needed: small volume, one endpoint, outcomes recorded by the dispatcher |

## Supabase

| capability | decision | reason |
|---|---|---|
| new tables with RLS deny-all | INTEGRATE | identity tables, erasure_requests, identity_admin_log (82-01, 82-08, 82-12) |
| SECURITY DEFINER RPCs | INTEGRATE | resolvers, admin, backfill, erasure (069-075) |
| AFTER triggers | INTEGRATE | bookings_crm_sync, customer_profiles_crm_sync (82-01) |
| pg_net kick | INTEGRATE | reused outbox_kick for capture and backfill keys |
| auth admin deleteUser | INTEGRATE | D-10 account deletion (82-12) |
| MCP apply_migration / execute_sql / get_advisors | INTEGRATE | orchestrator schema pushes and rolled-back smokes |
| Realtime / Database Webhooks product | OPT-OUT | not needed: triggers + outbox cover delivery |
| Edge Functions | OPT-OUT | not needed: dispatcher stays a Vercel route |
| generated TypeScript types | OPT-OUT | not needed: repo uses untyped supabase-js; live schema dumped to 82-LIVE-SCHEMA.md |

## Resend

| capability | decision | reason |
|---|---|---|
| emails.send | INTEGRATE | D-11 owner digest (82-06) |
| batch send / domains / audiences | OPT-OUT | not needed |

## Vercel

| capability | decision | reason |
|---|---|---|
| production environment variables | INTEGRATE | owner sets CHATWOOT_* and ERASURE_HMAC_KEY (82-14) |
| existing daily cron (outbox sweep) | INTEGRATE | digest step added (82-06) |
| additional or sub-daily crons | OPT-OUT | not needed: Hobby plan is daily-only and the kick gives minute latency |
| preview deployments for verification | OPT-OUT | not needed: Preview deploys always fail in this project; production + MCP are the verification surfaces |
