---
phase: 84-chatwoot-dashboard-app
plan: 04
subsystem: api
tags: [chatwoot, dashboard-app, api-route, rate-limit, zod, vitest, security, isolation-guard]
status: complete
requires: ["84-01", "84-02"]
provides:
  - "POST /api/chatwoot/dashboard-app: token-authenticated, read-only panel API (runtime, dynamic, maxDuration, POST)"
  - "LIMITS['/api/chatwoot/dashboard-app'] = 30 per IP per minute (used fail-closed)"
  - "tests/dashboard-app-isolation-guard.test.ts: structural read-only + cookie-less guard for the whole panel path"
affects: [84-05, 84-07]
tech-stack:
  added: []
  patterns:
    - "strict zod body (conversationId only) so no lookup key can come from the client"
    - "single respond/harden helper: no-store + no-referrer on every response, one PII-free log line"
    - "import-closure guard with alias-resolved forbidden-stem matching (works for modules a fixture does not define)"
key-files:
  created:
    - app/api/chatwoot/dashboard-app/route.ts
    - tests/chatwoot-dashboard-route.test.ts
    - tests/dashboard-app-isolation-guard.test.ts
  modified:
    - lib/rate-limit.ts
    - tests/rate-limit.test.ts
    - tests/infra-vps-isolation-guard.test.ts
key-decisions:
  - "Token travels only in the api-access-token header (D-02); an Authorization Bearer header alone is a 401 (test)"
  - "Body cap enforced twice: enforceMaxBody on content-length, then on the bytes actually read (content-length can be absent or wrong); both 413 responses carry no-store"
  - "no_access and not_found produce one byte-identical 403 body; the log outcome still distinguishes them (no token, id, email or phone in the line)"
  - "A verifyOperator throw maps to 502 unavailable; any non-PanelStoreError store failure maps to 500 internal (same as PanelStoreError)"
  - "Operator GET-only rule keys on string literals POST/PUT/PATCH/DELETE anywhere, plus object-property and const/let method declarations; class fields and this.method assignments are not flagged"
requirements-completed: [PANEL-01, PANEL-02]
duration: 20min
completed: 2026-10-29
commits: 2
plan_head_before: 4c8e7a872954a2870959ff094054ec0f5c7f5810
plan_head_after: b48223298d7048ff4b40718e5bcbbd73e61cf7e6
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 04: Panel API route and structural guard Summary

