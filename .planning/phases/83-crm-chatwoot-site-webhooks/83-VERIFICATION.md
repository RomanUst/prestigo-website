---
phase: 83-crm-chatwoot-site-webhooks
verified: 2026-10-26T20:15:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-01-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-01-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-02-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-02-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-03-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-03-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-04-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-04-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-05-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-05-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-06-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-06-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-07-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-07-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-08-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-08-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-09-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-09-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-10-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-10-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-11-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-11-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-12-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-12-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-13-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-13-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-14-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-14-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-15-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-15-SUMMARY.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-16-PLAN.md"
  - ".planning/phases/83-crm-chatwoot-site-webhooks/83-16-SUMMARY.md"
  - "app/(internal)/admin/(dashboard)/layout.tsx"
  - "app/api/cron/outbox-sweep/route.ts"
  - "app/api/webhooks/chatwoot/route.ts"
  - "app/api/webhooks/espocrm/route.ts"
  - "infra/chatwoot/README.md"
  - "infra/chatwoot/labels.json"
  - "infra/chatwoot/webhook.mjs"
  - "infra/chatwoot/webhooks.json"
  - "infra/espocrm/README.md"
  - "infra/espocrm/enums.json"
  - "infra/espocrm/roles.json"
  - "infra/espocrm/verify-acl.mjs"
  - "infra/espocrm/webhook.mjs"
  - "infra/vps/env/inbound-webhooks.env.example"
  - "infra/vps/runbooks/crm-operators.md"
  - "infra/vps/runbooks/crm-sync.md"
  - "infra/vps/runbooks/inbound-webhooks.md"
  - "lib/chat-classify.ts"
  - "lib/chat-contact.ts"
  - "lib/chat-intake.ts"
  - "lib/chat-io.ts"
  - "lib/chat-payload.ts"
  - "lib/chat-resolve.ts"
  - "lib/chat-store.ts"
  - "lib/chatwoot-sync.ts"
  - "lib/contact-channels.ts"
  - "lib/crm-sync.ts"
  - "lib/erasure.ts"
  - "lib/espo-contact-hook.ts"
  - "lib/espo-payload.ts"
  - "lib/espocrm-client.ts"
  - "lib/hook-dispatch.ts"
  - "lib/identity-store.ts"
  - "lib/lead-mapping.ts"
  - "lib/lead-sync.ts"
  - "lib/outbox-labels.ts"
  - "lib/outbox.ts"
  - "lib/sync-origin.ts"
  - "lib/webhook-store.ts"
  - "lib/webhook-verify.ts"
  - "supabase/migrations/076_inbound_webhooks.sql"
  - "supabase/migrations/077_identity_chat.sql"
  - "supabase/migrations/078_chat_registry.sql"
  - "supabase/migrations/079_webhook_security_fixes.sql"
covered_digest: "v2:sha256:b936dde2235e8f89a9541c400cd0925e571adbf23429dc7062c525cc9f526974"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  reason: "Previous report went stale after commit ced6b98e (migration 079, review fixes CR-01..03). Full re-check of the touched must-haves; quick regression check of the rest."
coincidental_reliance_items:
  - truth: "SC1 - a new Chatwoot conversation from an unknown person creates a Lead (D-01: unknown = no site booking and no site account)"
    reason: undeclared-precondition
    harden: "identity_resolve_chat (now email-only, migration 079) resolves identity by email in the identity tables only. A visitor whose email matches an existing site login account that has no identity row (83-15 follow-up) is classified 'stranger' and gets a chat Lead plus a non-customer identity (user_id not linked). Decide whether D-01's 'no site account' must also consult auth/customer_profiles (read-only) or whether the identity-table definition is the intended contract; record it in a 999.x backlog item."
---

# Phase 83: CRM/Chatwoot -> Site Webhooks Verification Report

