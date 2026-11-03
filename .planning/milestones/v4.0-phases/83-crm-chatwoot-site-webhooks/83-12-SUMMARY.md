---
phase: 83-crm-chatwoot-site-webhooks
plan: 12
subsystem: testing
tags: [webhooks, echo-loop, hook-03, hook-04, tripwire, import-closure, vitest, chatwoot, espocrm]

requires:
  - phase: 83-07
    provides: tests/helpers/chat-world.ts (outbox, identity, chat registry, webhook-ingest doubles; signing helpers)
  - phase: 83-11
    provides: EspoCRM receiver and hook.espo_contact handler
  - phase: 83-16
    provides: Chatwoot receiver echo drop (isSiteEcho) and contact fuse
  - phase: 83-09
    provides: hook.chat_resolve / hook.chat_label handlers
provides:
  - tests/webhook-echo-loop.test.ts (HOOK-04 proof by simulation, five scenarios)
  - tests/webhook-isolation-runtime.test.ts (HOOK-03 runtime tripwire over the real stores)
  - tests/webhook-isolation-guard.test.ts SCOPE_FLOOR raised to the ten named entry modules
affects: [83-13, 83-14, 83-15]

requirements-completed: [HOOK-04, HOOK-03]

status: complete

actuals:
  tokens: 45000
  tasks: 2
  commits: 2
plan_head_before: f158be3fc3c921531ce16ab6fbc8decf75e8c088
plan_head_after: bfb9c402e9cfd8b310670bb3c459e5a15ba0fd4f

tech-stack:
  added: []
  patterns:
    - "emit-on-write fakes: Chatwoot onWrite hook emits a signed contact_updated for every contact write (no actor); a fetch wrapper around the fake EspoCRM emits a signed batch for every Contact write except the webhook owner prestigo-sync (skipOwn)"
    - "runner = deliver queued signed webhooks, dispatch every due outbox row, advance the clock 31 s (5 s in the forced loop), until both queues are empty"
    - "recording Supabase client double mocked in as createSupabaseServiceClient: from() outside the two outbox tables, any .auth access and any RPC outside the inbound allowlist are recorded as violations"

key-files:
  created:
    - tests/webhook-echo-loop.test.ts
    - tests/webhook-isolation-runtime.test.ts
  modified:
    - tests/webhook-isolation-guard.test.ts

key-decisions:
  - "No production or helper file was touched (verified: git diff --name-only against plan_head_before for lib, app, tests/helpers is empty); the harness uses only onWrite, apiKeys and module mocks"
  - "Only two seams are replaced in the echo-loop harness, as in the route tests: createWebhookStore (returns the world's ingest double, wrapped to log outcomes) and publishAfterResponse (records the key); next/server after() runs inline"
  - "The harness syncs Date.now() with the world clock (vi.useFakeTimers toFake Date) because the receivers read Date.now() for the signature window and the contact bucket, while the dispatcher uses the injectable now"
  - "The runtime tripwire is an allow-list on from(): only integration_outbox and integration_config pass, which is stricter than the plan's bookings/customer_profiles deny-pair and still has zero violations on the real inbound path"

patterns-established:
  - "Scenario assertions pin exact upstream write lists (e.g. site-origin = POST /contacts + PUT /contacts/1 on Chatwoot, one POST /Contact by prestigo-sync on EspoCRM), so any new bounce changes a number and fails"

duration: 25min
completed: 2026-10-26
---

# Phase 83 Plan 12: Echo-loop proof and runtime isolation tripwire Summary

**Executable proof that a site, operator or sync write cannot bounce between the site, Chatwoot and EspoCRM (five signed-webhook scenarios run to quiescence), plus a recording Supabase tripwire over the real stores and a ten-module scope floor for the import-closure guard.**

## Performance

- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 2 created, 1 modified (all under tests/)

## Accomplishments

