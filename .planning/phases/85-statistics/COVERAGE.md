# Phase 85 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Integrated services: Chatwoot CE Application API (one read-only call, owner-run backfill script `infra/chatwoot/channel-backfill.mjs`, plan 85-04), the existing Phase 83 Chatwoot webhook intake (unchanged transport; it now also persists the conversation's channel class), Supabase (SQL RPCs via the service-role client; migrations applied by the orchestrator through Supabase MCP). EspoCRM is not touched by this phase (D-07, backlog 999.11 WR-03: conversion is computed from Supabase only). The stats page and its routes call no external API at render time (D-04).

## Chatwoot

| capability | decision | reason |
|---|---|---|
| Conversation read (`GET /api/v1/accounts/{account}/conversations/{id}`, `meta.channel`) | INTEGRATE | D-04 one-time backfill of `chat_leads.channel` (plan 85-04 Tasks 2-3) |
| API-token auth via `loadChatwootConfig` (owner token file) | INTEGRATE | existing infra/chatwoot convention; token never in argv or output (plan 85-04) |
| Webhook payload `conversation.channel` / `meta.channel` (already parsed by lib/chat-io.ts) | INTEGRATE | D-04 intake write path: `leadFor` passes it to `reserveLead` (plan 85-04 Task 1) |
| Inbox list / inbox detail endpoints | OPT-OUT | not needed: the conversation payload already carries the channel class |
| Conversation list / search endpoints | OPT-OUT | not needed: the conversation ids come from Supabase `chat_conversations` |
| Any write endpoint (conversations, contacts, labels, messages) | OPT-OUT | explicitly out of scope: the backfill is GET-only and Phase 85 is read-only |
| Reports / metrics API (response time, conversations per agent) | OPT-OUT | explicitly out of scope: deferred idea "conversation metrics" in 85-CONTEXT |
| Render-time Chatwoot calls from `/admin/stats` | OPT-OUT | explicitly prohibited by D-04 (stats read Supabase only; infra-vps-isolation guard) |

## Supabase

| capability | decision | reason |
|---|---|---|
| `rpc('stats_conversion' / 'stats_customers' / 'stats_b2b')` through the service-role client | INTEGRATE | STAT-01/02/03 data (plans 85-01, 85-02, 85-03) |
| `rpc('chat_lead_reserve')` with the new `p_channel` argument | INTEGRATE | D-04 (plans 85-01, 85-04) |
| Supabase MCP `apply_migration` / `execute_sql` / `get_advisors` (orchestrator only) | INTEGRATE | migrations 081/082, rolled-back smokes, backfill apply (plans 85-01, 85-03, 85-04) |
| Realtime / storage / edge functions | OPT-OUT | not needed: a read-only dashboard fetched on demand |
