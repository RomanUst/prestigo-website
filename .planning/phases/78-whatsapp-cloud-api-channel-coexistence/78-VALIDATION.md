---
phase: "78"
slug: "whatsapp-cloud-api-channel-coexistence"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-29"
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.1.1` (jsdom default; `// @vitest-environment node` for infra tests) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts tests/whatsapp-runbook.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` |
| **Full suite command** | `npx vitest run` (name files explicitly — `vitest related` crashes here) |
| **Estimated runtime** | ~90 seconds (full), ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the touched files
- **After every plan wave:** Run `npx vitest run` plus `sh scripts/qa/secret_gate_probe.sh` when the hook or env examples changed
- **Before `/gsd-verify-work`:** Full suite green, `npx tsc --noEmit` baseline unchanged (8 old errors in `tests/` only)
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task-level map (planner, 2026-09-29):

| Task | Requirement / Decision | Automated verify | Manual / owner |
|------|------------------------|------------------|----------------|
| 78-01 T1 | WA-01 (D-01..D-04) | public preflight curl chain (api 4.18.0, webhook 401, legal pages 200) | — |
| 78-01 T2-T3 | WA-01 (D-01, D-02, D-03, D-04, D-16) | — | owner Meta track + coexistence popup rehearsal |
| 78-02 T1-T2 | WA-02 (D-07, D-08, D-09, D-11) | `npx vitest run tests/whatsapp-templates.test.ts` | — |
| 78-03 T1-T2 | WA-02 (D-09, D-12) | `npx vitest run tests/whatsapp-graph.test.ts` | — |
| 78-03 T3 | security (D-09 custody) | `sh scripts/qa/secret_gate_probe.sh`; `! git grep -nE 'EAA[A-Za-z0-9]{40,}'` | — |
| 78-04 T1-T2 | WA-01, WA-02 (D-15, D-16, D-17) | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts tests/chatwoot-inspect.test.ts` | — |
| 78-05 T1 | WA-03 (D-20 recovery tooling) | `npx vitest run tests/chatwoot-inspect.test.ts` | — |
| 78-05 T2 | WA-03 (D-06, D-12..D-16, D-18..D-20) | `npx vitest run tests/whatsapp-runbook.test.ts` | — |
| 78-06 T1-T3 | WA-01 (privacy, Open Question 4) | `npx vitest run tests/static-pages-locale.test.tsx`; freeze `--verify`; `i18n-translate --check` | owner decision |
| 78-07 T1, T3 | WA-02 (D-07, D-08, D-10, D-11) | `npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts`; `--validate` → valid=35 / valid=56 | owner invoice decision (T2) |
| 78-08 T3 | WA-01, WA-03 (D-03, D-06, D-17, D-18) | `inspect.mjs --whatsapp --expect-coexistence`; unsigned POST 401; `sync.mjs --dry-run` no-op | go/no-go (T1), cutover + test matrix (T2) |
| 78-09 T2-T3 | WA-02 (D-07, D-09, D-10) | `whatsapp-templates.mjs --status --require-approved ...`; `--dry-run` create=0 | owner System User token (T1) |
| 78-10 T1, T3 | WA-01..03 (D-05, D-16, D-19, D-20) | `inspect --expect-coexistence`; `sync.mjs --dry-run`; `git diff --quiet HEAD -- infra/chatwoot/automation-rules.json`; `npx vitest run` | owner UAT (T2) |

Requirement → test mapping from RESEARCH.md:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| WA-02 | 8 templates × 7 locales, Meta language codes, name/length/variable/button rules | unit | `npx vitest run tests/whatsapp-templates.test.ts` | ❌ W0 | ⬜ pending |
| WA-02 | Template copy price-free and brand-safe | unit | same | ❌ W0 | ⬜ pending |
| WA-02 | Graph script vs fake Graph API: dry-run GET-only, idempotent second run, approved-drift reported, token redacted, never DELETE | unit | `npx vitest run tests/whatsapp-graph.test.ts` | ❌ W0 | ⬜ pending |
| WA-01 / D-17 | inboxes.json WhatsApp entry (no secrets), `ch-whatsapp` + `wa-window-closing` labels, channel rule, sync idempotent | unit | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | ✅ (add cases) | ⬜ pending |
| D-16 | Delayed window rule + clearing rule expanded, delay drift detected, 4xx optional-skip | unit | same | ✅ (add cases) | ⬜ pending |
| WA-03 | `infra/vps/runbooks/whatsapp.md` sections present, no secrets; inventory row in `chatwoot-channels.md` | unit | `npx vitest run tests/whatsapp-runbook.test.ts` | ❌ W0 | ⬜ pending |
| Security | Pre-commit blocks Meta-token-shaped strings; allows `.example` | script | `sh scripts/qa/secret_gate_probe.sh` | ✅ (add probes) | ⬜ pending |
| Guard | No site code path reaches VPS / Meta | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/whatsapp-templates.test.ts` — WA-02 content rules
- [ ] `tests/whatsapp-graph.test.ts` — fake Graph API harness (model on `FakeOptions` in `tests/chatwoot-sync.test.ts`)
- [ ] `tests/whatsapp-runbook.test.ts` — WA-03 file assertions
- [ ] `infra/vps/env/whatsapp-meta.env.example` + probe cases in `scripts/qa/secret_gate_probe.sh`

*Framework install: none (Vitest present).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meta portfolio verified, app Live, Tech Provider / Embedded Signup completes | WA-01 | External Meta UI, owner account | Owner checklist; rehearsal popup completes |
| Inbox health: coexistence true, CONNECTED | WA-01 | Needs live Chatwoot + Meta | `node infra/chatwoot/inspect.mjs --whatsapp` |
| Two-direction matrix (D-06), history intact on phone | WA-01 | Live number, second phone | Inbound on both; Chatwoot reply on phone; phone reply echoes into Chatwoot |
| App greeting/away still fires under coexistence | WA-01 / D-15 | Live behaviour | New sender test, note echo in Chatwoot |
| Unsigned webhook POST → 401 after onboarding | WA-01 | Live endpoint | curl POST without signature |
| Templates approved; real send outside 24h; quick-reply reopens window | WA-02 | Meta approval + live send | Script status; send to owner's second number |
| Window rule labels `wa-window-closing` and clears on reply | D-16 | Live delayed automation | Temporarily `delayMinutes: 10`, then restore and resync |
| Rollback steps reviewed | WA-03 | Paper rehearsal | Owner reviews runbook section |
| EUR payment method added before first template send | WA-03 / D-18 | Owner-only billing | Business Manager check |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
