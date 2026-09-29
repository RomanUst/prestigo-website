---
phase: 77-chatwoot-deployment-core-channels
plan: 13
status: complete
requirements: [INBOX-01, INBOX-02, INBOX-03, INBOX-05, INBOX-06, OPS-01, OPS-02]
key-files:
  created: []
  modified:
    - scripts/qa/chat_widget_probe.py
    - infra/vps/runbooks/chatwoot-channels.md
commits: 2
---

# 77-13 Summary — every channel verified live on production

One-liner: a scripted production widget conversation, the owner's 8-step UAT and API readbacks prove all four Chatwoot channels, the automation, signed-in identity and native reports.

## Task 1 (tracer) — 45df9ade
- Final `sync.mjs` + `--dry-run`: create=0 update=0 skipped=0 (labels 11, teams 2, attributes 16, canned 35, inboxes 4, automation 110).
- New probe mode `--send-message` (seeds necessary-only consent, opens launcher, fills the widget pre-chat form by `name`, waits for the message in the thread). Fixed during the run: widget buttons have no `type=submit` → select `button:visible`.
- T0 = 2026-09-29T12:56:20Z. Conversation #42 (payment keyword) → ch-web+payment, owner, team bookings; #43 (b2b keyword) → ch-web+b2b, owner, team b2b.

## Task 2 (owner UAT) — all 8 steps pass
Owner signed in with Google (ustyugov.roman@gmail.com). Signed-in chat, email to bookings@/info@, Telegram, canned responses, continuity, resolve, reports, looks (/ar left + Arabic, /hi, mobile push) — all reported "ok".

## Task 3 — b35ff669
- Supabase MCP: auth user for the sign-in email (last sign-in 12:55 UTC). `inspect --contact <email> --expect-identifier <id>` → `contact_found=true identifier_matches=true`.
- `--activity --since T0`: #39 Telegram ch-telegram, #40 bookings@ ch-email, #41 info@ ch-email, #42/#43/#44 Website ch-web — all assignee_is_owner=true, all resolved, all last_outgoing=sent.
- `--report --since 2026-09-28`: Website 3 convs / first response 67 s; Email bookings@ 2 / 29 s; Email info@ 36 / 1830 s (includes mail imported on connect); Telegram inbox 2 / 347 s.
- "Verified 2026-09-29" section appended to infra/vps/runbooks/chatwoot-channels.md with per-channel results and known limitations.

## Deviations
- The owner had not replied from Chatwoot in #39 (Telegram) and #41 (info@), so their first-response metric was null. With the owner's explicit approval ("отправляй") the orchestrator sent one test reply to each via the API (message ids 158, 159), re-resolved both; owner confirmed receipt in Telegram and Gmail.
- The Telegram inbox is named `PrestigoChauffeurBot` in Chatwoot; the plan's check expects "report inbox Telegram" — accepted, it is the same inbox (Channel::Telegram).
- Chatwoot stores team names lower-case (`bookings`, `b2b`); checks read case-insensitively.

## Self-Check: PASSED