**Phase Goal:** Chatwoot and EspoCRM can safely push conversation-derived Contacts/Leads and resolution summaries into the CRM data model, with inbound webhooks verified and structurally barred from ever writing to `bookings`/`customer_profiles`, and no site -> CRM -> webhook -> site echo loop can occur.
**Verified:** 2026-10-26
**Status:** passed
**Re-verification:** Yes - after review fixes (commit ced6b98e, migration 079); previous report (4/4) was stale.

Method: ROADMAP success criteria (the contract) were re-checked against the code on `feat/phase83-inbound-webhooks` at HEAD ced6b98e. Migration 079 was read line by line and diffed against the functions it replaces (077 `identity_resolve_chat`, 076 `webhook_ingest_espo`, 078 `chat_erasure_scope` / `chat_erase`). The named tests were re-run in this session. Live behaviour still rests on the 83-14 / 83-15 go-live records and the recorded 079 smoke (`SMOKE_OK_83_079`); the verifier cannot reach the live systems.

## Does migration 079 weaken any must-have?

No. Evidence per concern:

| Concern | Finding |
|---------|---------|
| HOOK-03 barrier: never writes `bookings` / `customer_profiles` | 079 contains no write to `bookings`, `customer_profiles` or `auth.users`. The only reference to a booking table is a read of `public.booking_identity` inside `identity_resolve_chat` (`EXISTS ... SELECT 1`, to compute the `customer` flag), identical to the read already in 077. The event-type allowlist in `webhook_ingest` (076 line 88, `^hook\.(chat_intake\|chat_resolve\|chat_label\|chat_contact)$`) is untouched. The two receivers still import only verify / payload / webhook-store / outbox helpers (no CRM client, no booking/profile module). `tests/webhook-isolation-guard.test.ts` and `tests/webhook-isolation-runtime.test.ts` pass. |
| Function privileges | All four redefined functions (`identity_resolve_chat`, `webhook_ingest_espo`, `chat_erasure_scope`, `chat_erase`) keep `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ... FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role`. Pinned by `tests/webhook-security-fixes-migration.test.ts` (4 definitions, 4 empty search_paths) and rolled-back smoke assertions d1-d4. |
| CR-01 identity resolve | Strengthens the barrier: `identity_resolve_core(email, NULL, 'chat', NULL)` can no longer reach rule 4 (join an email to another person via phone). The phone is stored afterwards only via `identity_attach_chat_contact` (unowned, not shared, no merge, no flag), and only when the outcome is `resolved` (not `erasing`, not `no_identity`). The no-email path still returns `no_identity` (core rule 1), which `chat-intake.ts` handles as before (line 438). The booking resolver path is unchanged. |
| CR-02 EspoCRM dedup (HOOK-03 "delivery dedup") | Dedup still exists but is now 1 hour instead of 30 days: `ON CONFLICT (source, delivery_id) DO UPDATE SET received_at = now() WHERE d.received_at < now() - interval '1 hour'`; `ROW_COUNT = 0` -> `duplicate`. Input guard, `chat_hooks_start` forward-only gate, `unlinked` / `erasing` returns and the per-entity loop fuse (>`p_fuse_limit` per 10 min, counted on `webhook_deliveries.received_at`) are unchanged. Honest trade-off: a captured signed EspoCRM body replayed after one hour is accepted as a new delivery instead of being dropped. This is acceptable for the contract because EspoCRM has no timestamp or delivery id (replay window N/A by protocol, D-19), the handler re-reads current state from both systems (a replay is an idempotent re-sync, not a write of attacker-chosen data), the event surface is Contact edits only, and the fuse still caps volume. The runbook (sections 1 and 9) and its pin test state 1 hour. Chatwoot dedup (delivery id + 300 s window) is untouched. |
| D-16 erasure coverage | Not weakened for the erased person. `chat_erasure_scope` / `chat_erase` still select every `chat_leads` / `chat_conversations` row with `identity_id = p_identity_id`, and every identity-less row matching the person's Chatwoot contact ids or phones, plus conversations pointing at those leads (the `leads` CTE / `v_leads` array). What changed: rows that belong to a different identity are no longer deleted just because they share a contact id or phone (CR-03, over-deletion of another person's Lead / Contact ids). Return shape, signatures and the `erasure.ts` call sites (`ctx.chat.erase`, `ctx.chat.erasureScope`; `lib/chat-store.ts` `scopeArgs`) are unchanged. Smoke c1-c7 shows: A's erasure leaves B's rows, removes the identity-less row, and B's own erasure still removes B's rows. `tests/erasure.test.ts` and `tests/chat-store.test.ts` pass. |

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | New Chatwoot conversation from an unknown person creates/updates a Contact and Lead in EspoCRM, tagged with the originating channel as lead source (HOOK-01) | VERIFIED (coincidental-reliance, advisory) | Chain intact after 079: `app/api/webhooks/chatwoot/route.ts` -> `webhook_ingest` -> `hook.chat_intake` outbox row -> `lib/lead-sync.ts:186` (`event_type.startsWith('hook.')`) -> `deliverHook` -> `lib/chat-intake.ts` (`identity.resolveChat` at line 386 against the new email-only RPC, `createLead` with `leadSourceForChannel(channel)`, one-open-lead registry via 078). `tests/chat-intake.test.ts`, `chat-store`, `identity-store`, `chat-identity-migration` pass. Live: 83-14 conv #185 Lead(source=Website chat) count 1, Contact count 1, identity basis `chat`; 83-15 conv #186 `lead_created`. Advisory: see coincidental_reliance_items. |
| 2 | Resolved conversation writes summary/transcript link to the Contact's history in EspoCRM (HOOK-02) | VERIFIED | `lib/chat-resolve.ts` unchanged by 079: stream-marker idempotency, `formatResolveNote` -> `postNote` on Contact else Lead, no transcript copied; dispatched by `deliverHook` case `hook.chat_resolve`. `tests/chat-resolve.test.ts` passes. Live: 83-14 Note on Contact "Chat conversation #185 resolved" with marker and Chatwoot link. |
| 3 | Inbound webhooks verified (HMAC over raw body, timestamp replay window, delivery dedup) and structurally cannot write `bookings`/`customer_profiles` (HOOK-03) | VERIFIED | Chatwoot: `verifyChatwootSignature` HMAC-SHA256 over `"<ts>.<rawBody>"`, two-sided 300 s window, two-secret rotation, constant-time compare, fail-closed without secret; dedup by `webhook_deliveries (source, delivery_id)` PK. EspoCRM: `verifyEspoSignature`, per-item content-hash dedup (now 1 h, see the 079 table above), loop fuse. Structural barrier re-confirmed after 079: RPC event-type allowlist, deny-all RLS, EXECUTE revoked, no booking/profile writes in 076-079, import-closure guard and runtime tripwire green. See "Does migration 079 weaken any must-have?". |
| 4 | Site -> CRM -> webhook -> site round trip cannot re-trigger itself, proven by origin tagging/fingerprinting on outbound writes (HOOK-04) | VERIFIED | Unchanged by 079 (079 does not touch the fingerprint or `skipOwn` layers). `infra/espocrm/webhook.mjs` owner check accepts `createdById` (c3430c50); `site_sync_fp` stamping and `isSiteEcho` drop in `lib/sync-origin.ts` / `lib/chat-payload.ts`; loop fuse intact in the 079 `webhook_ingest_espo`. Behavioural proof: `tests/webhook-echo-loop.test.ts` passes. Live: 83-15 audit, 7 hook rows all `sent` attempt 1, max 2 deliveries/entity, 0 ALERT. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/webhooks/chatwoot/route.ts` | Signed thin receiver | VERIFIED | Imports only request-guards, webhook-verify, chat-payload, webhook-store, outbox; no CRM-client or booking imports |
| `app/api/webhooks/espocrm/route.ts` | Signed thin receiver | VERIFIED | Same import discipline (verify, espo-payload, webhook-store, outbox) |
| `lib/webhook-verify.ts`, `lib/webhook-store.ts` | HMAC + ingest RPC wrappers | VERIFIED | Imported by both routes |
| `lib/hook-dispatch.ts` + `lib/chat-intake.ts`, `chat-resolve.ts`, `chat-contact.ts`, `espo-contact-hook.ts` | hook.* router and handlers | VERIFIED | Wired from `lib/lead-sync.ts:186` |
| `lib/sync-origin.ts`, `lib/chat-payload.ts` | Origin fingerprint + classification | VERIFIED | Echo drop in receiver path |
| `lib/chat-store.ts` + migration 078 | One open chat Lead per person, erasure scope | VERIFIED | Scope narrowed by 079 (CR-03), still covers the erased identity |
| Migrations 076, 077, 078 | Applied live | VERIFIED | Apply + smoke recorded in 83-01/02/03 SUMMARY |
| `supabase/migrations/079_webhook_security_fixes.sql` | CR-01..03 fixes | VERIFIED | 4 functions, grants intact; `tests/webhook-security-fixes-migration.test.ts` green; applied live with rolled-back smoke `SMOKE_OK_83_079` per 83-REVIEW-DISPOSITION.md and 83-REVIEW-fix-smoke.sql (not independently re-run) |
| `infra/chatwoot/webhook.mjs`, `infra/espocrm/webhook.mjs` | Config-as-code registration + probe | VERIFIED | Live probes `verdict=ok` (83-14) |
| `infra/vps/runbooks/inbound-webhooks.md` | Runbook incl. Live contract, 1 h dedup | VERIFIED | Pinned by `tests/inbound-webhooks-runbook.test.ts` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Chatwoot route | `webhook_ingest` RPC -> outbox | `createWebhookStore().ingest` | WIRED |
| EspoCRM route | `webhook_ingest_espo` RPC (079 version) -> outbox | `store.ingestEspo` | WIRED (RPC signature unchanged) |
| Outbox dispatcher (`lib/lead-sync.ts:186`) | `deliverHook` | `event_type.startsWith('hook.')` | WIRED |
| `chat-intake.ts:386` | `identity_resolve_chat` (079 version) | `identity.resolveChat` -> `rpc('identity_resolve_chat', ...)` | WIRED (signature unchanged) |
| `erasure.ts` | `chat_erasure_scope` / `chat_erase` (079 version) | `ctx.chat.erasureScope` / `ctx.chat.erase` -> `chat-store.ts` | WIRED (signature unchanged) |
| Site writes to Chatwoot contact | `site_sync_fp` stamp -> receiver `isSiteEcho` drop | `postWriteFingerprint` / `classifyChatwootEvent` | WIRED |
| Handlers | `bookings` / `customer_profiles` | none (guard-enforced) | NOT REACHABLE (intended) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 83 suite incl. new 079 pin test, migrations 076-078 pins, isolation guard + runtime tripwire, echo loop, verify, both routes, dispatch, intake, resolve, contact, espo hook, erasure, chat-store, identity-store, webhook-store, payload, sync-origin, runbook pin | `npx vitest run` over 22 files | 22 files, 596 tests passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (baseline); 0 in app/lib | PASS |
| Full suite (orchestrator-reported, after the fix) | - | 7076 passed | PASS (reported) |

### Probe Execution

No `probe-*.sh` scripts are declared by the phase. Signed probe scripts hit live production and were run by the orchestrator in 83-14. SKIPPED here (live systems).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOOK-01 | 83-02, 03, 04, 07, 09, 10, 14, 15 | Unknown person's conversation -> Contact + Lead with channel source | SATISFIED | Truth 1 |
| HOOK-02 | 83-04, 08, 14 | Resolved conversation -> Contact history | SATISFIED | Truth 2 |
| HOOK-03 | 83-01, 02, 03, 05, 06, 11, 12, 13, 14, 15, 16 | Verified webhooks; cannot write bookings/customer_profiles | SATISFIED | Truth 3 |
| HOOK-04 | 83-01, 05, 10, 11, 12, 14, 15, 16 | No echo loop; origin tagging | SATISFIED | Truth 4 |

PLAN frontmatter IDs match REQUIREMENTS.md HOOK-01..04; no other ID maps to Phase 83, so no orphans.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in the phase implementation files (routes, `lib/chat-*`, `lib/webhook-*`, `lib/espo-*`, `lib/hook-dispatch.ts`, `lib/sync-origin.ts`, migration 079).

### Deferred / Documented Limitations (not gaps)

- Chatwoot account webhooks are at-most-once: lost events have manual recovery in the runbook; reconcile job is ROADMAP backlog 999.10 (D-21).
- EspoCRM has no timestamp/delivery id: replay window "N/A by protocol, compensated" (D-19); the content-hash window is now 1 hour (079), documented in runbook sections 1 and 9.
- D-07 -> D-18 and D-02 -> D-20 deviations are recorded in the runbook.
- Open review items WR-01..WR-07 and IN-01..IN-05 are dispositioned to backlog in 83-REVIEW-DISPOSITION.md (see advisory below).

### Advisory (non-blocking)

1. **Open review warnings that touch D-16 / HOOK-01 quality (pre-existing, not introduced by 079).** WR-06: erasure `scrubNotes` treats a 403 on the Note stream as "no notes" and does not count it in `notes_skipped`, so erasure could report success while chat Notes survive if the Sync role loses `stream` access. WR-02: concurrent intake / contact / sync handlers can create a duplicate EspoCRM Contact; an orphan Contact is not in the registry and so would not be reached by erasure scope. WR-01 (orphan open Lead after a label race), WR-03, WR-04, WR-05 (Markdown from visitor text), WR-07 (no attempt cap on deadline reschedules) are quality or operability issues. None fails a ROADMAP success criterion; all are in backlog. Recommend WR-06 and WR-02 first because they bear on privacy erasure completeness.
2. **D-01 "no site account" edge (83-15 follow-up).** A widget visitor whose email belongs to a site login account with no identity row is treated as a stranger (chat Lead + non-customer identity). Unchanged by 079. Recommend a backlog item to either link by `auth` / `customer_profiles` (read-only) or state the identity-table definition as the contract.
3. **EspoCRM dedup is now 1 h.** A signed EspoCRM body replayed after one hour is processed as a new delivery (harmless re-read/sync, loop fuse still applies). This is a conscious CR-02 trade-off in favour of not losing legitimate repeated edits.
4. **Live application of 079 was not independently re-checked.** The orchestrator reports it applied and smoked (`SMOKE_OK_83_079`); the verifier relied on the committed smoke script and the migration text pin tests.
5. **Tracking not yet ticked.** `.planning/ROADMAP.md` line 23 (`- [ ] **Phase 83`) and REQUIREMENTS.md HOOK-01..04 (`[ ]` / `Pending`) still show unchecked; the orchestrator should update them on phase completion.

### Human Verification Required

None. The live UAT items (HOOK-01..04, no-lead label, erasure) were observed on real systems and recorded in 83-14-SUMMARY.md and 83-15-SUMMARY.md; the 079 behaviours are covered by the recorded smoke and text-level pin tests.

### Gaps Summary

No gaps. All four ROADMAP success criteria remain implemented, wired, tested and observed live after the review fixes. Migration 079 does not weaken the HOOK-03 barrier or the D-16 erasure coverage of the erased person; it narrows identity merging (CR-01), narrows the EspoCRM dedup window with compensating controls (CR-02), and narrows erasure so it cannot delete another person's chat records (CR-03).

---

_Verified: 2026-10-26_
_Verifier: Claude (gsd-verifier)_
