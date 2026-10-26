---
phase: 83-crm-chatwoot-site-webhooks
plan: 15
subsystem: infra
tags: [webhooks, go-live, no-lead, erasure, runbook]
status: complete
requirements-completed: [HOOK-01, HOOK-03, HOOK-04]

requires:
  - phase: 83-14
    provides: inbound webhooks live, chat_hooks_start set
provides:
  - "D-07 proven live: the no-lead label kills the chat Lead (EspoCRM Dead, registry closed 'dead')"
  - "HOOK-04 live echo audit: no failed hook row, max 2 deliveries per entity, no loop ALERT"
  - "runbook section '## Live contract' + pin test"
  - "D-16 proven live: erasure removes chat Lead, chat Contact, Chatwoot contact and registry rows"
affects: []

actuals:
  tasks: 3
  commits: 2
---

# 83-15 — no-lead live check, echo audit, live erasure

The owner asked Claude to run everything it is allowed to. Aliases are not recorded here.

## Task 1 — second UAT chat + no-lead label
The browser pane was signed in to a site account, so the widget would have re-used that identity. The second visitor
was created through Chatwoot's public widget API with the site's widget token (anonymous contact 137, conversation
#186, first message `UAT 83: no-lead check`, email given after the first message, exactly like a real visitor).
Claude then added the `no-lead` label through the Chatwoot API.

## Task 2 — tracer, audit, runbook
| Check | Result |
|-------|--------|
| #186 intake | `hook.chat_intake` sent, outcome `lead_created`; `hook.chat_contact` sent (`leads_0`) for the email update |
| no-lead | `hook.chat_label` sent (`[chat-label] outcome=sent code=dead`); registry row open=false, closed_reason `dead`; EspoCRM Lead(alias B, status=Dead) count=1 |
| hook.* audit since switch-on | 7 rows, all `sent` on attempt 1 (intake ×2, resolve, contact, label, espo_contact) |
| deliveries per entity | max 2 (limit 20) |
| logs | 0 `ALERT webhook_loop_fused`, 0 `outcome=failed` |
| skipOwn | the site's own EspoCRM writes for the UAT persons produced no EspoCRM delivery |

Runbook `infra/vps/runbooks/inbound-webhooks.md` gained `## Live contract` (facts from 83-14 and this plan);
`tests/inbound-webhooks-runbook.test.ts` pins the heading and its key facts (87/87). Commit 90a39b9e.

## Task 3 — erasure of both UAT persons

**UAT person B (alias without a site account):** erased by the owner on `/admin/erasure` (Claude prepared the preview;
the "identity verified" attestation is the owner's). Request completed 2026-10-26 17:59 UTC, verified=true:
chat_rows_deleted 2, identity_deleted 1, espo_leads_deleted 1, espo_contacts_deleted 1, chatwoot_contacts_deleted 1,
notes_deleted 0, notes_skipped 0, account_deleted 0. Re-check: EspoCRM Lead/Contact count 0, Chatwoot contact_found=false,
no registry or identity_emails row.

**UAT person A (83-14):** its email belongs to an existing site login account (the browser pane's session), so the
standard erasure — which also deletes the auth account — was NOT used. On the owner's decision Claude removed only the
chat data: EspoCRM Note, Lead and Contact (admin DELETE, now 404 for the API; EspoCRM keeps soft-deleted rows until its
cleanup job), registry rows via `chat_erase`, the identity_emails row and the identity. The login account and
auth.users count are unchanged. Chatwoot contact 67 (that account's widget contact) and conversation #185 were left
in place.

After both: chat_leads = 0, chat_conversations = 0.

## Follow-ups noted
- `identity_resolve_chat` created a non-customer identity for an email that matches a site login account (user_id not
  linked). Harmless here, but a widget visitor who is signed in is not recognised as a customer. Candidate backlog item.
- EspoCRM webhook owner check fixed in 83-14 (createdById).
