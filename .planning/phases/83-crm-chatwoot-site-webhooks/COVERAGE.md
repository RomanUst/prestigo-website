# Phase 83 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: Chatwoot v4.18.0-ce (account webhooks inbound + site-side REST reads/writes), EspoCRM 10.0.8 (webhooks inbound + site-side Sync writer REST + owner-run Webhook entity management), Supabase (new tables/RPCs 076-078, MCP for apply/smoke), Upstash QStash (reused), Vercel (env + logs, reused).

## Chatwoot — inbound account webhook (app/api/webhooks/chatwoot, infra/chatwoot/webhook.mjs)

| capability | decision | reason |
|---|---|---|
| message_created event | INTEGRATE | HOOK-01 intake on the first incoming message (83-01, 83-16, 83-07) |
| conversation_status_changed event | INTEGRATE | HOOK-02 resolve history entry (83-16, 83-08) |
| conversation_updated event | INTEGRATE | D-07/D-20 no-lead label (83-16, 83-10) |
| contact_updated event | INTEGRATE | D-12 operator contact edits (83-16, 83-10) |
| HMAC signature + timestamp + delivery headers | INTEGRATE | HOOK-03 verification, replay window, dedup (83-01, 83-16) |
| webhook CRUD via API (list, create, update subscriptions, delete) | INTEGRATE | config-as-code registration and rotation (83-06) |
| conversation_created event | OPT-OUT | not needed: D-03 creates the Lead on the first incoming message, not on conversation creation |
| contact_created event | OPT-OUT | not needed: a contact without a message creates nothing; contact data changes arrive as contact_updated |
| message_updated event | OPT-OUT | not needed: edits of messages do not change Lead or history semantics |
| webwidget_triggered event | OPT-OUT | not needed: widget opened without writing creates nothing (D-03) |
| inbox_created / inbox_updated events | OPT-OUT | not needed: inbox names are re-read at dispatch time |
| conversation_typing_on / typing_off events | OPT-OUT | not needed: no CRM meaning |
| API-inbox / agent-bot webhooks | OPT-OUT | explicitly out of scope: unsigned in v4.18 (RESEARCH State of the Art) |

## Chatwoot — site-side REST client (lib/chat-io.ts, lib/chat-contact.ts, lib/espo-contact-hook.ts, lib/chatwoot-sync.ts)

| capability | decision | reason |
|---|---|---|
| conversation show (by display id) | INTEGRATE | handlers re-read state; payload is a hint (83-07) |
| conversation messages list with after= paging | INTEGRATE | first message, count, summary note (83-07, 83-08) |
| inbox show | INTEGRATE | inbox name in Lead description and history entry (83-07) |
| contact show | INTEGRATE | D-12 and D-14 re-read (83-07, 83-10, 83-11) |
| contact update (name, phone, company_name, site_sync_fp attributes) | INTEGRATE | D-14 push and HOOK-04 origin tag (83-10, 83-11) |
| send message / private note / change conversation status or labels | OPT-OUT | explicitly out of scope: the site never writes conversations (only reads them) |
| contact create / merge / delete | OPT-OUT | not needed here: covered by the Phase 82 sync and erasure clients, unchanged |
| reports API | OPT-OUT | not needed: statistics are Phase 85 |

## EspoCRM — inbound webhook (app/api/webhooks/espocrm, infra/espocrm/webhook.mjs)

| capability | decision | reason |
|---|---|---|
| Contact.update event | INTEGRATE | D-13 Contact edits -> Chatwoot (83-11) |
| `Signature` header verification | INTEGRATE | HOOK-03 (83-11) |
| Webhook entity create / list / delete as the API user, skipOwn | INTEGRATE | D-14 / HOOK-04 echo guard at the source (83-05) |
| legacy X-Signature header | OPT-OUT | not needed: same HMAC, weaker encoding, removed in v11 (RESEARCH Pitfall 2) |
| Contact.create / Contact.delete events | OPT-OUT | explicitly out of scope: D-13 scope = Contact edits only |
| Lead.* events (status changes) | OPT-OUT | explicitly out of scope: D-13 / Deferred Ideas (no Lead-status read-back) |
| Account.* / CBooking.* events | OPT-OUT | explicitly out of scope: bookings and accounts are never read back (D-13, isolation) |
| merge / split events | OPT-OUT | explicitly out of scope: Deferred Ideas (82 D-06 keeps split/merge on the site) |

## EspoCRM — site-side Sync writer REST (lib/chat-io.ts, lib/chat-*.ts, lib/crm-sync.ts, lib/erasure.ts)

| capability | decision | reason |
|---|---|---|
| Lead create (X-Skip-Duplicate-Check, 409 converge) | INTEGRATE | HOOK-01 chat Lead (83-07) |
| Lead list by cSupabaseRef / emailAddress, read status | INTEGRATE | D-02 one open Lead, D-20 adoption (83-07) |
| Lead update (status Dead/Converted, contact link, booking ref, admin link) | INTEGRATE | D-07, D-05, D-12; emailAddress only when empty (83-09, 83-10) |
| Contact create / find by email or phone / fill-empty update | INTEGRATE | HOOK-01, D-04, D-12 (83-07, 83-10) |
| Note create (Post on Contact / Lead) | INTEGRATE | HOOK-02 history entry, D-02 append, D-05 conversion note (83-07, 83-08, 83-09) |
| Entity stream read | INTEGRATE | idempotency markers and erasure Note scrub (83-07, 83-08, 83-09) |
| Note update + delete | INTEGRATE | erasure scrub-then-delete (83-09) |
| Lead convert action | OPT-OUT | not needed: D-05 sets status Converted and links the booking; no Opportunity/Account is created (80 D-14) |
| Call / Meeting history records | OPT-OUT | not needed: Stream Note needs no new role scopes (RESEARCH Alternatives) |
| Account write | OPT-OUT | explicitly out of scope: carried-forward field ownership |

## Upstash QStash and Supabase

| capability | decision | reason |
|---|---|---|
| publishJSON with delay + deduplicationId (after() post-response) | INTEGRATE | receivers hand rows to the existing dispatcher (83-01, 83-11) |
| Receiver.verify on the dispatcher | INTEGRATE | unchanged reuse |
| Supabase SECURITY DEFINER RPCs (076-078) | INTEGRATE | ingest, identity, registry (83-01..83-03) |
| Supabase MCP apply_migration / execute_sql / get_advisors | INTEGRATE | orchestrator applies and smokes migrations (83-01..83-03, 83-14, 83-15) |
| QStash schedules for a reconcile job | OPT-OUT | not needed yet: D-21 — backlog 999.10, manual recovery in the runbook |