- **HOOK-04 simulation (tests/webhook-echo-loop.test.ts, 5 cases):** the real Chatwoot and EspoCRM receiver routes, the real dispatcher and the real hook.* / sync.* handlers run against the fakes with signed webhooks emitted on every write.
  - operator EspoCRM edit: 1 signed batch, 1 hook.espo_contact row (sent), 1 Chatwoot PUT carrying `site_sync_fp`, its contact_updated echo dropped by the receiver (`code=echo`), no hook.chat_contact row, 0 pending, quiescent in under 10 iterations.
  - site-origin: sync.chatwoot + sync.espo rows give exactly POST /contacts and the CRM-link refresh PUT on Chatwoot (both echoes dropped, 0 deliveries ingested) and one POST /Contact by prestigo-sync (no event), 0 hook rows.
  - operator Chatwoot edit (phone added): 1 hook.chat_contact row, a fill-empty PUT /Contact by prestigo-sync (no event, no hook.espo_contact), no Chatwoot write besides the operator's own, 0 pending.
  - chat lifecycle: incoming message -> intake -> resolve gives 1 Lead, 1 Contact, 1 history Note, only hook.chat_intake + hook.chat_resolve rows, no Chatwoot write, every EspoCRM write by the sync user.
  - forced loop (harness plays the pathological upstream, EspoCRM emits for every writer, clock 5 s per iteration): the contact fuse answers `fused` exactly once, at the 21st delivery; one `ALERT webhook_loop_fused source=chatwoot entity=cw:contact:7` line; the emitter stops; the run ends under 60 iterations (ceiling 200) with nothing pending.
- **HOOK-03 runtime tripwire (tests/webhook-isolation-runtime.test.ts, 7 cases):** both receivers and one dispatch of each hook type (intake, resolve, label, contact, espo_contact) run on the REAL webhook / chat / identity / outbox stores over the recording client; the violation list is empty. Self-tests prove it is not vacuous (from('bookings'), from('customer_profiles'), `erasure_anonymise_person`, `.auth`, and a booking read / off-allowlist RPC made through the real stores are all recorded). The handlers do real work (Lead created, Lead killed by the label handler, history Note, fingerprinted Chatwoot PUT), they do not exit early on the canned shapes.
- **Structural floor (tests/webhook-isolation-guard.test.ts):** `SCOPE_FLOOR` now names both receiver routes, lib/hook-dispatch.ts, lib/chat-io.ts, lib/chat-intake.ts, lib/chat-resolve.ts, lib/chat-contact.ts, lib/espo-contact-hook.ts, lib/chat-store.ts and lib/webhook-store.ts; a fixture test removes each in turn and the floor assertion fails.

## Task Commits

1. **Task 1 (tracer): echo-loop simulation** - `86b6d517` (test)
2. **Task 2: runtime tripwire and full-scope isolation floor** - `bfb9c402` (test)

## Verification

- `npx vitest run tests/webhook-isolation-runtime.test.ts tests/webhook-isolation-guard.test.ts tests/webhook-echo-loop.test.ts tests/infra-vps-isolation-guard.test.ts` - 4 files, 56 tests pass.
- Broader webhook / chat / espo-contact-hook set (16 files, 387 tests) passes.
- Mutation check (temporary, reverted): making `isSiteEcho` return false fails the operator-EspoCRM-edit and site-origin cases.
- `npx eslint --quiet` on the three test files: clean.
- `npx tsc --noEmit`: 8 errors, the documented baseline (all in tests/, none in the new files).
- `git diff --name-only <plan_head_before>..HEAD -- lib app tests/helpers` is empty.

## Deviations from Plan

None - plan executed as written. No production bug was exposed by any scenario, so no Rule 1 fix was needed.

Notes on judgement calls (not deviations):
- The tripwire's `from()` check is an allow-list (integration_outbox, integration_config) instead of the plan's bookings/customer_profiles pair; it is a strict superset and the real inbound path passes it.
- The fuse in the forced-loop scenario is the webhook-ingest double's (the semantics of migration 076 as modelled in tests/helpers/chat-world.ts), because the real fuse lives in SQL; the SQL itself is covered by tests/webhook-ingest-migration.test.ts.

## Known Stubs

None.

## Threat Flags

None - tests only, no new endpoint, auth path or schema change.

## Flagged assumptions (unchanged from the plan)

The harness models Chatwoot's contact_updated as firing on every contact write and EspoCRM's skipOwn as "no event when the writer is the webhook owner". The live go-live (83-14 / 83-15) checks the real systems for echo rows.

## Next

Plan 83-13 (outbox sweep route, labels, runbook) runs in parallel in this wave; after the wave merge run the full `npx vitest run` and `npx tsc --noEmit`, then 83-14 (go-live).

## Self-Check: PASSED

- tests/webhook-echo-loop.test.ts, tests/webhook-isolation-runtime.test.ts: FOUND
- tests/webhook-isolation-guard.test.ts contains `lib/espo-contact-hook.ts`: FOUND
- commits 86b6d517, bfb9c402: FOUND
