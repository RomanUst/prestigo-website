# API Coverage — Phase 84 Chatwoot Dashboard App

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: Chatwoot v4.18.0-ce (Dashboard App postMessage protocol, operator-token REST reads, Dashboard App registration API), Supabase (new read-only RPC `panel_bookings`, migration 080). Reused without new surface: Upstash rate limiter, Vercel env.

## Chatwoot — Dashboard App iframe protocol (app/embed/chatwoot-dashboard, plans 84-07, 84-08)

| capability | decision | reason |
|---|---|---|
| `chatwoot-dashboard-app:fetch-info` request to the parent | INTEGRATE | handshake with retry, exact target origin (84-07) |
| `appContext` reply / load push | INTEGRATE | accepted only from the exact Chatwoot origin and `window.parent` (84-07) |
| `appContext.data.conversation.id` | INTEGRATE | the only lookup key sent to the API (D-03) |
| `appContext.data.theme` | INTEGRATE | light/dark rendering (D-07, 84-07/84-08) |
| `appContext.data.contact` | OPT-OUT | explicitly out of scope: D-03 forbids trusting contact data from postMessage; the server re-reads the contact |
| `appContext.data.currentAgent` | OPT-OUT | explicitly out of scope: operator identity is proven by the operator token against Chatwoot, not by the message (D-01) |
| `appContext.data.customAttributes` | OPT-OUT | not needed: the panel shows bookings from Supabase, not Chatwoot attributes (82 D-02 already shows the summary) |
| conversation switch (iframe remount) | INTEGRATE | cold-start path on every switch, refresh on focus/visibility/30 s (84-07, 84-08) |

## Chatwoot — REST API with the operator's token (lib/chatwoot-operator.ts, plan 84-02)

| capability | decision | reason |
|---|---|---|
| GET /api/v1/profile | INTEGRATE | proves a human agent and account membership (D-01) |
| GET /api/v1/accounts/{id}/conversations/{display_id} | INTEGRATE | per-request access check (ConversationPolicy, D-04) and the contact's email/phone/hmac_verified (D-03) |
| conversation messages / message create | OPT-OUT | explicitly out of scope: PANEL-02 read-only; the operator replies in Chatwoot itself |
| conversation status, labels, assignment, custom attributes (writes) | OPT-OUT | explicitly out of scope: PANEL-02 read-only |
| contact show / update / merge | OPT-OUT | not needed: the conversation payload carries the contact keys; updates are out of scope (read-only) |
| contacts search / filter | OPT-OUT | explicitly out of scope: D-12 and the deferred "manual booking search" idea — the panel is not a lookup tool |
| agent bot / AgentBot tokens | OPT-OUT | explicitly out of scope: bots are rejected by /profile; the panel is for human operators |

## Chatwoot — Dashboard App registration (infra/chatwoot/sync.mjs, plan 84-06)

| capability | decision | reason |
|---|---|---|
| GET /api/v1/accounts/{id}/dashboard_apps | INTEGRATE | idempotent plan (match by title) |
| POST /api/v1/accounts/{id}/dashboard_apps | INTEGRATE | create the Bookings app from git |
| PATCH /api/v1/accounts/{id}/dashboard_apps/{id} | INTEGRATE | repair a drifted URL |
| DELETE /api/v1/accounts/{id}/dashboard_apps/{id} | OPT-OUT | not needed: sync never deletes operator-made apps; removal stays a manual Settings action |
| GET /api/v1/accounts/{id}/dashboard_apps/{id} | OPT-OUT | not needed: the list response carries every field the sync compares |

## Supabase (migration 080, lib/panel-bookings.ts, plan 84-01)

| capability | decision | reason |
|---|---|---|
| RPC `panel_bookings(text, text, bigint)` via service role | INTEGRATE | read-only booker lookup with Phase 82 identity rules |
| table reads/writes from the panel path | OPT-OUT | explicitly out of scope: the structural guard forbids `.from(` and any write (PANEL-02) |
| Supabase auth session (cookie client) | OPT-OUT | explicitly out of scope: PANEL-02 forbids the admin session cookie |
