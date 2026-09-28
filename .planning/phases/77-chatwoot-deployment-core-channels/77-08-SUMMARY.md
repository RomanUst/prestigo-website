---
phase: 77-chatwoot-deployment-core-channels
plan: 08
subsystem: security
tags: [csp, middleware, chatwoot-widget, cookies, isolation-guard]

# Dependency graph
requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: "77-01's app/api/chatwoot/identity/route.ts + tests/infra-vps-isolation-guard.test.ts VPS_ASYNC_ALLOWLIST"
provides:
  - "buildCspStatic() CSP allows the chat widget's exact origin (script-src, frame-src, img-src, connect-src incl. wss) on every public page; buildCsp() (nonce CSP for /admin, /driver) untouched"
  - "tests/infra-vps-isolation-guard.test.ts CSP_EXEMPT_FILE/CSP_DIRECTIVE_LINE_RE — a narrow, fixture-tested line-shape exemption for CSP directive literals in middleware.ts, never widened to env vars/imports/other files"
  - "customerSignOut() clears every cw_* cookie before signing out (T-77-20/D-05 shared-device mitigation)"
affects: [77-10-chat-launcher, 77-12-production-csp-diff]

# Actuals (#2632)
actuals:
  tokens: 4563
  tasks: 2
  commits: 2
  plan_head_before: 93e9efe241ed1ec9767c967f57a0e4eba633c7b2
  plan_head_after: 601d16044d7b565fc8e227a44d37366df4a62e75

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSP directive-line exemption: CSP_EXEMPT_FILE + CSP_DIRECTIVE_LINE_RE (backreference-quote-aware regex) tolerates a host literal only on a single CSP-directive string line in middleware.ts — env var and package-import checks in the same guard stay unexempted"
    - "Best-effort cookie cleanup on sign-out: cookies().getAll() + name-prefix filter + delete({name,path}), wrapped in try/catch so a cookie-store failure never blocks the sign-out flow itself"

key-files:
  created: []
  modified:
    - middleware.ts
    - tests/infra-vps-isolation-guard.test.ts
    - tests/middleware-i18n.test.ts
    - app/[locale]/login/actions.ts
    - tests/auth-customer.test.ts

key-decisions:
  - "Added the chat origin literally to script-src (both dev/prod ternary branches) even though production's 'https:' scheme-source already covers it — the plan's own acceptance criteria (5x 'https://chat.rideprestigo.com' occurrences) requires the explicit literal for auditability/grep-ability, not just CSP effectiveness"
  - "Kept the new JSDoc paragraph above buildCspStatic() free of the literal substring 'chat.rideprestigo' — it sits inside the plan's own indexOf('function buildCsp(')..indexOf('function buildCspStatic(') acceptance-criteria slice, so a literal mention there would have failed the 'buildCsp untouched' check despite the nonce CSP itself never changing"

patterns-established:
  - "Guard exemption line-shape spec (CSP_DIRECTIVE_LINE_RE) is documented in the guard's own header comment as a reusable narrow-exemption template for future single-file/single-line-shape guard relaxations"

requirements-completed: [INBOX-04, INBOX-03]

coverage:
  - id: D1
    description: "buildCspStatic() (the CSP served on every public page — marketing, /book, /login, /account, all 7 locales) adds the exact https://chat.rideprestigo.com origin to script-src (both dev/prod branches), frame-src and img-src, and both https/wss to connect-src; buildCsp() (nonce CSP for /admin, /driver) is byte-unchanged"
    requirement: "INBOX-04"
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#CSP: chat widget exact origin on public pages (INBOX-04, D-09) — 5 cases (static /, /ru/book, /login, token-removal round-trip, /admin absence)"
        status: pass
      - kind: other
        ref: "grep -c https://chat.rideprestigo.com middleware.ts == 5; grep -c wss://chat.rideprestigo.com middleware.ts == 1; node -e slice-check proves buildCsp()'s own body carries no chat.rideprestigo reference"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/infra-vps-isolation-guard.test.ts learns a narrow CSP-directive-line exemption (CSP_EXEMPT_FILE='middleware.ts' + CSP_DIRECTIVE_LINE_RE) for the host-literal check only; env var and package-import checks stay unexempted; the real-tree guard stays green with the same single VPS_ASYNC_ALLOWLIST entry from 77-01"
    requirement: "INBOX-04"
    verification:
      - kind: unit
        ref: "tests/infra-vps-isolation-guard.test.ts#CSP directive-line exemption (Phase 77, D-09/T-77-19) — 5 fixture cases (a-e): exempt CSP line, fetch() call violation, non-middleware file violation, CHATWOOT_ env-name-on-CSP-line violation, CSP-line-plus-statement violation"
      - kind: unit
        ref: "tests/infra-vps-isolation-guard.test.ts#has zero violations on the real tree"
        status: pass
    human_judgment: false
  - id: D3
    description: "customerSignOut() deletes every cookie whose name starts with cw_ (path '/') before calling supabase.auth.signOut(), leaving all other cookies (e.g. sb-auth-token) untouched, and never blocks sign-out when the cookie store throws"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/auth-customer.test.ts#AUTH-07: customerSignOut — 'deletes every cw_* cookie (path \"/\") and leaves other cookies alone' and 'a cookie-store failure never blocks sign-out'"
        status: unknown
      - kind: other
        ref: "standalone isolated Node script replicating the exact getAll()/startsWith('cw_')/delete({name,path:'/'}) loop against a fixture cookie jar (3 cookies, 2 cw_* + 1 sb-auth-token) — confirms exactly 2 deletions, correct args, sb-auth-token untouched"
        status: pass
    human_judgment: true
    rationale: "tests/auth-customer.test.ts is one of 5 files affected by a pre-existing, documented worktree-local node_modules gap (Phase 71 deferred item, WINDOWS #17/#18/#19 precedent) that breaks its vi.importActual('../node_modules/next-intl/...') relative import — could not execute in this isolated worktree despite two attempted workarounds (node_modules symlink; symlink + expanded vitest server.fs.allow config). Implementation verified via tsc --noEmit (0 new errors, matches the 8-error baseline exactly), eslint --quiet (0 warnings, Task 2's own acceptance criterion), grep, and the isolated algorithmic replica above — but the project's own vitest assertions have not actually run. Logged as WINDOWS #31 (kind unrun-verify); needs confirmation once this file runs with real node_modules (main branch or a merged worktree)."

