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

# Phase 78 — Validation Strategy (Dedicated Number)

> Per-phase validation contract for feedback sampling during execution. Re-seeded 2026-09-29 after the re-scope from Coexistence to a dedicated business number; the source is RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.1.1` (jsdom default; `// @vitest-environment node` for infra/guard tests) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run tests/business-number-guard.test.ts tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts tests/whatsapp-channel.test.ts tests/whatsapp-runbook.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts tests/chatwoot-inspect.test.ts` |
| **Number-switch set** | `npx vitest run tests/business-number-guard.test.ts tests/book-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/route-page-render.test.tsx tests/contact-form.test.tsx tests/telegram-bot-profile.test.ts tests/jsonld.test.ts tests/llms-content.test.ts tests/email.test.ts tests/chat-launcher.test.tsx tests/business-number-live-check.test.ts tests/static-pages-locale.test.tsx` |
| **Full suite command** | `npx vitest run` (name files explicitly — `vitest related` crashes here) |
| **Estimated runtime** | ~90 s full, ~15 s quick |

---

## Sampling Rate

- **After every task commit:** quick run command for touched files; WA-04 tasks run the number-switch set
- **After every plan wave:** `npx vitest run`, plus `sh scripts/qa/secret_gate_probe.sh` when the hook or env examples changed; `npx tsc --noEmit` baseline unchanged (8 old errors in `tests/` only); `npx eslint --quiet` on touched files
- **Before `/gsd-verify-work`:** full suite green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Filled by the planner on 2026-09-29 (16 plans, 6 waves). Task ID = `78-<plan>-<task>`. Checkpoint tasks carry no automated command; their proof is the owner reply plus the `<verification>` read Claude runs afterwards.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 78-01-01 | 01 | 1 | WA-04 | T-78-01, T-78-03 | one constant; guard A; no env/VPS host in the constants module | unit (source guard) | `npx vitest run tests/business-number-guard.test.ts tests/telegram-bot-profile.test.ts tests/chat-launcher.test.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 78-01-02 | 01 | 1 | WA-04 | T-78-02 | output byte-identical (snapshots without -u) | unit/render | `npx vitest run tests/business-number-guard.test.ts tests/contact-form.test.tsx tests/book-page-render.test.tsx tests/multi-day-page-render.test.tsx tests/route-page-render.test.tsx tests/routes-hub-render.test.tsx tests/static-pages-locale.test.tsx` | ✅ after 01-01 | ⬜ pending |
| 78-02-01 | 02 | 1 | WA-01 | T-78-04, T-78-05, T-78-06 | secret names blocked by the name gate; no PIN name | hook probe | `sh scripts/qa/secret_gate_probe.sh` | ✅ add probes | ⬜ pending |
| 78-02-02 | 02 | 1 | WA-01 | T-78-04, T-78-07 | Meta token shape blocked; site never uses the WhatsApp API | hook probe + unit | `sh scripts/qa/secret_gate_probe.sh` ; `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ add cases | ⬜ pending |
| 78-03-01 | 03 | 1 | WA-02 | T-78-08, T-78-09 | Bearer header only; redirect refused; token never in URL | unit (fake Graph) | `npx vitest run tests/whatsapp-graph.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 78-03-02 | 03 | 1 | WA-02 | T-78-10, T-78-11 | never DELETE; approved edits only with --allow-edit; rate-limit stop | unit (fake Graph) | `npx vitest run tests/whatsapp-graph.test.ts` | ✅ after 03-01 | ⬜ pending |
| 78-04-01 | 04 | 1 | WA-01 | T-78-13 | managed inbox PATCH never touches channel/provider_config | unit (fake Chatwoot) | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | ✅ add cases | ⬜ pending |
| 78-04-02 | 04 | 1 | WA-02 | T-78-14, T-78-15 | WhatsApp rules only label/team/agent actions; delay 10..43200 | unit (fake Chatwoot) | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | ✅ add cases | ⬜ pending |
| 78-04-03 | 04 | 1 | WA-01 | T-78-12 | inspect prints booleans/enums only, never provider_config | unit (fake Chatwoot) | `npx vitest run tests/chatwoot-inspect.test.ts tests/chatwoot-sync.test.ts` | ✅ add cases | ⬜ pending |
| 78-05-01 | 05 | 1 | WA-03 | T-78-16, T-78-17, T-78-18 | no secrets / former number in runbook; never-delete rule | unit (file assertions) | `npx vitest run tests/whatsapp-runbook.test.ts` ; `sh scripts/qa/secret_gate_probe.sh` | ❌ W0 (created in task) | ⬜ pending |
| 78-05-02 | 05 | 1 | WA-03 | T-78-16 | dated pricing outside infra/chatwoot | unit (file assertions) | `npx vitest run tests/whatsapp-runbook.test.ts` | ✅ after 05-01 | ⬜ pending |
| 78-06-01 | 06 | 1 | WA-01 | T-78-19 | — (owner decision) | checkpoint:decision | — | — | ⬜ pending |
| 78-06-02 | 06 | 1 | WA-01 | T-78-19, T-78-20 | disclosure accurate; translations frozen | script + render | `node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/78-whatsapp-cloud-api-channel-coexistence/freeze --verify` ; `npx vitest run tests/static-pages-locale.test.tsx tests/legal.test.ts` | ✅ tool | ⬜ pending |
| 78-07-01 | 07 | 2 | WA-04 | T-78-22 | JSON-LD from the constant; snapshots unchanged | unit/render | `npx vitest run tests/business-number-guard.test.ts tests/jsonld.test.ts tests/route-page-render.test.tsx tests/multi-day-page-render.test.tsx tests/book-page-render.test.tsx tests/routes-hub-render.test.tsx` | ✅ | ⬜ pending |
| 78-07-02 | 07 | 2 | WA-04 | T-78-21 | number only in lib/contact-channels.ts across all code | unit/render | `npx vitest run tests/business-number-guard.test.ts tests/email.test.ts tests/llms-content.test.ts tests/book-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/route-page-render.test.tsx tests/telegram-bot-profile.test.ts tests/contact-form.test.tsx tests/chat-launcher.test.tsx` | ✅ | ⬜ pending |
| 78-07-03 | 07 | 2 | WA-04 | T-78-21 | former number assembled from parts, never spelled | unit + live (prod) | `npx vitest run tests/business-number-live-check.test.ts` ; `node scripts/qa/business_number_live_check.mjs` | ❌ W0 (created in task) | ⬜ pending |
| 78-08-01 | 08 | 2 | WA-02 | T-78-23, T-78-24 | price-free, brand-safe, synthetic examples | unit + offline validate | `npx vitest run tests/whatsapp-templates.test.ts` ; `node infra/chatwoot/whatsapp-templates.mjs --validate` | ❌ W0 (created in task) | ⬜ pending |
| 78-08-02 | 08 | 2 | WA-02 | T-78-23, T-78-25 | no digits in payment copy; utility copy non-promotional | unit + offline validate | `npx vitest run tests/whatsapp-templates.test.ts` ; `node infra/chatwoot/whatsapp-templates.mjs --validate` | ✅ after 08-01 | ⬜ pending |
| 78-09-01 | 09 | 2 | WA-01 | T-78-26, T-78-29, T-78-31 | probe proves signature enforcement; message-less payload; no token on webhook requests | unit (fake Chatwoot + webhook) | `npx vitest run tests/whatsapp-channel.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 78-09-02 | 09 | 2 | WA-01 | T-78-26, T-78-27, T-78-28 | app_secret merged, rest preserved; provider_config redacted | unit (fake Chatwoot) | `npx vitest run tests/whatsapp-channel.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-inspect.test.ts` | ✅ after 09-01 | ⬜ pending |
| 78-09-03 | 09 | 2 | WA-01 | T-78-30 | PIN only at a hidden TTY prompt; never printed | unit (fake Graph) | `npx vitest run tests/whatsapp-channel.test.ts tests/whatsapp-graph.test.ts` ; `node infra/chatwoot/whatsapp-channel.mjs --register < /dev/null; test $? -eq 1` | ✅ after 09-01 | ⬜ pending |
| 78-10-01 | 10 | 3 | WA-02 | T-78-34 | synthetic driver phone example | unit + offline validate | `npx vitest run tests/whatsapp-templates.test.ts` ; `node infra/chatwoot/whatsapp-templates.mjs --validate` | ✅ | ⬜ pending |
| 78-10-02 | 10 | 3 | WA-02 | T-78-32 | — (owner decision D-10) | checkpoint:decision | — | — | ⬜ pending |
| 78-10-03 | 10 | 3 | WA-02 | T-78-32, T-78-33 | no public invoice link unless chosen; no amounts | unit + offline validate | `npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts` ; `node infra/chatwoot/whatsapp-templates.mjs --validate` | ✅ | ⬜ pending |
| 78-11-01 | 11 | 3 | WA-01 | T-78-39 | — (owner decision D-18, one-way) | checkpoint:decision | — | — | ⬜ pending |
| 78-11-02 | 11 | 3 | WA-01 | T-78-35, T-78-36, T-78-37, T-78-38 | owner-held token/PIN; dedicated app; EUR card | checkpoint:human-action | — (owner reply + `--number` read) | — | ⬜ pending |
| 78-11-03 | 11 | 3 | WA-01, WA-03 | T-78-35, T-78-39 | env file 0600; enums only | live (Graph) | `node infra/chatwoot/whatsapp-channel.mjs --number --expect-currency EUR` ; `node infra/chatwoot/whatsapp-templates.mjs --status` ; `npx vitest run tests/whatsapp-runbook.test.ts` | ✅ | ⬜ pending |
| 78-12-01 | 12 | 4 | WA-01 | T-78-43 | owner types the token into Chatwoot only | checkpoint:human-action | — (owner reply + `inspect --whatsapp`) | — | ⬜ pending |
| 78-12-02 | 12 | 4 | WA-01 | T-78-26, T-78-40 | unsigned 401 / wrong 401 / signed 200; no PIN stored | live (Chatwoot + webhook) | `node infra/chatwoot/whatsapp-channel.mjs --probe` ; `node infra/chatwoot/inspect.mjs --whatsapp --expect-connected` ; `node infra/chatwoot/sync.mjs --only inboxes,labels,automation` | ✅ | ⬜ pending |
| 78-12-03 | 12 | 4 | WA-01 | T-78-41, T-78-42 | D-06 matrix; notifications reach the owner | checkpoint:human-action | — (owner reply + `inspect --activity --limit 5`) | — | ⬜ pending |
| 78-13-01 | 13 | 4 | WA-02 | T-78-44, T-78-45 | idempotent live submission; no token in output | live (Graph) | `node infra/chatwoot/whatsapp-templates.mjs --only booking-change` | ✅ | ⬜ pending |
| 78-13-02 | 13 | 4 | WA-02 | T-78-45 | never delete; rerun create=0 | live (Graph) | `node infra/chatwoot/whatsapp-templates.mjs` ; `node infra/chatwoot/whatsapp-templates.mjs --status` | ✅ | ⬜ pending |
| 78-14-01 | 14 | 5 | WA-04 | T-78-47 | — (owner go/no-go D-21, one-way) | checkpoint:decision | — | — | ⬜ pending |
| 78-14-02 | 14 | 5 | WA-04 | T-78-46, T-78-47, T-78-49 | number verified against Meta before flip; exact replace counts; snapshots phone-only diff | unit/render + live (prod) | number-switch set (see Test Infrastructure + `tests/business-number-live-check.test.ts tests/static-pages-locale.test.tsx`) ; `node scripts/qa/business_number_live_check.mjs` | ✅ | ⬜ pending |
| 78-14-03 | 14 | 5 | WA-04 | T-78-46, T-78-48 | former number absent from every tracked file; manifest frozen | unit + script | `npx vitest run tests/business-number-guard.test.ts tests/whatsapp-runbook.test.ts` ; `node scripts/i18n-freeze-manifest.mjs --dir .planning/phases/78-whatsapp-cloud-api-channel-coexistence/freeze --verify` | ✅ | ⬜ pending |
| 78-15-01 | 15 | 5 | WA-02 | T-78-52 | rejected templates fixed in git, never deleted | live (Graph + Chatwoot) | `node infra/chatwoot/whatsapp-templates.mjs --status` ; `node infra/chatwoot/inspect.mjs --whatsapp` | ✅ | ⬜ pending |
| 78-15-02 | 15 | 5 | WA-02 | T-78-50, T-78-51, T-78-52 | test sends only to consenting recipients; delay restored | checkpoint:human-action | — (owner reply + `inspect --whatsapp`, `inspect --activity`) | — | ⬜ pending |
| 78-16-01 | 16 | 6 | WA-04 | T-78-53, T-78-54 | stored text cleaned; customer data untouched | live (Supabase + Chatwoot + prod) | `node scripts/qa/business_number_live_check.mjs` ; `npx vitest run tests/whatsapp-runbook.test.ts tests/business-number-guard.test.ts` | ✅ | ⬜ pending |
| 78-16-02 | 16 | 6 | WA-04 | T-78-55, T-78-56 | away message points only to the new number; test data deleted | checkpoint:human-action | — (owner reply) | — | ⬜ pending |
| 78-16-03 | 16 | 6 | WA-03, WA-04 | T-78-26 | final hardened state | live + full suite | `node infra/chatwoot/inspect.mjs --whatsapp --expect-connected` ; `node infra/chatwoot/whatsapp-channel.mjs --probe` ; `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/business-number-guard.test.ts` — consistency assertion A in 78-01; code-wide single source in 78-07; old-number-absent assertion B in 78-14
- [ ] `tests/whatsapp-templates.test.ts` — 78-08 (widened to all 8 keys in 78-10)
- [ ] `tests/whatsapp-graph.test.ts` — fake Graph API harness, 78-03 (model on `FakeOptions` in `tests/chatwoot-sync.test.ts`)
- [ ] `tests/whatsapp-channel.test.ts` — fake Chatwoot + webhook + Graph harness, 78-09
- [ ] `tests/whatsapp-runbook.test.ts` — 78-05
- [ ] `tests/business-number-live-check.test.ts` + `scripts/qa/business_number_live_check.mjs` — 78-07
- [ ] `infra/vps/env/whatsapp-meta.env.example` + probe cases in `scripts/qa/secret_gate_probe.sh` — 78-02

