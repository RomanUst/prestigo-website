---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 04
subsystem: legal-content / i18n
tags: [gdpr, privacy-policy, i18n, retention, freeze-manifest]
requires: []
provides:
  - "Privacy policy (7 locales) disclosing Chatwoot/EspoCRM processing, German server, US encrypted backups, channels and D-13 retention"
affects: ["82-16 (data-deletion alignment, depends on the 10-year figure and shared manifest)", "82-14 (owner confirms 10-year figure before ship)"]
tech-stack:
  added: []
  patterns: ["hand-translated in-session units frozen in i18n/translation-manifest.json via freeze file"]
key-files:
  created:
    - tests/privacy-content.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/freeze/82-04.freeze
  modified:
    - app/[locale]/privacy/page.tsx
    - content/pages/en/privacy.json
    - content/pages/ru/privacy.json
    - content/pages/es/privacy.json
    - content/pages/fr/privacy.json
    - content/pages/ar/privacy.json
    - content/pages/hi/privacy.json
    - content/pages/zh/privacy.json
    - i18n/translation-manifest.json
key-decisions:
  - "Provider names EspoCRM (self-hosted) and WhatsApp (Meta) kept byte-identical in Latin script in all locales (as Chatwoot (self-hosted) already is)"
  - "hero.lastUpdated set to 19 October 2026 (execution date) in each locale's date style"
requirements-completed: [GDPR-02]
status: complete
commits: 3
plan_head_before: e8f6657b7b0a2fb8e71421be9af7dae9b31bbd4e
plan_head_after: 14b2889f8b8707b55b4de7e9a713c87c038ab75a
actuals:
  tokens: 45000
  tasks: 3
  commits: 3
metrics:
  completed: 2026-10-19
---

# Phase 82 Plan 04: Privacy policy CRM/inbox disclosure Summary

The public privacy policy in all 7 locales now names Chatwoot and EspoCRM as self-hosted processors in Germany (Hostinger), Backblaze encrypted backups in the US, the four channels (website chat, email, Telegram, WhatsApp), the D-13 retention periods and how erasure works.

## What changed

- **EN (tracer, commit f2694e15):** `section2.messagingData` (after locationData), appended clause in `section3.legitimateInterest.text`, `section4.providers` grown 10 -> 12 (EspoCRM at [10], WhatsApp (Meta) at [11]; Hostinger/Backblaze purposes updated), `section5.text` last sentence replaced, `section6.items` 4 -> 7 (booking records "Up to 10 years" + anonymise-not-delete, contact form "until you ask", messages, unfinished bookings 90 days, backups up to 6 months), `section8.erasureNote`, `hero.lastUpdated`.
- **Page:** `app/[locale]/privacy/page.tsx` renders `messagingData` after `locationData` and `erasureNote` after the rights list, before the outro, using the existing heading/text markup (no layout change). Fields became required in the content type once all 7 locales carried them.
- **ru / es / fr / ar / hi / zh (commit 68a764af):** real in-session translations at the same keys and array positions; no stubs, `scripts/i18n-translate.mjs` never run with `--dry-run`. `node scripts/i18n-translate.mjs --check` passes.
- **Freeze (commit 14b2889f):** `freeze/82-04.freeze` with the 7 privacy patterns (8 units: messagingData has heading+text). `--dir <82 freeze dir>` froze 8 units; `--verify` PASSED for the 82 dir (8 units) and the 77 dir (3 units).
- **Test:** `tests/privacy-content.test.ts` (7 locales): deep key parity and no empty leaf, provider order/Latin names/URLs, retention figures (10 / 90 / 6), translated-not-English checks, render of messagingData and erasureNote, ordering of the erasure note between rights and outro, no price/Uber/Cloud API text in EN.

## Provider URL checks

- https://www.espocrm.com/privacy-policy/ -> HTTP 200
- https://www.whatsapp.com/legal/privacy-policy-eea -> HTTP 200

## Verification

- `npx vitest run tests/privacy-content.test.ts tests/static-pages-locale.test.tsx tests/i18n-freeze-manifest.test.ts` -> 3 files, 84 tests passed (run through the node_modules symlink; no next-intl failures).
- `npx tsc --noEmit` -> no errors outside `tests/`; eslint clean on the page and the new test.
- Freeze `--verify` passes for both freeze dirs.

## Deviations from Plan

None - plan executed exactly as written.

Notes: the freeze dir in this worktree contains only 82-04.freeze (other wave-1 plans' freeze files live in their own worktrees); the orchestrator should re-run `node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/82-site-crm-chatwoot-sync-foundation/freeze --verify` after merging, and expect `i18n/translation-manifest.json` merge conflicts with sibling plans to be resolved by re-running the freeze command (it is idempotent).

## Known Stubs

None.

## Open items for the owner

- The 10-year booking retention figure (D-13) must be confirmed by the owner before shipping (plan 82-14 Task 1); if it changes, the 7 privacy locales, the 7 data-deletion locales (82-16) and `tests/privacy-content.test.ts` are updated together.
- Human check (UAT): open /ar/privacy and /zh/privacy at 375 px: list items read right-to-left in ar, nothing clipped, no horizontal scroll. Not run here (no browser session in the worktree).
- `hero.lastUpdated` is 19 October 2026; bump (copy only, all 7 locales + re-freeze) if the ship slips.

## Threat Flags

None - no new network endpoints, auth paths or schema changes.

## Self-Check: PASSED

- FOUND: tests/privacy-content.test.ts, freeze/82-04.freeze, content/pages/{en,ru,es,fr,ar,hi,zh}/privacy.json
- FOUND commits: f2694e15, 68a764af, 14b2889f
