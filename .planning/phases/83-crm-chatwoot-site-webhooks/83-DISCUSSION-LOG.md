# Phase 83: CRM/Chatwoot → Site Webhooks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 83-crm-chatwoot-site-webhooks
**Areas discussed:** When a conversation becomes a Lead, Resolved-conversation summary, Purpose of the EspoCRM webhook, What the webhook writes to Supabase

---

## When a conversation becomes a Lead

| Question | Options | Selected |
|----------|---------|----------|
| Who is "unknown" | No booking and no account ✓ / Any new conversation | No booking and no account |
| Repeat conversation, still no booking | One open Lead per person ✓ / New Lead per conversation | One open Lead per person |
| When to create | First customer message ✓ / conversation_created / First operator reply | First customer message |
| No email/phone (Telegram) | Lead without Contact ✓ / Skip until contact known / Contact by name | Lead without Contact |
| Chat stranger later books | Auto Converted ✓ / Manual | Auto Converted |
| Known customer starts a conversation | Summary at resolve only ✓ / Start + summary entries | Summary at resolve only |
| Spam / non-target mail | `no-lead` label + auto filter ✓ / Manual cleanup / No Leads from email inboxes | `no-lead` label + auto filter |

## Resolved-conversation summary

| Question | Options | Selected |
|----------|---------|----------|
| Entry content | Card + link ✓ / Link and date only / Full transcript | Card + link |
| Human summary | From operator private note ✓ / AI summary / None | From operator private note |
| Reopened and resolved again | New entry per resolve ✓ / One entry per conversation, updated | New entry per resolve |
| No Contact yet | On the Lead's history ✓ / Nowhere | On the Lead's history |

## Purpose of the EspoCRM webhook

| Question | Options | Selected |
|----------|---------|----------|
| What EspoCRM reports | Contact edits → Chatwoot ✓ / Verified receiver only / Merges/splits + Lead statuses | Contact edits → Chatwoot |
| Processing | Verify → outbox → dispatcher ✓ / Inline in request | Verify → outbox → dispatcher |

## What the webhook writes to Supabase

| Question | Options | Selected |
|----------|---------|----------|
| Register chat strangers in identity tables | Yes, as a normal identity ✓ / No, CRM only | Yes |
| EspoCRM vs Chatwoot field conflict | CRM edit wins (sync user ignored) ✓ / Fill empty fields only | CRM edit wins |
| Operator adds email/phone in Chatwoot | Create/link EspoCRM Contact ✓ / Only on next conversation | Create/link EspoCRM Contact |

## Claude's Discretion

HMAC scheme/headers per system, replay window, dedup storage, echo-loop mechanics, Lead source values, history
entry type, event type names, webhook registration and secret storage, forward-only default, D-05 detection.

## Deferred Ideas

AI summaries; full transcripts in CRM; reading EspoCRM merges/splits/Lead statuses back; new chat-Lead notifications.
