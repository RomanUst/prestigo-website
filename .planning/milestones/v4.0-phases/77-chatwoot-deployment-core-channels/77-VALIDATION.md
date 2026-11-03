---
phase: "77"
slug: "chatwoot-deployment-core-channels"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-28"
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled at plan time (2026-09-28) from the 13 PLAN files. Mailbox target is **bookings@rideprestigo.com** (owner-confirmed, commit da25bbe4); CONTEXT.md decisions win over any older wording.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 (jsdom) for site code and `.mjs` tooling; Python Playwright for live/probe checks; Node built-in fetch for Chatwoot API checks |
| **Config file** | existing repo-root Vitest config (unchanged) |
| **Quick run command** | `npx vitest run <touched test files>` (never `vitest related` — it crashes here) |
| **Full suite command** | `npx vitest run` (~90 s) |
| **Estimated runtime** | ~5–20 s per targeted run; ~90 s full suite |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` commands (targeted vitest files, probe mode, or sync/inspect command)
- **After every plan wave:** `npx vitest run` (full suite) + `sh scripts/qa/secret_gate_probe.sh`
- **Before `/gsd-verify-work`:** full suite green; production probes from 77-12 green; 77-13 API checks recorded
- **Max feedback latency:** 90 seconds for code tasks (live-owner tasks are gated by checkpoints, not latency)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | INBOX-03 | T-77-01, T-77-02 | identity only from session; secret never in response | unit/route | `npx vitest run tests/chatwoot-identity.test.ts tests/infra-vps-isolation-guard.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 77-01-02 | 01 | 1 | INBOX-03 | T-77-02, T-77-03 | fail closed; no-store on every branch | unit/route | `npx vitest run tests/chatwoot-identity.test.ts` | ❌ W0 | ⬜ pending |
| 77-02-01 | 02 | 1 | INBOX-01 | T-77-05 | — | unit | `npx vitest run tests/email-reply-to.test.ts tests/email.test.ts` | ❌ W0 | ⬜ pending |
| 77-02-02 | 02 | 1 | INBOX-01 | T-77-05 | internal replyTo unchanged | unit | `npx vitest run tests/email-reply-to.test.ts tests/email.test.ts tests/booking-changed-email.test.ts tests/email-payment-request.test.ts tests/email-log.test.ts` | ❌ W0 | ⬜ pending |
| 77-03-01 | 03 | 1 | OPS-01 | T-77-07 | no prices in templates (pre-commit) | unit + hook probe | `npx vitest run tests/chatwoot-config.test.ts` ; `sh scripts/qa/secret_gate_probe.sh` | ❌ W0 | ⬜ pending |
| 77-03-02 | 03 | 1 | OPS-01 | T-77-08 | no customer PII in templates | unit | `npx vitest run tests/chatwoot-config.test.ts` | ✅ after 03-01 | ⬜ pending |
| 77-03-03 | 03 | 1 | OPS-02 | — | — | unit | `npx vitest run tests/chatwoot-config.test.ts` | ✅ after 03-01 | ⬜ pending |
| 77-04-01 | 04 | 1 | INBOX-04 | T-77-09 | — | live lab (prod) | `python3 scripts/qa/chat_widget_probe.py --cwv-compare https://rideprestigo.com` | ❌ W0 | ⬜ pending |
| 77-04-02 | 04 | 1 | INBOX-02 | — | zero chat-host traffic pre-click | live probe (prod) | `python3 scripts/qa/chat_widget_probe.py --consent https://rideprestigo.com` | ✅ after 04-01 | ⬜ pending |
| 77-05-01 | 05 | 1 | INBOX-02 | — | — | unit + i18n check | `npx vitest run tests/chat-launcher-i18n.test.ts` ; `node scripts/i18n-translate.mjs --check` | ❌ W0 | ⬜ pending |
| 77-05-02 | 05 | 1 | INBOX-02 | T-77-10 | accurate processor disclosure | i18n freeze + render | `node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/77-chatwoot-deployment-core-channels/freeze --verify` ; `npx vitest run tests/static-pages-locale.test.tsx` | ✅ | ⬜ pending |
| 77-06-01 | 06 | 1 | INBOX-05 | T-77-12 | token redaction | unit + dry run | `npx vitest run tests/telegram-bot-profile.test.ts` ; `node infra/chatwoot/telegram/set-bot-profile.mjs --dry-run` | ❌ W0 | ⬜ pending |
| 77-06-02 | 06 | 1 | INBOX-05 | T-77-11 | new bot, webhook unset before connect | owner checkpoint | — (human-action; owner quotes `--check` output) | n/a | ⬜ pending |
| 77-06-03 | 06 | 1 | INBOX-05 | T-77-11 | Chatwoot owns the webhook | live API | `node infra/chatwoot/telegram/set-bot-profile.mjs --check` ; `npx vitest run tests/telegram-bot-profile.test.ts tests/infra-vps-isolation-guard.test.ts` | ✅ | ⬜ pending |
| 77-07-01 | 07 | 2 | OPS-01 | T-77-14 | token custody | owner checkpoint | `stat -f "%Lp" ~/.config/prestigo/chatwoot-api.env` | n/a | ⬜ pending |
| 77-07-02 | 07 | 2 | OPS-02 | T-77-14 | token never printed | unit (fake API) + live | `npx vitest run tests/chatwoot-sync.test.ts` ; `node infra/chatwoot/sync.mjs --only labels` | ❌ W0 | ⬜ pending |
| 77-07-03 | 07 | 2 | OPS-01, OPS-02, INBOX-03 | T-77-15, T-77-17 | hmac_mandatory on Website inbox | unit + live | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` ; `node infra/chatwoot/sync.mjs --dry-run` | ✅ | ⬜ pending |
| 77-08-01 | 08 | 2 | INBOX-04 | T-77-18, T-77-19 | exact-origin CSP; guard not weakened | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts tests/middleware-i18n.test.ts tests/middleware-matcher.test.ts` | ✅ | ⬜ pending |
| 77-08-02 | 08 | 2 | INBOX-03 | T-77-20 | cw_* cleared on sign-out | unit | `npx vitest run tests/auth-customer.test.ts` | ✅ | ⬜ pending |
| 77-09-01 | 09 | 3 | INBOX-06 | — | read-only | unit + live | `npx vitest run tests/chatwoot-inspect.test.ts` ; `node infra/chatwoot/inspect.mjs --status` | ❌ W0 | ⬜ pending |
| 77-09-02 | 09 | 3 | INBOX-03 | T-77-21, T-77-22 | secret never displayed; gate names | live CLI + hook probe | `vercel env ls production` (3 CHATWOOT_ names) ; `sh scripts/qa/secret_gate_probe.sh` | ✅ | ⬜ pending |
| 77-09-03 | 09 | 3 | INBOX-06 | T-77-23 | no PII in output | unit + live | `npx vitest run tests/chatwoot-inspect.test.ts` ; `node infra/chatwoot/inspect.mjs --report --since 2026-09-01T00:00:00Z` | ✅ | ⬜ pending |
| 77-10-01 | 10 | 2 | INBOX-02, INBOX-03 | T-77-24 | no third-party load before click | integration (real route + fake SDK) | `npx vitest run tests/chat-launcher.test.tsx tests/infra-vps-isolation-guard.test.ts` | ❌ W0 | ⬜ pending |
| 77-10-02 | 10 | 2 | INBOX-02 | T-77-25, T-77-26 | sanitized attributes | unit | `npx vitest run tests/chat-visit-context.test.ts tests/chat-launcher.test.tsx` | ❌ W0 | ⬜ pending |
| 77-10-03 | 10 | 2 | INBOX-02, INBOX-04 | T-77-24 | consent gate on 7 locales (local) | unit + local probe | `npx vitest run tests/chat-launcher.test.tsx …` ; `python3 scripts/qa/chat_widget_probe.py --consent http://localhost:3000 --expect-launcher` ; `--overlap` | ✅ | ⬜ pending |
| 77-11-01 | 11 | 4 | INBOX-01 | T-77-28 | mail-loop prevention | owner decision | — (checkpoint:decision) | n/a | ⬜ pending |
| 77-11-02 | 11 | 4 | INBOX-01 | T-77-30 | passwords owner-only | owner checkpoint | `node infra/chatwoot/inspect.mjs --status` | n/a | ⬜ pending |
| 77-11-03 | 11 | 4 | INBOX-01 | T-77-29 | Chatwoot-only client | live API | `node infra/chatwoot/inspect.mjs --activity --since …` ; `node infra/chatwoot/sync.mjs --dry-run` | ✅ | ⬜ pending |
| 77-12-01 | 12 | 4 | INBOX-02 | T-77-33 | owner-approved deploy | owner decision | — (checkpoint:decision) | n/a | ⬜ pending |
| 77-12-02 | 12 | 4 | INBOX-02, INBOX-04 | T-77-32 | secret absent from client bundle | build grep + live probe | `! grep -rlE … .next/static` ; `python3 scripts/qa/chat_widget_probe.py --click https://rideprestigo.com --locales en --pages /` | ✅ | ⬜ pending |
| 77-12-03 | 12 | 4 | INBOX-02, INBOX-04 | T-77-18, T-77-33 | consent + CSP + CWV on production | live probes | `--consent … --expect-launcher` ; `--click …` ; `csp_regression.py --compare` ; `--cwv-compare` ; `--overlap` | ✅ | ⬜ pending |
| 77-13-01 | 13 | 5 | OPS-02 | T-77-34 | test data isolated | live (prod widget + API) | `node infra/chatwoot/sync.mjs --dry-run` ; `node infra/chatwoot/inspect.mjs --activity --since …` | ✅ | ⬜ pending |
| 77-13-02 | 13 | 5 | INBOX-01/03/05/06, OPS-01 | — | — | owner UAT | — (human-action) | n/a | ⬜ pending |
| 77-13-03 | 13 | 5 | INBOX-03, INBOX-06 | — | identity matches Supabase id | live API | `node infra/chatwoot/inspect.mjs --contact … --expect-identifier …` ; `--report --since …` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files are created inside their own tracer/TDD tasks (RED first), not in a separate Wave 0 plan:

