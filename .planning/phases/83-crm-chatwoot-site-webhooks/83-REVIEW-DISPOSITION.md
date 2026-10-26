---
phase: 83-crm-chatwoot-site-webhooks
source: 83-REVIEW.md
updated: 2026-10-26
fixed: 3
open: 12
---

# 83 — Code review disposition

| ID | Severity | Disposition | Where |
|----|----------|-------------|-------|
| CR-01 | critical | **fixed** — chat resolve is email-only; the phone is attached only when unowned and not shared, never merged, never flagged. Verified no live merge happened before the fix (0 identity_emails / identity_phones rows since chat_hooks_start). | migration 079, live 2026-10-26, smoke `SMOKE_OK_83_079` |
| CR-02 | critical | **fixed** — EspoCRM content-hash dedup only inside 1 hour; older row is refreshed and counts as new. Runbook section 9 updated. | migration 079 |
| CR-03 | critical | **fixed** — erasure matches Chatwoot contact id / phone only on rows without an identity. | migration 079 |
| WR-01 | warning | open — label processed between two intake attempts can leave an orphan open Lead | backlog |
| WR-02 | warning | open — concurrent intake/contact/sync handlers can create duplicate EspoCRM Contacts | backlog |
| WR-03 | warning | open — conversion Note lost if the Lead PUT succeeds and the Note POST fails | backlog (Phase 85 counting) |
| WR-04 | warning | open — Chatwoot `rotate` loses events until redeploy (runbook already states the window) | backlog |
| WR-05 | warning | open — visitor text rendered as Markdown in CRM fields; only `<` neutralised | backlog |
| WR-06 | warning | open — erasure stream-read 403 skips Note scrub without counting | backlog |
| WR-07 | warning | open — deadline reschedules have no attempt cap | backlog |
| IN-01..IN-05 | info | open — noted, no action now | — |
