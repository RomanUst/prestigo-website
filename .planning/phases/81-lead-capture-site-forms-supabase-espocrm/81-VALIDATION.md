---
phase: "81"
slug: "lead-capture-site-forms-supabase-espocrm"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-18"
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 (jsdom default; API/infra tests use `// @vitest-environment node`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/outbox*.test.ts tests/lead-*.test.ts tests/inquir*.test.ts tests/espocrm-*.test.ts tests/infra-vps-isolation-guard.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds (full), quick run a few seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command + `npx eslint --quiet <changed files>`
- **After every plan wave:** Run `npx vitest run` + `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only)
- **Before `/gsd-verify-work`:** Full suite must be green, EspoCRM sync second run `create=0 update=0`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 81-01-T1 | 01 | 1 | LEAD-01, LEAD-05 | T-81-01..04 | contact route stores inquiry (no IP/UA), still emails; store failure → same response | unit + SQL text | `npx vitest run tests/inquiry-routes.test.ts tests/outbox-migrations.test.ts` | ✅ | ✅ green |
| 81-01-T2 | 01 | 1 | LEAD-02, LEAD-03, LEAD-05 | T-81-02 | corporate stores with company, honeypot stores nothing; multi-day stores payload | unit | `npx vitest run tests/inquiry-routes.test.ts tests/outbox.test.ts tests/corporate-contact.test.ts tests/submit-multiday-quote.test.ts` | ✅ | ✅ green |
| 81-01-T3 | 01 | 1 | LEAD-01..03 | T-81-01 | 064/065 live, rolled-back smoke SMOKE_OK_81_01 | live (MCP) + SQL text | `npx vitest run tests/outbox-migrations.test.ts` | ✅ | ✅ green |
| 81-02-T1/T2 | 02 | 1 | LEAD-03, LEAD-04, LEAD-06 | T-81-05, T-81-06 | D-06/D-03 status, D-08 source, D-19 round trip, D-20 purge eligibility, field ownership | unit (TDD) | `npx vitest run tests/lead-mapping.test.ts` | ✅ | ✅ green |
| 81-03-T1 | 03 | 1 | LEAD-06 | T-81-07, T-81-08 | Lead ACL (D-22) live; Dispatcher 403 on Lead | unit + live probe | `npx vitest run tests/espocrm-roles.test.ts tests/espocrm-model.test.ts tests/crm-runbook.test.ts tests/espocrm-sync.test.ts` + `node infra/espocrm/verify-acl.mjs` | ✅ | ✅ green |
| 81-03-T2 | 03 | 1 | LEAD-01..06 | — | Lead fields live; dry-run all zero | unit + live | `npx vitest run tests/espocrm-model.test.ts tests/espocrm-sync.test.ts` + `node infra/espocrm/sync.mjs --dry-run` | ✅ | ✅ green |
| 81-03-T3 | 03 | 1 | LEAD-01..03 | T-81-09 | owner id, notification check, email-match proof (PII-free) | unit + live | `npx vitest run tests/espocrm-mail.test.ts tests/espocrm-sync.test.ts` + `node infra/espocrm/inspect.mjs user-id prestigo-admin` | ✅ | ✅ green |
| 81-04-T1 | 04 | 1 | LEAD-06 | T-81-10 | admin POST requires channel, stores lead_channel; form select required | unit | `npx vitest run tests/admin-bookings.test.ts tests/admin-bookings-payment-link.test.ts tests/manual-booking-form-send-confirmation.test.tsx tests/manual-booking-channel.test.tsx tests/lead-channel-migration.test.ts` | ✅ | ✅ green |
| 81-04-T2 | 04 | 1 | LEAD-06 | T-81-11 | 066 live, SMOKE_OK_81_04 | live (MCP) | `npx vitest run tests/lead-channel-migration.test.ts` | ✅ | ✅ green |
| 81-05-T1/T2 | 05 | 1 | LEAD-01..03 | T-81-12 | D-16 notice in 7 catalogs, real translations, link to /privacy | unit | `npx vitest run tests/inquiry-notice-i18n.test.ts tests/contact-form.test.tsx tests/corporate-form.test.tsx tests/MultiDayForm.test.tsx` | ✅ | ✅ green |
| 81-06-T1/T2/T3 | 06 | 2 | LEAD-01..06 | T-81-13, T-81-14, T-81-38 | Lead source merge, existing-contact link, layouts, lead smoke tool | unit + live | `npx vitest run tests/espocrm-enums.test.ts tests/espocrm-model.test.ts tests/espocrm-sync.test.ts tests/espocrm-lead-smoke.test.ts` + `node infra/espocrm/inspect.mjs links Lead` | ✅ | ✅ green |
| 81-07-T1 | 07 | 2 | LEAD-01..03 | T-81-15, T-81-16, T-81-20 | signed dispatch → one Lead; route rejects bad signature/oversize/malformed | unit (fake EspoCRM) | `npx vitest run tests/lead-sync.test.ts tests/integrations-dispatch.test.ts tests/infra-vps-isolation-guard.test.ts` | ✅ | ✅ green |
| 81-07-T2 | 07 | 2 | LEAD-05, Success 7 | T-81-17, T-81-18, T-81-21 | VPS down → pending + backoff; recovery → one Lead; 401 → breaker; unconfigured → no calls | unit | `npx vitest run tests/espocrm-site-client.test.ts tests/outbox-backoff.test.ts tests/lead-sync.test.ts` | ✅ | ✅ green |
| 81-07-T3 | 07 | 2 | LEAD-01..03 | T-81-19 | D-11 mark, D-13 assignee, idempotent update, duplicate delivery → one Lead | unit | `npx vitest run tests/lead-sync.test.ts tests/integrations-dispatch.test.ts tests/espocrm-site-client.test.ts tests/outbox-backoff.test.ts tests/infra-vps-isolation-guard.test.ts` | ✅ | ✅ green |
| 81-08-T2 | 08 | 3 | LEAD-06 | T-81-22..24 | Lead unique index live, empty keys allowed | unit + live | `npx vitest run tests/espocrm-overlay.test.ts` + `node infra/espocrm/overlay.mjs probe-unique --entity Lead` | ✅ | ✅ green |
| 81-09-T1/T2 | 09 | 3 | LEAD-04, LEAD-06 | T-81-25..29 | trigger enqueue (exception-safe, forward-only, return leg skipped), kick auth, booking Lead status follows booking, SQL/TS parity | unit + SQL text | `npx vitest run tests/lead-sync-booking.test.ts tests/integrations-kick.test.ts tests/outbox-migrations.test.ts tests/lead-sync.test.ts tests/lead-mapping.test.ts` | ✅ | ✅ green |
| 81-09-T3 | 09 | 3 | LEAD-04, LEAD-06 | T-81-25 | 067 live, SMOKE_OK_81_09, capture still off | live (MCP) | `npx vitest run tests/outbox-migrations.test.ts` | ✅ | ✅ green |
| 81-10-T1/T2 | 10 | 4 | LEAD-04, LEAD-05 | T-81-30..33 | sweep auth, Dead after pickup, 90-day purge predicate + re-check, re-arm | unit | `npx vitest run tests/outbox-sweep.test.ts tests/lead-purge.test.ts tests/outbox-migrations.test.ts tests/lead-sync-booking.test.ts` | ✅ | ✅ green |
| 81-10-T3 | 10 | 4 | LEAD-04 | T-81-31 | 068 live, SMOKE_OK_81_10 | live (MCP) | `npx vitest run tests/outbox-migrations.test.ts` | ✅ | ✅ green |
| 81-11-T2/T3 | 11 | 5 | LEAD-01..06, Success 1-7 | T-81-34..37 | live smokes + VPS-down drill; runbook guard | live + unit | `npx vitest run tests/lead-capture-runbook.test.ts` + curl 401 probes + `node infra/espocrm/lead-smoke.mjs show <ref>` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/helpers/fake-espocrm.ts` — Lead `where equals` on `cSupabaseRef`/`emailAddress`, 409 on duplicate email unless `X-Skip-Duplicate-Check`
- [x] `tests/inquiry-routes.test.ts`, `tests/lead-mapping.test.ts`, `tests/lead-sync.test.ts`, `tests/integrations-dispatch.test.ts`, `tests/espocrm-site-client.test.ts`, `tests/outbox-migrations.test.ts`, `tests/inquiry-notice-i18n.test.ts`
- [x] Update existing fixtures: `tests/admin-bookings*.test.ts` (channel), isolation guard allowlist
- [x] No framework install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real submit/booking → Lead with right source/status; paid → Converted; cancel → Dead | LEAD-01..04, LEAD-06 | Needs live Supabase + EspoCRM | Submit each form + a test booking on prod; check Lead in EspoCRM |
| VPS down → leads queue, arrive exactly once after restart | Success 7 | Needs SSH to VPS (owner allow-rules) | Stop EspoCRM container, submit, see pending outbox rows, start container, check one Lead each |
| Trigger + RPC semantics on real Postgres | LEAD-04/06 | Real DB behaviour | Supabase MCP `execute_sql` inside `BEGIN … ROLLBACK` smoke script |

*All three were executed live in 81-11 (go-live 2026-10-18): contact/corporate/multi-day/booking smokes each produced one Lead with the right source/status (cancel → Dead), VPS-down drill D1/D2 passed, SMOKE_OK_81_01/04/09/10 recorded in the plan summaries.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-18

---

## Validation Audit 2026-10-18
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 33 referenced test files exist; `npx vitest run --exclude '.claude/**' <files>` → 33 files / 916 tests passed.
Note: run with `--exclude '.claude/**'` — an unfiltered path filter also matches the stale worktree `.claude/worktrees/beautiful-mayer-240991` (45 failures there, not in the main tree).
