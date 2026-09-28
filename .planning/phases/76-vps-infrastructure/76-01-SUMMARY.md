---
phase: 76-vps-infrastructure
plan: 01
subsystem: infra
tags: [vps, hostinger, vitest, pre-commit, secret-scan, ssh]

requires: []
provides:
  - "D-19(b) VPS isolation guard test (source + import-reachability, async-only allowlist)"
  - "Versioned D-15 pre-commit secret scan covering infra/vps (*.env names + SECRET_RE), proven by scripts/qa/secret_gate_probe.sh"
  - ".gitignore block for infra/vps secret env files and dumps"
  - "Claude's dedicated VPS key ~/.ssh/prestigo_vps_ed25519 (local, not in repo)"
  - "Provisioned Hostinger KVM 2 VPS (Ubuntu 24.04) reachable as root with that key"
affects: [76-02, 76-03, 76-04, 76-05, 76-06, 76-07, 76-08, 76-09, 77, 81, 82]

actuals:
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Hand-rolled recursive fs walk + reverse-import BFS for source-level isolation guards (no glob dependency)"
    - "GIT_INDEX_FILE temporary-index probe to test git hooks without touching the real index"

key-files:
  created:
    - tests/infra-vps-isolation-guard.test.ts
    - scripts/qa/secret_gate_probe.sh
  modified:
    - .husky/pre-commit
    - .gitignore

key-decisions:
  - "VPS_ASYNC_ALLOWLIST starts empty; later phases (77 widget, 81/82 outbox) add entries only with a named async mechanism"
  - "Ubuntu 24.04 LTS chosen over the hPanel default 26.04 (plan D-14, mature LTS); paid daily backups, Monarx and Docker manager declined at checkout"

patterns-established:
  - "Pattern: fail-first proof for guard tests (temporary probe file -> red -> delete -> green), never committed"

requirements-completed: [INFRA-05, INFRA-01]

coverage:
  - id: D1
    description: "D-19(b) guard: no synchronous site code path can reach chat./crm.rideprestigo.com (direct or transitive)"
    requirement: "INFRA-05"
    verification:
      - kind: unit
        ref: "npx vitest run tests/infra-vps-isolation-guard.test.ts (12/12)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-15 pre-commit secret gate blocks infra/vps *.env files and secret-shaped lines"
    verification:
      - kind: integration
        ref: "sh scripts/qa/secret_gate_probe.sh (BLOCKED/BLOCKED/ALLOWED)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner-purchased KVM 2 VPS reachable as root with Claude's dedicated key"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "ssh -i ~/.ssh/prestigo_vps_ed25519 -o BatchMode=yes root@179.198.213.201 'lsb_release -rs; nproc; grep MemTotal /proc/meminfo'"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-27
status: complete
---

# Phase 76 Plan 01: Guardrails + VPS purchase Summary

**Repo guardrails for the VPS tree are live (isolation guard test + versioned secret gate), and the owner bought a Hostinger KVM 2 / Ubuntu 24.04 VPS reachable with Claude's dedicated ed25519 key.**

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 (tracer, tdd) D-19(b) isolation guard test | `fb43de38` | 12/12 green on the real tree |
| 2 D-15 secret gate + ignore rules + SSH key | `8f460e96` | probe: env-file BLOCKED, secret-line BLOCKED, clean-example ALLOWED |
| 3 Owner buys VPS (checkpoint:human-action) | — | resolved 2026-09-27, facts below |

## Verification

- Fail-first proof (Task 1): temporary `lib/__vps_guard_probe__.ts` with a chat-subdomain URL -> run exited 1 listing the probe file and line; probe deleted, `git status --porcelain lib/` empty, rerun exit 0 (12/12).
- `git diff --quiet HEAD -- package.json` -> no dependency added.
- `git check-ignore`: `infra/vps/env/backup.env` ignored, `infra/vps/env/backup.env.example` trackable.
- `SECRET_RE=` and the widened `\.env$` ENV_FILES match are versioned in `HEAD:.husky/pre-commit`.
- Key: `~/.ssh/prestigo_vps_ed25519`, mode 600, fingerprint `SHA256:BB3YrGax/Hi59WVKtqiqIEjkQxCQE1lFIUgPbKL1LU0` (ED25519), comment `prestigo-vps-claude-2026-09-27`.

## VPS facts

| Field | Value |
|-------|-------|
| Provider / plan | Hostinger KVM 2 (2 vCPU / 8 GB RAM / 100 GB NVMe) |
| Hostname | `srv2015189.hstgr.cloud` |
| IPv4 | `179.198.213.201` |
| Data center | Germany (owner-selected location at checkout; geo-IP lookup reports Düsseldorf, DE). hPanel location label not captured — EU/GDPR requirement (D-13) satisfied either way |
| Admin email (Chatwoot + EspoCRM) | `info@rideprestigo.com` |
| OS release (`lsb_release -rs`) | `24.04` |
| `nproc` | `2` |
| `MemTotal` | `8131476 kB` (7.75 GiB — within 7.5–8.5 GiB) |
| Root disk | `/dev/sda1` 96G, 1% used |
| Timezone | Etc/UTC |
| Weekly backups (D-10) | Enabled — hPanel Snapshots & Backups shows "Current backup schedule: Weekly" (no backups yet, host just created) |
| Declined at checkout | Paid daily auto-backups, Monarx malware scanner, Docker manager, free domain |

Root SSH: key-based access verified with `BatchMode=yes`; host key accepted into `~/.ssh/known_hosts`. Password login is still enabled on the host — plan 76-02 disables it.

## Deviations

- Task 2 commit subject uses the conventional `security(76-01):` scope form rather than a bare `security:` prefix; still satisfies the CLAUDE.md security-prefix rule.
- SUMMARY authored by the orchestrator after the checkpoint (the only remaining work was the SSH verification + facts record), instead of a continuation executor.

## Issues Encountered

- One transient failed commit attempt in Task 1 (executor retried; final commit `fb43de38` verified).

## Next

Plan 76-02: bootstrap/harden the host (SSH hardening, firewall, unattended upgrades, Docker).
