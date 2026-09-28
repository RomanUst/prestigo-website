# Technology Stack

**Project:** Prestigo v4.0 — Helpdesk + CRM
**Researched:** 2026-09-27
**Confidence:** MEDIUM (web-search cross-checked across 2-3 independent sources per claim; no official Context7 docs for Chatwoot/EspoCRM/Caddy exist, and Hostinger pricing pages give slightly inconsistent numbers — treat exact GB/€ figures as directional, verify against the live Hostinger checkout page before purchasing)

This file covers only the NEW stack for v4.0 (Chatwoot + EspoCRM on a Hostinger VPS). It does **not** re-cover Next.js/Supabase/Stripe/Resend/QStash — those are already validated in the existing Prestigo stack per `PROJECT.md`.

## Recommended Stack

### VPS / Host

| Technology | Spec | Purpose | Why Recommended |
|------------|------|---------|-----------------|
| Hostinger VPS **KVM 4** | 4 vCPU / 16 GB RAM / 200 GB NVMe, ~$15/mo | Runs Chatwoot + EspoCRM + reverse proxy + backups + monitoring together | Chatwoot alone needs a 4 GB RAM floor (Rails + Sidekiq + Postgres + Redis; Sidekiq alone can spike to 1 GB+ under active load), and EspoCRM (PHP-FPM + MariaDB) needs another ~1-2 GB. Stacking both plus Caddy, cron dump jobs, and an Uptime Kuma monitor on Hostinger's next tier down (KVM 2: 8 GB/2 vCPU) leaves no headroom — 2 vCPU will contend when Postgres, MySQL, PHP-FPM and Sidekiq all wake up at once. KVM 4 gives 2-3 years of headroom for the "2-3 users later" growth path without a resize. |
| Ubuntu 24.04 LTS | — | Base OS | Hostinger's standard LTS image; longest support window from provisioning today; Docker Engine + Compose plugin both ship current packages for it. |
| Docker Engine + Docker Compose v2 (plugin, not standalone `docker-compose`) | latest stable | Container runtime | Both Chatwoot's and EspoCRM's official deployment paths are Docker Compose-first; keeps the two apps isolated from each other and from the host, and matches how the project already thinks about infra (Vercel serverless + managed Supabase — no bare-metal app processes anywhere else in this stack). |

**Sizing caveat:** if the budget is tight at launch, KVM 2 (8 GB/2 vCPU/100 GB, ~$7/mo) is a workable floor for 1 operator with light conversation volume — but plan to resize to KVM 4 before the "2-3 users later" phase, and watch `free -h` / Sidekiq memory under real WhatsApp+email traffic in the first weeks.

