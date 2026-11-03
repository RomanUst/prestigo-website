---
phase: 83-crm-chatwoot-site-webhooks
plan: 11
subsystem: api
tags: [webhooks, espocrm, hmac, chatwoot, outbox, dispatcher, echo-loop, fingerprint]

requires:
  - phase: 83-01
    provides: webhook_ingest_espo RPC, createWebhookStore().ingestEspo, hook.espo_contact key grammar, Chatwoot receiver shape
  - phase: 83-05
    provides: infra/espocrm/webhook.mjs (espoSignature, skipOwn at the source)
  - phase: 83-06
    provides: infra/chatwoot/webhook.mjs (chatwootSignature)
  - phase: 83-10
    provides: postWriteFingerprint, SITE_SYNC_FP_ATTRIBUTE, hook-dispatch contact branches
  - phase: 83-16
    provides: Chatwoot receiver echo drop (isSiteEcho) and fuse
provides:
  - verifyEspoSignature (lib/webhook-verify.ts)
  - lib/espo-payload.ts (ESPO_MASK, classifyEspoItem, canonicalJson, espoDeliveryId)
  - POST /api/webhooks/espocrm (signature-first, batched, never gone)
  - hook.espo_contact handler (lib/espo-contact-hook.ts deliverEspoContactHook) and its dispatcher branch
  - CSRF pin for both webhook receivers
affects: [83-12, 83-13, 83-14]

requirements-completed: [HOOK-03, HOOK-04]

actuals:
  tokens: 48000
  tasks: 3
  commits: 3
plan_head_before: 784924d2a13f441a09dbf3b7d77d0e6174fc384e
plan_head_after: 3c5dd31a61f566c2b67d1a5a192f86ef18b350e2

tech-stack:
  added: []
  patterns:
    - "signature-first receiver: auth on raw bytes, parse only after verify, one RPC per relevant batch item, 503 on store failure so the sender retries and already-ingested items answer duplicate"
    - "content-hash delivery id (sha256 of canonical JSON) as the dedup key for a protocol without delivery ids"
    - "edited-attribute mask carried in the outbox key tag (b<bucket>m<mask>); handler re-reads both systems and pushes only edited, non-empty, differing fields"

key-files:
  created:
    - lib/espo-payload.ts
    - lib/espo-contact-hook.ts
    - app/api/webhooks/espocrm/route.ts
    - tests/espo-payload.test.ts
    - tests/webhooks-espocrm-route.test.ts
    - tests/espo-contact-hook.test.ts
  modified:
    - lib/webhook-verify.ts
    - lib/hook-dispatch.ts
    - tests/webhook-verify.test.ts
    - tests/middleware-csrf-forms.test.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "The legacy X-Signature header is never read: only `Signature` authenticates (RESEARCH Pitfall 2); a request with only X-Signature is 401"
  - "The route ignores the query string entirely, so the `?v=2` webhook rotation URL authenticates exactly like the plain URL"
  - "Status discipline: 401 only for authentication, 400 for non-array / more than 100 items / bad JSON, 413 above 1 MiB, 503 when the store fails, 200 for every business outcome (queued, exists, duplicate, unlinked, erasing, off, fused); the gone status is never produced"
  - "A 422 on a phone-only edit (phone taken by another Chatwoot contact) drops the phone and, with nothing left to write, completes sent (detail phone_taken) rather than failed; failed cw_unprocessable only when a write that carries no phone is rejected or the retry is rejected again"
  - "Fuse limit 20 per EspoCRM contact (10-minute window) on every ingest; fused deliveries log one ids-only ALERT line"

patterns-established:
  - "skip codes: hooks_off, bad_key, identity_missing, identity_erasing, unlinked, contact_missing; failed: cw_unprocessable; sent detail codes: updated, updated_without_phone, phone_taken, no_change"

status: complete
completed: 2026-10-26
---

# Phase 83 Plan 11: EspoCRM Contact edit -> site -> Chatwoot Summary

