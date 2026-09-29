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
| **Quick run command** | `npx vitest run tests/business-number-guard.test.ts tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts tests/whatsapp-runbook.test.ts tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts tests/chatwoot-inspect.test.ts` |
| **Number-switch set** | `npx vitest run tests/business-number-guard.test.ts tests/book-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/route-page-render.test.tsx tests/contact-form.test.tsx tests/telegram-bot-profile.test.ts tests/jsonld.test.ts tests/llms-content.test.ts tests/email.test.ts tests/chat-launcher.test.tsx` |
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

Filled in by the planner once PLAN task IDs exist. Requirement → test mapping:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| WA-04 | Refactor: all phone surfaces derive from the `lib/contact-channels.ts` constant; snapshots unchanged | unit/render | `npx vitest run tests/business-number-guard.test.ts` + number-switch set | ❌ W0 | ⬜ pending |
| WA-04 | Switch: the old number appears in no tracked file outside `.planning/`; the new number is in all 7 locales; `priceValidUntil` normalization intact | unit/render | same | ❌ W0 | ⬜ pending |
| WA-04 | i18n manifest frozen for touched units | script | `node scripts/i18n-freeze-manifest.mjs --dir <freeze dir> --verify` | ✅ tool | ⬜ pending |
| WA-02 | 8 templates × 7 locales, Meta rules, price-free and brand-safe | unit | `npx vitest run tests/whatsapp-templates.test.ts` | ❌ W0 | ⬜ pending |
| WA-02 | Graph script vs fake API: dry-run GET-only, idempotent, drift reported, never DELETE, token redacted | unit | `npx vitest run tests/whatsapp-graph.test.ts` | ❌ W0 | ⬜ pending |
| WA-01 / D-17 / D-16 | Inbox entry without secrets, `ch-whatsapp` / `wa-window-closing` labels and rules, delayed rule optional, sync idempotent | unit | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-config.test.ts` | ✅ add cases | ⬜ pending |
| WA-01 (security) | `inspect --whatsapp` prints only booleans/enums (`signature_secret_configured`, `verification_pin_stored`); probe script never prints the secret | unit | `npx vitest run tests/chatwoot-inspect.test.ts` | ✅ add cases | ⬜ pending |
| WA-03 | Runbook sections present, outside `infra/chatwoot/`, no secrets, no old-number digits; inventory row | unit | `npx vitest run tests/whatsapp-runbook.test.ts` | ❌ W0 | ⬜ pending |
| Security | Pre-commit blocks Meta tokens / pasted secrets; allows `.example` | script | `sh scripts/qa/secret_gate_probe.sh` | ✅ add probes | ⬜ pending |
| Guard | No site code path reaches the VPS or Meta | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/business-number-guard.test.ts` — consistency assertion now; the old-number-absent assertion is added by the switch plan
- [ ] `tests/whatsapp-templates.test.ts`
- [ ] `tests/whatsapp-graph.test.ts` — fake Graph API harness (model on `FakeOptions` in `tests/chatwoot-sync.test.ts`)
- [ ] `tests/whatsapp-runbook.test.ts`
- [ ] `infra/vps/env/whatsapp-meta.env.example` + probe cases in `scripts/qa/secret_gate_probe.sh`

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
