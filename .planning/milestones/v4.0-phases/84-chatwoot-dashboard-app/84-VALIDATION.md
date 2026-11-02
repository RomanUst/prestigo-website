---
phase: "84"
slug: "chatwoot-dashboard-app"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-26"
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `84-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (jsdom default; `// @vitest-environment node` for server-side tests) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/chatwoot-operator.test.ts tests/panel-bookings.test.ts tests/chatwoot-dashboard-route.test.ts tests/dashboard-app-isolation-guard.test.ts tests/middleware-embed.test.ts tests/embed-panel.test.tsx` |
| **Full suite command** | `npx vitest run` + `npx tsc --noEmit` + `npx eslint --quiet <changed files>` (the `verify` skill) |
| **Estimated runtime** | ~90 seconds (full), ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the files touched
- **After every plan wave:** Quick run + `tests/middleware-*.test.ts`, `tests/infra-vps-isolation-guard.test.ts`, `tests/webhook-isolation-guard.test.ts`, `tests/chatwoot-sync.test.ts`, `tests/rate-limit.test.ts`, `tests/crm-sync-migrations.test.ts`, `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green, `verify` skill PASS, live checklist signed off
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Per-task map (planner, 2026-10-29):

| Plan · Task | Wave | Requirement / Decision | Automated Command | Kind |
|-------------|------|------------------------|-------------------|------|
| 84-01 · T1 (tracer) | 1 | PANEL-01/02 · D-05, D-06, D-09, D-11 | `npx vitest run tests/panel-bookings-migration.test.ts tests/panel-bookings.test.ts` | migration text + unit (RED first) |
| 84-01 · T2 | 1 | PANEL-01 · D-08, D-10 | same as T1 + `npx eslint --quiet lib/panel-dto.ts lib/panel-links.ts lib/panel-bookings.ts` | migration text + unit |
| 84-01 · T3 [BLOCKING][ORCHESTRATOR] | 1 | PANEL-01/02 | `npx vitest run tests/panel-bookings-migration.test.ts` + live smoke `SMOKE_OK_84_01` | live |
| 84-02 · T1 (tracer) | 1 | PANEL-02 · D-01, D-03, D-04 | `npx vitest run tests/chatwoot-operator.test.ts tests/infra-vps-isolation-guard.test.ts` | unit (fetch stubs) |
| 84-02 · T2 | 1 | PANEL-02 · D-01, D-02 | `npx vitest run tests/chatwoot-operator.test.ts` | unit |
| 84-03 · T1 (tracer) | 1 | PANEL-02 · D-13 | `npx vitest run tests/chat-widget-origin-guard.test.ts tests/chat-launcher.test.tsx tests/chat-launcher-i18n.test.ts tests/infra-vps-isolation-guard.test.ts` | jsdom |
| 84-03 · T2 | 1 | PANEL-02 · D-13 | `npx vitest run tests/dashboard-app-runbook.test.ts` | content |
| 84-04 · T1 (tracer) | 2 | PANEL-01/02 · D-01..D-04, D-12 | `npx vitest run tests/chatwoot-dashboard-route.test.ts tests/rate-limit.test.ts tests/infra-vps-isolation-guard.test.ts` | route unit |
| 84-04 · T2 | 2 | PANEL-02 | `npx vitest run tests/dashboard-app-isolation-guard.test.ts tests/webhook-isolation-guard.test.ts` | structural guard |
| 84-05 · T1 (tracer) | 2 | PANEL-02 | `npx vitest run tests/middleware-embed.test.ts tests/middleware-i18n.test.ts tests/middleware-customer.test.ts tests/middleware-csrf-forms.test.ts tests/infra-vps-isolation-guard.test.ts` | middleware unit |
| 84-05 · T2 | 2 | PANEL-02 | `npx vitest run tests/middleware-embed.test.ts tests/middleware-matcher.test.ts tests/next-config-headers.test.ts tests/middleware-i18n.test.ts tests/middleware-customer.test.ts tests/middleware-csrf-forms.test.ts` | middleware/config |
| 84-06 · T1 (tracer) | 2 | PANEL-01 | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-dashboard-apps-config.test.ts tests/chatwoot-config.test.ts` | unit (fake API) |
| 84-06 · T2 | 2 | PANEL-02 · D-01, D-02, D-04 | `npx vitest run tests/dashboard-app-runbook.test.ts` | content |
| 84-07 · T1 (tracer) | 3 | PANEL-01/02 · D-02, D-03, D-07 | `npx vitest run tests/embed-panel.test.tsx tests/infra-vps-isolation-guard.test.ts tests/dashboard-app-isolation-guard.test.ts` | jsdom |
| 84-07 · T2 | 3 | PANEL-02 | `npm run build 2>&1 \| grep -E "ƒ /embed/chatwoot-dashboard"` | build |
| 84-08 · T1 (tracer) | 4 | PANEL-01 · D-06, D-07, D-09 | `npx vitest run tests/embed-panel-cards.test.tsx tests/embed-panel.test.tsx` | jsdom |
| 84-08 · T2 | 4 | PANEL-01 · D-05, D-08, D-12 | `npx vitest run tests/embed-panel-cards.test.tsx tests/embed-panel.test.tsx tests/dashboard-app-isolation-guard.test.ts` | jsdom |
| 84-09 · T1 (human-action) | 5 | PANEL-01 | `vercel env ls production \| grep -cE "CHATWOOT_BASE_URL\|CHATWOOT_ACCOUNT_ID"` | live |
| 84-09 · T2 (tracer) | 5 | PANEL-02 · D-13 | live `curl -sI` checks + `python3 scripts/qa/csp_regression.py --compare` | live |
| 84-09 · T3 (human-verify) | 5 | PANEL-01/02 · UI-SPEC backstops | full panel test set (see plan) + owner UAT | live/manual |

