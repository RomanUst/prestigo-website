# Phase 76: VPS Infrastructure - Research

**Researched:** 2026-09-27
**Domain:** Self-hosted VPS provisioning (Docker Compose, Caddy/TLS, restic/B2 backups, external monitoring, unattended OS updates) for Chatwoot + EspoCRM
**Confidence:** MEDIUM (milestone-level STACK/PITFALLS/ARCHITECTURE research is HIGH-cross-checked but not exercised against a live instance; phase-specific facts below — Hostinger region, monitoring SaaS free-tier gates, restic/Healthchecks syntax, Docker image legitimacy — were verified this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Monitoring & Alerting**
- **D-01:** Uptime monitoring runs on an **external SaaS** (UptimeRobot or Better Stack free tier), not on the VPS. No Uptime Kuma on the VPS: the research STACK.md suggested it, but that is rejected because it dies with the VPS.
- **D-02:** Alerts go to **Telegram + email**. Telegram uses the monitoring SaaS's **built-in Telegram integration**. Do not reuse the content-approval bot in `lib/content/telegram.ts`, and do not write custom bot code.
- **D-03:** The backup dead-man's switch is **Healthchecks.io**. The backup script `curl`s the ping URL only after the whole backup succeeds (it can also report `/fail` on error). A missing ping for about 26h triggers an alert through the same Telegram + email channels.
- **D-04:** Monitoring depth has four parts:
  - (a) App-level health checks: the Chatwoot Rails endpoint (e.g. `/api`) and the EspoCRM login page. These prove the apps are alive, not just Caddy.
  - (b) TLS certificate expiry, alerting about 14 days before expiry.
  - (c) Disk (>85%) and memory pressure, via an on-VPS cron script that pings a Healthchecks check (fail on threshold breach).
  - (d) Sidekiq liveness, checked on the VPS and pinged to Healthchecks. A dead Sidekiq leaves the UI up while email and messages silently stop processing.

**Backups & Restore**
- **D-05:** Offsite target is **Backblaze B2, EU region**, written with **restic** (client-side encryption). It is a separate provider from Hostinger, which protects against losing the Hostinger account.
- **D-06:** Chatwoot attachments stay on a **local Docker volume** (no S3 ActiveStorage). The nightly job writes the Postgres dump (Chatwoot), the MariaDB dump (EspoCRM), Chatwoot `/app/storage` and the EspoCRM data/upload directories into **one restic snapshot**. Files are captured immediately after the dumps, so DB and files match (Pitfall 14).
- **D-07:** Retention is **7 daily / 4 weekly / 6 monthly** (`restic forget --prune`).
- **D-08:** The restic password and B2 keys live in a root-only env file on the VPS (`chmod 600`). The owner keeps a copy in a password manager. The restore drill must use the password-manager copy, never the VPS copy, because the drill proves recovery after the VPS is lost.
- **D-09:** The restore drill runs on a **temporary hourly-billed VPS** (e.g. Hetzner Cloud or a similar hourly provider), using only the runbook, configs from git (`infra/vps/`) and B2. It is destroyed afterwards. The drill checks:
  - login to both apps
  - conversations and attachments open
  - Chatwoot `display_id` sequence is correct
  - no orphaned `contact_inbox_id` references
  - EspoCRM records and uploads are intact

  Outbound network on the drill host should be restricted so the restored Chatwoot does not start polling mailboxes or sending. The drill is documented with a date and timings.
- **D-10:** Hostinger's **free weekly snapshot** is kept as a coarse safety net. Take a manual snapshot before each upgrade per runbook. No paid daily snapshots. restic stays the primary recovery path.

**Server & Configuration**
- **D-11:** Plan is **Hostinger KVM 2 (8 GB RAM / 2 vCPU)**, an owner decision that overrides KVM 4 in INFRA-01 and the ROADMAP success criterion #1, which need updating. — **Reversibility:** reversible — in-panel upgrade to KVM 4 without migration.
- **D-12:** KVM 2 memory safeguards:
  - explicit `mem_limit` per container, so Sidekiq can't OOM-kill EspoCRM/MariaDB
  - 4 GB swap
  - low Sidekiq concurrency

  Runbook rule: upgrade to KVM 4 when RAM stays above 80% for more than a week, or when a 2nd operator is onboarded.
- **D-13:** Data center: **Germany (Frankfurt)**, EU/GDPR. Fall back to another EU location if Germany isn't offered for KVM plans.
- **D-14:** OS is Ubuntu 24.04 LTS. The owner buys the VPS (all payment steps are the owner's) and adds Claude's SSH public key. Claude then provisions over SSH from the session:
  - a non-root deploy user with sudo
  - SSH key-only login, root password login disabled
  - `ufw` allowing only 22/80/443
  - `fail2ban` on SSH
  - `unattended-upgrades` limited to security updates, with `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` blacklisted
- **D-15:** All infra config is **versioned in this repo under `infra/vps/`**: Compose files, Caddyfile, backup/monitor scripts, systemd timers or cron entries, and runbooks. Real secrets are never committed. Only `.env.example` files go into git; the real `.env` files exist only on the VPS and in the password manager, and the existing `.husky/pre-commit` secret scan enforces this. — **Reversibility:** reversible.
- **D-16:** Image versions are pinned with an **exact tag** in Compose, e.g. `chatwoot/chatwoot:v4.18.x` and `espocrm/espocrm:10.0.3`, never `latest`. Verify the current patch at deploy time. An upgrade is a git commit bumping the tag, executed via the runbook: fresh backup + snapshot → pull/up → migrations → smoke check → rollback path.
- **D-17:** Admin hardening: the apps stay publicly reachable, because Chatwoot must receive Meta/WhatsApp webhooks and serve the widget, and EspoCRM must be reachable from Vercel in Phase 81. Protection:
  - app logins with 2FA wherever the app supports it
  - Chatwoot public signup disabled (`ENABLE_ACCOUNT_SIGNUP=false`)
  - `fail2ban` on SSH
  - no IP allowlisting

**VPS Mail & INFRA-05 Boundary**
- **D-18:** Chatwoot and EspoCRM **system/notification mail** (invites, password resets, agent notifications) is sent via **Resend SMTP**. Use a dedicated, sending-only API key and a sender such as `notifications@rideprestigo.com`. Nothing is sent directly from the VPS IP, so no SPF/DKIM changes are needed for the VPS (Pitfall 18). Customer-facing replies from info@/booking@ use each mailbox's own SMTP and are Phase 77's concern.
- **D-19:** INFRA-05 verification is **split**. Phase 76 proves isolation:
  - (a) A **real outage test**: stop the VPS/containers, then on production walk the booking wizard to the Stripe payment step (no real charge), submit the contact form, and confirm the site renders and the emails arrive.
  - (b) A **guard test** in the repo asserting that no synchronous site code path (app/, lib/, middleware) calls `chat.rideprestigo.com` / `crm.rideprestigo.com`. This test is the durable regression barrier for later phases.

  The "no event lost, delivered once the VPS is back" half is verified in Phases 81/82, where the outbox exists. Mark this split in ROADMAP/REQUIREMENTS so Phase 76 verification isn't blocked on code that doesn't exist yet.
- **D-20:** DNS: Claude creates **only** the `chat` and `crm` A records pointing at the VPS IP, via the Hostinger DNS API, using a token the owner supplies for this session (never committed). Snapshot the zone (GET) before the change. Never touch apex/`www`/MX/SPF/DKIM/DMARC/autodiscover records.

### Claude's Discretion
- Choice between UptimeRobot and Better Stack, based on which free tier covers keyword/health checks, TLS-expiry alerts and a Telegram integration.
- Exact health endpoints, cron/systemd-timer layout, the backup window (night hours, Prague time), and the per-container `mem_limit` values.
- Runbook structure and file names inside `infra/vps/`.
- Hourly provider for the restore drill.

### Deferred Ideas (OUT OF SCOPE)
- Chatwoot attachments on S3-compatible storage: rejected for now in favour of a local volume plus a consistent snapshot (D-06). Revisit if the disk fills or when resizing.
- Paid daily Hostinger snapshots: not now (D-10).
- IP allowlisting for `crm.`: rejected, because it's incompatible with Vercel→EspoCRM calls in Phase 81.
- The "events delivered after the VPS returns" half of INFRA-05 moves to Phases 81/82 verification (D-19).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Owner can reach Chatwoot at `chat.rideprestigo.com` and EspoCRM at `crm.rideprestigo.com` over valid auto-renewing HTTPS (KVM 2, Docker Compose, Caddy, EU region) | Caddyfile pattern + verified Frankfurt KVM 2 availability (below); `curl`/`openssl` checks in Validation Architecture |
| INFRA-02 | Nightly encrypted offsite backup of DBs + attachments, with a successful restore drill onto a clean host | restic+B2 command syntax verified below; D-09 drill checklist; Pitfall 14 (DB/attachment timing) |
| INFRA-03 | Owner alerted on a channel independent of the VPS when Chatwoot/EspoCRM is down or backup didn't run | UptimeRobot vs Better Stack free-tier comparison (verified below); Healthchecks.io ping/Telegram setup (verified below) |
| INFRA-04 | Unattended security OS updates; pinned app versions upgraded only via documented runbook | `unattended-upgrades` Docker blacklist syntax verified below; D-16 upgrade runbook shape |
| INFRA-05 | With VPS fully offline, public site/wizard/Stripe/emails keep working (isolation half only — delivery half deferred to 81/82 per D-19) | Guard-test pattern from existing `tests/rtl-backstop.test.ts` / `tests/middleware-matcher.test.ts` (source-reading vitest assertions); real outage test as human-verify |
</phase_requirements>

## Summary

Phase 76 provisions one Hostinger VPS (KVM 2, Frankfurt, Ubuntu 24.04) that will run Chatwoot and EspoCRM as separate Docker Compose stacks behind Caddy, entirely independent of the Vercel/Supabase production site. The stack choices (Chatwoot CE v4.18.x, EspoCRM CE v10.0.3, Caddy 2.x, restic→Backblaze B2, Healthchecks.io dead-man's switches, `unattended-upgrades`) were already researched at milestone level in `.planning/research/STACK.md` and `PITFALLS.md` — this phase-level research narrows those into concrete, owner-approved choices (KVM 2 not KVM 4, external SaaS monitoring not Uptime Kuma, Resend SMTP for system mail only) and verifies the facts specific to executing Phase 76: Hostinger's Frankfurt data center does offer KVM plans; UptimeRobot's free tier includes Telegram but gates SSL/TLS monitoring behind a paid plan, while Better Stack's free tier includes TLS monitoring but its Telegram support is unconfirmed on the free tier — so the TLS-expiry check (D-04b) is better served by a fourth on-VPS cron+Healthchecks.io check (consistent with D-04c/d) than by relying on the uptime SaaS for it. The four Docker images this phase pulls (`caddy`, `chatwoot/chatwoot`, `espocrm/espocrm`, `restic/restic`) were checked against the Docker Hub registry this session and are the legitimate, high-pull-count official repositories.

The phase is infrastructure-only: no application code changes beyond one new repo-guard vitest test (D-19b) and one new `infra/vps/` directory of Compose/Caddy/script/runbook files. No npm/pip/cargo packages are installed — the Package Legitimacy Gate is therefore scoped to the four Docker images instead, all of which check out.

**Primary recommendation:** Provision Hostinger KVM 2 in Frankfurt with Ubuntu 24.04 → SSH-harden (deploy user, key-only, ufw 22/80/443, fail2ban) → deploy Chatwoot + EspoCRM as separate pinned-tag Compose stacks behind one Caddy stack → wire restic→B2 nightly backups with a 4th Healthchecks.io check for TLS expiry alongside the D-04c/d checks → set up UptimeRobot (not Better Stack) for external app-health + Telegram alerting → write the D-19b guard test and run the D-19a real-outage test before closing the phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TLS termination for `chat.*`/`crm.*` | VPS / Reverse Proxy (Caddy) | — | Caddy owns ACME issuance/renewal on the VPS itself; Vercel's edge is unrelated to these subdomains |
| Chatwoot/EspoCRM app runtime | VPS / Container | Database/Storage (co-located Postgres/MariaDB containers) | Both apps and their DBs run in Docker Compose on the same VPS per the locked stack — no managed DB service in scope |
| Uptime/health monitoring | External SaaS (UptimeRobot) | VPS (cron scripts pinging Healthchecks for the checks a SaaS can't see inside the box) | D-01 explicitly requires the primary signal to survive total VPS loss; only checks that need in-box visibility (disk/mem/Sidekiq) run on the VPS itself |
| Backup storage | External SaaS (Backblaze B2) | VPS (restic client + local dump staging) | D-05: separate provider from Hostinger so a lost Hostinger account doesn't also lose backups |
| DNS for `chat`/`crm` | External SaaS (Hostinger DNS API) | — | DNS is managed centrally at Hostinger regardless of where the site/VPS are hosted; this phase touches only two new A records |
| Public site / booking / payment / email | Vercel + Supabase + Stripe + Resend (unchanged) | — | D-19 constraint: this tier must have zero runtime dependency on the VPS tier — enforced structurally, not just by intent |
| OS security patching | VPS / OS (unattended-upgrades) | — | Runs entirely on-box; nothing else in the stack can patch the kernel/OS packages |

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|---------------|
| Hostinger VPS **KVM 2** | 2 vCPU / 8 GB RAM / 100 GB NVMe | Host for both app stacks | Owner-locked (D-11), overriding milestone STACK.md's KVM 4 default; workable per STACK.md's own "workable floor for 1 operator" fallback note, with D-12's `mem_limit`/swap safeguards compensating for the smaller RAM budget |
| Ubuntu 24.04 LTS | — | Base OS | D-14 locked; longest LTS support window from provisioning today; matches Hostinger's standard image |
| Docker Engine + Compose plugin (v2) | latest stable | Container runtime | Both Chatwoot's and EspoCRM's official deployment paths are Compose-first (per milestone STACK.md) |
| Caddy | 2.x | Reverse proxy + auto-TLS for the two subdomains | `[VERIFIED: Docker Hub API]` official `library/caddy` image, 732M+ pulls — see Package Legitimacy Audit |
| Chatwoot CE | `v4.18.x` (verify exact patch at deploy time) | Omnichannel inbox app (out of scope for channel config in this phase — this phase only proves the container runs and is reachable) | `[CITED: developers.chatwoot.com]` per milestone STACK.md; `[VERIFIED: Docker Hub API]` `chatwoot/chatwoot` image exists, 10.5M+ pulls |
| EspoCRM CE | `10.0.3` (verify exact patch at deploy time) | CRM app (entity/pipeline config is Phase 80's scope — this phase only proves the container runs and is reachable) | `[CITED: espocrm.com/download]` per milestone STACK.md; `[VERIFIED: Docker Hub API]` `espocrm/espocrm` image exists, 2.6M+ pulls |
| restic | latest stable | Encrypted, deduplicated backup client | `[VERIFIED: Docker Hub API]` `restic/restic` image exists, 47M+ pulls — used either as a container or installed as a static binary on the host (planner's discretion) |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| Backblaze B2 (EU region bucket) | Offsite restic repository | D-05 locked — separate provider from Hostinger |
| Healthchecks.io | Dead-man's-switch pings for: nightly backup (D-03), disk/memory (D-04c), Sidekiq liveness (D-04d), and (recommended addition below) TLS cert expiry (D-04b) | Free tier supports 20 checks, native Telegram integration, and both "simple" ping and cron-schedule modes — `[CITED: healthchecks.io/docs]` |
| UptimeRobot (recommended over Better Stack — see below) | External app-level health checks (D-04a) + Telegram/email alerting (D-01/D-02) | Free tier: 50 monitors, 5-min interval, native Telegram integration — `[VERIFIED: uptimerobot.com/pricing]` |
| `fail2ban` | Bans repeated failed SSH auth attempts | D-14 locked, standard SSH hardening |
| `ufw` | Host firewall, 22/80/443 only | D-14 locked |
| `unattended-upgrades` | Automatic security-only OS patching, Docker packages blacklisted | D-14/INFRA-04 locked |
| Hetzner Cloud (or similar hourly VPS provider) | Temporary host for the D-09 restore drill | Hourly billing means the drill costs cents and the host is destroyed immediately after — Claude's discretion per CONTEXT.md |
| Resend SMTP (existing) | Chatwoot/EspoCRM **system/notification** mail only (D-18) | Reuses the site's already-warmed sending reputation; avoids any VPS-IP SPF/DKIM work (Pitfall 18) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| UptimeRobot | Better Stack | Better Stack's free tier includes SSL/TLS-expiry checks natively (UptimeRobot gates that behind a paid plan) `[VERIFIED: betterstack.com/uptime]`, but its free-tier Telegram support could not be confirmed this session (its own integrations page for Telegram 404'd; official marketing copy lists Slack/Teams/SMS/push/email only) `[ASSUMED — see Open Questions]`. Since D-02 locks Telegram as a required channel and UptimeRobot's Telegram support on free tier is `[VERIFIED: uptimerobot.com/pricing]`, UptimeRobot is the safer default; the TLS-expiry gap it leaves is closed by folding TLS-expiry into the existing Healthchecks.io on-VPS-cron pattern (D-04c/d) instead of relying on the uptime SaaS for it. |
| A 4th on-VPS cron+Healthchecks check for TLS expiry | Rely on UptimeRobot's/Better Stack's own SSL-monitoring feature | The SaaS feature is simpler if using Better Stack, but re-introduces the free-tier/Telegram trade-off above; the cron approach is one more small script but keeps every monitoring signal on one paid-tier-independent, already-justified pattern (Healthchecks.io, already used for D-04c/d) |
| KVM 2 | KVM 4 | KVM 4 (16 GB/4 vCPU) is milestone STACK.md's default recommendation and removes all headroom concern, but D-11 is an explicit owner override with a documented upgrade trigger (RAM >80% for a week, or 2nd operator onboarded) — plan for the resize path, don't second-guess the decision |
| Docker-volume attachment storage | S3-compatible object storage for Chatwoot ActiveStorage | Decouples attachment durability from the VPS disk and simplifies backup timing (Pitfall 14), but D-06 explicitly rejects this for now in favor of one consistent restic snapshot; revisit if disk fills |

**Installation (illustrative shape — full scripts belong in `infra/vps/`):**
```bash
# On the VPS (Ubuntu 24.04), after SSH hardening:
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin unattended-upgrades fail2ban ufw

# Chatwoot — official repo's production compose, pinned tag
git clone https://github.com/chatwoot/chatwoot.git -b v4.18.x   # verify exact patch tag first
# EspoCRM — official espocrm/espocrm-docker compose, pinned tag
# Caddy — one small compose stack, Caddyfile with two site blocks (see Code Examples)
```

**Version verification:** Run before finalizing the Compose files:
```bash
# Confirm latest Chatwoot/EspoCRM stable tags at deploy time (image registries, not npm/pip/cargo):
curl -s https://hub.docker.com/v2/repositories/chatwoot/chatwoot/tags/?page_size=5 | python3 -m json.tool
curl -s https://hub.docker.com/v2/repositories/espocrm/espocrm/tags/?page_size=5 | python3 -m json.tool
```
Both `chatwoot/chatwoot` and `espocrm/espocrm` were confirmed to exist as the official namespaced repositories on Docker Hub this session (`[VERIFIED: Docker Hub API]`, queried 2026-09-27) — re-run the tag query above at actual deploy time since exact patch versions drift.

## Package Legitimacy Audit

This phase installs no npm/pip/cargo packages (no `package.json` changes). The equivalent supply-chain surface is the four Docker images pulled onto the VPS. Verified against the Docker Hub Registry API this session (`[VERIFIED: Docker Hub API]`):

| Image | Registry | Namespace match | Pull Count | Verdict | Disposition |
|-------|----------|------------------|------------|---------|-------------|
| `caddy` | Docker Hub | `library/caddy` (official Docker Library) | 732,296,040 | OK | Approved |
| `chatwoot/chatwoot` | Docker Hub | `chatwoot/chatwoot` (matches project's official GitHub org) | 10,582,962 | OK | Approved |
| `espocrm/espocrm` | Docker Hub | `espocrm/espocrm` (matches project's official GitHub org) | 2,673,552 | OK | Approved |
| `restic/restic` | Docker Hub | `restic/restic` (matches project's official GitHub org) | 47,241,745 | OK | Approved |

**Images removed due to SLOP verdict:** none.
**Images flagged as suspicious (SUS):** none.

*If the planner introduces any Node.js helper script under `infra/vps/` that needs an npm dependency (e.g. a Healthchecks/UptimeRobot API client), run the standard `npm view <pkg> version` + package-legitimacy check before adding it — none was needed for this research, since every SaaS interaction in this phase is a plain `curl`.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────── Hostinger VPS (KVM 2, Frankfurt, Ubuntu 24.04) ───────────────┐
│                                                                                │
│   Internet :80/:443 ──► ufw (22/80/443 only) ──► Caddy (auto-TLS)             │
│                                  │                                            │
│                    ┌─────────────┴─────────────┐                             │
│                    ▼                             ▼                            │
│           chat.rideprestigo.com          crm.rideprestigo.com                 │
│                    │                             │                            │
│           Chatwoot rails+sidekiq          EspoCRM (PHP-FPM+Apache)            │
│           Postgres 16 (pgvector)          MariaDB 10.3+                       │
│           Redis 7                         + cron/daemon container             │
│                    │                             │                            │
│                    └─────────────┬───────────────┘                            │
│                                  ▼                                            │
│                     nightly cron: pg_dump + mysqldump                         │
│                     + Chatwoot /app/storage + EspoCRM uploads                  │
│                     → restic snapshot (client-side encrypted)                 │
│                                  │                                            │
│                                  ▼                                            │
│                     curl Healthchecks.io ping (success/fail)                  │
│                                                                                │
│   on-VPS cron checks (disk/mem/Sidekiq/TLS-expiry) → curl Healthchecks.io      │
│                                                                                │
│   SSH :22 ← fail2ban, key-only, non-root deploy user                          │
│   unattended-upgrades (security repo only, docker-ce* blacklisted)            │
└────────────────────────────────────────────────────────────────────────────────┘
                                  │                          │
                                  ▼                          ▼
                     Backblaze B2 (EU bucket,         UptimeRobot (external,
                     restic repository)               polls chat./crm. + TLS,
                                                       Telegram + email alerts)

┌─────────────── Vercel + Supabase + Stripe + Resend (UNCHANGED) ──────────────┐
│  Public site, booking wizard, payment, transactional email — zero runtime     │
│  dependency on the VPS block above. Proven by:                                │
│    (a) real outage test — stop VPS, walk wizard to Stripe step, submit form   │
│    (b) repo guard test — no app/lib/middleware code calls chat./crm.*          │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
infra/vps/
├── README.md                       # what this directory is, how to re-provision
├── docker-compose.chatwoot.yml     # pinned tag, mem_limit per D-12
├── docker-compose.espocrm.yml      # pinned tag, mem_limit per D-12
├── docker-compose.caddy.yml        # reverse proxy stack
├── Caddyfile                       # two site blocks (chat./crm.)
├── .env.example                    # placeholders only — real .env lives on VPS + password manager
├── scripts/
│   ├── backup.sh                   # pg_dump + mysqldump + storage dirs → restic → B2 → healthchecks ping
│   ├── check-disk-mem.sh           # D-04c → healthchecks ping
│   ├── check-sidekiq.sh            # D-04d → healthchecks ping
│   ├── check-tls-expiry.sh         # D-04b → healthchecks ping (recommended 4th check)
│   └── bootstrap.sh                # ufw/fail2ban/unattended-upgrades/docker install, idempotent
├── systemd/  (or cron/)
│   └── *.timer / *.service (or crontab entries)
└── runbooks/
    ├── provisioning.md             # first-time VPS setup, DNS, SSH hardening
    ├── upgrade.md                  # D-16: backup → snapshot → pull/up → migrate → smoke check → rollback
    └── restore-drill.md            # D-09 procedure + dated drill log

tests/
└── infra-vps-isolation-guard.test.ts   # D-19(b) — new, name is planner's discretion
```

### Pattern 1: Separate Compose stacks per app, one shared Caddy stack

**What:** Chatwoot and EspoCRM each get their own `docker-compose.*.yml` (own network, own DB container), not one giant compose file. Caddy is a third, thin stack that reverse-proxies into both via Docker's shared/external network.
**When to use:** Exactly this phase's shape — two independent apps, static subdomains, no plan to add more services soon.
**Example (Caddyfile, illustrative):**
```
# infra/vps/Caddyfile — Source: milestone STACK.md pattern, verified shape matches Caddy 2.x docs
chat.rideprestigo.com {
    reverse_proxy chatwoot-rails:3000
}
crm.rideprestigo.com {
    reverse_proxy espocrm:8080
}
```

### Pattern 2: restic backup script — dumps + storage in one snapshot, ping-only-on-success

**What:** A single script, run nightly via cron/systemd-timer, that (1) `pg_dump`s Chatwoot's Postgres, (2) `mysqldump`s EspoCRM's MariaDB, (3) copies both dumps plus Chatwoot's `/app/storage` and EspoCRM's data/upload directories into one restic snapshot, (4) prunes per D-07, (5) pings Healthchecks.io only if every prior step succeeded.
**When to use:** The nightly backup job (D-06).
**Example (retention + ping, verified command syntax):**
```bash
# Source: restic official docs pattern, cross-checked against 3+ 2026 self-hoster guides this session
export RESTIC_REPOSITORY="b2:prestigo-vps-backup:chatwoot-espocrm"
export RESTIC_PASSWORD_FILE=/root/.restic-password   # root-only, chmod 600, per D-08
export B2_ACCOUNT_ID="..."
export B2_ACCOUNT_KEY="..."

restic backup /var/backups/dumps /var/lib/docker/volumes/chatwoot_storage /var/lib/docker/volumes/espocrm_uploads \
  --tag nightly \
  && restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune \
  && curl -fsS -m 10 --retry 5 https://hc-ping.com/<healthchecks-uuid> \
  || curl -fsS -m 10 --retry 5 https://hc-ping.com/<healthchecks-uuid>/fail
```
`--keep-daily 7 --keep-weekly 4 --keep-monthly 6` is the exact retention shape D-07 locks (verified this session against restic's documented `forget` flag semantics).

### Pattern 3: On-VPS cron checks pinging Healthchecks.io (disk/mem/Sidekiq/TLS)

**What:** Four small, single-purpose scripts, each run on a schedule, each `curl`ing its own Healthchecks.io check URL only when the local condition is healthy (or explicitly hitting `/fail` when it isn't). Healthchecks.io's own Telegram integration (bot added to a channel or DM, `[CITED: healthchecks.io/integrations/telegram]`) is the alert path for all four — reusing D-03's channel rather than inventing a second one.
**When to use:** Any check that needs to read state *inside* the VPS (disk %, memory, whether the Sidekiq process is actually alive, whether the local TLS cert file's expiry is within 14 days) — the class of check an external SaaS cannot see.
**Example (TLS-expiry cron, recommended 4th check closing D-04b without depending on a paid SaaS tier):**
```bash
#!/usr/bin/env bash
# infra/vps/scripts/check-tls-expiry.sh — Source: openssl x509 -checkend semantics (standard, well-documented)
THRESHOLD_SECONDS=$((14 * 24 * 3600))  # 14 days, per D-04b
for domain in chat.rideprestigo.com crm.rideprestigo.com; do
  if ! echo | openssl s_client -connect "${domain}:443" -servername "${domain}" 2>/dev/null \
      | openssl x509 -noout -checkend "${THRESHOLD_SECONDS}"; then
    curl -fsS -m 10 https://hc-ping.com/<tls-check-uuid>/fail
    exit 1
  fi
done
curl -fsS -m 10 https://hc-ping.com/<tls-check-uuid>
```

### Pattern 4: Repo guard test for D-19(b) — source-reading vitest, no browser

**What:** A plain `vitest` test file that `fs.readFileSync`s every file under `app/`, `lib/`, and `middleware.ts` and asserts none contains the literal strings `chat.rideprestigo.com` or `crm.rideprestigo.com` in a synchronous `fetch`/`await`-reachable call. This mirrors the exact pattern already used in this repo for `tests/rtl-backstop.test.ts` (source-level regex assertions, deliberately not a live render) and `tests/middleware-matcher.test.ts`.
**When to use:** D-19(b) — the durable regression barrier that later phases' `lib/chatwoot-client.ts` / `lib/espocrm-client.ts` calls must never leak into a synchronous request path.
**Example (illustrative — exact scope/exclusions are the planner's call):**
```typescript
// tests/infra-vps-isolation-guard.test.ts — Source: pattern verified against
// tests/rtl-backstop.test.ts (read this session, 2026-09-27) which uses the
// identical fs.readFileSync + describe/it/expect shape for source-level backstops.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { globSync } from 'glob' // or a hand-rolled recursive walk — planner's discretion

const FORBIDDEN = /chat\.rideprestigo\.com|crm\.rideprestigo\.com/

describe('INFRA-05(b) guard — no synchronous site code calls the VPS', () => {
  const files = [
    ...globSync('app/**/*.{ts,tsx}', { ignore: ['app/embed/**'] }), // app/embed/ is Phase 84's Dashboard App, not yet created
    ...globSync('lib/**/*.ts'),
    'middleware.ts',
  ]

  it.each(files)('%s does not reference the VPS subdomains', (file) => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8')
    expect(src).not.toMatch(FORBIDDEN)
  })
})
```
Note: `glob` is not currently a dependency (`package.json` shows no `glob` entry) — the planner should either add it (run the Package Legitimacy Gate first) or hand-roll a `fs.readdirSync` recursive walk to avoid a new dependency for one test file. This is flagged as an open question below, not a locked recommendation.

### Anti-Patterns to Avoid
- **Running Uptime Kuma (or any monitor) on the VPS as the primary alert source:** explicitly rejected by D-01 — it dies with the outage it's supposed to report.
- **Relying on the monitoring SaaS's own SSL-check feature for D-04b if using UptimeRobot:** that feature is paid-tier-only on UptimeRobot (`[VERIFIED: uptimerobot.com/pricing]`) — use the on-VPS cron+Healthchecks pattern instead (Pattern 3).
- **Storing the restic password only on the VPS:** D-08 requires the password-manager copy be the one used in the restore drill, proving recovery doesn't depend on the lost VPS.
- **Touching any DNS record besides `chat`/`crm`:** D-20 — apex/`www`/mail records caused a real SSL outage before (per project memory); snapshot the zone via GET before any PUT.
- **Auto-upgrading Docker Engine via `unattended-upgrades`:** blacklist `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` explicitly — an unattended Docker bump can change container runtime behavior under running containers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dead-man's-switch / missed-cron detection | A custom "did the backup run" checker polling a timestamp table | Healthchecks.io ping API (`curl` on success, `/fail` on error) | Purpose-built for exactly this, free tier covers 20 checks, has its own Telegram integration `[CITED: healthchecks.io]` |
| External uptime monitoring | A custom polling script on a second cheap VPS | UptimeRobot free tier | 50 monitors / 5-min interval / native Telegram, zero infrastructure to maintain, and — critically — must NOT live on the VPS being monitored (D-01) |
| TLS cert renewal | Manual certbot + cron | Caddy's built-in automatic HTTPS | Caddy issues/renews Let's Encrypt certs with ~2 lines of Caddyfile per site; certbot needs hand-wired renewal timers for the same result |
| Backup encryption + dedup + retention | A custom tar+gpg+rsync pipeline | restic | Client-side encryption, native B2 backend, and `forget --prune` retention policies are exactly D-07's shape, already battle-tested |
| SSH brute-force protection | A custom log-watching ban script | `fail2ban` | Standard, well-maintained, exactly this use case |

**Key insight:** Every piece of this phase is a well-worn self-hosting pattern (Caddy, restic+B2, fail2ban, unattended-upgrades, Healthchecks.io) — the only genuinely novel piece is the D-19(b) repo guard test, which reuses an existing in-repo pattern rather than inventing one.

## Common Pitfalls

### Pitfall 1: VPS becomes a silent single point of failure for support visibility (milestone Pitfall 13)
**What goes wrong:** The public site stays up, but nobody notices Chatwoot/EspoCRM are down for hours because no alert fires, or the alert channel itself depends on the VPS.
**Why it happens:** "The site keeps working" is treated as "we're safe" — a helpdesk going dark is still a business risk.
**How to avoid:** D-01/D-02 already force the alert path off the VPS (external SaaS + Telegram/email). Verify this explicitly during the phase's own UAT: stop the containers, confirm the alert actually arrives on the phone, not just that the monitor's dashboard shows red.
**Warning signs:** No alert fires during the real outage test (D-19a) — treat this as a phase-blocking failure, not a nice-to-have.

### Pitfall 2: Backup/attachment timing mismatch produces an unrestorable snapshot (milestone Pitfall 14)
**What goes wrong:** DB dump and attachment-volume copy happen at different times; a restore has conversations referencing files that 404.
**How to avoid:** D-06 already locks "one restic snapshot, files captured immediately after the dumps." The restore drill (D-09) must explicitly check for orphaned `contact_inbox_id` references and correct `display_id` sequencing — not just "the app loads."
**Warning signs:** Restore "succeeds" but the UI throws 500s or shows broken image links.

### Pitfall 3: KVM 2's smaller RAM budget lets Sidekiq starve EspoCRM/MariaDB under real load
**What goes wrong:** Without per-container memory limits, a Sidekiq spike (WhatsApp/email burst) can OOM-kill EspoCRM or MariaDB, since KVM 2 has half of KVM 4's RAM headroom and this phase deploys before any real channel traffic exists to validate sizing.
**Why it happens:** Milestone STACK.md's own sizing caveat: "2 vCPU will contend when Postgres, MySQL, PHP-FPM and Sidekiq all wake up at once" on the smaller tier.
**How to avoid:** D-12's explicit `mem_limit` per container + 4 GB swap + low Sidekiq concurrency are not optional hardening — they are the load-bearing mitigation for the KVM 2 override. Watch `free -h` after deploying and set the runbook's ">80% for a week → upgrade to KVM 4" trigger as a real monitored threshold (D-04c's disk/memory check), not just documentation.
**Warning signs:** OOM-killer entries in `dmesg`/`journalctl`; MariaDB or Postgres container restarts unexpectedly.

### Pitfall 4: Deleting/recreating a Chatwoot inbox during setup destroys history with no confirmation proportional to the blast radius (milestone Pitfall 15)
**What goes wrong:** Not directly this phase's scope (no inboxes exist yet), but the infrastructure-level backup discipline this phase establishes (D-06/D-09) is the only safety net for that later risk.
**How to avoid:** Make sure the backup/restore pipeline built in this phase is fully working and drilled *before* Phase 77 starts creating real inboxes — the runbook rule "never delete an inbox without a fresh backup" only has teeth if backups are proven to restore.
**Phase to address:** This phase must finish with a proven restore drill before Phase 77 begins.

### Pitfall 5: Outbound VPS mail lands in spam because SPF/DKIM aren't configured for a new sending IP (milestone Pitfall 18)
**What goes wrong:** Chatwoot/EspoCRM system notification mail sent directly from the VPS's cold IP gets spam-filtered or rejected.
**How to avoid:** D-18 already routes system mail through Resend SMTP (existing, already-warmed reputation, already-aligned SPF/DKIM) — this phase should NOT configure any direct-from-VPS SMTP sending path, and should NOT touch the domain's SPF/DKIM/DMARC records (also covered by D-20's DNS scope limit).
**Warning signs:** Any compose `.env` referencing a VPS-local Postfix/sendmail or a raw SMTP relay other than Resend is a red flag — the planner should not introduce one.

### Pitfall 6: Hostinger DNS zone edit accidentally touches or drops an unrelated record (repo-specific precedent)
**What goes wrong:** A PUT to the Hostinger DNS API zone endpoint that doesn't include every existing record can silently drop records the request omitted, since the documented pattern is "overwrite" semantics per name+type.
**Why it happens:** This exact class of incident already happened on this project — a leftover Hostinger A/AAAA record coexisting with the Vercel apex A record caused an `ERR_SSL_PROTOCOL_ERROR` production outage (`[VERIFIED: ~/.claude/.../memory/project_dns_setup.md]`, read this session — this file documents "an `ERR_SSL_PROTOCOL_ERROR` on the apex was caused by leftover Hostinger records... Fix = remove all non-Vercel A/AAAA from apex").
**How to avoid:** D-20 already requires a GET zone snapshot before any PUT and restricts the change to only `chat`/`crm` A records. Diff the pre/post zone snapshot as an explicit verification step; never touch apex/`www`/MX/SPF/DKIM/DMARC/autodiscover.
**Warning signs:** Any script that constructs the PUT body from scratch rather than from the GET response with two records appended.

## Code Examples

### unattended-upgrades Docker package blacklist
```
// /etc/apt/apt.conf.d/50unattended-upgrades — Source: verified this session against
// LinuxCapable/OneUptime 2026 Ubuntu 24.04 guides (cross-checked, standard syntax)
Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "docker-compose-plugin";
};
```
Test before trusting it: `unattended-upgrade --dry-run --debug` — confirm the blacklisted packages are skipped.

### Hostinger DNS API — add chat/crm A records (D-20)
```bash
# Source: ~/.claude/.../memory/project_dns_setup.md (read this session) — documented,
# previously-used pattern for this exact project's DNS provider.
# 1. Snapshot first (never skip)
curl -s -H "Authorization: Bearer $HOSTINGER_TOKEN" \
  https://developers.hostinger.com/api/dns/v1/zones/rideprestigo.com > zone-snapshot-$(date +%F).json

# 2. Upsert only the two new records (PUT is overwrite-per-name+type, not additive —
#    confirm from the snapshot that no existing chat/crm record already exists with a
#    different type before upserting)
curl -s -X PUT -H "Authorization: Bearer $HOSTINGER_TOKEN" -H "Content-Type: application/json" \
  https://developers.hostinger.com/api/dns/v1/zones/rideprestigo.com \
  -d '{"overwrite": true, "zone": [
        {"name": "chat", "type": "A", "records": [{"content": "<VPS_IP>"}], "ttl": 3600},
        {"name": "crm",  "type": "A", "records": [{"content": "<VPS_IP>"}], "ttl": 3600}
      ]}'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| WhatsApp/Meta hard-number migration | Coexistence onboarding | Rolled out May 6, 2025 (per milestone PITFALLS.md) | Not this phase's concern directly, but the VPS/Chatwoot infra this phase builds is the prerequisite for Phase 78's Coexistence flow — don't let the VPS setup assume a "migration" mental model anywhere in the runbooks |
| Conversation-based WhatsApp pricing | Per-message pricing, with service messages becoming billable Oct 1 2026 | Changed twice 2025–2026 (per milestone PITFALLS.md) | Not this phase's cost model (no WhatsApp channel configured yet), but worth a one-line note in the runbook so Phase 78 doesn't inherit stale assumptions |

**Deprecated/outdated:** Nothing in this phase's own stack (Caddy, restic, Healthchecks.io, fail2ban, unattended-upgrades) has a newer-generation replacement pattern as of this research.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Better Stack's free tier does not include Telegram notifications (its dedicated Telegram integrations doc page 404'd this session; official marketing copy lists only Slack/Teams/SMS/push/email) | Standard Stack / Alternatives Considered | If Better Stack does support Telegram on free tier via an unlisted webhook-based integration, the UptimeRobot-vs-Better-Stack tradeoff shifts — Better Stack would then win on both TLS-expiry AND Telegram, simplifying D-04b to "just use the SaaS" instead of a 4th cron+Healthchecks check |
| A2 | Chatwoot `v4.18.x` and EspoCRM `10.0.3` are still the latest stable tags at actual deploy time | Standard Stack | These were milestone-level findings from the same day (2026-09-27); tags can move in the days between research and execution — the plan must re-run the tag-verification command before writing the exact pin into Compose |
| A3 | `glob` (or an equivalent recursive-file-walk helper) is needed for the D-19(b) guard test, and is not currently a dependency | Architecture Patterns, Pattern 4 | If the planner instead hand-rolls `fs.readdirSync` recursion (matching the zero-new-dependency style of `tests/rtl-backstop.test.ts`, which reads specific known files rather than globbing), no new dependency is needed at all — this is genuinely the planner's call, not a blocking assumption |
| A4 | Healthchecks.io's free tier is sufficient for 4 checks (backup + disk/mem + Sidekiq + TLS-expiry) | Standard Stack, Supporting | Healthchecks.io's free tier historically supports up to 20 checks — if this changed, 4 checks would still comfortably fit, but the exact current free-tier check count was not independently re-verified this session beyond the docs search |
| A5 | Hostinger's Frankfurt data center offers the KVM 2 plan specifically (not just KVM plans generally) | Standard Stack, Server & Configuration | Verified via WebFetch of Hostinger's own support/blog pages this session, but Hostinger's per-plan-per-region availability has been known to vary by promotion/inventory — reconfirm on the live checkout page immediately before purchase (D-13 already anticipates a fallback EU location if Germany isn't offered) |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **UptimeRobot vs Better Stack for D-01/D-02/D-04b**
   - What we know: UptimeRobot free tier confirmed to include Telegram (50 monitors, 5-min interval) but gates SSL/TLS monitoring behind a paid plan `[VERIFIED: uptimerobot.com/pricing]`. Better Stack free tier confirmed to include SSL/TLS/domain-expiry monitoring (10 monitors, 3-min interval) `[VERIFIED: betterstack.com/uptime]`, but its free-tier Telegram support could not be confirmed this session.
   - What's unclear: Whether Better Stack does support Telegram on its free tier via some integration path not surfaced by the pages fetched this session.
   - Recommendation: Default to **UptimeRobot** (satisfies the locked D-02 Telegram requirement with certainty) and close the TLS-expiry gap with the on-VPS cron+Healthchecks pattern (Pattern 3) rather than depending on the SaaS's own SSL feature. If the planner or owner wants to double-check Better Stack's Telegram support directly against its live dashboard (a signup is needed to see the full integrations list), that would resolve this cleanly — otherwise proceed with the recommendation above.

2. **Exact `mem_limit` values per container on KVM 2 (8 GB total)**
   - What we know: D-12 locks the *mechanism* (explicit `mem_limit` + 4 GB swap + low Sidekiq concurrency) but leaves exact numbers to Claude's discretion.
   - What's unclear: The right split across Chatwoot rails / Sidekiq / Postgres / Redis / EspoCRM / MariaDB / Caddy on an 8 GB host, before any real traffic exists to profile against.
   - Recommendation: Start conservative (e.g., roughly Chatwoot rails 1.5 GB, Sidekiq 1 GB, Postgres 1.5 GB, Redis 256 MB, EspoCRM PHP-FPM 1 GB, MariaDB 1 GB, Caddy 128 MB, leaving ~2 GB host/OS/swap headroom) and treat these as starting points to be tuned against the D-04c disk/memory monitoring data in the first weeks, per the runbook's documented upgrade trigger.

3. **Whether the D-19(b) guard test needs a new `glob` dependency**
   - See Assumption A3 — resolve during planning by checking whether a hand-rolled `fs.readdirSync` walk (zero new dependency) is acceptable, matching the existing test-file style in this repo.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ssh` (local, for provisioning) | D-14 SSH hardening | ✓ | OpenSSH (local machine) | — |
| `curl` (local) | DNS API calls, health checks | ✓ | 8.7.1 | — |
| `openssl` (local) | TLS verification checks | ✓ | 3.6.3 | — |
| `docker` (on VPS only, not local) | All app containers | ✗ locally / not yet on VPS | — | Installed via `bootstrap.sh` during provisioning — not a local dependency |
| `restic` (on VPS only, not local) | Backups | ✗ locally / not yet on VPS | — | Installed via `bootstrap.sh` during provisioning |
| Hostinger VPS itself | Everything in this phase | ✗ — not yet purchased | — | **Blocking** — owner must purchase before any provisioning step |
| Backblaze B2 account + bucket | D-05 offsite backups | ✗ — not yet created | — | **Blocking for INFRA-02** — owner must sign up (payment step); Claude can create the bucket/application key via B2's API once credentials exist |
| Healthchecks.io account | D-03/D-04c/d (and recommended D-04b) | ✗ — not yet created | — | **Blocking for INFRA-03/04** — free tier, owner or Claude can sign up; Claude can create checks via the Healthchecks.io API once an account/API key exists |
| UptimeRobot (or Better Stack) account | D-01/D-02/D-04a | ✗ — not yet created | — | **Blocking for INFRA-03** — free tier signup |
| Hourly VPS provider (e.g. Hetzner Cloud) account | D-09 restore drill | ✗ — not yet created | — | **Blocking for INFRA-02's drill only** — needed once, owner or Claude sets up with a payment method for hourly billing |
| Hostinger DNS API token | D-20 | ✗ — session-scoped, owner-supplied | — | **Blocking** — owner generates and pastes for this session only, never committed |

**Missing dependencies with no fallback:** Hostinger VPS purchase, Backblaze B2 account, Healthchecks.io account, UptimeRobot/Better Stack account, Hostinger DNS API token — all require an owner action (purchase or credential) before Claude can proceed with the corresponding sub-task.

**Missing dependencies with fallback:** None — every missing item above is a hard gate for its corresponding requirement, though the gates are narrow (each blocks only its own sub-task, not the whole phase sequentially, if planned as parallel waves).

## Human vs Claude Action Breakdown

This phase touches an external host Claude cannot provision autonomously (payment, account creation). The plan should gate each human-only step as its own `checkpoint:human-verify` or `checkpoint:human-action` task, not bundle it into an automated task.

| Step | Who | Notes |
|------|-----|-------|
| Purchase Hostinger KVM 2 VPS (Frankfurt) | **Owner** | Payment step — Claude cannot do this |
| Add Claude's SSH public key to the VPS | **Owner** | One-time, via Hostinger panel |
| SSH-harden the VPS (deploy user, ufw, fail2ban, key-only login, unattended-upgrades) | **Claude** | Runs over SSH from the session, per D-14 |
| Deploy Chatwoot + EspoCRM + Caddy Compose stacks | **Claude** | Over SSH, using `infra/vps/` configs |
| Sign up for Backblaze B2, create bucket + application key | **Owner** (signup/payment) → **Claude** (bucket/key creation via API once account exists) | B2 has a free tier but still requires an account |
| Configure restic + backup script + cron/timer | **Claude** | Uses the B2 credentials the owner supplies |
| Sign up for Healthchecks.io | **Owner or Claude** | Free tier — either can create the account; owner should retain login access |
| Create Healthchecks.io checks + wire Telegram integration | **Claude** (API/config) + **Owner** (approving the Telegram bot in their own Telegram, per Healthchecks.io's `/start` flow) | The `/start` handshake must happen from the owner's Telegram account |
| Sign up for UptimeRobot, create monitors, wire Telegram | **Owner or Claude** (account) + **Owner** (Telegram bot handshake) | Same handshake constraint as above |
| Generate Hostinger DNS API token | **Owner** | Session-scoped, pasted for this session only, never committed |
| Create `chat`/`crm` A records via Hostinger DNS API | **Claude** | Using the owner-supplied token, per D-20 |
| Sign up for an hourly VPS provider (e.g. Hetzner Cloud) for the restore drill | **Owner** (payment method) | One-time setup; Claude can then provision/destroy drill hosts via API/CLI |
| Run the restore drill on the temporary host | **Claude** (execution) + **Owner or Claude** (verification checklist per D-09) | Drill checklist items (login, conversations, `display_id`, orphaned references) can be scripted; final sign-off is a `checkpoint:human-verify` |
| Real outage test (D-19a) — stop VPS, walk booking wizard to Stripe step, submit contact form | **Claude** (can trigger the outage over SSH and drive the wizard via automated browser tooling) + **Owner** (final confirmation the emails actually arrived in their inbox) | Recommend `checkpoint:human-verify` for the email-arrival confirmation specifically |
| Write and run the D-19(b) repo guard test | **Claude** | Pure code change, fully automatable |
| Write runbooks (`infra/vps/runbooks/*.md`) | **Claude** | Documentation, fully automatable |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 (existing, `vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` (existing — jsdom environment, `tests/setup.ts`, `@/` alias) |
| Quick run command | `npx vitest run tests/infra-vps-isolation-guard.test.ts` (file name is the planner's choice) |
| Full suite command | `npx vitest run` (per CLAUDE.md; `vitest related` is documented as crashing in this repo — grep `tests/` instead) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `chat.rideprestigo.com`/`crm.rideprestigo.com` resolve and serve valid HTTPS | smoke (curl/openssl) | `curl -Is https://chat.rideprestigo.com \| head -1` and `echo \| openssl s_client -connect chat.rideprestigo.com:443 -servername chat.rideprestigo.com 2>/dev/null \| openssl x509 -noout -dates` | ❌ Wave 0 — run manually/scripted post-deploy, not a vitest file |
| INFRA-02 | Nightly backup runs, restore drill succeeds on a clean host | manual / `checkpoint:human-verify` for the drill; automatable smoke for "backup script exits 0 and pings Healthchecks" | `ssh vps 'bash infra/vps/scripts/backup.sh; echo $?'` | ❌ Wave 0 — script doesn't exist yet |
| INFRA-03 | Alert fires on Telegram+email when Chatwoot/EspoCRM is down or backup missed | manual / `checkpoint:human-verify` (real Telegram message must be seen) — can be scaffolded by polling the monitoring SaaS's own status API after simulating an outage | UptimeRobot API `GET /v2/getMonitors` (or Better Stack's equivalent) polled after `docker compose stop` | ❌ Wave 0 — no monitors created yet |
| INFRA-04 | Unattended security updates apply; app upgrades follow the runbook | automatable dry-run + file-existence check | `ssh vps 'unattended-upgrade --dry-run --debug'`; `test -f infra/vps/runbooks/upgrade.md` | ❌ Wave 0 |
| INFRA-05(a) | Public site/wizard/Stripe/email work with VPS offline | manual / `checkpoint:human-verify` (real outage test, no real charge) | Stop VPS containers → drive booking wizard to payment step (test mode) → submit contact form → confirm emails arrive | ❌ Wave 0 — no automated script; human-verify recommended |
| INFRA-05(b) | No synchronous site code path calls `chat.`/`crm.` | unit (vitest, source-reading) | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ❌ Wave 0 — new file, see Pattern 4 |

### Sampling Rate
- **Per task commit:** Run the new guard test (`npx vitest run tests/infra-vps-isolation-guard.test.ts`) — fast, no network.
- **Per wave merge:** Full suite `npx vitest run`, plus a live `curl`/`openssl` smoke check against the actual VPS once DNS/TLS are live.
- **Phase gate:** Full suite green + the D-19(a) real outage test performed and confirmed + the D-09 restore drill performed and documented, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/infra-vps-isolation-guard.test.ts` — covers INFRA-05(b); decide glob-vs-hand-rolled-walk per Open Question 3 before writing
- [ ] `infra/vps/scripts/backup.sh` — covers INFRA-02
- [ ] `infra/vps/scripts/check-disk-mem.sh`, `check-sidekiq.sh`, `check-tls-expiry.sh` — covers INFRA-03/INFRA-04b
- [ ] `infra/vps/runbooks/upgrade.md`, `provisioning.md`, `restore-drill.md` — covers INFRA-04/INFRA-02 documentation requirement
- [ ] No existing test framework gap — Vitest is already configured and used for source-level backstop tests of this exact shape (`tests/rtl-backstop.test.ts`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | SSH key-only login (D-14), app-login 2FA wherever Chatwoot/EspoCRM support it (D-17) |
| V3 Session Management | no (this phase) | No site-side session logic changes; Chatwoot/EspoCRM's own session handling is out of scope until Phase 77/80 configure the apps |
| V4 Access Control | yes | `ufw` restricting inbound to 22/80/443 only; no IP allowlisting on `crm.` per D-17 (explicit trade-off, documented) |
| V5 Input Validation | no (this phase) | No new user-facing input surface — the only new "input" is the DNS API call and SSH commands Claude issues itself |
| V6 Cryptography | yes | restic client-side encryption (D-05/D-08) for backups; Caddy-managed TLS (Let's Encrypt) for transport; never hand-roll either |
| V1 Architecture/Design | yes | The isolation guarantee itself (D-19) is an architectural control, verified by the guard test + real outage test |
| V10 Malicious Code / Self-Contained | yes | Package Legitimacy Audit of the four Docker images (above) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSH brute-force against the newly-public VPS | Denial of Service / Elevation of Privilege | `fail2ban` + key-only auth + no root password login (D-14) |
| Leaked restic password/B2 keys exposing all backup data | Information Disclosure | Root-only `.env` file, `chmod 600` (D-08); password manager copy for the drill, never the VPS copy for that purpose |
| DNS zone edit silently dropping unrelated records | Tampering | GET-snapshot-before-PUT discipline (D-20), scoped to `chat`/`crm` only — direct precedent for this exact failure mode already occurred on this domain (Pitfall 6 above) |
| Unattended Docker Engine upgrade changing container runtime behavior under running apps | Tampering (unintended) | Explicit `Unattended-Upgrade::Package-Blacklist` for `docker-ce*`/`containerd.io`/`docker-compose-plugin` |
| Secrets committed to the new `infra/vps/` directory | Information Disclosure | Existing `.husky/pre-commit` secret scan already covers `.env*` and common secret patterns repo-wide — verify it fires on a test file under `infra/vps/` before relying on it |
| VPS becoming reachable with default/weak app credentials before hardening completes | Elevation of Privilege | Sequence: harden SSH/firewall FIRST, deploy apps SECOND, only open 80/443 once Caddy/TLS config is ready — never leave a default Chatwoot/EspoCRM install reachable on the public internet mid-setup |

## Sources

### Primary (HIGH confidence)
- Docker Hub Registry API — `library/caddy`, `chatwoot/chatwoot`, `espocrm/espocrm`, `restic/restic` repository metadata, queried directly this session (2026-09-27)
- `~/.claude/projects/-Users-romanustyugov-Desktop-Prestigo/memory/project_dns_setup.md` — read this session; documents the exact Hostinger DNS API pattern and the prior SSL-outage incident this phase's DNS discipline must avoid repeating
- `tests/rtl-backstop.test.ts`, `tests/middleware-matcher.test.ts` — read this session; establish the existing in-repo pattern for source-reading vitest guard tests, reused for D-19(b)
- `.planning/research/{STACK,PITFALLS,ARCHITECTURE,SUMMARY}.md` — milestone-level research, read this session, HIGH confidence on codebase-verified integration points

### Secondary (MEDIUM confidence)
- https://uptimerobot.com/pricing/ — free tier specs (fetched this session): 50 monitors, 5-min interval, Telegram included, SSL monitoring paid-only
- https://betterstack.com/uptime — free tier specs (fetched this session): 10 monitors, 3-min interval, SSL/domain-expiry included; Telegram not confirmed
- https://healthchecks.io/integrations/telegram/, https://healthchecks.io/docs/http_api/, https://healthchecks.io/docs/configuring_checks/ — ping API, grace period, Telegram bot setup
- https://www.hostinger.com/blog/frankfurt-data-center/, https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/ — Frankfurt data center + VPS/KVM availability
- restic official docs + 3+ cross-checked 2026 self-hoster guides — `forget --keep-daily/--keep-weekly/--keep-monthly --prune` syntax
- LinuxCapable/OneUptime 2026 Ubuntu 24.04 guides — `Unattended-Upgrade::Package-Blacklist` syntax

### Tertiary (LOW confidence)
- None used without corroboration this session.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — Docker image legitimacy VERIFIED this session; Chatwoot/EspoCRM exact patch tags CITED from same-day milestone research (re-verify at deploy time per A2)
- Architecture: HIGH — reuses the codebase-verified milestone ARCHITECTURE.md plus this session's direct reads of the two precedent test files
- Pitfalls: MEDIUM — milestone-level pitfalls are cross-checked across official docs/GitHub issues; the KVM-2-specific and DNS-incident pitfalls added here are grounded in this project's own documented history
- Monitoring SaaS choice (D-01 discretion): MEDIUM — both providers' pricing pages fetched directly this session; Better Stack's Telegram support remains an open question (A1)

**Research date:** 2026-09-27
**Valid until:** ~14 days for the monitoring-SaaS free-tier comparison and Docker image tags (fast-moving); ~30 days for the rest (Caddy/restic/fail2ban/unattended-upgrades patterns are stable)

---
*Phase: 76-vps-infrastructure*
*Research completed: 2026-09-27*
