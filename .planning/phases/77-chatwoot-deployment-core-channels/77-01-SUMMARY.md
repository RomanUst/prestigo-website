---
phase: 77-chatwoot-deployment-core-channels
plan: 01
subsystem: api
tags: [chatwoot, hmac, chat-widget, supabase-auth, node-crypto]

# Dependency graph
requires:
  - phase: 76-vps-infrastructure
    provides: chat.rideprestigo.com Chatwoot instance + tests/infra-vps-isolation-guard.test.ts
provides:
  - "GET /api/chatwoot/identity — server-side widget config + HMAC identity for signed-in customers"
  - "lib/chat-widget-contract.ts — client-safe response types + isSafeWidgetBaseUrl, importable by the plan 77-10 launcher"
  - "lib/chatwoot-identity.ts — computeIdentifierHash + buildWidgetConfig, server-only helpers"
  - "One deliberate VPS_ASYNC_ALLOWLIST entry for the identity route"
affects: [77-10-chat-launcher, 82-sync-foundation]

# Actuals (#2632)
actuals:
  tokens: 4194
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard-first Route Handler with no request parameter — identity derives exclusively from supabase.auth.getUser(), never a client-supplied value"
    - "Fail-closed config builder (buildWidgetConfig) — missing/unsafe env yields {enabled:false}; missing HMAC secret yields user:null, never a thrown error"

key-files:
  created:
    - lib/chat-widget-contract.ts
    - lib/chatwoot-identity.ts
    - app/api/chatwoot/identity/route.ts
    - tests/chatwoot-identity.test.ts
  modified:
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "Widget base URL + website token delivered by this route (not baked into client code), so the isolation guard needs exactly one allowlist entry (this route) — the widget loader itself carries no VPS host literal or CHATWOOT_ env reference (plan's own recorded design choice)"
  - "buildWidgetConfig combined RED+GREEN into the plan's specified single commit per task (Task 1 tracer, Task 2 hardening) rather than separate RED/GREEN commits, matching the plan's explicit one-commit-per-task instruction"

patterns-established:
  - "Identity fields (email/name/phone) trimmed, empty->null, length-capped (name 120, phone 40) before leaving buildWidgetConfig — reusable shape for any future customer-identity-to-third-party-service builder"

requirements-completed: [INBOX-03]

coverage:
  - id: D1
    description: "GET /api/chatwoot/identity returns identifier=auth.users.id and identifierHash=HMAC-SHA256(secret,id) as lowercase hex, plus email/name/phone from customer_profiles, for a signed-in customer"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/chatwoot-identity.test.ts#returns 200 JSON with a correct HMAC identity for a signed-in user"
        status: pass
      - kind: unit
        ref: "tests/chatwoot-identity.test.ts#matches the pinned literal digest (catches an implementation change)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Anonymous visitor gets enabled:true with baseUrl/websiteToken/user:null so the widget still loads"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/chatwoot-identity.test.ts#returns the anonymous widget config when getUser returns no user"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fail-closed on every misconfiguration: missing base URL/token -> enabled:false; missing HMAC secret -> user:null; no response ever leaks the secret or an error naming a missing variable"
    verification:
      - kind: unit
        ref: "tests/chatwoot-identity.test.ts — 'fail-closed matrix (Task 2)' describe block (9 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every response carries Cache-Control: no-store; route is force-dynamic"
    verification:
      - kind: unit
        ref: "tests/chatwoot-identity.test.ts#every branch (including the fail-closed ones) sets Cache-Control no-store"
        status: pass
      - kind: other
        ref: "grep -c force-dynamic app/api/chatwoot/identity/route.ts (prints 1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "tests/infra-vps-isolation-guard.test.ts stays green with exactly one new VPS_ASYNC_ALLOWLIST entry; lib/chatwoot-identity.ts and lib/chat-widget-contract.ts carry no VPS host literal and no uppercase CHATWOOT_ identifier"
    requirement: "INBOX-03"
    verification:
      - kind: unit
        ref: "tests/infra-vps-isolation-guard.test.ts — 'has zero violations on the real tree'"
        status: pass
      - kind: other
        ref: "grep -cE CHATWOOT_[A-Z0-9_]+ lib/chatwoot-identity.ts lib/chat-widget-contract.ts (prints 0 for both)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 01: Chat Widget Identity Route Summary

