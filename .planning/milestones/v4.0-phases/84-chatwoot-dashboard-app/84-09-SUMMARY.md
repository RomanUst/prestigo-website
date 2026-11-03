---
phase: 84-chatwoot-dashboard-app
plan: 09
subsystem: go-live
tags: [chatwoot, dashboard-app, csp, uat, cve]
status: complete
requires: ["84-01", "84-02", "84-03", "84-04", "84-05", "84-06", "84-07", "84-08"]
provides:
  - "Phase 84 live on production (PR #77, merge 48bdecfd)"
  - "scripts/qa/csp_regression.py: /embed/chatwoot-dashboard route class; baseline key captured"
  - "infra/vps/runbooks/chatwoot-dashboard-app.md: go-live CVE re-check rows (2026-10-29)"
affects: []
key-files:
  modified:
    - scripts/qa/csp_regression.py
    - scripts/qa/baselines/csp_baseline.json
    - infra/vps/runbooks/chatwoot-dashboard-app.md
key-decisions:
  - "Go-live commit kept off main on chore/phase84-golive-checks (QA script, baseline and runbook only, no runtime effect)"
requirements-completed: [PANEL-01, PANEL-02]
completed: 2026-10-29
commits: 1
---

# 84-09 — Go-live, live checks and owner UAT

## Task 1 — ship and register (owner)

- PR #77 merged to `main` at the owner's request ("Да, мержи"), merge commit `48bdecfd`; Vercel production served
  `/embed/chatwoot-dashboard` with 200 about 90 s later.
- Owner ran `infra/chatwoot/sync.mjs --only dashboardApps` and replied "live". The sync output itself was not
  pasted; the Bookings tab being present was confirmed by the owner's UAT step 1 ("approved").

## Task 2 — live checks (Claude), commit `53dd257a`

| Check | Result |
|---|---|
| `curl -sI /embed/chatwoot-dashboard` | 200; CSP `default-src 'none'`, `script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors https://chat.rideprestigo.com`; no `X-Frame-Options`; no `Set-Cookie`; `referrer-policy: no-referrer`; `cache-control: private, no-store` |
| Page markup | `<meta name="robots" content="noindex, nofollow">`; `robots.txt` has `Disallow: /embed/` |
| `POST /api/chatwoot/dashboard-app` without token | 401 |
| same with `api-access-token: invalid-probe` | 401 |
| same with `Origin: https://evil.example` | 403 |
| `GET /api/chatwoot/dashboard-app` | 405 |
| `Set-Cookie` on API response | none |
| `csp_regression.py --compare` (11 existing classes) | 0 findings |
| `--capture` with the embed class added | `added: ['/embed/chatwoot-dashboard']`, removed none, changed none; `git show 53dd257a --stat -- scripts/qa/baselines/csp_baseline.json` = 5 insertions, 0 deletions |
| CVE-2025-12245 re-check | advisory still `vulns: []`; newest release v4.19.1; `IFrameHelper.js` v4.18.0 vs v4.19.1 byte-identical, no origin check; three dated rows added to the runbook evidence log |

## Task 3 — live UAT

| Step | Who | Result |
|---|---|---|
| 1. Known customer: counters, Upcoming/Past cards, Open in admin | owner | approved |
| 2. No-bookings state; name-only contact hint, then email added + refresh | owner | approved |
| 3. Copy payment link in the real iframe (UI-SPEC backstop) | owner | approved |
| 4. Dark/light theme, narrow/wide sidebar (UI-SPEC backstops: contrast both themes, widths) | owner | approved |
| 5. Admin cookie not sent; token only in Session Storage | owner | approved |
| 6. Second agent: no-access message; reset token → "Token not accepted" | owner | approved |
| 7. Unframed page | Claude (built-in browser) | "Open this panel from a Chatwoot conversation." |
| 8. Site widget "UAT 84" | Claude (built-in browser, essential cookies only) | message sent; `chat_conversations` row 204 created with an open chat_lead and an EspoCRM lead |

Data backstop on the live database (same function the API calls):
known customer → found, total 12, trip_count 2, spent_eur 46, 12 rows × 24 allowlisted keys;
conversation 204 contact → found, 0 bookings, Lead pointer present; unknown email → not found, empty.

Automated re-run after UAT: 6 files, 229 tests passed.

## Follow-ups

- Test conversation 204 in Chatwoot and its EspoCRM lead (`uat84@example.com`) can be closed / deleted by the owner.

## Post-UAT fix — Chatwoot mobile app (PR #78, merge 508d0090)

- Owner report after UAT: in the Chatwoot mobile app the Bookings tab showed "Open this panel from a Chatwoot
  conversation." Cause: chatwoot-mobile-app `DashboardScreen.tsx` opens a Dashboard App top level in
  react-native-webview (no iframe) and answers `fetch-info` sent via `window.ReactNativeWebView` by injecting
  `window.postMessage(appContext)` into the page.
- Fix `41006c6f`: `nativeBridgeOf` + `isTrustedWebViewEvent` (source === this window, origin === own origin);
  iframe path unchanged. Same commit fixes review WR-01 (data cleared on conversation change). 6 new tests.
- First production build failed on a Google Fonts download (Noto Sans Arabic, Turbopack), unrelated to the diff;
  `vercel redeploy` succeeded. Live bundle contains the bridge code; embed headers and API 401 re-checked.
- Owner confirmed on the phone: bookings visible in the mobile app ("Работает", 2026-10-30).
- Known trade-off: the token lives in sessionStorage (D-02), so the mobile WebView asks for it on each open.
