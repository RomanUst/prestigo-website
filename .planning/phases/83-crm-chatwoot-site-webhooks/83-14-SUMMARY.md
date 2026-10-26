---
phase: 83-crm-chatwoot-site-webhooks
plan: 14
subsystem: infra
tags: [webhooks, go-live, uat, chatwoot, espocrm]
status: complete
requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04]

requires:
  - phase: 83-01..83-13, 83-16
    provides: receivers, handlers, config-as-code, runbook
provides:
  - "inbound webhooks LIVE in production since chat_hooks_start = 2026-10-26 15:38:44.954313+00"
  - "EspoCRM webhook Contact.update (skipOwn=true, owner prestigo-sync) and Chatwoot account webhook id 1 (4 subscriptions)"
  - "Vercel production env names CHATWOOT_WEBHOOK_SECRET, ESPOCRM_WEBHOOK_SECRET, ESPOCRM_WEBHOOK_ID"
  - "infra/espocrm/webhook.mjs owner check accepts createdById (live EspoCRM 10.0.8 API-user shape)"
affects: [83-15]

actuals:
  tasks: 3
  commits: 2
---

# 83-14 — Go-live record

The owner asked Claude to run go-live end to end ("сделай все сам"). Every secret moved through
`--print secret | vercel env add` pipes; no secret value appeared in any output or in this file.
The UAT alias is not recorded here (ids, counts and codes only).

## Task 1 — config, webhooks, secrets, ship, probes

| Step | Result |
|------|--------|
| `espocrm/sync.mjs --only enums` | update=1 (Lead.source gains Website chat, Telegram) |
| `espocrm/sync.mjs --only roles` | update=1 (Sync writer: Webhook, stream all) |
| `verify-acl.mjs --role "Sync writer"` | pass=31 fail=0 |
| `chatwoot/sync.mjs --only labels` | create=3 (`no-lead`; also `ch-whatsapp`, `wa-window-closing` already in labels.json from Phase 78) |
| `espocrm/webhook.mjs create` (1st) | `error=skipown_not_effective` — see deviation; webhook auto-deleted |
| `espocrm/webhook.mjs create` (after fix) | `webhook=created id=6adf72c7c081090fd skipOwn=true`; list: `active=true skipOwn=true owner=set` |
| `chatwoot/webhook.mjs ensure` | `webhook=created id=1`; list: 4 subscriptions |
| Vercel production env names | 3/3 present (CHATWOOT_WEBHOOK_SECRET, ESPOCRM_WEBHOOK_SECRET, ESPOCRM_WEBHOOK_ID) |
| Ship | PR RomanUst/prestigo-website#75 merged (73aaaee7), production serving the receivers at 16:37 local |
| `chatwoot/webhook.mjs probe` | `probe_status=200,401,401` `verdict=ok` |
| `espocrm/webhook.mjs probe` | `probe_status=200,401` `verdict=ok` |

### Deviation (Rule 1): skipOwn owner check
EspoCRM 10.0.8 stored `skipOwn: true`, but the prestigo-sync API user's re-read carries no `userId`;
the owner is exposed as `createdById` (= prestigo-sync). `hasOwner` now accepts `userId` or
`createdById`; test added (`tests/espocrm-webhook-script.test.ts`, 25/25). Commit c3430c50.
The live echo test below confirms skipOwn works: the site's own EspoCRM writes produced no
`hook.espo_contact` row.

## Task 2 — probe evidence and switch-on

- Production logs (Vercel CLI; MCP runtime logs returned 403): Chatwoot `message_created outcome=ignored code=private`,
  `rejected code=bad_signature`, `rejected code=stale`; EspoCRM `items=1 queued=0 outcome=ok` (gate off), `bad_signature`.
- A11 receiver latency: 0.22 s (Chatwoot) / 0.67 s (EspoCRM) round trip from the owner workstation; the log API
  exposes no duration field. Well inside Chatwoot's 5 s.
- A13: `num_redirects=0` for both receivers on the apex host.
- Switch-on: `chat_hooks_start = 2026-10-26 15:38:44.954313+00`; at that instant webhook_deliveries = 0, hook.* outbox = 0.
- Unsigned POST to each receiver after the switch: 401.

## Task 3 — live UAT (run by Claude)

1. Visitor chat on rideprestigo.com (browser pane, conversation #185). The pane carried an old widget session, so the
   Chatwoot contact (id 67) already had an email on a test domain that never existed on the site → a true stranger:
   a new identity (basis `chat`), not a customer.
2. Private note `Итог: UAT 83 summary` + resolve via the Chatwoot API (agent token).
3. EspoCRM Contact last name → `Uatcheck` as the admin identity (prestigo-config), so skipOwn does not hide it.

### Verification
| Check | Result |
|-------|--------|
| (a) hook rows | `hook.chat_intake` sent, `hook.chat_resolve` sent, `hook.espo_contact` sent (1 attempt each) |
| (a) registry | chat_conversations #185 outcome `lead_created`; one open chat lead (`i:` key) with EspoCRM Lead + Contact ids; identity email basis `chat` |
| (b) EspoCRM | Lead(source=Website chat, email=alias) count=1; Contact(email=alias) count=1; Post Notes on the Contact = 1 |
| (b) Note body | `Chat conversation #185 resolved`, channel, opened/resolved UTC, `Messages: 1`, first message, `Summary: UAT 83 summary`, Chatwoot link, marker `[cw:185:r…]`; written by prestigo-sync |
| HOOK-03 | Chatwoot contact 67 name = `Uatcheck` after the EspoCRM edit (handler `[espo-contact] outcome=sent code=updated`) |
| (c) HOOK-04 | hook.chat_contact rows after switch-on = 0; max deliveries per entity = 2 (≤5); `contact_updated` echoes ignored (`irrelevant_change` ×2); no `ALERT webhook_loop_fused`, no `outcome=failed` |

### Live contract (RESEARCH assumptions)
| ID | Finding |
|----|---------|
| A1 | `conversation_status_changed` with status resolved produced a `hook.chat_resolve` row and the note shows a correct resolved minute — the payload/header time form is handled |
| A2 | link shape `https://chat.rideprestigo.com/app/accounts/1/conversations/<id>` written into the Note |
| A4 | Chatwoot accepts and stores the undefined custom attribute `site_sync_fp` (present on contact 67) |
| A5 | the Sync writer (stream all) can post a Note on a Contact and read the stream (marker dedup works) |
| A7 | EspoCRM sent only the changed attributes: the key mask tag was `m1` (name group only) |
| A11 | 0.2–0.7 s round trip, no cold-start timeout |
| A13 | no redirect on rideprestigo.com |
| A14 | private agent note arrived as `message_created` and was ignored with code `private` (message_type/private form handled) |

No contradicting finding; no follow-up needed. The UAT person (identity, chat lead, EspoCRM Lead/Contact/Note,
Chatwoot contact 67 attributes) is erased in plan 83-15.