**Server-side HMAC-SHA256 identity route (`GET /api/chatwoot/identity`) that hands the click-to-load Chatwoot widget its config plus a session-derived `identifier_hash`, computed with Node's built-in `crypto` and never exposed to the browser.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-28T23:57Z
- **Completed:** 2026-09-29T00:04Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `lib/chat-widget-contract.ts`: pure client/server contract (`WidgetConfigResponse`, `WidgetIdentity`, `WIDGET_CONFIG_PATH`, `isSafeWidgetBaseUrl`) with zero node/next/supabase imports — safe for the plan 77-10 launcher to import directly.
- `lib/chatwoot-identity.ts`: `computeIdentifierHash` (HMAC-SHA256 hex via `node:crypto`) and `buildWidgetConfig`, which fails closed on missing/unsafe base URL, missing website token, or missing HMAC secret, and trims/caps identity fields (name ≤120 chars, phone ≤40 chars, empty strings → null).
- `app/api/chatwoot/identity/route.ts`: `GET` with zero request parameters (so no query/body value can influence identity), `dynamic = 'force-dynamic'`, `Cache-Control: no-store` on every branch, derives identity exclusively from `supabase.auth.getUser()`, and never throws — any Supabase failure (auth or profile read) degrades to the anonymous shape.
- `tests/chatwoot-identity.test.ts`: 24 test cases — a pinned known-vector HMAC digest, the anonymous/signed-in/no-store route matrix (Task 1), and the Task 2 hardening matrix (missing env vars, unsafe base URL forms, missing HMAC secret, `getUser` throwing, a `customer_profiles` read error, a crafted query-string identifier proven to have no effect, secret/`HMAC_SECRET` never present in the serialized JSON, trailing-slash normalization, trim/cap behavior).
- `tests/infra-vps-isolation-guard.test.ts`: exactly one new `VPS_ASYNC_ALLOWLIST` entry for the identity route, with a reason naming the click-triggered async mechanism. Guard stays green on the real tree.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): identity route end to end** - `69674f4b` (security)
2. **Task 2: fail-closed matrix, spoof resistance and no-store hardening** - `d6d0810e` (security)

_Both commits use the `security:` prefix per CLAUDE.md (auth/identity work)._

## Files Created/Modified
- `lib/chat-widget-contract.ts` - Shared response types + `isSafeWidgetBaseUrl` (https-only, exact-origin check)
- `lib/chatwoot-identity.ts` - `computeIdentifierHash`, `buildWidgetConfig` (fail-closed, trim/cap)
- `app/api/chatwoot/identity/route.ts` - `GET` route handler, force-dynamic, no-store, session-only
- `tests/chatwoot-identity.test.ts` - 24 test cases covering the HMAC vector, route matrix, and hardening
- `tests/infra-vps-isolation-guard.test.ts` - one new `VPS_ASYNC_ALLOWLIST` entry

**Pinned HMAC vector** (for reference, no secret leaked — `test-secret`/`11111111-2222-3333-4444-555555555555` is a fixture pair, not a real credential): `197852d5db0511671a896ce0244ebe0243dba0ce3ecbd38ad52e3a22e567ea6b`

**Allowlist entry added:** `app/api/chatwoot/identity/route.ts` — reason: "on-demand identity endpoint fetched only by the chat launcher's click handler after the visitor clicks 'Chat on site'; reads env and computes an HMAC locally, makes no network call to the VPS, and never runs on page render"

## Decisions Made
- Combined RED+GREEN into one commit per task, per the plan's own explicit single-commit-per-task instruction (Task 1 tracer commit, Task 2 hardening commit) rather than separate `test:`/`feat:` commits.
- Applied trim/empty-to-null/length-cap uniformly to email/name/phone in `buildWidgetConfig` (the plan's acceptance criteria named name/phone explicitly; email received the same treatment for consistency, capped at 254 chars).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were implemented and verified without needing an unplanned fix, missing-dependency install, or architectural change.

## Issues Encountered
- Initial `vi.hoisted` factory referenced `mockFrom`/`mockSelect`/`mockEq` declared as plain `const`s below the hoisted call, which Vitest hoists above them — hit "Cannot access 'mockFrom' before initialization" on the first test run. Fixed by moving all Supabase-chain mock functions inside the single `vi.hoisted(() => {...})` factory. Not a deviation from the plan's design (the plan's `<read_first>` reference, `tests/admin-flight-refresh.test.ts`, uses a similar but simpler chain that didn't hit this ordering issue) — a mechanical test-authoring fix, verified by the subsequent green run.

## User Setup Required

None - no external service configuration required. `CHATWOOT_BASE_URL`, `CHATWOOT_WEBSITE_TOKEN`, and `CHATWOOT_WIDGET_HMAC_SECRET` are Vercel Production env vars set in plan 77-09 (not this plan); the route reads them via `readEnv` and fails closed until they exist.

## Next Phase Readiness
- `lib/chat-widget-contract.ts` and `WIDGET_CONFIG_PATH` are ready for plan 77-10's `ChatLauncher`/`ChatWidgetLoader` to fetch on click.
- The isolation guard (`tests/infra-vps-isolation-guard.test.ts`) is green with exactly one deliberate entry — plan 77-10 must not need to add a second entry for the launcher itself if it carries no VPS host literal/env reference, per the plan's own design note.
- No blockers for downstream plans in this wave.

---
*Phase: 77-chatwoot-deployment-core-channels*
*Completed: 2026-09-29*

## Self-Check: PASSED

- FOUND: lib/chat-widget-contract.ts
- FOUND: lib/chatwoot-identity.ts
- FOUND: app/api/chatwoot/identity/route.ts
- FOUND: tests/chatwoot-identity.test.ts
- FOUND commit: 69674f4b (Task 1)
- FOUND commit: d6d0810e (Task 2)
- All acceptance criteria re-verified: `npx vitest run tests/chatwoot-identity.test.ts tests/infra-vps-isolation-guard.test.ts` → 36/36 passed
- `verify` skill (default mode): PASS (types OK, lint OK, 36/36 related tests, invariants OK)
