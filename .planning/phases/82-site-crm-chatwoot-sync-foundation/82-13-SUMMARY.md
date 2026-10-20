---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 13
subsystem: admin-erasure-ui-and-api
tags: [gdpr, erasure, admin, hmac, security, tdd, GDPR-01, D-07, D-09]
status: complete
requires:
  - phase: 82-12 (erasure saga, migration 075 live, lib/erasure-store.ts)
  - phase: 82-11 (admin page patterns, adminFieldStyles, sidebar ordering)
provides:
  - lib/erasure-hash.ts (loadErasureHmacKey, erasureEmailHmac, hmacEquals; env ERASURE_HMAC_KEY)
  - POST /api/admin/erasure/preview, POST /api/admin/erasure/confirm, GET /api/admin/erasure
  - /admin/erasure page with ErasureSearch, ErasurePreview, ErasureConfirmForm, ErasureAuditTable
  - Sidebar entry Erasure after Identities
affects: [82-14, 82-15 (runbook must document ERASURE_HMAC_KEY and the go-live env step)]
key-files:
  created:
    - lib/erasure-hash.ts
    - app/api/admin/erasure/route.ts
    - app/api/admin/erasure/preview/route.ts
    - app/api/admin/erasure/confirm/route.ts
    - app/(internal)/admin/(dashboard)/erasure/page.tsx
    - components/admin/ErasureSearch.tsx
    - components/admin/ErasurePreview.tsx
    - components/admin/ErasureConfirmForm.tsx
    - components/admin/ErasureAuditTable.tsx
    - tests/admin-erasure.test.ts
    - tests/erasure-page.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - tests/AdminSidebar.test.tsx
    - tests/business-number-guard.test.ts
    - .env.example
decisions:
  - "Server is the gate: confirm loads the stored request, recomputes HMAC-SHA256(ERASURE_HMAC_KEY, normalised typed email), compares timing-safe, then checks identityVerified (zod literal true) and upcoming acknowledgement, then calls erasure_confirm with the session admin id (RPC adds same-admin, TTL and one-active-request checks), then publishes erase.person:<id> with dedupSuffix c"
  - "Fail closed: missing or short (<32 chars) ERASURE_HMAC_KEY answers 503 erasure_unconfigured on preview and confirm, after the 401/403 guard and before the body is read"
  - "lib/erasure-store createErasurePreview takes an object ({ actor, emailHmac, scope, ttlSeconds }), not positional arguments as the plan interface block says; the routes follow the real signature"
  - "Preview counts are returned camelCase (bookings, upcoming, inquiries, quoteLeads, hasAccount); the Site row sums inquiries + quoteLeads as 'form inquiries'; the stored request keeps snake_case counts (counts.upcoming is what confirm reads)"
  - "A missing step in a request that already failed renders 'Failed' (Site never runs when verification finds survivors); a step carrying an error renders 'Failed' with an Open Outbox link; Completed badge needs status completed + all three Done + Verified Yes"
  - "The confirm form defers its initial focus (setTimeout 0): Modal records document.activeElement in its own effect, which runs after child effects, so a synchronous focus would make the checkbox the remembered trigger and break focus return to 'Erase this person...'"
metrics:
  tasks_total: 3
  tasks_done: 3
  commits: 3
  plan_head_before: 7903212f0a555e3f697f060ad8b05c4e0e151fa0
  plan_head_after: cc22bb58329815a94fdc696775dd6e1d456ca061
  completed: 2026-10-19
actuals:
  tokens: 95000
  tasks: 3
  commits: 3
---

# Phase 82 Plan 13: Admin erasure page and routes Summary

The owner can now start a GDPR erasure only through `/admin/erasure`: search by email or phone, read exactly what will happen, confirm in a modal, and follow the request in a log that holds no personal data. The server re-checks the typed email against a keyed HMAC, so the UI is not the only gate (GDPR-01, D-07, D-09).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | HMAC helper, preview / confirm / log routes (API layer) | c93fa059 |
| 2 | /admin/erasure search, preview, confirm modal, sidebar entry | 0c871b92 |
| 3 | Erasure log table, per-system states, polling | cc22bb58 |