### Helpdesk — Chatwoot

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Chatwoot | **v4.18.x** (latest stable tag on `chatwoot/chatwoot`, verify exact patch at deploy time) | Omnichannel inbox | Locked decision per `PROJECT.md`; only OSS tool unifying WhatsApp Cloud API, IMAP/SMTP email, website widget, and Telegram/IG/FB in one inbox with reports, assignment, Dashboard Apps and a webhook/API surface. |
| Chatwoot **Community Edition** (MIT) | same as above | License tier | CE covers everything v4.0 needs: WhatsApp Cloud API channel, email channel, website widget, Telegram/IG/FB channels, canned responses, labels, custom attributes, automation rules, reports, CSAT, Dashboard Apps, and outgoing/incoming webhooks. Enterprise Edition (proprietary, paid) only adds SLA management, custom dashboards, agent capacity management, whitelabeling, SSO and IP allowlisting/audit logs — none of which v4.0 requires for 1-3 operators. Do not pay for EE. |
| PostgreSQL (via `pgvector/pgvector:pg16` image, as used in Chatwoot's official `docker-compose.production.yaml`) | 16.x | Chatwoot's database | Pinned by Chatwoot's own production compose file; pgvector variant is required because Chatwoot's AI/Captain features use vector search even if unused. |
| Redis | 7.x | Sidekiq queue + cache | Chatwoot docs recommend Redis 7.0+; minimal footprint (starts ~100 MB). |
| Sidekiq (bundled, runs as its own container from the same Chatwoot image) | matches Chatwoot version | Background job processor | Required second process alongside the Rails web process — deploy as two containers (`rails`, `sidekiq`) both pointed at the same Postgres/Redis, per Chatwoot's official compose layout. |

### CRM — EspoCRM

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| EspoCRM | **v10.0.3** (latest stable, verify exact patch at deploy time) | CRM / B2B pipeline | Locked decision; mature, light (PHP+MySQL), stable REST API + webhooks, custom entities without code, strong free roles/ACL. |
| EspoCRM Community edition (free core) | same as above | License tier | Core includes Contact/Account/Lead/Opportunity/Case entities, custom entity builder, basic list-view reports, roles/ACL, Group Email Accounts (shared SMTP/IMAP mailboxes), and the REST API with API-key auth + webhooks — sufficient because pipeline automation logic lives in the Next.js repo, not in EspoCRM's own workflow engine. |
| PHP | **8.3+** (8.3–8.5 supported; v10 raised the floor from 8.2 in v9) | Runtime | Official EspoCRM v10 requirement — verify the Docker image tag pins ≥8.3, since older third-party compose examples circulating online still show PHP 7.4/8.1 and will fail on v10. |
| MariaDB | 10.3+ (or MySQL 8.0+) | EspoCRM's database | Official supported range; MariaDB is the more common default in EspoCRM's own Docker examples. |
| Official Docker images: `espocrm/espocrm` (Apache+PHP web app), `espocrm/espocrm` daemon variant (cron), optional websocket container | pin to EspoCRM's version tag | App containers | Use `espocrm/espocrm-docker` as the reference compose layout rather than a hand-rolled LEMP stack — it already wires the daemon (cron-equivalent, required for inbound-email polling) and volumes correctly. |

**Advanced Pack ($395 one-time paid extension) is NOT needed.** It adds pivot/grid Reports, a Workflow rule engine, and BPM flowcharts — all of which v4.0 deliberately does *not* use, since sync/automation logic is being built in the Next.js repo (Supabase outbox + QStash) per the locked "no n8n, no in-CRM automations" decision.

### Reverse Proxy / TLS

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Caddy** | 2.x (latest) | Reverse proxy + automatic TLS for `chat.rideprestigo.com` and `crm.rideprestigo.com` | This VPS hosts exactly two long-lived services on two static subdomains — Caddy needs ~2 lines of Caddyfile per site, issues and renews Let's Encrypt certs with zero extra tooling, and idles at ~20 MB RAM. Traefik's strength (dynamic Docker-label discovery, dashboard, built for 10+ churning services) is wasted here and costs ~10x the idle RAM (~200 MB) for no benefit on a 2-site box. Plain nginx works too but requires wiring certbot + a renewal cron/systemd-timer by hand — extra ops surface for zero gain over Caddy on this scale. |

**Caddyfile shape (illustrative, not final config):**
```
chat.rideprestigo.com {
    reverse_proxy chatwoot-rails:3000
}
crm.rideprestigo.com {
    reverse_proxy espocrm:8080
}
```

### Backups

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| `pg_dump` (Chatwoot) + `mysqldump`/`mariadb-dump` (EspoCRM) via nightly cron on the host or a sidecar container | Application-consistent DB dumps | Never back up a running DB by copying its data directory — dumps are the only crash-consistent option for both engines. |
| **restic** → Backblaze B2 | Encrypted, offsite, versioned backup of the dumps (+ any uploaded file attachments/avatars) | restic encrypts client-side before it leaves the VPS, has native B2 support, and B2 is ~$6/TB/mo — the standard cheap "3-2-1" offsite tier for self-hosters. Keeps the CRM/helpdesk data recoverable even if the VPS provider account or disk is lost. |
| Hostinger's built-in weekly VPS snapshot | Coarse whole-disk safety net | Free with the VPS plan; complements (does not replace) the app-level dumps above — a snapshot alone can catch a mid-write DB state, so keep the `pg_dump`/`mysqldump` + restic path as the primary recovery mechanism. |
| Dead-man's-switch ping to Uptime Kuma at the end of the backup script | Detect silent backup failures | A failed/skipped nightly dump should page the operator instead of rotting silently for weeks — wire `curl` to a Uptime Kuma push-monitor URL as the last line of the backup script. |

### Monitoring / Uptime

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| **Uptime Kuma** (self-hosted, one more small container on the same VPS) | Uptime checks for `chat.*`/`crm.*`, TCP/HTTP health, and the backup dead-man's-switch | Lightweight (~50-200 MB RAM), free, and doubles as the backup-failure alert channel above — no separate paid SaaS needed at this scale (1 operator). Notify via the same email/Telegram channel the operator already checks. |

### OS Updates

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| `unattended-upgrades` (Ubuntu package), security-repo only, reboots off by default | Automatic OS/kernel CVE patching | Configure within the first hour of provisioning. Explicitly **blacklist** `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` from auto-upgrade — an unattended Docker engine bump can change container runtime behavior underneath running Chatwoot/EspoCRM containers without warning. |
| Manual, scheduled `docker compose pull && up -d` for the Chatwoot/EspoCRM **application** images | Controlled app-version upgrades | App image bumps can carry DB migrations — never auto-pull these; review Chatwoot/EspoCRM release notes and run migrations deliberately (monthly cadence is reasonable for a 1-3 operator internal tool). |

### SMTP — Outgoing Mail for Chatwoot / EspoCRM

| Mailbox | Recommendation | Why |
|---------|-----------------|-----|
| Chatwoot email channel for **info@ / booking@** | **Hostinger-hosted mailbox SMTP+IMAP** (existing mail, already on Hostinger per DNS setup) | Chatwoot's email channel is bidirectional — it polls IMAP for incoming mail *and* sends replies via SMTP from the same account. Resend is send-only (no IMAP), so it cannot back a real reply-capable mailbox. Use the existing Hostinger mailbox credentials directly; no new provider needed. |
| EspoCRM Group Email Account for **sales@ / roman@** | **Hostinger-hosted mailbox SMTP+IMAP** | Same reasoning — EspoCRM's Group Email Account also needs paired IMAP (inbound) + SMTP (outbound) on one real mailbox. Per the locked decision, this mailbox is never also wired into Chatwoot. |
| Chatwoot/EspoCRM **system notification** mail (e.g. "new conversation assigned", password resets) — not customer-facing reply mail | Optional: **Resend SMTP relay** (send-only) | Resend now offers a drop-in SMTP relay (available on all plans, no code changes) suitable for fire-and-forget system mail that never needs a reply. This is optional — routing system notifications through the same Hostinger SMTP the channels already use is simpler (one fewer credential) and perfectly adequate at this scale. Do **not** use Resend for the info@/booking@/sales@ channel mailboxes themselves — those need inbound IMAP, which Resend doesn't provide. |
| Existing Resend usage (`RESEND_API_KEY`, booking confirmations etc.) | **Unchanged** | Resend's existing role sending Next.js transactional email is unrelated to and unaffected by the Chatwoot/EspoCRM mail setup — keep it exactly as is. |

### Next.js-Side Integration — No New API-Client Packages

| Package | Verdict | Why |
|---------|---------|-----|
| `@chatwoot/node`, `@jrvidotti/chatwoot-sdk`, `@sandstreamdev/chatwoot` | **Do not add.** | All are unofficial, third-party, low-adoption wrappers around a REST API that's simple enough to call directly. Chatwoot has no maintained official Node SDK. Adding one of these introduces an unmaintained dependency for a handful of endpoints (create contact, create conversation, send message, fetch conversation) that are trivial with `fetch`. |
| `@chatwoot/utils` | **Do not add — wrong package.** | This is the *frontend widget* utility library (used inside Chatwoot's own client app), not an API client. Irrelevant to server-side integration. |
| EspoCRM — no official or notable third-party Node client exists | **N/A — use `fetch`.** | Same reasoning; EspoCRM's REST API auth is a simple `X-Api-Key` header (or HMAC signing for two-legged auth), trivial to wrap by hand. |
| **Recommended pattern** | New `lib/chatwoot.ts` and `lib/espocrm.ts`, each a thin typed `fetch` wrapper (mirrors how `lib/qstash.ts` and the existing Stripe/Resend calls are already structured — official SDK only where the vendor ships one, plain `fetch` otherwise). | Keeps the dependency surface flat, matches existing repo conventions, and avoids trusting unmaintained community packages for a system that touches customer data. |
| Outbox delivery / retries | Reuse the existing **QStash** (`lib/qstash.ts`) — no new queue library. | Locked decision: Supabase outbox table + QStash for idempotent, retried site→Chatwoot/CRM sync; nothing new needed on the queueing side. |
| Chatwoot → Next.js webhook receiver | New API route (e.g. `app/api/webhooks/chatwoot/route.ts`), verifying `X-Chatwoot-Signature` (HMAC-SHA256 of `{timestamp}.{raw_body}`, prefixed `sha256=`) and `X-Chatwoot-Timestamp`, constant-time compared — same pattern as the existing Stripe webhook signature check. | Chatwoot signs every outgoing webhook by default; verify it rather than trusting an unauthenticated POST body, consistent with how Stripe webhooks are already handled in this repo. **Known gotcha (GitHub issue #13809, open as of this research):** some Chatwoot versions return a `secret` field from the webhook API that does not match the internal `hmac_token` actually used to sign requests — confirm signature verification against a real test webhook delivery before trusting it in production; if it doesn't match, fall back to an app-level shared-secret query param/header as a stopgap. |
| EspoCRM → Next.js webhook receiver | Same pattern: verify EspoCRM's webhook secret/signature before processing. | Same defense-in-depth reasoning as above. |

## Installation

```bash
# On the Hostinger VPS (Ubuntu 24.04), after provisioning:

# 1. Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# 2. unattended-upgrades, excluding Docker packages from auto-update
apt-get install -y unattended-upgrades
# then edit /etc/apt/apt.conf.d/50unattended-upgrades to blacklist docker-ce, docker-ce-cli, containerd.io, docker-compose-plugin

# 3. Chatwoot — clone official repo, use docker-compose.production.yaml
git clone https://github.com/chatwoot/chatwoot.git && cd chatwoot
cp .env.example .env   # fill SECRET_KEY_BASE, FRONTEND_URL=https://chat.rideprestigo.com, SMTP_* (Hostinger mailbox), etc.
docker compose -f docker-compose.production.yaml run --rm rails bundle exec rails db:chatwoot_prepare
docker compose -f docker-compose.production.yaml up -d

# 4. EspoCRM — official Docker image
mkdir espocrm && cd espocrm
# use espocrm/espocrm-docker's docker-compose.yml as the base (db + espocrm app + daemon)
docker compose up -d

# 5. Caddy (reverse proxy, separate compose stack or same host network)
# Caddyfile with the two site blocks shown above
docker compose -f caddy/docker-compose.yml up -d

# 6. Uptime Kuma
docker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:1

# On the Next.js side (no new runtime deps needed):
# lib/chatwoot.ts and lib/espocrm.ts are hand-written fetch wrappers — nothing to npm install.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Caddy | Traefik | If the VPS grows to 10+ containers/services with frequent add/remove churn and you want Docker-label auto-discovery + a dashboard — not the case for a static 2-subdomain box. |
| Caddy | nginx + certbot | If the team already has deep nginx operational muscle memory and wants full manual control over every directive — otherwise it's strictly more ops burden here for no functional gain. |
| Chatwoot CE | Chatwoot Enterprise Edition | Only if SSO, SLA policies, whitelabeling, or agent-capacity management become hard requirements — none are in v4.0 scope for 1-3 operators. |
| EspoCRM Community | EspoCRM + Advanced Pack | Only if EspoCRM's own Workflow/BPM engine or pivot-table Reports become the automation layer instead of the Next.js repo — contradicts the locked "integration logic in repo, not the CRM" decision. |
| Hostinger SMTP for channel mailboxes | Resend SMTP relay for channel mailboxes | Never for info@/booking@/sales@ — those mailboxes need inbound IMAP, which Resend doesn't provide. Fine for send-only system notification mail if you want to offload volume from the Hostinger mail quota. |
| restic + Backblaze B2 | BorgBackup, or Hostinger's own snapshot only | Borg is a comparable client-side-encrypted alternative if you prefer its dedup model; relying on VPS snapshots alone is not recommended since they aren't guaranteed dump-consistent for a live DB. |
| KVM 4 (16 GB/4 vCPU) | KVM 2 (8 GB/2 vCPU) | Acceptable cost-conscious floor for 1 operator at launch with light traffic — monitor memory headroom and be ready to resize before adding operators 2-3. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| n8n for site↔Chatwoot↔CRM sync | Explicitly ruled out in the locked decision — integration logic belongs in the tested/versioned Next.js repo, not a separately-hosted workflow tool that adds another moving piece to the VPS. | Supabase outbox table + QStash, driven from the Next.js repo. |
| One mailbox connected to both Chatwoot and EspoCRM | Causes duplicate incoming messages, double replies, and broken response-time stats in both systems. | Strict separation: info@/booking@ → Chatwoot only; sales@/roman@ → EspoCRM only. |
| Unofficial Chatwoot/EspoCRM Node SDK packages | Low-adoption, unmaintained third-party wrappers around a REST surface simple enough to hand-write. | Typed `fetch` wrappers in `lib/chatwoot.ts` / `lib/espocrm.ts`. |
| Auto-updating Docker Engine via `unattended-upgrades` | Can silently change container runtime behavior under running production containers. | Blacklist Docker packages from unattended-upgrades; update Docker deliberately on a schedule. |
| Blind `docker compose pull && up -d` on a cron for the **app** images (Chatwoot/EspoCRM) | App upgrades can carry DB migrations that need review/backup-first, not silent auto-apply. | Manual, scheduled upgrades with a pre-upgrade backup. |
| Chatwoot Enterprise Edition / EspoCRM Advanced Pack at launch | Paid tiers whose features (SLA, whitelabel, SSO, BPM/Workflow engine, pivot Reports) aren't in v4.0 scope. | Community/free editions of both; revisit only if a specific gated feature becomes a real requirement. |

## Stack Patterns by Variant

**If conversation volume grows well beyond "1-3 operators" (e.g. a real support team):**
- Move Sidekiq to a dedicated container with its own memory limit (already the default in Chatwoot's production compose) and consider splitting Postgres/Redis onto managed services instead of same-VPS containers.
- Revisit Chatwoot Enterprise Edition for SLA management and agent capacity controls at that point — not before.

**If the VPS ever needs to host more than these two apps:**
- Reconsider Traefik over Caddy once you're past ~5-10 services with irregular add/remove — its Docker-label auto-discovery starts paying for its higher idle RAM cost.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| Chatwoot v4.18.x | PostgreSQL 16.x (`pgvector/pgvector:pg16`), Redis 7.x | Versions pinned by Chatwoot's own `docker-compose.production.yaml` — don't substitute a plain `postgres:16` image if Chatwoot's Captain/AI features are ever enabled (needs the pgvector extension). |
| EspoCRM v10.0.3 | PHP 8.3–8.5, MariaDB 10.3+/MySQL 8.0+/PostgreSQL 15+ | PHP floor was raised from 8.2 (v9) to 8.3 (v10) — many community Docker examples still circulating online show older PHP pins (7.4/8.1) and will fail against v10; use the official `espocrm/espocrm-docker` image tags, not a stale third-party example. |
| Caddy 2.x | Any Docker Compose v2 setup | No special version coupling; just needs outbound port 80/443 reachable for ACME HTTP-01/TLS-ALPN challenges against `chat.rideprestigo.com` / `crm.rideprestigo.com`. |

## Sources

- https://developers.chatwoot.com/self-hosted/deployment/requirements — Chatwoot RAM/CPU/Postgres/Redis/Sidekiq requirements (MEDIUM confidence, cross-checked against RamNode/OSSAlt deployment guides)
- https://github.com/chatwoot/chatwoot/releases — Chatwoot latest stable tag (v4.18.0 at research time)
- https://github.com/chatwoot/chatwoot/blob/develop/docker-compose.production.yaml — official production compose layout (rails/sidekiq/postgres/redis)
- https://developers.chatwoot.com/self-hosted/enterprise-edition and https://www.chatwoot.com/pricing/self-hosted-plans — CE vs EE feature split
- https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook and https://deepwiki.com/chatwoot/chatwoot/11.4-hmac-verification-and-identity-validation — webhook HMAC signing scheme
- https://github.com/chatwoot/chatwoot/issues/13809 — known webhook secret/hmac_token mismatch gotcha
- https://www.espocrm.com/blog/espocrm-v10-0-released/ and https://www.espocrm.com/download/ — EspoCRM v10.0.3, PHP 8.3+ requirement
- https://docs.espocrm.com/administration/docker/installation/ and https://github.com/espocrm/espocrm-docker — official Docker deployment
- https://docs.espocrm.com/user-guide/imap-smtp-configuration/ and https://docs.espocrm.com/administration/emails/ — Group Email Account SMTP/IMAP setup
- https://www.espocrm.com/extensions/advanced-pack/ — Advanced Pack scope/pricing
- https://www.hostinger.com/vps-hosting and https://www.vpsbenchmarks.com/hosters/hostinger — Hostinger KVM plan specs (figures vary slightly by source; verify at checkout)
- Multiple 2026 comparison posts (hostim.dev, virtua.cloud, peon.sh, ossalt.com) — Caddy vs Traefik vs nginx tradeoffs, cross-checked for consistency
- https://dev.to/byte-guard/the-3-2-1-backup-setup-for-self-hosters-restic-backblaze-b2-2mpb — restic + Backblaze B2 backup pattern
- https://www.freetechlearner.com/blog/self-hosting/uptime-kuma-self-hosted-monitoring-guide — Uptime Kuma footprint/setup
- https://oneuptime.com/blog/post/2026-03-02-configure-unattended-upgrades-security-patches-ubuntu/view and https://www.hostmycode.com/blog/linux-vps-automated-patch-management-2026-unattended-upgrades-safe-reboots-reporting-rollback — unattended-upgrades + Docker package blacklist pattern
- https://resend.com/features/smtp-service — Resend SMTP relay (send-only) availability
- https://www.npmjs.com/package/@chatwoot/utils, https://www.npmjs.com/package/@jrvidotti/chatwoot-sdk — confirms no official/well-adopted Chatwoot Node client exists

---
*Stack research for: Prestigo v4.0 Helpdesk + CRM (Chatwoot + EspoCRM on Hostinger VPS)*
*Researched: 2026-09-27*
