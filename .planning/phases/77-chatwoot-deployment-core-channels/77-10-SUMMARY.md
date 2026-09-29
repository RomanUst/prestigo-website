---
phase: 77-chatwoot-deployment-core-channels
plan: 10
subsystem: ui
tags: [chatwoot, next-intl, react, launcher, consent, rtl, vitest]

requires:
  - phase: 77-01
    provides: WIDGET_CONFIG_PATH, isSafeWidgetBaseUrl, /api/chatwoot/identity route (HMAC identity)
  - phase: 77-03
    provides: conversation custom-attribute keys (infra/chatwoot/custom-attributes.json)
  - phase: 77-05
    provides: ChatLauncher message namespace in all 7 locales
  - phase: 77-06
    provides: WHATSAPP_CHAT_URL, TELEGRAM_CHAT_URL
provides:
  - components/ChatLauncher.tsx (floating brand launcher + channels-array menu)
  - components/chat/load-chat-widget.ts (openChatWidget click-time loader, WIDGET_LOCALE_BY_SITE_LOCALE)
  - lib/chat-visit-context.ts (buildVisitContext, VISIT_CONTEXT_KEYS, in-memory first-touch landing href)
  - launcher mounted on every public page via app/[locale]/layout.tsx
affects: [77-12 production verification, 78 (Instagram/Messenger channels), 79 (email channel), 85 (analytics)]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 386f034cd5c51a6b3f41e9e993206f8728c5ff71
plan_head_after: 21bb2232ceff5bec7bbe9d80bc6c669db33bf27b

tech-stack:
  added: []
  patterns:
    - "Third-party widget behind a click: dynamic import of the loader inside the click handler, config (base URL, token) fetched from a server route at click time so no client file holds the chat host or an uppercase CHATWOOT_ env name"
    - "Menu rendered from a channels array (id, labelKey, Icon, href|action, analyticsName) so later channels need no layout change"
    - "Esc/outside-press listeners registered only while the menu is open"

key-files:
  created:
    - components/ChatLauncher.tsx
    - components/chat/load-chat-widget.ts
    - lib/chat-visit-context.ts
    - tests/chat-launcher.test.tsx
    - tests/chat-visit-context.test.ts
  modified:
    - app/[locale]/layout.tsx

key-decisions:
  - "Menu panel is mounted only while open (aria-controls on the launcher always names it); keeps outbound wa.me/t.me links out of every page's initial HTML"
  - "First-touch landing URL lives in module memory (rememberLandingHref/getLandingHref in lib/chat-visit-context.ts), set from a mount effect that makes no request; launcher passes it to the loader"
  - "Visit context is snapshotted at click time (before the config fetch), not when the widget finishes loading"
  - "Loader takes an extra optional pathname option (locale-stripped, from next-intl usePathname) to decide /book booking data without importing i18n/routing into the loader chunk"
  - "Retry after a failed load reuses window.chatwootSDK if present instead of injecting sdk.js twice; concurrent clicks share one in-flight open"
  - "Reply-time hint is shown as a static caption in the menu and also passed as availableMessage"

patterns-established:
  - "Test seam for in-memory module state: resetLandingHrefForTests"
  - "Fake-SDK harness: intercept document.body.appendChild for the sdk.js script, real identity GET handler behind a stubbed fetch"

requirements-completed: [INBOX-02, INBOX-03, INBOX-04]

duration: ~35min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 10: Chat Launcher Summary

**Brand chat launcher on every public page that loads nothing third-party until "Chat on site" is clicked, then opens an identified, locale-configured Chatwoot widget carrying sanitized visit context and a click-to-open consent record.**

## Performance

- **Tasks:** 3 (1 tracer + 2 auto/tdd), all committed individually
- **Files:** 5 created, 1 modified

## Accomplishments

- Launcher (56px, navy fill, gold border and icon) with a menu built from a channels array: Chat on site (600-weight gold), WhatsApp, Telegram (D-01 order). WhatsApp/Telegram are `target=_blank rel="noopener noreferrer"` links with `trackMetaEvent('Contact', ...)`. HeroWhatsApp, Footer, SiteChrome and `app/(internal)/layout.tsx` are untouched (git diff clean); the launcher is mounted only in `app/[locale]/layout.tsx`, so /admin and /driver never get it.
- Consent gate: nothing third-party on render or when following WhatsApp/Telegram (tests assert no fetch, no sdk.js script, no `cw_` cookie). The loader is reachable only through `import('@/components/chat/load-chat-widget')` inside the Chat on site click handler.
- End-to-end click path proven through the REAL `GET` of `app/api/chatwoot/identity/route.ts` (Supabase mocked to a signed-in user): `chatwootSettings` is set before the script is appended (locale, position, welcome texts, availableMessage, hidden bubble), script src is `<baseUrl>/packs/js/sdk.js`, `run({websiteToken, baseUrl})`, then on `chatwoot:ready` `setUser(userId, {email, identifier_hash})` (hash equals `computeIdentifierHash`), `setLocale`, attributes, `toggle('open')`. Anonymous visitors are not identified. zh maps to zh_CN; ar puts the widget at `left`.
- Visit context (D-06): `buildVisitContext` keeps origin + path + utm_* only (drops email/tokens/other params/hash), referrer reduced to origin + path, control characters stripped, values trimmed and capped at 200, empties omitted; utm_* from the landing URL first, then current URL. `chat_consent='click-to-open'` and `chat_opened_at` form the consent audit trail. `book_*` keys come from the booking store only under `/book`. `VISIT_CONTEXT_KEYS` equals the conversation keys in `infra/chatwoot/custom-attributes.json` (test-enforced). Contact gets `site_locale`; the conversation context is set after ready and once more on the first `chatwoot:on-message`.
- States and a11y: loading (`aria-busy`, disabled, spinner, sr-only loading label; other channels clickable); inline `widgetError` in a `role="status" aria-live="polite"` region for disabled config, sdk.js failure, or no ready in 10 s (menu stays open, retry clears it); Esc closes and returns focus to the launcher; outside mousedown/touchstart closes; Enter/Space toggle; Tab order follows D-01; copper focus-visible ring; 0.3s ease transitions with active scale 0.97.
- Placement: logical properties only (`end-4 md:end-6`, `items-end`), `z-40`; on `/book` (locale-stripped) below md it uses `bottom-24` above the fixed price bar and sticky action row, else `bottom-4`; `md:bottom-6` always from md up. Menu `min-w-[220px] max-w-[calc(100vw-32px)]`, labels `break-words`.

