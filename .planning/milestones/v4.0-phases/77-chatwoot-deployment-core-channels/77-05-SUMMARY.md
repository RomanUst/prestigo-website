---
phase: 77-chatwoot-deployment-core-channels
plan: 05
subsystem: i18n
tags: [next-intl, i18n-pipeline, chatwoot, privacy-policy, translation-manifest]

requires:
  - phase: 76-vps-infrastructure
    provides: "VPS facts (Hostinger Germany, Backblaze B2 us-east-005, restic client-side encryption) used verbatim in the privacy disclosure"
provides:
  - "ChatLauncher message namespace (11 leaves incl. widget.welcomeTitle/welcomeDescription) natively translated in all 7 site locales, consumed by later plans building the launcher UI (77-09/77-10)"
  - "Pre-launch privacy disclosure: Chatwoot/Hostinger/Backblaze/Telegram processors, extended international-transfers text, and the click-gated chat-cookie entry, in all 7 locales"
  - "Telegram DNT allowlist entry and 3 units frozen in i18n/translation-manifest.json so a future pipeline run never overwrites these hand translations"
affects: [77-09-chat-launcher-ui, 77-10-widget-integration, 82-sync-foundation-gdpr]

actuals:
  tokens: 11607
  tasks: 2
  commits: 2
plan_head_before: 2ecf9c6f7697479b6733d408b50e27fbc9eb2ebc
plan_head_after: 95a03b417f09ac90fed9d7d305acab89aac89e86

tech-stack:
  added: []
  patterns:
    - "ChatLauncher PascalCase message namespace, matching the established Phase 69 component-namespace convention"
    - "Freeze-file + translation-manifest workflow (scripts/i18n-freeze-manifest.mjs) reused unchanged from Phase 75 for hand-translated units"

key-files:
  created:
    - tests/chat-launcher-i18n.test.ts
    - .planning/phases/77-chatwoot-deployment-core-channels/freeze/77-05.freeze
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - scripts/qa/en_leak_allowlist.json
    - content/pages/en/privacy.json
    - content/pages/ru/privacy.json
    - content/pages/es/privacy.json
    - content/pages/fr/privacy.json
    - content/pages/ar/privacy.json
    - content/pages/hi/privacy.json
    - content/pages/zh/privacy.json
    - i18n/translation-manifest.json

key-decisions:
  - "ChatLauncher namespace inserted immediately after CookieBanner in all 7 catalogs (same position in every locale file), matching the existing block-ordering convention"
  - "Widget welcome copy (widget.welcomeTitle/welcomeDescription) kept the brand word 'Prestigo' untranslated inside an otherwise fully-translated sentence in every locale — satisfies the parity test's 'differs from en' rule since only whatsapp/telegram are exempted as whole-string DNT leaves"
  - "Privacy section4.providers/section7.cookies are atomic array units for the freeze tool (scripts/lib/i18n-manifest.mjs flattenEnSource does not recurse into arrays) — froze the whole array per locale rather than per-element, matching the interfaces block's freeze-pattern lines"

requirements-completed: [INBOX-02]

coverage:
  - id: D1
    description: "ChatLauncher namespace (openAria, closeAria, menuAria, chatOnSite, whatsapp, telegram, replyTimeHint, widgetLoading, widgetError, widget.welcomeTitle, widget.welcomeDescription) exists with real translations in all 7 catalogs; only whatsapp/telegram are DNT-identical"
    requirement: "INBOX-02"
    verification:
      - kind: unit
        ref: "tests/chat-launcher-i18n.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reply-time copy says 'within a few minutes' in every locale, no literal minute count"
    verification:
      - kind: unit
        ref: "tests/chat-launcher-i18n.test.ts#no ChatLauncher value contains a currency token, a literal minute count, or \"Prestigio\""
        status: pass
    human_judgment: false
  - id: D3
    description: "Pre-launch privacy disclosure lists Chatwoot (self-hosted), Hostinger (Germany), Backblaze (US, encrypted backups) and Telegram as processors, extends the international-transfers text, and documents the click-gated chat cookies in all 7 locales"
    requirement: "INBOX-02"
    verification:
      - kind: integration
        ref: "tests/static-pages-locale.test.tsx"
        status: pass
      - kind: other
        ref: "node -e acceptance check (Backblaze present in section4.providers, all 7 locales)"
        status: pass
    human_judgment: false
  - id: D4
    description: "New i18n units frozen in i18n/translation-manifest.json so a future pipeline run never overwrites the hand translations"
    verification:
      - kind: other
        ref: "node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/77-chatwoot-deployment-core-channels/freeze --verify"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 05: ChatLauncher i18n + Pre-Launch Privacy Disclosure Summary

**All new Phase 77 user-facing copy (ChatLauncher launcher/widget strings + a Chatwoot/Hostinger/Backblaze/Telegram privacy disclosure) natively translated in-session into all 7 site locales, with the new units frozen against pipeline overwrite.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files modified:** 18 (16 modified, 2 created)

## Accomplishments

