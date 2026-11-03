---
phase: 87-status-service-driver-step-flow
plan: 06
subsystem: integrations, outbox, chatwoot
tags: [outbox, qstash, chatwoot, no-show, private-note, isolation-guard]
status: complete

requires:
  - phase: 87-02
    provides: bookings.status on_location/no_show, bookings.no_show_requested_at (migration 084, live)
provides:
  - "lib/noshow-alert.ts: deliverNoShowAlert dispatcher handler + NoShowAlertStore (Supabase default, injectable)"
  - "lib/outbox.ts: 'alert.no_show' event type, key regex, noShowAlertKey, parseOutboxKey branch"
  - "lib/chatwoot-client.ts: loadChatwootOpsConversationId (optional CHATWOOT_OPS_CONVERSATION_ID)"
  - "lib/lead-sync.ts: alert.no_show branch behind the Chatwoot config gate; DispatchDeps.noShowAlert injection"
affects: [87-09 driver no-show request enqueues the row, 87-13 owner go-live step]

requirements-completed: [DRV-01, DRV-02]

key-files:
  created:
    - lib/noshow-alert.ts
    - tests/noshow-alert.test.ts
  modified:
    - lib/outbox.ts
    - lib/lead-sync.ts
    - lib/chatwoot-client.ts
    - lib/outbox-labels.ts
    - tests/outbox.test.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "Delivery order (Claude's discretion, D-16 b): passenger's most recently updated chat_conversations row, else CHATWOOT_OPS_CONVERSATION_ID, else skip no_conversation (admin banner and operator email remain the alert)"
  - "Staleness = status is not on_location, or no_show_requested_at is null/unparsable, or it is more than 1000 ms past the key's whole second; the key floors to seconds, so the stored value may sit up to 1 s above it"
  - "Test injection through a new optional DispatchDeps.noShowAlert (store, opsConversationId), mirroring DispatchDeps.erasure / chat"
  - "Fake Chatwoot has no message-create route and only plan 83-06 may edit it, so the tests answer POST /conversations/:id/messages through the documented intercept hook"

duration: ~25min
completed: 2026-11-03
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: f0bdad82a7754f4a8b5c5e4abaa7b0fdeac799ee
plan_head_after: ef172e8bc4f187b685b36218cebb30c83adb48d7
commits: 2
---

# Phase 87 Plan 06: No-show operator alert Summary

**An `alert.no_show:<bookingId>:r<epoch>` outbox row is delivered by the existing QStash dispatcher as a Chatwoot PRIVATE outgoing note (booking reference, pickup date/time, driver name, admin bookings link) in the passenger's latest conversation, with an optional operations-conversation fallback, a stale-request skip, and no Chatwoot import on any request path.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | alert.no_show row -> dispatcher -> deliverNoShowAlert -> Chatwoot private note | 4a829e2b |
| 2 | Operations-conversation fallback, stale-request skip, isolation allowlist and outbox label | ef172e8b |

Tracer gate: the tracer `<verify>` (noshow-alert and outbox suites, scoped tsc) was green before expansion; the task has no `blocking-human` gate.

## What was built

