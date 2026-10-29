---
phase: 84-chatwoot-dashboard-app
plan: 05
subsystem: auth
tags: [chatwoot, dashboard-app, csp, frame-ancestors, middleware, security]
status: complete
requires: ["84-02"]
provides:
  - "middleware.ts: EMBED_PREFIX, PANEL_API_PATH, isEmbedPath, buildCspEmbed; /embed branch; cookie-less panel API branch"
  - "next.config.ts: X-Frame-Options excluded for /embed, separate /embed header entries"
  - "public/robots.txt: Disallow /embed/ in both groups"
affects: [84-04, 84-07, 84-09]
tech-stack:
  added: []
  patterns:
    - "dedicated middleware branch that forwards the request without the cookie header and skips next-intl and updateSession"
    - "negative-lookahead header source instead of relying on Next header merge order"
key-files:
  created:
    - tests/middleware-embed.test.ts
    - tests/next-config-headers.test.ts
  modified:
    - middleware.ts
    - next.config.ts
    - public/robots.txt
    - tests/middleware-matcher.test.ts
key-decisions:
  - "frame-ancestors host is written as one single-directive string line in buildCspEmbed so the VPS isolation guard's CSP exemption covers it; no host literal appears in any comment"
  - "The panel API CSRF prefix is a literal in CSRF_PROTECTED_PREFIXES (the const PANEL_API_PATH is declared later in the file); tests pin both to the same path"
  - "Panel API responses reuse buildCspStatic() (same CSP as other /api routes) plus Cache-Control no-store"
  - "Two header entries for /embed ('/embed' and '/embed/:path*') as the plan states; they carry the same set so overlap is harmless"
requirements-completed: [PANEL-02]
duration: 20min
completed: 2026-10-29
commits: 2
plan_head_before: 4c8e7a872954a2870959ff094054ec0f5c7f5810
plan_head_after: 40eb3f601f028315d4032f761fcde74ad5ca242d
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 05: Dashboard App framing boundary Summary

A dedicated `/embed` middleware branch with a per-request nonce CSP whose `frame-ancestors` allows only Prestigo's Chatwoot, plus structurally cookie-less handling of `/embed` and the panel API, so the same-site iframe can never read or refresh the admin session.

## What was built

- **middleware.ts**
  - `buildCspEmbed(nonce)`: `default-src 'none'`, nonce + `'strict-dynamic'` script-src (dev adds `'unsafe-eval' 'self'` only), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src/connect-src 'self'`, `base-uri/form-action/object-src 'none'`, `frame-ancestors` (single Chatwoot origin, own line), `report-uri /api/csp-report`.
  - `/embed` and `/embed/*` (not `/embedded-page`, not `/ru/embed/...`): fresh nonce, CSP and `x-nonce` set on the forwarded request, `cookie` request header deleted, response gets CSP, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. next-intl and `updateSession` are never called, so no `NEXT_LOCALE` and no `Set-Cookie`.
  - `/api/chatwoot/dashboard-app`: added to `CSRF_PROTECTED_PREFIXES` (non-strict: foreign Origin 403, missing Origin passes), cookie header stripped, `updateSession` skipped, `buildCspStatic()` + `no-store`.
  - Matcher protected group is now `(?:api|admin|driver|auth|embed)/`, so `/embed/x.xml` still enters middleware while `/robots.txt`, `/sitemap.xml` and `/vehicles/x.avif` stay excluded.
  - `/embed` added to `NON_LOCALIZED_PREFIXES`; `buildCsp`, `buildCspStatic`, `runCspAndAuthChain` and `isDynamicPath` untouched.
- **next.config.ts**: global header entry source is now `/((?!embed(?:/|$)).*)` (carries X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin and the shared headers); `/embed` and `/embed/:path*` entries carry nosniff, X-XSS-Protection 0, Permissions-Policy, HSTS and `Referrer-Policy: no-referrer`, with no X-Frame-Options.
- **public/robots.txt**: `Disallow: /embed/` next to `Disallow: /admin/` in both groups.
- **Tests**: `tests/middleware-embed.test.ts` (20 tests: exact production and development CSP, nonce freshness, forwarded headers, no next-intl/Supabase calls, no set-cookie, branch boundaries, WR-02 host parity with the public CSP, panel API cookie strip/CSRF matrix, sibling-path and other-/api regression, robots parity), `tests/next-config-headers.test.ts` (compiles the real `headers()` sources with Next's own path-to-regexp and checks XFO per path), matcher cases added to `tests/middleware-matcher.test.ts`.

## Commits

- `54237711` security(84-05): /embed middleware branch with frame-ancestors nonce CSP and cookie strip (tracer)
- `40eb3f60` security(84-05): cookie-less panel API path, XFO exclusion for /embed, matcher and robots

(`commits: 2` is measured from the ledger and excludes this SUMMARY's own commit.)

## Verification

- `npx vitest run tests/middleware-embed.test.ts tests/middleware-matcher.test.ts tests/next-config-headers.test.ts tests/middleware-i18n.test.ts tests/middleware-customer.test.ts tests/middleware-csrf-forms.test.ts tests/infra-vps-isolation-guard.test.ts`: 7 files, 143 tests pass (worktree, symlinked node_modules). `tests/middleware-i18n.test.ts` is unchanged and green, so `buildCsp`/`buildCspStatic` output is unchanged.
- `npx eslint --quiet` on middleware.ts, next.config.ts and the three test files: clean.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`; none in middleware.ts or next.config.ts.
- Acceptance greps: `function buildCspEmbed` 1, frame-ancestors single-line match 1, `frame-ancestors *` 0, `'/embed'` 2, panel path literal 2, matcher group 1, `embed` in next.config.ts 6, robots `/embed/` 2 equals `/admin/` 2.
- The full `verify` skill was not run as a separate step; its tsc, eslint and test components were run on the changed files, and the pre-commit hook ran on both commits (no `--no-verify`).

## Deviations from Plan

None - plan executed as written. The tracer gate (re-run of the automated verify, no blocking-human gate on the task) passed before Task 2.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-84-21 through T-84-25 mitigations are covered by tests; the behavioural proof of frame-ancestors versus X-Frame-Options against the real deployment remains the live `curl -sI` in plan 84-09 (RESEARCH A3 / Pitfall 14).

## Notes for the orchestrator

- Tests ran green through the node_modules symlink; re-running on the main checkout is still advisable.
- `app/embed/...` (plan 84-07) must live outside `app/[locale]`; its page must not read cookies, and the 84-04 route should expect no `cookie` request header.
- Plan 84-04's route file (`app/api/chatwoot/dashboard-app/route.ts`) was not touched.

## Self-Check: PASSED

- tests/middleware-embed.test.ts, tests/next-config-headers.test.ts: present.
- Commits 54237711 and 40eb3f60: present on the worktree branch.