- Added the `ChatLauncher` message namespace (11 leaves incl. `widget.welcomeTitle`/`widget.welcomeDescription`) to `messages/en.json` and hand-translated it natively into `ru`/`es`/`fr`/`ar`/`hi`/`zh`, matching the PascalCase component-namespace convention from Phase 69 and the D-07 "reply within a few minutes" copy rule (no literal minute count, matching Chatwoot's `reply_time: in_a_few_minutes` enum).
- Added a `Telegram` DNT entry to `scripts/qa/en_leak_allowlist.json` (WhatsApp was already present).
- Wrote `tests/chat-launcher-i18n.test.ts` — 342 assertions across all 7 locales proving: identical key-tree across catalogs, every non-DNT leaf differs from the EN value, `whatsapp`/`telegram` are identical everywhere, and no value contains a currency token, a digit+minute-word, or the misspelling "Prestigio".
- Appended the pre-launch privacy disclosure to `content/pages/<locale>/privacy.json` in all 7 locales: 4 new `section4.providers` entries (Chatwoot self-hosted, Hostinger, Backblaze, Telegram), an extended `section5` international-transfers sentence naming the Germany VPS + Backblaze US storage, and a `section7.cookies` entry for `cw_conversation / cw_user_*` documenting the click-gated consent (Chat on site) and the visit-context attributes captured on open.
- Froze the 3 new/modified privacy units into `i18n/translation-manifest.json` via `scripts/i18n-freeze-manifest.mjs --dir .planning/phases/77-chatwoot-deployment-core-channels/freeze`, then confirmed with `--verify`.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): ChatLauncher namespace in all 7 catalogs + parity test + Telegram DNT** - `084b18a0` (feat)
2. **Task 2: pre-launch privacy disclosure in 7 locales + freeze the hand-translated units** - `95a03b41` (feat)

_No plan-metadata commit yet — this SUMMARY commit follows._

## Files Created/Modified

- `messages/en.json` (+ ru/es/fr/ar/hi/zh) - `ChatLauncher` namespace added
- `scripts/qa/en_leak_allowlist.json` - Telegram DNT entry added
- `tests/chat-launcher-i18n.test.ts` - parity + no-leak test for the new namespace
- `content/pages/en/privacy.json` (+ ru/es/fr/ar/hi/zh) - 4 providers, section5 sentence, chat-cookie entry
- `.planning/phases/77-chatwoot-deployment-core-channels/freeze/77-05.freeze` - freeze patterns for the 3 privacy units
- `i18n/translation-manifest.json` - 3 units frozen (`enHash`/`lastTranslatedAt`)

## Decisions Made

- ChatLauncher namespace placed immediately after `CookieBanner` in every catalog (consistent insertion point across all 7 files).
- Widget welcome copy retains the brand word "Prestigo" untranslated inside an otherwise translated sentence in every non-EN locale — this still satisfies the "differs from EN" parity rule since the DNT exemption only covers the whole-string `whatsapp`/`telegram` leaves, not partial brand-word reuse.
- `hi` widget description uses the established loanword "ट्रांसफ़र" (transfer) rather than "स्थानांतरण" (used elsewhere in the catalog for "data transfer") — matches existing usage in `messages/hi.json` (`prefillMessage`) and `content/pages/hi/services.json`.
- Privacy `section4.providers`/`section7.cookies` are frozen as whole arrays (not per-element) because the freeze tool's `flattenEnSource` treats arrays as atomic leaf units — matches the plan's stated freeze-pattern lines exactly.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>`, `<verify>`, and `<acceptance_criteria>` completed without needing Rule 1-4 fixes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `ChatLauncher` namespace and widget copy are ready for the launcher UI component (later plans in this phase, e.g. 77-09/77-10) to consume via `useTranslations('ChatLauncher')`.
- The privacy disclosure closes the Phase 76 blocker ("privacy policy must list Backblaze (US) before the Phase 77 widget launch") — STATE.md's Blockers/Concerns entry for this can be marked resolved.
- No blockers for subsequent Phase 77 plans.

## Self-Check: PASSED

- FOUND: messages/en.json (ChatLauncher namespace present)
- FOUND: messages/ru.json, messages/es.json, messages/fr.json, messages/ar.json, messages/hi.json, messages/zh.json (all contain ChatLauncher)
- FOUND: tests/chat-launcher-i18n.test.ts
- FOUND: content/pages/en/privacy.json (Backblaze/Hostinger/Chatwoot/Telegram providers, cw_conversation cookie)
- FOUND: content/pages/ru/privacy.json, es, fr, ar, hi, zh (same additions, native-language)
- FOUND: .planning/phases/77-chatwoot-deployment-core-channels/freeze/77-05.freeze
- FOUND: commit 084b18a0 (`git log --oneline --all | grep 084b18a0`)
- FOUND: commit 95a03b41 (`git log --oneline --all | grep 95a03b41`)
- Re-ran acceptance criteria for both tasks: all PASS
- Re-ran plan-level `<verification>`: parity test (342/342 pass), `i18n-translate --check` (PASSED), `i18n-freeze-manifest --verify` (PASSED, 3/3 units), `static-pages-locale.test.tsx` (28/28 pass)

---
*Phase: 77-chatwoot-deployment-core-channels*
*Completed: 2026-09-29*
