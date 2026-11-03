---
phase: "80"
slug: "espocrm-deployment-core-entities"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-11"
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/espocrm-*.test.ts tests/BookingsTable.test.tsx tests/crm-runbook.test.ts tests/infra-vps-isolation-guard.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~80 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 80 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 80-01-02 | 01 | 1 | CRM-02,CRM-03 | — | Task 2 (tracer): client + sync engine + settings resource, live — EUR  | unit | `npx vitest run tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-01-03 | 01 | 1 | CRM-02,CRM-03 | — | Task 3: README with the CRM naming interface + PII rules, and git-igno | unit | `npx vitest run tests/espocrm-sync.test.ts tests/infra-vps-isolation-guard.test.ts` | ❌ W0 | ⬜ pending |
| 80-02-01 | 02 | 1 | CRM-03 | — | Task 1 (tracer): ?search=PRG-… seeds the search box and horizon all on | unit | `npx vitest run tests/BookingsTable.test.tsx` | ✅ | ⬜ pending |
| 80-02-02 | 02 | 1 | CRM-03 | — | Task 2: invalid or absent parameters keep today's behaviour; isolation | unit | `npx vitest run tests/BookingsTable.test.tsx tests/infra-vps-isolation-guard.test.ts` | ✅ | ⬜ pending |
| 80-03-01 | 03 | 1 | CRM-03,CRM-01 | — | Task 1 (tracer): one confirmed online booking row -> complete CBooking | unit | `npx vitest run tests/espocrm-booking-map.test.ts` | ❌ W0 | ⬜ pending |
| 80-03-02 | 03 | 1 | CRM-03,CRM-01 | — | Task 2: exclusion boundary, payment rule, currency and Prague-time pre | unit | `npx vitest run tests/espocrm-booking-map.test.ts` | ❌ W0 | ⬜ pending |
| 80-03-03 | 03 | 1 | CRM-03,CRM-01 | — | Task 3: D-14 account candidates — grouping, free-mail and canary exclu | unit | `npx vitest run tests/espocrm-candidates.test.ts tests/espocrm-booking-map.test.ts` | ❌ W0 | ⬜ pending |
| 80-04-01 | 04 | 2 | CRM-03 | — | Task 1 (tracer): entities, links and fields resources — CBooking + sup | unit | `npx vitest run tests/espocrm-model.test.ts tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-04-02 | 04 | 2 | CRM-03 | — | Task 2: every D-09 CBooking field + the account link, enum values pinn | unit | `npx vitest run tests/espocrm-model.test.ts` | ❌ W0 | ⬜ pending |
| 80-04-03 | 04 | 2 | CRM-03 | — | Task 3: layouts resource — Booking list/detail and the Bookings panel  | unit | `npx vitest run tests/espocrm-model.test.ts tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-05-01 | 05 | 3 | CRM-02,CRM-01 | — | Task 1 (tracer): Opportunity stages D-01 live through mergeEnumOptions | unit | `npx vitest run tests/espocrm-enums.test.ts tests/espocrm-model.test.ts` | ❌ W0 | ⬜ pending |
| 80-05-02 | 05 | 3 | CRM-02,CRM-01 | — | Task 2: Account types D-02 + owner-change survival + D-20 in-use guard | unit | `npx vitest run tests/espocrm-enums.test.ts` | ❌ W0 | ⬜ pending |
| 80-06-01 | 06 | 4 | CRM-01 | — | Task 1 (tracer): CPartnerRate entity linked to Account, with fields an | unit | `npx vitest run tests/espocrm-model.test.ts` | ❌ W0 | ⬜ pending |
| 80-06-02 | 06 | 4 | CRM-01 | — | Task 2: D-03 commercial fields on Account with dynamic logic and the P | unit | `npx vitest run tests/espocrm-model.test.ts tests/espocrm-enums.test.ts tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-07-01 | 07 | 5 | CRM-05,CRM-03 | — | Task 1 (tracer): roles resource + Dispatcher role live, proven by a te | unit | `npx vitest run tests/espocrm-roles.test.ts` | ❌ W0 | ⬜ pending |
| 80-07-02 | 07 | 5 | CRM-05,CRM-03 | — | Task 2: Sales manager and Sync writer roles, Sync writer assigned to p | unit | `npx vitest run tests/espocrm-roles.test.ts tests/espocrm-model.test.ts tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-07-03 | 07 | 5 | CRM-05,CRM-03 | — | Task 3: full live ACL matrix — Booking read-only, Sales sees terms, Sy | unit | `npx vitest run tests/espocrm-roles.test.ts` | ❌ W0 | ⬜ pending |
| 80-08-02 | 08 | 6 | CRM-03 | — | Task 2 (tracer): overlay tool + live apply — backup, fetch, merge, ins | unit | `npx vitest run tests/espocrm-overlay.test.ts` | ❌ W0 | ⬜ pending |
| 80-09-01 | 09 | 6 | CRM-03 | — | Task 1 (tracer): Supabase export via MCP -> backfill --dry-run against | unit | `npx vitest run tests/espocrm-backfill.test.ts` | ❌ W0 | ⬜ pending |
| 80-09-02 | 09 | 6 | CRM-03 | — | Task 2: write path proven on the fake — idempotency, field ownership,  | unit | `npx vitest run tests/espocrm-backfill.test.ts tests/espocrm-booking-map.test.ts` | ❌ W0 | ⬜ pending |
| 80-10-01 | 10 | 6 | CRM-04,CRM-02 | — | Task 1 (tracer): mail resource + inspect tool, live — owner email, Rem | unit | `npx vitest run tests/espocrm-mail.test.ts tests/espocrm-sync.test.ts` | ❌ W0 | ⬜ pending |
| 80-11-01 | 11 | 7 | CRM-05,CRM-04 | — | Task 1 (tracer): runbook skeleton + role table tied to roles.json by t | unit | `npx vitest run tests/crm-runbook.test.ts` | ❌ W0 | ⬜ pending |
| 80-11-02 | 11 | 7 | CRM-05,CRM-04 | — | Task 2: full runbook content — identities, Chatwoot mirror, add/remove | unit | `npx vitest run tests/crm-runbook.test.ts tests/whatsapp-runbook.test.ts` | ❌ W0 | ⬜ pending |
| 80-12-01 | 12 | 7 | CRM-03,CRM-01 | — | Task 1 (tracer): live backfill — one booking, then all, then idempoten | integration (live) | `node infra/espocrm/backfill.mjs --audit` | — | ⬜ pending |
| 80-12-02 | 12 | 7 | CRM-03,CRM-01 | — | Task 2: account-candidates CLI — scan the export, write candidates.jso | unit | `npx vitest run tests/espocrm-candidates.test.ts` | ❌ W0 | ⬜ pending |
| 80-13-01 | 13 | 8 | CRM-01,CRM-03 | — | Task 1 (tracer): seed confirmed Accounts, link their Contacts, relink  | unit | `npx vitest run tests/espocrm-seed.test.ts` | ❌ W0 | ⬜ pending |
| 80-13-02 | 13 | 8 | CRM-01,CRM-03 | — | Task 2: idempotency, canary untouched, full regression, and deletion o | unit | `npx vitest run tests/espocrm-sync.test.ts tests/espocrm-model.test.ts tests/espocrm-enums.test.ts tests/espocrm-roles.test.ts tests/espocrm-overlay.test.ts tests/espocrm-booking-map.test.ts tests/espocrm-candidates.test.ts tests/espocrm-backfill.test.ts tests/espocrm-mail.test.ts tests/espocrm-seed.test.ts tests/crm-runbook.test.ts tests/infra-vps-isolation-guard.test.ts tests/BookingsTable.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/crm-runbook.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-backfill.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-booking-map.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-candidates.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-enums.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-mail.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-model.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-overlay.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-roles.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-seed.test.ts` — created by its plan (test-first in the tracer task)
- [ ] `tests/espocrm-sync.test.ts` — created by its plan (test-first in the tracer task)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Task 1: owner creates prestigo-config and prestigo-sync and stores the (80-01-01) | CRM-02,CRM-03 | checkpoint:human-action: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 1: owner approves the four VPS commands (D-19 owner-approved SSH  (80-08-01) | CRM-03 | checkpoint:human-action: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 3: owner approves the dry-run counts and the payment-method rule  (80-09-03) | CRM-03 | checkpoint:decision: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 2: owner connects roman@ as a Personal Email Account and confirms (80-10-02) | CRM-04,CRM-02 | checkpoint:human-action: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 3: guided UAT — attach rules, unknown sender, Opportunity reply,  (80-10-03) | CRM-04,CRM-02 | checkpoint:human-verify: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 3: owner confirms which candidates become Accounts and their type (80-12-03) | CRM-03,CRM-01 | checkpoint:decision: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |
| Task 3: phase walk-through — a real partner Account end to end (80-13-03) | CRM-01,CRM-03 | checkpoint:human-verify: owner-only action/decision (secrets, SSH approval, UI password, confirmations) | Follow the checkpoint instructions in the plan |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 80s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (seeded from plan <automated> blocks 2026-10-11)