**A human correction of name, phone or company on an EspoCRM Contact now travels as a signed batch to `/api/webhooks/espocrm`, is verified (EspoCRM 10.0.8 `Signature` scheme) and content-hash deduplicated, and the dispatcher pushes only the edited, non-empty, differing fields to the linked Chatwoot contact with the `site_sync_fp` origin tag, so the echo is recognised and dropped.**

## Accomplishments

- `verifyEspoSignature({ rawBody, signature, secrets, expectedWebhookId? })` -> `ok | malformed | wrong_webhook | bad_signature`: strict base64, split at the first `:`, optional webhook id pin, every listed secret compared without early exit, `safeEqual` on the hex (a hex of any other length is `bad_signature`, never a throw).
- `lib/espo-payload.ts` (pure): `classifyEspoItem` (17-hex id; name bit for firstName/lastName/name, phone bit for phoneNumber/phoneNumberData, company bit for accountId/accountName; otherwise `bad_item` / `irrelevant_change`), `canonicalJson` (sorted keys, no whitespace), `espoDeliveryId` (`e` + sha256 hex, equal for any key order).
- `POST /api/webhooks/espocrm` (`runtime nodejs`, `maxDuration 30`): fail-closed without a secret; 1 MiB cap; `Signature` verified over the raw bytes before JSON parsing; array of up to 100 items; per relevant item one `ingestEspo` call (`fuseLimit 20`, `bucketSeconds 30`, `tagSuffix m<mask>`); `queued` -> `publishAfterResponse(key, { delaySeconds, dedupSuffix: 'w' })`; `fused` -> one ALERT line; store error -> 503 immediately; one log line `[webhook] source=espocrm items=<n> queued=<n> outcome=<code>` with no body content. No CRM, Chatwoot, dispatcher or handler import.
- `deliverEspoContactHook` (`hook.espo_contact`, behind both config gates in `lib/hook-dispatch.ts`): hooks gate, person via `d.identity.person(aggregate_id)` (missing / erasing / not linked on both sides -> skip), `GET /Contact/<id>?select=...`, `readContact` for Chatwoot, desired values per mask bit (name `plainLine(first + ' ' + last, 100)`, phone `normalizePhone`, company `plainLine(accountName, 120)`), body = only differing non-empty fields, `PUT /contacts/<id>` stamped with `postWriteFingerprint(live, body)`; 422 drops the phone, recomputes the fingerprint and retries once. Read-only towards EspoCRM and Supabase (tests: only `person` is called on the identity store, EspoCRM requests are a single GET).
- VPS isolation guard allowlist entries for the route and the handler; CSRF pin tests for `/api/webhooks/chatwoot` and `/api/webhooks/espocrm` (foreign Origin, no Origin, no locale redirect). `middleware.ts` is unchanged.

## Task Commits

1. Task 1 (tracer): `86cae9d0` security(83-11): EspoCRM Contact edit -> signed receiver -> Chatwoot contact (tracer)
2. Task 2: `2565bd2c` security(83-11): EspoCRM receiver dedup, rotation and status-code discipline
3. Task 3: `3c5dd31a` security(83-11): EspoCRM -> Chatwoot field rules and echo-safe writes

## Tracer gate

After Task 1 the five verify test files (route, handler, hook-dispatch, VPS guard, webhook-isolation guard) were re-run end to end: 50 tests green, then expansion. Auto mode: the tracer slice (signed batch -> store double -> dispatch -> Chatwoot contact with `isSiteEcho` true) passed before Tasks 2 and 3.

## Verification

