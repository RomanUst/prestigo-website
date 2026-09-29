---
phase: 77-chatwoot-deployment-core-channels
plan: 11
subsystem: infra
tags: [chatwoot, email, imap, smtp, hostinger, runbook, inbox-01]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: "plan 77-07 sync.mjs (channel rules), plan 77-09 inspect.mjs (--status/--activity)"
provides:
  - "Live Chatwoot inboxes 'Email info@' and 'Email bookings@' (IMAP + SMTP) created by the owner"
  - "ch-email channel automation rules for both inboxes (label, owner, Bookings team), created by sync and proven live"
  - "infra/vps/runbooks/chatwoot-channels.md: channel inventory, one-mailbox-one-system rule, D-14 audit results, admin-email loop rule, webmail emergency procedure"
  - "monitoring.md Chatwoot-down playbook step 5 pointing to the webmail emergency procedure"
affects: [77-12, 77-13, 78, 80 (roman@ stays reserved for EspoCRM), 82 (past-customer backfill)]

actuals:
  tokens: 9000
  tasks: 3
  commits: 1
  plan_head_before: c5f3b26142cdf7e00309eeb81a485ca963be7f1b
  plan_head_after: 7515cc13d8159431d650aa342ae08005cc22518e

tech-stack:
  added: []
  patterns:
    - "Channel rules are created by sync.mjs only after the owner makes the inbox; sync then patches only non-secret inbox settings"

key-files:
  created:
    - infra/vps/runbooks/chatwoot-channels.md
  modified:
    - infra/vps/runbooks/monitoring.md

key-decisions:
  - "Chatwoot admin email moved to the owner's personal address (personal-address option), not roman@ (reserved for EspoCRM, D-11); the profile now shows ustyugov.roman@gmail.com"
  - "Mail stays at Hostinger: MX 5 mx1.hostinger.com. / 10 mx2.hostinger.com.; no DNS change"
  - "SMTP OpenSSL verify mode 'peer' with domain rideprestigo.com (owner-advised)"

patterns-established:
  - "No Chatwoot agent email may be a connected mailbox (loop prevention); checked against inspect --status before adding an agent"
  - "Webmail is emergency-only: never delete mail, paste webmail replies back as private notes after recovery"

requirements-completed: [INBOX-01]

status: complete
---

# Phase 77 Plan 11: Email Channels into Chatwoot Summary

**info@ and bookings@ are live Chatwoot email inboxes: inbound mail becomes ch-email conversations routed to the Bookings team, replies leave through each mailbox's own SMTP (status sent), and the mailbox rules plus webmail emergency procedure are written down.**

## Accomplishments

- Task 1 (decision, resolved by owner): Chatwoot administrator email moved off info@ to the owner's personal address (option `personal-address`), which removes the mail-loop risk (T-77-28).
- Task 2 (owner action, resolved): both inboxes created in Chatwoot with IMAP and SMTP enabled; `inspect --status` shows both present.
- Task 3 (tracer): sync applied, idempotent re-run and dry-run clean, runbook and monitoring pointer committed, live round trip observed.

### D-14 audit answers (Task 1)

| Check | Answer |
|-------|--------|
| Forwarders / autoresponders on info@ and bookings@ | none |
| Apps connected to the mailboxes | only the owner's desktop mail app; the owner is removing them |
| Third-party accounts using them | UptimeRobot alerts used info@; moved to the owner's personal address |
| `MANAGER_EMAIL` (Vercel production) | changed to the owner's personal address and redeployed |
| Site mail use of bookings@ | only as the Resend sender/reply-to (outbound), fine |
| MX | `5 mx1.hostinger.com.` / `10 mx2.hostinger.com.` (mail stays at Hostinger) |

## Verification

1. `node infra/chatwoot/sync.mjs` (first run after the inboxes existed):
   - `inboxes: create=0 update=2 unchanged=2` (both email inboxes: enable_auto_assignment, business_name, sender_name_type patched)
   - `automation: create=2 update=0 unchanged=108` (the `channel: email info@` and `channel: email bookings@` rules)
   - `summary: create=2 update=2 skipped=0`
2. `node infra/chatwoot/sync.mjs` again: every line `create=0 update=0`, `inboxes unchanged=4`, `automation unchanged=110`, `summary: create=0 update=0 skipped=0`.
3. `node infra/chatwoot/sync.mjs --dry-run` (also re-run at the end): `summary: create=0 update=0 skipped=0`, so no email channel rule is skipped.
4. `node infra/chatwoot/inspect.mjs --status`: `inbox Email info@ Channel::Email present`, `inbox Email bookings@ Channel::Email present`, plus Website and Telegram present.
5. Round trip, `inspect --activity --since 2026-09-29T00:00:00Z`, second poll (~11:40Z):
   - `inbox=Email info@ id=36 status=open labels=ch-email assignee_is_owner=true team=bookings last_outgoing=sent`
   - `inbox=Email bookings@ id=37 status=open labels=ch-email assignee_is_owner=true team=bookings last_outgoing=sent`
   The `ch-email` label, owner assignment and Bookings team on both are the freshly created channel rules working live.
6. Acceptance greps: `grep -c webmail chatwoot-channels.md` = 4 (>=3), `grep -c chatwoot-channels.md monitoring.md` = 1, `grep -ciE "password=|token=" chatwoot-channels.md` = 0; runbook is 137 lines.

The `last_outgoing=sent` status is Claude's own evidence that Chatwoot's SMTP accepted the replies. The owner ran the Gmail round trip in parallel and checks the From header of the replies on their side; that confirmation was not relayed to this run.

## Deviations from Plan

### Observations

**1. [D-13 vs live behaviour] IMAP connect pulled existing info@ mail into conversations**
- **Found during:** Task 3 activity check (owner reported it after connecting).
- **Issue:** D-13 says no history import (only mail from the connection date forward). On connect, Chatwoot's IMAP connector fetched roughly 20 messages that were still in the info@ INBOX; some were auto-labelled `booking-new` by the keyword rules (for example conversations 3, 30, 32, 34), and about ten early ones are assigned to the owner without a team (they pre-date the channel rule).
- **Resolution:** none applied, by owner instruction: conversations are not deleted. The runbook records the observation ("Go-live observation" under No history import) and advises archiving old mail out of the INBOX folder before connecting any future mailbox. The conversations are handled like any other (resolve or label).
- **Impact:** operator inbox shows old threads at first; no data loss. It does not violate the intent of D-13 (no import job was run), but the "only from the connection date" wording is not literally true for an IMAP connector.

**2. [Scope] Only Task 3 ran in this agent run**
- Tasks 1 and 2 were resolved by the owner before dispatch; this run records their outcomes. Sync output in step 1 also printed the public website widget token; it is a public value embedded in site pages and is not recorded here.

No auto-fixes (Rules 1-3) were needed. No package installs.

## Known Stubs

None.

## Threat Flags

None. Mitigations from the plan's threat register: T-77-28 (admin email relocated, loop rule in runbook), T-77-29 (webmail emergency rule and private-note recovery step), T-77-30 (runbook holds hosts only, grep gate 0; Claude never handled a mailbox password).

## Next Step

Continue with plan 77-12. Owner follow-ups: finish removing info@/bookings@ from the desktop mail app, and tidy the ~20 imported info@ conversations at leisure.

## Self-Check: PASSED

- infra/vps/runbooks/chatwoot-channels.md exists; monitoring.md contains the pointer.
- Task commit 7515cc13 exists on the worktree branch.