- `lib/outbox.ts`: `'alert.no_show'` in `OutboxEventType`; regex `^alert\.no_show:(<uuid>):(r\d{9,12})$`; `parseOutboxKey` returns `{ eventType: 'alert.no_show', aggregateId, leadStatus: null, tag: 'r<digits>' }`; `noShowAlertKey(bookingId, requestedAtMs)` is the only builder (`Math.floor(ms / 1000)`).
- `lib/noshow-alert.ts`: header states dispatcher-only reachability, private-only notes, ids/outcome/code-only logs. `createNoShowAlertStore()` reads `bookings`, `drivers.name`, `booking_identity.identity_id` and the latest `chat_conversations` row by `updated_at` (service client created inside `load`, errors become `OutboxStoreError('db_error')`). `deliverNoShowAlert` order: load -> `booking_gone` -> `stale_request` -> pick conversation (passenger, else ops, else `no_conversation`) -> POST `{ content, message_type: 'outgoing', private: true }` -> `store.complete(key, 'sent')`. Note text uses only the reference, pickup, driver name and `NEXT_PUBLIC_SITE_URL` (trimmed, default https://rideprestigo.com) + `/admin/bookings`.
- `lib/lead-sync.ts`: `alert.no_show` branch placed before the generic CRM gate; needs `d.chatwootConfig` and `d.chatwoot` (else `breaker` `chatwoot_unconfigured`), delivery inside try/catch -> `handleFailure` (5xx -> `retryLater`, 401/403 -> auth breaker, 404/422 -> failed).
- `lib/chatwoot-client.ts`: `loadChatwootOpsConversationId(env)` (positive integer or null, never throws); still the only file naming `CHATWOOT_*` variables.
- `lib/outbox-labels.ts`: `alert.no_show` -> `No-show alert`.
- `tests/infra-vps-isolation-guard.test.ts`: `lib/noshow-alert.ts` allowlisted with a dispatcher-only reason; new fixture test proves a driver route importing the handler, or an admin route importing the Chatwoot client, is still flagged.

## Verification

- `npx vitest run tests/noshow-alert.test.ts tests/outbox.test.ts tests/infra-vps-isolation-guard.test.ts tests/chatwoot-site-client.test.ts tests/outbox-admin.test.ts`: 5 files, 134 tests green.
- Regression net, unmodified: lead-sync, lead-sync-booking, integrations-dispatch, hook-dispatch, outbox-sweep, outbox-digest, outbox-migrations (173 tests green).
- `npx tsc --noEmit` shows no error line for lib/ or the touched tests; `npx eslint --quiet` on the touched files is clean.
- Acceptance greps: `noShowAlertKey` export 1, `alert.no_show` in lead-sync present, `private: true` present and `private: false` 0, `CHATWOOT_OPS_CONVERSATION_ID` only in `lib/chatwoot-client.ts` (1 hit).
- Prohibition (no client-visible message) is pinned by tests: every POST has `private === true`, and the content never holds the client name, email, phone or an amount, even when a store leaks them into the context object.
- RED was observed before each GREEN (missing `noShowAlertKey`, then missing loader / skips / label).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Allowlist entry moved into the tracer commit**
- **Found during:** Task 1
- **Issue:** the isolation guard's transitive scan flagged `lib/noshow-alert.ts` the moment `lib/lead-sync.ts` imported it, so the tracer commit would have left `tests/infra-vps-isolation-guard.test.ts` red.
- **Fix:** added the allowlist entry in Task 1 instead of Task 2 (the fixture test proving the guard still fails for request paths is in Task 2).
- **Commit:** 4a829e2b

**2. [Plan note] Injection seam**
- The plan's interface gives `deliverNoShowAlert(row, d, deps)`; reaching it through `dispatchOutboxKey` in tests needed a pass-through, so `DispatchDeps` gained an optional `noShowAlert` field (undefined in production = Supabase store and env).

**Total deviations:** 1 auto-fixed (Rule 3), 1 small additive seam. **Impact:** none on behaviour.

## Owner setup (plan 87-13)

Optional: create an operations conversation in Chatwoot (any open conversation the operators watch) and set `CHATWOOT_OPS_CONVERSATION_ID=<its numeric id>` in Vercel (Production) so a no-show alert also reaches passengers who have no Chatwoot conversation. Without it those alerts are skipped with `no_conversation`; the admin banner and operator email (plans 87-09/87-10) still alert. The variable is read only in `lib/chatwoot-client.ts`; no secret is involved. No real Chatwoot message was sent during this plan.

## Notes for 87-09

- Enqueue with `enqueueOutboxEvent({ eventType: 'alert.no_show', aggregateType: 'booking', aggregateId: bookingId, idempotencyKey: noShowAlertKey(bookingId, requestedAtMs) })` then `dispatchAfterResponse(key)`. Pass the same instant that `set_no_show_request` stored in `no_show_requested_at`; the handler tolerates up to 1 s of sub-second difference and skips anything newer.
- `integration_outbox` has no event_type CHECK (migration 064 onward), so no migration is needed for the new type.
- The driver route must not import `lib/noshow-alert.ts` or any Chatwoot client; the guard fixture test covers it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-87-17 (private-only, no client data) and T-87-18 (handler reachable only from the dispatcher, allowlist reason) are test-pinned; T-87-19 holds through the existing QStash signature check, the strict key regex and the re-read of the booking.

## Self-Check: PASSED

- FOUND: lib/noshow-alert.ts, tests/noshow-alert.test.ts, and the modified files listed above
- FOUND commits: 4a829e2b, ef172e8b
- STATE.md and ROADMAP.md untouched.