A token-authenticated, read-only `POST /api/chatwoot/dashboard-app` (operator's own `api-access-token`, strict `{conversationId}` body, fail-closed 30/min limiter, uniform no-store responses) plus an import-closure guard that proves the whole panel path cannot write or touch the admin session.

## What was built

- **app/api/chatwoot/dashboard-app/route.ts** (POST only; runtime nodejs, dynamic force-dynamic, maxDuration 10). Order: `enforceMaxBody(2000)` -> `checkRateLimit(..., { failClosed: true })` (429, or 503 when degraded; body `rate_limited`) -> `isPlausibleOperatorToken` on the `api-access-token` header (401 `invalid_token`) -> read body text, 2000-byte check, `JSON.parse`, strict zod `{ conversationId: int 1..2^31-1 }` (400 `bad_request`) -> `verifyOperator` (401 / 403 / 502 / 503 mapping) -> `buildNoContactResponse` when the contact has no email and no phone (RPC never called) -> `createPanelBookingsStore().load` + `buildPanelResponse` with `ESPOCRM_BASE_URL` (store failure -> 500 `internal`). The route reads no cookies and imports nothing from `lib/supabase`.
- **lib/rate-limit.ts**: `'/api/chatwoot/dashboard-app': 30` with comment.
- **tests/chatwoot-dashboard-route.test.ts** (33 tests): tracer happy path (verifyOperator and store.load call args, exactly eight body keys), header gate, body matrix (extra email/phone key, string/zero/negative/fractional/over-max id, missing id, array, bad JSON, empty), 413 by actual bytes and by content-length, verifyOperator outcomes, byte-identical 403 bodies, no_contact short-circuit, phone-only lookup, store errors, limiter deny/degraded, log-spy (one `[panel] outcome= code=` line, no token/email/id), no GET/PUT/PATCH/DELETE export.
- **tests/rate-limit.test.ts**: 30 allowed / 31st denied for the panel path; fail-closed degraded result.
- **tests/infra-vps-isolation-guard.test.ts**: allowlist entry for the route under the operator-only category 84-02 created.
- **tests/dashboard-app-isolation-guard.test.ts** (50 tests): closure guard over the route, `lib/chatwoot-operator.ts`, `lib/panel-bookings.ts`, `lib/panel-dto.ts`, `lib/panel-links.ts` and every file under `app/embed/` (picked up by pattern; none exist yet). Rules: forbidden modules (`lib/supabase/*`, `next/headers`, `@supabase/ssr`, site Chatwoot client and sync, EspoCRM, Stripe, email, bare `stripe`/`resend`), only `createSupabaseServiceClient` from `@/lib/supabase` (embed files: nothing), no `getAdminUser`, no `cookies(`, no `auth.admin`, rpc literal must be `'panel_bookings'` (non-literal rpc names also flagged), no `.from('<table>')` in panel-owned files, operator client GET-only, embed `fetch` only to `/api/chatwoot/dashboard-app` (literal or a const holding it) and no XHR/beacon/WebSocket/EventSource. SCOPE_FLOOR of five entries, fixture self-tests per rule, a non-vacuity test that breaks the real route in memory and expects a violation.

## Commits

- `f9c0e5ca` security(84-04): token-authenticated read-only panel API (tracer)
- `b4822329` security(84-04): structural read-only and cookie-less guard for the panel path

(`commits: 2` is measured from the ledger and excludes this SUMMARY's own commit.)

## Verification

- `npx vitest run tests/chatwoot-dashboard-route.test.ts tests/rate-limit.test.ts tests/infra-vps-isolation-guard.test.ts` : 3 files, 63 tests pass.
- `npx vitest run tests/dashboard-app-isolation-guard.test.ts tests/webhook-isolation-guard.test.ts tests/infra-vps-isolation-guard.test.ts` : 3 files, 95 tests pass. Ran in the worktree through the symlinked node_modules with no next-intl failures.
- `npx tsc --noEmit`: no error lines for the route, rate-limit, or the new tests. `npx eslint --quiet` on the route, rate-limit and the test files: clean.
- Acceptance greps: one `export async function POST`, no GET/PUT/PATCH/DELETE export, one `failClosed: true`, one `'/api/chatwoot/dashboard-app'` in lib/rate-limit.ts, `no-store` present, `SCOPE_FLOOR` x10, `'panel_bookings'` x5. Pre-commit hook ran on both commits (no `--no-verify`).
- Tracer gate (interactive, end-of-phase mode, automated-only verify): verify re-run end-to-end and passed before expanding to Task 2.
- The full `verify` skill was not run as a separate step; its tsc, eslint and test components were run on the changed files.

## Deviations from Plan

None - plan executed as written. Notes: tests for Task 1 were written before the route but all run together once (no separate red run was recorded). A first draft of the GET-only rule flagged the `method: string` class field in `lib/chatwoot-operator.ts` as a violation; the property pattern was narrowed to same-line `{`/`,` object properties, found and fixed in the same task (self-correction, not a code change to 84-02).

Known limitation of the GET-only rule: a multi-line object literal with a non-literal `method:` on its own line is not caught; non-GET string literals are still caught anywhere in the file.

## Known Stubs

None.

## Threat Flags

None. The new network surface (the route) is the one the plan's threat model covers (T-84-14 to T-84-20); no additional trust boundary was introduced.

## Self-Check: PASSED

- app/api/chatwoot/dashboard-app/route.ts, tests/chatwoot-dashboard-route.test.ts, tests/dashboard-app-isolation-guard.test.ts: FOUND
- Commits f9c0e5ca, b4822329: FOUND
