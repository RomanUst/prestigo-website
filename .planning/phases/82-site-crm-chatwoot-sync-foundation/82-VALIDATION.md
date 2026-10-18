---
phase: "82"
slug: "site-crm-chatwoot-sync-foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-18"
---

# Phase 82 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 (jsdom default; API/infra/dispatcher tests use `// @vitest-environment node`) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | the task's own `npx vitest run <files>` command from its PLAN `<verify>` block, plus `npx eslint --quiet <changed files>` |
| **Full suite command** | `npx vitest run` then `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only) |
| **Estimated runtime** | ~90 seconds full suite; task commands 5-30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` commands
- **After every plan wave:** Run `npx vitest run` and `npx tsc --noEmit`
- **After every migration plan:** the orchestrator's rolled-back MCP smoke (`SMOKE_OK_82_xx`) must print its marker
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 82-01-01 | 01 | 1 | SYNC-01 | T-82-01/04/05 | trigger never aborts a booking; one identity per email under the global lock | unit + SQL text | `npx vitest run tests/sync-resolve.test.ts tests/crm-sync-migrations.test.ts tests/outbox.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 82-01-02 | 01 | 1 | SYNC-02 | T-82-02 | signup capture; kick accepts only capture keys | unit + SQL text | `npx vitest run tests/sync-resolve.test.ts tests/integrations-kick.test.ts` | ✅ extend | ⬜ pending |
| 82-01-03 | 01 | 1 | SYNC-01/02 | T-82-02/03 | RLS + REVOKE live | live smoke (MCP) | `SMOKE_OK_82_01` | orchestrator | ⬜ pending |
| 82-02-01..03 | 02 | 1 | SYNC-05 | T-82-06..09 | admin-only retry, ids-only rows | unit + page + live smoke | `npx vitest run tests/outbox-admin.test.ts tests/outbox-admin-migration.test.ts tests/outbox-admin-page.test.tsx` / `SMOKE_OK_82_02` | ❌ W0 | ⬜ pending |
| 82-03-01..03 | 03 | 1 | SYNC-01 (D-02) | T-82-10 | search function keeps service-role-only EXECUTE | SQL text + config + live smoke | `npx vitest run tests/admin-search-bookings-email.test.ts tests/chatwoot-config.test.ts` / `SMOKE_OK_82_03` | ❌ W0 / ✅ | ⬜ pending |
| 82-04-01..03 | 04 | 1 | GDPR-02 | T-82-12/13 | policy matches real processing; frozen translations | content + freeze | `npx vitest run tests/privacy-content.test.ts tests/static-pages-locale.test.tsx` / freeze `--verify` | ❌ W0 | ⬜ pending |
| 82-05-01..03 | 05 | 2 | SYNC-03 | T-82-14..16 | merge once then shared; TS/SQL phone parity | unit + fixture-driven live smoke | `npx vitest run tests/identity.test.ts tests/phone.test.ts` / `SMOKE_OK_82_05` | ❌ W0 | ⬜ pending |
| 82-06-01..02 | 06 | 2 | SYNC-05 | T-82-17/18 | digest has no PII, never blocks the sweep | unit | `npx vitest run tests/outbox-digest.test.ts tests/outbox-sweep.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 82-07-01..03 | 07 | 2 | SYNC-01/02/03 | T-82-19..22 | no duplicates, operator fields untouched | unit (fake EspoCRM) + parity | `npx vitest run tests/crm-sync.test.ts tests/customer-mapping-parity.test.ts` | ❌ W0 | ⬜ pending |
| 82-08-01..03 | 08 | 2 | SYNC-03 | T-82-23..25 | admin-only split under the identity lock | unit + SQL text + live smoke | `npx vitest run tests/identity-admin.test.ts tests/identity-admin-migration.test.ts` / `SMOKE_OK_82_08` | ❌ W0 | ⬜ pending |
| 82-09-01..03 | 09 | 3 | SYNC-04 | T-82-26/27 | deterministic, idempotent backfill | SQL text + rolled-back dry run on real data | `npx vitest run tests/crm-backfill.test.ts tests/chatwoot-inspect.test.ts` / `SMOKE_OK_82_09` | ❌ W0 / ✅ extend | ⬜ pending |
| 82-10-01..03 | 10 | 3 | SYNC-01/02/03 | T-82-28..31 | token never leaks; operator wins identity fields | unit (fake Chatwoot) + live read-only probe | `npx vitest run tests/chatwoot-contact-sync.test.ts tests/chatwoot-site-client.test.ts tests/chatwoot-mapping.test.ts` / `node infra/chatwoot/probe-filter.mjs` | ❌ W0 | ⬜ pending |
| 82-11-01..02 | 11 | 3 | SYNC-03 | T-82-32/33 | admin-only page, double-submit guard | page tests + human-check | `npx vitest run tests/identities-page.test.tsx tests/AdminSidebar.test.tsx` | ❌ W0 | ⬜ pending |
| 82-12-01..03 | 12 | 4 | GDPR-01 | T-82-34..38 | confirmed-only, Supabase-last, verify pass, HMAC-only audit | unit (fakes) + live smoke | `npx vitest run tests/erasure.test.ts tests/erasure-migration.test.ts tests/espocrm-roles.test.ts` / `SMOKE_OK_82_12` | ❌ W0 / ✅ extend | ⬜ pending |
| 82-13-01..03 | 13 | 5 | GDPR-01 | T-82-39..41 | server-side typed-email HMAC gate | unit + page tests + human-check | `npx vitest run tests/admin-erasure.test.ts tests/erasure-page.test.tsx` | ❌ W0 | ⬜ pending |
| 82-14-01..03 | 14 | 6 | SYNC-01/02/03, GDPR-02 | T-82-42..44 | secrets never in the session | live (owner + MCP + infra tools) | `node infra/espocrm/verify-acl.mjs --role "Sync writer"`, `node infra/chatwoot/sync.mjs --dry-run --only attributes` | ✅ | ⬜ pending |
| 82-15-01..03 | 15 | 7 | SYNC-04/05, GDPR-01 | T-82-45..47 | no real customer touched | live + runbook guard | `npx vitest run tests/crm-sync-runbook.test.ts`, `node infra/espocrm/backfill.mjs --audit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan: every new test file is written RED first inside the task that needs it (tdd="true" tasks), and shared fixtures are created by their first user:
- [ ] `tests/fixtures/identity-cases.json` — shared normaliser + resolution fixtures (82-05; also drives the SQL smoke)
- [ ] `tests/helpers/fake-chatwoot.ts` — in-memory Chatwoot contacts API (82-10)
- [ ] `tests/helpers/fake-espocrm.ts` — reused unchanged through its `extraRoutes` hook (82-07, 82-12)
- [ ] Orchestrator pre-step: `82-LIVE-SCHEMA.md` (live columns, constraints, PII inventory) before 82-01 / 82-03 / 82-12 execute

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL resolver, admin, backfill and erasure functions behave as tested | SYNC-01..04, GDPR-01 | executors have no Supabase MCP; SQL runs only live | orchestrator applies each migration and runs its rolled-back `SMOKE_OK_82_xx` DO block |
| Live sync of one booking to EspoCRM and Chatwoot | SYNC-01 | needs production env and the VPS | 82-14 Task 2 (inspect counts) |
| Backfill completeness | SYNC-04 | real history, three systems | 82-15 Task 1 counts + backfill.mjs --audit |
| EspoCRM outage drill | SYNC-01 | stops a VPS container (owner-approved D1/D2) | 82-15 Task 2 |
| Live erasure of a synthetic person | GDPR-01 | owner-only admin action (D-07) | 82-15 Task 3 |
| Privacy page RTL/phone-width check, admin page a11y | GDPR-02, SYNC-03/05, GDPR-01 | visual / browser behaviour | `<human-check>` items harvested at end of phase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 82s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