`commits: 3` is measured with `git rev-list --count 7903212f..HEAD` before this SUMMARY commit.

## What was built

**API (Supabase only, no CRM or Chatwoot import; isolation guard green)**
- `lib/erasure-hash.ts`: `loadErasureHmacKey` (>= 32 chars else null), `erasureEmailHmac` (64 hex over the normalised email), `hmacEquals` (equal-length Buffers + `timingSafeEqual`, false on length mismatch).
- `POST /api/admin/erasure/preview { query }`: 401/403, then 503 without the key, 400 for bad JSON/shape (strict zod, 1..200 chars, no line breaks), `@` in the query means email else phone (E.164 via `normalizeIdentityPhone`), neither valid is 422 `invalid_query`; non-ok scope outcomes are 422 `{ error, identities? }`; ok stores the preview (TTL 900 s, HMAC of the primary email) and returns `{ requestId, primaryEmail, counts }`.
- `POST /api/admin/erasure/confirm { requestId, confirmEmail, identityVerified: true, upcomingAcknowledged? }`: 401/403, 503 without the key, 400 (strict zod, `identityVerified` is `z.literal(true)`), 422 `not_found` / `email_mismatch` / `upcoming_not_acknowledged` / the RPC outcome (`actor_mismatch`, `already_in_progress`, `expired`, `not_previewed`, `not_found`); on `confirmed` publishes `erase.person:<requestId>` (`dedupSuffix: 'c'`) and answers `{ ok: true, queued: true, published }`. A failed publish is still 200 (`published: false`): the daily sweep re-arms the row.
- `GET /api/admin/erasure`: `{ rows }` from `erasureLog(100)` (hash prefix, status, step counts, verified, dates).
- Logs: `[admin/erasure.<METHOD>] code=<code>` only; a test asserts a thrown error containing an email never reaches the log.

**UI (UI-SPEC copy verbatim, weights 400/500, 44px targets, focus ring via `focusRingHandlers`)**
- Search with `EMAIL OR PHONE` label, spec placeholder, `Preview erasure`, and the validation / not found / shared phone (N) / already in progress messages inline (role=alert). A new search clears the previous preview.
- Preview: 20px person email (500), `WHAT WILL HAPPEN`, Site / Chatwoot / EspoCRM / Not covered rows, ShieldAlert warning panel when upcoming > 0, `Erase this person...` (destructive outline) and `Discard preview`.
- Confirm modal `Erase this person permanently`: identity checkbox, second checkbox only with upcoming trips, `TYPE THE EMAIL TO CONFIRM` (case-insensitive, trimmed), filled `#f87171` `Erase permanently` disabled until all gates pass, single submit via `submittingRef`, `Erasing...`, error text in the modal (role=alert, modal stays open), `Keep this person`. On success the modal closes, the preview (and with it the plain email) is cleared, the aria-live message `Erasure queued. It usually finishes within a few minutes.` appears and the log refreshes immediately.
- Log: 8 columns, 48px rows, `overflow-x: auto` wrapper, `min-width: 720px`, cells truncated at 280px with `title`, reference = 10-char hash prefix, system cells `Done` + 11px counts / `Pending` / red `Failed` + `Open Outbox` link, Verified Yes/No, badges Queued / In progress / Completed / Needs attention, `Loading...`, empty state, load-error state with `Refresh erasure log`, 10 s polling only while a row is Queued or In progress (stops when none is or after a load error).
- Sidebar `Erasure` directly after `Identities`.

## Verification

- `npx vitest run tests/admin-erasure.test.ts tests/erasure-page.test.tsx tests/AdminSidebar.test.tsx tests/infra-vps-isolation-guard.test.ts tests/business-number-guard.test.ts tests/identities-page.test.tsx`: 6 files, 145 tests passed (admin-erasure 32, erasure-page 38).
- Full suite: 242 files pass, 5 fail to load (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) because `next-intl/.../server.react-server.js` cannot be resolved through the symlinked `node_modules` in this worktree; identical to 82-12's note and unrelated to this plan.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on every new file: clean. No `€` in any new file; no secrets; no package installs.