Baseline recorded at planning (2026-09-29): full suite 177 files passed, 2 skipped (3524 tests passed); tsc baseline 8 old errors in `tests/` only.

*Framework install: none (Vitest present).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SIM active; number OTP-verified and registered with the owner's PIN; app Live; token never expires | WA-01 | Owner's Meta account and SIM | Owner checklist |
| Inbox CONNECTED, `signature_secret_configured: true`, `verification_pin_stored: false` | WA-01 | Live Chatwoot | `inspect --whatsapp` |
| Webhook probes: unsigned 401, wrong signature 401, signed 200 (no conversation created) | WA-01 | Live endpoint | Probe script |
| D-06 go-live matrix from a second phone (text, reply, image/PDF both ways) | WA-01 | Live number | Second phone |
| 56 templates submitted; 4 WA-02 templates approved; real send outside the window; quick-reply reopens | WA-02 | Meta approval | Script status + live send |
| Window rule labels and clears (`delayMinutes: 10`, then restored) | D-16 | Live delayed automation | Temporary sync |
| Chatwoot mobile push + email notification; business-line calls ring the intended device | WA-01 | Devices | New message and call test |
| EUR payment method before first template send | WA-03 / D-18 | Owner billing | Business Manager |
| Personal-number away message ("Always send") points to the new number; end date recorded | WA-04 / D-23 | Owner's phone | Test message from a second phone |
| Post-deploy curl: `/llms.txt`, `/contact`, `/privacy`, route page, home JSON-LD show the new number, not the old one | WA-04 | Production | curl + grep counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
