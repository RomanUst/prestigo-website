# infra/vps

Infrastructure-as-code for the Prestigo helpdesk/CRM VPS (Phase 76+, v4.0
Helpdesk + CRM milestone). This directory is the versioned source of truth
for how the Hostinger VPS running Chatwoot and EspoCRM is provisioned,
configured and re-provisioned.

## What lives here (D-15)

Every infra config is versioned in this repo under `infra/vps/`: Compose
files, the Caddyfile, backup/monitor scripts, systemd timers or cron
entries, and runbooks.

**Secrets never live here.** Real `.env` files exist only:
- on the VPS itself, under `/etc/prestigo` (root-owned, mode `0700`), and
- in the owner's password manager.

Only `.env.example` placeholder files are committed, under
`infra/vps/env/*.env.example`. The repo's existing `.husky/pre-commit`
secret scan blocks staged `.env*` files (other than `.example`/`.sample`/
`.template`) and lines matching common live-credential shapes, and already
covers this directory with zero modification needed.

## Host contract

This is the stable contract every later plan in Phase 76-85 builds on. Keep
these names exact.

- **SSH alias** (owner's Mac, `~/.ssh/config`): `Host prestigo-vps` ->
  `HostName` = the VPS IPv4 (see `76-01-SUMMARY.md` "VPS facts"), `User
  deploy`, `IdentityFile ~/.ssh/prestigo_vps_ed25519`, `IdentitiesOnly yes`.
- **Users:** `deploy` - passwordless sudo via
  `/etc/sudoers.d/90-prestigo-deploy` (validated with `visudo -cf` before
  install), member of the `docker` group. Root login is disabled over SSH.
- **Directories:**
  - `/etc/prestigo` - `root:root 0700` - real `*.env` secret files, never
    synced from git.
  - `/opt/prestigo` - `deploy:deploy 0755` - rsync target of `infra/vps/`.
  - `/var/backups/prestigo` - `root:root 0700`, with `dumps/` also
    `root:root 0700`.
  - `/var/log/prestigo` - `root:root 0750`.
- **Docker:** external network `edge` (Caddy <-> app containers);
  `/etc/docker/daemon.json` sets `log-driver: json-file`, `max-size: 10m`,
  `max-file: 3`.
- **Docker apt key fingerprint (official):**
  `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88` - pinned and checked
  in `bootstrap.sh` before installing Docker packages.

## Deploy procedure

1. From a clean commit (`git status --porcelain infra/vps` empty):
   ```bash
   rsync -a --delete infra/vps/ prestigo-vps:/opt/prestigo/
   ```
2. Record what was deployed:
   ```bash
   ssh prestigo-vps 'echo "$(git rev-parse HEAD)" | sudo tee /opt/prestigo/DEPLOYED_SHA'
   ```
   (run from the repo root so `git rev-parse HEAD` resolves to the commit
   that was just rsynced).

## Runbooks

| Runbook | Covers | Added by |
|---------|--------|----------|
| `runbooks/host-bootstrap.md` | Fresh-host provisioning and re-provisioning via `bootstrap.sh`, verification commands, lockout recovery | Plan 76-02 |
| `runbooks/dns.md` | Hostinger DNS API usage for the `chat`/`crm` A records (D-20) | Plan 76-03 |
| `runbooks/app-deploy.md` | Deploying/upgrading the Chatwoot + EspoCRM + Caddy Compose stacks | Plan 76-04 |
| `runbooks/backup-restore.md` | Nightly restic->B2 backup job, retention, manual restore | Plan 76-05 |
| `runbooks/upgrade.md` | Pinned-version upgrade procedure (backup -> snapshot -> pull/up -> migrate -> smoke check -> rollback) | Plan 76-06 |
| `runbooks/monitoring.md` | External uptime/health monitoring + Healthchecks.io dead-man's-switch setup | Plan 76-07 |
| `runbooks/outage-test.md` | The D-19(a) real outage test procedure (VPS offline, public site/wizard/Stripe/email still work) | Plan 76-08 |
| `runbooks/restore-drill.md` | The D-09 restore drill onto a temporary host, checklist and dated log | Plan 76-09 |

## Re-provisioning a fresh host

See `runbooks/host-bootstrap.md` for the exact commands. In short:
`bootstrap.sh` is idempotent - upload it and the deploy public key to a
fresh Ubuntu 24.04 host, run it as root, and it brings the host to the
hardened, Docker-ready state described above. Running it again (as `deploy`
via `sudo`) is always safe.