duration: 20min
completed: 2026-09-28
status: complete
---

# Phase 77 Plan 08: Chatwoot Widget CSP + Guard Exemption + Sign-out Cookie Hygiene Summary

**Exact-origin CSP (`https://chat.rideprestigo.com`) added to the public-page `buildCspStatic()` only, a fixture-tested line-shape exemption teaches the VPS isolation guard to tolerate that one CSP-directive literal, and `customerSignOut()` now clears the chat widget's `cw_*` cookies so a shared device never leaks the previous customer's conversation.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-28T22:10Z (approx.)
- **Completed:** 2026-09-28T22:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `middleware.ts`: `buildCspStatic()` (served on every public page — marketing, `/book`, `/login`, `/account`, all 7 locales) now allows `https://chat.rideprestigo.com` in `script-src` (both dev/prod branches), `frame-src` and `img-src`, plus `https://chat.rideprestigo.com`/`wss://chat.rideprestigo.com` in `connect-src`. `buildCsp()` — the nonce CSP served only to `/admin` and `/driver`, which never mount the launcher per D-03 — is byte-for-byte unchanged.
- `tests/infra-vps-isolation-guard.test.ts`: added `CSP_EXEMPT_FILE`/`CSP_DIRECTIVE_LINE_RE` (a backreference-aware regex matching a single CSP-directive string literal, optionally ternary-prefixed, alone on its own line). The exemption applies **only** to the host-literal check, **only** for `middleware.ts` — env var references and package imports on the same line, or the identical line shape in any other file, still violate. 5 new fixture tests prove each boundary independently; the guard stays green on the real tree with the same single `VPS_ASYNC_ALLOWLIST` entry from 77-01.
- `tests/middleware-i18n.test.ts`: new `describe('CSP: chat widget exact origin on public pages (INBOX-04, D-09)')` block — asserts the chat origin on static `/`, locale-prefixed `/ru/book`, and `/login`; a token-removal round-trip proving the previous directive strings are otherwise byte-identical; and its absence from `/admin`'s nonce CSP.
- `app/[locale]/login/actions.ts`: `customerSignOut()` now reads `cookies()` from `next/headers` before `supabase.auth.signOut()`, deletes every cookie whose name starts with `cw_` (path `/`), and wraps the whole block in `try/catch` so a cookie-store failure can never block sign-out itself.
- `tests/auth-customer.test.ts`: added a controllable `cookies()` mock (`next/headers`, spreading the real module so `headers()` keeps its existing throw-and-catch test behavior) and two new AUTH-07 cases proving `cw_*`-only deletion and failure-never-blocks-sign-out; the pre-existing AUTH-07 expectations (signOut called once, redirect to `/`) are unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): exact-origin CSP for the widget on public pages, guard stays green via a scoped CSP-line rule** - `feb244e2` (security)
2. **Task 2: customer sign-out clears the chat widget's cw_* cookies** - `601d1604` (security)

## Files Created/Modified
- `middleware.ts` - `buildCspStatic()` gains the exact chat origin (script-src x2, frame-src, img-src, connect-src https+wss)
- `tests/infra-vps-isolation-guard.test.ts` - `CSP_EXEMPT_FILE`, `CSP_DIRECTIVE_LINE_RE`, 5 fixture tests
- `tests/middleware-i18n.test.ts` - CSP origin assertions (public path + `/admin` absence + round-trip)
- `app/[locale]/login/actions.ts` - `customerSignOut()` clears `cw_*` cookies
- `tests/auth-customer.test.ts` - `cookies()` mock + 2 new AUTH-07 cases