Wave 0 note: there is no separate Wave 0 plan; every tracer and `tdd="true"` task writes its tests first (RED) inside the same task, so no task runs without an automated command.

Requirement → test map from research:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PANEL-01 | RPC projection allowlisted columns; booker-only; excludes abandoned/anonymised/erasing; shared phone ignored | migration-text + live smoke | `npx vitest run tests/panel-bookings-migration.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-01 | DTO mapping, payment-state rule, upcoming/past split, counters | unit | `npx vitest run tests/panel-bookings.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-01 | Cards (D-06), empty state (D-08), no-contact hint (D-12), Copy button (D-09), "more" | component | `npx vitest run tests/embed-panel.test.tsx` | ❌ W0 | ⬜ pending |
| PANEL-02 | postMessage handshake origin + source validation, inert when unframed | component | `npx vitest run tests/embed-panel.test.tsx` | ❌ W0 | ⬜ pending |
| PANEL-02 | Operator token verification (profile + conversation GET), cache, error mapping | unit | `npx vitest run tests/chatwoot-operator.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | Route order, no-store, response allowlist, rate limit fail-closed | route unit | `npx vitest run tests/chatwoot-dashboard-route.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | Structural read-only + cookie-less guard | source guard | `npx vitest run tests/dashboard-app-isolation-guard.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | Middleware embed CSP `frame-ancestors`, no next-intl rewrite, cookie strip | middleware unit | `npx vitest run tests/middleware-embed.test.ts tests/middleware-i18n.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | `X-Frame-Options` excluded only for `/embed/*` | config test | `npx vitest run tests/next-config-headers.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | VPS isolation guard green with new allowlist + `frame-ancestors` | existing guard | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ extend | ⬜ pending |
| PANEL-01/02 | `dashboardApps` sync resource idempotent | unit | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-dashboard-apps-config.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| PANEL-02 | Runbook: token how-to, revocation, CVE evidence block | content test | `npx vitest run tests/dashboard-app-runbook.test.ts` | ❌ W0 | ⬜ pending |
| PANEL-02 | Rate limit entry for `/api/chatwoot/dashboard-app` | unit | `npx vitest run tests/rate-limit.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/chatwoot-operator.test.ts`, `tests/panel-bookings.test.ts`, `tests/panel-bookings-migration.test.ts`, `tests/chatwoot-dashboard-route.test.ts`, `tests/dashboard-app-isolation-guard.test.ts`, `tests/middleware-embed.test.ts`, `tests/embed-panel.test.tsx`, `tests/next-config-headers.test.ts`, `tests/chatwoot-dashboard-apps-config.test.ts`, `tests/dashboard-app-runbook.test.ts` (optionally `tests/chat-widget-origin-guard.test.ts`)
- [ ] Local fetch stub for the operator client (`tests/helpers/fake-chatwoot.ts` cannot serve `/api/v1/profile`)
- [ ] Edits to existing tests: `infra-vps-isolation-guard`, `middleware-matcher`, `chatwoot-sync`, `rate-limit`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard App tab appears in Chatwoot | PANEL-01 | Needs live Chatwoot | `node infra/chatwoot/sync.mjs --dry-run`, then apply; open a conversation |
| Known customer / stranger / name-only contact views | PANEL-01 | Live data + iframe | Open three conversation types; check counters, empty state, D-12 hint |
| Non-permitted agent gets "no access"; removed agent loses access | PANEL-02 | Live Chatwoot permissions | Second agent outside inbox/team pastes own token |
| Light/dark theme, 320–400 px, Copy inside real iframe | PANEL-01 | Real browser + Chatwoot iframe | Toggle theme, resize sidebar, click Copy |
| Embed headers in production | PANEL-02 | Live deploy | `curl -sI https://rideprestigo.com/embed/chatwoot-dashboard` → CSP `frame-ancestors`, no XFO |
| Admin cookie not used | PANEL-02 | Browser network tab | Same result logged in and out of `/admin` |
| CVE-2025-12245 evidence re-check | PANEL-02 | External advisory | Run the runbook recipe, paste result |
| CSP baseline | PANEL-02 | Captures live prod | `csp_regression.py --compare` pre-merge; `--capture` post-deploy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
