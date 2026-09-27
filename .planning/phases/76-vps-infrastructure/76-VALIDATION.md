---
phase: "76"
slug: "vps-infrastructure"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-27"
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (repo guard) + live infra checks (ssh/curl/openssl/dig/restic/SaaS APIs) + Python Playwright QA scripts |
| **Config file** | `vitest.config.ts` (existing); infra checks need the `prestigo-vps` SSH alias (plan 02) |
| **Quick run command** | `npx vitest run tests/infra-vps-isolation-guard.test.ts` (repo) / `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'` (host, from plan 04 on) |
| **Full suite command** | `npx vitest run` (~90 s) + `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'` + `bash infra/vps/scripts/provision-monitors.sh --status` (from plan 06 on, keys exported) |
| **Estimated runtime** | ~5 s guard test, ~20 s smoke, ~90 s full vitest |

---

## Sampling Rate

- **After every task commit:** run the task's own `<automated>` command(s); if site code or tests changed, `npx vitest run tests/infra-vps-isolation-guard.test.ts`
- **After every plan wave:** `npx vitest run tests/infra-vps-isolation-guard.test.ts` + `smoke.sh` on the VPS (from plan 04 on)
- **Before `/gsd-verify-work`:** full vitest suite green, smoke.sh all OK, monitors `--status` all up, outage test (07) and restore drill (09) logs complete
- **Max feedback latency:** 120 seconds (except the outage test's alert-detection wait, bounded at 20 minutes)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 1 | INFRA-05 | T-76-01 | no sync site path reaches chat./crm. (incl. transitive imports) | unit (source guard) | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ❌ created by this task (tracer, TDD) | ⬜ pending |
| 76-01-02 | 01 | 1 | INFRA-05 | T-76-02, T-76-03 | staged infra/vps env files / secret lines rejected | script probe | `sh scripts/qa/secret_gate_probe.sh` | ❌ created by this task | ⬜ pending |
| 76-01-03 | 01 | 1 | INFRA-01 | — | owner buys VPS, installs Claude key | checkpoint:human-action | root SSH BatchMode check (verification block) | n/a | ⬜ pending |
| 76-02-01 | 02 | 2 | INFRA-01 | T-76-04, T-76-05 | key-only deploy user, root refused, ufw 22/80/443 | live host | `ssh prestigo-vps 'sudo sshd -T ...; sudo ufw status verbose'` | ❌ host | ⬜ pending |
| 76-02-02 | 02 | 2 | INFRA-04 | T-76-07, T-76-08 | security-only unattended upgrades, Docker blacklisted, fail2ban, swap | live host | `ssh prestigo-vps 'apt-config dump ...; unattended-upgrade --dry-run --debug ...'` | ❌ host | ⬜ pending |
| 76-03-01 | 03 | 3 | INFRA-01 | T-76-09 | owner approves exact DNS change | checkpoint:decision (blocking-human) | n/a | n/a | ⬜ pending |
| 76-03-02 | 03 | 3 | INFRA-01, INFRA-02 | T-76-09..12 | zone diff +2/-0; SMTP 250; B2 EU 200/200/204 | live API | `bash infra/vps/scripts/dns-zone-diff.sh ... \| tail -1`; `dig @ns1.dns-parking.com` | ❌ created by this task | ⬜ pending |
| 76-04-01 | 04 | 4 | INFRA-01 | T-76-13, T-76-14, T-76-18 | trusted TLS, admin before exposure, signup 404 | live HTTPS | `curl -fsS https://chat.rideprestigo.com/api`; openssl checkend; signup probe | ❌ host | ⬜ pending |
| 76-04-02 | 04 | 4 | INFRA-01 | T-76-13 | EspoCRM login page + API 401 over trusted TLS | live HTTPS | `curl ... crm.rideprestigo.com/api/v1/App/user` (expect 401) | ❌ host | ⬜ pending |
| 76-04-03 | 04 | 4 | INFRA-01, INFRA-04 | T-76-15, T-76-16 | only 22/80/443 exposed, mem_limits, exact tags | live host + port scan | `ssh prestigo-vps 'bash /opt/prestigo/scripts/smoke.sh'`; nc scan | ❌ created by this task | ⬜ pending |
| 76-05-01 | 05 | 5 | INFRA-02 | T-76-19, T-76-20, T-76-21 | encrypted single snapshot of dumps + volumes | live restic | `ssh prestigo-vps 'sudo .../backup.sh && sudo .../restic.sh snapshots ...'` | ❌ created by this task | ⬜ pending |
| 76-05-02 | 05 | 5 | INFRA-02, INFRA-04 | T-76-23 | nightly timer, retention, upgrade runbook | live systemd | `ssh prestigo-vps 'systemctl is-enabled prestigo-backup.timer; ...'` | ❌ created by this task | ⬜ pending |
| 76-05-03 | 05 | 5 | INFRA-02 | T-76-22, T-76-24 | owner custody of recovery secrets + 2FA | checkpoint:human-action | rails runner / MariaDB checks (verification block) | n/a | ⬜ pending |
| 76-06-01 | 06 | 6 | INFRA-03 | T-76-25 | SaaS accounts + Telegram connected | checkpoint:human-action | channel/contact listing (verification block) | n/a | ⬜ pending |
| 76-06-02 | 06 | 6 | INFRA-03 | T-76-25, T-76-27 | external monitors + backup dead-man up | live SaaS API | `bash infra/vps/scripts/provision-monitors.sh --status` | ❌ created by this task | ⬜ pending |
| 76-06-03 | 06 | 6 | INFRA-03, INFRA-04 | T-76-26, T-76-28 | disk/mem, KVM4, Sidekiq, EspoCRM, TLS checks | live host (dry run) + SaaS | `ssh prestigo-vps 'sudo MONITOR_DRY_RUN=1 ... monitor.sh'`; `--status` | ❌ created by this task | ⬜ pending |
| 76-07-01 | 07 | 7 | INFRA-05, INFRA-03 | T-76-29, T-76-31 | site/wizard/contact work with VPS dark; monitors detect | e2e (Playwright) + live | `python3 -c ... contact_form_e2e.json ...`; booking_e2e.json assert; smoke.sh | ❌ created by this task | ⬜ pending |
| 76-07-02 | 07 | 7 | INFRA-03, INFRA-05 | T-76-25 | alerts + contact email reach the owner | checkpoint:human-verify (blocking-human) | n/a | n/a | ⬜ pending |
| 76-07-03 | 07 | 7 | INFRA-05 | T-76-30 | E2E rows removed by strict marker with backup | checkpoint:human-action (orchestrator, Supabase MCP) | post-delete count 0 | n/a | ⬜ pending |
| 76-08-01 | 08 | 8 | INFRA-02 | T-76-33, T-76-34 | canary + read-only integrity baseline in snapshot | live host | `ssh prestigo-vps 'sudo .../drill-verify.sh --baseline ...'` | ❌ created by this task | ⬜ pending |
| 76-08-02 | 08 | 8 | INFRA-02 | T-76-35, T-76-36 | snapshot readable; rehearsal cleaned; egress gate | live host | `ssh prestigo-vps 'sudo .../restore.sh --verify-only ...'` | ❌ created by this task | ⬜ pending |
| 76-09-01 | 09 | 9 | INFRA-02 | T-76-39, T-76-40 | Hetzner token + password-manager secret | checkpoint:human-action | Hetzner GET /v1/locations 200 | n/a | ⬜ pending |
| 76-09-02 | 09 | 9 | INFRA-02 | T-76-37, T-76-38 | clean-host restore, egress locked, D-09 checks | live drill host | `ssh deploy@DRILL 'sudo .../drill-verify.sh --drill ...'`; tunnel curls | ❌ drill host | ⬜ pending |
| 76-09-03 | 09 | 9 | INFRA-02 | T-76-37 | owner logs into restored apps | checkpoint:human-verify (blocking-human) | n/a | n/a | ⬜ pending |
| 76-09-04 | 09 | 9 | INFRA-02 | T-76-37 | drill host destroyed; log dated | live API + file | `grep -A3 "Drill log" ...`; IP file removed | ✅ runbook exists (plan 08) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/infra-vps-isolation-guard.test.ts` — INFRA-05(b); written test-first as plan 01's tracer (no separate stub needed)
- [ ] `scripts/qa/secret_gate_probe.sh` — D-15 proof, plan 01
- [ ] Every other verify target (infra scripts, host state, SaaS state) is created by the task that verifies it; no framework install needed (Vitest + Python Playwright already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VPS purchase + SSH key install | INFRA-01 | payment + hPanel are owner-only (D-14) | plan 01 Task 3 |
| DNS change approval + session credentials | INFRA-01, INFRA-02 | D-20 owner confirmation; owner-held accounts | plan 03 Task 1 |
| Password-manager custody, own admin passwords, 2FA enrolment | INFRA-02 | TOTP device and password manager are the owner's | plan 05 Task 3 |
| Telegram bot handshakes for UptimeRobot/Healthchecks | INFRA-03 | /start must come from the owner's Telegram account | plan 06 Task 1 |
| Alerts and contact email actually arrive on phone/inbox | INFRA-03, INFRA-05 | only the owner's devices show delivery | plan 07 Task 2 |
| Owner login to restored apps on the drill host | INFRA-02 | proves password + 2FA secrets restore (D-09) | plan 09 Task 3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (outage alert wait bounded at 20 min)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
