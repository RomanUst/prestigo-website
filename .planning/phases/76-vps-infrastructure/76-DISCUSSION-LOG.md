# Phase 76: VPS Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 76-vps-infrastructure
**Areas discussed:** Monitoring & alerts, Backups & restore, Server & configuration, VPS mail & INFRA-05 boundary

---

## Monitoring & alerts

| Option | Description | Selected |
|--------|-------------|----------|
| External SaaS | UptimeRobot / Better Stack free tier, survives total VPS loss | ✓ |
| Uptime Kuma on VPS + external | Per-container checks on VPS + external VPS check | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Telegram + email | Instant + backup channel | ✓ |
| Telegram only | | |
| Email only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Healthchecks.io | curl ping after successful backup, alert if missing ~26h | ✓ |
| Same SaaS heartbeat | Paid on UptimeRobot | |
| You decide | | |

Monitoring depth (multi-select): app health endpoints ✓, TLS expiry ✓, disk & memory ✓, Sidekiq ✓.

| Option | Description | Selected |
|--------|-------------|----------|
| SaaS built-in Telegram integration | No code, content bot untouched | ✓ |
| Existing Prestigo bot (lib/content/telegram.ts) | | |
| New dedicated bot | | |

## Backups & restore

| Option | Description | Selected |
|--------|-------------|----------|
| Backblaze B2 | EU region, restic native, separate provider | ✓ |
| Cloudflare R2 | | |
| Hetzner Storage Box | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Local volume + consistent backup | Dump + /storage in one restic snapshot | ✓ |
| S3 storage from day one | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 7 daily / 4 weekly / 6 monthly | | ✓ |
| 30 days only | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Temporary hourly VPS | Real VPS-loss simulation | ✓ |
| Local Docker on Mac | | |
| Second stack on same VPS | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Password manager + root-only file on VPS | Drill uses password-manager copy | ✓ |
| VPS only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Free weekly Hostinger snapshot (+ manual before upgrades) | | ✓ |
| Paid daily snapshots | | |

## Server & configuration

| Option | Description | Selected |
|--------|-------------|----------|
| KVM 4 (16 GB / 4 vCPU) | Matches INFRA-01 | |
| KVM 2 (8 GB / 2 vCPU) | Cheaper, upgrade later; INFRA-01 to be amended | ✓ |
| Existing VPS | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude via SSH from session | Owner buys VPS + adds key | ✓ |
| Owner runs scripts | | |

| Option | Description | Selected |
|--------|-------------|----------|
| In repo: infra/vps/ | .env.example only, pre-commit guards | ✓ |
| Separate private repo | | |
| Server only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| App logins + 2FA + fail2ban | Public reachability needed for webhooks/widget/Vercel | ✓ |
| IP allowlist on crm. | | |

| Option | Description | Selected |
|--------|-------------|----------|
| mem_limits + swap + upgrade trigger | | ✓ |
| Monitoring only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Germany (Frankfurt) | | ✓ |
| Netherlands / Lithuania | | |
| Any EU | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exact tag in compose | | ✓ |
| Tag + digest | | |

## VPS mail & INFRA-05 boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Resend SMTP | Warm reputation, no VPS IP sending | ✓ |
| Hostinger Mail SMTP | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Split verification | Phase 76: real outage test + guard test; delivery-after-recovery in 81/82 | ✓ |
| Move INFRA-05 to Phase 81 | | |
| Guard test only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude via Hostinger DNS API | chat/crm A records only, zone snapshot first | ✓ |
| Owner manually | | |

## Claude's Discretion

- UptimeRobot vs Better Stack choice; exact health endpoints, timers, backup window, mem_limit values; runbook layout; restore-drill hourly provider.

## Deferred Ideas

- S3 attachment storage; paid daily snapshots; IP allowlist on crm.; INFRA-05 delivery half → Phases 81/82.
