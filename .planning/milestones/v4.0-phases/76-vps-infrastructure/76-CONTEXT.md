# Phase 76: VPS Infrastructure - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision a dedicated Hostinger VPS that runs Chatwoot CE and EspoCRM CE as separate Docker Compose stacks behind Caddy on `chat.rideprestigo.com` / `crm.rideprestigo.com`, with:
- auto-renewing TLS
- nightly encrypted offsite backups plus a documented restore drill onto a clean host
- external monitoring and alerting that does not depend on the VPS
- unattended OS security updates
- a pinned-version upgrade runbook

It must also prove that the public site, booking wizard, Stripe payment and emails keep working with the VPS fully offline.

The phase stops at the infrastructure: apps installed, reachable, backed up and monitored. Out of scope:
- Channel configuration (email inboxes, widget, Telegram, WhatsApp, IG/FB): Phases 77–79
- CRM entities and pipeline: Phase 80
- The outbox and any site→VPS code: Phase 81+

</domain>

<decisions>
## Implementation Decisions

### Monitoring & Alerting
- **D-01:** Uptime monitoring runs on an **external SaaS** (UptimeRobot or Better Stack free tier), not on the VPS. No Uptime Kuma on the VPS: the research STACK.md suggested it, but that is rejected because it dies with the VPS.
- **D-02:** Alerts go to **Telegram + email**. Telegram uses the monitoring SaaS's **built-in Telegram integration**. Do not reuse the content-approval bot in `lib/content/telegram.ts`, and do not write custom bot code.
- **D-03:** The backup dead-man's switch is **Healthchecks.io**. The backup script `curl`s the ping URL only after the whole backup succeeds (it can also report `/fail` on error). A missing ping for about 26h triggers an alert through the same Telegram + email channels.
- **D-04:** Monitoring depth has four parts:
  - (a) App-level health checks: the Chatwoot Rails endpoint (e.g. `/api`) and the EspoCRM login page. These prove the apps are alive, not just Caddy.
  - (b) TLS certificate expiry, alerting about 14 days before expiry.
  - (c) Disk (>85%) and memory pressure, via an on-VPS cron script that pings a Healthchecks check (fail on threshold breach).
  - (d) Sidekiq liveness, checked on the VPS and pinged to Healthchecks. A dead Sidekiq leaves the UI up while email and messages silently stop processing.

### Backups & Restore
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

### Server & Configuration
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

### VPS Mail & INFRA-05 Boundary
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 76: VPS Infrastructure" — goal + 5 success criteria. SC#1 says KVM 4 and is overridden by D-11; SC#5 is split per D-19.
- `.planning/REQUIREMENTS.md` §Infrastructure (INFRA-01..05)
- `.planning/PROJECT.md` §Constraints ("v4.0 VPS independence", "Secrets") and §Key Decisions (Chatwoot/EspoCRM choice, no n8n)

### Research
- `.planning/research/STACK.md` — VPS sizing, Caddy, restic+B2, unattended-upgrades Docker blacklist, bootstrap command sketch. Its Uptime Kuma recommendation is superseded by D-01.
- `.planning/research/PITFALLS.md` §Pitfall 13 (VPS SPOF/alerting), §Pitfall 14 (DB + attachment backup consistency, restore-drill checks), §Pitfall 15 (inbox delete cascade → backup-first rule for the runbook), §Pitfall 18 (VPS outbound mail → Resend)
- `.planning/research/ARCHITECTURE.md` — the site↔VPS isolation model the D-19 guard test protects
- `.planning/research/SUMMARY.md` — phase ordering rationale

### Project rules
- `CLAUDE.md` — no secrets/.env in commits (pre-commit enforced), never read `.env.local`
- `.husky/pre-commit` — secret scan that must keep blocking real `infra/vps/**/.env` files

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.husky/pre-commit` secret scan: already blocks staged `.env*` (except `.env.example|sample|template`) and secret-looking lines, so it covers `infra/vps/` automatically.
- Hostinger DNS API usage pattern (documented in project memory): GET zone → PUT `{overwrite, zone[]}` upsert per name+type. A CNAME can't coexist with another type on the same name.
- Resend is already the site's transactional sender (`lib/email.ts`, `lib/email-corporate.ts`, `lib/email-bespoke.ts`), and the domain's Resend DKIM/SPF alignment is already in place for D-18.

### Established Patterns
- DNS lives at Hostinger (`ns1/ns2.dns-parking.com`), site on Vercel (apex A `216.198.79.1`, `www` CNAME). Mail stays on Hostinger. Leftover apex records caused an SSL outage before, so touch only the `chat`/`crm` names.
- Site-side external calls go through thin `fetch` wrappers with no SDKs (e.g. `lib/qstash.ts`). No VPS client exists yet; the D-19 guard test should assert that none is called synchronously.
- `scripts/qa/baselines/csp_baseline.json`: the CSP baseline is untouched in this phase, since widget CSP is Phase 77.

### Integration Points
- New top-level `infra/vps/` directory, the first infra-as-code in the repo.
- New guard test under `tests/` for D-19. Per CLAUDE.md, run it with `npx vitest run <file>`.
- Hostinger DNS zone `rideprestigo.com`: add `chat` and `crm` A records.

</code_context>

<specifics>
## Specific Ideas

- Owner wants alerts on the phone (Telegram) with email as backup.
- Owner performs all purchases (VPS, B2, any paid tier). Claude does SSH provisioning and DNS via session-scoped credentials.
- Owner accepted the cheaper KVM 2 start with an explicit, documented upgrade trigger rather than paying for KVM 4 headroom up front.

</specifics>

<deferred>
## Deferred Ideas

- Chatwoot attachments on S3-compatible storage: rejected for now in favour of a local volume plus a consistent snapshot (D-06). Revisit if the disk fills or when resizing.
- Paid daily Hostinger snapshots: not now (D-10).
- IP allowlisting for `crm.`: rejected, because it's incompatible with Vercel→EspoCRM calls in Phase 81.
- The "events delivered after the VPS returns" half of INFRA-05 moves to Phases 81/82 verification (D-19).

</deferred>

---

*Phase: 76-vps-infrastructure*
*Context gathered: 2026-09-27*