- `npx vitest run` on webhook-verify, espo-payload, webhooks-espocrm-route, espo-contact-hook, hook-dispatch, middleware-csrf-forms, middleware-matcher, infra-vps-isolation-guard, webhook-isolation-guard, chat-contact, chatwoot-contact-sync, espocrm-webhook-script, chatwoot-webhook-script: all green (297 tests in the 12-file run, plus middleware-matcher in the Task 2 run).
- `npx eslint --quiet` clean on every touched lib, route and test file.
- `npx tsc --noEmit`: 8 errors, the known baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none new.
- Acceptance greps: `verifyEspoSignature` and `deliverEspoContactHook` exported once each; no forbidden import in the route; no 410 in the route source; `git diff` shows `middleware.ts` unchanged.
- No price, secret, i18n or middleware change. The full `verify` skill gate was not invoked beyond the checks above (all of its automated checks are covered by the listed tsc/eslint/vitest/grep runs). The full vitest suite was not run in this worktree; the five next-intl-server test files known to fail through the node_modules symlink were not touched.

## Deviations from Plan

**1. [Process] RED not observed separately for Tasks 2 and 3.** Task 1's tracer implementation was written to the complete interfaces contract (verifier, classifier, route status discipline, handler field rules), so the Task 2 and Task 3 test suites passed on first run. The RED state was observed for Task 1 (route module missing; dispatcher answered `unsupported_event`). Task 2 and 3 tests were written against the contract and exercise every behavior line of the plan; no production code changed in those two commits.

**2. [Rule 1 - test fix] Tracer test advances the world clock by 31 s** before dispatching, because the row is only available when its 30 s bucket has closed (the dispatcher answers `deferred` earlier). A test-only correction; no code impact.

**3. [Scope note] phone-only 422.** The plan says a 422 on the phone drops it and "still writes the name". When the edit carries no other differing field the retry would be an empty write, so the handler completes `sent` (detail `phone_taken`) without a second request; a rejection of a write that has no phone to drop, or a second rejection, completes `failed cw_unprocessable` as specified.

No STATE.md / ROADMAP.md edits (orchestrator owns them).

## Known limitations / notes for the orchestrator

- RESEARCH A7 (does EspoCRM send only changed attributes in a Contact.update item) is verified only against the fakes. If it sends every attribute the mask is 7 and the handler stays correct and state-convergent, only less selective; plan 83-14 records the real item shape.
- RESEARCH A3 (`additional_attributes.company_name` is the Chatwoot company field) and the `GET /Contact/<id>?select=` detail request are verified only against fakes; first live proof is 83-14.
- D-19 dedup trade-off, as flagged in the plan: an edit X -> Y -> X inside 30 days produces an identical item hash and is dropped; any further edit of the Contact recovers it (belongs in the 83-13 runbook).
- Runtime env names introduced: `ESPOCRM_WEBHOOK_SECRET`, `ESPOCRM_WEBHOOK_SECRET_PREVIOUS`, `ESPOCRM_WEBHOOK_ID` (written by `infra/espocrm/webhook.mjs` in 83-05; must be set on the Vercel project before the webhook is registered).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-83-38 (forged batch: HMAC, id pin, legacy header refused, fail-closed), T-83-39 (replay: content-hash dedup, re-read state, narrow Contact.update surface), T-83-40 (no 410 anywhere, 503 only for store failure), T-83-41 (skipOwn at source, fingerprint on the Chatwoot write, no-diff-no-write, fuse 20) and T-83-42 (empty or invalid values never pushed) are covered by tests.

## Self-Check: PASSED

- Files present: lib/espo-payload.ts, lib/espo-contact-hook.ts, app/api/webhooks/espocrm/route.ts, tests/espo-payload.test.ts, tests/webhooks-espocrm-route.test.ts, tests/espo-contact-hook.test.ts, plus edits to lib/webhook-verify.ts, lib/hook-dispatch.ts, tests/webhook-verify.test.ts, tests/middleware-csrf-forms.test.ts, tests/infra-vps-isolation-guard.test.ts.
- Commits 86cae9d0, 2565bd2c, 3c5dd31a exist on branch `worktree-agent-aba74e3ab733d4ad8`.
- STATE.md and ROADMAP.md untouched.