- [ ] `tests/chatwoot-identity.test.ts` — HMAC vector + route matrix (77-01)
- [ ] `tests/email-reply-to.test.ts` — replyTo classification table (77-02)
- [ ] `tests/chatwoot-config.test.ts` — template/config validation (77-03)
- [ ] `scripts/qa/chat_widget_probe.py` + `scripts/qa/baselines/cwv_chat_baseline.json` (77-04)
- [ ] `tests/chat-launcher-i18n.test.ts` (77-05)
- [ ] `tests/telegram-bot-profile.test.ts` (77-06)
- [ ] `tests/chatwoot-sync.test.ts` (77-07), `tests/chatwoot-inspect.test.ts` (77-09)
- [ ] `tests/chat-launcher.test.tsx`, `tests/chat-visit-context.test.ts` (77-10)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Replies from Chatwoot arrive From info@/bookings@ | INBOX-01 | needs the owner's external mailbox | 77-11 Task 2 step 5 |
| Telegram round trip + localized bot description | INBOX-05 | needs the owner's Telegram account | 77-06 Task 2 step 5, Task 3 human-check |
| Signed-in widget shows no pre-chat form | INBOX-03 | needs the owner's site account (API check follows in 77-13 Task 3) | 77-13 Task 2 step 1 |
| Reports visible in Chatwoot UI | INBOX-06 | UI confirmation by owner (API numbers checked automatically) | 77-13 Task 2 step 7 |
| Canned responses via `/` in composer | OPS-01 | composer UX in Chatwoot | 77-13 Task 2 step 4 |
| Email continuity for anonymous visitor | INBOX-02 / D-04 | needs a real mailbox and a closed tab | 77-13 Task 2 step 5 |
| Launcher visuals (320/375 px, RTL, brand) | INBOX-02 | visual QA | 77-10 Task 3 human-check |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are owner checkpoints with a stated verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tests created RED-first inside their tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 90s for code tasks
- [ ] `nyquist_compliant: true` set in frontmatter (set by validate-phase after execution)

**Approval:** pending
