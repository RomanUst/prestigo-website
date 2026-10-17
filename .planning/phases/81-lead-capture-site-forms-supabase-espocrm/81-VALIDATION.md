---
phase: "81"
slug: "lead-capture-site-forms-supabase-espocrm"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| (filled by planner per task) | | | LEAD-01 | — | contact route stores inquiry (no IP/UA) and still emails | unit | `npx vitest run tests/inquiry-routes.test.ts -t contact` | ❌ W0 | ⬜ pending |
| | | | LEAD-02 | — | corporate stores with company; honeypot hit stores nothing | unit | `npx vitest run tests/inquiry-routes.test.ts -t corporate` | ❌ W0 | ⬜ pending |
| | | | LEAD-03 | — | multi-day stores payload + itinerary text | unit | `npx vitest run tests/inquiry-routes.test.ts -t multiday` | ❌ W0 | ⬜ pending |
| | | | LEAD-04 | — | booking→lead status table (D-06), purge only online unpaid > 90 d | unit | `npx vitest run tests/lead-mapping.test.ts` | ❌ W0 | ⬜ pending |
| | | | LEAD-04/06 | — | migration triggers have exception guard, cutoff guard, REVOKE/RLS | unit (SQL text) | `npx vitest run tests/outbox-migrations.test.ts` | ❌ W0 | ⬜ pending |
| | | | LEAD-05 | — | store failure → route 200 + email still sent | unit | `npx vitest run tests/inquiry-routes.test.ts -t failure` | ❌ W0 | ⬜ pending |
| | | | LEAD-06 | — | Lead source per booking source/channel; GNet placeholders dropped | unit | `npx vitest run tests/lead-mapping.test.ts tests/lead-sync.test.ts` | ❌ W0 | ⬜ pending |
| | | | Success 7 | — | VPS down → pending + backoff; recovery → exactly one Lead; 401 → breaker | unit (fake EspoCRM) | `npx vitest run tests/lead-sync.test.ts` | ❌ W0 | ⬜ pending |
| | | | All | — | dispatcher rejects bad/missing QStash signature, oversize body | unit | `npx vitest run tests/integrations-dispatch.test.ts` | ❌ W0 | ⬜ pending |
| | | | All | — | site EspoCRM client: X-Api-Key, redirect:'error', timeout, redaction | unit | `npx vitest run tests/espocrm-site-client.test.ts` | ❌ W0 | ⬜ pending |
| | | | All | — | VPS isolation guard green with new allowlist | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ extend | ⬜ pending |
| | | | CRM config | — | Lead fields/source enum/role in sync config; second run unchanged | unit | `npx vitest run tests/espocrm-sync.test.ts tests/espocrm-roles.test.ts tests/espocrm-enums.test.ts` | ✅ extend | ⬜ pending |
| | | | D-16 | — | notice keys in 7 catalogs, real translations | unit | `npx vitest run tests/inquiry-notice-i18n.test.ts` | ❌ W0 | ⬜ pending |
| | | | D-08 | — | admin POST requires channel, stores lead_channel | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/fake-espocrm.ts` — Lead `where equals` on `cSupabaseRef`/`emailAddress`, 409 on duplicate email unless `X-Skip-Duplicate-Check`
- [ ] `tests/inquiry-routes.test.ts`, `tests/lead-mapping.test.ts`, `tests/lead-sync.test.ts`, `tests/integrations-dispatch.test.ts`, `tests/espocrm-site-client.test.ts`, `tests/outbox-migrations.test.ts`, `tests/inquiry-notice-i18n.test.ts`
- [ ] Update existing fixtures: `tests/admin-bookings*.test.ts` (channel), isolation guard allowlist
- [ ] No framework install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real submit/booking → Lead with right source/status; paid → Converted; cancel → Dead | LEAD-01..04, LEAD-06 | Needs live Supabase + EspoCRM | Submit each form + a test booking on prod; check Lead in EspoCRM |
| VPS down → leads queue, arrive exactly once after restart | Success 7 | Needs SSH to VPS (owner allow-rules) | Stop EspoCRM container, submit, see pending outbox rows, start container, check one Lead each |
| Trigger + RPC semantics on real Postgres | LEAD-04/06 | Real DB behaviour | Supabase MCP `execute_sql` inside `BEGIN … ROLLBACK` smoke script |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