## Decisions Made
- Added the chat origin literally to `script-src` (both ternary branches) even though production's `https:` scheme-source token already permits it — the plan's own acceptance criteria require the explicit literal (5 occurrences of the exact string), for auditability and future `csp_baseline.json` diffing (77-12), not just runtime effectiveness.
- The new JSDoc paragraph above `buildCspStatic()` deliberately avoids the literal substring `chat.rideprestigo` (describing it as "the widget's VPS subdomain, below" instead) — that paragraph sits inside the plan's own `indexOf('function buildCsp(')..indexOf('function buildCspStatic(')` acceptance-criteria slice, so a literal mention there would have falsely tripped the "buildCsp untouched" check even though the nonce-CSP function body itself never changed.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were implemented and verified as specified.

## Issues Encountered

- **Worktree-local `node_modules` gap (pre-existing, documented, not caused by this plan):** `tests/auth-customer.test.ts` is one of 5 test files repo-wide (`account-trips.test.tsx`, `auth-customer.test.ts`, `login-actions.test.ts`, `passenger-actions.test.ts`, `profile-actions.test.ts`) whose `vi.mock('next-intl/server', ...)` factory does `vi.importActual('../node_modules/next-intl/dist/esm/development/server.react-server.js')` — a path relative to the test file's own location. This worktree has no local `node_modules` (by design; `npm install` is blocked for subagents), so the relative import fails at `ERR_MODULE_NOT_FOUND` regardless of any mock changes. This is the same gap recorded at Phase 71 close (STATE.md) and hit again in Phase 75 (WINDOWS #17/#18/#19) and Phase 77 Plan 02 (`77-02-SUMMARY.md`) — confirmed unrelated to this plan's code changes (the failure is identical with or without my edits to the file). Two workarounds were attempted (a `node_modules` symlink to the main checkout; the symlink plus an expanded `vitest.verify.config.ts` with `server.fs.allow`) — both hit a deeper `vite-node` SSR module-resolution limit (`/@fs/...` path passed unresolved to Node's loader) that is out of this plan's scope to fix. Both temporary artifacts (symlink, scratch config) were removed before committing; `git status --short` confirmed a clean tree at every commit. The full suite (`npx vitest run`, 171 files) was run to confirm no other regression: 164 files / 2947 tests passed, only the same known 5 files failed identically to the pre-existing baseline. Logged as `WINDOWS.md` entry #31 (`kind: unrun-verify`).
- Task 1's `<acceptance_criteria>` node-script check ("buildCsp untouched") initially failed after the first JSDoc edit because the added paragraph (above `buildCspStatic`, but still inside the plan's own `buildCsp(`..`buildCspStatic(` text slice) repeated the literal domain string — fixed within the same task, before any commit, by rephrasing the paragraph to avoid the literal substring. Not a deviation from the plan (no code behavior changed, only comment wording) — documented here for traceability since it briefly caused the acceptance-criteria grep count to read 6 instead of 5.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The chat launcher (plan 77-10) can rely on `https://chat.rideprestigo.com` already being CSP-allowed on every public page it will mount on.
- The guard's `CSP_EXEMPT_FILE`/`CSP_DIRECTIVE_LINE_RE` pattern is documented and fixture-proven; no further guard changes are anticipated unless a future plan needs a second CSP-carrying file (which would require extending `CSP_EXEMPT_FILE` deliberately, not widening the current rule).
- Plan 77-12's reviewed `csp_baseline.json` diff can cite this plan's exact before/after `buildCspStatic()` directive strings (see Accomplishments above).
- `tests/auth-customer.test.ts`'s new assertions need a live vitest run with real `node_modules` (main branch, or any worktree merge target) to close WINDOWS #31 — no code action needed, just re-running the suite outside this isolated worktree.

---
*Phase: 77-chatwoot-deployment-core-channels*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: middleware.ts (modified)
- FOUND: tests/infra-vps-isolation-guard.test.ts (modified)
- FOUND: tests/middleware-i18n.test.ts (modified)
- FOUND: app/[locale]/login/actions.ts (modified)
- FOUND: tests/auth-customer.test.ts (modified)
- FOUND commit: feb244e2 (Task 1)
- FOUND commit: 601d1604 (Task 2)
- Acceptance criteria re-verified: `grep -c https://chat.rideprestigo.com middleware.ts` → 5; `grep -c wss://chat.rideprestigo.com middleware.ts` → 1; buildCsp-untouched node check → OK; `grep -c cw_ "app/[locale]/login/actions.ts"` → 1; `npx eslint --quiet "app/[locale]/login/actions.ts" middleware.ts` → exit 0
- `npx vitest run tests/infra-vps-isolation-guard.test.ts tests/middleware-i18n.test.ts tests/middleware-matcher.test.ts` → 73/73 passed
- `npx tsc --noEmit` → 8 errors, all in the documented pre-existing baseline (0 new)
- `npx vitest run` (full suite, 171 files) → 164 passed / 5 failed (pre-existing worktree-local `node_modules` gap, WINDOWS #31) / 2 skipped; 2947 tests passed, 0 new failures
- `tests/auth-customer.test.ts` (Task 2's own new assertions): NOT executed in this worktree (see Issues Encountered / WINDOWS #31); verified instead via an isolated algorithmic replica of the exact cookie-deletion loop, which passed
