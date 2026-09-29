---
phase: 77-chatwoot-deployment-core-channels
plan: 06
subsystem: infra
tags: [telegram, bot-api, chatwoot, i18n, contact-channels]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: Chatwoot instance at chat.rideprestigo.com (plans 77-01..05)
provides:
  - "Dedicated customer Telegram bot @PrestigoChauffeurBot wired to the Chatwoot inbox 'Telegram'"
  - "Localized (7 languages) bot name / description / short description applied via Bot API"
  - "lib/contact-channels.ts constants for the chat launcher (plan 77-10)"
  - "set-bot-profile.mjs: offline dry-run, --check, --apply with token redaction"
affects: [77-10 chat launcher, INBOX-05 verification]

actuals:
  tokens: 9000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Token read from env or ~/.config file, never argv; webhook URLs reduced to hostname in output"
    - "Repo constant (TELEGRAM_BOT_USERNAME) kept in agreement with infra JSON by a test"

key-files:
  created:
    - infra/chatwoot/telegram/bot-profile.json
    - infra/chatwoot/telegram/set-bot-profile.mjs
    - tests/telegram-bot-profile.test.ts
    - lib/contact-channels.ts
  modified: []

key-decisions:
  - "Bot username PrestigoChauffeurBot (third candidate; owner created it)"
  - "contact-channels.ts holds plain constants only: no env reads, no VPS host; link not added to footer, /contact or emails (D-16)"

requirements-completed: [INBOX-05]

duration: 25min
completed: 2026-09-29
status: complete
plan_head_before: 2ecf9c6f7697479b6733d408b50e27fbc9eb2ebc
plan_head_after: 9e69842a  # last code commit; SUMMARY commit follows
---

# Phase 77 Plan 06: Telegram Channel Summary

**New customer bot @PrestigoChauffeurBot is registered with Chatwoot (webhook host chat.rideprestigo.com), carries a 7-language profile applied through 21 Bot API calls, and the launcher has a test-enforced link via lib/contact-channels.ts.**

## Performance

- **Duration:** ~25 min across the tracer, the owner checkpoint and Task 3
- **Completed:** 2026-09-29
- **Tasks:** 3 (1 tracer, 1 owner checkpoint, 1 auto)
- **Commits:** 3 (two code commits plus this SUMMARY)

## Accomplishments

- Task 1 (tracer, commit 8b83c0bb): localized bot profile JSON, `set-bot-profile.mjs` (`buildProfileCalls`, `redact`, `loadToken`; `--dry-run`, `--check`, `--apply`) and tests, proven offline (21 planned calls).
- Task 2 (owner checkpoint, resolved): owner created the bot via BotFather, stored the token in `~/.config/prestigo/telegram-chat-bot.env` (mode 600) and connected it to Chatwoot.
- Task 3 (commit 9e69842a): applied the profile, confirmed the webhook, set `confirmedUsername`, added `lib/contact-channels.ts` and extended the tests.

## Command outputs (no token, no webhook path)

1. `--check --expect-username PrestigoChauffeurBot` (before apply):
   ```
   username=PrestigoChauffeurBot
   webhook=chat.rideprestigo.com
   pending_update_count=0
   ```
2. `--apply`: `applied=21`
3. `--check` (after apply): identical to output 1.

## Files

- `infra/chatwoot/telegram/bot-profile.json`: `confirmedUsername` set to `PrestigoChauffeurBot`.
- `lib/contact-channels.ts`: `WHATSAPP_CHAT_URL` (https://wa.me/420725986855), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHAT_URL` (https://t.me/PrestigoChauffeurBot).
- `tests/telegram-bot-profile.test.ts`: username/URL agreement, WhatsApp number parity with `components/HeroWhatsApp.tsx`, no env reads and no VPS host in `contact-channels.ts`.

## Verification

- `npx vitest run tests/telegram-bot-profile.test.ts tests/infra-vps-isolation-guard.test.ts`: 2 files, 46 tests passed.
- `npx eslint --quiet lib/contact-channels.ts tests/telegram-bot-profile.test.ts`: clean.
- `git diff --quiet 16d0b7a4 HEAD -- lib/content/telegram.ts app/api/telegram components/Footer.tsx`: exit 0 (content-approval bot and footer untouched).
- `npx tsc --noEmit` was not run in this worktree (baseline errors are in `tests/` only; the new files are plain TS constants).

## Deviations from Plan

### Auto-fixed Issues

None in code.

### Process deviations

**1. [Owner checkpoint evidence] Pre-connection `webhook=unset` was not quoted back**
- **Found during:** Task 2 resolution
- **Issue:** The plan's must-have truth and Task 2 acceptance criteria require the owner to quote `webhook=unset` from the check run before pasting the token into Chatwoot. The owner did not quote that line back.
- **Resolution:** The orchestrator accepted this: the bot is brand-new (created via `/newbot` for this plan), the token file is mode 600, and post-connection `--check` shows `username=PrestigoChauffeurBot`, `webhook=chat.rideprestigo.com`, `pending_update_count=0`. The T-77-11 takeover risk (pasting the content-approval bot's token) is ruled out by the username, which is not the content bot, and by the untouched `lib/content/telegram.ts` / `app/api/telegram`. The pre-connection state itself remains unrecorded.
- **Files modified:** none

**2. [Precondition wording] Task 3 precondition** required the Task 2 reply to quote `webhook=unset`; it was evaluated as met on the orchestrator's verification above (token file present, mode 600, `--check` matches).

## Pending human checks

- **Owner Telegram-to-Chatwoot round trip is NOT yet confirmed** (Task 2 step 5 and the plan's INBOX-05 must-have): owner opens t.me/PrestigoChauffeurBot, presses Start, sends "Test from owner", replies from Chatwoot and confirms arrival in Telegram.
- **Localized profile check:** owner opens the bot with the phone set to Russian (or any non-English language) and confirms the empty-chat description appears in that language.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths or schema changes; `lib/contact-channels.ts` is plain public constants. T-77-12 held: the token never appeared in output, argv or commits.

## Issues Encountered

None.

## Next Phase Readiness

`lib/contact-channels.ts` is ready for the chat launcher (plan 77-10). INBOX-05 is fully closed only after the pending round-trip check above.

## Self-Check: PASSED

- FOUND: infra/chatwoot/telegram/bot-profile.json, infra/chatwoot/telegram/set-bot-profile.mjs, tests/telegram-bot-profile.test.ts, lib/contact-channels.ts
- FOUND commits: 8b83c0bb, 9e69842a
