---
phase: 83-crm-chatwoot-site-webhooks
verified: 2026-10-26T19:30:00Z
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
covered_digest: "v2:sha256:c7af38481fbf2b4304e74a35946faeca50416b3ca9509c8682e12303a9f62cbf"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "SC1 — a new Chatwoot conversation from an unknown person creates a Lead (D-01: unknown = no site booking and no site account)"
    reason: undeclared-precondition
    harden: "identity_resolve_chat resolves identity by email in the identity tables only. A visitor whose email matches an existing site login account that has no identity row (83-15 follow-up) is classified 'stranger' and gets a chat Lead plus a non-customer identity (user_id not linked). Decide whether D-01's 'no site account' must also consult auth/customer_profiles (read-only) or whether the identity-table definition is the intended contract; record it in 999.x backlog."
---

# Phase 83: CRM/Chatwoot -> Site Webhooks Verification Report

**Phase Goal:** Chatwoot and EspoCRM can safely push conversation-derived Contacts/Leads and resolution summaries into the CRM data model, with inbound webhooks verified and structurally barred from ever writing to `bookings`/`customer_profiles`, and no site -> CRM -> webhook -> site echo loop can occur.
**Verified:** 2026-10-26
**Status:** passed
**Re-verification:** No - initial verification

Method: ROADMAP success criteria (the contract) were checked against the code on `feat/phase83-inbound-webhooks` (code is identical to what PR #75 shipped plus the 83-14/15 fixes), the named tests were re-run in this session, and live behaviour was taken from the 83-14 / 83-15 go-live records (the verifier cannot reach the live systems).

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | New Chatwoot conversation from an unknown person creates/updates a Contact and Lead in EspoCRM, tagged with the originating channel as lead source (HOOK-01) | VERIFIED (coincidental-reliance, advisory) | Receiver `app/api/webhooks/chatwoot/route.ts` -> `webhook_ingest` -> `hook.chat_intake` outbox row -> `lib/hook-dispatch.ts` `deliverHook` -> `lib/chat-intake.ts` (`identity.resolveChat`, `createLead` with `source: leadSourceForChannel(channel)` at line 551, Contact create/find, one-open-lead registry via migration 078). Wired from the dispatcher at `lib/lead-sync.ts:186` (`row.event_type.startsWith('hook.')` -> `deliverHook`). Tests pass (`chat-intake`, `chat-classify`, `chat-store`). Live: 83-14 UAT conv #185 -> Lead(source=Website chat) count 1, Contact count 1, identity basis `chat`; 83-15 conv #186 `lead_created`. Advisory: see coincidental_reliance_items. |
| 2 | Resolved conversation writes summary/transcript link to the Contact's history in EspoCRM (HOOK-02) | VERIFIED | `lib/chat-resolve.ts`: stream-marker idempotency (`streamHasMarker`), `formatResolveNote` -> `postNote` on Contact else Lead (D-11), no transcript copied. Wired through `deliverHook` case `hook.chat_resolve`. `tests/chat-resolve.test.ts` passes. Live: 83-14 Note on Contact "Chat conversation #185 resolved", channel, dates, message count, first message, `Summary: UAT 83 summary`, Chatwoot link, marker `[cw:185:r...]`, author prestigo-sync. |
| 3 | Inbound webhooks verified (HMAC over raw body, timestamp replay window, delivery dedup) and structurally cannot write `bookings`/`customer_profiles` (HOOK-03) | VERIFIED | Chatwoot: `lib/webhook-verify.ts` `verifyChatwootSignature` HMAC-SHA256 over `"<ts>.<rawBody>"`, two-sided 300 s window, two-secret rotation, constant-time compare; route reads `arrayBuffer` once, fail-closed without secret, 401/413/400 discipline, dedup via `webhook_deliveries (source, delivery_id)` PK in `webhook_ingest` (076). EspoCRM: `verifyEspoSignature` (`Signature` base64 `id:hex`), `expectedWebhookId`, per-item content-hash dedup (replay window N/A by protocol, compensated, D-19 recorded in runbook). Structural barrier: (a) migration 076 allowlists only `hook.(chat_intake|chat_resolve|chat_label|chat_contact)` inside the RPC; deny-all RLS; EXECUTE revoked from PUBLIC/anon/authenticated; grep of 076/077/078 finds no reference to bookings/customer_profiles/auth.users; (b) `tests/webhook-isolation-guard.test.ts` import-closure guard over both routes + hook-dispatch + `lib/chat-*` + `lib/webhook-*` with a 10-module SCOPE_FLOOR; (c) `tests/webhook-isolation-runtime.test.ts` runtime tripwire. All re-run green. Live: bad_signature/stale/unsigned -> 401 (83-14 logs); migrations 076-078 applied, smokes SMOKE_OK_83_01/02/03, 0 advisor ERRORs. |
| 4 | Site -> CRM -> webhook -> site round trip cannot re-trigger itself, proven by origin tagging/fingerprinting on outbound writes (HOOK-04) | VERIFIED | Layers present in code: EspoCRM webhook owned by `prestigo-sync` with `skipOwn` (`infra/espocrm/webhook.mjs`, owner check accepts `createdById`); Chatwoot `site_sync_fp` fingerprint stamped on every site write to a contact (`lib/sync-origin.ts` `contactFingerprint`/`postWriteFingerprint`/`isSiteEcho`, used in `lib/chatwoot-sync.ts`, `lib/espo-contact-hook.ts`) and dropped in `lib/chat-payload.ts` classification (`kind: 'echo'`, route returns before ingest); per-entity loop fuse (>20 deliveries/10 min -> `fused`, `ALERT webhook_loop_fused`). Behaviour: `tests/webhook-echo-loop.test.ts` simulation across Chatwoot, EspoCRM and the site passes (state-transition invariant has a behavioural test, not just presence). Live: 83-14 `contact_updated` echoes ignored (`irrelevant_change` x2), 0 `hook.chat_contact` rows from site writes, EspoCRM site writes produced no `hook.espo_contact`; 83-15 audit: 7 hook rows all `sent` attempt 1, max 2 deliveries/entity, 0 ALERT, 0 `outcome=failed`. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/webhooks/chatwoot/route.ts` | Signed thin receiver | VERIFIED | Substantive, calls `createWebhookStore().ingest` + `publishAfterResponse`; no CRM-client imports |
| `app/api/webhooks/espocrm/route.ts` | Signed thin receiver, 503-on-store-fail, never 410 | VERIFIED | Per-item `ingestEspo`, `MAX_ITEMS` 100 |
| `lib/webhook-verify.ts` | HMAC verification | VERIFIED | Imported by both routes |
| `lib/webhook-store.ts` | Ingest RPC wrappers | VERIFIED | Used by both routes |
| `lib/hook-dispatch.ts` | hook.* router | VERIFIED | Called from `lib/lead-sync.ts:186`; five cases + `unsupported_event` default |
| `lib/chat-intake.ts`, `chat-resolve.ts`, `chat-contact.ts`, `espo-contact-hook.ts` | Handlers | VERIFIED | Wired via hook-dispatch |
| `lib/sync-origin.ts`, `lib/chat-payload.ts` | Origin fingerprint + classification | VERIFIED | Echo drop in receiver path |
| `lib/chat-store.ts` + migration 078 | One open chat Lead per person, erasure scope | VERIFIED | Partial unique index + advisory lock; live smoke OK |
| Migrations 076, 077, 078 | Applied live | VERIFIED | Files present; apply + smoke results recorded in 83-01/02/03 SUMMARY |
| `infra/chatwoot/webhook.mjs`, `infra/espocrm/webhook.mjs` | Config-as-code registration + probe | VERIFIED | Live webhook ids created, probes `verdict=ok` (83-14) |
| `infra/vps/runbooks/inbound-webhooks.md` | Runbook incl. Live contract | VERIFIED | Pinned by `tests/inbound-webhooks-runbook.test.ts` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Chatwoot route | `webhook_ingest` RPC -> outbox | `createWebhookStore().ingest` | WIRED |
| EspoCRM route | `webhook_ingest_espo` RPC -> outbox | `store.ingestEspo` | WIRED |
| Outbox dispatcher (`lib/lead-sync.ts:186`) | `deliverHook` | `event_type.startsWith('hook.')` | WIRED |
| `deliverHook` | intake / resolve / contact / label / espo_contact handlers | switch | WIRED |
| Site writes to Chatwoot contact | `site_sync_fp` stamp -> receiver `isSiteEcho` drop | `postWriteFingerprint` / `classifyChatwootEvent` | WIRED |
| Handlers | `bookings` / `customer_profiles` | none (guard-enforced) | NOT REACHABLE (intended) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 83 core suite (verify, routes, dispatch, intake, resolve, contact, espo hook, echo loop, isolation guard + runtime tripwire, runbook pin) | `npx vitest run` over 12 files | 12 files, 372 tests passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (baseline), none in app/lib | PASS |
| Full suite (orchestrator-reported) | - | 7064 passed | PASS (reported) |

### Probe Execution

No `probe-*.sh` scripts are declared by the phase. The signed-probe scripts (`infra/chatwoot/webhook.mjs probe`, `infra/espocrm/webhook.mjs probe`) hit live production and were run by the orchestrator (83-14: `probe_status=200,401,401` / `200,401`, `verdict=ok`). SKIPPED here (live systems).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOOK-01 | 83-02, 03, 04, 07, 09, 10, 14, 15 | Unknown person's conversation -> Contact + Lead with channel source | SATISFIED | Truth 1 |
| HOOK-02 | 83-04, 08, 14 | Resolved conversation -> Contact history | SATISFIED | Truth 2 |
| HOOK-03 | 83-01, 02, 03, 05, 06, 11, 12, 13, 14, 15, 16 | Verified webhooks; cannot write bookings/customer_profiles | SATISFIED | Truth 3 |
| HOOK-04 | 83-01, 05, 10, 11, 12, 14, 15, 16 | No echo loop; origin tagging | SATISFIED | Truth 4 |

All four IDs in PLAN frontmatter match REQUIREMENTS.md HOOK-01..04; REQUIREMENTS.md maps no other ID to Phase 83, so there are no orphans.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in any phase implementation file (routes, `lib/chat-*`, `lib/webhook-*`, `lib/espo-*`, `lib/hook-dispatch.ts`, `lib/sync-origin.ts`, webhook scripts, migrations 076-078, runbook).

### Deferred / Documented Limitations (not gaps)

- Chatwoot account webhooks are at-most-once: lost events have manual recovery in the runbook; reconcile job is ROADMAP backlog 999.10 (D-21, deliberate).
- EspoCRM has no timestamp/delivery id: replay window is "N/A by protocol, compensated" (D-19), documented in the runbook.
- D-07 -> D-18 and D-02 -> D-20 deviations are recorded in the runbook.

### Advisory (non-blocking)

1. **D-01 "no site account" edge (83-15 follow-up).** A widget visitor whose email belongs to a site login account with no identity row is treated as a stranger (chat Lead + non-customer identity, `user_id` not linked). Verified live in 83-15 as harmless. Recommend a backlog item to either link by `auth`/`customer_profiles` (read-only) or state the identity-table definition as the contract.
2. **Tracking not yet ticked:** `.planning/ROADMAP.md` line 23 (`- [ ] **Phase 83`) and REQUIREMENTS.md HOOK-01..04 (`[ ]` / `Pending`) still show unchecked; the orchestrator should update them on phase completion.
3. Live evidence (Truths 1-4 live rows) rests on the 83-14/83-15 records produced by the orchestrator; the verifier did not independently reach the live systems.

### Human Verification Required

None. The live UAT items that would normally be human checks (HOOK-01..04, no-lead label, erasure) were already observed on real systems and recorded in 83-14-SUMMARY.md and 83-15-SUMMARY.md.

### Gaps Summary

No gaps. All four ROADMAP success criteria are implemented, wired, tested (including the behavioural echo-loop simulation and the runtime isolation tripwire) and observed live.

---

_Verified: 2026-10-26_
_Verifier: Claude (gsd-verifier)_
