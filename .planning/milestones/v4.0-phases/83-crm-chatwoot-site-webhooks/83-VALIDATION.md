---
phase: "83"
slug: "crm-chatwoot-site-webhooks"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-26"
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 (jsdom default; new files start with `// @vitest-environment node`) |
| **Config file** | `vitest.config.ts` (alias `@` → repo root, setup `tests/setup.ts`) |
| **Quick run command** | `npx vitest run tests/webhook-verify.test.ts tests/webhooks-chatwoot-route.test.ts tests/webhooks-espocrm-route.test.ts tests/sync-origin.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds (full), ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run the quick command plus the test file(s) of the touched module (`grep -rlE "[/'\"]<basename>['\"]" tests/` — `vitest related` crashes here)
- **After every plan wave:** Run `npx vitest run`, `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only), `npx eslint --quiet <files>`
- **Before `/gsd-verify-work`:** Full suite must be green and the `verify` skill must PASS
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task IDs filled in by the planner (2026-10-26, 16 plans; revised after plan check: the 83-01 receiver expansion moved to 83-16); each row binds a plan task to its requirement and command.

| Task ID | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 83-07 T1-T3 | HOOK-01 | Stranger → identity (basis chat) + Contact + Lead with channel source; known → nothing; one open chat Lead per person; spam/no-lead filters | unit (fakes) | `npx vitest run tests/chat-intake.test.ts tests/chat-classify.test.ts` | ❌ W0 (83-04, 83-07) | ⬜ pending |
| 83-01 T1, 83-07 T1 | HOOK-01 | `hook.*` keys parse/round-trip; dispatcher routes them | unit | `npx vitest run tests/outbox.test.ts tests/hook-dispatch.test.ts tests/lead-sync.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| 83-04 T1, 83-05 T1 | HOOK-01 | Lead source enum, Webhook role scope, `no-lead` label in config-as-code | unit | `npx vitest run tests/espocrm-enums.test.ts tests/espocrm-roles.test.ts tests/chatwoot-config.test.ts` | ✅ extend | ⬜ pending |
| 83-02 T1-T2, 83-03 T1-T2 | HOOK-01 / HOOK-03 | Chat identity RPCs (no merge on attach) and chat registry (one open lead, erasure scope) | migration text + unit | `npx vitest run tests/chat-identity-migration.test.ts tests/identity-store.test.ts tests/chat-registry-migration.test.ts tests/chat-store.test.ts` | ❌ W0 | ⬜ pending |
| 83-08 T1-T2 | HOOK-02 | Resolve history Note content, private summary note, idempotency per resolve, Contact-else-Lead target | unit (fakes) | `npx vitest run tests/chat-resolve.test.ts` | ❌ W0 | ⬜ pending |
| 83-16 T3 | HOOK-03 | Chatwoot HMAC (`<ts>.<raw body>`), replay window, two-secret rotation, constant-time compare | unit | `npx vitest run tests/webhook-verify.test.ts` | ❌ W0 | ⬜ pending |
| 83-11 T1-T2 | HOOK-03 | EspoCRM `Signature` verify, per-item dedup, never 410 | unit | `npx vitest run tests/webhooks-espocrm-route.test.ts tests/espo-payload.test.ts` | ❌ W0 | ⬜ pending |
| 83-01 T1, 83-16 T1-T3, 83-11 T2 | HOOK-03 | Fail-closed without secret, 413 oversize, 400 bad JSON, 200 for duplicate/ignored/fused, no CSRF Origin requirement | route test | `npx vitest run tests/webhooks-chatwoot-route.test.ts tests/middleware-csrf-forms.test.ts` | ❌ / ✅ extend | ⬜ pending |
| 83-01 T1-T3 | HOOK-03 | Migration 076: deny-all RLS, REVOKE/GRANT per function, no writes to bookings/customer_profiles/auth.users, event-type allowlist, EspoCRM ingest + purge (D-19) | migration text + live smoke | `npx vitest run tests/webhook-ingest-migration.test.ts` | ❌ W0 | ⬜ pending |
| 83-03 T2, 83-12 T2 | HOOK-03 | Structural barrier: import-closure guard + runtime tripwire; VPS guard allowlist | guard | `npx vitest run tests/webhook-isolation-guard.test.ts tests/webhook-isolation-runtime.test.ts tests/infra-vps-isolation-guard.test.ts` | ❌ / ✅ extend | ⬜ pending |
| 83-16 T1 | HOOK-04 | Fingerprint determinism; receiver drops own-echo `contact_updated`, passes operator edit; contact fuse limit + ALERT | unit | `npx vitest run tests/sync-origin.test.ts tests/chat-payload.test.ts tests/webhooks-chatwoot-route.test.ts` | ❌ W0 | ⬜ pending |
| 83-16 T2 | HOOK-01 / HOOK-02 | Receiver event filter: incoming non-private messages, resolved status (payload/header time only), no-lead label, unsubscribed events ignored without a DB call | unit | `npx vitest run tests/chat-payload.test.ts tests/webhooks-chatwoot-route.test.ts` | ❌ W0 | ⬜ pending |
| 83-10 T3 | HOOK-04 | `chatwoot-sync.ts` writes `site_sync_fp` of post-write state | unit | `npx vitest run tests/chatwoot-contact-sync.test.ts tests/chatwoot-mapping.test.ts` | ✅ extend | ⬜ pending |
| 83-12 T1 | HOOK-04 | Loop harness quiesces with bounded writes; fuse trips on forced loop | simulation | `npx vitest run tests/webhook-echo-loop.test.ts` | ❌ W0 | ⬜ pending |
| 83-05 T1-T2 | HOOK-04 | Espo webhook created as `prestigo-sync` with `skipOwn: true` | unit | `npx vitest run tests/espocrm-webhook-script.test.ts` | ❌ W0 | ⬜ pending |
| 83-10 T1-T2, 83-11 T3 | HOOK-01 / HOOK-04 | D-12 contact edits, D-07 label, D-13/D-14 Espo → Chatwoot | unit (fakes) | `npx vitest run tests/chat-contact.test.ts tests/espo-contact-hook.test.ts` | ❌ W0 | ⬜ pending |
| 83-09 T1-T2 | D-05 / erasure | Paid booking converts open chat Lead once; erasure scrubs chat data | unit | `npx vitest run tests/crm-sync.test.ts tests/erasure.test.ts` | ✅ extend | ⬜ pending |
| 83-13 T1-T3 | HOOK-03 | Delivery purge, outbox labels, runbook pins | unit | `npx vitest run tests/outbox-sweep.test.ts tests/outbox-admin.test.ts tests/inbound-webhooks-runbook.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/webhook-verify.test.ts`, `tests/webhooks-chatwoot-route.test.ts`, `tests/webhooks-espocrm-route.test.ts` — HOOK-03
- [ ] `tests/webhook-ingest-migration.test.ts`, `tests/webhook-isolation-guard.test.ts` — HOOK-03
- [ ] `tests/sync-origin.test.ts`, `tests/webhook-echo-loop.test.ts`, `tests/espocrm-webhook-script.test.ts` — HOOK-04
- [ ] `tests/chat-intake.test.ts`, `tests/chat-classify.test.ts`, `tests/chat-resolve.test.ts`, `tests/chat-contact.test.ts`, `tests/espo-contact-hook.test.ts` — HOOK-01/02, D-12..14
- [ ] Extend `tests/helpers/fake-chatwoot.ts` and `tests/helpers/fake-espocrm.ts` (conversations, messages, labels, Note, Webhook CRUD with `skipOwn`)
- [ ] Signed-fixture builder in tests (obviously fake secrets only)
- Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real signature round trip, real payload shapes, Note API, `skipOwn` behaviour (83-14 T1-T3, 83-15 T1-T3) | HOOK-01..04 | Needs live VPS Chatwoot/EspoCRM; VPS SSH blocked in auto mode | Owner runs `node infra/chatwoot/webhook.mjs probe` and `node infra/espocrm/webhook.mjs probe`, then a live UAT conversation (stranger → Lead, resolve → Note, Espo edit → Chatwoot, no-lead → Dead, erasure) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