## Deviations from Plan

**1. [Rule 3 - plan/API mismatch] `createErasurePreview` signature.** The plan's interface block lists `createErasurePreview(actorId, emailHmac, scope, ttlSeconds)`; 82-12 shipped `createErasurePreview({ actor, emailHmac, scope, ttlSeconds })`. Routes use the real one. Commit c93fa059.

**2. [Rule 2 - env documented] `.env.example` gained `ERASURE_HMAC_KEY=`** with generation advice (`openssl rand -hex 32`) and the fail-closed note. Commit c93fa059.

**3. [Rule 3 - guard] `tests/business-number-guard.test.ts` got a reasoned THIRD_PARTY_NUMBERS entry** for `components/admin/ErasureSearch.tsx`: the UI-SPEC mandates the placeholder `name@example.com or +420 777 123 456`, a dummy format hint (same digits as the existing entry for the shared route). Commit 0c871b92.

**4. [Rule 2 - copy gap] Two messages the UI-SPEC does not define:** `Erasure is not set up on this server yet. Ask your developer to configure it.` (503 `erasure_unconfigured`, search and modal) and `Could not search for this person. Try again.` (network or unexpected status). Both say what to do next, per the spec's tone rule.

**5. [Judgement] Plural wording.** `{N} upcoming trip(s)` renders as `1 upcoming trip` / `N upcoming trips`; bookings, form inquiries, contacts etc. use the same singular/plural rule.

**6. [Rule 1 - latent bug avoided] Deferred initial focus in `ErasureConfirmForm`** (see decisions). Note for the orchestrator: `MarkSharedForm` (82-11) focuses its phone field synchronously on mount and therefore has the same ordering hazard (Modal would remember the input, not the opener, as the focus-return target). Not changed here (out of scope), worth a look during the 82-11 browser check.

**7. [Process] `/verify` skill and the per-plan commit ledger** were not available in the worktree (ledger path resolves into the main repo's `.git/worktrees`); `plan_head_before` is the dispatch base and the checks were run by hand (tsc, eslint, scoped and full vitest, currency and secret grep).

## Orchestrator / go-live handoff

- **Set `ERASURE_HMAC_KEY` (>= 32 chars, `openssl rand -hex 32`) in the Vercel production environment before using the page.** Without it preview and confirm answer 503 and the page shows the "not set up" message. Do not rotate it while a request is in the `previewed` state (the stored HMAC would no longer match; the admin simply previews again). The log reference is `left(email_hmac, 10)`, so rotating also changes references of future rows only; existing rows keep theirs.
- `QSTASH_TOKEN` and `NEXT_PUBLIC_SITE_URL` are needed for the confirm publish; without them the route still answers 200 with `published: false` and the daily sweep processes the row.
- Browser check (human-check from the plan, not done here): Tab reaches both checkboxes and the typed-email field, closing the modal returns focus to `Erase this person...`, a double click on `Erase permanently` starts one erasure (unit-tested via the ref guard; a second tab hits `already_in_progress`), the log scrolls sideways on a phone.

## Known Stubs

None.

## Threat Flags

None beyond the plan register. T-82-39 mitigated (admin guard 401/403 first, `/api/admin` Origin-strict CSRF in middleware, server-side typed-email HMAC compare with timing-safe equality, `identityVerified` literal true, upcoming acknowledgement, same admin enforced by `erasure_confirm`, 900 s preview TTL, fail closed without the key). T-82-40 mitigated (log carries hash prefix, statuses and counts; tests assert no `@` in the log JSON or any rendered log cell). T-82-41 mitigated (shared phones return `shared_phone` with no preview; the person's primary email must be typed back). T-82-SC: no packages installed.

## Self-Check: PASSED

- Files exist: lib/erasure-hash.ts, the three route files, page.tsx, the four components, tests/admin-erasure.test.ts, tests/erasure-page.test.tsx.
- Commits exist: c93fa059, 0c871b92, cc22bb58.
- STATE.md and ROADMAP.md were not modified.