## Task Commits

1. **Task 1 (tracer): launcher + click-to-load identified widget** - `b371d84b` (feat)
2. **Task 2: click-time visit context and consent record** - `e6df6429` (feat)
3. **Task 3: launcher states, keyboard, RTL and /book placement** - `21bb2232` (feat)

Tracer gate: `<verify>` (launcher test + isolation guard) re-run end to end after Task 1 and passed before expansion.

## Verification

- `npx vitest run tests/chat-launcher.test.tsx tests/chat-visit-context.test.ts tests/chat-launcher-i18n.test.ts tests/infra-vps-isolation-guard.test.ts` — 4 files, 374 tests, all pass (chat-launcher: 28, chat-visit-context: 15). Isolation guard stays green with no new allowlist entries.
- `npx eslint --quiet` on all touched files (including `app/[locale]/layout.tsx`) — exit 0.
- `npx tsc --noEmit` — only the 8 baseline errors in `tests/` (nav-auth 5, i18n-translate-dnt 2, passenger-actions 1); none in touched files.
- Acceptance greps: `import('@/components/chat/load-chat-widget')` = 1, physical `left-/right-N` = 0, `localStorage|sessionStorage|document.cookie` = 0 in ChatLauncher.tsx and lib/chat-visit-context.ts, `import('@/lib/booking-store')` = 1 in the loader, `aria-busy` = 1, `aria-live` = 1.
- Full suite in the worktree: 168 files pass, 5 fail to load (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) with `Cannot find module .../next-intl/dist/esm/development/server.react-server.js` — the known worktree node_modules gap (worktree `node_modules` is a symlink to the main tree). Unrelated to this plan; the orchestrator should re-run them in the main tree. Not logged to WINDOWS.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no node_modules**
- **Found during:** Task 1 start
- **Fix:** symlinked `node_modules` to the main tree's (gitignored, never staged)
- **Files modified:** none tracked

**2. [Rule 1 - Bug] TypeScript narrowing across an await in the loader**
- **Found during:** Task 1 (tsc)
- **Issue:** `window.$chatwoot` narrowed to `never` after the early-return check
- **Fix:** read through a `readWidgetApi()` helper after the SDK runs
- **Commit:** b371d84b

**3. [Rule 2 - Missing critical] Unhandled loader rejection**
- **Found during:** Task 3 (tests)
- **Issue:** a failed load surfaced as an unhandled promise rejection and left no error UI
- **Fix:** click handler catches and shows `widgetError`; fetch of the config route also has a 10 s abort so the item cannot stay busy forever
- **Commit:** 21bb2232

**4. [Rule 1 - Bug] Listener leak across widget opens in tests**
- **Found during:** Task 2
- **Fix:** the one-shot `chatwoot:on-message` handler closes over the widget API captured at open time

Additions beyond the plan text (not deviations from a requirement): optional `pathname` loader option, `rememberLandingHref`/`getLandingHref`/`resetLandingHrefForTests` in `lib/chat-visit-context.ts` (plan said "module-level in ChatLauncher"; a lib module is testable and satisfies the storage-free acceptance grep for both files).

### Not done (needs the orchestrator, cannot run in this subagent)

Task 3's local browser verification was NOT performed: this executor has no preview tool, CLAUDE.md forbids `npm run dev` in Bash, and `.env.local` must not be read. Recorded for the orchestrator (start preview `prestigo`, use its actual port):

1. `python3 scripts/qa/chat_widget_probe.py --consent http://localhost:3000 --expect-launcher` (7 locales; expect zero chat-host requests, zero `cw_` cookies, launcher bottom-left on /ar, bottom-right elsewhere)
2. `python3 scripts/qa/chat_widget_probe.py --overlap http://localhost:3000 --pages /book,/`
3. Screenshots of the open menu on `/`, `/ar`, `/book` at 320 px and 375 px (owner human-check: labels wrap, nothing covers booking buttons or the cookie banner; the raised `/book` offset is the thing most worth eyeballing)
4. Click Chat on site locally: with no CHATWOOT_* env the real route returns `{enabled:false}` and the widgetError text must appear on screen (unit-tested with the same real route, not yet seen in a browser)
5. `verify` skill browser step

The plan's `/book` overlap risk is unverified visually: the launcher clears the fixed price bar via `bottom-24` (96px vs 68px bar + safe area) but the sticky wizard action row height was not measured in a browser.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries; the launcher consumes the existing identity route (T-77-24..27 mitigations implemented and tested: consent gate, control-char/length hygiene, URL/PII reduction, https-origin check before injection).

## Self-Check: PASSED

- Files present: components/ChatLauncher.tsx, components/chat/load-chat-widget.ts, lib/chat-visit-context.ts, tests/chat-launcher.test.tsx, tests/chat-visit-context.test.ts, app/[locale]/layout.tsx (modified)
- Commits present: b371d84b, e6df6429, 21bb2232 (3 commits since base 386f034c)
