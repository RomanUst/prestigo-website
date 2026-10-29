---
phase: 84-chatwoot-dashboard-app
plan: 07
subsystem: ui
tags: [chatwoot, dashboard-app, embed, postmessage, sessionstorage, security]
status: complete
requires: ["84-01", "84-04", "84-05"]
provides:
  - "app/embed/layout.tsx: third root layout (English, noindex, no site chrome)"
  - "app/embed/chatwoot-dashboard/page.tsx: dynamic server shell passing panelChatwootOrigin()"
  - "app/embed/chatwoot-dashboard/panel-handshake.ts: FETCH_INFO_MESSAGE, TOKEN_STORAGE_KEY, PANEL_API_PATH, parseAppContext, isTrustedContextEvent"
  - "app/embed/chatwoot-dashboard/PanelClient.tsx: client state machine (inert, waiting, token entry, loading, ready, error)"
  - "app/embed/chatwoot-dashboard/panel.css: theme tokens, base layout 280-400 px"
affects: [84-08, 84-09]
tech-stack:
  added: []
  patterns:
    - "postMessage trust = exact origin string equality AND source === window.parent; only conversation id and theme parsed"
    - "operator token in sessionStorage only (best effort, in-memory fallback), sent as api-access-token with credentials omit"
key-files:
  created:
    - app/embed/layout.tsx
    - app/embed/chatwoot-dashboard/page.tsx
    - app/embed/chatwoot-dashboard/PanelClient.tsx
    - app/embed/chatwoot-dashboard/panel-handshake.ts
    - app/embed/chatwoot-dashboard/panel.css
    - tests/embed-panel.test.tsx
  modified:
    - tests/infra-vps-isolation-guard.test.ts
    - tests/dashboard-app-isolation-guard.test.ts
key-decisions:
  - "PanelClient declares a local const PANEL_API holding the literal path (the isolation guard proves the fetch target from a same-file const); a test pins it to PANEL_API_PATH"
  - "With no stored token the token-entry form is shown immediately and hides the handshake-timeout copy; the timeout copy appears once a token exists and no context arrived"
  - "Token input is type=password with autocomplete off (secret on a shared screen)"
  - "A minimal Refresh button was added in the tracer because the UI-SPEC error copy tells the operator to press Refresh"
requirements-completed: [PANEL-01, PANEL-02]
duration: 25min
completed: 2026-10-29
commits: 1
plan_head_before: 8a9794c5372fb488e80f0550b1223c84a08700b5
plan_head_after: a0f9e36924adf86158f20fb51e93b6449be18bf8
actuals:
  tokens: 14000
  tasks: 2
  commits: 1
---

# Phase 84 Plan 07: Embed panel tracer Summary

`/embed/chatwoot-dashboard` now renders a standalone English panel that accepts Chatwoot context only from the exact Chatwoot origin and the parent window, keeps the operator token tab-scoped, calls the panel API and lists the customer's bookings (Prague date/time, route, reference, status).

## What was built

- **Layout and page**: `app/embed/layout.tsx` is a third root layout (html lang en, body only, noindex metadata). `page.tsx` is `force-dynamic`, imports `panel.css`, reads no cookies or headers, creates no Supabase client, and passes `panelChatwootOrigin()` to the client.
- **panel-handshake.ts** (pure): `parseAppContext` returns only `{ conversationId, theme }` (positive safe integer id; theme dark else light; non-string, bad JSON, other events, bad ids give null). `isTrustedContextEvent` is `origin === chatwootOrigin && source === parent`.
- **PanelClient**: inert (not framed or origin null) with no listener or request. Otherwise the message listener is attached first, then `fetch-info` is posted to the exact origin, retried every 1 s up to 5 times and stopped on the first trusted context; after the window the timeout copy shows while the listener stays attached so a late context still loads. Sets `html[data-theme]` from the context. Token form (UI-SPEC copy), `POST` with only `{ conversationId }`, `api-access-token` header, `credentials: 'omit'`, `cache: 'no-store'`. 401 clears the token, shows the rejection copy and focuses the field. Every `PanelErrorCode` maps to its UI-SPEC copy with a generic fallback (body code first, HTTP status as fallback). Cold start renders header shell plus three skeleton cards. Booking cards are text-only React output.
- **panel.css**: dark/light tokens on `html[data-theme]`, `prefers-color-scheme` default when the attribute is absent, system font stack, 8/12/16 px spacing, `min-width: 0`, `overflow-wrap: anywhere`, skeleton pulse disabled under reduced motion.
- **Guards**: `app/embed/chatwoot-dashboard/page.tsx` allowlisted in the VPS isolation guard (reason as specified); `page.tsx` and `PanelClient.tsx` added to the dashboard-app guard SCOPE_FLOOR (floor is now 7 modules).

## Verification

- `npx vitest run tests/embed-panel.test.tsx tests/infra-vps-isolation-guard.test.ts tests/dashboard-app-isolation-guard.test.ts tests/middleware-embed.test.ts`: 4 files, 153 tests pass (symlinked node_modules). `embed-panel` has 59 tests (parser, trust check, listener-before-post order, 1 s x 5 retry schedule, late context, wrong origin/source, malformed contexts, token storage and request shape, D-03 no contact data in the request, all error mappings, Refresh, XSS-as-text, no persistent storage writes).
- `npx tsc --noEmit`: no errors outside `tests/` (baseline). `npx eslint --quiet app/embed tests/embed-panel.test.tsx`: clean.
- Acceptance greps all empty or as required: no `localStorage`, no `next-intl|getLocale|setRequestLocale`, no `dangerouslySetInnerHTML`, no euro sign in `app/embed`; `credentials: 'omit'` 1, `sessionStorage` 3, `force-dynamic` 1.
- Task 2: `npm run build` exits 0 and the route table lists `ƒ /embed/chatwoot-dashboard`. No file changed, so no commit for Task 2.
- Pre-commit hook ran (no `--no-verify`). The `verify` skill as a separate step was not run; its tsc, eslint and test parts were run on the changed files.
- Tracer gate: `<verify>` re-run end to end passed before Task 2 (auto-chain expansion).

## Deviations from Plan

None - plan executed as written. The tests were written before the implementation but I only ran them after both existed, so there is no recorded failing run; the one failing run was a test bug (timeout copy asserted with no token, fixed in the test).

## Not done here (left to the orchestrator)

- Browser check of `/embed/chatwoot-dashboard` via `preview_start` (normal tab should show the not-framed copy, no CSP violation in the console). Not run: subagents may not start a dev server.
- Live check inside Chatwoot (appContext conversation id is the display id, RESEARCH A9) belongs to plan 84-09.
- Re-run `tests/embed-panel.test.tsx` on the main checkout if the symlinked `node_modules` is a concern; all tests passed here.

## Known Stubs

None. The tracer list shows upcoming then the first 10 past bookings in one list without section headings, counters, contact line, Show more, Forget token, payment/notes/driver rows; these are plan 84-08's scope, not stubs wired to empty data.

## Threat Flags

None beyond the plan's threat model (T-84-29 to T-84-33 mitigated as listed: exact origin and source check, exact target origin on fetch-info, sessionStorage only, text-only rendering, credentials omit).

## Self-Check: PASSED

- app/embed/layout.tsx, page.tsx, PanelClient.tsx, panel-handshake.ts, panel.css, tests/embed-panel.test.tsx: present.
- Commit a0f9e369 present on branch worktree-agent-a5a062b0da22c54c0.
